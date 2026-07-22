# Integrated Water Quality Station (WQS) Walkthrough

This document outlines the architecture, hardware connections, IDE build configurations (including Partition Scheme for OTA), calibration instructions, and timing details for the integrated Water Quality Station codebase.

---

## 📂 Project Structure

All source files are located inside the directory:
`Integrated WQS Code/`

*   **`Integrated_WQS_Code.ino`**: The main Arduino sketch. Coordinates the non-blocking execution schedules of sensor polling, LCD updates, Serial command processing, and Over-The-Air (OTA) Wi-Fi updates.
*   **`Config.h`**: Centralized configuration file containing pin definitions for ESP32-S3, Modbus registers, LCD specifications, and timing intervals.
*   **`DOSensor.h` & `DOSensor.cpp`**: Implements the `DOSensor` class which encapsulates the Modbus RTU communication protocol for the DFRobot RS485 Dissolved Oxygen sensor (SKU: SEN0681).
*   **`PHSensor.h` & `PHSensor.cpp`**: Implements the `PHSensor` class, wrapping the `DFRobot_PH` library, reading voltages via ESP32's optimized `analogReadMilliVolts()`, and performing temperature compensation.
*   **`TurbiditySensor.h` & `TurbiditySensor.cpp`**: Implements the `TurbiditySensor` class which handles ADC reading, Beer-Lambert Law interpolation for mapping voltage to Turbidity Percentage, and NVS persistence for clear-water baseline calibration.
*   **`DisplayManager.h` & `DisplayManager.cpp`**: Controls the LCD Model 2004A-V1.3 using the `LiquidCrystal_I2C` library. Uses an anti-flicker differential frame buffer to only update characters that change on screen.
*   **`ButtonHandler.h` & `ButtonHandler.cpp`**: A clean, reusable wrapper class for physical tactile buttons. It handles non-blocking debouncing and short vs. long press detection.

---

## ⚙️ Arduino IDE Configuration & Partition Scheme (Crucial for OTA & ESP32-S3 N16R8)

When compiling and uploading code to the **ESP32-S3 N16R8** (16MB Flash / 8MB PSRAM), navigate to **Tools** in the Arduino IDE and configure these exact settings:

### 1. Board Settings
| Menu Option | Recommended Setting |
| :--- | :--- |
| **Board** | `ESP32S3 Dev Module` |
| **Flash Size** | `16MB (128Mb)` |
| **PSRAM** | `OPI PSRAM` (or `Enabled`) |
| **USB Mode** | `Hardware CDC and JTAG` |
| **USB CDC On Boot** | `Enabled` *(Required for `Serial.print` over native USB)* |
| **Partition Scheme** | **`16M Flash (3MB APP / 9.9MB FATFS)`** OR **`16M Flash (2MB APP / 12.5MB SPIFFS)`** |

---

### 🔍 Deep-Dive: What is the Partition Scheme & Why is it Crucial?

#### What is a Partition Scheme?
The ESP32's internal 16MB flash storage is partitioned like a hard drive. It splits space between:
1. **Application Code space (`app0` / `app1`)**
2. **File System space (SPIFFS / FATFS / LittleFS)**
3. **Non-Volatile Storage (NVS)** for persistent settings and calibration data.

#### Why is Partition Selection Crucial for Over-The-Air (OTA) Updates?
During an **OTA Wireless Update**, the ESP32 must continue running the current firmware while simultaneously receiving the new binary over Wi-Fi. To achieve this safely:
* The chip requires **DUAL App Partitions** (`app0` and `app1`).
* **How it works**:
  1. The ESP32 runs code out of `app0`.
  2. Over Wi-Fi, it downloads the incoming code line-by-line directly into `app1`.
  3. Once verified, it switches the bootloader pointer to `app1` and reboots.

> [!WARNING]
> **Partition Scheme Pitfall**
> If you select a scheme with **No OTA** (such as *"Huge APP with no OTA"* or *"16MB (15MB APP / No OTA)"*), the ESP32 only has one single app partition. **OTA update requests will fail instantly** because there is no secondary partition to store the incoming binary!

#### How to Check & Set it in Arduino IDE:
1. Open Arduino IDE.
2. Go to top menu: **Tools > Partition Scheme**.
3. Select **`16M Flash (3MB APP / 9.9MB FATFS)`** (or any 16M scheme containing OTA app partitions).

---

## 📡 Over-The-Air (OTA) Wireless Upload Guide

Once your ESP32-S3 is running this code:

1. **First Upload**: Upload the code via USB cable once so the ESP32 boots with Wi-Fi and OTA initialized.
2. **Verify Wi-Fi Connection**: Ensure your PC is connected to the same network specified in `Config.h`.
3. **Select Wireless Port**:
   - Go to **Tools > Port**.
   - Under **Network Ports**, select `ESP32-S3-WQS at 192.168.x.x`.
4. **Upload Wirelessly**: Click **Upload**. Arduino IDE will compile and transfer the new firmware wirelessly over Wi-Fi without needing a USB cable.

---

## 🔌 Hardware Connections (ESP32-S3 44-pin Board)

Please configure your physical wiring as defined below:

| Device | Device Pin | ESP32-S3 Pin | Notes |
| :--- | :--- | :--- | :--- |
| **I2C LCD 2004** | SDA | **GPIO 8** or **GPIO 21** | ESP32-S3 hardware I2C SDA |
| | SCL | **GPIO 9** or **GPIO 22** | ESP32-S3 hardware I2C SCL |
| | VCC | 5V | LCD 2004 requires 5V to run |
| | GND | GND | Common Ground |
| **RS485-to-TTL** | RO (RXD) | **GPIO 16 (RX2)** | Hardware Serial2 RX |
| (for DO Sensor) | DI (TXD) | **GPIO 17 (TX2)** | Hardware Serial2 TX |
| | VCC | 5V / 3.3V | Check adapter requirements |
| | GND | GND | Common Ground |
| **Analog pH** | Signal (A) | **GPIO 4 (ADC1_CH3)**| Dedicated ADC1 pin for ESP32-S3 |
| | VCC (V) | 5V / 3.3V | Check sensor edition |
| | GND (G) | GND | Common Ground |
| **Turbidity Sensor** | Signal OUT | **GPIO 5 (ADC1_CH4)**| Dedicated ADC1 pin (Requires 1/2 Voltage Divider before entering pin) |
| | VCC | 5V | Runs on 5V from VIN/USB |
| | GND | GND | Common Ground |
| **Physical Buttons** | DO/Turbidity | **GPIO 12** | Connect to GND (Uses internal pull-up) |
| | pH Button | **GPIO 13** | Connect to GND (Uses internal pull-up) |

---

## 🎛️ Physical Button Controls

The system features two physical tactile buttons (connected to GPIO 12 and 13) using internal pull-up resistors to perform non-blocking actions without needing a serial monitor:

### Button 1 (DO & Turbidity Calibration - GPIO 12)
*   **Short Press (< 2 seconds)**: Triggers the **100% Atmospheric DO Calibration** (Same as `CAL100`).
*   **Long Press (> 2 seconds)**: Triggers the **Turbidity Clean Water Calibration**. Places the system into a calibration mode, samples the clean water voltage 10 times, saves it to non-volatile storage, and displays a success message.

### Button 2 (pH Calibration - GPIO 13)
*   **Short Press**: Toggles between entering pH calibration (`enterph`) and calibrating the current buffer (`calph`).
*   **Long Press (> 2 seconds)**: Exits pH calibration (`exitph`) and saves the values to non-volatile storage.

---

## 🛠️ Calibration Commands

Open the Arduino Serial Monitor at **115200 baud** with line endings set to **Newline (NL) or Carriage Return (CR)**.

### 1. Dissolved Oxygen (DO) 100% Saturation Calibration
1. Hold the DO probe suspended in water-saturated air (e.g., just above the surface of the water).
2. Type `CAL100` and press Enter.
3. The LCD and Serial Monitor will show a 5-second countdown.
4. When the countdown hits 0, it sends the Modbus calibration write command, displays the results, and returns to normal operation.

### 2. pH Sensor Calibration
1. Place the pH probe in a standard calibration buffer solution (such as pH 4.0 or pH 7.0).
2. Type `enterph` and press Enter to start calibration mode. The LCD screen changes to show raw millivolts and temperature.
3. Wait for the voltage to stabilize.
4. Type `calph` and press Enter. The `DFRobot_PH` library automatically detects whether the solution is pH 4.0 or 7.0 and adjusts calibration.
5. Type `exitph` and press Enter. The library saves the calibration settings into the ESP32's native non-volatile storage (Preferences / NVS) and normal monitoring mode resumes.

### 3. Turbidity Sensor Calibration (Clean Water Baseline)
1. Clean the turbidity probe thoroughly with distilled water and a soft cloth.
2. Place the probe into a container of perfectly clean, clear water (e.g., distilled water).
3. **Important**: The sensor is highly sensitive to ambient light. Ensure the container is opaque or shield the setup from direct sunlight and bright fluorescent lights during calibration to prevent inaccurate voltage readings.
4. Wait a moment for the water to settle and the sensor to stabilize.
5. Press and **hold Button 1 (GPIO 12) for more than 2 seconds**.
6. The LCD will flash `* TURB CALIBRATION *`, rapidly read the sensor 10 times to compute an average clean water voltage baseline, and save this new reference to the ESP32's non-volatile storage.
7. The LCD will display `>>> CAL SUCCESS <<<<` with the new reference voltage for 3 seconds before automatically returning to normal monitoring mode.

> [!NOTE]
> **Hardware Voltage Divider Tuning**
> If you notice a difference between the "calibrated voltage" displayed on the screen and the actual voltage measured with a physical voltmeter at the sensor output, it is due to a combination of **resistor tolerances** in your voltage divider and **ESP32 ADC offset**.
> You can manually fix this by updating the hardware multiplier in `TurbiditySensor.cpp`. 
> Navigate to `TurbiditySensor::calibrateCleanWater()` and `TurbiditySensor::getTurbidityPct()` and adjust the multiplier.
> The easiest way to calculate your exact multiplier is:
> `New Multiplier = (Actual Target Voltage / Voltage Displayed on Screen) * Current Multiplier`

---

## 📦 Required Libraries
Ensure you install these library dependencies in your Arduino IDE:
1. **LiquidCrystal_I2C** by Frank de Brabander
2. **DFRobot_PH** by DFRobot
