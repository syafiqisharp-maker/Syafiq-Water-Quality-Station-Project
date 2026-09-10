/**
 * ============================================================================
 * Feed Barrel LoRa Receiver & Display Station
 * Board: DFRobot LoRaWAN ESP32-S3 (DFR1195) + Semtech SX1262
 * Display: Onboard 0.96" TFT LCD (160x80 ST7789 via SPI)
 * ============================================================================
 * 
 * Modular Clean Architecture:
 *  - TimeManager:      NTP synchronization & internal RTC capture timestamps
 *  - StorageManager:   Thread-safe LittleFS spooling with zero-data-loss pruning
 *  - CloudSyncManager: Wi-Fi connection, 20s HTTPS timeout, 302 redirect tracking
 *  - DisplayManager:   0.96" ST7789 TFT LCD live telemetry rendering
 *  - LoRaManager:      SX1262 radio, fast addressed ACKs (<40ms), de-dup cache
 */

#include "Config.h"
#include "TimeManager.h"
#include "StorageManager.h"
#include "CloudSyncManager.h"
#include "DisplayManager.h"
#include "LoRaManager.h"

// System Managers
TimeManager      timeMgr;
StorageManager   storageMgr;
CloudSyncManager cloudMgr;
DisplayManager   displayMgr;
LoRaManager      loraMgr;

// FreeRTOS Upload Queue
struct UploadRecord {
  char timestamp[24]; // "YYYY-MM-DD HH:MM:SS"
  char pondId[16];
  char distCM[12];
  char batV[8];
  char pktNum[8];
};

static QueueHandle_t uploadQueue = NULL;

// Telemetry state
static String lastPondID         = "---";
static String lastDistCM         = "---";
static String lastBatV           = "---";
static String lastPktNum         = "0";
static int16_t lastRSSI          = 0;
static uint32_t totalPacketsRecv = 0;
static unsigned long lastPacketMillis = 0;
static bool hasReceivedData      = false;
static unsigned long lastStatusLog = 0;

// Extract a substring value by key from "key:value,key:value"
String extractValue(const String &data, const String &key) {
  int keyIndex = data.indexOf(key);
  if (keyIndex == -1) return "---";
  int start = keyIndex + key.length();
  int end = data.indexOf(',', start);
  if (end == -1) end = data.length();
  String val = data.substring(start, end);
  val.trim();
  return val;
}

