/**
 * ============================================================================
 * Feed Barrel LoRa Telemetry - Google Apps Script Webhook (Enhanced v2.1)
 * ============================================================================
 * 
 * Target Google Sheet:
 * https://docs.google.com/spreadsheets/d/19lHzaW6WengVOE1N-zNk-trIGwLduU7rDfaZGGLwSuM/edit?gid=0#gid=0
 * 
 * Target Tab: "RawData"
 * 
 * Features:
 *  - Supports both single record and batch array uploads ([ {...}, {...} ])
 *  - Respects true capture timestamp from ESP32 RTC/NTP for offline backlogs
 *  - Prevents time-distortion in rolling rate and refill window checks
 *  - Atomic write lock handling up to 30s
 *  - 100% backward compatible with existing single-object format
 * ============================================================================
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  // Wait up to 30 seconds for concurrent write locks
  if (!lock.tryLock(30000)) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Server busy: lock timeout"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("RawData") || ss.getActiveSheet();
    var payload;

    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "No post data received"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Ensure headers exist if sheet is blank
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Timestamp", "Pond ID", "Distance (cm)", "Battery (V)",
        "Weight (kg)", "Consumed (kg)", "Rate (kg/h)", "EventType"
      ]);
    }

    var timeZone = "Asia/Kuala_Lumpur";
    var now = new Date();

    // Determine if payload is an array, object with records array, or single record
    var records = [];
    var isSingleMode = false;
    if (Array.isArray(payload)) {
      records = payload;
    } else if (payload.records && Array.isArray(payload.records)) {
      records = payload.records;
    } else {
      records = [payload];
      isSingleMode = true;
    }

    var processed = 0;
    var results = [];

    for (var r = 0; r < records.length; r++) {
      var itemResult = processSingleRecord(sheet, records[r], timeZone, now);
      results.push(itemResult);
      if (itemResult.status === "success") {
        processed++;
      }
    }

    if (isSingleMode && results.length > 0) {
      var single = results[0];
      if (single.status === "success") {
        return ContentService.createTextOutput(JSON.stringify({
          status: "success",
          appended: single.data
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({
          status: single.status,
          message: single.message || "Record rejected"
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      processed: processed,
      total: records.length,
      results: results
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

function processSingleRecord(sheet, data, timeZone, fallbackNow) {
  var rawDistance = parseFloat(data.distance);
  if (isNaN(rawDistance)) {
    return { status: "error", message: "Invalid distance reading: " + data.distance };
  }

  // Determine true record date
  var recordDate = fallbackNow;
  var timestampStr = "";

  if (data.timestamp && String(data.timestamp).trim().length >= 10 && String(data.timestamp).indexOf("N/A") === -1) {
    timestampStr = String(data.timestamp).trim();
    // Parse "YYYY-MM-DD HH:MM:SS" or ISO
    var parsed = new Date(timestampStr.replace(/-/g, "/"));
    if (!isNaN(parsed.getTime())) {
      recordDate = parsed;
    }
  } else {
    timestampStr = Utilities.formatDate(fallbackNow, timeZone, "yyyy-MM-dd HH:mm:ss");
  }

  var pondId = String(data.pondId || data.pond_id || data.id || "01.02.12").trim();
  var battery = (data.battery !== undefined && data.battery !== null) ? parseFloat(data.battery) : "---";

  // Hardware Calibration & Clamping
  var isFullZone = (rawDistance <= 30.0);
  var currentWeight;

  if (isFullZone) {
    currentWeight = 125.0; // Upper Mound Filter clamp
  } else if (rawDistance >= 69.0) {
    currentWeight = 0.0;   // Empty barrel clamp
  } else {
    currentWeight = Math.round((69.0 - rawDistance) * (125.0 / 39.0) * 100) / 100;
  }

  // Refill Window Check based on recordDate (06:00 to 19:00 local time)
  var hourStr = Utilities.formatDate(recordDate, timeZone, "HH");
  var recordHour = parseInt(hourStr, 10);
  var isRefillWindow = (recordHour >= 6 && recordHour < 19);

  // Retrieve Previous Entries for this Pond ID (up to last 100 rows scan)
  var lastRow = sheet.getLastRow();
  var historyForPond = [];

  if (lastRow > 1) {
    var numRowsToScan = Math.min(lastRow - 1, 100);
    var startRow = lastRow - numRowsToScan + 1;
    var rangeValues = sheet.getRange(startRow, 1, numRowsToScan, 8).getValues();

    for (var i = rangeValues.length - 1; i >= 0; i--) {
      var rowPondId = String(rangeValues[i][1]).trim();
      if (rowPondId.toLowerCase() === pondId.toLowerCase()) {
        var rowDate = rangeValues[i][0] instanceof Date ? rangeValues[i][0] : new Date(String(rangeValues[i][0]).replace(/-/g, "/"));
        historyForPond.unshift({
          timestamp: rowDate,
          weight: parseFloat(rangeValues[i][4]) || 0.0,
          consumed: parseFloat(rangeValues[i][5]) || 0.0,
          rate: parseFloat(rangeValues[i][6]) || 0.0,
          eventType: String(rangeValues[i][7] || "")
        });
        if (historyForPond.length >= 2) break; // Need at most 2 previous entries (N-2, N-1)
      }
    }
  }

  var consumed = 0.0;
  var rate = 0.0;
  var eventType = "IDLE";

  if (historyForPond.length === 0) {
    eventType = isFullZone ? "FULL_SATURATED" : "IDLE";
    consumed = 0.0;
    rate = 0.0;
  } else {
    var prevEntry = historyForPond[historyForPond.length - 1]; // Row N-1
    var weightDelta = currentWeight - prevEntry.weight;        // Positive = weight increased
    var weightDrop = prevEntry.weight - currentWeight;         // Positive = weight dropped

    // Outlier Filter (Sonic Bounce Gate)
    if (!isFullZone && weightDelta > 0) {
      var isOutlier = (weightDelta < 25.0) || (!isRefillWindow);
      if (isOutlier) {
        return {
          status: "outlier_rejected",
          message: "Sonic bounce or refill outside window rejected (Delta: " + weightDelta + " kg)"
        };
      }
    }

    // Determine EventType & Consumed kg
    if (isFullZone) {
      eventType = "FULL_SATURATED";
      consumed = 0.0;
    } else if (weightDelta >= 25.0 && isRefillWindow) {
      eventType = "REFILL";
      consumed = 0.0;
    } else if (weightDrop > 1.0) {
      eventType = "FEEDING";
      consumed = Math.round(weightDrop * 100) / 100;
    } else {
      eventType = "IDLE";
      consumed = 0.0;
    }

    // 3-Point Rolling Hourly Feed Rate using recordDate
    if (isFullZone || eventType === "REFILL") {
      rate = 0.0;
    } else if (historyForPond.length >= 2) {
      var prev2Entry = historyForPond[0]; // Row N-2
      var hadRefill = (prevEntry.eventType === "REFILL" || prev2Entry.eventType === "REFILL");

      if (hadRefill) {
        rate = 0.0;
      } else {
        var timeDiffHours = (recordDate.getTime() - prev2Entry.timestamp.getTime()) / (1000 * 60 * 60);
        if (timeDiffHours > 0.01) {
          var calculatedRate = (prev2Entry.weight - currentWeight) / timeDiffHours;
          rate = Math.max(0, Math.round(calculatedRate * 100) / 100);
        } else {
          rate = 0.0;
        }
      }
    } else {
      rate = 0.0;
    }
  }

  // Append Row to Sheet (All 8 Columns)
  sheet.appendRow([
    timestampStr,
    pondId,
    rawDistance,
    battery,
    currentWeight,
    consumed,
    rate,
    eventType
  ]);

  return {
    status: "success",
    data: {
      timestamp: timestampStr,
      pond_id: pondId,
      distance: rawDistance,
      battery: battery,
      weight_kg: currentWeight,
      consumed_kg: consumed,
      rate_kgh: rate,
      event_type: eventType
    }
  };
}

function doGet(e) {
  return ContentService.createTextOutput(
    "Feed Barrel Google Sheets Webhook is active and listening for POST requests (v2.1 Batch-Ready).\n" +
    "Timestamp: " + Utilities.formatDate(new Date(), "Asia/Kuala_Lumpur", "yyyy-MM-dd HH:mm:ss")
  );
}
