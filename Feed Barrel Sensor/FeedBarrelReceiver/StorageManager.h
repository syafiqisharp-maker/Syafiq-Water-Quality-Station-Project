#ifndef STORAGE_MANAGER_H
#define STORAGE_MANAGER_H

#include <Arduino.h>
#include <LittleFS.h>
#include "Config.h"

struct SpoolRecord {
  String timestamp;
  String pondId;
  String distCM;
  String batV;
  String pktNum;
};

class StorageManager {
public:
  StorageManager();
  bool begin();
  bool hasSpool();
  size_t getSpoolCount();
  bool appendSpool(const String &ts, const String &pondId, const String &distCM, const String &batV, const String &pkt);
  bool peekNextRecord(SpoolRecord &record);
  bool popNextRecord();
  void clearSpool();

private:
  bool _initialized;
  SemaphoreHandle_t _fsMutex;
};

#endif // STORAGE_MANAGER_H
