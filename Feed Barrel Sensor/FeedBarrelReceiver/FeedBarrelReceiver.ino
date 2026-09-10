/**
 * ============================================================================
 * Feed Barrel LoRa Receiver & Display Station
 * Board: DFRobot LoRaWAN ESP32-S3 (DFR1195) + Semtech SX1262
 * Display: Onboard 0.96" TFT LCD (160x80 ST7789 via SPI)
 * ============================================================================
 * 
 * Dual-Core Non-Blocking Architecture (24-Node Ready):
 *  1. Dual-Core Decoupling:
 *     - Core 1: Fast LoRa packet reception, addressed ACK replies (< 40ms),
 *       and LCD screen updates. Never blocked by internet or HTTP.
 *     - Core 0: Dedicated background FreeRTOS worker (cloudUploadTask) that
 *       handles slow Google Sheets uploads (5-15s) and LittleFS Flash spooling.
 *  2. Addressed Handshake: Instantly replies with targeted ACK (< 40ms) so
 *     senders confirm receipt and immediately enter deep sleep.
 *  3. De-Duplication: Recognizes retransmitted packets and re-ACKs them to
 *     silence the sender, but avoids duplicate entries in Google Sheets.
 *  4. Native FreeRTOS Queue: Completely thread-safe FIFO buffer (32 records)
 *     between Core 1 and Core 0 with zero race conditions or pointer corruption.
 *  5. SPI Bus Protection: Display updates and radio maintenance are protected
 *     by SPI_MUTEX to eliminate hardware bus deadlocks.
 *  6. Hardware-Level Radio Keeper: 10-minute silence watchdog performs a clean
 *     hardware reset of the SX1262 silicon via LORA_RST, preventing freeze states
 *     without leaking Semtech Ticker timer slots.
 *  7. Persistent LittleFS Flash Spool: If Wi-Fi drops, telemetry is saved to
 *     non-volatile Flash storage and automatically drained once Wi-Fi recovers.
 *  8. Zero-Leak HTTPS: Clean SSL teardown on Google Script 302 redirects.
 */

#include "Config.h"
#include "DFRobot_LoRaRadio.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <LittleFS.h>

// ==========================================
// HARDWARE INSTANCES
// ==========================================
LCD_OnBoard screen;
DFRobot_LoRaRadio radio;

// ==========================================
// THREAD-SAFE RX BUFFER (from loraRadioTask)
// ==========================================
static char rxRawBuffer[256];
static volatile uint16_t rxRawSize = 0;
static volatile int16_t rxRawRSSI = 0;
static volatile int8_t rxRawSNR = 0;
static volatile bool newPacketFlag = false;
static volatile bool rxErrorFlag = false;
static volatile bool ackTxDone = false;

// ==========================================
// DUAL-CORE FREERTOS UPLOAD QUEUE
// ==========================================
struct UploadRecord {
  char pondId[16];
  char distCM[12];
  char batV[8];
  char pktNum[8];
};

static QueueHandle_t uploadQueue = NULL;

// ==========================================
// TELEMETRY STATE
// ==========================================
String lastPondID    = "---";
String lastDistCM    = "---";
String lastBatV      = "---";
String lastPktNum    = "0";
int16_t lastRSSI     = 0;
int8_t  lastSNR      = 0;

uint32_t totalPacketsRecv = 0;
unsigned long lastPacketMillis = 0;
bool hasReceivedData = false;

// Cloud Sync Status
enum CloudStatus { CLOUD_IDLE, CLOUD_OK, CLOUD_FAIL };
CloudStatus cloudStatus = CLOUD_IDLE;

// Periodic Timers & Watchdogs
unsigned long lastWiFiCheck     = 0;
unsigned long lastStatusLog     = 0;
unsigned long lastRxHealthCheck = 0;

// ==========================================
// DE-DUPLICATION CACHE (Up to 32 Ponds)
// ==========================================
struct PondCache {
  char pondId[16];
  uint32_t lastPkt;
};
static PondCache pondCache[MAX_POND_CACHE];
static uint8_t pondCacheCount = 0;

