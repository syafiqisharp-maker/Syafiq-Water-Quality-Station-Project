#ifndef CLOUD_SYNC_MANAGER_H
#define CLOUD_SYNC_MANAGER_H

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "Config.h"

enum CloudStatus { CLOUD_IDLE, CLOUD_OK, CLOUD_FAIL };

class CloudSyncManager {
public:
  CloudSyncManager();
  void begin();
  void updateWiFi();
  bool isConnected() const;
  int getRSSI() const;

  bool canAttemptUpload() const;
  void triggerBackoff();
  void resetBackoff();

  bool postTelemetry(const String &ts, const String &pondId, const String &distCM, const String &batV);
  CloudStatus getStatus() const { return _status; }

private:
  CloudStatus _status;
  unsigned long _lastWiFiCheck;
  unsigned long _nextRetryTime;
};

#endif // CLOUD_SYNC_MANAGER_H
