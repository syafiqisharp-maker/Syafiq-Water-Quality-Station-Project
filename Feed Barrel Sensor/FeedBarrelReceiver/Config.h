#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// ==========================================
// RADIO SETTINGS (MUST MATCH TRANSMITTER)
// ==========================================
#define RF_FREQUENCY          915000000UL // 915.0 MHz (Matched to 915MHz Antenna)
#define LORA_SPREADING_FACTOR 7           // SF7
#define LORA_BANDWIDTH        BW_125      // 125 kHz Bandwidth

// Target Pond ID filter
#define TARGET_POND_ID        "01.02.12"

// Timing & Watchdog Intervals
#define TRANSMIT_INTERVAL_MINUTES 6
#define PACKET_WARN_TIMEOUT_MS    ((TRANSMIT_INTERVAL_MINUTES * 2 + 2) * 60000UL) // Warning threshold if no packet received (14 min)
#define RX_KEEPER_INTERVAL_MS     30000UL // Re-arm radio every 30s to prevent standby drop
#define STATUS_LOG_INTERVAL_MS    15000UL // Serial heartbeat log every 15s

// ==========================================
// WI-FI & GOOGLE SHEETS SETTINGS
// ==========================================
#define WIFI_SSID             "BAB Staff"
#define WIFI_PASSWORD         "Blu3Archip3lago"

#define GOOGLE_SCRIPT_URL     "https://script.google.com/macros/s/AKfycbzN0Vko3gMJMgMMD3Y5cUh7FP7azeww-DwaFZtspOjoRWnzO4UXmhkFD2uSoJhTN6XCcA/exec"

#define WIFI_RECONNECT_INTERVAL_MS 20000UL // Re-check Wi-Fi connection every 20s
#define HTTP_TIMEOUT_MS            8000U   // HTTP client timeout (8 seconds)

#endif // CONFIG_H
