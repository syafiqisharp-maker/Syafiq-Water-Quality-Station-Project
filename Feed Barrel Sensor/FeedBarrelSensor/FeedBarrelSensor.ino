/**
 * ============================================================================
 * Feed Barrel Ultrasonic Sensor Transmitter
 * Board: DFRobot LoRaWAN ESP32-S3 (DFR1195) + Semtech SX1262
 * Sensor: A02YYUW Waterproof Ultrasonic Distance Sensor (UART)
 * Power: Battery & Solar (HW-373 TP4056 Module)
 * Pond ID: 01.02.12
 * ============================================================================
 *
 * Modes:
 *  - TRIAL_MODE = true : Onboard 0.96" TFT LCD stays ALWAYS ON, deep sleep is
 *                        DISABLED, live measurements update every 3 seconds.
 *  - TRIAL_MODE = false: Ultra-low power field mode. LCD off, sleeps 10
 * minutes.
 */

#include "Config.h"
#include <esp_sleep.h>

// Onboard 0.96" TFT Screen
LCD_OnBoard screen;

// Retain packet counter across deep sleep reboots
RTC_DATA_ATTR uint32_t packetCounter = 0;

// LoRa Radio instance
DFRobot_LoRaRadio radio;
volatile bool txCompleted = false;

// Transmission complete callback
void loraTxDone(void) {
  txCompleted = true;
  Serial.println(F("[LORA TX] Packet transmitted successfully!"));
}

/**
 * Reads battery voltage from internal GPIO 1 (BAT_ADC).
 */
float readBatteryVoltage() {
#if ENABLE_BATTERY_MONITOR
  uint32_t mv = analogReadMilliVolts(BATTERY_ADC_PIN);
  return (mv * BATTERY_DIVIDER_RATIO) / 1000.0f;
#else
  return -1.0f;
#endif
}

/**
 * Reads distance from A02YYUW ultrasonic sensor via Hardware Serial1.
 * Gathers multiple samples and returns the median distance in centimeters (cm).
 * Returns NAN if sensor communication fails.
 */
float readUltrasonicDistance() {
  Serial1.begin(SENSOR_BAUD, SERIAL_8N1, SENSOR_RX_PIN, SENSOR_TX_PIN);
  delay(100); // Allow sensor internal MCU to stabilize

  // Flush any stale buffer data
  while (Serial1.available()) {
    Serial1.read();
  }

  float samples[SENSOR_SAMPLE_COUNT];
  uint8_t validCount = 0;
  unsigned long startMillis = millis();

  while ((validCount < SENSOR_SAMPLE_COUNT) &&
         (millis() - startMillis < SENSOR_READ_TIMEOUT_MS)) {
    if (Serial1.available() >= 4) {
      if (Serial1.read() == 0xFF) {
        uint8_t hData = Serial1.read();
        uint8_t lData = Serial1.read();
        uint8_t sum = Serial1.read();

        // Checksum: (0xFF + H_DATA + L_DATA) & 0xFF
        uint8_t expectedSum = (0xFF + hData + lData) & 0xFF;
        if (sum == expectedSum) {
          uint16_t distanceMM = (hData << 8) + lData;

          // Valid range: 30mm (3.0 cm) to 4500mm (450.0 cm)
          if (distanceMM >= 30 && distanceMM <= 4500) {
            float distanceCM = distanceMM / 10.0f;
            samples[validCount++] = distanceCM;
            Serial.printf("  Sample #%d: %.1f cm (%d mm)\n", validCount,
                          distanceCM, distanceMM);
          }
        }
      }
    }
    delay(20);
  }

  Serial1.end();

  if (validCount == 0) {
    Serial.println(F("[SENSOR ERROR] No valid ultrasonic distance received!"));
    return NAN;
  }

  // Median sort
  for (uint8_t i = 0; i < validCount - 1; i++) {
    for (uint8_t j = 0; j < validCount - i - 1; j++) {
      if (samples[j] > samples[j + 1]) {
        float temp = samples[j];
        samples[j] = samples[j + 1];
        samples[j + 1] = temp;
      }
    }
  }

  float medianDistance = samples[validCount / 2];
  Serial.printf("[SENSOR] Median Distance: %.1f cm\n", medianDistance);
  return medianDistance;
}

/**
 * Updates the onboard 0.96" TFT LCD (160x80) with live trial data.
 */
void updateTrialDisplay(float distanceCM, float batVoltage, uint32_t pkt) {
  screen.fillScreen(COLOR_RGB565_BLACK);
  screen.setFont(&FreeMono9pt7b);
  screen.setTextSize(1);

  // Row 1: Pond Header
  screen.setTextColor(COLOR_RGB565_CYAN);
  screen.setCursor(0, 16);
  screen.printf("POND %s (TX)", DEVICE_ID);

  // Row 2: Live Distance in cm
  screen.setTextColor(COLOR_RGB565_GREEN);
  screen.setCursor(0, 36);
  if (isnan(distanceCM)) {
    screen.printf("Dist: SENSOR ERR");
  } else {
    screen.printf("Dist: %.1f cm", distanceCM);
  }

  // Row 3: Battery Voltage & Packet Count
  screen.setTextColor(COLOR_RGB565_YELLOW);
  screen.setCursor(0, 56);
#if ENABLE_BATTERY_MONITOR
  screen.printf("Bat : %.2fV #%lu", batVoltage, pkt);
#else
  screen.printf("Packet #%lu", pkt);
#endif

  // Row 4: Status Mode
  screen.setTextColor(COLOR_RGB565_WHITE);
  screen.setCursor(0, 74);
  screen.printf("TRIAL MODE ON");
}

