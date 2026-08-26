/*
 * Modular LoRa Receiver & Wi-Fi Data Logger
 * Platform: ESP32-C6 + Ra-02 (SX1278 433MHz) + 1602 I2C LCD
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
 * - DisplayManager     : 1602 LCD controller with exact arrival timestamp
 * display.
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
// HELPER: PROCESS IMMEDIATE PACKET DATA UPLOAD
// ==========================================
void processPacketUpload() {
  String timestampStr = timeManager.getFormattedTime();
  float doVal = loraReceiver.getDO();
  float phVal = loraReceiver.getPH();
  float turbVal = loraReceiver.getTurb();
  float tempVal = loraReceiver.getTemp();
  float satVal = loraReceiver.getSat();

  Serial.println(
      F("\n========================================================"));
  Serial.printf("[PACKET UPLOAD] Processing new WQS telemetry (%s)\n",
                timestampStr.c_str());
  Serial.printf("  -> DO: %.2f mg/L | pH: %.2f | Turb: %.1f %% | Temp: %.1f C "
                "| Sat: %.1f %%\n",
                doVal, phVal, turbVal, tempVal, satVal);

  if (networkManager.isConnected()) {
    // Post fresh reading directly to Google Sheets
    bool success = networkManager.postToGoogle(doVal, phVal, turbVal, tempVal,
                                               timestampStr, satVal);
    if (!success) {
      Serial.println(F("[UPLOAD] Direct POST failed. Saving record to LittleFS "
                       "offline storage."));
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
  Serial.println(
      F("========================================================\n"));
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
  Serial.println(F("--- ESP32-C6 Modular LoRa Receiver & Web Gateway ---"));
  Serial.println(F("========================================================"));

  // Initialize 1602 LCD
  displayManager.begin();
  displayManager.showInitScreen("ESP32-C6 LoRa RX", "Initializing...");
  delay(1000);

  // Initialize LittleFS Storage
  storageManager.begin();

  // Initialize LoRa Module
  loraReceiver.begin();

  // Initialize Wi-Fi and NTP Time Manager
  networkManager.begin();
  timeManager.begin();

  Serial.println(F("--------------------------------------------------------"));
  Serial.println(
      F("Receiver Ready. Waiting for LoRa packets (5m 05s cycle)..."));
  Serial.println(
      F("Direct Google Sheets upload triggered upon packet reception."));
  Serial.println(
      F("========================================================\n"));
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
  // 1. Maintain background tasks, Wi-Fi, NTP sync & background queue flushing
  bool newPacketReceived = loraReceiver.update();
  networkManager.update(storageManager);
  timeManager.update();

  // 2. Event-driven action triggered immediately upon LoRa packet reception
  if (newPacketReceived) {
    loraReceiver.clearNewPacket();

    // Refresh LCD with latest readings and exact arrival timestamp (HH:MM:SS)
    displayManager.renderLCD(
        loraReceiver.getDOString(), loraReceiver.getTempString(),
        loraReceiver.getPHString(), timeManager.getTimeOnly(),
        loraReceiver.hasReceivedData());

    // Upload directly to Google Sheets (or save to LittleFS on failure)
    processPacketUpload();
  }
}
