/*
  Integrated Water Quality Station (WQS)

  This sketch integrates three sensors on a 30-pin ESP32:
  1. DFRobot RS485 Fluorescence Dissolved Oxygen (DO) Sensor (SEN0681)
  2. Gravity Analog pH Sensor V2
  3. Analog Turbidity Sensor
  It outputs data to an LCD Model 2004A-V1.3 (20x4 Character I2C LCD).

  Architecture:
  - Config.h             : General definitions, pin mappings, timing.
  - DOSensor.h/.cpp      : RS485 Modbus RTU communication wrapper for DO sensor.
  - PHSensor.h/.cpp      : Gravity Analog pH sensor wrapper with temp comp.
  - TurbiditySensor.h/.cpp: Analog turbidity sensor wrapper with NVS
  calibration.
  - DisplayManager.h/.cpp: Anti-flicker character LCD layout & refresh manager.
  - ButtonHandler.h/.cpp : Debouncing and short/long press detection wrapper.

  Wiring Connection for 30-pin ESP32:
  - RS485-to-TTL Converter (for DO Sensor):
      * TXD / RO (Receive Out) -> ESP32 RX2 (GPIO 16)
      * RXD / DI (Driver In)   -> ESP32 TX2 (GPIO 17)
  - Analog pH Sensor:
      * Analog Signal (A)      -> ESP32 GPIO 35 (ADC1_CH7)
  - Analog Turbidity Sensor:
      * Signal OUT             -> ESP32 GPIO 34 (Requires 1/2 Voltage Divider)
  - I2C LCD Display (2004A with PCF8574 Backpack):
      * SDA                    -> ESP32 GPIO 21
      * SCL                    -> ESP32 GPIO 22
  - Physical Buttons:
      * DO/Turbidity Button    -> ESP32 GPIO 12 (to GND)
      * pH Button              -> ESP32 GPIO 13 (to GND)

  Serial Commands:
  - CAL100  -> Enters DO atmospheric 100% calibration countdown (5s countdown).
  - enterph -> Enters pH calibration mode (temp automatically compensated).
  - calph   -> Calibrates current pH buffer solution (auto-detects pH 4.0
  or 7.0).
  - exitph  -> Saves pH calibration parameters to NVS flash and returns to
  normal.
*/

#include "ButtonHandler.h"
#include "Config.h"
#include "DOSensor.h"
#include "DisplayManager.h"
#include "PHSensor.h"
#include "TurbiditySensor.h"
#include <Arduino.h>
#include <ArduinoOTA.h>
#include <ESPmDNS.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiUdp.h>
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
float currentTurbidity = 0.0;

// --- Buttons ---
#define BUTTON_DO_PIN 12
#define BUTTON_PH_PIN 13

ButtonHandler doButton(BUTTON_DO_PIN);
ButtonHandler phButton(BUTTON_PH_PIN);

// Timers for non-blocking task execution
unsigned long lastPollTime = 0;
unsigned long lastDisplayRefreshTime = 0;
unsigned long lastSheetsUploadTime = 0;
bool firstUploadDone = false;
unsigned long lastWiFiCheck = 0;
const unsigned long WIFI_CHECK_INTERVAL = 30000;
bool otaInitialized = false;

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
TurbiditySensor turbiditySensor(34);
DisplayManager displayManager;

