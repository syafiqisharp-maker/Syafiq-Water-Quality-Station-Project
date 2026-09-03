# Feed Barrel Ultrasonic Sensor & LoRa Telemetry System

A low-power, solar-assisted IoT solution to remotely measure autofeeder barrel feed distance (in cm) using two **DFRobot DFR1195 (ESP32-S3 + SX1262 LoRa)** boards and an **A02YYUW waterproof ultrasonic sensor**.

---

## 1. Hardware Pin Connections (Transmitter)

The DFR1195 header has exposed pins labeled **`+`**, **`-`**, **`IO2`**, **`IO3`**, etc.  
Connect the 4 wires of the A02YYUW ultrasonic sensor directly to these pins:

| A02YYUW Sensor Wire | Function | DFR1195 Pin Label | ESP32-S3 GPIO | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Red** | VCC | **`+`** (or 5V from HW-373) | 3.3V / 5V | Power supply for sensor |
| **Black** | GND | **`-`** | GND | Ground |
| **White** | TX (Data Out) | **`IO2`** | GPIO 2 | Sensor data out $\rightarrow$ ESP32 Serial1 RX |
| **Yellow** | RX (Trigger/In) | **`IO3`** | GPIO 3 | Sensor trigger $\rightarrow$ ESP32 Serial1 TX |

> [!NOTE]
> [!NOTE]
> **Battery Monitoring via GPIO 1:**
> On the DFR1195 board, **GPIO 1 (`BAT_ADC`)** is an **internal PCB copper trace** connected directly to the onboard 2-pin JST 3.7V battery connector.
> By connecting the HW-373 **`OUT+`** and **`OUT-`** to this 3.7V battery port, the ESP32 automatically reads your battery voltage through the internal divider without any extra sensing wires!

---

## 2. Power Connections (Solar Panel + HW-373 + Battery)

```text
       [ 5V Solar Panel ]
               │
          (+)  │  (-)
          ┌────┴────┐
          │ IN+ IN- │
          │         │
          │ B+   B- │ ───> [ 3.7V Li-Ion / 18650 Battery ]
          │         │
          │OUT+ OUT-│
          └────┬────┘
          (+)  │  (-)
               │
               ▼
    ┌───────────────────────────────┐
    │ DFR1195 2-Pin 3.7V Port       │
    │ (Red to +, Black to -)        │
    │ *Powers board & activates     │
    │  internal BAT_ADC (GPIO 1)*   │
    └───────────────────────────────┘
```

---

## 3. Timing & Deep Sleep Behavior

1. **Initial Power-On (Cold Boot)**:
   - When first powered on, the transmitter board **waits 3 minutes (180 seconds)** before taking its first reading.
   - This gives you time to mount the barrel lid, position the feeder, and let the sensor stabilize.
   - A countdown is printed to the Serial Monitor every 30 seconds.
2. **First Measurement & LoRa Transmission**:
   - Takes 5 distance readings from the A02YYUW sensor and calculates the median value in **cm**.
   - Measures the battery voltage on internal GPIO 1.
   - Transmits packet: `ID:01.02.12,Dist_cm:45.2,Bat_V:4.12,Pkt:1`
3. **10-Minute Deep Sleep Cycle**:
   - The ESP32-S3 and SX1262 enter ultra-low power Deep Sleep (~15–20 µA) for 10 minutes.
   - Upon waking from deep sleep, it **does NOT wait 3 minutes**—it immediately takes the new reading, transmits, and goes back to sleep.

---

## 4. Telemetry & Receiver Display

### Telemetry Packet
```text
ID:01.02.12,Dist_cm:45.2,Bat_V:4.12,Pkt:1
```

### Receiver 0.96" TFT LCD Display (160x80)
```text
┌────────────────────────┐
│ POND 01.02.12          │  <- Cyan (Pond Header)
│ Dist: 45.2 cm          │  <- Green (Distance to feed)
│ Bat: 4.12V  #1         │  <- Yellow (Battery & Counter)
│ -65dBm  SNR:9          │  <- White (LoRa Signal strength)
└────────────────────────┘
```
Logs are also output to the USB Serial Monitor at **115200 baud**.

---

## 5. Arduino IDE Setup

- **Board**: `ESP32S3 Dev Module` (or `DFRobot Romeo ESP32-S3`)
- **USB CDC On Boot**: `Enabled`
- **Flash Size**: `4MB`
- **Library Needed**: `DFRobot_LoRaWAN_ESP32S3`
