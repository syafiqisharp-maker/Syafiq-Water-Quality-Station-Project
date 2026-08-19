/*
 * Modular LoRa Receiver & Wi-Fi Data Logger
 * Platform: ESP32-S3 + Ra-02 (SX1278 433MHz) + 1602 I2C LCD
 *
 * Architecture:
 * - Config.h           : Pins, Wi-Fi credentials, URLs, and timing constants.
 * - TimeManager        : NTP time synchronization & internal RTC GMT+8
 * timestamping.
 * - StorageManager     : LittleFS wear-leveled flash queue for offline data
 * logging.
 * - LoRaReceiver       : Non-blocking SX1278 SPI packet receiver and sensor
 * parser.
 * - NetworkManager     : Non-blocking Wi-Fi maintainer, Google Sheets HTTPS
 * client, and queue flusher.
 * - DisplayManager     : 1602 LCD controller with anti-flicker live seconds
 * ticker.
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
CloudSyncManager networkManager;
DisplayManager displayManager;

// ==========================================
// SCHEDULER TIMERS & FLAGS
// ==========================================
unsigned long lastLCDRefreshTime = 0;

// ==========================================
// HELPER: PROCESS IMMEDIATE PACKET DATA UPLOAD
// ==========================================
void processPacketUpload() {
  String timestampStr = timeManager.getFormattedTime();
  float doVal = loraReceiver.getDO();
  float phVal = loraReceiver.getPH();
  float turbVal = loraReceiver.getTurb();
  float tempVal = loraReceiver.getTemp();
  float satVal = loraReceiver.getSat();

  Serial.println(F("\n========================================================"));
  Serial.printf("[PACKET UPLOAD] Processing new WQS telemetry (%s)\n",
                timestampStr.c_str());
  Serial.printf("  -> DO: %.2f mg/L | pH: %.2f | Turb: %.1f %% | Temp: %.1f C | Sat: %.1f %%\n",
                doVal, phVal, turbVal, tempVal, satVal);

  if (networkManager.isConnected()) {
    // 1. First flush any backlogged offline records from LittleFS
    if (storageManager.getOfflineRecordCount() > 0) {
      networkManager.flushOfflineQueue(storageManager);
    }

    // 2. Post fresh reading directly to Google Sheets
    bool success = networkManager.postToGoogle(doVal, phVal, turbVal, tempVal,
                                               timestampStr, satVal);
    if (!success) {
      Serial.println(F(
          "[UPLOAD] Direct POST failed. Saving record to LittleFS offline storage."));
      storageManager.saveOfflineRecord(timestampStr, doVal, phVal, turbVal,
                                       tempVal, satVal);
    }
  } else {
    // Wi-Fi Offline: Save to LittleFS Flash Queue
    Serial.println(F(
        "[UPLOAD] Wi-Fi offline. Saving record to LittleFS offline storage."));
    storageManager.saveOfflineRecord(timestampStr, doVal, phVal, turbVal,
                                     tempVal, satVal);
  }
  Serial.println(F("========================================================\n"));
}

// ==========================================
// SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  unsigned long serialStart = millis();
  while (!Serial && (millis() - serialStart < 2000)) {
    delay(10);
  }

  Serial.println(
      F("\n========================================================"));
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
  Serial.println(F("Receiver Ready. Waiting for LoRa packets (5m 05s cycle)..."));
  Serial.println(F("Direct Google Sheets upload triggered upon packet reception."));
  Serial.println(
      F("========================================================\n"));
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
  unsigned long currentMillis = millis();

  // 1. Maintain background tasks & check for incoming LoRa packet
  bool newPacketReceived = loraReceiver.update();
  networkManager.update();
  timeManager.update();

  // 2. Event-driven upload triggered immediately on packet reception
  if (newPacketReceived) {
    loraReceiver.clearNewPacket();

    // Immediately refresh LCD with latest readings
    displayManager.renderLCD(
        loraReceiver.getDOString(), loraReceiver.getTempString(),
        loraReceiver.getPHString(), loraReceiver.hasReceivedData(),
        loraReceiver.getLastPacketTime());

    // Upload directly to Google Sheets
    processPacketUpload();
  }

  // 3. Periodic 1602 LCD display update (1-second timer for live seconds ticker)
  if (currentMillis - lastLCDRefreshTime >= 1000U) {
    lastLCDRefreshTime = currentMillis;
    displayManager.renderLCD(
        loraReceiver.getDOString(), loraReceiver.getTempString(),
        loraReceiver.getPHString(), loraReceiver.hasReceivedData(),
        loraReceiver.getLastPacketTime());
  }

  // 4. Auto-flush backlog if Wi-Fi newly reconnected
  static bool prevWiFiState = false;
  bool currentWiFiState = networkManager.isConnected();
  if (currentWiFiState && !prevWiFiState) {
    Serial.println(F("[WIFI RECONNECTED] Wi-Fi restored! Checking for offline "
                     "queue backlog..."));
    networkManager.flushOfflineQueue(storageManager);
  }
  prevWiFiState = currentWiFiState;
}