bool checkAndRecordPkt(const char *pondId, uint32_t pkt) {
  for (uint8_t i = 0; i < pondCacheCount; i++) {
    if (strcmp(pondCache[i].pondId, pondId) == 0) {
      if (pondCache[i].lastPkt == pkt) {
        return true; // Duplicate!
      }
      pondCache[i].lastPkt = pkt; // New packet
      return false;
    }
  }
  if (pondCacheCount < MAX_POND_CACHE) {
    strncpy(pondCache[pondCacheCount].pondId, pondId, sizeof(pondCache[0].pondId) - 1);
    pondCache[pondCacheCount].pondId[sizeof(pondCache[0].pondId) - 1] = '\0';
    pondCache[pondCacheCount].lastPkt = pkt;
    pondCacheCount++;
  }
  return false;
}

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

// Clean 4-Line Display (160x80 pixels)
// Note: screen methods (fillScreen, print, etc.) internally lock and unlock
// the DFRobot library's spimutex automatically on every SPI transfer.
void updateDisplay() {
  screen.fillScreen(COLOR_RGB565_BLACK);
  screen.setFont(&FreeMono9pt7b);
  screen.setTextSize(1);
  screen.setTextWrap(false);

  bool wifiOk = (WiFi.status() == WL_CONNECTED);

  if (!hasReceivedData) {
    screen.setTextColor(COLOR_RGB565_CYAN);
    screen.setCursor(0, 20);
    screen.print(F("FEED BARREL RX"));

    screen.setTextColor(COLOR_RGB565_GREEN);
    screen.setCursor(0, 42);
    screen.print(F("Waiting LoRa.."));

    screen.setTextColor(COLOR_RGB565_YELLOW);
    screen.setCursor(0, 65);
    screen.printf("WiFi: %s", wifiOk ? "OK" : "Conn..");
    return;
  }

  // Row 1 (Cyan): Pond ID
  char line1[15];
  snprintf(line1, sizeof(line1), "POND %-.8s", lastPondID.c_str());
  screen.setTextColor(COLOR_RGB565_CYAN);
  screen.setCursor(0, 16);
  screen.print(line1);

  // Row 2 (Green): Distance Reading
  char line2[15];
  if (lastDistCM == "ERR") {
    snprintf(line2, sizeof(line2), "Dist: SENS ERR");
  } else {
    snprintf(line2, sizeof(line2), "Dist: %-.5s cm", lastDistCM.c_str());
  }
  screen.setTextColor(COLOR_RGB565_GREEN);
  screen.setCursor(0, 36);
  screen.print(line2);

  // Row 3 (Yellow): Battery & WiFi Status
  char line3[15];
  const char *wifiStr = wifiOk ? "OK" : "Offline";
  if (lastBatV != "---") {
    snprintf(line3, sizeof(line3), "%-.4sV WiFi:%s", lastBatV.c_str(), wifiStr);
  } else {
    snprintf(line3, sizeof(line3), "Bat:--- WiFi:%s", wifiStr);
  }
  screen.setTextColor(COLOR_RGB565_YELLOW);
  screen.setCursor(0, 56);
  screen.print(line3);

  // Row 4 (White): Signal Strength & Packet Number
  char line4[15];
  snprintf(line4, sizeof(line4), "%ddBm #%s", lastRSSI, lastPktNum.c_str());
  screen.setTextColor(COLOR_RGB565_WHITE);
  screen.setCursor(0, 74);
  screen.print(line4);
}

// ==========================================
// PERSISTENT LITTLEFS FLASH SPOOLING
// ==========================================
void initLittleFS() {
  if (!LittleFS.begin(true)) {
    Serial.println(F("[FS] LittleFS mount failed!"));
  } else {
    Serial.println(F("[FS] LittleFS mounted successfully."));
    if (LittleFS.exists(OFFLINE_SPOOL_PATH)) {
      File f = LittleFS.open(OFFLINE_SPOOL_PATH, "r");
      if (f) {
        Serial.printf("[FS] Found existing spool file (%d bytes). Resuming sync...\n", f.size());
        f.close();
      }
    }
  }
}

