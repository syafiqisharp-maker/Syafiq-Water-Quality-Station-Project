#include "DOSensor.h"

// Constructor
DOSensor::DOSensor(HardwareSerial& serialPort, int rxPin, int txPin, int reDePin)
    : _serial(serialPort), _rxPin(rxPin), _txPin(txPin), _reDePin(reDePin),
      _saturation(0.0), _concentration(0.0), _temperature(0.0), _dataValid(false) {}

// Initialise the RS485 connection
void DOSensor::begin() {
    // Start Modbus Serial at 4800 bps, 8N1
    _serial.begin(DO_BAUD_RATE, SERIAL_8N1, _rxPin, _txPin);
    
    // Configure RE/DE Pin if used
    if (_reDePin >= 0) {
        pinMode(_reDePin, OUTPUT);
        digitalWrite(_reDePin, LOW); // Put in RX (Receive) mode by default
    }
}

// Query all parameters from the sensor
bool DOSensor::query() {
    uint16_t regsSaturation[2] = {0, 0};
    uint16_t regsConcentration[2] = {0, 0};
    uint16_t regsTemperature[2] = {0, 0};

    bool satSuccess = false;
    bool conSuccess = false;
    bool tempSuccess = false;

    // 1. Query DO Saturation (registers 0x0000-0x0001, 2 registers)
    satSuccess = readRegisters(REG_DO_SATURATION, 2, regsSaturation);
    
    // Skip subsequent reads if the first fails to prevent multiple timeouts blocking the loop
    if (satSuccess) {
        delay(50); // Inter-frame delay for RS485 line settling

        // 2. Query DO Concentration (registers 0x0002-0x0003, 2 registers)
        conSuccess = readRegisters(REG_DO_CONCENTRATION, 2, regsConcentration);
        if (conSuccess) {
            delay(50);

            // 3. Query Temperature (registers 0x0004-0x0005, 2 registers)
            tempSuccess = readRegisters(REG_TEMPERATURE, 2, regsTemperature);
        }
    }

    if (satSuccess && conSuccess && tempSuccess) {
        // Convert register pairs to IEEE 754 32-bit float values
        // Note: Sensor returns saturation as a ratio (e.g. 1.0 = 100%), so we multiply by 100.0
        float satVal  = registersToFloat(regsSaturation[0],    regsSaturation[1]) * 100.0;
        float concVal = registersToFloat(regsConcentration[0], regsConcentration[1]);
        float tempVal = registersToFloat(regsTemperature[0],   regsTemperature[1]);

        // --- PLAUSIBILITY CHECKS ---
        // Valid ranges: DO Sat 0-200%, DO Conc 0-25 mg/L, Temp -5 to 50 °C
        bool valuesOk = true;
        if (isnan(satVal) || isinf(satVal) || satVal < 0.0 || satVal > 200.0) {
            Serial.println(F("[WARN] DO Saturation value out of plausible range (0-200%)."));
            valuesOk = false;
        }
        if (isnan(concVal) || isinf(concVal) || concVal < 0.0 || concVal > 25.0) {
            Serial.println(F("[WARN] DO Concentration value out of plausible range (0-25 mg/L)."));
            valuesOk = false;
        }
        if (isnan(tempVal) || isinf(tempVal) || tempVal < -5.0 || tempVal > 50.0) {
            Serial.println(F("[WARN] Temperature value out of plausible range (-5 to 50 degC)."));
            valuesOk = false;
        }

        if (valuesOk) {
            _saturation = satVal;
            _concentration = concVal;
            _temperature = tempVal;
            _dataValid = true;
            return true;
        }
    }

    // Diagnostics if something failed
    _dataValid = false;
    Serial.println(F("[ERROR] DO Sensor Modbus query failed!"));
    if (!satSuccess)  Serial.println(F(" -> DO Saturation read failed (Timeout or CRC error)"));
    if (!conSuccess)  Serial.println(F(" -> DO Concentration read failed (Timeout or CRC error)"));
    if (!tempSuccess) Serial.println(F(" -> Temperature read failed (Timeout or CRC error)"));
    return false;
}

// Send the single write calibration command to the sensor
bool DOSensor::sendCalibrationCommand() {
    return writeRegister(CALIBRATION_REG, CALIBRATION_VAL_100);
}

// =========================================================================
// Modbus RTU Communication Helpers
// =========================================================================

