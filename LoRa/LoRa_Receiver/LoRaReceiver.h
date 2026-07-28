#ifndef LORA_RECEIVER_H
#define LORA_RECEIVER_H

#include "Config.h"
#include <Arduino.h>
#include <LoRa.h>
#include <SPI.h>

class LoRaReceiver {
public:
  LoRaReceiver();

  // Initializes SPI pins and LoRa radio module
  bool begin();

  // Non-blocking loop call to handle incoming packets and auto-reconnect retry
  void update();

  // Status & Getters
  bool isInitialized() const { return _initialized; }
  bool hasReceivedData() const { return _hasReceivedData; }
  unsigned long getLastPacketTime() const { return _lastPacketTime; }
  unsigned long getPacketCount() const { return _packetCount; }

  int getRssi() const { return _rssi; }
  float getSnr() const { return _snr; }

  String getDOString() const { return _lastDO; }
  String getTempString() const { return _lastTemp; }
  String getPHString() const { return _lastPH; }
  String getTurbString() const { return _lastTurb; }
  String getSatString() const { return _lastSat; }

  float getDO() const;
  float getTemp() const;
  float getPH() const;
  float getTurb() const;
  float getSat() const;

private:
  bool _initialized;
  unsigned long _lastLoRaRetryTime;
  unsigned long _packetCount;
  unsigned long _lastPacketTime;
  bool _hasReceivedData;

  int _rssi;
  float _snr;

  // Cached sensor value strings
  String _lastDO;
  String _lastTemp;
  String _lastPH;
  String _lastTurb;
  String _lastSat;

  String extractValue(const String &data, const String &key);
  void parsePacketPayload(const String &payload);
};

#endif // LORA_RECEIVER_H
