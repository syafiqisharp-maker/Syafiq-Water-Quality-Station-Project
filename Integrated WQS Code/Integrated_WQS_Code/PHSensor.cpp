#include "PHSensor.h"
#include <EEPROM.h>

// Constructor
PHSensor::PHSensor(int pin) 
    : _pin(pin), _voltage(0.0), _phValue(7.00), _lastCalVoltage(0.0) {}

// Initialise the pH sensor pin and DFRobot library
void PHSensor::begin() {
#if defined(ESP32) || defined(ESP8266)
    EEPROM.begin(32); // Required for ESP32/ESP8266 to emulate EEPROM in NVS flash
#endif
    pinMode(_pin, INPUT);
    _ph.begin();
}

// Update the sensor readings using the latest solution temperature
void PHSensor::update(float solutionTemperature) {
    // Use oversampled voltage to reduce ESP32 ADC noise
    _voltage = readOversampledMilliVolts();

    // Calculate pH value using the DFRobot library
    _phValue = _ph.readPH(_voltage, solutionTemperature);
}

// Collect PH_NUM_SAMPLES ADC readings, sort them, discard the top and bottom
// PH_DISCARD_EACH outliers, and return the mean of the remaining middle values.
// This is a trim-mean (trimmed average) technique that suppresses impulse noise
// from the ESP32 SAR ADC without requiring a long blocking delay.
float PHSensor::readOversampledMilliVolts() {
    float samples[PH_NUM_SAMPLES];

    // --- 1. Collect samples with a small inter-sample gap ---
    for (int i = 0; i < PH_NUM_SAMPLES; i++) {
#if defined(ESP32)
        samples[i] = (float)analogReadMilliVolts(_pin);
#else
        samples[i] = analogRead(_pin) / 1024.0f * 5000.0f;
#endif
        delay(50); // 50 ms gap -> 20 samples = 1000 ms total
    }

    // --- 2. Sort ascending (bubble sort; tiny array, fast enough) ---
    for (int i = 0; i < PH_NUM_SAMPLES - 1; i++) {
        for (int j = 0; j < PH_NUM_SAMPLES - 1 - i; j++) {
            if (samples[j] > samples[j + 1]) {
                float tmp    = samples[j];
                samples[j]   = samples[j + 1];
                samples[j + 1] = tmp;
            }
        }
    }

    // --- 3. Trim-mean: average the middle values only ---
    float sum       = 0.0f;
    int   validCount = PH_NUM_SAMPLES - 2 * PH_DISCARD_EACH; // 20 - 6 = 14 samples
    for (int i = PH_DISCARD_EACH; i < PH_NUM_SAMPLES - PH_DISCARD_EACH; i++) {
        sum += samples[i];
    }

    return sum / (float)validCount;
}

// Forward calibration commands to the DFRobot_PH library
void PHSensor::sendCalibrationCommand(float solutionTemperature, const char* cmd) {
    if (cmd == nullptr) return;

    // Create a local, modifiable char buffer because DFRobot_PH::calibration takes `char*`
    char cmdBuf[16];
    strncpy(cmdBuf, cmd, sizeof(cmdBuf));
    cmdBuf[sizeof(cmdBuf) - 1] = '\0';

    String cmdStr = String(cmd);
    cmdStr.toUpperCase();

    // Workaround for DFRobot_PH library limitation:
    // The library only saves EEPROM during "EXITPH" if the CURRENT voltage 
    // is still within the buffer solution range. If the user removes the probe 
    // before exiting, it fails to save. We cache the voltage when "CALPH" is 
    // called, and replay it for "EXITPH".
    float voltageToPass = _voltage;
    if (cmdStr.indexOf("CALPH") >= 0) {
        _lastCalVoltage = _voltage;
    } else if (cmdStr.indexOf("EXITPH") >= 0 && _lastCalVoltage > 0.0) {
        voltageToPass = _lastCalVoltage;
    }

    // Execute calibration command
    _ph.calibration(voltageToPass, solutionTemperature, cmdBuf);

#if defined(ESP32) || defined(ESP8266)
    // The DFRobot_PH library writes to EEPROM but does not call commit().
    // On ESP32, changes to EEPROM remain in RAM until EEPROM.commit() is called.
    if (cmdStr.indexOf("EXITPH") >= 0) {
        EEPROM.commit();
        _lastCalVoltage = 0.0; // Reset cache after exit
    }
#endif
}
