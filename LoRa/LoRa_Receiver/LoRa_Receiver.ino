/*
 * Modular LoRa Receiver & Wi-Fi Data Logger
 * Platform: ESP32-S3 + Ra-02 (SX1278 433MHz) + 1602 I2C LCD
 *
 * Architecture:
 * - Config.h           : Pins, Wi-Fi credentials, URLs, and timing constants.
 * - TimeManager        : NTP time synchronization & internal RTC GMT+8 timestamping.
 * - StorageManager     : LittleFS wear-leveled flash queue for offline data logging.
 * - LoRaReceiver       : Non-blocking SX1278 SPI packet receiver and sensor parser.
 * - NetworkManager     : Non-blocking Wi-Fi maintainer, Google Sheets HTTPS client, and queue flusher.
 * - DisplayManager     : 1602 LCD controller with anti-flicker live seconds ticker.
 */

#include "Config.h"
#include "DisplayManager.h"
#include "LoRaReceiver.h"
#include "NetworkManager.h"
#include "StorageManager.h"
#include "TimeManager.h"
#include <Arduino.h>

// ==========================================
// MODULE INSTANTIATIONS
// ==========================================
TimeManager timeManager;
StorageManager storageManager;
LoRaReceiver loraReceiver;
NetworkManager networkManager;
DisplayManager displayManager;

// ==========================================
// SCHEDULER TIMERS & FLAGS
// ==========================================
unsigned long lastLCDRefreshTime = 0;
unsigned long lastSheetsUploadTime = 0;
bool firstUploadDone = false;

// ==========================================
// SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  unsigned long serialStart = millis();
  while (!Serial && (millis() - serialStart < 2000)) {
    delay(10);
  }

  Serial.println(F("\n========================================================"));
  Serial.println(F("--- ESP32-S3 Modular LoRa Receiver & Web Gateway ---"));
  Serial.println(F("========================================================"));

  // Initialize 1602 LCD
  displayManager.begin();
  displayManager.showInitScreen("ESP32-S3 LoRa RX", "Initializing...");
  delay(1000);

  // Initialize LittleFS Storage
  storageManager.begin();

  // Initialize LoRa Module
  loraReceiver.begin();

  // Initialize Wi-Fi and NTP Time Manager
  networkManager.begin();
  timeManager.begin();

  Serial.println(F("--------------------------------------------------------"));
  Serial.println(F("Receiver Ready. Waiting for LoRa packets..."));
  Serial.println(F("Google Sheets upload scheduled every 15 minutes."));
  Serial.println(F("========================================================\n"));
}

// ==========================================
// HELPER: PROCESS 15-MINUTE DATA UPLOAD
// ==========================================
void processScheduledUpload(unsigned long currentMillis) {
  if (!loraReceiver.hasReceivedData()) {
    Serial.println(F("[UPLOAD] Skipping 15-min upload: No LoRa data received yet."));
    return;
  }

  String timestampStr = timeManager.getFormattedTime();
  float doVal = loraReceiver.getDO();
  float phVal = loraReceiver.getPH();
  float turbVal = loraReceiver.getTurb();
  float tempVal = loraReceiver.getTemp();
  float satVal = loraReceiver.getSat();

  Serial.printf("[UPLOAD TIMER] 15-minute mark reached (%s)\n", timestampStr.c_str());

  if (networkManager.isConnected()) {
    // 1. First flush any backlogged offline records from LittleFS
    if (storageManager.getOfflineRecordCount() > 0) {
      networkManager.flushOfflineQueue(storageManager);
    }

    // 2. Post current reading to Google Sheets
    bool success = networkManager.postToGoogle(doVal, phVal, turbVal, tempVal, timestampStr);
    if (!success) {
      Serial.println(F("[UPLOAD] POST failed. Saving record to LittleFS offline storage."));
      storageManager.saveOfflineRecord(timestampStr, doVal, phVal, turbVal, tempVal, satVal);
    }
  } else {
    // Wi-Fi Offline: Save to LittleFS Flash Queue
    Serial.println(F("[UPLOAD] Wi-Fi offline. Saving record to LittleFS offline storage."));
    storageManager.saveOfflineRecord(timestampStr, doVal, phVal, turbVal, tempVal, satVal);
  }
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
  unsigned long currentMillis = millis();

  // 1. Maintain background tasks
  loraReceiver.update();
  networkManager.update();
  timeManager.update();

  // 2. Refresh 1602 LCD display (1-second timer)
  if (currentMillis - lastLCDRefreshTime >= 1000U) {
    lastLCDRefreshTime = currentMillis;
    displayManager.renderLCD(loraReceiver.getDOString(),
                             loraReceiver.getTempString(),
                             loraReceiver.getPHString(),
                             loraReceiver.hasReceivedData(),
                             loraReceiver.getLastPacketTime());
  }

  // 3. Auto-flush backlog if Wi-Fi newly reconnected
  static bool prevWiFiState = false;
  bool currentWiFiState = networkManager.isConnected();
  if (currentWiFiState && !prevWiFiState) {
    Serial.println(F("[WIFI RECONNECTED] Wi-Fi restored! Checking for offline queue backlog..."));
    networkManager.flushOfflineQueue(storageManager);
  }
  prevWiFiState = currentWiFiState;

  // 4. Scheduled 15-Minute Upload Task
  if (!firstUploadDone && loraReceiver.hasReceivedData() && currentMillis > 15000U) {
    firstUploadDone = true;
    lastSheetsUploadTime = currentMillis;
    Serial.println(F("[UPLOAD] Executing initial upload upon boot..."));
    processScheduledUpload(currentMillis);
  } else if (firstUploadDone && (currentMillis - lastSheetsUploadTime >= GOOGLE_SHEETS_UPLOAD_MS)) {
    lastSheetsUploadTime = currentMillis;
    processScheduledUpload(currentMillis);
  }
}
