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
  // Target format (16 chars): "DO:6.85mg/L   0s" or "DO:6.85mg/L 305s"
  String doUnit = (doVal.length() <= 4) ? "mg/L" : "mg";
  String leftPart = "DO:" + doVal + doUnit;

  char tag[6];
  if (secondsAgo > 9999) {
    snprintf(tag, sizeof(tag), " STAL");
  } else if (secondsAgo > 999) {
    snprintf(tag, sizeof(tag), "%4lum", secondsAgo / 60); // e.g. "  16m"
  } else {
    snprintf(tag, sizeof(tag), "%4lus", secondsAgo); // e.g. "   0s", "  15s", " 305s"
  }

  int tagLen = strlen(tag);
  int maxLeftLen = LCD_COLUMNS - tagLen;
  if ((int)leftPart.length() > maxLeftLen) {
    leftPart = leftPart.substring(0, maxLeftLen);
  }
  while ((int)leftPart.length() < maxLeftLen) {
    leftPart += " ";
  }
  String line1 = leftPart + String(tag);

  // --- Line 2: Temperature + pH ---
  // Target format (16 chars): "T:28.5C  pH:7.45"
  String line2 = "T:" + tempVal + "C  pH:" + phVal;
  while ((int)line2.length() < LCD_COLUMNS) {
    line2 += " ";
  }
  if ((int)line2.length() > LCD_COLUMNS) {
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
