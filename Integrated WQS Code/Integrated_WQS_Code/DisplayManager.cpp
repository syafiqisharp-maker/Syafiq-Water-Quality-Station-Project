#include "DisplayManager.h"
#include <stdarg.h>

// Constructor
DisplayManager::DisplayManager() : _lcd(LCD_I2C_ADDRESS, LCD_COLUMNS, LCD_ROWS) {
    // Clear line buffers to empty strings
    for (int i = 0; i < 4; i++) {
        _lineBuffers[i][0] = '\0';
    }
}

// Initialize the LCD display
void DisplayManager::begin() {
    _lcd.init();
    _lcd.backlight();
    clear();
}

// Clear the screen and reset buffers to empty spaces
void DisplayManager::clear() {
    _lcd.clear();
    for (int i = 0; i < 4; i++) {
        memset(_lineBuffers[i], ' ', 20);
        _lineBuffers[i][20] = '\0';
    }
}

// Render the normal monitoring screen
void DisplayManager::showNormalScreen(float doSat, float doConc, float temp, float ph, float turbidityPct, bool loraActive) {
    // Line 0: Dissolved Oxygen Saturation & Concentration
    if (doSat < 0.0 || isnan(doSat) || doConc < 0.0 || isnan(doConc)) {
        updateLine(0, "DO: --.-%% --.--mg/L");
    } else {
        updateLine(0, "DO: %.1f%% %.2fmg/L", doSat, doConc);
    }

    // Line 1: Temperature
    if (temp < -5.0 || temp > 50.0 || isnan(temp)) {
        updateLine(1, "Temp: --.- \xDF" "C");
    } else {
        updateLine(1, "Temp: %.1f \xDF" "C", temp);
    }

    // Line 2: pH value
    if (ph < 0.0 || ph > 14.0 || isnan(ph)) {
        updateLine(2, "pH:   --.--");
    } else {
        updateLine(2, "pH:   %.2f", ph);
    }

    // Line 3: Turbidity & LoRa status indicator
    char loraIcon = loraActive ? 'L' : ' ';
    if (turbidityPct < 0.0 || isnan(turbidityPct)) {
        updateLine(3, "Turb: --.- %%      %c", loraIcon);
    } else {
        updateLine(3, "Turb: %.1f %%      %c", turbidityPct, loraIcon);
    }
}

// Render the DO calibration screen with countdown
void DisplayManager::showDOCalibrationScreen(int countdownSeconds) {
    updateLine(0, "* DO CALIBRATING *  ");
    updateLine(1, "Place probe in air  ");
    if (countdownSeconds > 0) {
        updateLine(2, "Starting in %d s... ", countdownSeconds);
    } else {
        updateLine(2, "Calibrating now...  ");
    }
    updateLine(3, "       Syafiq       ");
}

// Render the pH calibration screen with raw voltage and status
void DisplayManager::showPHCalibrationScreen(float voltage, float temp, float currentPH, const char* statusMsg) {
    updateLine(0, "* pH CALIBRATION *  ");
    
    // Determine which buffer we are in based on standard DFRobot thresholds
    if (voltage > 1322 && voltage < 1678) {
        updateLine(1, "Buffer: 7.0 (%.0fmV)", voltage);
    } else if (voltage > 1854 && voltage < 2210) {
        updateLine(1, "Buffer: 4.0 (%.0fmV)", voltage);
    } else {
        updateLine(1, "Buffer: ??? (%.0fmV)", voltage);
    }

    updateLine(2, "pH: %.2f  T: %.1f\xDF" "C", currentPH, temp);
    
    if (statusMsg && strlen(statusMsg) > 0) {
        updateLine(3, "%s", statusMsg);
    } else {
        updateLine(3, "Btn:Cal | Hold:Exit ");
    }
}

// Render the Turbidity calibration screen
void DisplayManager::showTurbidityCalibrationScreen(float vClean, bool success) {
    updateLine(0, "* TURB CALIBRATION *");
    updateLine(1, "Place in clean water");
    if (success) {
        updateLine(2, "Ref: %.2fV Set!    ", vClean);
        updateLine(3, ">>> CAL SUCCESS <<<<");
    } else {
        updateLine(2, "Reading sensor...   ");
        updateLine(3, "                    ");
    }
}

// Helper to format, pad, and differentially write a line to the LCD
void DisplayManager::updateLine(int lineIndex, const char* format, ...) {
    if (lineIndex < 0 || lineIndex >= 4) return;

    char newBuffer[32]; // Extra space for formatting before truncation
    va_list args;
    va_start(args, format);
    vsnprintf(newBuffer, sizeof(newBuffer), format, args);
    va_end(args);

    // Replace the degree symbol formatting character if it was written as UTF-8
    // In Arduino, if a UTF-8 character is copied in a string, it maps to multiple bytes.
    // The standard compiler treats '\xDF' as 1 byte. We manually pad or replace if necessary.

    // Pad with spaces to exactly 20 characters
    int len = strlen(newBuffer);
    while (len < 20) {
        newBuffer[len++] = ' ';
    }
    newBuffer[20] = '\0'; // Truncate at exactly 20 characters

    // If the content is different from what is already on the screen, update it
    if (strcmp(_lineBuffers[lineIndex], newBuffer) != 0) {
        strcpy(_lineBuffers[lineIndex], newBuffer);
        _lcd.setCursor(0, lineIndex);
        _lcd.print(newBuffer);
    }
}
