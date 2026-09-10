#ifndef TIME_MANAGER_H
#define TIME_MANAGER_H

#include <Arduino.h>
#include <time.h>
#include "Config.h"

class TimeManager {
public:
  TimeManager();
  void begin();
  void update();
  bool isSynced();
  String getFormattedTimestamp();

private:
  bool _synced;
  unsigned long _lastCheck;
};

#endif // TIME_MANAGER_H