bool DOSensor::readRegisters(uint16_t startAddress, uint16_t quantity, uint16_t* destBuffer) {
    // Construct Request Packet (8 bytes)
    // [Slave Address] [Function Code 0x03] [Start Addr High] [Start Addr Low] [Count High] [Count Low] [CRC Low] [CRC High]
    uint8_t request[8];
    request[0] = DO_SLAVE_ID;
    request[1] = 0x03; // Read Holding Registers
    request[2] = (startAddress >> 8) & 0xFF;
    request[3] = startAddress & 0xFF;
    request[4] = (quantity >> 8) & 0xFF;
    request[5] = quantity & 0xFF;

    uint16_t crc = calculateCRC(request, 6);
    request[6] = crc & 0xFF; // Low byte first
    request[7] = (crc >> 8) & 0xFF;

    // Clear serial RX buffer
    while (_serial.available() > 0) {
        _serial.read();
    }

    // Toggle Transmit Enable if RE/DE is used
    if (_reDePin >= 0) {
        digitalWrite(_reDePin, HIGH);
    }

    // Transmit request frame
    _serial.write(request, 8);
    _serial.flush();

    // Toggle Receive Enable if RE/DE is used
    if (_reDePin >= 0) {
        digitalWrite(_reDePin, LOW);
    }

    // Expected response size: 5 bytes overhead + 2 bytes per register
    int expectedLength = 5 + (2 * quantity);
    uint8_t response[64];
    int bytesRead = 0;
    unsigned long startMillis = millis();

    // Non-blocking read with timeout
    while (bytesRead < expectedLength && (millis() - startMillis < MODBUS_TIMEOUT_MS)) {
        if (_serial.available() > 0) {
            response[bytesRead++] = _serial.read();
            // Check early if this is an exception response (function code has MSB set, e.g., 0x83)
            if (bytesRead == 2 && (response[1] & 0x80)) {
                expectedLength = 5;
            }
        }
        yield();
    }

    // Checks:
    // 1. Timeout Check
    if (bytesRead < expectedLength) {
        return false;
    }
    // 2. Slave ID Check
    if (response[0] != DO_SLAVE_ID) {
        return false;
    }
    // 3. Exception Response Check (Function code ORed with 0x80)
    if (response[1] == 0x83) {
        Serial.print(F("[MODBUS EXCEPTION] Sensor returned error code: 0x"));
        Serial.println(response[2], HEX);
        return false;
    }
    // 4. Function Code Check
    if (response[1] != 0x03) {
        return false;
    }
    // 5. Byte Count Check
    if (response[2] != (2 * quantity)) {
        return false;
    }
    // 6. CRC Verification
    uint16_t receivedCRC = response[expectedLength - 2] | (response[expectedLength - 1] << 8);
    uint16_t calculatedCRC = calculateCRC(response, expectedLength - 2);
    if (receivedCRC != calculatedCRC) {
        return false;
    }

    // Parse bytes into big-endian uint16_t registers
    for (int i = 0; i < quantity; i++) {
        int dataIndex = 3 + (2 * i);
        destBuffer[i] = (response[dataIndex] << 8) | response[dataIndex + 1];
    }

    return true;
}

bool DOSensor::writeRegister(uint16_t regAddress, uint16_t value) {
    // Construct Write Single Register Packet (8 bytes)
    // [Slave Address] [Function Code 0x06] [Reg Address H] [Reg Address L] [Value H] [Value L] [CRC L] [CRC H]
    uint8_t request[8];
    request[0] = DO_SLAVE_ID;
    request[1] = 0x06; // Write Single Register
    request[2] = (regAddress >> 8) & 0xFF;
    request[3] = regAddress & 0xFF;
    request[4] = (value >> 8) & 0xFF;
    request[5] = value & 0xFF;

    uint16_t crc = calculateCRC(request, 6);
    request[6] = crc & 0xFF;
    request[7] = (crc >> 8) & 0xFF;

    // Clear serial RX buffer
    while (_serial.available() > 0) {
        _serial.read();
    }

    // Toggle Transmit Enable if RE/DE is used
    if (_reDePin >= 0) {
        digitalWrite(_reDePin, HIGH);
    }

    // Transmit write frame
    _serial.write(request, 8);
    _serial.flush();

    // Toggle Receive Enable if RE/DE is used
    if (_reDePin >= 0) {
        digitalWrite(_reDePin, LOW);
    }

    // A successful single write returns an identical echo frame (8 bytes)
    int expectedLength = 8;
    uint8_t response[8];
    int bytesRead = 0;
    unsigned long startMillis = millis();

    while (bytesRead < expectedLength && (millis() - startMillis < MODBUS_TIMEOUT_MS)) {
        if (_serial.available() > 0) {
            response[bytesRead++] = _serial.read();
            // Exception responses (e.g., 0x86) are 5 bytes long
            if (bytesRead == 2 && (response[1] & 0x80)) {
                expectedLength = 5;
            }
        }
        yield();
    }

    if (bytesRead < expectedLength) return false;
    if (response[0] != DO_SLAVE_ID) return false;
    if (response[1] == 0x86) {
        Serial.print(F("[MODBUS WRITE EXCEPTION] Error code: 0x"));
        Serial.println(response[2], HEX);
        return false;
    }
    if (response[1] != 0x06) return false;

    // Verify address and value
    uint16_t rxAddress = (response[2] << 8) | response[3];
    uint16_t rxValue = (response[4] << 8) | response[5];
    if (rxAddress != regAddress || rxValue != value) return false;

    // Verify CRC
    uint16_t receivedCRC = response[6] | (response[7] << 8);
    uint16_t calculatedCRC = calculateCRC(response, 6);
    if (receivedCRC != calculatedCRC) return false;

    return true;
}

// Convert two 16-bit Modbus registers to a 32-bit float
float DOSensor::registersToFloat(uint16_t highReg, uint16_t lowReg) {
    uint32_t combined = ((uint32_t)highReg << 16) | (uint32_t)lowReg;
    float result;
    memcpy(&result, &combined, sizeof(result));
    return result;
}

// Calculate Modbus RTU CRC-16
uint16_t DOSensor::calculateCRC(const uint8_t *buf, int len) {
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
