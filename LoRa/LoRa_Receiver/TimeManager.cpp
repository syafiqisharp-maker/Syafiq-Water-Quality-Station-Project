#include "TimeManager.h"

TimeManager::TimeManager() : _synced(false), _lastNTPSyncCheck(0) {}

void TimeManager::begin() {
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, "pool.ntp.org", "time.google.com", "time.nist.gov");
  Serial.println(F("[TIME] NTP Time synchronization initialized (GMT+8)."));
  _lastNTPSyncCheck = millis();
}

bool TimeManager::isTimeSynced() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 10)) {
    _synced = false;
    return false;
  }
  // Check if year is valid (e.g. >= 2024, tm_year is years since 1900)
  _synced = (timeinfo.tm_year + 1900 >= 2024);
  return _synced;
}

String TimeManager::getFormattedTime() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 10)) {
    return "N/A";
  }
  char timeStringBuff[30];
  strftime(timeStringBuff, sizeof(timeStringBuff), "%Y-%m-%d %H:%M:%S", &timeinfo);
  return String(timeStringBuff);
}

void TimeManager::update() {
  if (millis() - _lastNTPSyncCheck > NTP_SYNC_INTERVAL_MS) {
    _lastNTPSyncCheck = millis();
    if (!isTimeSynced()) {
      Serial.println(F("[TIME] Re-triggering NTP time sync..."));
      configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, "pool.ntp.org", "time.google.com");
    }
  }
}
