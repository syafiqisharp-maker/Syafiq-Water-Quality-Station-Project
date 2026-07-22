#ifndef DISPLAY_MANAGER_H
#define DISPLAY_MANAGER_H

#include <Arduino.h>
#include <LiquidCrystal_I2C.h>
#include "Config.h"

class DisplayManager {
public:
    // Constructor initializes LiquidCrystal_I2C with parameters from Config.h
    DisplayManager();

    // Initialize the LCD display (begin I2C communication, turn on backlight, clear screen)
    void begin();

    // Render the normal monitoring screen
    void showNormalScreen(float doSat, float doConc, float temp, float ph, float turbidityPct, bool wifiConnected = false);

    // Render the DO calibration screen with countdown
    void showDOCalibrationScreen(int countdownSeconds);

    // Render the pH calibration screen with raw voltage and status
    void showPHCalibrationScreen(float voltage, float temp, float currentPH, const char* statusMsg = nullptr);

    // Render the Turbidity calibration screen
    void showTurbidityCalibrationScreen(float vClean, bool success = false);

    // Completely clear the LCD and reset the internal line buffers
    void clear();

private:
    LiquidCrystal_I2C _lcd;
    char _lineBuffers[4][21]; // Stores the current printed state of the 4 lines (20 chars + null terminator)

    // Formats a line, pads it with spaces to 20 characters, and writes it to the LCD if it changed
    void updateLine(int lineIndex, const char* format, ...);
};

#endif // DISPLAY_MANAGER_H
