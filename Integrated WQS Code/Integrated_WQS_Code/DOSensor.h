#ifndef DO_SENSOR_H
#define DO_SENSOR_H

#include <Arduino.h>
#include "Config.h"

class DOSensor {
public:
    // Constructor accepts the hardware serial port, RX/TX pins, and optional RE/DE control pin
    DOSensor(HardwareSerial& serialPort, int rxPin, int txPin, int reDePin = -1);

    // Initialise the serial port and GPIO pins
    void begin();

    // Query sensor readings. Returns true if query was successful and data updated
    bool query();

    // Calibration: Sends the Modbus write command for 100% calibration to the sensor
    bool sendCalibrationCommand();

    // Getters for latest read data
    float getSaturation() const { return _saturation; }
    float getConcentration() const { return _concentration; }
    float getTemperature() const { return _temperature; }
    bool isDataValid() const { return _dataValid; }

private:
    HardwareSerial& _serial;
    int _rxPin;
    int _txPin;
    int _reDePin;

    float _saturation;
    float _concentration;
    float _temperature;
    bool _dataValid;

    // Helper functions for Modbus communication
    bool readRegisters(uint16_t startAddress, uint16_t quantity, uint16_t* destBuffer);
    bool writeRegister(uint16_t regAddress, uint16_t value);
    uint16_t calculateCRC(const uint8_t* buf, int len);
    float registersToFloat(uint16_t highReg, uint16_t lowReg);
    void printHexFrame(const char* label, const uint8_t* buf, int len);
};

#endif // DO_SENSOR_H
