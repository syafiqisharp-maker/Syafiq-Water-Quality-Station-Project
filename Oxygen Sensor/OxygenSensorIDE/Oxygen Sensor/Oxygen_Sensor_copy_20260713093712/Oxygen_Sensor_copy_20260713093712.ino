/*
  ESP32 Interface sketch for DFRobot RS485 Fluorescence Dissolved Oxygen Sensor (Seawater, SKU: SEN0681)
  
  This sketch implements a robust, library-free Modbus RTU communication protocol to poll 
  the Dissolved Oxygen (DO) concentration, DO saturation, and Temperature values from 
  the sensor every 5 seconds (non-blocking). It also listens on the main USB Serial 
  monitor for the "CAL100" command to execute a 100% atmospheric calibration.
  
  Hardware Connection:
  - ESP32 Board: ESP32 Dev Module
  - RS485-to-TTL hardware converter connected to ESP32 HardwareSerial Serial2
  - Pins Configuration:
      * ESP32 RX2 (GPIO 16) -> Converter TXD / RO (Receive Out)
      * ESP32 TX2 (GPIO 17) -> Converter RXD / DI (Driver In)
      * ESP32 GND          -> Converter GND
      * Converter VCC      -> ESP32 5V (or external 5V)
      * Converter A+       -> Sensor RS485 A (Green wire typically, check datasheet)
      * Converter B-       -> Sensor RS485 B (Yellow wire typically, check datasheet)
  - Sensor Power:
      * Sensor VCC (10-30V DC) -> External Power Supply (12V/24V DC recommended)
      * Sensor GND            -> External Power Supply GND & ESP32 GND (Common Ground)

  Sensor Register Map (Modbus RTU Holding/Input Registers):
  - 0x0000-0x0001: Dissolved Oxygen Saturation (%, IEEE 754 32-bit float across 2 registers)
  - 0x0002-0x0003: Dissolved Oxygen Concentration (mg/L, IEEE 754 32-bit float across 2 registers)
  - 0x0004-0x0005: Temperature (°C, IEEE 754 32-bit float across 2 registers)
  - 0x1010: Calibration Command Register (Write Only, write 0x0002 for 100% air-saturated calibration)
*/

// --- CONFIGURATION CONSTANTS ---
#define SLAVE_ID            0x01      // Sensor Modbus Slave ID (Default is 1)
#define QUERY_INTERVAL_MS   5000      // Sensor polling interval (5 seconds)
#define MODBUS_TIMEOUT_MS   1000      // Serial timeout waiting for response (1 second)

// Modbus Register Addresses
#define REG_DO_SATURATION   0x0000    // Saturation address
#define REG_DO_CONCENTRATION 0x0002   // Concentration address
#define REG_TEMPERATURE     0x0004    // Temperature address
#define CALIBRATION_REG     0x1010    // Calibration command register
#define CALIBRATION_VAL_100 0x0002    // Command value for 100% saturation calibration

// Modbus Function Codes
#define MODBUS_FC_READ      0x03      // 0x03 Read Holding Registers (or 0x04 Read Input Registers)
#define MODBUS_FC_WRITE     0x06      // 0x06 Write Single Register

// Debugging Switch
// Set to true to print the raw transmitted (TX) and received (RX) hexadecimal byte frames.
// This is extremely helpful for verifying physical wiring and finding electrical noise issues.
const bool DEBUG_MODE = true;

// Optional: RS485 Converter RE/DE Enable Pin
// If your RS485 module has RE (Receiver Enable) and DE (Driver Enable) control pins connected together:
// Set this to the GPIO pin number (e.g. GPIO 4). If your module has automatic flow direction control,
// set this to -1.
#define RS485_RE_DE_PIN    -1

// --- GLOBAL VARIABLES ---
unsigned long lastQueryTime = 0;      // Stores the timestamp of the last query
String inputBuffer = "";              // Stores incoming Serial monitor commands

