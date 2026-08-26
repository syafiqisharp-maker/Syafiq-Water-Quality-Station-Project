#include "NetworkManager.h"

CloudSyncManager::CloudSyncManager()
    : _lastWiFiCheck(0), _lastQueueFlushTime(0), _lastPostTime(0) {}

void CloudSyncManager::begin() {
  Serial.print(F("[WIFI] Connecting to Wi-Fi SSID: "));
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  _lastWiFiCheck = millis();
}

void CloudSyncManager::update(StorageManager &storage) {
  unsigned long currentMillis = millis();

  // 1. Maintain Wi-Fi Connection
  if (currentMillis - _lastWiFiCheck > WIFI_CHECK_INTERVAL_MS) {
    _lastWiFiCheck = currentMillis;
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println(F("[WIFI] Wi-Fi not connected. Retrying connection..."));
      WiFi.reconnect();
    }
  }

  // 2. Non-Blocking Background Queue Flusher (1 record per interval)
  if (currentMillis - _lastQueueFlushTime >= QUEUE_FLUSH_INTERVAL_MS) {
    _lastQueueFlushTime = currentMillis;
    processBackgroundQueue(storage);
  }
}

bool CloudSyncManager::isConnected() const {
  return (WiFi.status() == WL_CONNECTED);
}

bool CloudSyncManager::postToGoogle(float doVal, float phVal, float turbVal,
                                   float tempVal, const String &timestampStr,
                                   float satVal) {
  if (!isConnected()) {
    Serial.println(
        F("[HTTP] Error: Wi-Fi offline. Cannot post to Google Sheets."));
    return false;
  }

  _lastPostTime = millis();

  WiFiClientSecure client;
  client.setInsecure(); // Skip TLS certificate validation for Google Script endpoint
  HTTPClient http;

  if (!http.begin(client, GOOGLE_SCRIPT_URL)) {
    Serial.println(F("[HTTP] Error: HTTP begin failed."));
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  http.setTimeout(HTTP_TIMEOUT_MS);

  String jsonPayload = "{\"do\":\"" + (isnan(doVal) ? "N/A" : String(doVal, 2)) +
                       "\",\"ph\":\"" + (isnan(phVal) ? "N/A" : String(phVal, 2)) +
                       "\",\"turbidity\":\"" + (isnan(turbVal) ? "N/A" : String(turbVal, 2)) +
                       "\",\"temperature\":\"" + (isnan(tempVal) ? "N/A" : String(tempVal, 2)) + "\"";

  if (!isnan(satVal)) {
    jsonPayload += ",\"saturation\":\"" + String(satVal, 1) + "\"";
  }

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
      http.setTimeout(HTTP_TIMEOUT_MS);
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

void CloudSyncManager::processBackgroundQueue(StorageManager &storage) {
  if (!isConnected()) return;

  // Avoid running immediately after a live packet upload
  if (millis() - _lastPostTime < 3000U) return;

  size_t count = storage.getOfflineRecordCount();
  if (count == 0) return;

  OfflineRecord rec;
  if (storage.peekNextOfflineRecord(rec)) {
    Serial.printf("[QUEUE FLUSH] Uploading 1 backlogged record from %s (Queue remaining: %d)...\n",
                  rec.timestamp.c_str(), (int)count);
    bool ok = postToGoogle(rec.doConc, rec.ph, rec.turbidity, rec.temperature,
                           rec.timestamp, rec.doSat);
    if (ok) {
      storage.popNextOfflineRecord();
      Serial.println(F("[QUEUE FLUSH] Backlogged record uploaded and popped successfully."));
    } else {
      // Temporary backoff on failure to prevent repeated fast retries
      _lastQueueFlushTime = millis() + QUEUE_RETRY_BACKOFF_MS;
      Serial.println(F("[QUEUE FLUSH] Upload failed. Backing off for 30 seconds."));
    }
  } else {
    // Record was unreadable/corrupted, discard it
    storage.popNextOfflineRecord();
  }
}
