#include "LoRaReceiver.h"

LoRaReceiver::LoRaReceiver()
    : _initialized(false), _lastLoRaRetryTime(0), _packetCount(0),
      _lastPacketTime(0), _hasReceivedData(false), _rssi(0), _snr(0.0),
      _lastDO("N/A"), _lastTemp("N/A"), _lastPH("N/A"), _lastTurb("N/A"),
      _lastSat("N/A") {}

bool LoRaReceiver::begin() {
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);

  if (LoRa.begin(LORA_BAND)) {
    LoRa.setSyncWord(LORA_SYNC_WORD);
    _initialized = true;
    Serial.println(F("[LORA RX] Initialization OK! Listening for packets..."));
    return true;
  } else {
    _initialized = false;
    Serial.println(F("[LORA RX] Initialization Failed! Retrying in background..."));
    return false;
  }
}

void LoRaReceiver::update() {
  unsigned long currentMillis = millis();

  // Background auto-reconnect retry if radio failed to initialize on boot
  if (!_initialized) {
    if (currentMillis - _lastLoRaRetryTime >= LORA_RETRY_INTERVAL_MS) {
      _lastLoRaRetryTime = currentMillis;
      Serial.println(F("[LORA RX] Retrying LoRa initialization..."));
      begin();
    }
    return;
  }

  // Parse incoming packet
  int packetSize = LoRa.parsePacket();
  if (packetSize) {
    _packetCount++;
    _lastPacketTime = currentMillis;
    _hasReceivedData = true;

    String incoming = "";
    while (LoRa.available()) {
      incoming += (char)LoRa.read();
    }

    _rssi = LoRa.packetRssi();
    _snr = LoRa.packetSnr();

    Serial.printf("[PKT #%lu] Received (%d bytes): %s\n", _packetCount, packetSize, incoming.c_str());
    Serial.printf("        -> RSSI: %d dBm | SNR: %.1f dB\n", _rssi, _snr);

    parsePacketPayload(incoming);
  }
}

String LoRaReceiver::extractValue(const String &data, const String &key) {
  int keyIndex = data.indexOf(key);
  if (keyIndex == -1) return "N/A";
  int start = keyIndex + key.length();
  int end = data.indexOf(',', start);
  if (end == -1) end = data.length();
  String val = data.substring(start, end);
  val.trim();
  return val;
}

void LoRaReceiver::parsePacketPayload(const String &payload) {
  // Format: "pH:7.20,Turb:12.5,DO:6.50,Sat:98.5,Temp:28.4"
  _lastPH   = extractValue(payload, "pH:");
  _lastTurb = extractValue(payload, "Turb:");
  _lastDO   = extractValue(payload, "DO:");
  _lastSat  = extractValue(payload, "Sat:");
  _lastTemp = extractValue(payload, "Temp:");
}

float LoRaReceiver::getDO() const {
  if (_lastDO == "N/A") return NAN;
  return _lastDO.toFloat();
}

float LoRaReceiver::getTemp() const {
  if (_lastTemp == "N/A") return NAN;
  return _lastTemp.toFloat();
}

float LoRaReceiver::getPH() const {
  if (_lastPH == "N/A") return NAN;
  return _lastPH.toFloat();
}

float LoRaReceiver::getTurb() const {
  if (_lastTurb == "N/A") return NAN;
  return _lastTurb.toFloat();
}

float LoRaReceiver::getSat() const {
  if (_lastSat == "N/A") return NAN;
  return _lastSat.toFloat();
}
