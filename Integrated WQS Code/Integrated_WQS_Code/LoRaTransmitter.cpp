#include "LoRaTransmitter.h"

LoRaTransmitter::LoRaTransmitter() : _initialized(false), _lastRetryTime(0) {}

bool LoRaTransmitter::begin() {
  SPI.begin(LORA_SCK_PIN, LORA_MISO_PIN, LORA_MOSI_PIN, LORA_NSS_PIN);
  LoRa.setPins(LORA_NSS_PIN, LORA_RST_PIN, LORA_DIO0_PIN);

  if (LoRa.begin(LORA_BAND)) {
    LoRa.setSyncWord(LORA_SYNC_WORD);
    _initialized = true;
    Serial.println(F("-> LoRa Ra-02 (433 MHz): Initialized OK"));
    return true;
  } else {
    _initialized = false;
    Serial.println(F(
        "-> LoRa Ra-02 (433 MHz): Initialization Failed! Auto-retry enabled."));
    return false;
  }
}

void LoRaTransmitter::maintain(unsigned long currentMillis) {
  if (!_initialized) {
    if (currentMillis - _lastRetryTime >= LORA_RETRY_INTERVAL_MS) {
      _lastRetryTime = currentMillis;
      Serial.println(
          F("[LORA] Attempting non-blocking auto-reconnect initialization..."));
      begin();
    }
  }
}

bool LoRaTransmitter::sendData(const WQSData &data) {
  if (!_initialized)
    return false;

  LoRa.beginPacket();
  LoRa.print(F("pH:"));
  if (isnan(data.ph) || !data.phValid)
    LoRa.print(F("N/A"));
  else
    LoRa.print(data.ph, 2);

  LoRa.print(F(",Turb:"));
  if (isnan(data.turbidity) || !data.turbidityValid)
    LoRa.print(F("N/A"));
  else
    LoRa.print(data.turbidity, 1);

  LoRa.print(F(",DO:"));
  if (isnan(data.doConc) || !data.doValid)
    LoRa.print(F("N/A"));
  else
    LoRa.print(data.doConc, 2);

  LoRa.print(F(",Sat:"));
  if (isnan(data.doSat) || !data.doValid)
    LoRa.print(F("N/A"));
  else
    LoRa.print(data.doSat, 1);

  LoRa.print(F(",Temp:"));
  if (isnan(data.temp) || !data.doValid)
    LoRa.print(F("N/A"));
  else
    LoRa.print(data.temp, 1);

  bool success = LoRa.endPacket();
  if (success) {
    Serial.print(F("[LORA TX] Data sent -> pH:"));
    Serial.print((isnan(data.ph) || !data.phValid) ? 0.0f : data.ph, 2);
    Serial.print(F(", Turb:"));
    Serial.print((isnan(data.turbidity) || !data.turbidityValid) ? 0.0f : data.turbidity, 1);
    Serial.print(F("%, DO:"));
    Serial.print((isnan(data.doConc) || !data.doValid) ? 0.0f : data.doConc, 2);
    Serial.print(F("mg/L, Temp:"));
    Serial.print((isnan(data.temp) || !data.doValid) ? 0.0f : data.temp, 1);
    Serial.println(F("C"));
  } else {
    Serial.println(F("[LORA TX] Error: LoRa transmission failed!"));
  }

  return success;
}
