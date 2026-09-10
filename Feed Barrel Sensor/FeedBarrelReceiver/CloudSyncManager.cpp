#include "CloudSyncManager.h"

CloudSyncManager::CloudSyncManager()
    : _status(CLOUD_IDLE), _lastWiFiCheck(0), _nextRetryTime(0) {}

void CloudSyncManager::begin() {
  Serial.printf("[WIFI] Connecting to SSID: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false); // Disable modem sleep to eliminate latency spikes and packet loss
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  _lastWiFiCheck = millis();
}

void CloudSyncManager::updateWiFi() {
  if (millis() - _lastWiFiCheck >= WIFI_CHECK_INTERVAL_MS) {
    _lastWiFiCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println(F("[WIFI] Disconnected. Reconnecting in background..."));
      WiFi.reconnect();
    }
  }
}

bool CloudSyncManager::isConnected() const {
  return (WiFi.status() == WL_CONNECTED);
}

int CloudSyncManager::getRSSI() const {
  return isConnected() ? WiFi.RSSI() : 0;
}

bool CloudSyncManager::canAttemptUpload() const {
  return isConnected() && (millis() >= _nextRetryTime);
}

void CloudSyncManager::triggerBackoff() {
  _nextRetryTime = millis() + QUEUE_RETRY_BACKOFF_MS;
  Serial.printf("[CLOUD] Upload failed/backed off. Waiting %u seconds before retry.\n",
                QUEUE_RETRY_BACKOFF_MS / 1000);
}

void CloudSyncManager::resetBackoff() {
  _nextRetryTime = 0;
}

bool CloudSyncManager::postTelemetry(const String &ts, const String &pondId, const String &distCM, const String &batV) {
  if (!isConnected()) {
    Serial.println(F("[HTTP] Wi-Fi offline. Skipping upload."));
    _status = CLOUD_FAIL;
    return false;
  }

  String scriptUrl = String(GOOGLE_SCRIPT_URL);
  if (scriptUrl.indexOf("http") != 0 || scriptUrl.indexOf("YOUR_GOOGLE") >= 0) {
    Serial.println(F("[HTTP] GOOGLE_SCRIPT_URL not configured in Config.h"));
    _status = CLOUD_FAIL;
    return false;
  }

  // Build JSON Payload
  String jsonPayload = "{";
  if (ts.length() > 0 && ts != "N/A") {
    jsonPayload += "\"timestamp\":\"" + ts + "\",";
  }
  jsonPayload += "\"pond_id\":\"" + pondId + "\",";
  if (distCM == "ERR" || distCM == "---") {
    jsonPayload += "\"distance\":\"ERR\",";
  } else {
    jsonPayload += "\"distance\":" + distCM + ",";
  }
  if (batV == "---") {
    jsonPayload += "\"battery\":\"---\"}";
  } else {
    jsonPayload += "\"battery\":" + batV + "}";
  }

  Serial.printf("[HTTP] Free Heap: %lu bytes | Posting: %s\n",
                (unsigned long)ESP.getFreeHeap(), jsonPayload.c_str());

  bool postAccepted = false;
  bool confirmedSuccess = false;
  String redirectUrl = "";

  // Step 1: POST to script.google.com (Scoped TLS socket)
  {
    WiFiClientSecure client;
    client.setInsecure(); // Skip cert verification for Google Script Webhook
    HTTPClient http;
    http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
    http.setTimeout(HTTP_TIMEOUT_MS); // 20s timeout for slow/poor connections

    if (http.begin(client, scriptUrl)) {
      http.addHeader("Content-Type", "application/json");
      int httpCode = http.POST(jsonPayload);
      Serial.printf("[HTTP POST] Code: %d\n", httpCode);

      if (httpCode == 301 || httpCode == 302) {
        // In Google Apps Script, 302 means doPost() ran and data is committed!
        postAccepted = true;
        redirectUrl = http.getLocation();
      } else if (httpCode == 200) {
        postAccepted = true;
        confirmedSuccess = true;
      } else {
        Serial.printf("[HTTP POST] Error: %s\n", http.errorToString(httpCode).c_str());
      }
      http.end();
    } else {
      Serial.println(F("[HTTP] Failed to connect to Google Script endpoint."));
    }
    client.stop(); // Release TLS buffers cleanly
  }

  // Step 2: Follow 302 redirect to script.googleusercontent.com
  if (redirectUrl.length() > 0) {
    Serial.println(F("[HTTP] Following 302 redirect to inspect response..."));
    WiFiClientSecure client2;
    client2.setInsecure();
    HTTPClient http2;
    http2.setTimeout(HTTP_TIMEOUT_MS);

    if (http2.begin(client2, redirectUrl)) {
      int getCode = http2.GET();
      Serial.printf("[HTTP REDIRECT] Code: %d\n", getCode);

      if (getCode > 0) {
        String resp = http2.getString();
        resp.trim();
        // Check for rejection/error from script
        if (resp.indexOf("\"status\":\"error\"") >= 0 || resp.indexOf("Outlier rejected") >= 0) {
          Serial.printf("[HTTP] Warning: Webhook returned error/rejection: %s\n", resp.c_str());
          confirmedSuccess = false;
          postAccepted = false;
        } else if (resp.indexOf("success") >= 0 || getCode == 200) {
          Serial.println(F("[HTTP] Logged to Google Sheets successfully!"));
          confirmedSuccess = true;
        } else {
          Serial.printf("[HTTP] Response body: %s\n", resp.c_str());
        }
      } else {
        Serial.printf("[HTTP REDIRECT] Warning: %s (POST was already committed in Step 1)\n",
                      http2.errorToString(getCode).c_str());
        // Since Step 1 received 302, data reached Google; avoid duplicate re-posts
        confirmedSuccess = true;
      }
      http2.end();
    }
    client2.stop();
  }

  bool success = (postAccepted || confirmedSuccess);
  _status = success ? CLOUD_OK : CLOUD_FAIL;

  if (success) {
    resetBackoff();
  }

  return success;
}
