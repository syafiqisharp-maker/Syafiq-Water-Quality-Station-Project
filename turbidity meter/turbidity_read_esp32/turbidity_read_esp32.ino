/*
  ESP32 Water Turbidity Meter (SEN0189) Sketch with Calibration

  Hardware Connection:
  - Sensor VCC -> ESP32 VIN (5V from USB)
  - Sensor GND -> ESP32 GND
  - Sensor Signal -> Voltage Divider (using two 10k Ohm resistors):
      * Sensor Signal OUT -> 10k Ohm Resistor (R1) -> ESP32 GPIO 34
      * ESP32 GPIO 34 -> 10k Ohm Resistor (R2) -> ESP32 GND

  Formula for Voltage Divider (1/2 scaling factor):
  V_measured = esp_adc_cal calibrated reading (mV) / 1000.0
  V_sensor = V_measured * 2.0
*/

#include <esp_adc_cal.h>

const int TURBIDITY_PIN = 34; // GPIO 34 (ADC1_CH6) - Input-only analog pin
const int NUM_SAMPLES = 10;   // Number of samples for averaging

// ADC calibration characteristics
esp_adc_cal_characteristics_t adcChars;

// --- CALIBRATION VARIABLES ---
// Put your sensor in clean water, read "Sensor V", and update this constant:
float vClean = 4.20; // Sensor voltage in clean water (0%)
const float vDirty =
    2.50; // Sensor voltage in completely blocked/opaque water (100%)

// Helper function to map float values
float mapFloat(float x, float in_min, float in_max, float out_min,
               float out_max) {
  return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

void setup() {
  Serial.begin(115200); // Standard ESP32 baud rate
  pinMode(TURBIDITY_PIN, INPUT);

  // Set ADC attenuation to 11dB for full 0-3.3V range
  analogSetPinAttenuation(TURBIDITY_PIN, ADC_11db);

  // Initialize ADC calibration using factory eFuse data
  esp_adc_cal_characterize(ADC_UNIT_1, ADC_ATTEN_DB_11, ADC_WIDTH_BIT_12, 1100,
                           &adcChars);

  Serial.println("--- Turbidity Meter Initialized ---");
  Serial.print("Current Clean Water Reference (vClean): ");
  Serial.print(vClean);
  Serial.println(" V");
  Serial.println(
      "Send 'C' in the Serial Monitor while in clean water to calibrate!");
  Serial.println("-----------------------------------");
}

void loop() {
  // Check for serial calibration command
  if (Serial.available() > 0) {
    char cmd = Serial.read();
    if (cmd == 'c' || cmd == 'C') {
      // Take an average of readings for calibration stability
      float sumMV = 0;
      for (int i = 0; i < NUM_SAMPLES; i++) {
        int raw = analogRead(TURBIDITY_PIN);
        sumMV += esp_adc_cal_raw_to_voltage(raw, &adcChars);
        delay(10);
      }
      float measuredV = (sumMV / NUM_SAMPLES) / 1000.0; // mV to V
      vClean = measuredV * 2.0; // Update the clean reference voltage

      Serial.println("\n>>> CALIBRATION SUCCESSFUL <<<");
      Serial.print("New Clean Water Reference (vClean) Set to: ");
      Serial.print(vClean, 3);
      Serial.println(" V");
      Serial.println(
          "Update 'float vClean = ...' in your code with this value!");
      Serial.println("-----------------------------------\n");
    }
  }

  // Read and average multiple samples to reduce noise
  float sumMV = 0;
  int rawValue = 0;
  for (int i = 0; i < NUM_SAMPLES; i++) {
    int raw = analogRead(TURBIDITY_PIN);
    rawValue += raw;
    sumMV += esp_adc_cal_raw_to_voltage(raw, &adcChars);
    delay(10);
  }
  rawValue /= NUM_SAMPLES;

  // Calibrated voltage measured at ESP32 pin (mV to V)
  float voltageMeasured = (sumMV / NUM_SAMPLES) / 1000.0;

  // Reconstruct the original 5V sensor voltage
  float voltageSensor = voltageMeasured * 2.0;

  // Clamp sensor voltage to the valid range
  float clampedV = voltageSensor;
  if (clampedV > vClean) {
    clampedV = vClean;
  }
  if (clampedV < vDirty) {
    clampedV = vDirty;
  }

  // Map calibrated sensor voltage to the standard 2.5V - 4.2V curve range
  float stdV = mapFloat(clampedV, vDirty, vClean, 2.5, 4.2);

  // Quadratic formula (follows Beer-Lambert light absorption law):
  //   y = -1120.4x^2 + 5742.3x - 4352.9
  // Then normalize to percentage: 0% = clean, 100% = opaque
  float turbidityRaw = -1120.4 * (stdV * stdV) + 5742.3 * stdV - 4352.9;
  float turbidityPct = turbidityRaw / 3000.0 * 100.0;

  // Clamp to valid range
  if (turbidityPct < 0.0)
    turbidityPct = 0.0;
  if (turbidityPct > 100.0)
    turbidityPct = 100.0;

  // Print results
  Serial.print("Raw: ");
  Serial.print(rawValue);
  Serial.print(" | Measured V: ");
  Serial.print(voltageMeasured, 2);
  Serial.print(" V | Sensor V: ");
  Serial.print(voltageSensor, 2);
  Serial.print(" V | Turbidity: ");
  Serial.print(turbidityPct, 1);
  Serial.println(" %");

  delay(1000);
}
