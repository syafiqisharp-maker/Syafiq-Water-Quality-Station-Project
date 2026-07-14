#ifndef TURBIDITY_SENSOR_H
#define TURBIDITY_SENSOR_H

#include <Arduino.h>
#include <esp_adc_cal.h>
#include <Preferences.h>

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
    
    esp_adc_cal_characteristics_t _adcChars;
    Preferences _preferences;

    void loadBaseline();
    void saveBaseline();
};

#endif // TURBIDITY_SENSOR_H
