/*
 * @file pH_read_esp32.ino
 * @brief Simple code to read pH meter from DFRobot (Gravity: Analog pH Sensor
 * V2) on ESP32.
 *
 * Features:
 * - Uses analogReadMilliVolts() for ESP32 to read precise voltages.
 * - Stores calibration parameters in the ESP32's native non-volatile storage
 * (Preferences / NVS).
 * - Calibrate the sensor in real-time via Serial Monitor commands.
 *
 * ESP32 Pin Selection:
 * - We recommend using ADC1 pins: GPIO 32, 33, 34, 35, 36, 39.
 * - Do NOT use ADC2 pins (GPIO 0, 2, 4, 12, 13, 14, 15, 25, 26, 27) if you plan
 * on using Wi-Fi.
 * - GPIO 34 and 35 are input-only pins and are ideal for analog sensors.
 *
 * Serial Commands:
 * - enterph -> Enter the pH calibration mode
 * - calph   -> Calibrate in standard buffer solution (4.0 or 7.0 will be
 * auto-detected)
 * - exitph  -> Save calibration settings to NVS flash and exit calibration mode
 *
 * @author Antigravity (Advanced Agentic Coding Pair)
 * @date 2026-06-30
 */

#include "DFRobot_PH.h"

// Define the ESP32 analog pin connected to the pH meter.
// We use GPIO 35 (ADC1_CH7) as a default.
#define PH_PIN 35

// Default calibration temperature. If you have a temperature sensor (e.g.
// DS18B20), you can read it and update this variable for automatic temperature
// compensation.
float temperature = 25.0;

float voltage, phValue;
DFRobot_PH ph;

void setup() {
  // Start serial communication
  Serial.begin(115200);
  delay(1000); // Give serial monitor time to connect
  Serial.println("\n--- ESP32 DFRobot pH Meter v2 Reader Initializing ---");

  // Configure the pH pin as input
  pinMode(PH_PIN, INPUT);

  // Initialize pH library (loads saved calibration from ESP32 Preferences/NVS)
  ph.begin();
  Serial.println(
      "System Ready. Type 'enterph' in Serial Monitor to calibrate.");
}

void loop() {
  static unsigned long lastMeasureTime = 0;

  // Read and print pH every 1 second
  if (millis() - lastMeasureTime > 1000U) {
    lastMeasureTime = millis();

// Optional: Read temperature from a real sensor here (e.g. ds18b20.getTempC())
// temperature = readTemperature();

// Read analog voltage in millivolts
#if defined(ESP32)
    // ESP32 custom API: returns calibrated millivolts directly using eFuse
    // calibration data
    voltage = analogReadMilliVolts(PH_PIN);
#else
    // Fallback for standard 5V Arduino Uno (10-bit ADC)
    voltage = analogRead(PH_PIN) / 1024.0 * 5000.0;
#endif

    // Convert voltage to pH value (compensating for temperature if sensor is
    // used)
    phValue = ph.readPH(voltage, temperature);

    // Print results to Serial Monitor
    Serial.print("Voltage: ");
    Serial.print(voltage, 0);
    Serial.print(" mV | Temp: ");
    Serial.print(temperature, 1);
    Serial.print(" °C | pH: ");
    Serial.println(phValue, 2);
  }

  // Periodically run calibration routine to listen for Serial commands
  ph.calibration(voltage, temperature);
}

/**
 * Helper function if you decide to add a temperature sensor later.
 */
float readTemperature() {
  // If you hook up a temperature sensor (e.g. DS18B20), add the reading code
  // here.
  return 25.0;
}
