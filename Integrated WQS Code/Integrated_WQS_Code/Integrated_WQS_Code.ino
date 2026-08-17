/*
  Integrated Water Quality Station (WQS)

  This sketch integrates three sensors on a 44-pin ESP32-S3 (N16R8):
  1. DFRobot RS485 Fluorescence Dissolved Oxygen (DO) Sensor (SEN0681)
  2. Gravity Analog pH Sensor V2
  3. Analog Turbidity Sensor
  It outputs data to an LCD Model 2004A-V1.3 (20x4 Character I2C LCD) and
  supports LoRa Ra-02 (433MHz) telemetry transmission.

  Architecture:
  - Config.h             : General definitions, pin mappings, WQSData struct, timing.
  - DOSensor.h/.cpp      : RS485 Modbus RTU communication wrapper for DO sensor.
  - PHSensor.h/.cpp      : Gravity Analog pH sensor wrapper with temp comp & validation.
  - TurbiditySensor.h/.cpp: Analog turbidity sensor wrapper with NVS calibration & validation.
  - DisplayManager.h/.cpp: Anti-flicker character LCD layout & refresh manager.
  - ButtonHandler.h/.cpp : Debouncing and short/long press detection wrapper.
  - LoRaTransmitter.h/.cpp: SX1278 SPI LoRa transmitter with auto-reconnect.
*/

#include "ButtonHandler.h"
#include "Config.h"
#include "DOSensor.h"
#include "DisplayManager.h"
#include "LoRaTransmitter.h"
#include "PHSensor.h"
#include "TurbiditySensor.h"
#include <Arduino.h>
#include <Wire.h>

// ==========================================
// SYSTEM STATE ENUMS & VARIABLES
// ==========================================
enum SystemMode {
  MODE_NORMAL,
  MODE_DO_CALIBRATION,
  MODE_PH_CALIBRATION,
  MODE_TURBIDITY_CAL
};

SystemMode currentMode = MODE_NORMAL;
WQSData currentData;

// --- Buttons ---
ButtonHandler doButton(BUTTON_DO_PIN);
ButtonHandler phButton(BUTTON_PH_PIN);

// Timers for non-blocking task execution
unsigned long lastPollTime = 0;
unsigned long lastDisplayRefreshTime = 0;

// DO Calibration Countdown & Hold Timer
unsigned long lastCountdownMillis = 0;
int doCalCountdown = 5;
bool doCalExecuted = false;
unsigned long doCalFinishTime = 0;

// Turbidity Calibration Hold Timer
bool turbCalExecuted = false;
unsigned long turbCalFinishTime = 0;

// pH Calibration Status Message
String phCalStatusMsg = "Btn:Cal | Hold:Exit";
unsigned long phCalStatusMsgTimer = 0;

// ==========================================
// OBJECT INSTANTIATIONS
// ==========================================
DOSensor doSensor(Serial2, DO_RX_PIN, DO_TX_PIN, RS485_RE_DE_PIN);
PHSensor phSensor(PH_PIN);
TurbiditySensor turbiditySensor(TURBIDITY_PIN);
DisplayManager displayManager;
LoRaTransmitter loraTransmitter;

// ==========================================
// FUNCTION PROTOTYPES
// ==========================================
void checkSerialCommands();
void checkButtons();

// Event Handlers
void startDOCalibration();
void startTurbidityCalibration();
void enterPHCalibration();
void executePHCalibration();
void exitPHCalibration();
void forwardPHCommand(const String &cmd);

// State Handlers
void handleNormalMode(unsigned long currentMillis);
void handleDOCalibrationMode(unsigned long currentMillis);
void handleTurbidityCalibrationMode(unsigned long currentMillis);
void handlePHCalibrationMode(unsigned long currentMillis);

