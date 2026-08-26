#include "StorageManager.h"

StorageManager::StorageManager() : _initialized(false), _recordCount(0) {}

bool StorageManager::begin() {
  // Try mounting LittleFS; format if mount fails
  if (!LittleFS.begin(true)) {
    Serial.println(F("[STORAGE] LittleFS Mount Failed!"));
    _initialized = false;
    return false;
  }
  _initialized = true;
  Serial.println(F("[STORAGE] LittleFS Mounted Successfully."));
  updateRecordCount();
  Serial.printf("[STORAGE] Existing offline records in queue: %d\n", (int)_recordCount);
  return true;
}

void StorageManager::updateRecordCount() {
  if (!_initialized) {
    _recordCount = 0;
    return;
  }

  if (!LittleFS.exists(OFFLINE_STORAGE_FILE)) {
    _recordCount = 0;
    return;
  }

  File file = LittleFS.open(OFFLINE_STORAGE_FILE, "r");
  if (!file) {
    _recordCount = 0;
    return;
  }

  size_t count = 0;
  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (line.length() > 0) {
      count++;
    }
  }
  file.close();
  _recordCount = count;
}

bool StorageManager::saveOfflineRecord(const String &timestamp, float doConc,
                                       float ph, float turbidity, float temp,
                                       float doSat) {
  if (!_initialized) {
    if (!begin()) return false;
  }

  if (_recordCount >= MAX_OFFLINE_RECORDS) {
    Serial.println(F("[STORAGE] Warning: Offline storage queue full! Dropping oldest record..."));
    popNextOfflineRecord();
  }

  File file = LittleFS.open(OFFLINE_STORAGE_FILE, "a");
  if (!file) {
    Serial.println(F("[STORAGE] Error: Failed to open offline storage file for writing."));
    return false;
  }

  // Format CSV line: timestamp,doConc,ph,turbidity,temperature,doSat
  file.printf("%s,%.2f,%.2f,%.2f,%.2f,%.2f\n",
              timestamp.c_str(), doConc, ph, turbidity, temp, doSat);
  file.close();

  _recordCount++;
  Serial.printf("[STORAGE] Offline record saved (%s). Total queued: %d\n",
                timestamp.c_str(), (int)_recordCount);
  return true;
}

size_t StorageManager::getOfflineRecordCount() {
  return _recordCount;
}

bool StorageManager::peekNextOfflineRecord(OfflineRecord &record) {
  if (!_initialized || _recordCount == 0) return false;
  if (!LittleFS.exists(OFFLINE_STORAGE_FILE)) return false;

  File file = LittleFS.open(OFFLINE_STORAGE_FILE, "r");
  if (!file) return false;

  String line = file.readStringUntil('\n');
  file.close();
  line.trim();

  if (line.length() == 0) return false;

  // Parse CSV line: timestamp,doConc,ph,turbidity,temperature,doSat
  int idx1 = line.indexOf(',');
  if (idx1 == -1) return false;
  int idx2 = line.indexOf(',', idx1 + 1);
  if (idx2 == -1) return false;
  int idx3 = line.indexOf(',', idx2 + 1);
  if (idx3 == -1) return false;
  int idx4 = line.indexOf(',', idx3 + 1);
  if (idx4 == -1) return false;
  int idx5 = line.indexOf(',', idx4 + 1);

  record.timestamp   = line.substring(0, idx1);
  record.doConc      = line.substring(idx1 + 1, idx2).toFloat();
  record.ph          = line.substring(idx2 + 1, idx3).toFloat();
  record.turbidity   = line.substring(idx3 + 1, idx4).toFloat();
  record.temperature = line.substring(idx4 + 1, idx5 == -1 ? line.length() : idx5).toFloat();
  record.doSat       = (idx5 != -1) ? line.substring(idx5 + 1).toFloat() : NAN;

  return true;
}

bool StorageManager::popNextOfflineRecord() {
  if (!_initialized || _recordCount == 0) return false;
  if (!LittleFS.exists(OFFLINE_STORAGE_FILE)) {
    _recordCount = 0;
    return false;
  }

  // Fast path: If only 1 record left, simply remove the file
  if (_recordCount <= 1) {
    LittleFS.remove(OFFLINE_STORAGE_FILE);
    _recordCount = 0;
    return true;
  }

  File file = LittleFS.open(OFFLINE_STORAGE_FILE, "r");
  if (!file) return false;

  File tempFile = LittleFS.open("/temp_queue.csv", "w");
  if (!tempFile) {
    file.close();
    return false;
  }

  // Skip the first line (oldest record)
  String firstLine = file.readStringUntil('\n');

  // Copy remaining lines
  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (line.length() > 0) {
      tempFile.println(line);
    }
    yield(); // Allow ESP32 Wi-Fi and RTOS tasks to execute
  }

  file.close();
  tempFile.close();

  LittleFS.remove(OFFLINE_STORAGE_FILE);
  LittleFS.rename("/temp_queue.csv", OFFLINE_STORAGE_FILE);

  // Directly decrement counter instead of scanning entire file again
  if (_recordCount > 0) {
    _recordCount--;
  }
  return true;
}

void StorageManager::clearOfflineQueue() {
  if (!_initialized) return;
  if (LittleFS.exists(OFFLINE_STORAGE_FILE)) {
    LittleFS.remove(OFFLINE_STORAGE_FILE);
  }
  _recordCount = 0;
  Serial.println(F("[STORAGE] Offline record queue cleared."));
}
