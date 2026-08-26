#include "DisplayManager.h"

DisplayManager::DisplayManager() : _lcd(LCD_I2C_ADDR, LCD_COLUMNS, LCD_ROWS) {
  _line1Buffer[0] = '\0';
  _line2Buffer[0] = '\0';
}

void DisplayManager::begin() {
  Wire.begin(LCD_SDA_PIN, LCD_SCL_PIN);
  Wire.setTimeOut(50); // Fast 50ms timeout prevents loop stalling on wiring issues
  _lcd.init();
  _lcd.backlight();
  _lcd.clear();
}

void DisplayManager::showInitScreen(const char *msg1, const char *msg2) {
  _lcd.clear();
  _lcd.setCursor(0, 0);
  _lcd.print(msg1);
  _lcd.setCursor(0, 1);
  _lcd.print(msg2);
}

void DisplayManager::renderLCD(const String &doVal, const String &tempVal,
                               const String &phVal, const String &timeStr,
                               bool hasReceivedData) {
  if (!hasReceivedData) {
    showInitScreen("LoRa RX Ready   ", "Waiting data... ");
    return;
  }

  // Clean and prepare values
  String doClean = (doVal == "N/A" || doVal.length() == 0) ? "--" : doVal;
  String phClean = (phVal == "N/A" || phVal.length() == 0) ? "--" : phVal;
  String tempClean = (tempVal == "N/A" || tempVal.length() == 0) ? "--" : tempVal;
  String timeClean = (timeStr == "N/A" || timeStr.length() == 0) ? "--:--:--" : timeStr;

  char line1[LCD_COLUMNS + 1];
  char line2[LCD_COLUMNS + 1];

  // Line 1 Target (16 chars): "DO:6.85  pH:7.45"
  snprintf(line1, sizeof(line1), "DO:%-4.4s  pH:%-4.4s", doClean.c_str(), phClean.c_str());

  // Line 2 Target (16 chars): "T:28.5C 11:45:02"
  snprintf(line2, sizeof(line2), "T:%-4.4sC %-8.8s", tempClean.c_str(), timeClean.c_str());

  // Differential anti-flicker line updates
  updateLine(0, _line1Buffer, line1);
  updateLine(1, _line2Buffer, line2);
}

void DisplayManager::updateLine(int row, char *buffer, const String &newText) {
  if (strcmp(buffer, newText.c_str()) != 0) {
    strncpy(buffer, newText.c_str(), LCD_COLUMNS);
    buffer[LCD_COLUMNS] = '\0';
    _lcd.setCursor(0, row);
    _lcd.print(buffer);
  }
}
