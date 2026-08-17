#include "NetworkManager.h"

CloudSyncManager::CloudSyncManager() : _lastWiFiCheck(0), _flushingQueue(false) {}

void CloudSyncManager::begin() {
  Serial.print(F("[WIFI] Connecting to Wi-Fi SSID: "));
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  _lastWiFiCheck = millis();
}

void CloudSyncManager::update() {
  if (millis() - _lastWiFiCheck > WIFI_CHECK_INTERVAL_MS) {
    _lastWiFiCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println(F("[WIFI] Wi-Fi not connected. Retrying connection..."));
      WiFi.reconnect();
    }
  }
}

bool CloudSyncManager::isConnected() const {
  return (WiFi.status() == WL_CONNECTED);
}

bool CloudSyncManager::postToGoogle(float doVal, float phVal, float turbVal,
                                  float tempVal, const String &timestampStr) {
  if (!isConnected()) {
    Serial.println(
        F("[HTTP] Error: Wi-Fi offline. Cannot post to Google Sheets."));
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure(); // Skip TLS certificate validation for Google Script
                        // endpoint
  HTTPClient http;

  if (!http.begin(client, GOOGLE_SCRIPT_URL)) {
    Serial.println(F("[HTTP] Error: HTTP begin failed."));
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  http.setTimeout(15000);

  String jsonPayload = "{\"do\":\"" + String(doVal, 2) + "\",\"ph\":\"" +
                       String(phVal, 2) + "\",\"turbidity\":\"" +
                       String(turbVal, 2) + "\",\"temperature\":\"" +
                       String(tempVal, 2) + "\"";

  if (timestampStr.length() > 0 && timestampStr != "N/A") {
    jsonPayload += ",\"timestamp\":\"" + timestampStr + "\"";
  }
  jsonPayload += "}";

  Serial.print(F("[HTTP POST] Sending payload: "));
  Serial.println(jsonPayload);

  int httpCode = http.POST(jsonPayload);
  Serial.printf("[HTTP POST] Code: %d\n", httpCode);

  // Handle HTTP 301/302 Redirect (Google Script redirect pattern)
  if (httpCode == 301 || httpCode == 302) {
    String newUrl = http.getLocation();
    http.end();
    if (http.begin(client, newUrl)) {
      http.setTimeout(15000);
      httpCode = http.GET();
      Serial.printf("[HTTP GET Redirect] Code: %d\n", httpCode);
    }
  }

  bool success = false;
  if (httpCode > 0) {
    String response = http.getString();
    response.trim();
    if (response.indexOf("success") >= 0 || httpCode == 200) {
      success = true;
      Serial.println(F("[HTTP POST] Upload Success!"));
    }
  } else {
    Serial.printf("[HTTP POST] Connection failed: %s\n",
                  http.errorToString(httpCode).c_str());
  }

  http.end();
  return success;
}

void CloudSyncManager::flushOfflineQueue(StorageManager &storage) {
  if (!isConnected() || _flushingQueue)
    return;
  size_t count = storage.getOfflineRecordCount();
  if (count == 0)
    return;

  _flushingQueue = true;
  Serial.printf("[QUEUE FLUSH] Found %d backlogged records in LittleFS "
                "storage. Flushing...\n",
                (int)count);

  OfflineRecord rec;
  while (storage.getOfflineRecordCount() > 0 && isConnected()) {
    if (storage.peekNextOfflineRecord(rec)) {
      Serial.printf("[QUEUE FLUSH] Uploading record from %s ...\n",
                    rec.timestamp.c_str());
      bool ok = postToGoogle(rec.doConc, rec.ph, rec.turbidity, rec.temperature,
                             rec.timestamp);
      if (ok) {
        storage.popNextOfflineRecord();
        delay(500); // Small delay between batch requests
      } else {
        Serial.println(
            F("[QUEUE FLUSH] Upload failed during flush. Pausing flush."));
        break;
      }
    } else {
      storage.popNextOfflineRecord(); // Pop corrupted record
    }
  }

  _flushingQueue = false;
  if (storage.getOfflineRecordCount() == 0) {
    Serial.println(F(
        "[QUEUE FLUSH] All backlogged offline records successfully uploaded!"));
  }
}
