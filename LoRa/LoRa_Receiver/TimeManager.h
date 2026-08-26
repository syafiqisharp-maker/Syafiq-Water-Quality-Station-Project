#ifndef TIME_MANAGER_H
#define TIME_MANAGER_H

#include "Config.h"
#include <Arduino.h>
#include <time.h>

class TimeManager {
public:
  TimeManager();

  // Initializes NTP time synchronization with GMT offset
  void begin();

  // Returns true if NTP has successfully synced time (year >= 2024)
  bool isTimeSynced();

  // Returns formatted timestamp string (YYYY-MM-DD HH:MM:SS) from ESP32 internal RTC
  String getFormattedTime();

  // Returns time-only string (HH:MM:SS) for 1602 LCD display
  String getTimeOnly();

  // Periodic update check to maintain NTP sync
  void update();

private:
  bool _synced;
  unsigned long _lastNTPSyncCheck;
};

#endif // TIME_MANAGER_H