// ==========================================
// FUNCTION PROTOTYPES
// ==========================================
void checkSerialCommands();
void checkButtons();
void maintainWiFi();
bool postToGoogle(float doVal, float phVal, float turbVal, float tempVal);

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
void handleTurbidityCalibrationMode();
void handlePHCalibrationMode(unsigned long currentMillis);

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
  doButton.begin();
  phButton.begin();

  // Initialize WiFi (non-blocking)
  Serial.print(F("Connecting to WiFi: "));
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  // Initialize sensor modules
  doSensor.begin();
  phSensor.begin();
  displayManager.begin();
  turbiditySensor.begin();

  Serial.println(F("-> I2C LCD Display: Initialized OK"));
  Serial.println(F("-> DO Sensor (RS485 Serial2): Initialized OK"));
  Serial.println(F("-> pH Sensor (GPIO 35): Initialized OK"));
  Serial.println(F("-> Turbidity Sensor (GPIO 34): Initialized OK"));
  Serial.println(F("--------------------------------------------------------"));
  Serial.println(F("System Ready. Polling sensors every 5 seconds."));
  Serial.println(
      F("Commands: 'CAL100' (DO cal), 'enterph', 'calph', 'exitph' (pH cal)."));
  Serial.println(
      F("========================================================\n"));

  // Perform initial readings immediately
  doSensor.query();
  float initTemp = doSensor.isDataValid() ? doSensor.getTemperature() : 29.0;
  phSensor.update(initTemp);

  // Initial display refresh
  currentTurbidity = turbiditySensor.getTurbidityPct();
  displayManager.showNormalScreen(
      doSensor.isDataValid() ? doSensor.getSaturation() : NAN,
      doSensor.isDataValid() ? doSensor.getConcentration() : NAN,
      doSensor.isDataValid() ? doSensor.getTemperature() : NAN,
      phSensor.getPH(), currentTurbidity, (WiFi.status() == WL_CONNECTED));

  lastPollTime = millis();
  lastDisplayRefreshTime = millis();
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
  maintainWiFi();
  if (otaInitialized) {
    ArduinoOTA.handle();
  }

  // 1. Process incoming commands and buttons
  checkSerialCommands();
  checkButtons();

  unsigned long currentMillis = millis();

  // 2. State Machine Router
  switch (currentMode) {
  case MODE_NORMAL:
    handleNormalMode(currentMillis);
    break;
  case MODE_DO_CALIBRATION:
    handleDOCalibrationMode(currentMillis);
    break;
  case MODE_TURBIDITY_CAL:
    handleTurbidityCalibrationMode();
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
  // 1. Poll Sensors
  if (currentMillis - lastPollTime >= POLL_INTERVAL_MS) {
    lastPollTime = currentMillis;

    doSensor.query();

    float currentTemp =
        doSensor.isDataValid() ? doSensor.getTemperature() : 29.0;
    phSensor.update(currentTemp);

    currentTurbidity = turbiditySensor.getTurbidityPct();
    Serial.print(F("Turbidity: "));
    Serial.print(currentTurbidity, 1);
    Serial.println(F(" %"));
  }

  // 2. Refresh Display
  if (currentMillis - lastDisplayRefreshTime >= DISPLAY_REFRESH_MS) {
    lastDisplayRefreshTime = currentMillis;

    float tempVal = doSensor.isDataValid() ? doSensor.getTemperature() : NAN;
    float satVal = doSensor.isDataValid() ? doSensor.getSaturation() : NAN;
    float concVal = doSensor.isDataValid() ? doSensor.getConcentration() : NAN;
    displayManager.showNormalScreen(satVal, concVal, tempVal, phSensor.getPH(),
                                    currentTurbidity,
                                    (WiFi.status() == WL_CONNECTED));
  }

  // 3. Upload to Google Sheets
  if (!firstUploadDone && currentMillis > 10000) {
    firstUploadDone = true;
    lastSheetsUploadTime = currentMillis;
    float tempVal = doSensor.isDataValid() ? doSensor.getTemperature() : NAN;
    float concVal = doSensor.isDataValid() ? doSensor.getConcentration() : NAN;
    Serial.println(F("First Google Sheets Upload..."));
    postToGoogle(concVal, phSensor.getPH(), currentTurbidity, tempVal);
  } else if (firstUploadDone && (currentMillis - lastSheetsUploadTime >=
                                 GOOGLE_SHEETS_UPLOAD_MS)) {
    lastSheetsUploadTime = currentMillis;
    float tempVal = doSensor.isDataValid() ? doSensor.getTemperature() : NAN;
    float concVal = doSensor.isDataValid() ? doSensor.getConcentration() : NAN;
    Serial.println(F("Routine Google Sheets Upload..."));
    postToGoogle(concVal, phSensor.getPH(), currentTurbidity, tempVal);
  }
}

void handleDOCalibrationMode(unsigned long currentMillis) {
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

      delay(3000);
      displayManager.clear();
      currentMode = MODE_NORMAL;
      lastPollTime = millis();
    }
  }
}

void handleTurbidityCalibrationMode() {
  displayManager.showTurbidityCalibrationScreen(turbiditySensor.getVClean(),
                                                false);
  Serial.println(F("Turbidity Calibration: Reading sensor..."));

  turbiditySensor.calibrateCleanWater();

  Serial.print(F("New Turbidity Ref (vClean) Set to: "));
  Serial.print(turbiditySensor.getVClean());
  Serial.println(F(" V"));

  displayManager.showTurbidityCalibrationScreen(turbiditySensor.getVClean(),
                                                true);
  delay(3000); // 3-second hold to present success payload as approved
  displayManager.clear();
  currentMode = MODE_NORMAL;
  lastPollTime = millis();
}