// --- FUNCTION PROTOTYPES ---
uint16_t calculateCRC(const uint8_t *buf, int len);
float registersToFloat(uint16_t highReg, uint16_t lowReg);
void printHexFrame(const char* label, const uint8_t* buf, int len);
bool readModbusRegisters(uint8_t slaveId, uint8_t functionCode, uint16_t startAddress, uint16_t quantity, uint16_t *destBuffer);
bool writeModbusRegister(uint8_t slaveId, uint16_t regAddress, uint16_t value);
void querySensorData();
void runCalibrationSequence();
void checkSerialCommands();

// ==========================================
// Setup Function
// ==========================================
void setup() {
  // Initialize standard Serial monitor for PC communication
  Serial.begin(115200);
  delay(500); // Small delay to allow ESP32 UART to stabilize
  Serial.println("\n========================================================");
  Serial.println("ESP32 DFRobot RS485 Dissolved Oxygen Sensor (SKU: SEN0681)");
  Serial.println("========================================================");
  Serial.print("Initializing HardwareSerial Serial2 (RX2=GPIO16, TX2=GPIO17) at 4800 baud...");
  
  // Initialize Serial2 for Modbus RTU at 4800 bps, 8N1
  Serial2.begin(4800, SERIAL_8N1, 16, 17);
  Serial.println(" OK");

  // Configure optional RE/DE Pin if used
  if (RS485_RE_DE_PIN >= 0) {
    pinMode(RS485_RE_DE_PIN, OUTPUT);
    digitalWrite(RS485_RE_DE_PIN, LOW); // Put in RX (Receive) mode by default
    Serial.print("RS485 RE/DE flow control configured on GPIO ");
    Serial.println(RS485_RE_DE_PIN);
  } else {
    Serial.println("RS485 flow control set to Automatic (no RE/DE pin).");
  }

  Serial.println("System ready. Polling sensor every 5 seconds...");
  Serial.println("Send 'CAL100' in Serial Monitor to start 100% calibration.");
  Serial.println("========================================================\n");

  // Run the first query immediately
  querySensorData();
  lastQueryTime = millis();
}

// ==========================================
// Main Loop
// ==========================================
void loop() {
  // 1. Listen for commands from the main USB Serial Monitor
  checkSerialCommands();

  // 2. Poll the sensor every 5 seconds (non-blocking)
  unsigned long currentMillis = millis();
  if (currentMillis - lastQueryTime >= QUERY_INTERVAL_MS) {
    lastQueryTime = currentMillis;
    querySensorData();
  }
}

// ==========================================
// Sensor Query Logic
// ==========================================
void querySensorData() {
  // Each parameter occupies 2 consecutive Modbus registers (4 bytes = IEEE 754 32-bit float)
  uint16_t regsSaturation[2] = {0, 0};
  uint16_t regsConcentration[2] = {0, 0};
  uint16_t regsTemperature[2] = {0, 0};

  bool satSuccess = false;
  bool conSuccess = false;
  bool tempSuccess = false;

  // We query each parameter as a pair of 2 registers.
  // The sensor stores IEEE 754 32-bit floats across consecutive register pairs.
  
  // Query 1: DO Saturation (registers 0x0000-0x0001, 2 registers)
  satSuccess = readModbusRegisters(SLAVE_ID, MODBUS_FC_READ, REG_DO_SATURATION, 2, regsSaturation);
  delay(50); // Inter-frame delay for RS485 line settling

  // Query 2: DO Concentration (registers 0x0002-0x0003, 2 registers)
  conSuccess = readModbusRegisters(SLAVE_ID, MODBUS_FC_READ, REG_DO_CONCENTRATION, 2, regsConcentration);
  delay(50);

  // Query 3: Temperature (registers 0x0004-0x0005, 2 registers)
  tempSuccess = readModbusRegisters(SLAVE_ID, MODBUS_FC_READ, REG_TEMPERATURE, 2, regsTemperature);

  // Parse and display results if all transactions succeeded
  if (satSuccess && conSuccess && tempSuccess) {
    // Convert register pairs to IEEE 754 32-bit float values
    float doSaturation = registersToFloat(regsSaturation[0], regsSaturation[1]);
    float doConcentration = registersToFloat(regsConcentration[0], regsConcentration[1]);
    float temperature = registersToFloat(regsTemperature[0], regsTemperature[1]);

    Serial.println("--- SENSOR DATA READ SUCCESSFUL ---");
    Serial.print("DO Saturation    : ");
    Serial.print(doSaturation, 1);
    Serial.println(" %");

    Serial.print("DO Concentration : ");
    Serial.print(doConcentration, 2);
    Serial.println(" mg/L");

    Serial.print("Temperature      : ");
    Serial.print(temperature, 1);
    Serial.println(" °C");
    Serial.println("-----------------------------------\n");
  } else {
    // Print diagnostic information
    Serial.println("[ERROR] Modbus transaction failed!");
    if (!satSuccess) Serial.println(" -> DO Saturation read failed (Timeout or Checksum/CRC error)");
    if (!conSuccess) Serial.println(" -> DO Concentration read failed (Timeout or Checksum/CRC error)");
    if (!tempSuccess) Serial.println(" -> Temperature read failed (Timeout or Checksum/CRC error)");
    Serial.println();
  }
}

