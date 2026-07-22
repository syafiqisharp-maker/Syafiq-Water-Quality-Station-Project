#ifndef CONFIG_H
#define CONFIG_H

// ==========================================
// PIN CONFIGURATIONS (ESP32-S3 44-Pin)
// ==========================================
#define PH_PIN 4        // Analog input for pH sensor (ADC1_CH3 on ESP32-S3)
#define TURBIDITY_PIN 5 // Analog input for Turbidity sensor (ADC1_CH4 on ESP32-S3)
#define DO_RX_PIN 16    // RS485 RO (RX2 pin on ESP32-S3)
#define DO_TX_PIN 17    // RS485 DI (TX2 pin on ESP32-S3)

#define BUTTON_DO_PIN 12 // DO / Turbidity calibration button
#define BUTTON_PH_PIN 13 // pH calibration button

// Set to the control pin if using RE/DE flow control (e.g. GPIO 4)
// Set to -1 if using an RS485 converter with automatic flow direction
#define RS485_RE_DE_PIN -1

// ==========================================
// DISSOLVED OXYGEN MODBUS SETTINGS
// ==========================================
#define DO_SLAVE_ID 0x01       // Sensor Modbus Slave ID
#define DO_BAUD_RATE 4800      // Modbus baud rate (8N1)
#define MODBUS_TIMEOUT_MS 1000 // Modbus serial response timeout

// Modbus Register Addresses for SEN0681
#define REG_DO_SATURATION 0x0000    // Saturation registers (Float)
#define REG_DO_CONCENTRATION 0x0002 // Concentration registers (Float)
#define REG_TEMPERATURE 0x0004      // Temperature registers (Float)
#define CALIBRATION_REG 0x1010      // Calibration command register
#define CALIBRATION_VAL_100 0x0002  // Value for 100% saturation calibration

// ==========================================
// I2C LCD SETTINGS (Model 2004A-V1.3)
// ==========================================
#define LCD_I2C_ADDRESS 0x27 // Default I2C address for PCF8574 (can be 0x3F)
#define LCD_COLUMNS 20       // Columns on LCD screen
#define LCD_ROWS 4           // Rows on LCD screen

// ==========================================
// TIMING CONSTANTS (Milliseconds)
// ==========================================
#define POLL_INTERVAL_MS 5000U   // Poll sensors every 5 seconds (standardized)
#define DISPLAY_REFRESH_MS 1000U // Refresh LCD display output every 1 second
#define GOOGLE_SHEETS_UPLOAD_MS                                                \
  900000U // Upload data to Google Sheets every 15 mins (900,000 ms)

// ==========================================
// WIFI & GOOGLE SHEETS SETTINGS
// ==========================================
#define WIFI_SSID "BAB Staff"
#define WIFI_PASSWORD "Blu3Archip3lago"
#define GOOGLE_SCRIPT_URL                                                      \
  "https://script.google.com/macros/s/"                                        \
  "AKfycbzIDhUOzAT42pBSaJqW_8REP2zyL0EwqHWQDfvH9uRvT4IUjAGPCJzAkiGXC1opqV9C/"  \
  "exec"

#endif // CONFIG_H
