#ifndef CONFIG_H
#define CONFIG_H

#include "DFRobot_LoRaRadio.h"
#include <Arduino.h>

// ==========================================
// DEVICE & POND IDENTIFIER
// ==========================================
#define DEVICE_ID "01.02.12" // Pond Number

// ==========================================
// BOOT & STABILIZATION TIMING
// ==========================================
// Wait 3 minutes on cold power-on before taking the first reading
#define INITIAL_BOOT_DELAY_MINUTES 3

// Deep sleep interval between subsequent transmissions (3 minutes)
#define DEEP_SLEEP_MINUTES 3

// ==========================================
// TRIAL / BENCH TEST MODE
// ==========================================
// Turned OFF for real mode: ultra-low power solar/battery deep sleep enabled.
#define TRIAL_MODE false
#define TRIAL_INTERVAL_SEC 3

// ==========================================
// A02YYUW ULTRASONIC SENSOR PINS
// ==========================================
// Connect A02YYUW White Wire (TX) -> DFR1195 IO2 (GPIO 2 / RX)
// Connect A02YYUW Yellow Wire (RX) -> DFR1195 IO3 (GPIO 3 / TX)
// Connect A02YYUW Red Wire (VCC)  -> DFR1195 + (3.3V) or 5V
// Connect A02YYUW Black Wire (GND) -> DFR1195 - (GND)
#define SENSOR_RX_PIN 2 // ESP32 Serial1 RX (Pin labeled IO2)
#define SENSOR_TX_PIN 3 // ESP32 Serial1 TX (Pin labeled IO3)
#define SENSOR_BAUD 9600

// Number of valid samples to gather for median filtering
#define SENSOR_SAMPLE_COUNT 5
#define SENSOR_READ_TIMEOUT_MS 3000

// ==========================================
// BATTERY MONITORING
// ==========================================
// GPIO 1 is an INTERNAL PCB trace on DFR1195 connected to the
// onboard 2-pin JST battery connector. It automatically reads
// the battery voltage supplied from HW-373 OUT+/OUT-!
#define ENABLE_BATTERY_MONITOR true
#define BATTERY_ADC_PIN 1          // Internal BAT_ADC on DFR1195
#define BATTERY_DIVIDER_RATIO 2.0f // 2:1 onboard resistor divider

// ==========================================
// LORA SX1262 (850 - 930 MHz) SETTINGS
// ==========================================
// Matches your 915 MHz tuned antenna
// MUST MATCH ON BOTH TRANSMITTER AND RECEIVER
#define RF_FREQUENCY 915000000UL // 915.0 MHz (Matched to 915MHz Antenna)
#define TX_EIRP 22               // Max transmit power (dBm)
#define LORA_SPREADING_FACTOR 7  // SF7 (Fast & reliable)
#define LORA_BANDWIDTH BW_125    // 125 kHz Bandwidth

#endif // CONFIG_H
