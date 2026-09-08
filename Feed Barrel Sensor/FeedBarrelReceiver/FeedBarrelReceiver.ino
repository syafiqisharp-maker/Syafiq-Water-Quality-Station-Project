/**
 * ============================================================================
 * Feed Barrel LoRa Receiver & Display Station (Enhanced with Google Sheets)
 * Board: DFRobot LoRaWAN ESP32-S3 (DFR1195) + Semtech SX1262
 * Display: Onboard 0.96" TFT LCD (160x80)
 * ============================================================================
 * 
 * Features:
 *  1. ACTIVE RADIO KEEPER (Watchdog):
 *     - Semtech SX1262 driver is kept continuously in RX mode with periodic
 *       re-arming so it never gets stuck in Standby.
 *  2. THREAD-SAFE LORA RX:
 *     - Callback copies raw bytes into fixed buffer with zero heap allocation.
 *     - Parsing and network operations occur safely in loop().
 *  3. WI-FI & GOOGLE SHEETS CLOUD LOGGING:
 *     - Connects in background to "BAB Staff" Wi-Fi.
 *     - Posts [Timestamp, Pond ID, Distance, Battery] directly to your Google Sheet.
 *     - Follows 302 redirects automatically for Google Apps Script Web Apps.
 *  4. 0.96" TFT LCD STATUS & HEARTBEAT:
 *     - Real-time display showing Pond ID, Distance, Battery, RSSI, and Cloud Sync status.
 *     - 1-second visual heartbeat indicator (top right).
 */

#include "Config.h"
#include "DFRobot_LoRaRadio.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

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

// Wi-Fi & Cloud Status
enum CloudStatus { CLOUD_IDLE, CLOUD_UPLOADING, CLOUD_OK, CLOUD_FAIL };
CloudStatus cloudStatus = CLOUD_IDLE;
unsigned long lastWiFiCheck = 0;

// Heartbeat & Elapsed UI state
static bool heartbeatState = false;
static unsigned long lastElapsedMinutes = 9999;

// ==========================================
// BACKGROUND CLOUD UPLOAD (FreeRTOS Task)
// ==========================================
// Struct to pass telemetry data to the upload task without blocking loop()
struct CloudPayload {
  char pondId[16];
  char distCM[16];
  char batV[16];
};
static QueueHandle_t cloudQueue = NULL;
static TaskHandle_t  cloudTaskHandle = NULL;

// Hard watchdog: reboot ESP32 if no packet received for this long
#define RX_HARD_WATCHDOG_MS (20UL * 60UL * 1000UL)  // 20 minutes (allows missing up to 2 cycles before reboot)

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

