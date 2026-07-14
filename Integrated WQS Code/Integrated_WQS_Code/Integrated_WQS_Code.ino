/*
  Integrated Water Quality Station (WQS)

  This sketch integrates the DFRobot RS485 Fluorescence Dissolved Oxygen (DO)
  Sensor (SEN0681) and the Gravity Analog pH Sensor V2 on a 30-pin ESP32. It
  outputs data to an LCD Model 2004A-V1.3 (20x4 Character I2C LCD).

  Architecture:
  - Config.h         : General definitions, pin mappings, timing.
  - DOSensor.h/.cpp   : RS485 Modbus RTU communication wrapper for DO sensor.
  - PHSensor.h/.cpp   : Gravity Analog pH sensor wrapper with temperature
  compensation.
  - DisplayManager.h/.cpp: Anti-flicker character LCD layout and refresh
  manager.

  Wiring Connection for 30-pin ESP32:
  - RS485-to-TTL Converter (for DO Sensor):
      * TXD / RO (Receive Out) -> ESP32 RX2 (GPIO 16)
      * RXD / DI (Driver In)   -> ESP32 TX2 (GPIO 17)
      * GND                    -> ESP32 GND
      * VCC                    -> ESP32 5V (or external 5V)
  - Analog pH Sensor:
      * Analog Signal (A)      -> ESP32 GPIO 35 (ADC1_CH7)
      * VCC (V)                -> ESP32 5V (or 3.3V, check sensor version)
      * GND (G)                -> ESP32 GND
  - I2C LCD Display (2004A with PCF8574 Backpack):
      * SDA                    -> ESP32 GPIO 21
      * SCL                    -> ESP32 GPIO 22
      * VCC                    -> ESP32 5V
      * GND                    -> ESP32 GND

  Serial Commands:
  - CAL100  -> Enters DO atmospheric 100% calibration countdown (5s countdown).
  - enterph -> Enters pH calibration mode (solution temperature is automatically
  compensated).
  - calph   -> Calibrates current pH buffer solution (auto-detects pH 4.0 or 7.0
  standard buffer).
  - exitph  -> Saves pH calibration parameters to NVS flash and returns to
  normal monitoring.
*/

#include "Config.h"
#include "DOSensor.h"
#include "DisplayManager.h"
#include "PHSensor.h"
#include <Arduino.h>
#include <Wire.h>

// ==========================================
// SYSTEM STATE ENUMS & VARIABLES
// ==========================================
enum SystemMode { MODE_NORMAL, MODE_DO_CALIBRATION, MODE_PH_CALIBRATION };

SystemMode currentMode = MODE_NORMAL;

// --- Button Settings ---
#define BUTTON_DO_PIN 12
#define BUTTON_PH_PIN 13

bool lastButtonDoState = HIGH;
unsigned long lastDebounceDoTime = 0;

bool lastButtonPhState = HIGH;
unsigned long buttonPhPressTime = 0;
bool buttonPhLongPressHandled = false;

const unsigned long DEBOUNCE_DELAY = 50;
const unsigned long LONG_PRESS_DELAY = 2000;

// Timers for non-blocking task execution
unsigned long lastPollTime = 0;
unsigned long lastDisplayRefreshTime = 0;

// DO Calibration Countdown Variables
unsigned long lastCountdownMillis = 0;
int doCalCountdown = 5;

// pH Calibration Status Message
String phCalStatusMsg = "Btn:Cal | Hold:Exit";
unsigned long phCalStatusMsgTimer = 0;

// ==========================================
// OBJECT INSTANTIATIONS
// ==========================================
// Using ESP32 HardwareSerial Serial2
DOSensor doSensor(Serial2, DO_RX_PIN, DO_TX_PIN, RS485_RE_DE_PIN);
PHSensor phSensor(PH_PIN);
DisplayManager displayManager;

// ==========================================
// FUNCTION PROTOTYPES
// ==========================================
void checkSerialCommands();
void processCommand(const String &cmd);
void checkButtons();

