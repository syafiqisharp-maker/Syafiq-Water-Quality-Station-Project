#ifndef CONFIG_H
#define CONFIG_H

// ==========================================
// LORA RA-02 (SX1278 433MHz) PIN SETTINGS
// ==========================================
#define LORA_SS 10
#define LORA_RST 9
#define LORA_DIO0 4

#define LORA_SCK 12
#define LORA_MISO 13
#define LORA_MOSI 11

#define LORA_BAND 433E6
#define LORA_SYNC_WORD 0xF3
#define LORA_RETRY_INTERVAL_MS 30000U

// ==========================================
// 1602 I2C LCD SETTINGS
// ==========================================
#define LCD_I2C_ADDR 0x27
#define LCD_COLUMNS 16
#define LCD_ROWS 2
#define LCD_SDA_PIN 8
#define LCD_SCL_PIN 18

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
#define GOOGLE_SHEETS_UPLOAD_MS 900000U // 15 minutes (900,000 ms)
#define WIFI_CHECK_INTERVAL_MS 30000U   // Check Wi-Fi connection every 30 seconds
#define NTP_SYNC_INTERVAL_MS 3600000U   // Re-sync NTP time every 1 hour

// GMT Offset for Malaysia (GMT+8)
#define GMT_OFFSET_SEC (8 * 3600)
#define DAYLIGHT_OFFSET_SEC 0

// Offline Storage File Path (LittleFS)
#define OFFLINE_STORAGE_FILE "/offline_queue.csv"
#define MAX_OFFLINE_RECORDS 1000

#endif // CONFIG_H
