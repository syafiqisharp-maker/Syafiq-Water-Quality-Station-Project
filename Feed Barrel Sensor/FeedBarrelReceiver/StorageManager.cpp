#include "StorageManager.h"

StorageManager::StorageManager() : _initialized(false), _fsMutex(NULL) {}

bool StorageManager::begin() {
  if (_fsMutex == NULL) {
    _fsMutex = xSemaphoreCreateMutex();
  }

  if (xSemaphoreTake(_fsMutex, pdMS_TO_TICKS(2000)) == pdTRUE) {
    if (!LittleFS.begin(true)) {
      Serial.println(F("[STORAGE] LittleFS mount failed!"));
      _initialized = false;
    } else {
      _initialized = true;
      Serial.println(F("[STORAGE] LittleFS mounted successfully."));
      if (LittleFS.exists(OFFLINE_SPOOL_PATH)) {
        File f = LittleFS.open(OFFLINE_SPOOL_PATH, "r");
        if (f) {
          Serial.printf("[STORAGE] Found existing spool file (%d bytes). Resuming sync...\n", f.size());
          f.close();
        }
      }
    }
    xSemaphoreGive(_fsMutex);
  }
  return _initialized;
}

bool StorageManager::hasSpool() {
  if (!_initialized || _fsMutex == NULL) return false;
  bool exists = false;
  if (xSemaphoreTake(_fsMutex, pdMS_TO_TICKS(500)) == pdTRUE) {
    if (LittleFS.exists(OFFLINE_SPOOL_PATH)) {
      File f = LittleFS.open(OFFLINE_SPOOL_PATH, "r");
      if (f) {
        exists = (f.size() > 0);
        f.close();
      }
    }
    xSemaphoreGive(_fsMutex);
  }
  return exists;
}