// ==========================================
// Calibration Execution
// ==========================================
void runCalibrationSequence() {
  Serial.println("\n========================================================");
  Serial.println("WARNING: Starting 100% Atmospheric Calibration.");
  Serial.println("Ensure probe is in water-saturated air (e.g. above water surface)...");
  Serial.println("========================================================");
  
  // 5-second countdown with visual feedback (simple blocking sequence is fine for calibration)
  for (int i = 5; i > 0; i--) {
    Serial.print("Calibrating in ");
    Serial.print(i);
    Serial.println(" seconds...");
    delay(1000);
  }
  
  Serial.println("Transmitting Modbus single write command to register 0x1010...");
  
  // Write value 0x0002 to register 0x1010
  bool success = writeModbusRegister(SLAVE_ID, CALIBRATION_REG, CALIBRATION_VAL_100);
  
  if (success) {
    Serial.println("\n>>> SUCCESS: 100% Calibration Command TRANSMITTED Successfully! <<<");
    Serial.println("The sensor is now processing calibration parameters.");
  } else {
    Serial.println("\n>>> ERROR: Calibration Command Transmission FAILED! <<<");
    Serial.println("Check electrical wiring, external 12V/24V power, and Modbus settings.");
  }
  Serial.println("========================================================\n");

  // Reset the query timer to ensure we don't trigger a read cycle immediately after calibration
  lastQueryTime = millis();
}

// ==========================================
// Serial Monitor Input Listener
// ==========================================
void checkSerialCommands() {
  while (Serial.available() > 0) {
    char ch = Serial.read();
    if (ch == '\n' || ch == '\r') {
      if (inputBuffer.length() > 0) {
        inputBuffer.trim(); // Strip carriage return, newline, and spaces
        if (inputBuffer.equals("CAL100")) {
          runCalibrationSequence();
        } else {
          Serial.print("Received unknown command: ");
          Serial.println(inputBuffer);
        }
        inputBuffer = ""; // Reset the command buffer
      }
    } else {
      // Buffer guard to prevent memory exhaustion
      if (inputBuffer.length() < 32) {
        inputBuffer += ch;
      }
    }
  }
}