/**
 * Sends single LoRa telemetry packet
 */
void sendTelemetryPacket(float distanceCM, float batVoltage, uint32_t pkt) {
  char payload[80];
#if ENABLE_BATTERY_MONITOR
  if (isnan(distanceCM)) {
    snprintf(payload, sizeof(payload), "ID:%s,Dist_cm:ERR,Bat_V:%.2f,Pkt:%lu",
             DEVICE_ID, batVoltage, pkt);
  } else {
    snprintf(payload, sizeof(payload), "ID:%s,Dist_cm:%.1f,Bat_V:%.2f,Pkt:%lu",
             DEVICE_ID, distanceCM, batVoltage, pkt);
  }
#else
  if (isnan(distanceCM)) {
    snprintf(payload, sizeof(payload), "ID:%s,Dist_cm:ERR,Pkt:%lu", DEVICE_ID,
             pkt);
  } else {
    snprintf(payload, sizeof(payload), "ID:%s,Dist_cm:%.1f,Pkt:%lu", DEVICE_ID,
             distanceCM, pkt);
  }
#endif

  Serial.printf("[LORA TX] Sending: \"%s\"\n", payload);

  txCompleted = false;
  radio.sendData((uint8_t *)payload, strlen(payload));

  unsigned long txStart = millis();
  while (!txCompleted && (millis() - txStart < 2000)) {
    delay(10);
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println(F("=============================================="));
  Serial.printf("  FEED BARREL TRANSMITTER - POND %s\n", DEVICE_ID);
#if TRIAL_MODE
  Serial.println(F("  MODE: TRIAL BENCH TEST (LCD ALWAYS ON)"));
#else
  Serial.println(F("  MODE: FIELD DEEP SLEEP (10 MIN CYCLE)"));
#endif
  Serial.println(F("=============================================="));

  // Initialize onboard 0.96" TFT LCD
  screen.begin();
  screen.fillScreen(COLOR_RGB565_BLACK);
  screen.setFont(&FreeMono9pt7b);
  screen.setTextSize(1);
  screen.setTextColor(COLOR_RGB565_CYAN);
  screen.setCursor(0, 25);
  screen.printf("FEED BARREL");
  screen.setTextColor(COLOR_RGB565_YELLOW);
  screen.setCursor(0, 50);
  screen.printf("Pond: %s", DEVICE_ID);

  // Initialize LoRa SX1262
  Serial.println(F("[LORA TX] Initializing SX1262 Radio..."));
  radio.init();
  radio.setTxCB(loraTxDone);
  radio.setFreq(RF_FREQUENCY);
  radio.setEIRP(TX_EIRP);
  radio.setSF(LORA_SPREADING_FACTOR);
  radio.setBW(LORA_BANDWIDTH);

#if !TRIAL_MODE
  // Check if cold boot: wait 3 minutes before first reading in real deployment
  esp_reset_reason_t reason = esp_reset_reason();
  if (reason != ESP_RST_DEEPSLEEP && INITIAL_BOOT_DELAY_MINUTES > 0) {
    Serial.printf("[INIT] Waiting %d minutes before first reading...\n",
                  INITIAL_BOOT_DELAY_MINUTES);
    int totalSec = INITIAL_BOOT_DELAY_MINUTES * 60;
    while (totalSec > 0) {
      if (totalSec % 30 == 0 || totalSec <= 10) {
        Serial.printf("  [WARMUP] %d seconds left...\n", totalSec);
      }
      delay(1000);
      totalSec--;
    }
  }

  // Field Mode single shot:
  packetCounter++;
  float dist = readUltrasonicDistance();
  float bat = readBatteryVoltage();
  sendTelemetryPacket(dist, bat, packetCounter);

  // Turn off LCD screen & backlight to save power during sleep
  screen.fillScreen(COLOR_RGB565_BLACK);
  pinMode(16, OUTPUT); // LCD_BL (Backlight pin)
  digitalWrite(16, LOW);
  pinMode(48, OUTPUT); // LCD_PWR
  digitalWrite(48, LOW);

  Serial.flush();
  Serial.printf("[SLEEP] Entering Deep Sleep for %d minutes...\n",
                DEEP_SLEEP_MINUTES);
  esp_sleep_enable_timer_wakeup((uint64_t)DEEP_SLEEP_MINUTES * 60ULL *
                                1000000ULL);
  esp_deep_sleep_start();
#endif
}

void loop() {
#if TRIAL_MODE
  packetCounter++;
  Serial.printf("\n[TRIAL CYCLE #%lu]\n", packetCounter);

  // 1. Measure Distance
  float distanceCM = readUltrasonicDistance();

  // 2. Measure Battery
  float batVoltage = readBatteryVoltage();

  // 3. Update the onboard 0.96" TFT Screen (Always ON!)
  updateTrialDisplay(distanceCM, batVoltage, packetCounter);

  // 4. Send LoRa packet to receiver
  sendTelemetryPacket(distanceCM, batVoltage, packetCounter);

  // 5. Wait TRIAL_INTERVAL_SEC seconds before next reading
  delay(TRIAL_INTERVAL_SEC * 1000UL);
#endif
}
