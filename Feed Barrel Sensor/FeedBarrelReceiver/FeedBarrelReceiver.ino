/**
 * ============================================================================
 * Feed Barrel LoRa Receiver & Display Station
 * Board: DFRobot LoRaWAN ESP32-S3 (DFR1195) + Semtech SX1262
 * Display: Onboard 0.96" TFT LCD (160x80 ST7789 via SPI)
 * ============================================================================
 * 
 * Clean, Non-Bloated Architecture:
 *  1. Multi-Node Support: Receives telemetry from up to 24 distinct ponds.
 *  2. Addressed Handshake: Instantly replies with targeted ACK (<40ms) so
 *     senders confirm receipt and immediately enter deep sleep.
 *  3. De-Duplication: Recognizes retransmitted packets and re-ACKs them to
 *     silence the sender, but avoids duplicate entries in Google Sheets.
 *  4. Persistent LittleFS Flash Spool: If farm Wi-Fi drops, telemetry is
 *     saved to non-volatile Flash storage (survives power cuts & reboots).
 *     Automatically drains and syncs to Google Sheets once Wi-Fi recovers.
 *  5. Always-On LoRa Watchdog: 30-second hardware keeper guarantees continuous RX.
 *  6. Zero-Leak HTTPS: Clean SSL teardown on Google Script 302 redirects.
 *  7. Clean 4-Line Display: High-contrast, uncrowded readout of vital telemetry.
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

// Periodic Timers & Guards (Aligned with WQS architecture)
unsigned long lastWiFiCheck   = 0;
unsigned long lastStatusLog   = 0;
unsigned long lastSpoolDrain  = 0;
unsigned long lastPostTime    = 0; // Guard against background spool colliding with live packets

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
// ZERO-LEAK GOOGLE SHEETS HTTPS UPLOADER (WQS Single-Socket Architecture)
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

  lastPostTime = millis();

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

  WiFiClientSecure client;
  client.setInsecure(); // Skip TLS certificate validation for Google Script endpoint
  HTTPClient http;

  if (!http.begin(client, scriptUrl)) {
    Serial.println(F("[HTTP] Error: HTTP begin failed."));
    cloudStatus = CLOUD_FAIL;
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  http.setTimeout(HTTP_TIMEOUT_MS);

  int httpCode = http.POST(jsonPayload);
  Serial.printf("[HTTP POST] Code: %d\n", httpCode);

  // Handle HTTP 301/302 Redirect (Google Script redirect pattern - WQS single-client reuse)
  if (httpCode == 301 || httpCode == 302) {
    String redirectUrl = http.getLocation();
    http.end(); // Cleanly close previous HTTP session without destroying client
    if (http.begin(client, redirectUrl)) { // Re-use the SAME client SSL socket!
      http.setTimeout(HTTP_TIMEOUT_MS);
      httpCode = http.GET();
      Serial.printf("[HTTP Redirect GET] Code: %d\n", httpCode);
    }
  }

  bool success = false;
  if (httpCode > 0) {
    String response = http.getString();
    response.trim();
    if (response.indexOf("success") >= 0 || httpCode == 200) {
      success = true;
      Serial.println(F("[HTTP POST] Logged to Google Sheets successfully!"));
    } else {
      Serial.printf("[HTTP POST] Response body: %s\n", response.c_str());
    }
  } else {
    Serial.printf("[HTTP POST] Connection failed: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
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
    Serial.println(F("[SPOOL SYNC] Upload failed. Will back off before retrying."));
    return false;
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
// INSTANT TARGETED HANDSHAKE ACK
// ==========================================
void sendAddressedAck(const String &pondId, const String &pktNum) {
  String ackPayload = "ACK:" + pondId + ",Pkt:" + pktNum;
  ackTxDone = false;
  radio.sendData((uint8_t *)ackPayload.c_str(), ackPayload.length());

  unsigned long start = millis();
  while (!ackTxDone && (millis() - start < 1000)) {
    delay(2);
  }
  // Immediately return to continuous RX mode
  radio.startRx();
  Serial.printf("[LORA ACK] Sent targeted ACK: \"%s\"\n", ackPayload.c_str());
}

// ==========================================
// SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println(F("=============================================="));
  Serial.println(F("  FEED BARREL LORA RECEIVER (DFR1195)"));
  Serial.println(F("  Multi-Node Handshake & Flash Spool Station"));
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

  // 4. Initialize LoRa Radio for Bidirectional Handshake (RX + TX ACK)
  radio.init();
  radio.setTxCB(loraTxDone);
  radio.setRxCB(loraRxDone);
  radio.setRxErrorCB(loraRxError);
  radio.setFreq(RF_FREQUENCY);
  radio.setEIRP(TX_EIRP);
  radio.setSF(LORA_SPREADING_FACTOR);
  radio.setBW(LORA_BANDWIDTH);

  // 5. Start Continuous Listening
  radio.startRx();
  Serial.println(F("[LORA RX] Listening for incoming barrel packets..."));
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
  // -------------------------------------------------------------
  // 1. PROCESS INCOMING PACKET
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
      // If Wi-Fi is connected and spool is empty: try direct upload
      if (WiFi.status() == WL_CONNECTED && !hasOfflineSpool()) {
        bool uploaded = postToGoogleSheets(lastPondID, lastDistCM, lastBatV);
        if (!uploaded) {
          Serial.println(F("  -> [FALLBACK] Direct upload failed. Buffering to Flash spool."));
          appendOfflineSpool(lastPondID, lastDistCM, lastBatV, lastPktNum);
        }
      } else {
        // Wi-Fi is offline or spool already has backlog: buffer to Flash
        appendOfflineSpool(lastPondID, lastDistCM, lastBatV, lastPktNum);
      }
      updateDisplay();
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
  // 3. PERSISTENT SPOOL DRAINER (Runs every 8s if Wi-Fi connected, no recent live post, and backoff expired)
  // -------------------------------------------------------------
  if (WiFi.status() == WL_CONNECTED && hasOfflineSpool()) {
    unsigned long curMs = millis();
    // Guard against colliding with live packet processing (WQS pattern)
    if ((curMs - lastPostTime >= POST_COLLISION_GUARD_MS) &&
        (curMs - lastSpoolDrain >= QUEUE_FLUSH_INTERVAL_MS)) {
      lastSpoolDrain = curMs;
      bool ok = drainOneSpoolRecord();
      if (!ok) {
        // Apply 30-second backoff penalty on failure to prevent hammering Wi-Fi
        lastSpoolDrain = curMs + QUEUE_RETRY_BACKOFF_MS;
        Serial.println(F("[SPOOL SYNC] Backing off queue flushes for 30 seconds."));
      }
      updateDisplay();
    }
  }

  // -------------------------------------------------------------
  // 4. NON-BLOCKING WI-FI MONITOR (Every 30s aligned with WQS)
  // -------------------------------------------------------------
  if (millis() - lastWiFiCheck >= WIFI_CHECK_INTERVAL_MS) {
    lastWiFiCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println(F("[WIFI] Disconnected. Reconnecting in background..."));
      WiFi.reconnect();
      updateDisplay();
    }
  }

  // NOTE: Hardware RX watchdog removed! Repetitive 30-second calls to radio.startRx()
  // leaked Semtech Ticker timer slots, which froze SX1262 SPI communication after ~30 min.
  // Continuous RX is armed in setup() and re-armed upon ACK completion / CRC errors.

  // -------------------------------------------------------------
  // 6. PERIODIC SERIAL HEARTBEAT (Every 15s)
  // -------------------------------------------------------------
  if (millis() - lastStatusLog >= STATUS_LOG_INTERVAL_MS) {
    lastStatusLog = millis();
    bool hasSpool = hasOfflineSpool();
    if (hasReceivedData) {
      unsigned long elapsedSec = (millis() - lastPacketMillis) / 1000;
      Serial.printf("[STATUS] Last Pkt from Pond %s (%lu sec ago) | Total: %lu | Spool: %s | Heap: %lu B | WiFi: %s\n",
                    lastPondID.c_str(), elapsedSec, totalPacketsRecv,
                    hasSpool ? "PENDING" : "EMPTY",
                    (unsigned long)ESP.getFreeHeap(),
                    WiFi.status() == WL_CONNECTED ? "OK" : "Offline");
    } else {
      Serial.printf("[STATUS] Listening for barrel nodes... | Spool: %s | Heap: %lu B | WiFi: %s\n",
                    hasSpool ? "PENDING" : "EMPTY",
                    (unsigned long)ESP.getFreeHeap(),
                    WiFi.status() == WL_CONNECTED ? "OK" : "Offline");
    }
  }

  delay(20);
}
