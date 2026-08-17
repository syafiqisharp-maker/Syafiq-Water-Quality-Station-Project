/*
 * ==============================================================================
 * DFRobot SEN0708 RS485 Modbus pH Sensor - Address Configuration & Test Tool
 * ==============================================================================
 * Purpose:
 *   Reconfigures the Modbus Slave ID of the SEN0708 pH meter from 0x01 to 0x02
 *   so it can coexist with the Dissolved Oxygen (DO) sensor on the same RS485
 * bus.
 *
 * Wiring with RS485-to-UART module (e.g., Gravity / Max485):
 *   - Sensor Brown Wire (VCC) -> 5V - 12V DC (External power or 5V rail)
 *   - Sensor Black Wire (GND) -> GND (Common ground with ESP32)
 *   - Sensor Yellow Wire (A)  -> RS485 Module A
 *   - Sensor Blue Wire (B)    -> RS485 Module B
 *   - RS485 Module VCC/GND    -> 5V / 3.3V and GND
 *   - RS485 Module TX (DI)    -> ESP32 TX Pin (Default: GPIO 19)
 *   - RS485 Module RX (RO)    -> ESP32 RX Pin (Default: GPIO 18)
 *   - RS485 DE/RE (if manual) -> Set RE_DE_PIN below, or GND/VCC for auto-flow
 * modules.
 * ==============================================================================
 */

#include <Arduino.h>

// ==========================================
// PIN & COMMUNICATION CONFIGURATION
// (Compatible with 30-pin and 38-pin ESP32 boards)
// ==========================================
// ESP32 supports remapping UART to almost any GPIO pins.
// For 30-pin ESP32 boards, GPIO 18 & GPIO 19 are available on all variants.
#define SENSOR_RX_PIN 18 // ESP32 RX pin (connects to RS485 module RO / TX)
#define SENSOR_TX_PIN 19 // ESP32 TX pin (connects to RS485 module DI / RX)
#define SENSOR_RE_DE_PIN                                                       \
  -1 // Pin for RE/DE flow control (-1 for auto-directional modules)
#define SENSOR_BAUD 4800 // SEN0708 factory default baud rate (8N1)

HardwareSerial ModbusSerial(1); // Use UART1 on ESP32

// Modbus Register Addresses for SEN0708
#define REG_PH_TEMP 0x0000    // Register 0x0000 (pH) & 0x0001 (Temp)
#define REG_SLAVE_ADDR 0x07D0 // Register 0x07D0 (Slave Address)

// Active target address being read in the loop
uint8_t currentTargetAddress = 0x02;

// ==========================================
// FORWARD DECLARATIONS
// ==========================================
uint16_t calculateCRC(const uint8_t *buffer, uint8_t length);
bool sendChangeAddressCommand(uint8_t oldAddr, uint8_t newAddr);
bool readPHTemperature(uint8_t slaveAddr, float &outPH, float &outTemp);
void scanBus();
void printMenu();

