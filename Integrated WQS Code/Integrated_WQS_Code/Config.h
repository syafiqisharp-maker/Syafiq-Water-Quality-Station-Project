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
#define LCD_SDA_PIN 8        // I2C SDA pin for ESP32-S3
#define LCD_SCL_PIN 9        // I2C SCL pin for ESP32-S3

// ==========================================
// LORA RA-02 (SX1278 433MHz) SETTINGS
// ==========================================
#define LORA_NSS_PIN 10     // SPI Chip Select
#define LORA_SCK_PIN 11     // SPI Clock
#define LORA_MOSI_PIN 14    // SPI Master Out Slave In
#define LORA_MISO_PIN 15    // SPI Master In Slave Out
#define LORA_RST_PIN 6      // Hardware Reset pin
#define LORA_DIO0_PIN 7     // Interrupt / Packet RX/TX Done pin
#define LORA_BAND 433E6     // 433 MHz Frequency
#define LORA_SYNC_WORD 0xF3 // Matching Sync Word (0xF3)
#define LORA_RETRY_INTERVAL_MS 30000U // Non-blocking auto-reconnect retry every 30s

// ==========================================
// TIMING CONSTANTS (Milliseconds)
// ==========================================
#define POLL_INTERVAL_MS 5000U   // Poll sensors every 5 seconds (standardized)
#define DISPLAY_REFRESH_MS 1000U // Refresh LCD display output every 1 second

#endif // CONFIG_H
