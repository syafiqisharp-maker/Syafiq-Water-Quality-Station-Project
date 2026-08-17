#include "PHSensor.h"

// Constructor
PHSensor::PHSensor(HardwareSerial& serialPort, uint8_t slaveId, int rxPin, int txPin, int reDePin)
    : _serial(serialPort), _slaveId(slaveId), _rxPin(rxPin), _txPin(txPin), _reDePin(reDePin),
      _phValue(7.00f), _temperature(25.0f), _dataValid(false) {}

// Initialise the pH sensor serial connection
void PHSensor::begin() {
    // Configure RE/DE Pin if used
    if (_reDePin >= 0) {
        pinMode(_reDePin, OUTPUT);
        digitalWrite(_reDePin, LOW); // Receive mode by default
    }
}

// Query pH and Temperature registers from the sensor (Function Code 0x03)
bool PHSensor::query() {
    uint16_t regs[2] = {0, 0};

    if (readRegisters(REG_PH_DATA, 2, regs)) {
        // Register 0x0000: pH value (x100)
        // Register 0x0001: Temperature (x10, signed)
        float phVal   = (float)regs[0] / 100.0f;
        float tempVal = (float)((int16_t)regs[1]) / 10.0f;

        // Plausibility checks (pH: 0.0 - 14.0, Temp: -5.0 to 60.0 °C)
        if (!isnan(phVal) && !isinf(phVal) && phVal >= 0.0f && phVal <= 14.0f &&
            !isnan(tempVal) && !isinf(tempVal) && tempVal >= -5.0f && tempVal <= 60.0f) {
            _phValue = phVal;
            _temperature = tempVal;
            _dataValid = true;
            return true;
        } else {
            Serial.printf("[WARN] pH Sensor (0x%02X) returned out-of-range data: pH=%.2f, Temp=%.1f C\n", _slaveId, phVal, tempVal);
        }
    }

    _dataValid = false;
    return false;
}

// Electrode 2-Point Calibration (Function Code 0x10 to registers 0x0120-0x0121)
bool PHSensor::calibratePoint(uint8_t pointIndex, float standardPH) {
    if (pointIndex != 1 && pointIndex != 2) {
        Serial.println(F("[ERROR] Calibration pointIndex must be 1 or 2."));
        return false;
    }

    uint16_t standardVal = (uint16_t)(standardPH * 100.0f + 0.5f);
    uint16_t calVals[2] = { pointIndex, standardVal };

    Serial.printf("[INFO] Sending pH Cal Point %d (pH %.2f -> %u) to Slave 0x%02X...\n",
                  pointIndex, standardPH, standardVal, _slaveId);

    bool success = writeMultipleRegisters(REG_PH_CAL_POINT, 2, calVals);
    if (success) {
        Serial.printf("[SUCCESS] pH Calibration Point %d recorded by sensor!\n", pointIndex);
    } else {
        Serial.printf("[ERROR] Failed to send pH Calibration Point %d to sensor!\n", pointIndex);
    }
    return success;
}

// Set pH Deviation / Offset value (Function Code 0x06 to register 0x0050)
bool PHSensor::setDeviation(float deviation) {
    int16_t devVal = (int16_t)(deviation * 100.0f);
    Serial.printf("[INFO] Setting pH deviation: %.2f (Reg value: %d)...\n", deviation, devVal);
    return writeSingleRegister(REG_PH_DEVIATION, (uint16_t)devVal);
}

// =========================================================================
// Modbus RTU Communication Helpers
// =========================================================================

bool PHSensor::readRegisters(uint16_t startAddress, uint16_t quantity, uint16_t* destBuffer) {
    uint8_t request[8];
    request[0] = _slaveId;
    request[1] = 0x03; // Read Holding Registers
    request[2] = (uint8_t)(startAddress >> 8);
    request[3] = (uint8_t)(startAddress & 0xFF);
    request[4] = (uint8_t)(quantity >> 8);
    request[5] = (uint8_t)(quantity & 0xFF);

    uint16_t crc = calculateCRC(request, 6);
    request[6] = (uint8_t)(crc & 0xFF);
    request[7] = (uint8_t)((crc >> 8) & 0xFF);

    // Flush RX buffer
    while (_serial.available()) _serial.read();

    // Transmit request
    if (_reDePin >= 0) digitalWrite(_reDePin, HIGH);
    _serial.write(request, 8);
    _serial.flush();
    if (_reDePin >= 0) digitalWrite(_reDePin, LOW);

    // Expected response size: 1 (ID) + 1 (FC) + 1 (ByteCount) + 2*qty + 2 (CRC)
    uint8_t expectedBytes = 5 + (quantity * 2);
    uint8_t response[32];
    uint8_t bytesRead = 0;
    unsigned long startTime = millis();

    while ((millis() - startTime < MODBUS_TIMEOUT_MS) && (bytesRead < expectedBytes)) {
        if (_serial.available()) {
            response[bytesRead++] = _serial.read();
        }
    }

    if (bytesRead == expectedBytes) {
        uint16_t respCRC = calculateCRC(response, expectedBytes - 2);
        uint16_t frameCRC = response[expectedBytes - 2] | (response[expectedBytes - 1] << 8);

        if (respCRC == frameCRC && response[0] == _slaveId && response[1] == 0x03 && response[2] == (quantity * 2)) {
            for (uint16_t i = 0; i < quantity; i++) {
                destBuffer[i] = (response[3 + (i * 2)] << 8) | response[4 + (i * 2)];
            }
            return true;
        }
    }

    return false;
}