// ==========================================
// SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000)
    ; // Wait for Serial Monitor

  Serial.println(
      F("\n========================================================"));
  Serial.println(
      F("   DFRobot SEN0708 pH Sensor Address Configurator        "));
  Serial.println(F("========================================================"));

  if (SENSOR_RE_DE_PIN >= 0) {
    pinMode(SENSOR_RE_DE_PIN, OUTPUT);
    digitalWrite(SENSOR_RE_DE_PIN, LOW); // Receive mode
  }

  ModbusSerial.begin(SENSOR_BAUD, SERIAL_8N1, SENSOR_RX_PIN, SENSOR_TX_PIN);

  delay(1000);
  printMenu();

  // Auto-probe on startup
  Serial.println(F("\n[INFO] Checking sensor connection on Address 0x01..."));
  float testPH, testTemp;
  if (readPHTemperature(0x01, testPH, testTemp)) {
    Serial.printf("[FOUND] Sensor detected on Address 0x01! (pH: %.2f, Temp: "
                  "%.1f deg C)\n",
                  testPH, testTemp);
    Serial.println(
        F("[ACTION] Attempting automatic address change to 0x02..."));
    if (sendChangeAddressCommand(0x01, 0x02)) {
      Serial.println(
          F("[SUCCESS] Sensor address successfully changed to 0x02!"));
      currentTargetAddress = 0x02;
    } else {
      Serial.println(
          F("[FAIL] Could not change address. Try sending '2' manually."));
    }
  } else if (readPHTemperature(0x02, testPH, testTemp)) {
    Serial.printf("[FOUND] Sensor is ALREADY configured at Address 0x02! (pH: "
                  "%.2f, Temp: %.1f deg C)\n",
                  testPH, testTemp);
    currentTargetAddress = 0x02;
  } else {
    Serial.println(F("[WARN] No response on Address 0x01 or 0x02. Run 's' to "
                     "scan all addresses."));
  }
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
  // Check for user commands in Serial Monitor
  if (Serial.available()) {
    char cmd = Serial.read();
    while (Serial.available())
      Serial.read(); // Flush extra chars

    if (cmd == '2') {
      Serial.println(F("\n--- Command: Changing Address 0x01 -> 0x02 ---"));
      if (sendChangeAddressCommand(0x01, 0x02)) {
        Serial.println(F("[SUCCESS] Sensor address is now 0x02!"));
        currentTargetAddress = 0x02;
      } else {
        Serial.println(F("[FAIL] No acknowledgment from Address 0x01."));
      }
    } else if (cmd == '1') {
      Serial.println(
          F("\n--- Command: Changing Address 0x02 -> 0x01 (Reset) ---"));
      if (sendChangeAddressCommand(0x02, 0x01)) {
        Serial.println(F("[SUCCESS] Sensor address reset to 0x01!"));
        currentTargetAddress = 0x01;
      } else {
        Serial.println(F("[FAIL] No acknowledgment from Address 0x02."));
      }
    } else if (cmd == 's' || cmd == 'S') {
      scanBus();
    } else if (cmd == 'm' || cmd == 'M' || cmd == '?') {
      printMenu();
    }
  }

  // Periodic live reading from current target address
  static unsigned long lastReadTime = 0;
  if (millis() - lastReadTime >= 2000) {
    lastReadTime = millis();
    float ph = 0.0, temp = 0.0;
    if (readPHTemperature(currentTargetAddress, ph, temp)) {
      Serial.printf(
          "[LIVE READ | Addr 0x%02X] pH: %.2f  |  Temperature: %.1f deg C\n",
          currentTargetAddress, ph, temp);
    } else {
      Serial.printf("[LIVE READ | Addr 0x%02X] Query Timeout or CRC error.\n",
                    currentTargetAddress);
    }
  }
}

// ==========================================
// HELPER: Print Menu
// ==========================================
void printMenu() {
  Serial.println(F("\nAvailable Commands:"));
  Serial.println(F("  '2' : Change sensor address from 0x01 to 0x02"));
  Serial.println(F("  '1' : Change sensor address from 0x02 back to 0x01"));
  Serial.println(F("  's' : Scan RS485 bus (Addresses 0x01 to 0x10)"));
  Serial.println(F("  'm' : Show this menu"));
}

// ==========================================
// MODBUS: Send Change Address Command (Reg 0x07D0, FC 0x06)
// ==========================================
bool sendChangeAddressCommand(uint8_t oldAddr, uint8_t newAddr) {
  // Frame: [SlaveID] [FC: 0x06] [RegHigh: 0x07] [RegLow: 0xD0] [ValHigh: 0x00]
  // [ValLow: newAddr] [CRCLow] [CRCHigh]
  uint8_t packet[8];
  packet[0] = oldAddr;
  packet[1] = 0x06;    // Write Single Register
  packet[2] = 0x07;    // Reg 0x07D0 High
  packet[3] = 0xD0;    // Reg 0x07D0 Low
  packet[4] = 0x00;    // Value High
  packet[5] = newAddr; // Value Low (New address)

  uint16_t crc = calculateCRC(packet, 6);
  packet[6] = (uint8_t)(crc & 0xFF);
  packet[7] = (uint8_t)((crc >> 8) & 0xFF);

  // Flush RX buffer
  while (ModbusSerial.available())
    ModbusSerial.read();

  // Transmit
  if (SENSOR_RE_DE_PIN >= 0)
    digitalWrite(SENSOR_RE_DE_PIN, HIGH);
  ModbusSerial.write(packet, 8);
  ModbusSerial.flush();
  if (SENSOR_RE_DE_PIN >= 0)
    digitalWrite(SENSOR_RE_DE_PIN, LOW);

  // Wait for response (Echo frame of 8 bytes)
  unsigned long startTime = millis();
  uint8_t resp[8];
  uint8_t index = 0;

  while (millis() - startTime < 1000 && index < 8) {
    if (ModbusSerial.available()) {
      resp[index++] = ModbusSerial.read();
    }
  }

  if (index == 8) {
    uint16_t respCRC = calculateCRC(resp, 6);
    uint16_t packetCRC = resp[6] | (resp[7] << 8);
    if (respCRC == packetCRC && resp[1] == 0x06 && resp[5] == newAddr) {
      return true;
    }
  }
  return false;
}