// ==========================================
// Modbus RTU Read Transaction Handler
// ==========================================
bool readModbusRegisters(uint8_t slaveId, uint8_t functionCode, uint16_t startAddress, uint16_t quantity, uint16_t *destBuffer) {
  // Construct Request Packet (8 bytes)
  // [Slave Address] [Function Code] [Start Addr High] [Start Addr Low] [Count High] [Count Low] [CRC Low] [CRC High]
  uint8_t request[8];
  request[0] = slaveId;
  request[1] = functionCode;
  request[2] = (startAddress >> 8) & 0xFF;
  request[3] = startAddress & 0xFF;
  request[4] = (quantity >> 8) & 0xFF;
  request[5] = quantity & 0xFF;

  uint16_t crc = calculateCRC(request, 6);
  request[6] = crc & 0xFF;        // Modbus CRC is sent low-byte first
  request[7] = (crc >> 8) & 0xFF;

  // Clear serial RX buffer before sending request to discard any stale data
  while (Serial2.available() > 0) {
    Serial2.read();
  }

  // Toggle Transmit Enable on RS485 converter if RE/DE is used
  if (RS485_RE_DE_PIN >= 0) {
    digitalWrite(RS485_RE_DE_PIN, HIGH);
  }

  // Transmit command frame
  Serial2.write(request, 8);
  Serial2.flush(); // Ensure all bytes are shifted out of UART TX register

  // Toggle Receive Enable on RS485 converter if RE/DE is used
  if (RS485_RE_DE_PIN >= 0) {
    digitalWrite(RS485_RE_DE_PIN, LOW);
  }

  if (DEBUG_MODE) {
    printHexFrame("TX -> ", request, 8);
  }

  // Read response frame
  // Expected size: 5 bytes of overhead + 2 bytes per register
  // Frame: [SlaveID] [FuncCode] [ByteCount] [Data_H] [Data_L] ... [CRC Low] [CRC High]
  int expectedLength = 5 + (2 * quantity);
  uint8_t response[64];
  int bytesRead = 0;
  unsigned long startMillis = millis();

  // Non-blocking read with timeout guard
  while (bytesRead < expectedLength && (millis() - startMillis < MODBUS_TIMEOUT_MS)) {
    if (Serial2.available() > 0) {
      response[bytesRead++] = Serial2.read();
    }
    yield(); // Yield to prevent watchdog reset on ESP32
  }

  if (DEBUG_MODE) {
    printHexFrame("RX <- ", response, bytesRead);
  }

  // 1. Timeout Check
  if (bytesRead < expectedLength) {
    return false;
  }

  // 2. Slave ID Check
  if (response[0] != slaveId) {
    return false;
  }

  // 3. Exception Response Check (Function code ORed with 0x80)
  if (response[1] == (functionCode | 0x80)) {
    Serial.print("[MODBUS EXCEPTION] Sensor returned error code: 0x");
    Serial.println(response[2], HEX);
    return false;
  }

  // 4. Function Code Check
  if (response[1] != functionCode) {
    return false;
  }

  // 5. Byte Count Check
  uint8_t expectedByteCount = 2 * quantity;
  if (response[2] != expectedByteCount) {
    return false;
  }

  // 6. CRC Verification
  uint16_t receivedCRC = response[expectedLength - 2] | (response[expectedLength - 1] << 8);
  uint16_t calculatedCRC = calculateCRC(response, expectedLength - 2);
  if (receivedCRC != calculatedCRC) {
    return false;
  }

  // Parse bytes into big-endian uint16_t values
  for (int i = 0; i < quantity; i++) {
    int dataIndex = 3 + (2 * i);
    destBuffer[i] = (response[dataIndex] << 8) | response[dataIndex + 1];
  }

  return true;
}

