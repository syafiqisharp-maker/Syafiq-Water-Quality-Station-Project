#ifndef STORAGE_MANAGER_H
#define STORAGE_MANAGER_H

#include "Config.h"
#include <Arduino.h>
#include <FS.h>
#include <LittleFS.h>

struct OfflineRecord {
  String timestamp;
  float doConc;
  float ph;
  float turbidity;
  float temperature;
  float doSat;
};

class StorageManager {
public:
  StorageManager();

  // Mounts LittleFS file system (formats if corrupt/unformatted)
  bool begin();

  // Appends a sensor reading to the offline LittleFS queue
  bool saveOfflineRecord(const String &timestamp, float doConc, float ph,
                         float turbidity, float temp, float doSat);

  // Returns total number of pending offline records stored in flash
  size_t getOfflineRecordCount();

  // Retrieves the oldest record in the queue without removing it
  bool peekNextOfflineRecord(OfflineRecord &record);

  // Removes the oldest record from the queue after successful upload
  bool popNextOfflineRecord();

  // Clears all offline records
  void clearOfflineQueue();

private:
  bool _initialized;
  size_t _recordCount;
  void updateRecordCount();
};

#endif // STORAGE_MANAGER_H