// ==========================================
// CORE 0: BACKGROUND CLOUD WORKER
// ==========================================
void cloudUploadTask(void *pvParameters) {
  Serial.println(F("[CLOUD TASK] Background worker active on Core 0"));
  UploadRecord rec;
  unsigned long lastLivePostTime = 0;

  for (;;) {
    // 1. Maintain NTP time sync periodically
    if (cloudMgr.isConnected()) {
      timeMgr.update();
    }

    // 2. Process incoming record from Core 1 uploadQueue (wait up to 2 seconds)
    if (uploadQueue != NULL && xQueueReceive(uploadQueue, &rec, pdMS_TO_TICKS(2000)) == pdTRUE) {
      uint32_t remaining = uxQueueMessagesWaiting(uploadQueue);
      Serial.printf("[CLOUD] Dequeued Pond %s #%s (TS: %s, Queue remaining: %lu)\n",
                    rec.pondId, rec.pktNum, rec.timestamp, (unsigned long)remaining);

      // STRICT FIFO RULE: If offline backlog exists, append to spool to preserve chronological order
      if (storageMgr.hasSpool()) {
        Serial.printf("[CLOUD] Backlog active. Enqueuing Pond %s #%s to Flash spool.\n",
                      rec.pondId, rec.pktNum);
        storageMgr.appendSpool(String(rec.timestamp), String(rec.pondId),
                              String(rec.distCM), String(rec.batV), String(rec.pktNum));
      } else {
        bool uploaded = false;
        if (cloudMgr.canAttemptUpload()) {
          uploaded = cloudMgr.postTelemetry(String(rec.timestamp), String(rec.pondId),
                                            String(rec.distCM), String(rec.batV));
          lastLivePostTime = millis();
        }

        if (!uploaded) {
          Serial.printf("[CLOUD] %s. Buffering to Flash spool.\n",
                        cloudMgr.isConnected() ? "Upload failed" : "Wi-Fi offline");
          storageMgr.appendSpool(String(rec.timestamp), String(rec.pondId),
                                String(rec.distCM), String(rec.batV), String(rec.pktNum));
          if (cloudMgr.isConnected()) {
            cloudMgr.triggerBackoff();
          }
        }
      }
    }

    // 3. Drain backlog from Flash spool when queue is idle
    if (cloudMgr.isConnected() && storageMgr.hasSpool() && cloudMgr.canAttemptUpload()) {
      if (millis() - lastLivePostTime >= POST_COLLISION_GUARD_MS) {
        SpoolRecord sRec;
        if (storageMgr.peekNextRecord(sRec)) {
          Serial.printf("[SPOOL SYNC] Draining Pond %s #%s (TS: %s)\n",
                        sRec.pondId.c_str(), sRec.pktNum.c_str(), sRec.timestamp.c_str());
          bool ok = cloudMgr.postTelemetry(sRec.timestamp, sRec.pondId, sRec.distCM, sRec.batV);
          if (ok) {
            storageMgr.popNextRecord();
            Serial.println(F("[SPOOL SYNC] Record synced successfully!"));
            vTaskDelay(pdMS_TO_TICKS(QUEUE_FLUSH_INTERVAL_MS));
          } else {
            cloudMgr.triggerBackoff();
          }
        }
      }
    }

    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

// ==========================================
// SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println(F("=============================================="));
  Serial.println(F("  FEED BARREL LORA RECEIVER (DFR1195)"));
  Serial.println(F("  Modular Resilient Multi-Node Station"));
  Serial.printf("  Listening on Freq: %lu Hz (SF%d)\n", RF_FREQUENCY, LORA_SPREADING_FACTOR);
  Serial.printf("  Initial Free Heap: %lu bytes\n", (unsigned long)ESP.getFreeHeap());
  Serial.println(F("=============================================="));

  // 1. Initialize Display
  displayMgr.begin();
  displayMgr.showWaiting(false, false);

  // 2. Initialize LittleFS Storage
  storageMgr.begin();

  // 3. Initialize Wi-Fi
  cloudMgr.begin();

  // 4. Initialize NTP time synchronization
  timeMgr.begin();

  // 5. Create FreeRTOS Queue for Core 1 -> Core 0 communication
  uploadQueue = xQueueCreate(MAX_QUEUE_RECORDS, sizeof(UploadRecord));
  if (uploadQueue == NULL) {
    Serial.println(F("[ERROR] Failed to allocate FreeRTOS uploadQueue!"));
  } else {
    Serial.println(F("[INIT] FreeRTOS uploadQueue allocated (capacity: 32 records)."));
  }

  // 6. Spawn Core 0 Background Worker
  xTaskCreatePinnedToCore(
      cloudUploadTask,
      "CloudUploadTask",
      8192,
      NULL,
      1,
      NULL,
      0
  );

  // 7. Initialize LoRa Radio on Core 1
  loraMgr.begin();
}

// ==========================================
// MAIN LOOP (Runs exclusively on Core 1)
// ==========================================
void loop() {
  // 1. Check for incoming LoRa packet
  String incoming;
  int16_t rssi;
  int8_t snr;
  if (loraMgr.hasNewPacket(incoming, rssi, snr)) {
    totalPacketsRecv++;
    lastPacketMillis = millis();
    hasReceivedData = true;
    lastRSSI = rssi;
    loraMgr.recordPacketReceived();

    lastPondID = extractValue(incoming, "ID:");
    lastDistCM = extractValue(incoming, "Dist_cm:");
    lastBatV   = extractValue(incoming, "Bat_V:");
    lastPktNum = extractValue(incoming, "Pkt:");

    String captureTs = timeMgr.getFormattedTimestamp();

    Serial.println(F("--------------------------------------------------"));
    Serial.printf("[LORA RX #%lu] Pond: %s | Dist: %s cm | Bat: %s V | Pkt: #%s | RSSI: %d dBm | TS: %s\n",
                  totalPacketsRecv, lastPondID.c_str(), lastDistCM.c_str(),
                  lastBatV.c_str(), lastPktNum.c_str(), rssi, captureTs.c_str());

    // Send instant targeted ACK (< 40ms)
    loraMgr.sendAddressedAck(lastPondID, lastPktNum);

    // De-duplication check
    bool isDup = loraMgr.isDuplicate(lastPondID.c_str(), (uint32_t)lastPktNum.toInt());

    // Update screen
    displayMgr.showTelemetry(lastPondID, lastDistCM, lastBatV, lastPktNum,
                             rssi, cloudMgr.isConnected(), storageMgr.hasSpool());

    if (isDup) {
      Serial.printf("  -> [DE-DUP] Duplicate Pkt #%s from Pond %s. Re-ACKed; skipped cloud upload.\n",
                    lastPktNum.c_str(), lastPondID.c_str());
    } else {
      if (uploadQueue != NULL) {
        UploadRecord rec;
        strncpy(rec.timestamp, captureTs.c_str(), sizeof(rec.timestamp) - 1);
        rec.timestamp[sizeof(rec.timestamp) - 1] = '\0';
        strncpy(rec.pondId, lastPondID.c_str(), sizeof(rec.pondId) - 1);
        rec.pondId[sizeof(rec.pondId) - 1] = '\0';
        strncpy(rec.distCM, lastDistCM.c_str(), sizeof(rec.distCM) - 1);
        rec.distCM[sizeof(rec.distCM) - 1] = '\0';
        strncpy(rec.batV, lastBatV.c_str(), sizeof(rec.batV) - 1);
        rec.batV[sizeof(rec.batV) - 1] = '\0';
        strncpy(rec.pktNum, lastPktNum.c_str(), sizeof(rec.pktNum) - 1);
        rec.pktNum[sizeof(rec.pktNum) - 1] = '\0';

        if (xQueueSend(uploadQueue, &rec, 0) == pdTRUE) {
          uint32_t pending = uxQueueMessagesWaiting(uploadQueue);
          Serial.printf("  -> [QUEUE] Pushed to Core 0 uploadQueue (Pending: %lu/32)\n",
                        (unsigned long)pending);
        } else {
          Serial.println(F("  -> [QUEUE FULL] Buffering directly to LittleFS Flash spool."));
          storageMgr.appendSpool(captureTs, lastPondID, lastDistCM, lastBatV, lastPktNum);
        }
      }
    }
    Serial.println(F("--------------------------------------------------"));
  }

  // 2. Radio 10-minute silence watchdog
  loraMgr.checkSilenceWatchdog(hasReceivedData);

  // 3. Non-blocking Wi-Fi monitor
  cloudMgr.updateWiFi();

  // 4. Periodic serial heartbeat (every 15s)
  if (millis() - lastStatusLog >= STATUS_LOG_INTERVAL_MS) {
    lastStatusLog = millis();
    uint32_t pendingQueue = (uploadQueue != NULL) ? uxQueueMessagesWaiting(uploadQueue) : 0;
    bool hasSpool = storageMgr.hasSpool();

    if (hasReceivedData) {
      unsigned long elapsedSec = (millis() - lastPacketMillis) / 1000;
      Serial.printf("[STATUS] Last Pkt from Pond %s (%lu sec ago) | Total: %lu | Queue: %lu/32 | Spool: %s | WiFi: %s (%d dBm) | NTP: %s | Heap: %lu B\n",
                    lastPondID.c_str(), elapsedSec, totalPacketsRecv,
                    (unsigned long)pendingQueue,
                    hasSpool ? "PENDING" : "EMPTY",
                    cloudMgr.isConnected() ? "OK" : "Offline",
                    cloudMgr.getRSSI(),
                    timeMgr.isSynced() ? "SYNCED" : "UNSYNCED",
                    (unsigned long)ESP.getFreeHeap());
    } else {
      Serial.printf("[STATUS] Listening for barrel nodes... | Queue: %lu/32 | Spool: %s | WiFi: %s (%d dBm) | NTP: %s | Heap: %lu B\n",
                    (unsigned long)pendingQueue,
                    hasSpool ? "PENDING" : "EMPTY",
                    cloudMgr.isConnected() ? "OK" : "Offline",
                    cloudMgr.getRSSI(),
                    timeMgr.isSynced() ? "SYNCED" : "UNSYNCED",
                    (unsigned long)ESP.getFreeHeap());
    }
  }

  delay(5);
}