// ==========================================
// SETUP
// ==========================================
void setup() {
  // Start standard Serial for PC interface
  Serial.begin(115200);
  delay(500);

  Serial.println(
      F("\n========================================================"));
  Serial.println(F("Integrated Water Quality Station (WQS) - Initializing..."));
  Serial.println(F("========================================================"));

  // Initialize I2C Bus for the LCD
  Wire.begin();

  // Initialize Buttons
  pinMode(BUTTON_DO_PIN, INPUT_PULLUP);
  pinMode(BUTTON_PH_PIN, INPUT_PULLUP);

  // Initialize sensor modules
  doSensor.begin();
  phSensor.begin();
  displayManager.begin();

  Serial.println(F("-> I2C LCD Display: Initialized OK"));
  Serial.println(F("-> DO Sensor (RS485 Serial2): Initialized OK"));
  Serial.println(F("-> pH Sensor (GPIO 35): Initialized OK"));
  Serial.println(F("--------------------------------------------------------"));
  Serial.println(F("System Ready. Polling sensors every 5 seconds."));
  Serial.println(
      F("Commands: 'CAL100' (DO cal), 'enterph', 'calph', 'exitph' (pH cal)."));
  Serial.println(
      F("========================================================\n"));

  // Perform initial readings immediately
  doSensor.query();
  float initTemp = doSensor.isDataValid() ? doSensor.getTemperature() : 25.0;
  phSensor.update(initTemp);

  // Initial display refresh
  displayManager.showNormalScreen(
      doSensor.isDataValid() ? doSensor.getSaturation() : NAN,
      doSensor.isDataValid() ? doSensor.getConcentration() : NAN,
      doSensor.isDataValid() ? doSensor.getTemperature() : NAN,
      phSensor.getPH());

  lastPollTime = millis();
  lastDisplayRefreshTime = millis();
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
  // 1. Process incoming Serial monitor commands and Button presses
  checkSerialCommands();
  checkButtons();

  unsigned long currentMillis = millis();

  // 2. Poll Sensors (Non-blocking)
  // In pH calibration mode, we poll the pH sensor faster (every 1s) for
  // real-time pots adjustment. In normal mode, we poll both sensors every 5
  // seconds.
  unsigned long activePollInterval =
      (currentMode == MODE_PH_CALIBRATION) ? 1000U : POLL_INTERVAL_MS;

  if (currentMillis - lastPollTime >= activePollInterval) {
    lastPollTime = currentMillis;

    // Query DO Sensor (Skip during pH calibration to maximize serial/I2C speed
    // and avoid noise)
    if (currentMode != MODE_PH_CALIBRATION) {
      doSensor.query();
    }

    // Query pH Sensor with temperature compensation
    float currentTemp =
        doSensor.isDataValid() ? doSensor.getTemperature() : 25.0;
    phSensor.update(currentTemp);
  }

  // 3. Handle DO Calibration State Machine (Non-blocking countdown)
  if (currentMode == MODE_DO_CALIBRATION) {
    if (currentMillis - lastCountdownMillis >= 1000U) {
      lastCountdownMillis = currentMillis;

      if (doCalCountdown > 0) {
        Serial.print(F("DO Calibration starting in "));
        Serial.print(doCalCountdown);
        Serial.println(F(" seconds..."));
        displayManager.showDOCalibrationScreen(doCalCountdown);
        doCalCountdown--;
      } else {
        Serial.println(
            F("Sending 100% calibration command to DO sensor via Modbus..."));
        displayManager.showDOCalibrationScreen(0);

        bool success = doSensor.sendCalibrationCommand();
        if (success) {
          Serial.println(F("\n>>> SUCCESS: 100% Calibration Command SENT "
                           "successfully! <<<"));
          Serial.println(
              F("Sensor is storing parameters. Returning to normal mode."));
        } else {
          Serial.println(F("\n>>> ERROR: Calibration Command FAILED! Check "
                           "connections. <<<"));
        }
        Serial.println(
            F("========================================================\n"));

        // Keep the success/fail result on screen for 3 seconds, then return to
        // normal monitoring
        delay(3000);
        displayManager.clear();
        currentMode = MODE_NORMAL;
        lastPollTime = millis(); // Reset poll timer
      }
    }
  }

  // 4. Update the LCD Display (Every 1 second)
  if (currentMillis - lastDisplayRefreshTime >= DISPLAY_REFRESH_MS) {
    lastDisplayRefreshTime = currentMillis;

    if (currentMode == MODE_NORMAL) {
      float tempVal = doSensor.isDataValid() ? doSensor.getTemperature() : NAN;
      float satVal = doSensor.isDataValid() ? doSensor.getSaturation() : NAN;
      float concVal =
          doSensor.isDataValid() ? doSensor.getConcentration() : NAN;
      displayManager.showNormalScreen(satVal, concVal, tempVal,
                                      phSensor.getPH());
    } else if (currentMode == MODE_PH_CALIBRATION) {
      if (millis() - phCalStatusMsgTimer > 3000) {
        phCalStatusMsg = "Btn:Cal | Hold:Exit";
      }
      float tempVal = doSensor.isDataValid() ? doSensor.getTemperature() : 25.0;
      displayManager.showPHCalibrationScreen(phSensor.getVoltage(), tempVal,
                                             phSensor.getPH(),
                                             phCalStatusMsg.c_str());
    }
  }
}

