/**
 * ============================================================================
 * Feed Barrel LoRa Telemetry - Google Apps Script Webhook (Enhanced v2.0)
 * ============================================================================
 * 
 * Target Google Sheet:
 * https://docs.google.com/spreadsheets/d/19lHzaW6WengVOE1N-zNk-trIGwLduU7rDfaZGGLwSuM/edit?gid=0#gid=0
 * 
 * Target Tab: "RawData"
 * 
 * Target Column Layout:
 *  - Column A: Timestamp (Asia/Kuala_Lumpur)
 *  - Column B: Pond ID
 *  - Column C: Distance (cm)
 *  - Column D: Battery (V)
 *  - Column E: Weight (kg)
 *  - Column F: Consumed (kg)
 *  - Column G: Rate (kg/h)
 *  - Column H: EventType (FEEDING | IDLE | REFILL | FULL_SATURATED)
 * 
 * Calibration & Logic Specs:
 *  - Empty barrel: 70.0 cm = 0.0 kg
 *  - Full barrel: <= 30.0 cm = 125.0 kg (Mound Filter)
 *  - Conversion factor: Weight (kg) = (70.0 - distance_cm) * 3.125
 *  - Sonic Bounce Gate (Outlier): Discard if weight increases < 25 kg or outside 06:00-19:00
 *  - Refill: Weight increase >= 25 kg strictly between 06:00 and 19:00 (covers morning 50-125kg & afternoon refills)
 *  - 3-Point Rolling Hourly Rate: (Weight_N-2 - Weight_N) / (Time_N - Time_N-2 in hours)
 * ============================================================================
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000); // Wait up to 10 seconds for concurrent write locks

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("RawData") || ss.getActiveSheet();
    var data;

    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
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

    // 1. Inbound Parsing & Timezone Handling
    var timeZone = "Asia/Kuala_Lumpur";
    var now = new Date();
    var timestamp = data.timestamp || Utilities.formatDate(now, timeZone, "yyyy-MM-dd HH:mm:ss");
    var pondId = String(data.pondId || data.pond_id || data.id || "01.02.12").trim();
    var rawDistance = parseFloat(data.distance);
    var battery = (data.battery !== undefined && data.battery !== null) ? parseFloat(data.battery) : "---";

    if (isNaN(rawDistance)) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "Invalid distance reading: " + data.distance
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Hardware Calibration & Clamping
    var isFullZone = (rawDistance <= 30.0);
    var currentWeight;

    if (isFullZone) {
      currentWeight = 125.0; // Upper Mound Filter clamp
    } else if (rawDistance >= 70.0) {
      currentWeight = 0.0;   // Empty barrel clamp
    } else {
      currentWeight = Math.round((70.0 - rawDistance) * 3.125 * 100) / 100;
    }

    // 3. Check Asia/Kuala_Lumpur Refill Window (Daytime Operating Hours: 06:00 to 19:00)
    // Allows both early morning refill (50-125kg) and subsequent refills after 11:00
    var hourStr = Utilities.formatDate(now, timeZone, "HH");
    var currentHour = parseInt(hourStr, 10);
    var isRefillWindow = (currentHour >= 6 && currentHour < 19);

    // 4. Retrieve Previous Entries for this Pond ID (up to last 100 rows scan)
    var lastRow = sheet.getLastRow();
    var historyForPond = [];

    if (lastRow > 1) {
      var numRowsToScan = Math.min(lastRow - 1, 100);
      var startRow = lastRow - numRowsToScan + 1;
      var rangeValues = sheet.getRange(startRow, 1, numRowsToScan, 8).getValues();

      for (var i = rangeValues.length - 1; i >= 0; i--) {
        var rowPondId = String(rangeValues[i][1]).trim();
        if (rowPondId.toLowerCase() === pondId.toLowerCase()) {
          var rowDate = rangeValues[i][0] instanceof Date ? rangeValues[i][0] : new Date(rangeValues[i][0]);
          historyForPond.unshift({
            timestamp: rowDate,
            weight: parseFloat(rangeValues[i][4]) || 0.0,
            consumed: parseFloat(rangeValues[i][5]) || 0.0,
            rate: parseFloat(rangeValues[i][6]) || 0.0,
            eventType: String(rangeValues[i][7] || "")
          });
          if (historyForPond.length >= 2) break; // We need at most 2 previous entries (N-2, N-1)
        }
      }
    }

    var consumed = 0.0;
    var rate = 0.0;
    var eventType = "IDLE";

    // 5. Evaluation Logic
    if (historyForPond.length === 0) {
      // First entry for this pond
      eventType = isFullZone ? "FULL_SATURATED" : "IDLE";
      consumed = 0.0;
      rate = 0.0;
    } else {
      var prevEntry = historyForPond[historyForPond.length - 1]; // Row N-1
      var weightDelta = currentWeight - prevEntry.weight;        // Positive = weight increased
      var weightDrop = prevEntry.weight - currentWeight;         // Positive = weight dropped

      // A. Outlier Filter (Sonic Bounce Gate)
      if (!isFullZone && weightDelta > 0) {
        var isOutlier = (weightDelta < 25.0) || (!isRefillWindow);
        if (isOutlier) {
          return ContentService.createTextOutput("Outlier rejected: sonic bounce or refill outside window")
            .setMimeType(ContentService.MimeType.TEXT);
        }
      }

      // B. Determine EventType & Consumed kg
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

      // C. 3-Point Rolling Hourly Feed Rate
      // Formula: (Weight_N-2 - Weight_N) / ((Time_N - Time_N-2) in hours)
      if (isFullZone || eventType === "REFILL") {
        rate = 0.0;
      } else if (historyForPond.length >= 2) {
        var prev2Entry = historyForPond[0]; // Row N-2
        var hadRefill = (prevEntry.eventType === "REFILL" || prev2Entry.eventType === "REFILL");

        if (hadRefill) {
          rate = 0.0;
        } else {
          var timeDiffHours = (now.getTime() - prev2Entry.timestamp.getTime()) / (1000 * 60 * 60);
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

    // 6. Append Row to Sheet (All 8 Columns)
    sheet.appendRow([
      timestamp,
      pondId,
      rawDistance,
      battery,
      currentWeight,
      consumed,
      rate,
      eventType
    ]);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      appended: {
        timestamp: timestamp,
        pond_id: pondId,
        distance: rawDistance,
        battery: battery,
        weight_kg: currentWeight,
        consumed_kg: consumed,
        rate_kgh: rate,
        event_type: eventType
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
    "Timestamp: " + Utilities.formatDate(new Date(), "Asia/Kuala_Lumpur", "yyyy-MM-dd HH:mm:ss")
  );
}
