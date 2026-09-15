/**
 * ============================================================================
 * Feed Barrel LoRa Telemetry - Google Apps Script Webhook (Enhanced v2.3)
 * ============================================================================
 * 
 * Target Google Sheet:
 * https://docs.google.com/spreadsheets/d/19lHzaW6WengVOE1N-zNk-trIGwLduU7rDfaZGGLwSuM/edit?gid=1939861399#gid=1939861399
 * 
 * Target Tab: "RawData" (GID: 1939861399 fallback)
 * 
 * Features:
 *  - Supports both single record and batch array uploads ([ {...}, {...} ])
 *  - Timezone-safe Date parsing (+08:00 explicit) to prevent GAS server timezone shifts
 *  - Direct local hour extraction for rock-solid 06:00 - 19:00 refill window evaluation
 *  - Strict nighttime bounce protection (rejects any upward shifts outside 06:00 - 19:00)
 *  - Automatic fallback to sheet tab GID 1939861399
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
    var sheet = ss.getSheetByName("RawData") ||
      ss.getSheets().find(function (s) { return s.getSheetId() === 1939861399; }) ||
      ss.getActiveSheet();
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

  // Determine true record date with explicit GMT+8 offset
  var recordDate = fallbackNow;
  var timestampStr = "";

  if (data.timestamp && String(data.timestamp).trim().length >= 10 && String(data.timestamp).indexOf("N/A") === -1) {
    timestampStr = String(data.timestamp).trim();
    // Parse "YYYY-MM-DD HH:MM:SS" with explicit GMT+8 offset (+08:00) to prevent GAS server timezone shifts
    var isoStr = timestampStr.replace(" ", "T");
    if (isoStr.indexOf("+") === -1 && isoStr.indexOf("Z") === -1) {
      isoStr += "+08:00";
    }
    var parsed = new Date(isoStr);
    if (!isNaN(parsed.getTime())) {
      recordDate = parsed;
    }
  } else {
    timestampStr = Utilities.formatDate(fallbackNow, timeZone, "yyyy-MM-dd HH:mm:ss");
  }

  var pondId = String(data.pondId || data.pond_id || data.id || "01.02.12").trim();
  var battery = (data.battery !== undefined && data.battery !== null) ? parseFloat(data.battery) : "---";

  // Hardware Calibration & Clamping (69cm empty, 30cm full = 125kg)
  var isFullZone = (rawDistance <= 30.0);
  var currentWeight;

  if (isFullZone) {
    currentWeight = 125.0; // Upper Mound Filter clamp
  } else if (rawDistance >= 69.0) {
    currentWeight = 0.0;   // Empty barrel clamp
  } else {
    currentWeight = Math.round((69.0 - rawDistance) * (125.0 / 39.0) * 100) / 100;
  }

  // Refill Window Check based on local time (06:00 to 19:00 Malaysia time)
  // Extract hour directly from local timestamp string to eliminate any server timezone round-trip skew
  var recordHour;
  if (timestampStr.length >= 13 && (timestampStr.charAt(10) === ' ' || timestampStr.charAt(10) === 'T')) {
    recordHour = parseInt(timestampStr.substring(11, 13), 10);
  } else {
    recordHour = parseInt(Utilities.formatDate(recordDate, timeZone, "HH"), 10);
  }
  var isRefillWindow = (recordHour >= 6 && recordHour < 19);

  // Retrieve Previous Entries for this Pond ID (scan up to last 100 rows)
  var lastRow = sheet.getLastRow();
  var historyForPond = [];

  if (lastRow > 1) {
    var numRowsToScan = Math.min(lastRow - 1, 100);
    var startRow = lastRow - numRowsToScan + 1;
    var rangeValues = sheet.getRange(startRow, 1, numRowsToScan, 8).getValues();

    for (var i = rangeValues.length - 1; i >= 0; i--) {
      var rowPondId = String(rangeValues[i][1]).trim();
      if (rowPondId.toLowerCase() === pondId.toLowerCase()) {
        var cellVal = rangeValues[i][0];
        var rowDate;
        if (cellVal instanceof Date) {
          rowDate = cellVal;
        } else {
          var cellStr = String(cellVal).trim().replace(" ", "T");
          if (cellStr.indexOf("+") === -1 && cellStr.indexOf("Z") === -1) cellStr += "+08:00";
          rowDate = new Date(cellStr);
        }

        historyForPond.unshift({
          timestamp: rowDate,
          weight: parseFloat(rangeValues[i][4]) || 0.0,
          consumed: parseFloat(rangeValues[i][5]) || 0.0,
          rate: parseFloat(rangeValues[i][6]) || 0.0,
          eventType: String(rangeValues[i][7] || "").trim()
        });
        if (historyForPond.length >= 8) break; // Keep last several entries for 3-ping state machine
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
    var prevEv = prevEntry.eventType.toUpperCase();

    // Find the last confirmed stable entry (excluding transient bounces)
    var stableEntry = null;
    for (var h = historyForPond.length - 1; h >= 0; h--) {
      var ev = historyForPond[h].eventType.toUpperCase();
      if (ev !== "BOUNCE_CRATER" && ev !== "BOUNCE_NIGHT" && ev !== "OUTLIER_REJECTED" && ev !== "REFILL_ABORTED") {
        stableEntry = historyForPond[h];
        break;
      }
    }
    if (!stableEntry) {
      stableEntry = prevEntry;
    }
    var stableWeight = stableEntry.weight;

    // FULL-ZONE HYSTERESIS / LATCH:
    // When the barrel is confirmed full (stableWeight >= 115 kg), readings between 23cm and 34.5cm
    // are physical cone mound / transducer blind-zone reflections, NOT genuine 10 kg feeding drops.
    if (stableWeight >= 115.0 && rawDistance <= 34.5) {
      currentWeight = 125.0;
      isFullZone = true;
    }

    var weightDelta = currentWeight - stableWeight; // Positive = gain vs baseline
    var weightDrop = stableWeight - currentWeight;  // Positive = drop vs baseline

    // Compute elapsed minutes since last stable reading
    var elapsedMinutes = (recordDate.getTime() - stableEntry.timestamp.getTime()) / (1000 * 60);
    if (isNaN(elapsedMinutes) || elapsedMinutes <= 0) elapsedMinutes = 6.0;

    // PILLAR 1: Physical Feeder Ceiling Gate (Max 20 kg/h ≈ 2 kg per 6 min ping)
    // Drops > 5.0 kg in <= 15 min are physically impossible for autofeeders (acoustic crater bounces)
    var maxAllowedDrop = (elapsedMinutes <= 15.0) ? 5.0 : Math.max(5.0, (elapsedMinutes / 60.0) * 20.0 * 1.25);

    if (weightDrop > maxAllowedDrop && !(stableWeight >= 115.0 && rawDistance <= 34.5)) {
      // Acoustic crater/funnel bounce
      eventType = "BOUNCE_CRATER";
      consumed = 0.0;
      rate = 0.0;
    }
    // PILLAR 2 & 3: 3-Ping Refill State Machine with Peak Tracking
    else if (prevEv === "REFILL_VERIFY") {
      // PING 3: Final confirmation check
      var initialRefillWeight = prevEntry.weight;
      var peakWeight = Math.max(currentWeight, prevEntry.weight);
      for (var k = historyForPond.length - 1; k >= 0; k--) {
        if (historyForPond[k].eventType.toUpperCase() === "REFILL_PENDING") {
          initialRefillWeight = historyForPond[k].weight;
          peakWeight = Math.max(peakWeight, historyForPond[k].weight);
          break;
        }
      }

      // Allow up to 10 kg drop across 12-18 min for active feeding
      if (currentWeight >= (initialRefillWeight - 10.0)) {
        eventType = "REFILL"; // 3-PING REFILL OFFICIALLY CONFIRMED!
        if (peakWeight >= 110.0 || isFullZone) {
          currentWeight = 125.0; // Confirmed at full capacity
        }
      } else {
        eventType = "REFILL_ABORTED";
      }
      consumed = 0.0;
      rate = 0.0;
    }
    else if (prevEv === "REFILL_PENDING") {
      // PING 2: First verification check (allow up to 5 kg drop for active feeding)
      if (currentWeight >= (prevEntry.weight - 5.0)) {
        eventType = "REFILL_VERIFY"; // Verification 1 passed!
        if (currentWeight >= 110.0 || isFullZone) {
          currentWeight = 125.0;
        }
      } else {
        eventType = "REFILL_ABORTED";
      }
      consumed = 0.0;
      rate = 0.0;
    }
    else if (weightDelta >= 20.0 || (isFullZone && stableWeight < 115.0)) {
      // Candidate Refill (covers both standard jumps and transitions into Full Zone)
      if (!isRefillWindow) {
        // Upward shift outside 06:00-19:00 is rejected (nighttime acoustic echo)
        eventType = "BOUNCE_NIGHT";
        consumed = 0.0;
        rate = 0.0;
      } else {
        // PING 1: Enter Refill Verification state
        eventType = "REFILL_PENDING";
        consumed = 0.0;
        rate = 0.0;
      }
    }
    else if (isFullZone || (stableWeight >= 115.0 && rawDistance <= 34.5)) {
      // Steady-state in Full Zone (barrel already full, sitting idle or slowly feeding)
      eventType = "FULL_SATURATED";
      consumed = 0.0;
      rate = 0.0;
    }
    else if (weightDelta > 0) {
      // Minor upward fluctuation (< 20 kg) due to pellet surface settling or sensor noise
      if (!isRefillWindow) {
        eventType = "BOUNCE_NIGHT";
      } else {
        eventType = "IDLE";
      }
      consumed = 0.0;
      rate = 0.0;
    }
    else if (weightDrop > 1.0) {
      // Normal feeding within physical dispenser boundaries
      eventType = "FEEDING";
      consumed = Math.round(weightDrop * 100) / 100;

      // Calculate hourly rate against stable baseline
      var timeDiffHours = elapsedMinutes / 60.0;
      if (timeDiffHours > 0.05 && timeDiffHours <= 3.0) {
        var calculatedRate = weightDrop / timeDiffHours;
        rate = Math.max(0, Math.round(calculatedRate * 100) / 100);
      } else {
        rate = 0.0;
      }
    }
    else {
      eventType = "IDLE";
      consumed = 0.0;
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
    "Feed Barrel Google Sheets Webhook is active and listening for POST requests (v2.2 Production).\n" +
    "Timestamp: " + Utilities.formatDate(new Date(), "Asia/Kuala_Lumpur", "yyyy-MM-dd HH:mm:ss")
  );
}