// ==========================================
// SERIAL MONITOR & BUTTON INTERACTION HANDLERS
// ==========================================
void checkButtons() {
  unsigned long currentMillis = millis();

  // --- Button 1: DO Calibration (Short Press) ---
  int readingDo = digitalRead(BUTTON_DO_PIN);
  if (readingDo != lastButtonDoState) {
    lastDebounceDoTime = currentMillis;
  }

  if ((currentMillis - lastDebounceDoTime) > DEBOUNCE_DELAY) {
    static int buttonDoState = HIGH;
    if (readingDo != buttonDoState) {
      buttonDoState = readingDo;
      if (buttonDoState == LOW) {
        // DO Button Pressed (Falling edge)
        if (currentMode == MODE_NORMAL) {
          processCommand("CAL100");
        }
      }
    }
  }
  lastButtonDoState = readingDo;

  // --- Button 2: pH Calibration (Short/Long Press) ---
  int readingPh = digitalRead(BUTTON_PH_PIN);

  if (readingPh == LOW && lastButtonPhState == HIGH) {
    // pH Button pressed down (Falling edge)
    buttonPhPressTime = currentMillis;
    buttonPhLongPressHandled = false;
  }

  if (readingPh == LOW && !buttonPhLongPressHandled) {
    // Check for long press while held down
    if ((currentMillis - buttonPhPressTime) >= LONG_PRESS_DELAY) {
      buttonPhLongPressHandled = true;
      if (currentMode == MODE_PH_CALIBRATION) {
        processCommand("EXITPH");
      }
    }
  }

  if (readingPh == HIGH && lastButtonPhState == LOW) {
    // pH Button released (Rising edge)
    if (!buttonPhLongPressHandled &&
        (currentMillis - buttonPhPressTime) > DEBOUNCE_DELAY) {
      // It was a short press
      if (currentMode == MODE_NORMAL) {
        processCommand("ENTERPH");
      } else if (currentMode == MODE_PH_CALIBRATION) {
        processCommand("CALPH");
      }
    }
  }

  lastButtonPhState = readingPh;
}

void checkSerialCommands() {
  static String inputBuffer = "";
  while (Serial.available() > 0) {
    char ch = Serial.read();
    if (ch == '\n' || ch == '\r') {
      if (inputBuffer.length() > 0) {
        inputBuffer.trim();
        processCommand(inputBuffer);
        inputBuffer = "";
      }
    } else {
      if (inputBuffer.length() < 32) {
        inputBuffer += ch;
      }
    }
  }
}

void processCommand(const String &cmd) {
  float currentTemp = doSensor.isDataValid() ? doSensor.getTemperature() : 25.0;

  if (currentMode == MODE_NORMAL) {
    if (cmd.equalsIgnoreCase("CAL100")) {
      currentMode = MODE_DO_CALIBRATION;
      doCalCountdown = 5;
      lastCountdownMillis = millis();
      Serial.println(
          F("\n========================================================"));
      Serial.println(F("WARNING: Starting 100% Atmospheric Calibration."));
      Serial.println(F("Ensure probe is in water-saturated air (e.g. above "
                       "water surface)..."));
      Serial.println(
          F("========================================================"));
      displayManager.showDOCalibrationScreen(doCalCountdown);
    } else if (cmd.equalsIgnoreCase("ENTERPH")) {
      currentMode = MODE_PH_CALIBRATION;
      phSensor.sendCalibrationCommand(currentTemp, "enterph");
      phCalStatusMsg = "Btn:Cal | Hold:Exit";
      phCalStatusMsgTimer = 0;
      Serial.println(F(
          "Entered pH calibration mode. Solution temperature is compensated."));
    } else {
      Serial.print(F("Unknown command: "));
      Serial.println(cmd);
    }
  } else if (currentMode == MODE_PH_CALIBRATION) {
    if (cmd.equalsIgnoreCase("CALPH")) {
      phSensor.sendCalibrationCommand(currentTemp, "calph");
      phCalStatusMsg = ">>> Calibrated! <<<";
      phCalStatusMsgTimer = millis();
      Serial.println(F("Executed pH calibration for current buffer solution."));
    } else if (cmd.equalsIgnoreCase("EXITPH")) {
      phSensor.sendCalibrationCommand(currentTemp, "exitph");
      currentMode = MODE_NORMAL;
      displayManager.clear();
      Serial.println(F("Exited pH calibration mode. Settings saved to NVS."));
      lastPollTime = millis();
    } else {
      Serial.print(F("Forwarding custom calibration command to pH: "));
      Serial.println(cmd);
      phSensor.sendCalibrationCommand(currentTemp, cmd.c_str());
    }
  } else if (currentMode == MODE_DO_CALIBRATION) {
    Serial.println(F("Please wait. DO calibration is in progress."));
  }
}