size_t StorageManager::getSpoolCount() {
  if (!_initialized || _fsMutex == NULL) return 0;
  size_t count = 0;
  if (xSemaphoreTake(_fsMutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
    if (LittleFS.exists(OFFLINE_SPOOL_PATH)) {
      File f = LittleFS.open(OFFLINE_SPOOL_PATH, "r");
      if (f) {
        while (f.available()) {
          String line = f.readStringUntil('\n');
          line.trim();
          if (line.length() > 0) count++;
        }
        f.close();
      }
    }
    xSemaphoreGive(_fsMutex);
  }
  return count;
}

bool StorageManager::appendSpool(const String &ts, const String &pondId, const String &distCM, const String &batV, const String &pkt) {
  if (!_initialized || _fsMutex == NULL) return false;
  bool ok = false;
  if (xSemaphoreTake(_fsMutex, pdMS_TO_TICKS(2000)) == pdTRUE) {
    File f = LittleFS.open(OFFLINE_SPOOL_PATH, "a");
    if (f) {
      // Format: timestamp,pondId,distCM,batV,pktNum
      f.printf("%s,%s,%s,%s,%s\n", ts.c_str(), pondId.c_str(), distCM.c_str(), batV.c_str(), pkt.c_str());
      f.close();
      ok = true;
      Serial.printf("[STORAGE] Buffered offline record: Pond %s #%s (TS: %s)\n",
                    pondId.c_str(), pkt.c_str(), ts.c_str());
    } else {
      Serial.println(F("[STORAGE] Error: Failed to open spool file for appending!"));
    }
    xSemaphoreGive(_fsMutex);
  }
  return ok;
}

bool StorageManager::peekNextRecord(SpoolRecord &record) {
  if (!_initialized || _fsMutex == NULL) return false;

  String lineToParse = "";
  bool found = false;

  if (xSemaphoreTake(_fsMutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
    if (LittleFS.exists(OFFLINE_SPOOL_PATH)) {
      File f = LittleFS.open(OFFLINE_SPOOL_PATH, "r");
      if (f) {
        while (f.available()) {
          String line = f.readStringUntil('\n');
          line.trim();
          if (line.length() > 0 && line.indexOf(',') != -1) {
            lineToParse = line;
            found = true;
            break;
          }
        }
        f.close();
      }
    }
    xSemaphoreGive(_fsMutex);
  }

  if (!found || lineToParse.length() == 0) {
    // If file exists but contains only empty bytes, clear it
    if (xSemaphoreTake(_fsMutex, pdMS_TO_TICKS(1000)) == pdTRUE) {
      if (LittleFS.exists(OFFLINE_SPOOL_PATH)) {
        LittleFS.remove(OFFLINE_SPOOL_PATH);
      }
      xSemaphoreGive(_fsMutex);
    }
    return false;
  }

  // Count commas to distinguish 5-field from legacy 4-field
  int commaCount = 0;
  for (unsigned int i = 0; i < lineToParse.length(); i++) {
    if (lineToParse.charAt(i) == ',') commaCount++;
  }

  if (commaCount >= 4) {
    int c1 = lineToParse.indexOf(',');
    int c2 = lineToParse.indexOf(',', c1 + 1);
    int c3 = lineToParse.indexOf(',', c2 + 1);
    int c4 = lineToParse.indexOf(',', c3 + 1);
    record.timestamp = lineToParse.substring(0, c1);
    record.pondId    = lineToParse.substring(c1 + 1, c2);
    record.distCM    = lineToParse.substring(c2 + 1, c3);
    record.batV      = lineToParse.substring(c3 + 1, c4);
    record.pktNum    = lineToParse.substring(c4 + 1);
    return true;
  } else if (commaCount >= 2) {
    int c1 = lineToParse.indexOf(',');
    int c2 = lineToParse.indexOf(',', c1 + 1);
    int c3 = lineToParse.indexOf(',', c2 + 1);
    record.timestamp = "N/A";
    record.pondId    = lineToParse.substring(0, c1);
    record.distCM    = lineToParse.substring(c1 + 1, c2);
    record.batV      = (c3 != -1) ? lineToParse.substring(c2 + 1, c3) : lineToParse.substring(c2 + 1);
    record.pktNum    = (c3 != -1) ? lineToParse.substring(c3 + 1) : "";
    return true;
  } else {
    // Malformed line: prune this single corrupt line from file
    Serial.printf("[STORAGE] Pruning corrupt line: %s\n", lineToParse.c_str());
    popNextRecord();
    return false;
  }
}

bool StorageManager::popNextRecord() {
  if (!_initialized || _fsMutex == NULL) return false;
  bool ok = false;

  if (xSemaphoreTake(_fsMutex, pdMS_TO_TICKS(2000)) == pdTRUE) {
    if (LittleFS.exists(OFFLINE_SPOOL_PATH)) {
      File f = LittleFS.open(OFFLINE_SPOOL_PATH, "r");
      File temp = LittleFS.open("/spool_tmp.txt", "w");
      if (f && temp) {
        bool skippedFirst = false;
        bool hasRemaining = false;
        while (f.available()) {
          String line = f.readStringUntil('\n');
          line.trim();
          if (line.length() > 0) {
            if (!skippedFirst) {
              skippedFirst = true; // Skip the oldest record
            } else {
              temp.println(line);
              hasRemaining = true;
            }
          }
          yield();
        }
        f.close();
        temp.close();
        LittleFS.remove(OFFLINE_SPOOL_PATH);
        if (hasRemaining) {
          LittleFS.rename("/spool_tmp.txt", OFFLINE_SPOOL_PATH);
        } else {
          LittleFS.remove("/spool_tmp.txt");
        }
        ok = true;
      } else {
        if (f) f.close();
        if (temp) temp.close();
      }
    }
    xSemaphoreGive(_fsMutex);
  }
  return ok;
}

void StorageManager::clearSpool() {
  if (!_initialized || _fsMutex == NULL) return;
  if (xSemaphoreTake(_fsMutex, pdMS_TO_TICKS(2000)) == pdTRUE) {
    if (LittleFS.exists(OFFLINE_SPOOL_PATH)) {
      LittleFS.remove(OFFLINE_SPOOL_PATH);
    }
    xSemaphoreGive(_fsMutex);
  }
  Serial.println(F("[STORAGE] Offline spool cleared."));
}
