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

  // Periodic Wi-Fi connection maintainer and background queue processor
  void update(StorageManager &storage);

  // Status Check
  bool isConnected() const;

  // Uploads a single record payload to Google Sheets via HTTPS POST
  bool postToGoogle(float doVal, float phVal, float turbVal, float tempVal,
                    const String &timestampStr = "", float satVal = NAN);

private:
  unsigned long _lastWiFiCheck;
  unsigned long _lastQueueFlushTime;
  unsigned long _lastPostTime;

  void processBackgroundQueue(StorageManager &storage);
};

#endif // CLOUD_SYNC_MANAGER_H
