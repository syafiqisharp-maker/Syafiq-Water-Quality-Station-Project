#ifndef DISPLAY_MANAGER_H
#define DISPLAY_MANAGER_H

#include <Arduino.h>
#include "DFRobot_LoRaRadio.h"

class DisplayManager {
public:
  DisplayManager();
  void begin();
  void showWaiting(bool wifiOk, bool ntpOk);
  void showTelemetry(const String &pondId, const String &distCM, const String &batV,
                     const String &pktNum, int16_t rssi, bool wifiOk, bool hasSpool);

private:
  LCD_OnBoard _screen;
};

#endif // DISPLAY_MANAGER_H