// Update the 0.96" TFT LCD Screen (160x80 pixels) with full telemetry
// ALL LINES ARE STRICTLY CAPPED AT 14 CHARACTERS to fit the 160px width without wrapping
void updateDisplay() {
  screen.fillScreen(COLOR_RGB565_BLACK);
  screen.setFont(&FreeMono9pt7b);
  screen.setTextSize(1);
  screen.setTextWrap(false);

  if (!hasReceivedData) {
    // Waiting for initial transmission (Strictly <= 14 chars per line)
    char wait1[15] = "FEED BARREL RX"; // 14 chars
    char wait2[15];
    snprintf(wait2, sizeof(wait2), "Pond: %-.8s", TARGET_POND_ID); // 14 chars max
    char wait3[15];
    if (WiFi.status() == WL_CONNECTED) {
      snprintf(wait3, sizeof(wait3), "WiFi: OK");
    } else {
      snprintf(wait3, sizeof(wait3), "WiFi: Conn..");
    }

    screen.setTextColor(COLOR_RGB565_CYAN);
    screen.setCursor(0, 20);
    screen.print(wait1);

    screen.setTextColor(COLOR_RGB565_YELLOW);
    screen.setCursor(0, 42);
    screen.print(wait2);

    screen.setTextColor(COLOR_RGB565_WHITE);
    screen.setCursor(0, 65);
    screen.print(wait3);
    return;
  }

  // Row 1: Header / Pond ID (max 13-14 chars)
  char line1[15];
  snprintf(line1, sizeof(line1), "POND %-.8s", lastPondID.c_str());
  screen.setTextColor(COLOR_RGB565_CYAN);
  screen.setCursor(0, 16);
  screen.print(line1);

  // Row 2: Distance Reading (max 14 chars)
  char line2[15];
  if (lastDistCM == "ERR") {
    snprintf(line2, sizeof(line2), "Dist: SENS ERR"); // 14 chars
  } else {
    snprintf(line2, sizeof(line2), "Dist: %-.5s cm", lastDistCM.c_str()); // max 14 chars (e.g. "Dist: 45.2 cm")
  }
  screen.setTextColor(COLOR_RGB565_GREEN);
  screen.setCursor(0, 36);
  screen.print(line2);

  // Row 3: Feeder Battery Voltage & Cloud Icon (max 14 chars)
  char line3[15];
  const char *cStatusStr = "";
  if (cloudStatus == CLOUD_OK)        cStatusStr = " [G:OK]";
  else if (cloudStatus == CLOUD_FAIL) cStatusStr = " [G:ERR]";
  else if (cloudStatus == CLOUD_UPLOADING) cStatusStr = " [G:..]";

  if (lastBatV != "---") {
    snprintf(line3, sizeof(line3), "%-.4sV%s", lastBatV.c_str(), cStatusStr);
  } else {
    snprintf(line3, sizeof(line3), "Bat:---%s", cStatusStr);
  }
  screen.setTextColor(COLOR_RGB565_YELLOW);
  screen.setCursor(0, 56);
  screen.print(line3);

  // Row 4: Signal Strength & Elapsed Time (Strictly <= 14 chars)
  unsigned long elapsedSec = (millis() - lastPacketMillis) / 1000;
  unsigned long elapsedMin = elapsedSec / 60;
  lastElapsedMinutes = elapsedMin;

  char line4[15];
  if (millis() - lastPacketMillis > PACKET_WARN_TIMEOUT_MS) {
    // Late warning: e.g. "-65dBm W:8m" (11 chars) or "-105dBm W:15m" (13 chars)
    snprintf(line4, sizeof(line4), "%ddBm W:%lum", lastRSSI, elapsedMin);
    screen.setTextColor(COLOR_RGB565_RED);
  } else {
    // Normal: e.g. "-65dBm 0m ago" (13 chars), "-105dBm 9m ago" (14 chars), or "-65dBm 15m" (10 chars)
    if (elapsedMin < 10) {
      snprintf(line4, sizeof(line4), "%ddBm %lum ago", lastRSSI, elapsedMin);
    } else {
      snprintf(line4, sizeof(line4), "%ddBm %lum", lastRSSI, elapsedMin);
    }
    screen.setTextColor(COLOR_RGB565_WHITE);
  }
  screen.setCursor(0, 74);
  screen.print(line4);
}

// Update the 1-second visual heartbeat and refresh elapsed minutes
void updateHeartbeatAndElapsed() {
  // 1. Draw pulsing Heartbeat indicator at top-right (x=154, y=4, w=5, h=5)
  heartbeatState = !heartbeatState;
  uint16_t hbColor;
  if (WiFi.status() == WL_CONNECTED) {
    hbColor = heartbeatState ? COLOR_RGB565_GREEN : COLOR_RGB565_BLACK;
  } else {
    hbColor = heartbeatState ? COLOR_RGB565_BLUE : COLOR_RGB565_BLACK; // Blue pulse if waiting for Wi-Fi
  }
  screen.fillRect(154, 4, 5, 5, hbColor);

  // 2. If telemetry received, update the elapsed minutes on Row 4 when changed
  if (hasReceivedData) {
    unsigned long elapsedSec = (millis() - lastPacketMillis) / 1000;
    unsigned long elapsedMin = elapsedSec / 60;

    // Refresh row 4 if the minute count changed
    if (elapsedMin != lastElapsedMinutes) {
      lastElapsedMinutes = elapsedMin;
      screen.fillRect(0, 60, 160, 20, COLOR_RGB565_BLACK);
      screen.setFont(&FreeMono9pt7b);
      screen.setTextSize(1);
      screen.setTextWrap(false);
      screen.setCursor(0, 74);

      char line4[15];
      if (millis() - lastPacketMillis > PACKET_WARN_TIMEOUT_MS) {
        snprintf(line4, sizeof(line4), "%ddBm W:%lum", lastRSSI, elapsedMin);
        screen.setTextColor(COLOR_RGB565_RED);
      } else {
        if (elapsedMin < 10) {
          snprintf(line4, sizeof(line4), "%ddBm %lum ago", lastRSSI, elapsedMin);
        } else {
          snprintf(line4, sizeof(line4), "%ddBm %lum", lastRSSI, elapsedMin);
        }
        screen.setTextColor(COLOR_RGB565_WHITE);
      }
      screen.print(line4);
    }
  }
}

