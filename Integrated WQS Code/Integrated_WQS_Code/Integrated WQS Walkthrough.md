# Integrated Water Quality Station (WQS) - Complete Documentation & Walkthrough

Welcome to the **Integrated Water Quality Station (WQS)** project! This comprehensive guide provides everything a developer, engineer, or technician needs to understand the system architecture, code functions, file structure, physical GPIO wiring, calibration procedures, and operational workflows.

---

## 🌊 1. System Overview & Core Capabilities

The **Integrated Water Quality Station (WQS)** is an industrial-grade environmental telemetry station powered by an **ESP32-S3 (N16R8)** microcontroller (16MB Flash, 8MB PSRAM). It continuously acquires, processes, displays, and transmits multi-parameter water quality data in real time.

### Monitored Parameters:
1. **Dissolved Oxygen (DO):**
   * **Sensor:** DFRobot RS485 Fluorescence Dissolved Oxygen Sensor (SKU: `SEN0681`).
   * **Protocol:** RS485 Modbus RTU (Serial2, 4800 baud).
   * **Metrics:** Saturation Percentage (`%`), Concentration (`mg/L`), and Water Temperature (`°C`).
2. **pH Level:**
   * **Sensor:** Gravity Analog pH Sensor V2.
   * **Protocol:** Analog ADC with 20-sample trimmed-mean oversampling and automatic temperature compensation.
   * **Range:** $0.00 - 14.00\text{ pH}$.
3. **Turbidity:**
   * **Sensor:** Analog Turbidity Optical Sensor.
   * **Protocol:** Analog ADC with 1/2 voltage divider and Beer-Lambert non-linear curve fitting.
   * **Range:** $0.0\% - 100.0\%$ (Relative Cleanliness Scale).

### Output & Telemetry:
* **Local Visual Display:** 20x4 Character I2C LCD (Model 2004A) with differential line-buffer caching (zero display flicker).
* **Wireless Telemetry:** SX1278 LoRa Ra-02 (433 MHz) long-range transceiver broadcasting sensor telemetry packets to a central receiver gateway.
* **Non-Blocking Architecture:** 100% `millis()` time-sliced state machine with zero blocking `delay()` calls during operation or calibration.

---

## 📂 2. File Organization & Code Map

All source code is located in the directory: `Integrated WQS Code/Integrated_WQS_Code/`.

```
Integrated_WQS_Code/
├── Integrated_WQS_Code.ino   # Main application orchestration & non-blocking state machine
├── Config.h                  # Central pinout definitions, timings, and WQSData struct
├── DOSensor.h / .cpp         # RS485 Modbus RTU driver for DFRobot DO Sensor (SEN0681)
├── PHSensor.h / .cpp         # Analog pH sensor driver with oversampling & calibration
├── TurbiditySensor.h / .cpp  # Analog Turbidity driver with NVS baseline persistence
├── DisplayManager.h / .cpp   # Anti-flicker 20x4 I2C LCD layout manager
├── ButtonHandler.h / .cpp    # Debounced short/long press physical button handler
├── LoRaTransmitter.h / .cpp  # SX1278 SPI LoRa transmitter with auto-reconnect
└── Integrated WQS Walkthrough.md # This complete technical documentation
```

### Module Responsibilities:

| File | Purpose | Key Functions / Methods |
| :--- | :--- | :--- |
| [`Integrated_WQS_Code.ino`](file:///c:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/Integrated%20WQS%20Code/Integrated_WQS_Code/Integrated_WQS_Code.ino) | Top-level state router, scheduling loop, serial command processor, button event dispatcher. | `setup()`, `loop()`, `handleNormalMode()`, `handleDOCalibrationMode()`, `handlePHCalibrationMode()`, `handleTurbidityCalibrationMode()` |
| [`Config.h`](file:///c:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/Integrated%20WQS%20Code/Integrated_WQS_Code/Config.h) | Central hardware pin mapping, Modbus register IDs, LoRa parameters, timing constants, and `WQSData` struct definition. | Struct `WQSData`, GPIO definitions (`PH_PIN`, `TURBIDITY_PIN`, `DO_RX_PIN`, `LORA_...`) |
| [`DOSensor.h`](file:///c:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/Integrated%20WQS%20Code/Integrated_WQS_Code/DOSensor.h) / [`.cpp`](file:///c:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/Integrated%20WQS%20Code/Integrated_WQS_Code/DOSensor.cpp) | Encapsulates RS485 Modbus RTU communication over `Serial2`, CRC16 validation, registers-to-float IEEE-754 parsing, and 100% saturation write commands. | `begin()`, `query()`, `sendCalibrationCommand()`, `getSaturation()`, `getConcentration()`, `getTemperature()`, `isDataValid()` |
| [`PHSensor.h`](file:///c:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/Integrated%20WQS%20Code/Integrated_WQS_Code/PHSensor.h) / [`.cpp`](file:///c:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/Integrated%20WQS%20Code/Integrated_WQS_Code/PHSensor.cpp) | Handles ESP32 SAR ADC oversampling (20 samples, trim-mean), temperature-compensated pH conversion via `DFRobot_PH`, and NVS flash calibration saving. | `begin()`, `update(temp)`, `sendCalibrationCommand(temp, cmd)`, `getPH()`, `getVoltage()`, `isDataValid()` |
| [`TurbiditySensor.h`](file:///c:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/Integrated%20WQS%20Code/Integrated_WQS_Code/TurbiditySensor.h) / [`.cpp`](file:///c:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/Integrated%20WQS%20Code/Integrated_WQS_Code/TurbiditySensor.cpp) | Samples analog voltage through a voltage divider, maps voltage to percentage turbidity, saves `vClean` calibration reference to NVS Preferences. | `begin()`, `getTurbidityPct()`, `calibrateCleanWater()`, `getVClean()`, `isDataValid()` |
| [`DisplayManager.h`](file:///c:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/Integrated%20WQS%20Code/Integrated_WQS_Code/DisplayManager.h) / [`.cpp`](file:///c:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/Integrated%20WQS%20Code/Integrated_WQS_Code/DisplayManager.cpp) | Controls 20x4 I2C LCD with differential line-buffer caching (only writes characters that changed, preventing flicker). | `begin()`, `showNormalScreen(WQSData, loraActive)`, `showDOCalibrationScreen()`, `showPHCalibrationScreen()`, `showTurbidityCalibrationScreen()` |
| [`ButtonHandler.h`](file:///c:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/Integrated%20WQS%20Code/Integrated_WQS_Code/ButtonHandler.h) / [`.cpp`](file:///c:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/Integrated%20WQS%20Code/Integrated_WQS_Code/ButtonHandler.cpp) | Non-blocking debounce filter detecting short press (< 2s) and long press (≥ 2s). | `begin()`, `update()`, `isShortPressed()`, `isLongPressed()`, `isPressed()` |
| [`LoRaTransmitter.h`](file:///c:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/Integrated%20WQS%20Code/Integrated_WQS_Code/LoRaTransmitter.h) / [`.cpp`](file:///c:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/Integrated%20WQS%20Code/Integrated_WQS_Code/LoRaTransmitter.cpp) | Manages SX1278 SPI LoRa module initialization, non-blocking auto-reconnect every 30s, and packet formatting. | `begin()`, `maintain(millis)`, `sendData(WQSData)`, `isInitialized()` |

---

## 🔌 3. Hardware Connections & GPIO Pinout Table

Wiring connections for the **ESP32-S3 44-Pin Board**:

```
                                  +-----------------------+
                                  |   ESP32-S3 (44-Pin)   |
                                  +-----------------------+
    [pH Sensor (A)] ------------> | GPIO 4  (ADC1_CH3)    |
    [Turbidity OUT] -> Divider -> | GPIO 5  (ADC1_CH4)    |
    [LoRa RST] -----------------> | GPIO 6                |
    [LoRa DIO0] ----------------> | GPIO 7                |
    [I2C LCD SDA] --------------> | GPIO 8                |
    [I2C LCD SCL] --------------> | GPIO 9                |
    [LoRa NSS / CS] ------------> | GPIO 10               |
    [LoRa SCK] -----------------> | GPIO 11               |
    [Button 1: DO/Turb] --------> | GPIO 12 (to GND)      |
    [Button 2: pH] -------------> | GPIO 13 (to GND)      |
    [LoRa MOSI] ----------------> | GPIO 14               |
    [LoRa MISO] ----------------> | GPIO 15               |
    [RS485 RO / RXD] -----------> | GPIO 16 (RX2)         |
    [RS485 DI / TXD] -----------> | GPIO 17 (TX2)         |
                                  +-----------------------+
```

### Complete Pinout Specification:

| Peripheral / Module | Module Pin | ESP32-S3 Pin | Voltage Level | Notes / Wiring Guidance |
| :--- | :--- | :--- | :--- | :--- |
| **I2C LCD 2004A** | `SDA` | **GPIO 8** | 3.3V / 5V Bus | I2C Data line |
| *(PCF8574 Backpack)* | `SCL` | **GPIO 9** | 3.3V / 5V Bus | I2C Clock line |
| | `VCC` | **5V (VIN / VBUS)** | 5.0V | LCD 2004A requires 5V for optimal backlight/contrast |
| | `GND` | **GND** | 0V | Common ground |
| **RS485-to-TTL Adapter** | `RO` (RXD) | **GPIO 16 (RX2)**| 3.3V logic | RS485 Receiver Output to ESP32 RX |
| *(DO Sensor SEN0681)* | `DI` (TXD) | **GPIO 17 (TX2)**| 3.3V logic | ESP32 TX to RS485 Driver Input |
| | `VCC` | **5V / 3.3V** | 3.3V - 5V | Match RS485 module specs |
| | `GND` | **GND** | 0V | Common ground |
| **DFRobot DO Sensor** | `Brown (VCC)` | **External 12V/24V**| 9V - 24V DC | Sensor power input |
| | `Black (GND)` | **Common GND** | 0V | Tie RS485 GND and 12V PSU GND together |
| | `Blue (A+)` | **RS485 Module A** | Differential | Modbus Differential A+ |
| | `White (B-)` | **RS485 Module B** | Differential | Modbus Differential B- |
| **Analog pH Sensor V2** | `Signal (A)` | **GPIO 4 (ADC1_CH3)**| Analog (0-3V)| Dedicated low-noise ADC1 channel |
| | `VCC (+)` | **5V / 3.3V** | 3.3V - 5V | Gravity interface power |
| | `GND (-)` | **GND** | 0V | Common ground |
| **Analog Turbidity Sensor**| `Signal OUT`| **GPIO 5 (ADC1_CH4)**| Analog (0-3V)| **Requires 1/2 Voltage Divider** (e.g., $10\text{k}\Omega / 10\text{k}\Omega$) before ESP32 pin! |
| | `VCC` | **5V** | 5.0V | Turbidity LED/Photodiode requires 5V |
| | `GND` | **GND** | 0V | Common ground |
| **LoRa Ra-02 (SX1278)** | `NSS / CS` | **GPIO 10** | 3.3V SPI | SPI Chip Select |
| *(433 MHz SPI Module)* | `SCK` | **GPIO 11** | 3.3V SPI | SPI Master Clock |
| | `MOSI` | **GPIO 14** | 3.3V SPI | SPI Master Out Slave In |
| | `MISO` | **GPIO 15** | 3.3V SPI | SPI Master In Slave Out |
| | `RST` | **GPIO 6** | 3.3V logic | Hardware Reset Pin |
| | `DIO0` | **GPIO 7** | 3.3V logic | Packet RX/TX Interrupt pin |
| | `VCC` | **3.3V ONLY** | **3.3V MAX** | ⚠️ **DO NOT CONNECT TO 5V!** (Will damage SX1278) |
| | `GND` | **GND** | 0V | Common ground |
| **Physical Button 1** | Terminal 1 | **GPIO 12** | Pull-up (3.3V) | Active LOW (Internal pull-up enabled) |
| *(DO / Turbidity)* | Terminal 2 | **GND** | 0V | Connect directly to Ground |
| **Physical Button 2** | Terminal 1 | **GPIO 13** | Pull-up (3.3V) | Active LOW (Internal pull-up enabled) |
| *(pH Calibration)* | Terminal 2 | **GND** | 0V | Connect directly to Ground |

---

## 🎛️ 4. Physical Button Controls & Calibration Guide

The station features two multi-function physical tactile buttons using non-blocking debounce logic:

```
+-------------------------------------------------------------+
|                     BUTTON CONTROL MATRIX                   |
+--------------------------+----------------------------------+
| Button 1 (GPIO 12)       | Short Press (< 2s) -> DO 100% Cal|
|                          | Long Press (≥ 2s)  -> Turbidity  |
+--------------------------+----------------------------------+
| Button 2 (GPIO 13)       | Short Press -> Enter / Cal pH    |
|                          | Long Press (≥ 2s)  -> Exit & Save|
+--------------------------+----------------------------------+
```

---

### Calibration Procedure 1: Dissolved Oxygen (DO) 100% Saturation Calibration
1. **Probe Preparation:** Rinse the DO probe membrane with clean water, gently dab dry with lint-free tissue, and hold the probe suspended in water-saturated air (e.g., inside an open bottle above water surface, without submerging the membrane).
2. **Trigger:**
   * **Via Button:** **Short Press Button 1 (GPIO 12)** (< 2 seconds), OR
   * **Via Serial Monitor:** Type `CAL100` and press **Enter**.
3. **Execution:**
   * The LCD and Serial Monitor show a **5-second countdown** (`Starting in 5s...`).
   * When countdown hits 0, the ESP32 issues Modbus command `0x1010` with value `0x0002` to the sensor.
   * The screen displays `>>> SUCCESS: 100% Calibration Command SENT <<<` for 3 seconds and automatically returns to normal monitoring mode.

---

### Calibration Procedure 2: pH Sensor 2-Point Calibration (pH 4.0 & pH 7.0)
1. **Standard Solutions:** Prepare standard calibration buffer solutions (pH 7.00 neutral buffer and pH 4.00 acidic buffer).
2. **Step 1 - Enter Calibration Mode:**
   * **Via Button:** **Short Press Button 2 (GPIO 13)** once.
   * **Via Serial Monitor:** Type `enterph` and press **Enter**.
   * The LCD transitions to the `* pH CALIBRATION *` screen showing live probe millivolts, current pH, and auto-detected buffer (`Buffer: 7.0 (1500mV)`).
3. **Step 2 - Calibrate pH 7.00 Solution:**
   * Immerse the probe in **pH 7.00 buffer**, swirl gently, and wait for the millivolt reading on the screen to stabilize.
   * **Short Press Button 2 (GPIO 13)** (or type `calph` in Serial Monitor).
   * The LCD shows `>>> Calibrated! <<<`.
4. **Step 3 - Calibrate pH 4.00 Solution:**
   * Rinse the probe with distilled water, dab dry, and place into **pH 4.00 buffer**.
   * Wait for the voltage to stabilize.
   * **Short Press Button 2 (GPIO 13)** (or type `calph` in Serial Monitor).
   * The LCD confirms calibration for the acidic point.
5. **Step 4 - Save and Exit:**
   * **Press and HOLD Button 2 (GPIO 13) for ≥ 2 seconds** (or type `exitph` in Serial Monitor).
   * The calibration slopes and zero-point offsets are saved to non-volatile flash storage (`EEPROM.commit()`).
   * The LCD clears and returns to normal monitoring mode.

---

### Calibration Procedure 3: Turbidity Clean Water Reference (`vClean`)
1. **Probe Preparation:** Thoroughly clean the optical turbidity sensor head with distilled water and a soft microfiber cloth.
2. **Clean Water Setup:** Place the sensor into a container of perfectly clean, clear water (distilled or purified water).
   > [!IMPORTANT]
   > Optical turbidity sensors are highly sensitive to ambient light. Shield the container from direct sunlight or bright fluorescent overhead lights during calibration.
3. **Trigger:**
   * **Press and HOLD Button 1 (GPIO 12) for ≥ 2 seconds**.
4. **Execution:**
   * The LCD displays `* TURB CALIBRATION * | Reading sensor...`.
   * The system samples the sensor 10 times with trim-mean averaging to calculate the baseline clean water voltage (`vClean`).
   * The new reference voltage is written to ESP32 NVS flash via the `Preferences` library (`_preferences.putFloat("vClean", _vClean)`).
   * The LCD displays `Ref: X.XX V Set! | >>> CAL SUCCESS <<<` for 3 seconds before smoothly returning to normal operation.

---

## 🛠️ 5. Serial Monitor Command Reference

Open the Arduino IDE Serial Monitor at **115200 baud** with line endings set to **Newline (NL)** or **Both NL & CR**:

| Command | Allowed Modes | Action Performed |
| :--- | :--- | :--- |
| `CAL100` | Normal Mode | Triggers 5-second countdown and sends 100% DO saturation calibration command to Modbus sensor. |
| `enterph` | Normal Mode | Switches station to pH Calibration Mode with real-time temperature compensation. |
| `calph` | pH Calibration Mode | Analyzes current buffer voltage, computes slope/offset for pH 4.0 or 7.0, and stages parameters. |
| `exitph` | pH Calibration Mode | Commits pH calibration parameters to NVS flash memory and returns to Normal Mode. |
| Custom string | pH Calibration Mode | Forwards raw diagnostic command to the `DFRobot_PH` underlying library. |

---

## 📡 6. LoRa Telemetry Packet Format

Every 5 seconds (`POLL_INTERVAL_MS = 5000`), the station transmits a formatted ASCII telemetry packet on **433.0 MHz** (Sync Word `0xF3`):

### Packet Structure:
```
pH:<phVal>,Turb:<turbVal>,DO:<concVal>,Sat:<satVal>,Temp:<tempVal>
```

### Example Packet:
```
pH:7.42,Turb:3.5,DO:6.85,Sat:92.4,Temp:28.6
```

* **Fault-Tolerant Fallback:** If any sensor reading is invalid or disconnected, the value is transmitted as `N/A` (e.g. `DO:N/A,Sat:N/A`), preventing corrupt data from poisoning downstream dashboards.
* **Auto-Reconnect:** If the LoRa transceiver disconnects or fails SPI initialization on boot, `LoRaTransmitter::maintain()` automatically retries non-blocking re-initialization every 30 seconds without freezing the sensor loops.

---

## ⚙️ 7. Arduino IDE Board & Build Configuration

When uploading firmware to the **ESP32-S3 N16R8**:

### 1. Board Settings in Arduino IDE:
* **Board:** `ESP32S3 Dev Module`
* **Flash Size:** `16MB (128Mb)`
* **PSRAM:** `OPI PSRAM` (or `Enabled`)
* **USB Mode:** `Hardware CDC and JTAG`
* **USB CDC On Boot:** `Enabled` *(Crucial: allows `Serial.print` over native USB CDC)*
* **Partition Scheme:** `16M Flash (3MB APP / 9.9MB FATFS)` or `16M Flash (2MB APP / 12.5MB SPIFFS)`
* **Upload Speed:** `921600`

### 2. Required Arduino Libraries:
Install the following libraries via the Arduino IDE Library Manager (**Tools > Manage Libraries...**):
1. **`LiquidCrystal_I2C`** by Frank de Brabander (for 2004A LCD).
2. **`DFRobot_PH`** by DFRobot (for pH calibration & temperature compensation).
3. **`LoRa`** by Sandeep Mistry (for SX1278 SPI LoRa transceiver).

---

## 🏗️ 8. Software Architecture & Design Principles

1. **Non-Blocking Finite State Machine (FSM):**
   * Uses `millis()` time-slicing across all operational loops.
   * Eliminates system freezes during multi-second screen displays or sensor timeouts.
2. **Unified Data Container (`WQSData`):**
   * All sensor readings and boolean health flags (`doValid`, `phValid`, `turbidityValid`) are encapsulated into a single unified `struct WQSData`.
   * Ensures identical data snapshots are shared across the LCD renderer, serial debug logger, and LoRa packet dispatcher.
3. **Signal Conditioning & Noise Rejection:**
   * ESP32 SAR ADC readings for pH and Turbidity use a **20-sample trimmed-mean filter** (discards top & bottom outlier samples, then averages the remaining samples) to suppress electrical and RF switching noise.
4. **Anti-Flicker LCD Rendering:**
   * `DisplayManager` maintains an internal 4-line character cache (`_lineBuffers`).
   * Only individual lines with modified characters are written to the I2C bus, completely eliminating character flicker.
5. **Non-Volatile Storage (NVS):**
   * Zero-loss persistence for sensor calibration offsets across power cuts and hardware reboots.