// ==========================================
// MODBUS: Read pH and Temperature (Reg 0x0000, 2 Regs, FC 0x03)
// ==========================================
bool readPHTemperature(uint8_t slaveAddr, float &outPH, float &outTemp) {
  // Frame: [SlaveID] [FC: 0x03] [RegHigh: 0x00] [RegLow: 0x00] [CountHigh:
  // 0x00] [CountLow: 0x02] [CRCLow] [CRCHigh]
  uint8_t packet[8];
  packet[0] = slaveAddr;
  packet[1] = 0x03;
  packet[2] = 0x00;
  packet[3] = 0x00;
  packet[4] = 0x00;
  packet[5] = 0x02;

  uint16_t crc = calculateCRC(packet, 6);
  packet[6] = (uint8_t)(crc & 0xFF);
  packet[7] = (uint8_t)((crc >> 8) & 0xFF);

  // Flush RX buffer
  while (ModbusSerial.available())
    ModbusSerial.read();

  // Transmit
  if (SENSOR_RE_DE_PIN >= 0)
    digitalWrite(SENSOR_RE_DE_PIN, HIGH);
  ModbusSerial.write(packet, 8);
  ModbusSerial.flush();
  if (SENSOR_RE_DE_PIN >= 0)
    digitalWrite(SENSOR_RE_DE_PIN, LOW);

  // Response structure: [Addr] [0x03] [ByteCount: 0x04] [pH_H] [pH_L] [Temp_H]
  // [Temp_L] [CRC_L] [CRC_H] (9 bytes)
  unsigned long startTime = millis();
  uint8_t resp[9];
  uint8_t index = 0;

  while (millis() - startTime < 800 && index < 9) {
    if (ModbusSerial.available()) {
      resp[index++] = ModbusSerial.read();
    }
  }

  if (index == 9 && resp[0] == slaveAddr && resp[1] == 0x03 &&
      resp[2] == 0x04) {
    uint16_t respCRC = calculateCRC(resp, 7);
    uint16_t packetCRC = resp[7] | (resp[8] << 8);
    if (respCRC == packetCRC) {
      uint16_t rawPH = (resp[3] << 8) | resp[4];
      int16_t rawTemp = (int16_t)((resp[5] << 8) | resp[6]);

      outPH = rawPH / 100.0f;
      outTemp = rawTemp / 10.0f;
      return true;
    }
  }
  return false;
}

// ==========================================
// HELPER: Scan Modbus Addresses 1 to 10
// ==========================================
void scanBus() {
  Serial.println(F("\n--- Scanning RS485 Bus (Addresses 0x01 to 0x0A) ---"));
  bool foundAny = false;
  for (uint8_t addr = 1; addr <= 10; addr++) {
    float testPH, testTemp;
    if (readPHTemperature(addr, testPH, testTemp)) {
      Serial.printf("  [FOUND] Device responding at Address 0x%02X -> pH: "
                    "%.2f, Temp: %.1f deg C\n",
                    addr, testPH, testTemp);
      currentTargetAddress = addr;
      foundAny = true;
    }
    delay(60);
  }
  if (!foundAny) {
    Serial.println(F("  [INFO] No devices responded on addresses 1 to 10. "
                     "Check wiring / power."));
  }
  Serial.println(F("--- Scan Complete ---\n"));
}

// ==========================================
// CRC-16 Calculation (Modbus RTU Standard)
// ==========================================
uint16_t calculateCRC(const uint8_t *buffer, uint8_t length) {
  uint16_t crc = 0xFFFF;
  for (uint8_t pos = 0; pos < length; pos++) {
    crc ^= (uint16_t)buffer[pos];
    for (uint8_t i = 8; i != 0; i--) {
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
