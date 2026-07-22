#ifndef TURBIDITY_SENSOR_H
#define TURBIDITY_SENSOR_H

#include <Arduino.h>
#include <Preferences.h>

#define TURBIDITY_NUM_SAMPLES 20
#define TURBIDITY_DISCARD_EACH 6

class TurbiditySensor {
public:
    TurbiditySensor(int pin);
    void begin();
    float getTurbidityPct();
    void calibrateCleanWater();
    float getVClean() const;

private:
    int _pin;
    float _vClean;
    const float _vDirty = 2.50;
    
    Preferences _preferences;

    void loadBaseline();
    void saveBaseline();
    float readOversampledVoltage();
};

#endif // TURBIDITY_SENSOR_H
