#ifndef LORA_MANAGER_H
#define LORA_MANAGER_H

#include <Arduino.h>
#include "DFRobot_LoRaRadio.h"
#include "Config.h"

struct PondCache {
  char pondId[16];
  uint32_t lastPkt;
};

class LoRaManager {
public:
  LoRaManager();
  void begin();
  bool hasNewPacket(String &outData, int16_t &outRSSI, int8_t &outSNR);
  bool isDuplicate(const char *pondId, uint32_t pkt);
  void sendAddressedAck(const String &pondId, const String &pktNum);
  void checkSilenceWatchdog(bool hasReceivedAnyData);
  void recordPacketReceived();

  // Static ISR callbacks
  static void onTxDone();
  static void onRxDone(uint8_t *payload, uint16_t size, int16_t rssi, int8_t snr);
  static void onRxError();

private:
  DFRobot_LoRaRadio _radio;
  PondCache _pondCache[MAX_POND_CACHE];
  uint8_t _pondCacheCount;
  unsigned long _lastPacketMillis;
  unsigned long _lastHealthCheck;

  static char s_rxBuffer[256];
  static volatile uint16_t s_rxSize;
  static volatile int16_t s_rxRSSI;
  static volatile int8_t s_rxSNR;
  static volatile bool s_newPacket;
  static volatile bool s_rxError;
  static volatile bool s_ackDone;
};

#endif // LORA_MANAGER_H
