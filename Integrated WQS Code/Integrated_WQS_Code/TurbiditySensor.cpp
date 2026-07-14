#include "TurbiditySensor.h"

TurbiditySensor::TurbiditySensor(int pin) : _pin(pin), _vClean(4.20) {}

void TurbiditySensor::begin() {
    pinMode(_pin, INPUT);
    analogSetPinAttenuation(_pin, ADC_11db);
    esp_adc_cal_characterize(ADC_UNIT_1, ADC_ATTEN_DB_11, ADC_WIDTH_BIT_12, 1100, &_adcChars);
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
        Serial.println(F("-> No stored Turbidity vClean found. Using default (4.20 V)."));
    }
    _preferences.end();
}

void TurbiditySensor::saveBaseline() {
    _preferences.begin("turbidity", false); // Read/Write
    _preferences.putFloat("vClean", _vClean);
    _preferences.end();
    Serial.println(F("-> Saved new Turbidity vClean to NVS."));
}

float TurbiditySensor::getVClean() const {
    return _vClean;
}

void TurbiditySensor::calibrateCleanWater() {
    float sumMV = 0;
    for (int i = 0; i < 10; i++) {
        int raw = analogRead(_pin);
        sumMV += esp_adc_cal_raw_to_voltage(raw, &_adcChars);
    }
    float measuredV = (sumMV / 10.0) / 1000.0;
    _vClean = measuredV * 2.0;
    saveBaseline();
}

float TurbiditySensor::getTurbidityPct() {
    float sumMV = 0;
    // Fast non-blocking accumulation
    for (int i = 0; i < 10; i++) {
        int raw = analogRead(_pin);
        sumMV += esp_adc_cal_raw_to_voltage(raw, &_adcChars);
    }
    float voltageMeasured = (sumMV / 10.0) / 1000.0;
    float voltageSensor = voltageMeasured * 2.0;

    float clampedV = voltageSensor;
    if (clampedV > _vClean) clampedV = _vClean;
    if (clampedV < _vDirty) clampedV = _vDirty;

    // Map to standard curve range (2.5V - 4.2V)
    float stdV = (clampedV - _vDirty) * (4.2 - 2.5) / (_vClean - _vDirty) + 2.5;

    // y = -1120.4x^2 + 5742.3x - 4352.9
    float turbidityRaw = -1120.4 * (stdV * stdV) + 5742.3 * stdV - 4352.9;
    float turbidityPct = (turbidityRaw / 3000.0) * 100.0;

    if (turbidityPct < 0.0) turbidityPct = 0.0;
    if (turbidityPct > 100.0) turbidityPct = 100.0;

    return turbidityPct;
}
