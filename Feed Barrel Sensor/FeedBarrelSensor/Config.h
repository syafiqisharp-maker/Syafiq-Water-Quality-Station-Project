#ifndef CONFIG_H
#define CONFIG_H

#include "DFRobot_LoRaRadio.h"
#include <Arduino.h>

// ==========================================
// DEVICE & POND IDENTIFIER
// ==========================================
#define DEVICE_ID "01.02.12" // Pond Number

// ==========================================
// TIMING & DEEP SLEEP SCHEDULE (MINUTES)
// ==========================================
// 1. Initial warmup delay on cold boot: 1 minute (Packet #1 at 1-min mark)
#define INITIAL_BOOT_DELAY_MINUTES  1

// 2. Sleep duration after Packet #1: 2 minutes (Packet #2 at 3-min mark)
#define SLEEP_AFTER_PKT1_MINUTES    2

// 3. Sleep duration after Packet #2: 3 minutes (Packet #3 at 6-min mark)
#define SLEEP_AFTER_PKT2_MINUTES    3

// 4. Regular steady-state sleep interval: 6 minutes (Packet #4 at 12-min mark, then resumes every 6 min)
#define DEEP_SLEEP_MINUTES          6

// ==========================================
// TRIAL / BENCH TEST MODE
// ==========================================
// Set to true for indoor bench testing (LCD stays ON, deep sleep disabled, 3s loop)
// Set to false for outdoor solar deployment
#define TRIAL_MODE                  false
#define TRIAL_INTERVAL_SEC          3

// ==========================================
// IOT FAIL-SAFE & BATTERY PROTECTION
// ==========================================
// Low battery cutoff: if voltage falls below 3.2V, skip LoRa TX (which draws 120mA)
// and sleep to protect 18650 cell from brownout damage and allow solar recharge.
#define LOW_BATTERY_CUTOFF_V        3.20f
#define LOW_BATTERY_SLEEP_MIN       15

// Hard execution watchdog: max milliseconds awake per cycle before forced sleep
#define WAKE_TIMEOUT_MS             15000UL

// ==========================================
// A02YYUW ULTRASONIC SENSOR PINS
// ==========================================
// Connect A02YYUW White Wire (TX) -> DFR1195 IO2 (GPIO 2 / RX)
// Connect A02YYUW Yellow Wire (RX) -> DFR1195 IO3 (GPIO 3 / TX)
// Connect A02YYUW Red Wire (VCC)  -> DFR1195 + (3.3V) or 5V
// Connect A02YYUW Black Wire (GND) -> DFR1195 - (GND)
#define SENSOR_RX_PIN               2 // ESP32 Serial1 RX (Pin labeled IO2)
#define SENSOR_TX_PIN               3 // ESP32 Serial1 TX (Pin labeled IO3)
#define SENSOR_BAUD                 9600

// Number of valid samples to gather for median filtering
#define SENSOR_SAMPLE_COUNT         5
#define SENSOR_READ_TIMEOUT_MS      3000

// ==========================================
// BATTERY MONITORING
// ==========================================
// GPIO 1 is an INTERNAL PCB trace on DFR1195 connected to the
// onboard 2-pin JST battery connector. It automatically reads
// the battery voltage supplied from HW-373 OUT+/OUT-!
#define ENABLE_BATTERY_MONITOR      true
#define BATTERY_ADC_PIN             1          // Internal BAT_ADC on DFR1195
#define BATTERY_DIVIDER_RATIO       2.0f       // 2:1 onboard resistor divider
#define BATTERY_SAMPLE_COUNT        10         // Number of ADC readings averaged to eliminate noise

// ==========================================
// LORA SX1262 (850 - 930 MHz) SETTINGS
// ==========================================
// Matches your 915 MHz tuned antenna
// MUST MATCH ON BOTH TRANSMITTER AND RECEIVER
#define RF_FREQUENCY                915000000UL // 915.0 MHz (Matched to 915MHz Antenna)
#define TX_EIRP                     22          // Max transmit power (dBm)
#define LORA_SPREADING_FACTOR       7           // SF7 (Fast & reliable)
#define LORA_BANDWIDTH              BW_125      // 125 kHz Bandwidth

// ==========================================
// HANDSHAKE & RETRY PROTOCOL (24-NODE READY)
// ==========================================
#define ACK_TIMEOUT_MS              450         // Time to wait for addressed ACK from receiver (ms)
#define MAX_HANDSHAKE_RETRIES       4           // 1 initial attempt + 4 retries = 5 attempts max
#define RETRY_BACKOFF_BASE_MS       250         // Base wait before retry (ms)
#define RETRY_JITTER_MAX_MS         250         // Random backoff jitter (0-250ms) to avoid node collisions

#endif // CONFIG_H