// LoRa packet received callback (runs in loraRadioTask context)
// KEEP THIS ULTRA LIGHTWEIGHT: No heap allocations, no delay, no Serial.printf!
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

// LoRa receive error callback (runs in loraRadioTask context)
void loraRxError(void) {
  rxErrorFlag = true;
}

// ==========================================
// BACKGROUND CLOUD UPLOAD TASK (runs on Core 0)
// ==========================================
// This runs in its own FreeRTOS task so HTTP calls NEVER block the LoRa loop.
void cloudUploadTask(void *pvParameters) {
  CloudPayload payload;
  for (;;) {
    // Block here until a new payload is queued from loop()
    if (xQueueReceive(cloudQueue, &payload, portMAX_DELAY) == pdTRUE) {
      cloudStatus = CLOUD_UPLOADING;

      if (WiFi.status() != WL_CONNECTED) {
        Serial.println(F("[HTTP] Wi-Fi offline. Skipping Google Sheets upload."));
        cloudStatus = CLOUD_FAIL;
        continue;
      }

      String scriptUrl = String(GOOGLE_SCRIPT_URL);
      if (scriptUrl.indexOf("http") != 0 || scriptUrl.indexOf("YOUR_GOOGLE") >= 0) {
        Serial.println(F("[HTTP] Notice: GOOGLE_SCRIPT_URL not configured yet in Config.h"));
        cloudStatus = CLOUD_FAIL;
        continue;
      }

      Serial.println(F("[HTTP] Initiating Google Sheets upload (background)..."));

      WiFiClientSecure client;
      client.setInsecure();
      HTTPClient http;

      if (!http.begin(client, scriptUrl)) {
        Serial.println(F("[HTTP] Error: Unable to begin HTTP client"));
        cloudStatus = CLOUD_FAIL;
        continue;
      }

      http.addHeader("Content-Type", "application/json");
      http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
      http.setTimeout(HTTP_TIMEOUT_MS);

      // Construct JSON payload
      String jsonPayload = "{";
      jsonPayload += "\"pond_id\":\"" + String(payload.pondId) + "\",";
      String dist = String(payload.distCM);
      if (dist == "ERR" || dist == "---") {
        jsonPayload += "\"distance\":\"ERR\",";
      } else {
        jsonPayload += "\"distance\":" + dist + ",";
      }
      String bat = String(payload.batV);
      if (bat == "---") {
        jsonPayload += "\"battery\":\"---\"";
      } else {
        jsonPayload += "\"battery\":" + bat;
      }
      jsonPayload += "}";

      Serial.printf("[HTTP POST] Payload: %s\n", jsonPayload.c_str());
      int httpCode = http.POST(jsonPayload);
      Serial.printf("[HTTP POST] Response code: %d\n", httpCode);

      // Handle HTTP 302 Redirect (Google Script redirect pattern)
      if (httpCode == 301 || httpCode == 302) {
        String redirectUrl = http.getLocation();
        http.end();
        if (http.begin(client, redirectUrl)) {
          http.setTimeout(HTTP_TIMEOUT_MS);
          httpCode = http.GET();
          Serial.printf("[HTTP GET Redirect] Response code: %d\n", httpCode);
        }
      }

      if (httpCode > 0) {
        String resp = http.getString();
        resp.trim();
        if (httpCode == 200 || resp.indexOf("success") >= 0) {
          Serial.println(F("[HTTP POST] Logged to Google Sheets successfully!"));
          cloudStatus = CLOUD_OK;
        } else {
          Serial.printf("[HTTP POST] Response: %s\n", resp.c_str());
          cloudStatus = CLOUD_FAIL;
        }
      } else {
        Serial.printf("[HTTP POST] Failed with error: %s\n", http.errorToString(httpCode).c_str());
        cloudStatus = CLOUD_FAIL;
      }

      http.end();
    }
  }
}

