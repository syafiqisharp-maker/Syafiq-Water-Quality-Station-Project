#ifndef DISPLAY_MANAGER_H
#define DISPLAY_MANAGER_H

#include "Config.h"
#include <Arduino.h>
#include <LiquidCrystal_I2C.h>

class DisplayManager {
public:
  DisplayManager();

  // Initializes LiquidCrystal_I2C display
  void begin();

  // Renders startup initialization screen
  void showInitScreen(const char *msg1, const char *msg2);

  // Renders live screen with DO, Temperature, pH, and live seconds ticker
  void renderLCD(const String &doVal, const String &tempVal, const String &phVal,
                 bool hasReceivedData, unsigned long lastPacketTime);

private:
  LiquidCrystal_I2C _lcd;
  char _line1Buffer[LCD_COLUMNS + 1];
  char _line2Buffer[LCD_COLUMNS + 1];

  void updateLine(int row, char *buffer, const String &newText);
};

#endif // DISPLAY_MANAGER_H
