#ifndef PH_SENSOR_H
#define PH_SENSOR_H

#include <Arduino.h>
#include "DFRobot_PH.h"
#include "Config.h"

class PHSensor {
public:
    // Constructor accepts the analog pin connected to the pH meter
    PHSensor(int pin);

    // Initialise the pH sensor pin and DFRobot library
    void begin();

    // Read voltage and update the pH value based on current solution temperature
    void update(float solutionTemperature);

    // Sends a calibration command ("enterph", "calph", "exitph") to the DFRobot library
    void sendCalibrationCommand(float solutionTemperature, const char* cmd);

    // Getters
    float getPH() const { return _phValue; }
    float getVoltage() const { return _voltage; }

private:
    // Oversampling configuration
    static const int PH_NUM_SAMPLES    = 20; // Total ADC readings per update
    static const int PH_DISCARD_EACH   = 3;  // Drop 3 lowest + 3 highest outliers

    int _pin;
    float _voltage;
    float _phValue;
    DFRobot_PH _ph;

    // Collect, sort, and trim-average multiple ADC readings to reduce ESP32 ADC noise
    float readOversampledMilliVolts();
};

#endif // PH_SENSOR_H