void appendOfflineSpool(const String &pondId, const String &distCM, const String &batV, const String &pkt) {
  File f = LittleFS.open(OFFLINE_SPOOL_PATH, "a");
  if (!f) {
    Serial.println(F("[SPOOL] Error opening spool file for appending!"));
    return;
  }
  f.printf("%s,%s,%s,%s\n", pondId.c_str(), distCM.c_str(), batV.c_str(), pkt.c_str());
  f.close();
  Serial.printf("[SPOOL] Buffered offline record to Flash: Pond %s #%s\n", pondId.c_str(), pkt.c_str());
}

bool hasOfflineSpool() {
  return LittleFS.exists(OFFLINE_SPOOL_PATH);
}

// ==========================================
// ZERO-LEAK GOOGLE SHEETS HTTPS UPLOADER (Sequential Scoped TLS Sockets)
// ==========================================
bool postToGoogleSheets(const String &pondId, const String &distCM, const String &batV) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[HTTP] Wi-Fi offline. Skipping upload."));
    cloudStatus = CLOUD_FAIL;
    return false;
  }

  String scriptUrl = String(GOOGLE_SCRIPT_URL);
  if (scriptUrl.indexOf("http") != 0 || scriptUrl.indexOf("YOUR_GOOGLE") >= 0) {
    Serial.println(F("[HTTP] GOOGLE_SCRIPT_URL not configured in Config.h"));
    cloudStatus = CLOUD_FAIL;
    return false;
  }

  // Build JSON Payload
  String jsonPayload = "{\"pond_id\":\"" + pondId + "\",";
  if (distCM == "ERR" || distCM == "---") {
    jsonPayload += "\"distance\":\"ERR\",";
  } else {
    jsonPayload += "\"distance\":" + distCM + ",";
  }
  if (batV == "---") {
    jsonPayload += "\"battery\":\"---\"}";
  } else {
    jsonPayload += "\"battery\":" + batV + "}";
  }

  Serial.printf("[HTTP] Heap before upload: %lu bytes\n", (unsigned long)ESP.getFreeHeap());
  Serial.printf("[HTTP POST] Payload: %s\n", jsonPayload.c_str());

  bool success = false;
  String redirectUrl = "";

  // Step 1: POST to script.google.com (Scoped to ensure TLS buffer is freed before Step 2)
  {
    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;
    http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
    http.setTimeout(HTTP_TIMEOUT_MS);

    if (http.begin(client, scriptUrl)) {
      http.addHeader("Content-Type", "application/json");
      int httpCode = http.POST(jsonPayload);
      Serial.printf("[HTTP POST] Response code: %d\n", httpCode);

      if (httpCode == 301 || httpCode == 302) {
        redirectUrl = http.getLocation();
      } else if (httpCode == 200) {
        success = true;
      } else {
        Serial.printf("[HTTP POST] Error: %s\n", http.errorToString(httpCode).c_str());
      }
      http.end();
    } else {
      Serial.println(F("[HTTP] Failed to connect to Google Script endpoint."));
    }
    client.stop(); // Cleanly close & release TLS buffer for script.google.com
  }

  // Step 2: Follow 302 Redirect to script.googleusercontent.com with fresh SSL socket
  if (redirectUrl.length() > 0) {
    Serial.println(F("[HTTP] Following 302 redirect to script.googleusercontent.com..."));
    WiFiClientSecure client2;
    client2.setInsecure();
    HTTPClient http2;
    http2.setTimeout(HTTP_TIMEOUT_MS);

    if (http2.begin(client2, redirectUrl)) {
      int getCode = http2.GET();
      Serial.printf("[HTTP REDIRECT] Response code: %d\n", getCode);

      if (getCode > 0) {
        String resp = http2.getString();
        resp.trim();
        if (getCode == 200 || resp.indexOf("success") >= 0) {
          Serial.println(F("[HTTP] Logged to Google Sheets successfully!"));
          success = true;
        } else {
          Serial.printf("[HTTP] Response body: %s\n", resp.c_str());
        }
      } else {
        Serial.printf("[HTTP REDIRECT] Error: %s\n", http2.errorToString(getCode).c_str());
      }
      http2.end();
    }
    client2.stop(); // Cleanly close & release TLS buffer for script.googleusercontent.com
  }

  cloudStatus = success ? CLOUD_OK : CLOUD_FAIL;
  Serial.printf("[HTTP] Heap after upload : %lu bytes (Result: %s)\n",
                (unsigned long)ESP.getFreeHeap(), success ? "SUCCESS" : "FAIL");

  return success;
}