void handlePHCalibrationMode(unsigned long currentMillis) {
  // 1. Fast Poll (1s)
  if (currentMillis - lastPollTime >= 1000U) {
    lastPollTime = currentMillis;

    float currentTemp =
        doSensor.isDataValid() ? doSensor.getTemperature() : 29.0;
    phSensor.update(currentTemp);
  }

  // 2. Refresh Display
  if (currentMillis - lastDisplayRefreshTime >= DISPLAY_REFRESH_MS) {
    lastDisplayRefreshTime = currentMillis;

    if (millis() - phCalStatusMsgTimer > 3000) {
      phCalStatusMsg = "Btn:Cal | Hold:Exit";
    }
    float tempVal = doSensor.isDataValid() ? doSensor.getTemperature() : 29.0;
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
  lastCountdownMillis = millis();
  Serial.println(
      F("\n========================================================"));
  Serial.println(F("WARNING: Starting 100% Atmospheric Calibration."));
  Serial.println(F(
      "Ensure probe is in water-saturated air (e.g. above water surface)..."));
  Serial.println(F("========================================================"));
  displayManager.showDOCalibrationScreen(doCalCountdown);
}

void startTurbidityCalibration() { currentMode = MODE_TURBIDITY_CAL; }

void enterPHCalibration() {
  currentMode = MODE_PH_CALIBRATION;
  float currentTemp = doSensor.isDataValid() ? doSensor.getTemperature() : 29.0;
  phSensor.sendCalibrationCommand(currentTemp, "enterph");
  phCalStatusMsg = "Btn:Cal | Hold:Exit";
  phCalStatusMsgTimer = 0;
  Serial.println(
      F("Entered pH calibration mode. Solution temperature is compensated."));
}

void executePHCalibration() {
  float currentTemp = doSensor.isDataValid() ? doSensor.getTemperature() : 29.0;
  phSensor.sendCalibrationCommand(currentTemp, "calph");
  phCalStatusMsg = ">>> Calibrated! <<<";
  phCalStatusMsgTimer = millis();
  Serial.println(F("Executed pH calibration for current buffer solution."));
}

void exitPHCalibration() {
  float currentTemp = doSensor.isDataValid() ? doSensor.getTemperature() : 29.0;
  phSensor.sendCalibrationCommand(currentTemp, "exitph");
  currentMode = MODE_NORMAL;
  displayManager.clear();
  Serial.println(F("Exited pH calibration mode. Settings saved to NVS."));
  lastPollTime = millis();
}

void forwardPHCommand(const String &cmd) {
  float currentTemp = doSensor.isDataValid() ? doSensor.getTemperature() : 29.0;
  Serial.print(F("Forwarding custom calibration command to pH: "));
  Serial.println(cmd);
  phSensor.sendCalibrationCommand(currentTemp, cmd.c_str());
}

// ==========================================
// WIFI & GOOGLE SHEETS HANDLERS
// ==========================================
void maintainWiFi() {
  if (WiFi.status() == WL_CONNECTED && !otaInitialized) {
    ArduinoOTA.onStart([]() { Serial.println("OTA Update Starting"); });
    ArduinoOTA.onEnd([]() { Serial.println("\nOTA Update Complete"); });
    ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
      Serial.printf("Progress: %u%%\r", (progress / (total / 100)));
    });
    ArduinoOTA.onError(
        [](ota_error_t error) { Serial.printf("Error[%u]: ", error); });
    ArduinoOTA.begin();
    Serial.println("OTA Initialized and Ready");
    otaInitialized = true;
  }

  if (millis() - lastWiFiCheck > WIFI_CHECK_INTERVAL) {
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println(F("WiFi not connected. Attempting reconnect..."));
      WiFi.reconnect();
    }
    lastWiFiCheck = millis();
  }
}

bool postToGoogle(float doVal, float phVal, float turbVal, float tempVal) {
  if (WiFi.status() != WL_CONNECTED)
    return false;

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;

  if (!http.begin(client, GOOGLE_SCRIPT_URL)) {
    Serial.println(F("HTTP begin failed."));
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  http.setTimeout(15000);

  String jsonPayload = "{\"do\":\"" + String(doVal, 2) + "\",\"ph\":\"" +
                       String(phVal, 2) + "\",\"turbidity\":\"" +
                       String(turbVal, 2) + "\",\"temperature\":\"" +
                       String(tempVal, 2) + "\"}";

  int httpCode = http.POST(jsonPayload);
  Serial.print(F("HTTP POST Code: "));
  Serial.println(httpCode);

  if (httpCode == 301 || httpCode == 302) {
    String newUrl = http.getLocation();
    http.end();
    if (http.begin(client, newUrl)) {
      http.setTimeout(15000);
      httpCode = http.GET();
      Serial.print(F("Redirect HTTP Code: "));
      Serial.println(httpCode);
    }
  }

  bool success = false;
  if (httpCode > 0) {
    String response = http.getString();
    response.trim();
    if (response.indexOf("success") >= 0)
      success = true;
  } else {
    Serial.print(F("Connection failed: "));
    Serial.println(http.errorToString(httpCode));
  }

  http.end();
  return success;
}
