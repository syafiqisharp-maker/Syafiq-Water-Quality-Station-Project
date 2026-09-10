#include "DisplayManager.h"

DisplayManager::DisplayManager() {}

void DisplayManager::begin() {
  _screen.begin();
  _screen.setTextWrap(false);
}

void DisplayManager::showWaiting(bool wifiOk, bool ntpOk) {
  _screen.fillScreen(COLOR_RGB565_BLACK);
  _screen.setFont(&FreeMono9pt7b);
  _screen.setTextSize(1);
  _screen.setTextWrap(false);

  _screen.setTextColor(COLOR_RGB565_CYAN);
  _screen.setCursor(0, 20);
  _screen.print(F("FEED BARREL RX"));

  _screen.setTextColor(COLOR_RGB565_GREEN);
  _screen.setCursor(0, 42);
  _screen.print(F("Waiting LoRa.."));

  _screen.setTextColor(COLOR_RGB565_YELLOW);
  _screen.setCursor(0, 65);
  _screen.printf("WiFi: %s", wifiOk ? (ntpOk ? "OK+NTP" : "OK") : "Conn..");
}

void DisplayManager::showTelemetry(const String &pondId, const String &distCM, const String &batV,
                                   const String &pktNum, int16_t rssi, bool wifiOk, bool hasSpool) {
  _screen.fillScreen(COLOR_RGB565_BLACK);
  _screen.setFont(&FreeMono9pt7b);
  _screen.setTextSize(1);
  _screen.setTextWrap(false);

  // Row 1 (Cyan): Pond ID
  char line1[15];
  snprintf(line1, sizeof(line1), "POND %-.8s", pondId.c_str());
  _screen.setTextColor(COLOR_RGB565_CYAN);
  _screen.setCursor(0, 16);
  _screen.print(line1);

  // Row 2 (Green): Distance Reading
  char line2[15];
  if (distCM == "ERR") {
    snprintf(line2, sizeof(line2), "Dist: SENS ERR");
  } else {
    snprintf(line2, sizeof(line2), "Dist: %-.5s cm", distCM.c_str());
  }
  _screen.setTextColor(COLOR_RGB565_GREEN);
  _screen.setCursor(0, 36);
  _screen.print(line2);

  // Row 3 (Yellow): Battery & WiFi Status / Spool Flag
  char line3[15];
  const char *wifiStr = wifiOk ? (hasSpool ? "Sync" : "OK") : "Offline";
  if (batV != "---") {
    snprintf(line3, sizeof(line3), "%-.4sV WiFi:%s", batV.c_str(), wifiStr);
  } else {
    snprintf(line3, sizeof(line3), "Bat:--- WiFi:%s", wifiStr);
  }
  _screen.setTextColor(COLOR_RGB565_YELLOW);
  _screen.setCursor(0, 56);
  _screen.print(line3);

  // Row 4 (White): Signal Strength & Packet Number
  char line4[15];
  snprintf(line4, sizeof(line4), "%ddBm #%s", rssi, pktNum.c_str());
  _screen.setTextColor(COLOR_RGB565_WHITE);
  _screen.setCursor(0, 74);
  _screen.print(line4);
}
