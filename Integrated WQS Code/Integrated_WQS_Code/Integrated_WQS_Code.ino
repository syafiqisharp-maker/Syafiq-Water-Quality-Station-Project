/*
  Integrated Water Quality Station (WQS)

  This sketch integrates three sensors on a 44-pin ESP32-S3 (N16R8):
  1. DFRobot RS485 Fluorescence Dissolved Oxygen (DO) Sensor (SEN0681, Slave ID 0x01)
  2. DFRobot RS485 Modbus pH Sensor (SEN0708, Slave ID 0x02)
  3. Analog Turbidity Sensor
  It outputs data to an LCD Model 2004A-V1.3 (20x4 Character I2C LCD) and
  supports LoRa Ra-02 (433MHz) telemetry transmission.

  Architecture:
  - Config.h             : General definitions, pin mappings, WQSData struct, timing.
  - DOSensor.h/.cpp      : RS485 Modbus RTU communication wrapper for DO sensor.
  - PHSensor.h/.cpp      : RS485 Modbus RTU communication wrapper for pH sensor.
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
DOSensor doSensor(Serial2, RS485_RX_PIN, RS485_TX_PIN, RS485_RE_DE_PIN);
PHSensor phSensor(Serial2, PH_SLAVE_ID, RS485_RX_PIN, RS485_TX_PIN, RS485_RE_DE_PIN);
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
void calibratePHSpecific(uint8_t pointIndex, float standardVal);
void exitPHCalibration();

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
  Serial.printf("-> DO Sensor (RS485 Addr 0x%02X): Initialized OK\n", DO_SLAVE_ID);
  Serial.printf("-> pH Sensor (RS485 Addr 0x%02X): Initialized OK\n", PH_SLAVE_ID);
  Serial.printf("-> Turbidity Sensor (GPIO %d): Initialized OK\n", TURBIDITY_PIN);
  Serial.println(F("--------------------------------------------------------"));
  Serial.println(F("System Ready. Polling sensors every 5 seconds."));
  Serial.println(
      F("Commands: 'CAL100' (DO cal), 'ENTERPH', 'CALPH', 'CAL4', 'CAL7', 'CAL9', 'EXITPH'."));
  Serial.println(
      F("========================================================\n"));

  // Perform initial readings immediately with RS485 inter-frame delay
  doSensor.query();
  currentData.doValid = doSensor.isDataValid();
  currentData.doSat = currentData.doValid ? doSensor.getSaturation() : NAN;
  currentData.doConc = currentData.doValid ? doSensor.getConcentration() : NAN;
  currentData.temp = currentData.doValid ? doSensor.getTemperature() : 29.0f;

  delay(50); // Line settling delay on RS485 bus

  phSensor.query();
  currentData.phValid = phSensor.isDataValid();
  currentData.ph = currentData.phValid ? phSensor.getPH() : NAN;
  if (!currentData.doValid && currentData.phValid) {
    currentData.temp = phSensor.getTemperature();
  }

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

    // Read DO sensor (Slave 0x01)
    doSensor.query();
    currentData.doValid = doSensor.isDataValid();
    currentData.doSat = currentData.doValid ? doSensor.getSaturation() : NAN;
    currentData.doConc = currentData.doValid ? doSensor.getConcentration() : NAN;
    currentData.temp = currentData.doValid ? doSensor.getTemperature() : 29.0f;

    delay(50); // Inter-frame delay for RS485 bus settling between slaves

    // Read pH sensor (Slave 0x02)
    phSensor.query();
    currentData.phValid = phSensor.isDataValid();
    currentData.ph = currentData.phValid ? phSensor.getPH() : NAN;
    if (!currentData.doValid && currentData.phValid) {
      currentData.temp = phSensor.getTemperature(); // Fallback temperature if DO unavailable
    }

    // Read Turbidity sensor
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
    phSensor.query();
  }

  // 2. Refresh Display
  if (currentMillis - lastDisplayRefreshTime >= DISPLAY_REFRESH_MS) {
    lastDisplayRefreshTime = currentMillis;

    if (millis() - phCalStatusMsgTimer > 3500) {
      phCalStatusMsg = "Btn:Cal | Hold:Exit";
    }

    float phVal = phSensor.isDataValid() ? phSensor.getPH() : 7.00f;
    float tempVal = phSensor.isDataValid() ? phSensor.getTemperature() : 25.0f;

    // Detect buffer solution
    const char* detectedBuffer = "Auto";
    if (phVal >= 3.0f && phVal <= 5.5f) {
      detectedBuffer = "4.01 (Acid)";
    } else if (phVal >= 5.51f && phVal <= 8.0f) {
      detectedBuffer = "7.00 (Neutral)";
    } else if (phVal > 8.0f && phVal <= 11.5f) {
      detectedBuffer = "9.18 (Base)";
    }

    displayManager.showPHCalibrationScreen(phVal, tempVal, detectedBuffer,
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
          if (inputBuffer.equalsIgnoreCase("CAL100")) {
            startDOCalibration();
          } else if (inputBuffer.equalsIgnoreCase("ENTERPH")) {
            enterPHCalibration();
          } else if (inputBuffer.startsWith("OFFSET ") || inputBuffer.startsWith("offset ")) {
            float dev = inputBuffer.substring(7).toFloat();
            phSensor.setDeviation(dev);
          } else {
            Serial.print(F("Unknown command: "));
            Serial.println(inputBuffer);
          }
        } else if (currentMode == MODE_PH_CALIBRATION) {
          if (inputBuffer.equalsIgnoreCase("CALPH")) {
            executePHCalibration();
          } else if (inputBuffer.equalsIgnoreCase("CAL4") || inputBuffer.equalsIgnoreCase("CAL4.01")) {
            calibratePHSpecific(1, 4.01f);
          } else if (inputBuffer.equalsIgnoreCase("CAL7") || inputBuffer.equalsIgnoreCase("CAL7.00")) {
            calibratePHSpecific(1, 7.00f);
          } else if (inputBuffer.equalsIgnoreCase("CAL9") || inputBuffer.equalsIgnoreCase("CAL9.18")) {
            calibratePHSpecific(2, 9.18f);
          } else if (inputBuffer.equalsIgnoreCase("CAL10") || inputBuffer.equalsIgnoreCase("CAL10.01")) {
            calibratePHSpecific(2, 10.01f);
          } else if (inputBuffer.startsWith("OFFSET ") || inputBuffer.startsWith("offset ")) {
            float dev = inputBuffer.substring(7).toFloat();
            phSensor.setDeviation(dev);
          } else if (inputBuffer.equalsIgnoreCase("EXITPH")) {
            exitPHCalibration();
          } else {
            Serial.println(F("Available Cal Commands: 'CALPH', 'CAL4', 'CAL7', 'CAL9', 'CAL10', 'OFFSET <val>', 'EXITPH'"));
          }
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
  phCalStatusMsg = "Btn:Cal | Hold:Exit";
  phCalStatusMsgTimer = 0;
  Serial.println(F("\n========================================================"));
  Serial.println(F("Entered pH Modbus Calibration Mode."));
  Serial.println(F("Immerse probe in standard buffer solution (4.01, 7.00, 9.18, or 10.01)."));
  Serial.println(F("Press Button (or send 'CALPH', 'CAL4', 'CAL7', 'CAL9', 'CAL10') to calibrate."));
  Serial.println(F("Hold Button (or send 'EXITPH') to exit."));
  Serial.println(F("========================================================\n"));
}

void executePHCalibration() {
  phSensor.query();
  float phVal = phSensor.getPH();

  bool success = false;
  if (phVal >= 3.0f && phVal <= 5.5f) {
    Serial.println(F("[CAL] Detected Acid Buffer -> Calibrating Point 1 @ pH 4.01..."));
    success = phSensor.calibratePoint(1, 4.01f);
    phCalStatusMsg = success ? "Point 1 (4.01) OK!" : "Cal Point 1 Fail!";
  } else if (phVal >= 5.51f && phVal <= 8.0f) {
    Serial.println(F("[CAL] Detected Neutral Buffer -> Calibrating Point 1 @ pH 7.00..."));
    success = phSensor.calibratePoint(1, 7.00f);
    phCalStatusMsg = success ? "Point 1 (7.00) OK!" : "Cal Point 1 Fail!";
  } else if (phVal > 8.0f && phVal <= 11.5f) {
    Serial.println(F("[CAL] Detected Base Buffer -> Calibrating Point 2 @ pH 9.18..."));
    success = phSensor.calibratePoint(2, 9.18f);
    phCalStatusMsg = success ? "Point 2 (9.18) OK!" : "Cal Point 2 Fail!";
  } else {
    Serial.printf("[WARN] Reading pH %.2f not in standard buffer range (4.01, 7.00, 9.18).\n", phVal);
    phCalStatusMsg = "Invalid Buffer!";
  }

  phCalStatusMsgTimer = millis();
}

void calibratePHSpecific(uint8_t pointIndex, float standardVal) {
  bool success = phSensor.calibratePoint(pointIndex, standardVal);
  if (success) {
    phCalStatusMsg = ">>> Cal Success! <<<";
  } else {
    phCalStatusMsg = ">>> Cal Failed! <<<";
  }
  phCalStatusMsgTimer = millis();
}

void exitPHCalibration() {
  currentMode = MODE_NORMAL;
  displayManager.clear();
  Serial.println(F("Exited pH calibration mode."));
  lastPollTime = millis();
}
