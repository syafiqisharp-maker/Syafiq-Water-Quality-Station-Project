/**
 * ============================================================================
 * Feed Barrel LoRa Receiver & Display Station
 * Board: DFRobot LoRaWAN ESP32-S3 (DFR1195) + Semtech SX1262
 * Display: Onboard 0.96" TFT LCD (160x80)
 * ============================================================================
 * 
 * Features:
 *  - Continuously listens for LoRa P2P telemetry packets from the feeder barrel.
 *  - Decodes Pond ID, Distance (cm), Feeder Battery (V), and Packet Number.
 *  - Renders live visual metrics on the onboard 0.96" TFT LCD.
 *  - Prints parsed data to Serial (115200 baud) for logging / dashboard integration.
 *  - Tracks elapsed minutes since the last received telemetry.
 */

#include "DFRobot_LoRaRadio.h"

// ==========================================
// RADIO SETTINGS (MUST MATCH TRANSMITTER)
// ==========================================
#define RF_FREQUENCY          915000000UL // 915.0 MHz (Matched to 915MHz Antenna)
#define LORA_SPREADING_FACTOR 7           // SF7
#define LORA_BANDWIDTH        BW_125      // 125 kHz Bandwidth

// Target Pond ID
#define TARGET_POND_ID        "01.02.12"

// ==========================================
// HARDWARE INSTANCES
// ==========================================
LCD_OnBoard screen;
DFRobot_LoRaRadio radio;

// ==========================================
// TELEMETRY STATE
// ==========================================
String lastPondID    = "---";
String lastDistCM    = "---";
String lastBatV      = "---";
String lastPktNum    = "0";
int16_t lastRSSI     = 0;
int8_t  lastSNR      = 0;

uint32_t totalPacketsRecv = 0;
unsigned long lastPacketMillis = 0;
bool hasReceivedData = false;
volatile bool newPacketFlag = false;

// Extract a substring value by key from "key:value,key:value"
String extractValue(const String &data, const String &key) {
  int keyIndex = data.indexOf(key);
  if (keyIndex == -1) return "---";
  int start = keyIndex + key.length();
  int end = data.indexOf(',', start);
  if (end == -1) end = data.length();
  String val = data.substring(start, end);
  val.trim();
  return val;
}

// Update the 0.96" TFT LCD Screen (160x80 pixels)
void updateDisplay() {
  screen.fillScreen(COLOR_RGB565_BLACK);
  screen.setFont(&FreeMono9pt7b);
  screen.setTextSize(1);

  if (!hasReceivedData) {
    // Waiting for initial transmission
    screen.setTextColor(COLOR_RGB565_CYAN);
    screen.setCursor(0, 20);
    screen.printf("FEED BARREL RX");

    screen.setTextColor(COLOR_RGB565_YELLOW);
    screen.setCursor(0, 42);
    screen.printf("Pond: %s", TARGET_POND_ID);

    screen.setTextColor(COLOR_RGB565_WHITE);
    screen.setCursor(0, 65);
    screen.printf("Waiting Lora...");
    return;
  }

  // Row 1: Header / Pond ID
  screen.setTextColor(COLOR_RGB565_CYAN);
  screen.setCursor(0, 16);
  screen.printf("POND %s", lastPondID.c_str());

  // Row 2: Distance Reading
  screen.setTextColor(COLOR_RGB565_GREEN);
  screen.setCursor(0, 36);
  if (lastDistCM == "ERR") {
    screen.printf("Dist: SENSOR ERR");
  } else {
    screen.printf("Dist: %s cm", lastDistCM.c_str());
  }

  // Row 3: Packet Counter & Battery (if available)
  screen.setTextColor(COLOR_RGB565_YELLOW);
  screen.setCursor(0, 56);
  if (lastBatV != "---") {
    screen.printf("Bat:%sV  #%s", lastBatV.c_str(), lastPktNum.c_str());
  } else {
    screen.printf("Packet: #%s", lastPktNum.c_str());
  }

  // Row 4: Signal Strength (RSSI / SNR)
  screen.setTextColor(COLOR_RGB565_WHITE);
  screen.setCursor(0, 74);
  screen.printf("%ddBm  SNR:%d", lastRSSI, lastSNR);
}

// LoRa packet received callback
void loraRxDone(uint8_t *payload, uint16_t size, int16_t rssi, int8_t snr) {
  // Convert payload buffer to C++ String
  String incoming = "";
  for (uint16_t i = 0; i < size; i++) {
    incoming += (char)payload[i];
  }

  totalPacketsRecv++;
  lastPacketMillis = millis();
  hasReceivedData = true;
  lastRSSI = rssi;
  lastSNR = snr;

  // Expected format: "ID:01.02.12,Dist_cm:45.2,Bat_V:4.08,Pkt:1"
  lastPondID = extractValue(incoming, "ID:");
  lastDistCM = extractValue(incoming, "Dist_cm:");
  lastBatV   = extractValue(incoming, "Bat_V:");
  lastPktNum = extractValue(incoming, "Pkt:");

  // Print structured log to USB Serial
  Serial.println(F("--------------------------------------------------"));
  Serial.printf("[LORA RX #%lu] Received (%d bytes) from Pond: %s\n", 
                totalPacketsRecv, size, lastPondID.c_str());
  Serial.printf("  -> Raw Data  : %s\n", incoming.c_str());
  Serial.printf("  -> Distance  : %s cm\n", lastDistCM.c_str());
  Serial.printf("  -> Battery   : %s V\n", lastBatV.c_str());
  Serial.printf("  -> Packet No : %s\n", lastPktNum.c_str());
  Serial.printf("  -> Signal    : RSSI %d dBm | SNR %d dB\n", rssi, snr);
  Serial.println(F("--------------------------------------------------"));

  newPacketFlag = true;
}

// LoRa receive error callback
void loraRxError(void) {
  Serial.println(F("[LORA RX ERROR] CRC or packet receive error. Resuming RX..."));
  radio.startRx();
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println(F("=============================================="));
  Serial.println(F("  FEED BARREL LORA RECEIVER (DFR1195)"));
  Serial.printf("  Listening on Freq: %lu Hz\n", RF_FREQUENCY);
  Serial.printf("  Target Pond ID   : %s\n", TARGET_POND_ID);
  Serial.println(F("=============================================="));

  // 1. Initialize 0.96" TFT LCD
  screen.begin();
  updateDisplay();

  // 2. Initialize LoRa Radio
  radio.init();
  radio.setRxCB(loraRxDone);
  radio.setRxErrorCB(loraRxError);
  radio.setFreq(RF_FREQUENCY);
  radio.setSF(LORA_SPREADING_FACTOR);
  radio.setBW(LORA_BANDWIDTH);

  // 3. Start Continuous Listening
  radio.startRx();
  Serial.println(F("[LORA RX] Listening for incoming barrel packets..."));
}

void loop() {
  // Update display immediately when a new packet arrives
  if (newPacketFlag) {
    newPacketFlag = false;
    updateDisplay();
  }

  // Periodic heartbeat / elapsed time check every 15 seconds
  static unsigned long lastCheck = 0;
  if (millis() - lastCheck >= 15000) {
    lastCheck = millis();
    if (hasReceivedData) {
      unsigned long elapsedSec = (millis() - lastPacketMillis) / 1000;
      unsigned long elapsedMin = elapsedSec / 60;
      Serial.printf("[STATUS] Last packet received %lu min %lu sec ago\n", elapsedMin, elapsedSec % 60);
    }
  }

  delay(50);
}