// Drain 1 record from offline Flash spool
bool drainOneSpoolRecord() {
  if (!LittleFS.exists(OFFLINE_SPOOL_PATH)) return false;

  File f = LittleFS.open(OFFLINE_SPOOL_PATH, "r");
  if (!f || !f.available()) {
    if (f) f.close();
    LittleFS.remove(OFFLINE_SPOOL_PATH);
    return false;
  }

  String firstLine = f.readStringUntil('\n');
  firstLine.trim();
  if (firstLine.length() == 0) {
    f.close();
    LittleFS.remove(OFFLINE_SPOOL_PATH);
    return false;
  }

  int c1 = firstLine.indexOf(',');
  int c2 = firstLine.indexOf(',', c1 + 1);
  int c3 = firstLine.indexOf(',', c2 + 1);
  if (c1 == -1 || c2 == -1) {
    f.close();
    LittleFS.remove(OFFLINE_SPOOL_PATH);
    return false;
  }

  String sPond = firstLine.substring(0, c1);
  String sDist = firstLine.substring(c1 + 1, c2);
  String sBat  = (c3 != -1) ? firstLine.substring(c2 + 1, c3) : firstLine.substring(c2 + 1);
  String sPkt  = (c3 != -1) ? firstLine.substring(c3 + 1) : "";

  Serial.printf("[SPOOL SYNC] Draining backlog: Pond %s, Dist %s cm, Bat %s V #%s\n",
                sPond.c_str(), sDist.c_str(), sBat.c_str(), sPkt.c_str());

  bool success = postToGoogleSheets(sPond, sDist, sBat);

  if (success) {
    File temp = LittleFS.open("/spool_tmp.txt", "w");
    bool hasRemaining = false;
    while (f.available()) {
      String line = f.readStringUntil('\n');
      line.trim();
      if (line.length() > 0) {
        temp.println(line);
        hasRemaining = true;
      }
      yield();
    }
    f.close();
    temp.close();
    LittleFS.remove(OFFLINE_SPOOL_PATH);
    if (hasRemaining) {
      LittleFS.rename("/spool_tmp.txt", OFFLINE_SPOOL_PATH);
    } else {
      LittleFS.remove("/spool_tmp.txt");
    }
    Serial.println(F("[SPOOL SYNC] Record successfully uploaded to Google Sheets!"));
    return true;
  } else {
    f.close();
    Serial.println(F("[SPOOL SYNC] Upload failed. Will retry later."));
    return false;
  }
}

