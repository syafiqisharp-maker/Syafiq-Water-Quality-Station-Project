#include "TimeManager.h"

TimeManager::TimeManager() : _synced(false), _lastCheck(0) {}

void TimeManager::begin() {
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER_1, NTP_SERVER_2);
  Serial.println(F("[TIME] NTP time synchronization initialized (GMT+8 Asia/Kuala_Lumpur)."));
  _lastCheck = millis();
}

void TimeManager::update() {
  if (millis() - _lastCheck > NTP_SYNC_INTERVAL_MS || !_synced) {
    _lastCheck = millis();
    if (!isSynced()) {
      Serial.println(F("[TIME] Re-triggering NTP sync..."));
      configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER_1, NTP_SERVER_2);
    }
  }
}

bool TimeManager::isSynced() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 50)) {
    _synced = false;
    return false;
  }
  _synced = (timeinfo.tm_year + 1900 >= 2024);
  return _synced;
}

String TimeManager::getFormattedTimestamp() {
  struct tm timeinfo;
  if (getLocalTime(&timeinfo, 50) && (timeinfo.tm_year + 1900 >= 2024)) {
    char buf[30];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &timeinfo);
    return String(buf);
  }
  return "N/A";
}
