# Integrated Water Quality Station (WQS) Walkthrough

This document outlines the architecture, hardware connections, calibration instructions, and timing details for the integrated Water Quality Station codebase.

---

## 📂 Project Structure

All source files are located inside the directory:
`Integrated WQS Code/`

*   **`Integrated WQS Code.ino`**: The main Arduino sketch. Coordinates the non-blocking execution schedules of sensor polling, LCD updates, and Serial Monitor command processing.
*   **`Config.h`**: Centralized configuration file containing pin configurations, Modbus registers, LCD specifications, and timing intervals.
*   **`DOSensor.h` & `DOSensor.cpp`**: Implements the `DOSensor` class which encapsulates the Modbus RTU communication protocol for the DFRobot RS485 Dissolved Oxygen sensor (SKU: SEN0681).
*   **`PHSensor.h` & `PHSensor.cpp`**: Implements the `PHSensor` class, wrapping the `DFRobot_PH` library, reading voltages via ESP32's optimized `analogReadMilliVolts()`, and performing temperature compensation.
*   **`DisplayManager.h` & `DisplayManager.cpp`**: Controls the LCD Model 2004A-V1.3 using the `LiquidCrystal_I2C` library. Uses an anti-flicker differential frame buffer to only update characters that change on screen.

---

## 🔌 Hardware Connections (30-pin ESP32)

Please configure your physical wiring as defined below:

| Device | Device Pin | ESP32 Pin | Notes |
| :--- | :--- | :--- | :--- |
| **I2C LCD 2004** | SDA | **GPIO 21** | ESP32 hardware I2C SDA |
| | SCL | **GPIO 22** | ESP32 hardware I2C SCL |
| | VCC | 5V | LCD 2004 requires 5V to run |
| | GND | GND | Common Ground |
| **RS485-to-TTL** | RO (RXD) | **GPIO 16 (RX2)** | Hardware Serial2 RX |
| (for DO Sensor) | DI (TXD) | **GPIO 17 (TX2)** | Hardware Serial2 TX |
| | VCC | 5V / 3.3V | Check adapter requirements |
| | GND | GND | Common Ground |
| **Analog pH** | Signal (A) | **GPIO 35 (ADC1)**| Input-only pin (ideal for ADC) |
| | VCC (V) | 5V / 3.3V | Check sensor edition |
| | GND (G) | GND | Common Ground |

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

---

## 📦 Required Libraries
Ensure you install these library dependencies in your Arduino IDE:
1. **LiquidCrystal_I2C** by Frank de Brabander
2. **DFRobot_PH** by DFRobot