// Queue a cloud upload without blocking the LoRa loop
void queueCloudUpload(const String &pondId, const String &distCM, const String &batV) {
  if (cloudQueue == NULL) return;

  CloudPayload payload;
  strncpy(payload.pondId, pondId.c_str(), sizeof(payload.pondId) - 1);
  payload.pondId[sizeof(payload.pondId) - 1] = '\0';
  strncpy(payload.distCM, distCM.c_str(), sizeof(payload.distCM) - 1);
  payload.distCM[sizeof(payload.distCM) - 1] = '\0';
  strncpy(payload.batV, batV.c_str(), sizeof(payload.batV) - 1);
  payload.batV[sizeof(payload.batV) - 1] = '\0';

  // Use xQueueOverwrite-like behavior: if queue is full, drop oldest
  if (xQueueSend(cloudQueue, &payload, 0) != pdTRUE) {
    // Queue full (previous upload still in progress) – drop oldest and enqueue new
    CloudPayload discard;
    xQueueReceive(cloudQueue, &discard, 0);
    xQueueSend(cloudQueue, &payload, 0);
    Serial.println(F("[CLOUD] Queue full, replaced pending upload with latest data."));
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println(F("=============================================="));
  Serial.println(F("  FEED BARREL LORA RECEIVER (DFR1195)"));
  Serial.println(F("  With Wi-Fi & Google Sheets Logging"));
  Serial.printf("  Listening on Freq: %lu Hz\n", RF_FREQUENCY);
  Serial.printf("  Target Pond ID   : %s\n", TARGET_POND_ID);
  Serial.println(F("=============================================="));

  // 1. Initialize 0.96" TFT LCD
  screen.begin();
  screen.setTextWrap(false); // CRITICAL: Disable text wrapping to prevent line collision
  updateDisplay();

  // 2. Initialize Wi-Fi (Non-blocking background connection)
  Serial.printf("[WIFI] Connecting to Wi-Fi SSID: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWiFiCheck = millis();

  // 3. Initialize LoRa Radio
  radio.init();
  radio.setRxCB(loraRxDone);
  radio.setRxErrorCB(loraRxError);
  radio.setFreq(RF_FREQUENCY);
  radio.setSF(LORA_SPREADING_FACTOR);
  radio.setBW(LORA_BANDWIDTH);

  // 4. Start Continuous Listening
  radio.startRx();
  Serial.println(F("[LORA RX] Listening for incoming barrel packets..."));

  // 5. Create background cloud upload task (runs on Core 0, away from LoRa on Core 1)
  cloudQueue = xQueueCreate(2, sizeof(CloudPayload));
  xTaskCreatePinnedToCore(
    cloudUploadTask,   // Task function
    "CloudUpload",     // Name
    8192,              // Stack size (bytes) – HTTPS needs headroom
    NULL,              // Parameters
    1,                 // Priority (low, so LoRa loop is never starved)
    &cloudTaskHandle,  // Task handle
    0                  // Pin to Core 0 (LoRa radio task runs on Core 1)
  );
  Serial.println(F("[CLOUD] Background upload task started on Core 0."));
}

void loop() {
  // -------------------------------------------------------------
  // 1. PROCESS NEW PACKET SAFELY IN loopTask
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

    uint32_t pktVal = lastPktNum.toInt();
    if (pktVal == 1) {
      Serial.println(F("  -> Schedule  : Warmup Pkt #1. Next expected in ~2 min (at 3-min mark)"));
    } else if (pktVal == 2) {
      Serial.println(F("  -> Schedule  : Warmup Pkt #2. Next expected in ~3 min (at 6-min mark)"));
    } else if (pktVal == 3) {
      Serial.println(F("  -> Schedule  : Warmup Pkt #3. Next expected in ~6 min (at 12-min mark)"));
    } else {
      Serial.printf("  -> Schedule  : Steady-state (Pkt #%s). Next expected in ~6 min\n", lastPktNum.c_str());
    }

    Serial.printf("  -> Signal    : RSSI %d dBm | SNR %d dB\n", rssi, snr);
    Serial.println(F("--------------------------------------------------"));

    // Redraw LCD screen with new measurements
    updateDisplay();

    // Re-arm radio IMMEDIATELY to guarantee it stays in continuous RX mode
    radio.startRx();

    // Queue cloud upload in background task (NON-BLOCKING)
    queueCloudUpload(lastPondID, lastDistCM, lastBatV);
  }

  // -------------------------------------------------------------
  // 2. HANDLE RX ERROR SAFELY
  // -------------------------------------------------------------
  if (rxErrorFlag) {
    rxErrorFlag = false;
    Serial.println(F("[LORA RX ERROR] Packet CRC/corrupt detected. Re-arming RX..."));
    radio.startRx();
  }

  // -------------------------------------------------------------
  // 3. ACTIVE RADIO KEEPER (WATCHDOG)
  // Re-arm radio every 30s so the radio NEVER drops out of RX into Standby
  // -------------------------------------------------------------
  static unsigned long lastRxKeeper = 0;
  if (millis() - lastRxKeeper >= RX_KEEPER_INTERVAL_MS) {
    lastRxKeeper = millis();
    radio.startRx();
  }

  // -------------------------------------------------------------
  // 4. PERIODIC WI-FI CONNECTION MONITOR (Every 20s)
  // -------------------------------------------------------------
  if (millis() - lastWiFiCheck >= WIFI_RECONNECT_INTERVAL_MS) {
    lastWiFiCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println(F("[WIFI] Reconnecting to Wi-Fi..."));
      WiFi.reconnect();
    }

    // HARD WATCHDOG: If we've been running and no packet for RX_HARD_WATCHDOG_MS, reboot
    if (hasReceivedData && (millis() - lastPacketMillis > RX_HARD_WATCHDOG_MS)) {
      Serial.printf("\n[WATCHDOG] No LoRa packet for %d minutes! Rebooting ESP32...\n",
                    (int)(RX_HARD_WATCHDOG_MS / 60000UL));
      Serial.flush();
      delay(100);
      ESP.restart();
    }
  }

  // -------------------------------------------------------------
  // 5. LIVE UI HEARTBEAT & ELAPSED TIME (Every 1 second)
  // Blinks indicator at top right (Green = WiFi OK, Blue = Connecting)
  // -------------------------------------------------------------
  static unsigned long lastHeartbeat = 0;
  if (millis() - lastHeartbeat >= 1000) {
    lastHeartbeat = millis();
    updateHeartbeatAndElapsed();
  }

  // -------------------------------------------------------------
  // 6. PERIODIC USB SERIAL STATUS (Every 15 seconds)
  // -------------------------------------------------------------
  static unsigned long lastCheck = 0;
  if (millis() - lastCheck >= STATUS_LOG_INTERVAL_MS) {
    lastCheck = millis();
    if (hasReceivedData) {
      unsigned long elapsedSec = (millis() - lastPacketMillis) / 1000;
      unsigned long elapsedMin = elapsedSec / 60;
      uint32_t pktVal = lastPktNum.toInt();
      const char *nextExp = (pktVal == 1) ? "~2m" : (pktVal == 2) ? "~3m" : "~6m";
      Serial.printf("[STATUS] Last packet #%s received %lu min %lu sec ago (Next in %s | Total: %lu, WiFi: %s)\n", 
                    lastPktNum.c_str(), elapsedMin, elapsedSec % 60, nextExp, totalPacketsRecv,
                    WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected");

      if (millis() - lastPacketMillis > PACKET_WARN_TIMEOUT_MS) {
        Serial.printf("  [WARNING] No packet received in >%d min. Transmitter may be sleeping or out of range.\n",
                      (int)(PACKET_WARN_TIMEOUT_MS / 60000UL));
      }
    } else {
      Serial.printf("[STATUS] Waiting for LoRa packet... (WiFi: %s)\n",
                    WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected");
    }
  }

  delay(20);
}