// ==========================================
// SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  unsigned long serialStart = millis();
  while (!Serial && (millis() - serialStart < 2000)) {
    delay(10);
  }
  delay(500);

  Serial.println(
      F("\n========================================================"));
  Serial.println(F("Integrated Water Quality Station (WQS) - Initializing..."));
  Serial.println(F("========================================================"));

  // Initialize I2C Bus for the LCD with explicit timeout protection
  Wire.begin(LCD_SDA_PIN, LCD_SCL_PIN);
  Wire.setTimeOut(250);

  // Initialize Buttons
  doButton.begin();
  phButton.begin();

  // Initialize sensor modules & LoRa Transmitter
  doSensor.begin();
  phSensor.begin();
  displayManager.begin();
  turbiditySensor.begin();
  loraTransmitter.begin();

  Serial.println(F("-> I2C LCD Display: Initialized OK"));
  Serial.println(F("-> DO Sensor (RS485 Serial2): Initialized OK"));
  Serial.printf("-> pH Sensor (GPIO %d): Initialized OK\n", PH_PIN);
  Serial.printf("-> Turbidity Sensor (GPIO %d): Initialized OK\n",
                TURBIDITY_PIN);
  Serial.println(F("--------------------------------------------------------"));
  Serial.println(F("System Ready. Polling sensors every 5 seconds."));
  Serial.println(
      F("Commands: 'CAL100' (DO cal), 'enterph', 'calph', 'exitph' (pH cal)."));
  Serial.println(
      F("========================================================\n"));

  // Perform initial readings immediately
  doSensor.query();
  currentData.doValid = doSensor.isDataValid();
  currentData.doSat = currentData.doValid ? doSensor.getSaturation() : NAN;
  currentData.doConc = currentData.doValid ? doSensor.getConcentration() : NAN;
  currentData.temp = currentData.doValid ? doSensor.getTemperature() : 29.0f;

  phSensor.update(currentData.temp);
  currentData.phValid = phSensor.isDataValid();
  currentData.ph = phSensor.getPH();

  currentData.turbidityValid = turbiditySensor.isDataValid();
  currentData.turbidity = turbiditySensor.getTurbidityPct();

  // Initial display refresh
  displayManager.showNormalScreen(currentData, loraTransmitter.isInitialized());

  lastPollTime = millis();
  lastDisplayRefreshTime = millis();
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
  unsigned long currentMillis = millis();

  // 1. Maintain background tasks
  loraTransmitter.maintain(currentMillis);
  checkSerialCommands();
  checkButtons();

  // 2. State Machine Router
  switch (currentMode) {
  case MODE_NORMAL:
    handleNormalMode(currentMillis);
    break;
  case MODE_DO_CALIBRATION:
    handleDOCalibrationMode(currentMillis);
    break;
  case MODE_TURBIDITY_CAL:
    handleTurbidityCalibrationMode(currentMillis);
    break;
  case MODE_PH_CALIBRATION:
    handlePHCalibrationMode(currentMillis);
    break;
  }
}

// ==========================================
// STATE HANDLERS
// ==========================================
void handleNormalMode(unsigned long currentMillis) {
  // 1. Poll Sensors & Transmit LoRa
  if (currentMillis - lastPollTime >= POLL_INTERVAL_MS) {
    lastPollTime = currentMillis;

    doSensor.query();
    currentData.doValid = doSensor.isDataValid();
    currentData.doSat = currentData.doValid ? doSensor.getSaturation() : NAN;
    currentData.doConc = currentData.doValid ? doSensor.getConcentration() : NAN;
    currentData.temp = currentData.doValid ? doSensor.getTemperature() : 29.0f;

    phSensor.update(currentData.temp);
    currentData.phValid = phSensor.isDataValid();
    currentData.ph = phSensor.getPH();

    currentData.turbidityValid = turbiditySensor.isDataValid();
    currentData.turbidity = turbiditySensor.getTurbidityPct();

    Serial.print(F("Turbidity: "));
    Serial.print(currentData.turbidity, 1);
    Serial.println(F(" %"));

    // Send sensor values via LoRa Ra-02 (non-blocking)
    loraTransmitter.sendData(currentData);
  }

  // 2. Refresh Display
  if (currentMillis - lastDisplayRefreshTime >= DISPLAY_REFRESH_MS) {
    lastDisplayRefreshTime = currentMillis;
    displayManager.showNormalScreen(currentData, loraTransmitter.isInitialized());
  }
}

void handleDOCalibrationMode(unsigned long currentMillis) {
  if (!doCalExecuted) {
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
          Serial.println(F(
              "\n>>> SUCCESS: 100% Calibration Command SENT successfully! <<<"));
          Serial.println(
              F("Sensor is storing parameters. Returning to normal mode."));
        } else {
          Serial.println(F(
              "\n>>> ERROR: Calibration Command FAILED! Check connections. <<<"));
        }
        Serial.println(
            F("========================================================\n"));

        doCalExecuted = true;
        doCalFinishTime = currentMillis;
      }
    }
  } else {
    // Non-blocking 3-second result display hold
    if (currentMillis - doCalFinishTime >= 3000U) {
      displayManager.clear();
      currentMode = MODE_NORMAL;
      lastPollTime = millis();
    }
  }
}

void handleTurbidityCalibrationMode(unsigned long currentMillis) {
  if (!turbCalExecuted) {
    displayManager.showTurbidityCalibrationScreen(turbiditySensor.getVClean(),
                                                  false);
    Serial.println(F("Turbidity Calibration: Reading sensor..."));

    turbiditySensor.calibrateCleanWater();

    Serial.print(F("New Turbidity Ref (vClean) Set to: "));
    Serial.print(turbiditySensor.getVClean());
    Serial.println(F(" V"));

    displayManager.showTurbidityCalibrationScreen(turbiditySensor.getVClean(),
                                                  true);
    turbCalExecuted = true;
    turbCalFinishTime = currentMillis;
  } else {
    // Non-blocking 3-second result display hold
    if (currentMillis - turbCalFinishTime >= 3000U) {
      displayManager.clear();
      currentMode = MODE_NORMAL;
      lastPollTime = millis();
    }
  }
}

