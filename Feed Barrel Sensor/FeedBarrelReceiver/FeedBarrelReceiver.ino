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

// Post telemetry readings to Google Sheets via Apps Script Web App
bool postToGoogleSheets(const String &pondId, const String &distCM, const String &batV) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[HTTP] Wi-Fi offline. Skipping Google Sheets upload."));
    cloudStatus = CLOUD_FAIL;
    return false;
  }

  String scriptUrl = String(GOOGLE_SCRIPT_URL);
  if (scriptUrl.indexOf("http") != 0 || scriptUrl.indexOf("YOUR_GOOGLE") >= 0) {
    Serial.println(F("[HTTP] Notice: GOOGLE_SCRIPT_URL not configured yet in Config.h"));
    cloudStatus = CLOUD_FAIL;
    return false;
  }

  cloudStatus = CLOUD_UPLOADING;
  Serial.println(F("[HTTP] Initiating Google Sheets upload..."));

  WiFiClientSecure client;
  client.setInsecure(); // Skip certificate verification for Google script redirect
  HTTPClient http;

  if (!http.begin(client, scriptUrl)) {
    Serial.println(F("[HTTP] Error: Unable to begin HTTP client"));
    cloudStatus = CLOUD_FAIL;
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  http.setTimeout(HTTP_TIMEOUT_MS);

  // Construct JSON payload
  // Format: {"pond_id":"01.02.12","distance":45.2,"battery":4.12}
  String jsonPayload = "{";
  jsonPayload += "\"pond_id\":\"" + pondId + "\",";
  if (distCM == "ERR" || distCM == "---") {
    jsonPayload += "\"distance\":\"ERR\",";
  } else {
    jsonPayload += "\"distance\":" + distCM + ",";
  }
  if (batV == "---") {
    jsonPayload += "\"battery\":\"---\"";
  } else {
    jsonPayload += "\"battery\":" + batV;
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

  bool success = false;
  if (httpCode > 0) {
    String resp = http.getString();
    resp.trim();
    if (httpCode == 200 || resp.indexOf("success") >= 0) {
      Serial.println(F("[HTTP POST] Logged to Google Sheets successfully!"));
      cloudStatus = CLOUD_OK;
      success = true;
    } else {
      Serial.printf("[HTTP POST] Response: %s\n", resp.c_str());
      cloudStatus = CLOUD_FAIL;
    }
  } else {
    Serial.printf("[HTTP POST] Failed with error: %s\n", http.errorToString(httpCode).c_str());
    cloudStatus = CLOUD_FAIL;
  }

  http.end();
  return success;
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
    Serial.printf("  -> Signal    : RSSI %d dBm | SNR %d dB\n", rssi, snr);
    Serial.println(F("--------------------------------------------------"));

    // Redraw LCD screen with new measurements
    updateDisplay();

    // Re-arm radio to guarantee it stays in continuous RX mode
    radio.startRx();

    // Trigger Cloud Logging to Google Sheets
    postToGoogleSheets(lastPondID, lastDistCM, lastBatV);
    updateDisplay(); // Refresh to show cloud upload result
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
      Serial.printf("[STATUS] Last packet #%s received %lu min %lu sec ago (Total: %lu, WiFi: %s)\n", 
                    lastPktNum.c_str(), elapsedMin, elapsedSec % 60, totalPacketsRecv,
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