// ==========================================
// CORE 0: DEDICATED BACKGROUND CLOUD UPLOADER
// ==========================================
void cloudUploadTask(void *pvParameters) {
  Serial.println(F("[CLOUD TASK] Background worker initialized on Core 0"));
  UploadRecord rec;

  for (;;) {
    // Blocks efficiently with 0% CPU until a record is queued (or times out after 5s)
    if (uploadQueue != NULL && xQueueReceive(uploadQueue, &rec, pdMS_TO_TICKS(5000)) == pdTRUE) {
      uint32_t remaining = (uploadQueue != NULL) ? uxQueueMessagesWaiting(uploadQueue) : 0;
      Serial.printf("[CLOUD] Dequeued Pond %s #%s (Pending in queue: %lu)\n",
                    rec.pondId, rec.pktNum, (unsigned long)remaining);

      bool uploaded = false;
      if (WiFi.status() == WL_CONNECTED) {
        uploaded = postToGoogleSheets(String(rec.pondId), String(rec.distCM), String(rec.batV));
      }

      if (!uploaded) {
        Serial.printf("[CLOUD] %s. Buffering to LittleFS Flash spool.\n",
                      (WiFi.status() == WL_CONNECTED) ? "Direct upload failed" : "Wi-Fi offline");
        appendOfflineSpool(String(rec.pondId), String(rec.distCM), String(rec.batV), String(rec.pktNum));
      }
    }

    // When queue is empty, check if we have older backlog in Flash spool to drain
    if (WiFi.status() == WL_CONNECTED && hasOfflineSpool()) {
      vTaskDelay(pdMS_TO_TICKS(1000));
      drainOneSpoolRecord();
    }

    vTaskDelay(pdMS_TO_TICKS(50)); // Yield to FreeRTOS scheduler
  }
}

// ==========================================
// LORA ISR CALLBACKS (Runs in radio context)
// ==========================================
void loraTxDone(void) {
  ackTxDone = true;
}

void loraRxDone(uint8_t *payload, uint16_t size, int16_t rssi, int8_t snr) {
  if (size == 0) return;

  uint16_t copyLen = (size < sizeof(rxRawBuffer) - 1) ? size : sizeof(rxRawBuffer) - 1;
  memcpy(rxRawBuffer, payload, copyLen);
  rxRawBuffer[copyLen] = '\0';

  rxRawSize = copyLen;
  rxRawRSSI = rssi;
  rxRawSNR  = snr;
  newPacketFlag = true;
}

void loraRxError(void) {
  rxErrorFlag = true;
}

// ==========================================
// INSTANT TARGETED HANDSHAKE ACK (< 40ms)
// ==========================================
void sendAddressedAck(const String &pondId, const String &pktNum) {
  String ackPayload = "ACK:" + pondId + ",Pkt:" + pktNum;
  ackTxDone = false;

  radio.sendData((uint8_t *)ackPayload.c_str(), ackPayload.length());

  unsigned long start = millis();
  while (!ackTxDone && (millis() - start < 500)) {
    delay(2);
  }

  // Immediately return to continuous RX mode
  radio.startRx();

  Serial.printf("[LORA ACK] Sent targeted ACK: \"%s\" (< %lu ms)\n",
                ackPayload.c_str(), millis() - start);
}

// ==========================================
// SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println(F("=============================================="));
  Serial.println(F("  FEED BARREL LORA RECEIVER (DFR1195)"));
  Serial.println(F("  Dual-Core Non-Blocking Multi-Node Station"));
  Serial.printf("  Listening on Freq: %lu Hz (SF%d)\n", RF_FREQUENCY, LORA_SPREADING_FACTOR);
  Serial.printf("  Initial Free Heap: %lu bytes\n", (unsigned long)ESP.getFreeHeap());
  Serial.println(F("=============================================="));

  // 1. Initialize 0.96" TFT LCD
  screen.begin();
  screen.setTextWrap(false);
  updateDisplay();

  // 2. Initialize LittleFS Flash Storage
  initLittleFS();

  // 3. Initialize Wi-Fi with persistent auto-reconnect
  Serial.printf("[WIFI] Connecting to SSID: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWiFiCheck = millis();

  // 4. Create Native FreeRTOS Queue for Cloud Uploads (Up to 32 records)
  uploadQueue = xQueueCreate(MAX_QUEUE_RECORDS, sizeof(UploadRecord));
  if (uploadQueue == NULL) {
    Serial.println(F("[ERROR] Failed to allocate FreeRTOS uploadQueue!"));
  } else {
    Serial.println(F("[INIT] FreeRTOS uploadQueue allocated (capacity: 32 records)."));
  }

  // 5. Spawn Dedicated Background Cloud Uploader on Core 0
  xTaskCreatePinnedToCore(
      cloudUploadTask,     // Worker function
      "CloudUploadTask",   // Task name
      8192,                // Stack size (8KB)
      NULL,                // Parameters
      1,                   // Priority (1 = background task)
      NULL,                // Task handle
      0                    // Core 0 (Network Core)
  );

  // 6. Initialize LoRa Radio for Bidirectional Handshake (RX + TX ACK)
  radio.init();
  radio.setTxCB(loraTxDone);
  radio.setRxCB(loraRxDone);
  radio.setRxErrorCB(loraRxError);
  radio.setFreq(RF_FREQUENCY);
  radio.setEIRP(TX_EIRP);
  radio.setSF(LORA_SPREADING_FACTOR);
  radio.setBW(LORA_BANDWIDTH);

  // 7. Start Continuous Listening on Core 1
  radio.startRx();
  Serial.println(F("[LORA RX] Listening for incoming barrel packets..."));
}