void handlePHCalibrationMode(unsigned long currentMillis) {
  // 1. Fast Poll (1s)
  if (currentMillis - lastPollTime >= 1000U) {
    lastPollTime = currentMillis;

    float currentTemp =
        doSensor.isDataValid() ? doSensor.getTemperature() : 29.0f;
    phSensor.update(currentTemp);
  }

  // 2. Refresh Display
  if (currentMillis - lastDisplayRefreshTime >= DISPLAY_REFRESH_MS) {
    lastDisplayRefreshTime = currentMillis;

    if (millis() - phCalStatusMsgTimer > 3000) {
      phCalStatusMsg = "Btn:Cal | Hold:Exit";
    }
    float tempVal = doSensor.isDataValid() ? doSensor.getTemperature() : 29.0f;
    displayManager.showPHCalibrationScreen(phSensor.getVoltage(), tempVal,
                                           phSensor.getPH(),
                                           phCalStatusMsg.c_str());
  }
}

// ==========================================
// SERIAL MONITOR & BUTTON INTERACTION HANDLERS
// ==========================================
void checkButtons() {
  doButton.update();
  phButton.update();

  // --- DO / Turbidity Button ---
  if (doButton.isLongPressed()) {
    if (currentMode == MODE_NORMAL) {
      startTurbidityCalibration();
    }
  } else if (doButton.isShortPressed()) {
    if (currentMode == MODE_NORMAL) {
      startDOCalibration();
    }
  }

  // --- pH Button ---
  if (phButton.isLongPressed()) {
    if (currentMode == MODE_PH_CALIBRATION) {
      exitPHCalibration();
    }
  } else if (phButton.isShortPressed()) {
    if (currentMode == MODE_NORMAL) {
      enterPHCalibration();
    } else if (currentMode == MODE_PH_CALIBRATION) {
      executePHCalibration();
    }
  }
}

void checkSerialCommands() {
  static String inputBuffer = "";
  while (Serial.available() > 0) {
    char ch = Serial.read();
    if (ch == '\n' || ch == '\r') {
      if (inputBuffer.length() > 0) {
        inputBuffer.trim();

        if (currentMode == MODE_NORMAL) {
          if (inputBuffer.equalsIgnoreCase("CAL100"))
            startDOCalibration();
          else if (inputBuffer.equalsIgnoreCase("ENTERPH"))
            enterPHCalibration();
          else {
            Serial.print(F("Unknown command: "));
            Serial.println(inputBuffer);
          }
        } else if (currentMode == MODE_PH_CALIBRATION) {
          if (inputBuffer.equalsIgnoreCase("CALPH"))
            executePHCalibration();
          else if (inputBuffer.equalsIgnoreCase("EXITPH"))
            exitPHCalibration();
          else
            forwardPHCommand(inputBuffer);
        } else if (currentMode == MODE_DO_CALIBRATION) {
          Serial.println(F("Please wait. DO calibration is in progress."));
        }

        inputBuffer = "";
      }
    } else {
      if (inputBuffer.length() < 32) {
        inputBuffer += ch;
      }
    }
  }
}

// ==========================================
// EVENT ACTIONS
// ==========================================
void startDOCalibration() {
  currentMode = MODE_DO_CALIBRATION;
  doCalCountdown = 5;
  doCalExecuted = false;
  lastCountdownMillis = millis();
  Serial.println(
      F("\n========================================================"));
  Serial.println(F("WARNING: Starting 100% Atmospheric Calibration."));
  Serial.println(F(
      "Ensure probe is in water-saturated air (e.g. above water surface)..."));
  Serial.println(F("========================================================"));
  displayManager.showDOCalibrationScreen(doCalCountdown);
}

void startTurbidityCalibration() {
  currentMode = MODE_TURBIDITY_CAL;
  turbCalExecuted = false;
}

void enterPHCalibration() {
  currentMode = MODE_PH_CALIBRATION;
  float currentTemp = doSensor.isDataValid() ? doSensor.getTemperature() : 29.0f;
  phSensor.sendCalibrationCommand(currentTemp, "enterph");
  phCalStatusMsg = "Btn:Cal | Hold:Exit";
  phCalStatusMsgTimer = 0;
  Serial.println(
      F("Entered pH calibration mode. Solution temperature is compensated."));
}

void executePHCalibration() {
  float currentTemp = doSensor.isDataValid() ? doSensor.getTemperature() : 29.0f;
  phSensor.sendCalibrationCommand(currentTemp, "calph");
  phCalStatusMsg = ">>> Calibrated! <<<";
  phCalStatusMsgTimer = millis();
  Serial.println(F("Executed pH calibration for current buffer solution."));
}

void exitPHCalibration() {
  float currentTemp = doSensor.isDataValid() ? doSensor.getTemperature() : 29.0f;
  phSensor.sendCalibrationCommand(currentTemp, "exitph");
  currentMode = MODE_NORMAL;
  displayManager.clear();
  Serial.println(F("Exited pH calibration mode. Settings saved to NVS."));
  lastPollTime = millis();
}

void forwardPHCommand(const String &cmd) {
  float currentTemp = doSensor.isDataValid() ? doSensor.getTemperature() : 29.0f;
  Serial.print(F("Forwarding custom calibration command to pH: "));
  Serial.println(cmd);
  phSensor.sendCalibrationCommand(currentTemp, cmd.c_str());
}
