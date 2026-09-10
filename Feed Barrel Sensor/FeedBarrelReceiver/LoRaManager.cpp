#include "LoRaManager.h"

char LoRaManager::s_rxBuffer[256];
volatile uint16_t LoRaManager::s_rxSize = 0;
volatile int16_t LoRaManager::s_rxRSSI = 0;
volatile int8_t LoRaManager::s_rxSNR = 0;
volatile bool LoRaManager::s_newPacket = false;
volatile bool LoRaManager::s_rxError = false;
volatile bool LoRaManager::s_ackDone = false;

LoRaManager::LoRaManager()
    : _pondCacheCount(0), _lastPacketMillis(0), _lastHealthCheck(0) {
  memset(_pondCache, 0, sizeof(_pondCache));
}

void LoRaManager::begin() {
  _radio.init();
  _radio.setTxCB(onTxDone);
  _radio.setRxCB(onRxDone);
  _radio.setRxErrorCB(onRxError);
  _radio.setFreq(RF_FREQUENCY);
  _radio.setEIRP(TX_EIRP);
  _radio.setSF(LORA_SPREADING_FACTOR);
  _radio.setBW(LORA_BANDWIDTH);

  _radio.startRx();
  _lastPacketMillis = millis();
  _lastHealthCheck = millis();
  Serial.println(F("[LORA RX] Listening for incoming barrel packets..."));
}

void LoRaManager::onTxDone() {
  s_ackDone = true;
}

void LoRaManager::onRxDone(uint8_t *payload, uint16_t size, int16_t rssi, int8_t snr) {
  if (size == 0) return;

  uint16_t copyLen = (size < sizeof(s_rxBuffer) - 1) ? size : sizeof(s_rxBuffer) - 1;
  memcpy(s_rxBuffer, payload, copyLen);
  s_rxBuffer[copyLen] = '\0';

  s_rxSize = copyLen;
  s_rxRSSI = rssi;
  s_rxSNR  = snr;
  s_newPacket = true;
}

void LoRaManager::onRxError() {
  s_rxError = true;
}

bool LoRaManager::hasNewPacket(String &outData, int16_t &outRSSI, int8_t &outSNR) {
  if (s_rxError) {
    s_rxError = false;
    Serial.println(F("[LORA RX ERROR] Packet corrupt/CRC error. Re-arming RX..."));
    _radio.startRx();
  }

  if (s_newPacket) {
    s_newPacket = false;
    outData = String(s_rxBuffer);
    outRSSI = s_rxRSSI;
    outSNR  = s_rxSNR;
    return true;
  }
  return false;
}

bool LoRaManager::isDuplicate(const char *pondId, uint32_t pkt) {
  for (uint8_t i = 0; i < _pondCacheCount; i++) {
    if (strcmp(_pondCache[i].pondId, pondId) == 0) {
      if (_pondCache[i].lastPkt == pkt) {
        return true; // Duplicate!
      }
      _pondCache[i].lastPkt = pkt; // New packet from known pond
      return false;
    }
  }
  if (_pondCacheCount < MAX_POND_CACHE) {
    strncpy(_pondCache[_pondCacheCount].pondId, pondId, sizeof(_pondCache[0].pondId) - 1);
    _pondCache[_pondCacheCount].pondId[sizeof(_pondCache[0].pondId) - 1] = '\0';
    _pondCache[_pondCacheCount].lastPkt = pkt;
    _pondCacheCount++;
  }
  return false;
}

void LoRaManager::sendAddressedAck(const String &pondId, const String &pktNum) {
  String ackPayload = "ACK:" + pondId + ",Pkt:" + pktNum;
  s_ackDone = false;

  _radio.sendData((uint8_t *)ackPayload.c_str(), ackPayload.length());

  unsigned long start = millis();
  while (!s_ackDone && (millis() - start < 500)) {
    delay(2);
  }

  // Immediately return to continuous RX mode
  _radio.startRx();

  Serial.printf("[LORA ACK] Sent targeted ACK: \"%s\" (< %lu ms)\n",
                ackPayload.c_str(), millis() - start);
}

void LoRaManager::recordPacketReceived() {
  _lastPacketMillis = millis();
}

void LoRaManager::checkSilenceWatchdog(bool hasReceivedAnyData) {
  if (millis() - _lastHealthCheck >= 60000UL) {
    _lastHealthCheck = millis();
    if (hasReceivedAnyData && (millis() - _lastPacketMillis > RX_DEAD_THRESHOLD_MS)) {
      Serial.println(F("[RX HEALTH] No packets for 10 min! Performing clean hardware reset of SX1262..."));
      pinMode(LORA_RST, OUTPUT);
      digitalWrite(LORA_RST, LOW);
      delay(10);
      digitalWrite(LORA_RST, HIGH);
      delay(20);

      _radio.init();
      _radio.setTxCB(onTxDone);
      _radio.setRxCB(onRxDone);
      _radio.setRxErrorCB(onRxError);
      _radio.setFreq(RF_FREQUENCY);
      _radio.setEIRP(TX_EIRP);
      _radio.setSF(LORA_SPREADING_FACTOR);
      _radio.setBW(LORA_BANDWIDTH);
      _radio.startRx();

      _lastPacketMillis = millis(); // Reset silence counter
      Serial.println(F("[RX HEALTH] Radio successfully re-initialized and re-armed for continuous RX."));
    }
  }
}
