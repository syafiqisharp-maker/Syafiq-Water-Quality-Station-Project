/**
 * ============================================================================
 * Feed Barrel Ultrasonic Sensor Transmitter
 * Board: DFRobot LoRaWAN ESP32-S3 (DFR1195) + Semtech SX1262
 * Sensor: A02YYUW Waterproof Ultrasonic Distance Sensor (UART)
 * Power: Battery & Solar (HW-373 TP4056 Module)
 * Pond ID: 01.02.12
 * ============================================================================
 *
 * Transmission Schedule:
 *  - Power-on (Cold boot) : 1 minute initial warmup (countdown shown on LCD).
 *  - Packet #1            : Sent at 1-minute mark  -> Sleeps 2 minutes.
 *  - Packet #2            : Sent at 3-minute mark  -> Sleeps 3 minutes.
 *  - Packet #3            : Sent at 6-minute mark  -> Sleeps 6 minutes.
 *  - Packet #4, #5, ...   : Resumes every 6 minutes indefinitely.
 *
 * Power Optimization & Fail-Safe Features:
 *  1. LoRa SX1262 deep sleep via radio.deepSleepMs() reduces sleep draw to ~15-20uA.
 *  2. LCD display is ONLY powered on during cold boot warmup. On deep-sleep
 *     wakeups, LCD stays completely OFF to conserve battery.
 *  3. Low-battery brownout protection: skips TX if battery < 3.2V to prevent
 *     voltage collapse and flash corruption.
 *  4. 10-sample ADC averaging for stable, noise-free battery telemetry.
 *  5. Hard wake-execution timeout prevents the board from ever hanging awake.
 */

#include "Config.h"
#include <esp_sleep.h>

// Onboard 0.96" TFT Screen
LCD_OnBoard screen;

// Retain packet counter across deep sleep reboots in RTC Slow Memory
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
 * Averages BATTERY_SAMPLE_COUNT readings to eliminate ESP32 ADC switching noise.
 */
float readBatteryVoltage() {
#if ENABLE_BATTERY_MONITOR
  uint32_t totalMv = 0;
  for (uint8_t i = 0; i < BATTERY_SAMPLE_COUNT; i++) {
    totalMv += analogReadMilliVolts(BATTERY_ADC_PIN);
    delay(2);
  }
  uint32_t avgMv = totalMv / BATTERY_SAMPLE_COUNT;
  return (avgMv * BATTERY_DIVIDER_RATIO) / 1000.0f;
#else
  return -1.0f;
#endif
}

/**
 * Reads distance from A02YYUW ultrasonic sensor via Hardware Serial1.
 * Gathers multiple samples and returns the median distance in centimeters (cm).
 * Returns NAN if sensor communication fails or times out.
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
 * Updates the onboard 0.96" TFT LCD (160x80) with live trial data (TRIAL_MODE only).
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
 * Sends a single LoRa telemetry packet with transmission timeout protection.
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

  // Wait for transmission completion with 2000ms safety timeout
  unsigned long txStart = millis();
  while (!txCompleted && (millis() - txStart < 2000)) {
    delay(10);
  }

  if (!txCompleted) {
    Serial.println(F("[LORA TX WARNING] TX Done callback timed out. Proceeding."));
  }
}

/**
 * Puts both LCD, LoRa SX1262, and ESP32-S3 into deep sleep.
 * Uses library's radio.deepSleepMs() for ultra-low power consumption (~15-20uA).
 */
void enterDeepSleep(uint32_t sleepMinutes) {
  // Ensure LCD backlight and power are shut off
  pinMode(16, OUTPUT); // LCD_BL
  digitalWrite(16, LOW);
  pinMode(48, OUTPUT); // LCD_PWR
  digitalWrite(48, LOW);

  Serial.flush();
  Serial.printf("[SLEEP] Entering Deep Sleep for %lu minutes...\n", (unsigned long)sleepMinutes);

  // Put SX1262 LoRa radio into sleep mode and enter ESP32 deep sleep
  uint32_t sleepMs = sleepMinutes * 60UL * 1000UL;
  radio.deepSleepMs(sleepMs);

  // Fallback if radio.deepSleepMs() ever returns
  esp_sleep_enable_timer_wakeup((uint64_t)sleepMinutes * 60ULL * 1000000ULL);
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);

  // Check wake reset reason
  esp_reset_reason_t reason = esp_reset_reason();
  bool isColdBoot = (reason != ESP_RST_DEEPSLEEP);

  // Allow USB serial time to attach only on cold boot
  if (isColdBoot) {
    delay(1000);
  }

  Serial.println(F("=============================================="));
  Serial.printf("  FEED BARREL TRANSMITTER - POND %s\n", DEVICE_ID);
#if TRIAL_MODE
  Serial.println(F("  MODE: TRIAL BENCH TEST (LCD ALWAYS ON)"));
#else
  Serial.printf("  MODE: FIELD DEEP SLEEP (Reason: %s)\n",
                isColdBoot ? "COLD BOOT" : "DEEP SLEEP WAKE");
