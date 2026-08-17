#ifndef CLOUD_SYNC_MANAGER_H
#define CLOUD_SYNC_MANAGER_H

#include "Config.h"
#include "StorageManager.h"
#include "TimeManager.h"
#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

class CloudSyncManager {
public:
  CloudSyncManager();

  // Initializes Wi-Fi connection (non-blocking)
  void begin();

  // Periodic Wi-Fi connection maintainer
  void update();

  // Status Check
  bool isConnected() const;

  // Uploads a single record payload to Google Sheets via HTTPS POST
  bool postToGoogle(float doVal, float phVal, float turbVal, float tempVal,
                    const String &timestampStr = "");

  // Flushes any backlogged offline records stored in LittleFS to Google Sheets
  void flushOfflineQueue(StorageManager &storage);

private:
  unsigned long _lastWiFiCheck;
  bool _flushingQueue;
};

#endif // CLOUD_SYNC_MANAGER_H
