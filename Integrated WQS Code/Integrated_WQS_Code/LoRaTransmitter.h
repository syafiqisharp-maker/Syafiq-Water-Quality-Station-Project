#ifndef LORA_TRANSMITTER_H
#define LORA_TRANSMITTER_H

#include <Arduino.h>
#include <LoRa.h>
#include <SPI.h>
#include "Config.h"

class LoRaTransmitter {
public:
    LoRaTransmitter();

    // Initialize SPI and LoRa Ra-02 module
    bool begin();

    // Maintain background reconnect timing if offline
    void maintain(unsigned long currentMillis);

    // Transmit sensor data via LoRa
    bool sendData(const WQSData& data);

    // Status getter
    bool isInitialized() const { return _initialized; }

private:
    bool _initialized;
    unsigned long _lastRetryTime;
};

#endif // LORA_TRANSMITTER_H
