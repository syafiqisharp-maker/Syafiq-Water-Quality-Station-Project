/**
 * ============================================================================
 * Feed Barrel LoRa Receiver & Display Station
 * Board: DFRobot LoRaWAN ESP32-S3 (DFR1195) + Semtech SX1262
 * Display: Onboard 0.96" TFT LCD (160x80 ST7789 via SPI)
 * ============================================================================
 * 
 * Clean, Non-Bloated Architecture:
 *  1. Single-threaded & Linear: No extra FreeRTOS tasks or queues.
 *  2. SPI-Safe: Display is only redrawn when new telemetry arrives or status
 *     changes. No 1-second screen hammering that collides with SX1262 SPI.
 *  3. Zero-Leak HTTPS: Both HTTPClient and WiFiClientSecure are explicitly
 *     ended and stopped (http.end() + client.stop()). Clean teardown on 302
 *     redirects. Logs ESP.getFreeHeap() to guarantee memory stability.
 *  4. Event-driven LoRa: Radio is armed in setup() and re-armed once per packet.
 *     No aggressive 30-second timer prodding that destabilizes the SX1262.
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

// Cloud Sync Status
enum CloudStatus { CLOUD_IDLE, CLOUD_OK, CLOUD_FAIL };
CloudStatus cloudStatus = CLOUD_IDLE;

// Periodic timers
unsigned long lastWiFiCheck = 0;
unsigned long lastStatusLog = 0;

// ==========================================
// HELPER FUNCTIONS
// ==========================================

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

// Update the 0.96" TFT LCD Screen (160x80 pixels)
// ALL LINES STRICTLY CAPPED AT 14 CHARACTERS to prevent text clipping
void updateDisplay() {
  screen.fillScreen(COLOR_RGB565_BLACK);
  screen.setFont(&FreeMono9pt7b);
  screen.setTextSize(1);
  screen.setTextWrap(false);

  if (!hasReceivedData) {
    char wait1[15] = "FEED BARREL RX";
    char wait2[15];
    snprintf(wait2, sizeof(wait2), "Pond: %-.8s", TARGET_POND_ID);
    char wait3[15];
    snprintf(wait3, sizeof(wait3), "WiFi: %s", (WiFi.status() == WL_CONNECTED) ? "OK" : "Conn..");

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

  // Row 1: Header / Pond ID
  char line1[15];
  snprintf(line1, sizeof(line1), "POND %-.8s", lastPondID.c_str());
  screen.setTextColor(COLOR_RGB565_CYAN);
  screen.setCursor(0, 16);
  screen.print(line1);

  // Row 2: Distance Reading
  char line2[15];
  if (lastDistCM == "ERR") {
    snprintf(line2, sizeof(line2), "Dist: SENS ERR");
  } else {
    snprintf(line2, sizeof(line2), "Dist: %-.5s cm", lastDistCM.c_str());
  }
  screen.setTextColor(COLOR_RGB565_GREEN);
  screen.setCursor(0, 36);
  screen.print(line2);

  // Row 3: Battery Voltage & Google Sheets Status
  char line3[15];
  const char *cStatusStr = "";
  if (cloudStatus == CLOUD_OK)        cStatusStr = " [G:OK]";
  else if (cloudStatus == CLOUD_FAIL) cStatusStr = " [G:ERR]";

  if (lastBatV != "---") {
    snprintf(line3, sizeof(line3), "%-.4sV%s", lastBatV.c_str(), cStatusStr);
  } else {
    snprintf(line3, sizeof(line3), "Bat:---%s", cStatusStr);
  }
  screen.setTextColor(COLOR_RGB565_YELLOW);
  screen.setCursor(0, 56);
  screen.print(line3);

  // Row 4: Signal Strength & Packet Number
  char line4[15];
  snprintf(line4, sizeof(line4), "%ddBm #%s", lastRSSI, lastPktNum.c_str());
  screen.setTextColor(COLOR_RGB565_WHITE);
  screen.setCursor(0, 74);
  screen.print(line4);
}

// ==========================================
// ZERO-LEAK GOOGLE SHEETS HTTPS UPLOADER
// ==========================================
// Explicitly shuts down SSL connections (client.stop() + http.end())
// and prints free heap memory before and after every upload.
bool postToGoogleSheets(const String &pondId, const String &distCM, const String &batV) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[HTTP] Wi-Fi offline. Skipping Google Sheets upload."));
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

  // -------------------------------------------------------------
  // Step 1: Initial POST request to script.google.com
  // -------------------------------------------------------------
  {
    WiFiClientSecure client;
    client.setInsecure(); // Google uses valid CA certs; insecure avoids embedding massive root CA bundle
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

    client.stop(); // CRITICAL: Release TCP socket & mbedTLS SSL heap memory
  }

  // -------------------------------------------------------------
  // Step 2: Follow 302 Redirect with clean new SSL client
  // (Redirect host is script.googleusercontent.com - needs fresh SSL context)
  // -------------------------------------------------------------
  if (redirectUrl.length() > 0) {
    Serial.println(F("[HTTP] Following 302 redirect with clean SSL socket..."));
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

    client2.stop(); // CRITICAL: Release TCP socket & mbedTLS SSL heap memory
  }

  cloudStatus = success ? CLOUD_OK : CLOUD_FAIL;
  Serial.printf("[HTTP] Heap after upload : %lu bytes (Result: %s)\n",
                (unsigned long)ESP.getFreeHeap(), success ? "SUCCESS" : "FAIL");

  return success;
}

// ==========================================
// LORA ISR CALLBACKS (Runs in radio context)
// ==========================================
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
// SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println(F("=============================================="));
  Serial.println(F("  FEED BARREL LORA RECEIVER (DFR1195)"));
  Serial.println(F("  Clean Single-Threaded Architecture"));
  Serial.printf("  Listening on Freq: %lu Hz\n", RF_FREQUENCY);
  Serial.printf("  Target Pond ID   : %s\n", TARGET_POND_ID);
  Serial.printf("  Initial Free Heap: %lu bytes\n", (unsigned long)ESP.getFreeHeap());
  Serial.println(F("=============================================="));

  // 1. Initialize 0.96" TFT LCD
  screen.begin();
  screen.setTextWrap(false);
  updateDisplay();

  // 2. Initialize Wi-Fi (Non-blocking background connection)
  Serial.printf("[WIFI] Connecting to SSID: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWiFiCheck = millis();

  // 3. Initialize LoRa SX1262 Radio
  radio.init();
  radio.setRxCB(loraRxDone);
  radio.setRxErrorCB(loraRxError);
  radio.setFreq(RF_FREQUENCY);
  radio.setSF(LORA_SPREADING_FACTOR);
  radio.setBW(LORA_BANDWIDTH);

  // 4. Start Continuous Listening
  radio.startRx();
  Serial.println(F("[LORA RX] Listening for incoming barrel packets..."));
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
  // -------------------------------------------------------------
  // 1. PROCESS NEW PACKET WHEN RECEIVED
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

    // Redraw screen with latest readings (SPI safe, done outside ISR)
    updateDisplay();

    // Re-arm radio for the next packet
    radio.startRx();

    // Post to Google Sheets (synchronous, fully cleans up SSL sockets)
    postToGoogleSheets(lastPondID, lastDistCM, lastBatV);

    // Refresh screen to show [G:OK] or [G:ERR]
    updateDisplay();
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
  // 3. NON-BLOCKING WI-FI MONITOR (Every 20 seconds)
  // -------------------------------------------------------------
  if (millis() - lastWiFiCheck >= WIFI_RECONNECT_INTERVAL_MS) {
    lastWiFiCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println(F("[WIFI] Disconnected. Reconnecting in background..."));
      WiFi.reconnect();
    }
  }

  // -------------------------------------------------------------
  // 4. PERIODIC SERIAL HEARTBEAT (Every 15 seconds)
  // -------------------------------------------------------------
  if (millis() - lastStatusLog >= STATUS_LOG_INTERVAL_MS) {
    lastStatusLog = millis();
    if (hasReceivedData) {
      unsigned long elapsedSec = (millis() - lastPacketMillis) / 1000;
      unsigned long elapsedMin = elapsedSec / 60;
      uint32_t pktVal = lastPktNum.toInt();
      const char *nextExp = (pktVal == 1) ? "~2m" : (pktVal == 2) ? "~3m" : "~6m";
      Serial.printf("[STATUS] Last Pkt #%s was %lu min %lu sec ago (Next in %s | Total: %lu | Heap: %lu B | WiFi: %s)\n",
                    lastPktNum.c_str(), elapsedMin, elapsedSec % 60, nextExp, totalPacketsRecv,
                    (unsigned long)ESP.getFreeHeap(),
                    WiFi.status() == WL_CONNECTED ? "OK" : "Offline");
    } else {
      Serial.printf("[STATUS] Waiting for LoRa packet... (Heap: %lu B | WiFi: %s)\n",
                    (unsigned long)ESP.getFreeHeap(),
                    WiFi.status() == WL_CONNECTED ? "OK" : "Offline");
    }
  }

  delay(20);
}
