/**
 * ============================================================================
 * Feed Barrel LoRa Telemetry - Google Apps Script Webhook
 * ============================================================================
 * 
 * Target Google Sheet:
 * https://docs.google.com/spreadsheets/d/19lHzaW6WengVOE1N-zNk-trIGwLduU7rDfaZGGLwSuM/edit?gid=0#gid=0
 * 
 * Target Column Layout:
 *  - Column A: Timestamp
 *  - Column B: Pond ID
 *  - Column C: Distance (cm)
 *  - Column D: Battery (V)
 * 
 * Setup Instructions:
 *  1. Open your Google Sheet linked above.
 *  2. Go to Extensions > Apps Script.
 *  3. Copy and paste this complete code into Code.gs (replacing any default code).
 *  4. Click "Deploy" > "New deployment".
 *  5. Click the gear icon next to "Select type" and choose "Web app".
 *  6. Set:
 *     - Description : Feed Barrel Receiver Webhook
 *     - Execute as  : Me (your Google account)
 *     - Who has access: Anyone (CRITICAL: allows the ESP32 to post without OAuth login)
 *  7. Click "Deploy", authorize the permissions, and copy the "Web app URL"
 *     (starts with https://script.google.com/macros/s/.../exec).
 *  8. Paste that Web app URL into Config.h or FeedBarrelReceiver.ino.
 * ============================================================================
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  // Wait up to 10 seconds for any concurrent execution lock
  lock.tryLock(10000);

  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data;

    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "No post data received"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 1. Column A: Timestamp
    // If ESP32 supplies a timestamp, use it; otherwise generate current GMT+8 time
    var timestamp = data.timestamp || Utilities.formatDate(new Date(), "GMT+8", "yyyy-MM-dd HH:mm:ss");

    // 2. Column B: Pond ID
    var pondId = data.pond_id || data.id || "01.02.12";

    // 3. Column C: Distance
    var distance = (data.distance !== undefined && data.distance !== null) ? data.distance : "ERR";

    // 4. Column D: Battery
    var battery = (data.battery !== undefined && data.battery !== null) ? data.battery : "---";

    // Append row into Google Sheets
    sheet.appendRow([timestamp, pondId, distance, battery]);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      appended: {
        timestamp: timestamp,
        pond_id: pondId,
        distance: distance,
        battery: battery
      }
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);

  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return ContentService.createTextOutput(
    "Feed Barrel Google Sheets Webhook is active and listening for POST requests.\n" +
    "Timestamp: " + Utilities.formatDate(new Date(), "GMT+8", "yyyy-MM-dd HH:mm:ss")
  );
}
