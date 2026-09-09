#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// ==========================================
// RADIO SETTINGS (MUST MATCH TRANSMITTER)
// ==========================================
#define RF_FREQUENCY          915000000UL // 915.0 MHz (Matched to 915MHz Antenna)
#define LORA_SPREADING_FACTOR 7           // SF7
#define LORA_BANDWIDTH        BW_125      // 125 kHz Bandwidth
#define TX_EIRP               22          // 22 dBm Transmit power for ACKs

// ==========================================
// MULTI-NODE & PROTOCOL SETTINGS (24 PONDS)
// ==========================================
#define MAX_POND_CACHE             32          // Maximum distinct ponds tracked for de-duplication
#define STATUS_LOG_INTERVAL_MS     15000UL     // Serial heartbeat log interval

// ==========================================
// PERSISTENT OFFLINE FLASH STORAGE (LITTLEFS)
// ==========================================
#define OFFLINE_SPOOL_PATH         "/spool.txt"// Flash file for persistent offline buffer
#define MAX_OFFLINE_RECORDS        2000        // Safety limit to prevent filling flash storage
#define QUEUE_FLUSH_INTERVAL_MS    8000U       // 8-second interval between background spool uploads
#define QUEUE_RETRY_BACKOFF_MS     30000U      // 30-second backoff if a spool upload fails
#define POST_COLLISION_GUARD_MS    3000U       // 3-second guard after live packet before spool drains

// ==========================================
// WI-FI & GOOGLE SHEETS SETTINGS
// ==========================================
#define WIFI_SSID                  "BAB Staff"
#define WIFI_PASSWORD              "Blu3Archip3lago"

#define GOOGLE_SCRIPT_URL          "https://script.google.com/macros/s/AKfycbzN0Vko3gMJMgMMD3Y5cUh7FP7azeww-DwaFZtspOjoRWnzO4UXmhkFD2uSoJhTN6XCcA/exec"

#define WIFI_CHECK_INTERVAL_MS     30000UL     // Re-check Wi-Fi connection every 30s (aligned with WQS)
#define HTTP_TIMEOUT_MS            8000U       // HTTP client timeout (8 seconds)

#endif // CONFIG_H