bool PHSensor::writeSingleRegister(uint16_t regAddress, uint16_t value) {
    uint8_t request[8];
    request[0] = _slaveId;
    request[1] = 0x06; // Write Single Register
    request[2] = (uint8_t)(regAddress >> 8);
    request[3] = (uint8_t)(regAddress & 0xFF);
    request[4] = (uint8_t)(value >> 8);
    request[5] = (uint8_t)(value & 0xFF);

    uint16_t crc = calculateCRC(request, 6);
    request[6] = (uint8_t)(crc & 0xFF);
    request[7] = (uint8_t)((crc >> 8) & 0xFF);

    while (_serial.available()) _serial.read();

    if (_reDePin >= 0) digitalWrite(_reDePin, HIGH);
    _serial.write(request, 8);
    _serial.flush();
    if (_reDePin >= 0) digitalWrite(_reDePin, LOW);

    uint8_t response[8];
    uint8_t bytesRead = 0;
    unsigned long startTime = millis();

    while ((millis() - startTime < MODBUS_TIMEOUT_MS) && (bytesRead < 8)) {
        if (_serial.available()) {
            response[bytesRead++] = _serial.read();
        }
    }

    if (bytesRead == 8) {
        uint16_t respCRC = calculateCRC(response, 6);
        uint16_t frameCRC = response[6] | (response[7] << 8);
        return (respCRC == frameCRC && response[0] == _slaveId && response[1] == 0x06);
    }

    return false;
}

bool PHSensor::writeMultipleRegisters(uint16_t startAddress, uint16_t quantity, const uint16_t* values) {
    uint8_t byteCount = quantity * 2;
    uint8_t packetLen = 7 + byteCount + 2;
    uint8_t request[32];

    request[0] = _slaveId;
    request[1] = 0x10; // Write Multiple Registers
    request[2] = (uint8_t)(startAddress >> 8);
    request[3] = (uint8_t)(startAddress & 0xFF);
    request[4] = (uint8_t)(quantity >> 8);
    request[5] = (uint8_t)(quantity & 0xFF);
    request[6] = byteCount;

    for (uint8_t i = 0; i < quantity; i++) {
        request[7 + (i * 2)]     = (uint8_t)(values[i] >> 8);
        request[7 + (i * 2) + 1] = (uint8_t)(values[i] & 0xFF);
    }

    uint16_t crc = calculateCRC(request, 7 + byteCount);
    request[7 + byteCount]     = (uint8_t)(crc & 0xFF);
    request[7 + byteCount + 1] = (uint8_t)((crc >> 8) & 0xFF);

    while (_serial.available()) _serial.read();

    if (_reDePin >= 0) digitalWrite(_reDePin, HIGH);
    _serial.write(request, packetLen);
    _serial.flush();
    if (_reDePin >= 0) digitalWrite(_reDePin, LOW);

    // Response structure (8 bytes): [SlaveID] [0x10] [StartAddr_H] [StartAddr_L] [Qty_H] [Qty_L] [CRC_L] [CRC_H]
    uint8_t response[8];
    uint8_t bytesRead = 0;
    unsigned long startTime = millis();

    while ((millis() - startTime < MODBUS_TIMEOUT_MS) && (bytesRead < 8)) {
        if (_serial.available()) {
            response[bytesRead++] = _serial.read();
        }
    }

    if (bytesRead == 8) {
        uint16_t respCRC = calculateCRC(response, 6);
        uint16_t frameCRC = response[6] | (response[7] << 8);
        return (respCRC == frameCRC && response[0] == _slaveId && response[1] == 0x10);
    }

    return false;
}

uint16_t PHSensor::calculateCRC(const uint8_t* buf, int len) {
    uint16_t crc = 0xFFFF;
    for (int pos = 0; pos < len; pos++) {
        crc ^= (uint16_t)buf[pos];
        for (int i = 8; i != 0; i--) {
            if ((crc & 0x0001) != 0) {
                crc >>= 1;
                crc ^= 0xA001;
            } else {
                crc >>= 1;
            }
        }
    }
    return crc;
}