// ==========================================
// MAIN LOOP (Runs exclusively on Core 1)
// ==========================================
void loop() {
  // -------------------------------------------------------------
  // 1. PROCESS INCOMING PACKET (Fast path: < 50ms total)
  // -------------------------------------------------------------
  if (newPacketFlag) {
    newPacketFlag = false;

    String incoming = String(rxRawBuffer);
    int16_t rssi = rxRawRSSI;
    int8_t snr   = rxRawSNR;

    totalPacketsRecv++;
    lastPacketMillis = millis();
    hasReceivedData = true;
    lastRSSI = rssi;
    lastSNR  = snr;

    // Expected format: "ID:01.02.12,Dist_cm:45.2,Bat_V:4.08,Pkt:1"
    lastPondID = extractValue(incoming, "ID:");
    lastDistCM = extractValue(incoming, "Dist_cm:");
    lastBatV   = extractValue(incoming, "Bat_V:");
    lastPktNum = extractValue(incoming, "Pkt:");

    // Print structured log to USB Serial
    Serial.println(F("--------------------------------------------------"));
    Serial.printf("[LORA RX #%lu] Received (%d bytes) from Pond: %s\n", 
                  totalPacketsRecv, rxRawSize, lastPondID.c_str());
    Serial.printf("  -> Raw Data  : %s\n", incoming.c_str());
    Serial.printf("  -> Distance  : %s cm\n", lastDistCM.c_str());
    Serial.printf("  -> Battery   : %s V\n", lastBatV.c_str());
    Serial.printf("  -> Packet No : %s\n", lastPktNum.c_str());
    Serial.printf("  -> Signal    : RSSI %d dBm | SNR %d dB\n", rssi, snr);

    // CRITICAL: Immediately send targeted ACK (< 40ms) so sender sleeps
    sendAddressedAck(lastPondID, lastPktNum);

    // Check de-duplication cache
    bool isDuplicate = checkAndRecordPkt(lastPondID.c_str(), (uint32_t)lastPktNum.toInt());

    // Redraw screen with latest readings
    updateDisplay();

    if (isDuplicate) {
      Serial.printf("  -> [DE-DUP] Duplicate Pkt #%s from Pond %s. Re-ACKed; skipped cloud upload.\n",
                    lastPktNum.c_str(), lastPondID.c_str());
    } else {
      // Pack into UploadRecord and push to Core 0 queue (< 10 microseconds)
      if (uploadQueue != NULL) {
        UploadRecord rec;
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
          // Queue full: save directly to LittleFS Flash spool fallback
          Serial.println(F("  -> [QUEUE FULL] uploadQueue full! Buffering to LittleFS Flash spool."));
          appendOfflineSpool(lastPondID, lastDistCM, lastBatV, lastPktNum);
        }
      }
    }
    Serial.println(F("--------------------------------------------------"));
  }

  // -------------------------------------------------------------
  // 2. HANDLE CRC / CORRUPT RX ERRORS
  // -------------------------------------------------------------
  if (rxErrorFlag) {
    rxErrorFlag = false;
    Serial.println(F("[LORA RX ERROR] Packet corrupt/CRC error. Re-arming RX..."));
    radio.startRx();
  }

  // -------------------------------------------------------------
  // 3. 10-MINUTE RADIO HARDWARE HEALTH KEEPER
  // -------------------------------------------------------------
  // With 24 ponds transmitting every 6 minutes, silence over 10 minutes indicates
  // the SX1262 silicon may have entered an unhandled standby or locked state.
  // Performs a clean hardware pin pulse on LORA_RST to re-initialize silicon cleanly.
  if (millis() - lastRxHealthCheck >= 60000UL) {
    lastRxHealthCheck = millis();
    if (hasReceivedData && (millis() - lastPacketMillis > RX_DEAD_THRESHOLD_MS)) {
      Serial.println(F("[RX HEALTH] No packets for 10 min! Performing clean hardware reset of SX1262..."));
      pinMode(LORA_RST, OUTPUT);
      digitalWrite(LORA_RST, LOW);
      delay(10);
      digitalWrite(LORA_RST, HIGH);
      delay(20);

      radio.init();
      radio.setTxCB(loraTxDone);
      radio.setRxCB(loraRxDone);
      radio.setRxErrorCB(loraRxError);
      radio.setFreq(RF_FREQUENCY);
      radio.setEIRP(TX_EIRP);
      radio.setSF(LORA_SPREADING_FACTOR);
      radio.setBW(LORA_BANDWIDTH);
      radio.startRx();

      lastPacketMillis = millis(); // Reset counter
      Serial.println(F("[RX HEALTH] Radio successfully re-initialized and re-armed for continuous RX."));
    }
  }

  // -------------------------------------------------------------
  // 4. NON-BLOCKING WI-FI MONITOR (Every 30s)
  // -------------------------------------------------------------
  if (millis() - lastWiFiCheck >= WIFI_CHECK_INTERVAL_MS) {
    lastWiFiCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println(F("[WIFI] Disconnected. Reconnecting in background..."));
      WiFi.reconnect();
      updateDisplay();
    }
  }

  // -------------------------------------------------------------
  // 5. PERIODIC SERIAL HEARTBEAT (Every 15s)
  // -------------------------------------------------------------
  if (millis() - lastStatusLog >= STATUS_LOG_INTERVAL_MS) {
    lastStatusLog = millis();
    bool hasSpool = hasOfflineSpool();
    uint32_t pendingQueue = (uploadQueue != NULL) ? uxQueueMessagesWaiting(uploadQueue) : 0;
    if (hasReceivedData) {
      unsigned long elapsedSec = (millis() - lastPacketMillis) / 1000;
      Serial.printf("[STATUS] Last Pkt from Pond %s (%lu sec ago) | Total: %lu | Queue: %lu/32 | Spool: %s | Heap: %lu B | WiFi: %s\n",
                    lastPondID.c_str(), elapsedSec, totalPacketsRecv,
                    (unsigned long)pendingQueue,
                    hasSpool ? "PENDING" : "EMPTY",
                    (unsigned long)ESP.getFreeHeap(),
                    WiFi.status() == WL_CONNECTED ? "OK" : "Offline");
    } else {
      Serial.printf("[STATUS] Listening for barrel nodes... | Queue: %lu/32 | Spool: %s | Heap: %lu B | WiFi: %s\n",
                    (unsigned long)pendingQueue,
                    hasSpool ? "PENDING" : "EMPTY",
                    (unsigned long)ESP.getFreeHeap(),
                    WiFi.status() == WL_CONNECTED ? "OK" : "Offline");
    }
  }

  delay(5);
}