// ==========================================
// Modbus RTU Write Transaction Handler
// ==========================================
bool writeModbusRegister(uint8_t slaveId, uint16_t regAddress, uint16_t value) {
  // Construct Request Packet (8 bytes)
  // [Slave Address] [Function Code 0x06] [Reg Address High] [Reg Address Low] [Value High] [Value Low] [CRC Low] [CRC High]
  uint8_t request[8];
  request[0] = slaveId;
  request[1] = MODBUS_FC_WRITE;
  request[2] = (regAddress >> 8) & 0xFF;
  request[3] = regAddress & 0xFF;
  request[4] = (value >> 8) & 0xFF;
  request[5] = value & 0xFF;

  uint16_t crc = calculateCRC(request, 6);
  request[6] = crc & 0xFF;
  request[7] = (crc >> 8) & 0xFF;

  // Clear serial RX buffer
  while (Serial2.available() > 0) {
    Serial2.read();
  }

  // Toggle Transmit Enable if RE/DE is used
  if (RS485_RE_DE_PIN >= 0) {
    digitalWrite(RS485_RE_DE_PIN, HIGH);
  }

  // Transmit command
  Serial2.write(request, 8);
  Serial2.flush();

  // Toggle Receive Enable if RE/DE is used
  if (RS485_RE_DE_PIN >= 0) {
    digitalWrite(RS485_RE_DE_PIN, LOW);
  }

  if (DEBUG_MODE) {
    printHexFrame("TX -> ", request, 8);
  }

  // Read response. A successful single write Modbus transaction returns
  // an identical echo frame (8 bytes).
  int expectedLength = 8;
  uint8_t response[8];
  int bytesRead = 0;
  unsigned long startMillis = millis();

  while (bytesRead < expectedLength && (millis() - startMillis < MODBUS_TIMEOUT_MS)) {
    if (Serial2.available() > 0) {
      response[bytesRead++] = Serial2.read();
    }
    yield();
  }

  if (DEBUG_MODE) {
    printHexFrame("RX <- ", response, bytesRead);
  }

  // 1. Timeout Check
  if (bytesRead < expectedLength) {
    return false;
  }

  // 2. Slave ID Check
  if (response[0] != slaveId) {
    return false;
  }

  // 3. Exception Check (0x86)
  if (response[1] == (MODBUS_FC_WRITE | 0x80)) {
    Serial.print("[MODBUS WRITE EXCEPTION] Sensor returned error code: 0x");
    Serial.println(response[2], HEX);
    return false;
  }

  // 4. Function Code Check
  if (response[1] != MODBUS_FC_WRITE) {
    return false;
  }

  // 5. Echo Address and Value Verification
  uint16_t rxAddress = (response[2] << 8) | response[3];
  uint16_t rxValue = (response[4] << 8) | response[5];
  if (rxAddress != regAddress || rxValue != value) {
    return false;
  }

  // 6. CRC Verification
  uint16_t receivedCRC = response[6] | (response[7] << 8);
  uint16_t calculatedCRC = calculateCRC(response, 6);
  if (receivedCRC != calculatedCRC) {
    return false;
  }

  return true;
}

// ==========================================
// IEEE 754 Float Conversion from Modbus Register Pair
// ==========================================
// Converts two big-endian 16-bit Modbus registers into a 32-bit IEEE 754 float.
// highReg = register at lower address (contains MSB of float)
// lowReg  = register at higher address (contains LSB of float)
float registersToFloat(uint16_t highReg, uint16_t lowReg) {
  uint32_t combined = ((uint32_t)highReg << 16) | (uint32_t)lowReg;
  float result;
  memcpy(&result, &combined, sizeof(result));
  return result;
}

// ==========================================
// Modbus RTU CRC-16 Calculation
// ==========================================
uint16_t calculateCRC(const uint8_t *buf, int len) {
  uint16_t crc = 0xFFFF;
  for (int pos = 0; pos < len; pos++) {
    crc ^= (uint16_t)buf[pos];          // XOR byte into LSB of CRC
    for (int i = 8; i != 0; i--) {      // Loop through each bit
      if ((crc & 0x0001) != 0) {        // If LSB is 1
        crc >>= 1;                      // Shift right and XOR with polynomial 0xA001
        crc ^= 0xA001;
      } else {                          // Else just shift right
        crc >>= 1;
      }
    }
  }
  return crc;
}

// ==========================================
// Hex Frame Printer Helper
// ==========================================
void printHexFrame(const char* label, const uint8_t* buf, int len) {
  Serial.print(label);
  for (int i = 0; i < len; i++) {
    if (buf[i] < 0x10) Serial.print("0");
    Serial.print(buf[i], HEX);
    Serial.print(" ");
  }
  Serial.println();
}
