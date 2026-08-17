#ifndef PH_SENSOR_H
#define PH_SENSOR_H

#include <Arduino.h>
#include "Config.h"

class PHSensor {
public:
    // Constructor accepts the shared HardwareSerial port, slave ID, RX/TX pins, and optional RE/DE pin
    PHSensor(HardwareSerial& serialPort, uint8_t slaveId = PH_SLAVE_ID, int rxPin = RS485_RX_PIN, int txPin = RS485_TX_PIN, int reDePin = RS485_RE_DE_PIN);

    // Initialise the serial port / pin modes
    void begin();

    // Query pH and Temperature registers from the sensor (Function Code 0x03)
    bool query();

    // Electrode 2-Point Calibration (Function Code 0x10 to registers 0x0120-0x0121)
    // pointIndex: 1 for Point 1 (Acid/Neutral), 2 for Point 2 (Base/Neutral)
    // standardPH: Standard solution pH (e.g. 4.01, 7.00, 9.18, 10.01)
    bool calibratePoint(uint8_t pointIndex, float standardPH);

    // Set pH Deviation / Offset value (Function Code 0x06 to register 0x0050)
    bool setDeviation(float deviation);

    // Getters
    float getPH() const { return _phValue; }
    float getTemperature() const { return _temperature; }
    bool isDataValid() const { return _dataValid; }

private:
    HardwareSerial& _serial;
    uint8_t _slaveId;
    int _rxPin;
    int _txPin;
    int _reDePin;

    float _phValue;
    float _temperature;
    bool _dataValid;

    // Modbus RTU communication helpers
    bool readRegisters(uint16_t startAddress, uint16_t quantity, uint16_t* destBuffer);
    bool writeSingleRegister(uint16_t regAddress, uint16_t value);
    bool writeMultipleRegisters(uint16_t startAddress, uint16_t quantity, const uint16_t* values);
    uint16_t calculateCRC(const uint8_t* buf, int len);
};

#endif // PH_SENSOR_H
