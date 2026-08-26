#ifndef CONFIG_H
#define CONFIG_H

// ==========================================
// LORA RA-02 (SX1278 433MHz) PIN SETTINGS
// ==========================================
#define LORA_SS 18
#define LORA_RST 15
#define LORA_DIO0 4

#define LORA_SCK 21
#define LORA_MISO 20
#define LORA_MOSI 19

#define LORA_BAND 433E6
#define LORA_SYNC_WORD 0xF3
#define LORA_RETRY_INTERVAL_MS 30000U

// ==========================================
// 1602 I2C LCD SETTINGS
// ==========================================
#define LCD_I2C_ADDR 0x27
#define LCD_COLUMNS 16
#define LCD_ROWS 2
#define LCD_SDA_PIN 6
#define LCD_SCL_PIN 7

// ==========================================
// WIFI & GOOGLE SHEETS SETTINGS
// ==========================================
#define WIFI_SSID "BAB Staff"
#define WIFI_PASSWORD "Blu3Archip3lago"
#define GOOGLE_SCRIPT_URL                                                      \
  "https://script.google.com/macros/s/"                                        \
  "AKfycbzIDhUOzAT42pBSaJqW_8REP2zyL0EwqHWQDfvH9uRvT4IUjAGPCJzAkiGXC1opqV9C/"  \
  "exec"

// ==========================================
// TIMING & QUEUE CONSTANTS
// ==========================================
#define WIFI_CHECK_INTERVAL_MS 30000U   // Check Wi-Fi connection every 30 seconds
#define NTP_SYNC_INTERVAL_MS 3600000U   // Re-sync NTP time every 1 hour
#define HTTP_TIMEOUT_MS 6000U           // Max 6 seconds per HTTP request to prevent freezing
#define QUEUE_FLUSH_INTERVAL_MS 8000U   // 8-second interval between background queue uploads
#define QUEUE_RETRY_BACKOFF_MS 30000U   // 30-second backoff if a queue upload fails

// GMT Offset for Malaysia (GMT+8)
#define GMT_OFFSET_SEC (8 * 3600)
#define DAYLIGHT_OFFSET_SEC 0

// Offline Storage File Path (LittleFS)
#define OFFLINE_STORAGE_FILE "/offline_queue.csv"
#define MAX_OFFLINE_RECORDS 1000

#endif // CONFIG_H
