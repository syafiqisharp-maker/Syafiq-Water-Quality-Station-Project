#include "DisplayManager.h"

DisplayManager::DisplayManager() : _lcd(LCD_I2C_ADDR, LCD_COLUMNS, LCD_ROWS) {
  _line1Buffer[0] = '\0';
  _line2Buffer[0] = '\0';
}

void DisplayManager::begin() {
  Wire.begin(LCD_SDA_PIN, LCD_SCL_PIN);
  Wire.setTimeOut(250);
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
                                const String &phVal, bool hasReceivedData,
                                unsigned long lastPacketTime) {
  if (!hasReceivedData) {
    showInitScreen("LoRa RX Ready   ", "Waiting data... ");
    return;
  }

  unsigned long currentMillis = millis();
  unsigned long secondsAgo = (currentMillis - lastPacketTime) / 1000U;

  // --- Line 1: DO Value + Live Seconds Ticker ---
  // Format: "DO:6.50mg/L   0s"
  String line1 = "DO:" + doVal + "mg/L";

  char tag[6];
  if (secondsAgo > 999) {
    snprintf(tag, sizeof(tag), " STAL");
  } else {
    snprintf(tag, sizeof(tag), "%4lus", secondsAgo); // e.g. "   0s", "  15s", " 120s"
  }

  // Pad middle with spaces to fit 16 characters exactly
  int spaceNeeded = LCD_COLUMNS - line1.length() - strlen(tag);
  while (spaceNeeded > 0) {
    line1 += " ";
    spaceNeeded--;
  }
  line1 += String(tag);
  if (line1.length() > LCD_COLUMNS) {
    line1 = line1.substring(0, LCD_COLUMNS);
  }

  // --- Line 2: Temperature + pH ---
  // Format: "T:28.4C pH:7.20 "
  String line2 = "T:" + tempVal + "C pH:" + phVal;
  while (line2.length() < LCD_COLUMNS) {
    line2 += " ";
  }
  if (line2.length() > LCD_COLUMNS) {
    line2 = line2.substring(0, LCD_COLUMNS);
  }

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