#endif
  Serial.println(F("=============================================="));

  // ==========================================================
  // COLD BOOT INITIALIZATION & SCREEN COUNTDOWN
  // ==========================================================
  if (isColdBoot) {
    // Reset packet counter on fresh power-on or manual reset
    packetCounter = 0;

    // Initialize onboard 0.96" TFT LCD for field setup feedback
    screen.begin();
    screen.fillScreen(COLOR_RGB565_BLACK);
    screen.setFont(&FreeMono9pt7b);
    screen.setTextSize(1);
    screen.setTextColor(COLOR_RGB565_CYAN);
    screen.setCursor(0, 22);
    screen.printf("POND %s", DEVICE_ID);
    screen.setTextColor(COLOR_RGB565_YELLOW);
    screen.setCursor(0, 44);
    screen.printf("Feed Sensor");

#if !TRIAL_MODE
    // Live countdown during the 1-minute initial boot warmup
    if (INITIAL_BOOT_DELAY_MINUTES > 0) {
      int totalSec = INITIAL_BOOT_DELAY_MINUTES * 60;
      Serial.printf("[INIT] Waiting %d minute(s) before first reading...\n",
                    INITIAL_BOOT_DELAY_MINUTES);

      while (totalSec > 0) {
        // Redraw countdown on line 3 of LCD
        screen.fillRect(0, 52, 160, 28, COLOR_RGB565_BLACK);
        screen.setFont(&FreeMono9pt7b);
        screen.setTextSize(1);
        screen.setTextColor(COLOR_RGB565_GREEN);
        screen.setCursor(0, 72);
        screen.printf("Warmup: %ds", totalSec);

        if (totalSec % 15 == 0 || totalSec <= 5) {
          Serial.printf("  [WARMUP] %d seconds left...\n", totalSec);
        }
        delay(1000);
        totalSec--;
      }

      screen.fillRect(0, 52, 160, 28, COLOR_RGB565_BLACK);
      screen.setFont(&FreeMono9pt7b);
      screen.setTextColor(COLOR_RGB565_WHITE);
      screen.setCursor(0, 72);
      screen.printf("Sending Pkt #1");
    }
#endif
  }

  // ==========================================================
  // INITIALIZE LORA SX1262 RADIO
  // ==========================================================
  Serial.println(F("[LORA TX] Initializing SX1262 Radio..."));
  radio.init();
  radio.setTxCB(loraTxDone);
  radio.setFreq(RF_FREQUENCY);
  radio.setEIRP(TX_EIRP);
  radio.setSF(LORA_SPREADING_FACTOR);
  radio.setBW(LORA_BANDWIDTH);

#if !TRIAL_MODE
  // ==========================================================
  // FIELD MODE: SINGLE SHOT MEASUREMENT & TIERED DEEP SLEEP
  // ==========================================================
  packetCounter++;
  Serial.printf("\n[CYCLE #%lu] Waking execution...\n", (unsigned long)packetCounter);

  // 1. Measure Battery Voltage
  float bat = readBatteryVoltage();
  Serial.printf("[BATTERY] Voltage: %.2f V\n", bat);

  // IoT Fail-Safe: Low Battery Brownout Protection
  // If battery is severely depleted (< 3.2V), skip high-current LoRa TX
  // and sleep 15 mins to protect battery and allow solar trickle-charging.
  if (bat > 0.0f && bat < LOW_BATTERY_CUTOFF_V) {
    Serial.printf("[WARNING] Low battery (%.2fV < %.2fV)! Sleeping %d mins for solar charge...\n",
                  bat, LOW_BATTERY_CUTOFF_V, LOW_BATTERY_SLEEP_MIN);
    enterDeepSleep(LOW_BATTERY_SLEEP_MIN);
  }

  // 2. Measure Distance
  float dist = readUltrasonicDistance();

  // 3. Send LoRa Telemetry Packet
  sendTelemetryPacket(dist, bat, packetCounter);

  // 4. Determine Tiered Sleep Duration based on Packet Counter:
  //    - Packet #1 (T = 1 min mark) -> Sleep 2 minutes (wakes at T = 3 min mark)
  //    - Packet #2 (T = 3 min mark) -> Sleep 3 minutes (wakes at T = 6 min mark)
  //    - Packet #3 (T = 6 min mark) -> Sleep 6 minutes (wakes at T = 12 min mark)
  //    - Packet #4+                -> Resumes every 6 minutes thereafter
  uint32_t sleepMinutes = DEEP_SLEEP_MINUTES;
  if (packetCounter == 1) {
    sleepMinutes = SLEEP_AFTER_PKT1_MINUTES;
    Serial.printf("[SCHEDULE] Packet #1 sent. Next packet at 3-min mark (sleeping %lu min).\n",
                  (unsigned long)sleepMinutes);
  } else if (packetCounter == 2) {
    sleepMinutes = SLEEP_AFTER_PKT2_MINUTES;
    Serial.printf("[SCHEDULE] Packet #2 sent. Next packet at 6-min mark (sleeping %lu min).\n",
                  (unsigned long)sleepMinutes);
  } else {
    sleepMinutes = DEEP_SLEEP_MINUTES;
    Serial.printf("[SCHEDULE] Steady state. Next packet in %lu min.\n",
                  (unsigned long)sleepMinutes);
  }

  // 5. Enter Deep Sleep
  enterDeepSleep(sleepMinutes);
#endif
}

void loop() {
#if TRIAL_MODE
  packetCounter++;
  Serial.printf("\n[TRIAL CYCLE #%lu]\n", (unsigned long)packetCounter);

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
