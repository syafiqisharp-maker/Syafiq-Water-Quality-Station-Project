#include "TurbiditySensor.h"

TurbiditySensor::TurbiditySensor(int pin) : _pin(pin), _vClean(4.20) {}

void TurbiditySensor::begin() {
  pinMode(_pin, INPUT);
  loadBaseline();
}

void TurbiditySensor::loadBaseline() {
  _preferences.begin("turbidity", true); // Read-only
  if (_preferences.isKey("vClean")) {
    _vClean = _preferences.getFloat("vClean", 4.20);
    Serial.print(F("-> Loaded Turbidity vClean: "));
    Serial.print(_vClean);
    Serial.println(F(" V"));
  } else {
    Serial.println(
        F("-> No stored Turbidity vClean found. Using default (4.20 V)."));
  }
  _preferences.end();
}

void TurbiditySensor::saveBaseline() {
  _preferences.begin("turbidity", false); // Read/Write
  _preferences.putFloat("vClean", _vClean);
  _preferences.end();
  Serial.println(F("-> Saved new Turbidity vClean to NVS."));
}

float TurbiditySensor::getVClean() const { return _vClean; }

bool TurbiditySensor::isDataValid() const {
  float v = (float)analogReadMilliVolts(_pin) / 1000.0f;
  return (v >= 0.05f && v <= 3.2f);
}


void TurbiditySensor::calibrateCleanWater() {
  float measuredV = readOversampledVoltage();
  // Scale back to pre-divider voltage using actual divider ratio (3.98V / 2.00V
  // = 1.99)
  _vClean = measuredV * 1.99;
  saveBaseline();
}

float TurbiditySensor::getTurbidityPct() {
  float voltageMeasured = readOversampledVoltage();
  // Scale back to pre-divider voltage using actual divider ratio (3.98V / 2.00V
  // = 1.99)
  float voltageSensor = voltageMeasured * 1.99;

  float clampedV = voltageSensor;
  if (clampedV > _vClean)
    clampedV = _vClean;
  if (clampedV < _vDirty)
    clampedV = _vDirty;

  // Map to standard curve range (2.5V - 4.2V)
  float stdV = (clampedV - _vDirty) * (4.2 - 2.5) / (_vClean - _vDirty) + 2.5;

  // y = -1120.4x^2 + 5742.3x - 4352.9
  float turbidityRaw = -1120.4 * (stdV * stdV) + 5742.3 * stdV - 4352.9;
  float turbidityPct = (turbidityRaw / 3000.0) * 100.0;

  if (turbidityPct < 0.0)
    turbidityPct = 0.0;
  if (turbidityPct > 100.0)
    turbidityPct = 100.0;

  return turbidityPct;
}

float TurbiditySensor::readOversampledVoltage() {
  float samples[TURBIDITY_NUM_SAMPLES];

  // --- 1. Collect samples with a small inter-sample gap ---
  for (int i = 0; i < TURBIDITY_NUM_SAMPLES; i++) {
    samples[i] =
        (float)analogReadMilliVolts(_pin) / 1000.0f; // Convert mV to Volts
    delay(50); // 50 ms gap -> 20 samples = 1000 ms total
  }

  // --- 2. Sort ascending (bubble sort) ---
  for (int i = 0; i < TURBIDITY_NUM_SAMPLES - 1; i++) {
    for (int j = 0; j < TURBIDITY_NUM_SAMPLES - 1 - i; j++) {
      if (samples[j] > samples[j + 1]) {
        float tmp = samples[j];
        samples[j] = samples[j + 1];
        samples[j + 1] = tmp;
      }
    }
  }

  // --- 3. Trim-mean: average the middle values only ---
  float sum = 0.0f;
  int validCount = TURBIDITY_NUM_SAMPLES -
                   2 * TURBIDITY_DISCARD_EACH; // 20 - (2 * 6) = 8 samples
  for (int i = TURBIDITY_DISCARD_EACH;
       i < TURBIDITY_NUM_SAMPLES - TURBIDITY_DISCARD_EACH; i++) {
    sum += samples[i];
  }

  return sum / (float)validCount;
}
