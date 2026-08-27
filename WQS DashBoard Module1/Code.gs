// =========================================================================
// CONFIGURATION: POND & SPREADSHEET SETTINGS
// =========================================================================
// Change TARGET_POND to your desired pond ID (e.g. '01.02.12')
const TARGET_POND = '01.02.12';

// Google Sheet IDs
const POND_OPERATIONAL_SHEET_ID = '1pUrjGBmOmDHjZdzYUz6kfV5aBxAi1zABBjF0rLWeHkQ'; // Current Operational Data
const WQS_SHEET_ID = '1zVXbhakvH8kFIcV_YL-YS89dsAF0eDNE-eeTxV-IWuY';              // Water Quality Station
const WEATHER_SHEET_ID = '1xhWN6yg5u229HS-LbCDL2qVKs2b2v16XxGlklKR63BQ';          // Weather Station Live
// =========================================================================

function doGet(e) {
  try {
    const targetPond = (e && e.parameter && e.parameter.pond) ? e.parameter.pond : TARGET_POND;

    const wqsSheet = SpreadsheetApp.openById(WQS_SHEET_ID).getSheets()[0];
    
    // Weather Spreadsheet: 'Live' sheet for real-time readings, 'Sheet1' for 2-year hourly archive
    const weatherSs = SpreadsheetApp.openById(WEATHER_SHEET_ID);
    const weatherLiveSheet = weatherSs.getSheetByName("Live");
    const weatherHistorySheet = weatherSs.getSheetByName("Sheet1");
    
    const wqsData = wqsSheet.getDataRange().getValues();
    const weatherLiveData = weatherLiveSheet.getDataRange().getValues();
    const weatherHistoryData = weatherHistorySheet.getDataRange().getValues();
    
    const now = new Date();
    // Use current calendar day for analysis
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    
    // Helper to check if two dates are same calendar day
    const isSameDate = (d1, d2) => d1.getFullYear() === d2.getFullYear() && 
                                   d1.getMonth() === d2.getMonth() && 
                                   d1.getDate() === d2.getDate();
    
    const getHour = (d) => d.getHours();

    // Helper to validate whether a sensor cell contains a valid numeric reading (not 'N/A', not blank, not error, not NaN)
    const isValidSensorReading = (val) => {
      if (val === null || val === undefined || val === '') return false;
      if (typeof val === 'string') {
        const trimmed = val.trim().toUpperCase();
        if (trimmed === 'N/A' || trimmed === '#N/A' || trimmed === 'NA' || trimmed === 'NULL' || trimmed === 'NONE' || trimmed === 'ERROR' || trimmed === 'ERR') {
          return false;
        }
      }
      const num = parseFloat(val);
      return !isNaN(num) && isFinite(num);
    };

    let recentTimestamp = null;
    let recentDO = null;
    let recentPH = null;
    let recentWaterTemp = null;
    let recentLux = 0;
    let recentAirTemp = 0;
    
    // Scan backwards to find the most recent row where DO, pH, and Water Temp are ALL valid numbers (skipping rows with 'N/A' or sensor errors)
    for (let i = wqsData.length - 1; i > 0; i--) {
      const row = wqsData[i];
      if (row[0] && isValidSensorReading(row[1]) && isValidSensorReading(row[2]) && isValidSensorReading(row[4])) {
        recentTimestamp = row[0];
        recentDO = parseFloat(row[1]);
        recentPH = parseFloat(row[2]);
        recentWaterTemp = parseFloat(row[4]);
        break;
      }
    }

    // Fallback: If no single row had all parameters valid, pick the most recent valid value for each parameter independently
    if (recentDO === null || recentPH === null || recentWaterTemp === null) {
      for (let i = wqsData.length - 1; i > 0; i--) {
        const row = wqsData[i];
        if (!row[0]) continue;
        if (recentDO === null && isValidSensorReading(row[1])) recentDO = parseFloat(row[1]);
        if (recentPH === null && isValidSensorReading(row[2])) recentPH = parseFloat(row[2]);
        if (recentWaterTemp === null && isValidSensorReading(row[4])) recentWaterTemp = parseFloat(row[4]);
        if (recentTimestamp === null && (isValidSensorReading(row[1]) || isValidSensorReading(row[2]) || isValidSensorReading(row[4]))) {
          recentTimestamp = row[0];
        }
        if (recentDO !== null && recentPH !== null && recentWaterTemp !== null) break;
      }
    }

    // Ensure fallback defaults if no data exists at all
    if (recentDO === null) recentDO = 0;
    if (recentPH === null) recentPH = 0;
    if (recentWaterTemp === null) recentWaterTemp = 0;
    
    // Extract recent weather readings from 'Live' sheet (skip any row with N/A / invalid values)
    for (let i = weatherLiveData.length - 1; i > 0; i--) {
      const row = weatherLiveData[i];
      if ((row[9] || row[0]) && isValidSensorReading(row[3]) && isValidSensorReading(row[2])) {
        recentLux = parseFloat(row[3]);      // Column D (index 3)
        recentAirTemp = parseFloat(row[2]);  // Column C (index 2)
        break;
      }
    }

    // --- WQS Logic ---
    let do5amMin = null;
    let ph5am = null;
    let ph5pm = null;
    let tempNightMin = null;
    let tempTodayMax = null;

    // Skip header row
    for (let i = 1; i < wqsData.length; i++) {
      const row = wqsData[i];
      const ts = new Date(row[0]);
      if (isNaN(ts.getTime())) continue;

      const hasDO = isValidSensorReading(row[1]);
      const hasPH = isValidSensorReading(row[2]);
      const hasTemp = isValidSensorReading(row[4]);

      const rowDO = hasDO ? parseFloat(row[1]) : null;
      const rowPH = hasPH ? parseFloat(row[2]) : null;
      const rowTemp = hasTemp ? parseFloat(row[4]) : null;
      const hr = getHour(ts);

      // Today logic
      if (isSameDate(ts, today)) {
        // DO: Lowest around 5:00 AM (e.g. 4 AM - 6 AM)
        if (hr >= 4 && hr <= 6) {
          if (rowDO !== null && (do5amMin === null || rowDO < do5amMin)) do5amMin = rowDO;
          if (rowPH !== null && ph5am === null) ph5am = rowPH; 
        }
        // pH: around 5:00 PM (e.g. 16:00 - 18:00)
        if (hr >= 16 && hr <= 18) {
          if (rowPH !== null && ph5pm === null) ph5pm = rowPH;
        }
        // Temp: Highest today
        if (rowTemp !== null && (tempTodayMax === null || rowTemp > tempTodayMax)) tempTodayMax = rowTemp;
      }
      
      // Yesterday night logic (18:00 yesterday to 06:00 today)
      if ((isSameDate(ts, yesterday) && hr >= 18) || (isSameDate(ts, today) && hr <= 6)) {
        if (rowTemp !== null && (tempNightMin === null || rowTemp < tempNightMin)) tempNightMin = rowTemp;
      }
    }
    
    // --- Weather Logic ---
    let luxTodaySum = 0, luxTodayCount = 0;
    let luxYestSum = 0, luxYestCount = 0;
    let rainTodaySum = 0;
    
    // Skip header row
    for (let i = 1; i < weatherLiveData.length; i++) {
      const row = weatherLiveData[i];
      // J is Upload Timestamp (index 9)
      let ts = new Date(row[9]);
      if (isNaN(ts.getTime()) && typeof row[0] === 'string') {
        ts = new Date(row[0] + ' ' + row[1]);
      }
      if (isNaN(ts.getTime())) ts = new Date(row[0]);
      if (isNaN(ts.getTime())) continue;

      const rain = parseFloat(row[4]) || 0; // Column E (index 4)
      const lux = parseFloat(row[3]) || 0;  // Column D (index 3)

      const hr = getHour(ts);
      if (isSameDate(ts, today)) {
        rainTodaySum += rain;
        if (hr >= 10 && hr <= 17) {
          luxTodaySum += lux;
          luxTodayCount++;
        }
      } else if (isSameDate(ts, yesterday)) {
        if (hr >= 10 && hr <= 17) {
          luxYestSum += lux;
          luxYestCount++;
        }
      }
    }
    
    const luxTodayAvg = luxTodayCount > 0 ? luxTodaySum / luxTodayCount : 0;
    const luxYestAvg = luxYestCount > 0 ? luxYestSum / luxYestCount : 0;

    // --- Status Determinations ---
    
    // DO Status
    let doStatus = "Unknown";
    let doMessage = "No data around 5:00 AM";
    let doWarning = false;
    if (do5amMin !== null) {
      if (do5amMin >= 4.0) { doStatus = "Good"; doMessage = `DO: ${do5amMin.toFixed(2)} ppm`; }
      else if (do5amMin >= 3.0) { doStatus = "Caution"; doMessage = `DO: ${do5amMin.toFixed(2)} ppm (Caution)`; }
      else if (do5amMin >= 2.0) { doStatus = "Risky"; doMessage = `DO: ${do5amMin.toFixed(2)} ppm (Risky)`; doWarning = true; }
      else { doStatus = "Danger"; doMessage = `DO: ${do5amMin.toFixed(2)} ppm (Danger)`; doWarning = true; }
    }
    if (do5amMin !== null && do5amMin < 4.0) doWarning = true; // Trigger feeding action even on caution

    // pH Swing
    let phMessage = "Normal";
    let phWarning = false;
    if (ph5am !== null && ph5pm !== null) {
      const phDiff = Math.abs(ph5pm - ph5am);
      if (phDiff > 0.5) {
        phMessage = "Heavy Phytoplankton Bloom Warning";
        phWarning = true;
      } else {
        phMessage = `Swing: ${phDiff.toFixed(2)} (Normal)`;
      }
    } else {
      phMessage = "Insufficient data for pH swing";
    }

    // Temperature Swing
    let tempMessage = "Normal";
    let tempWarning = false;
    if (tempNightMin !== null && tempTodayMax !== null) {
      const tempDiff = tempTodayMax - tempNightMin;
      if (tempDiff > 2.0) {
        tempMessage = "Thermal Stress Warning";
        tempWarning = true;
      } else {
        tempMessage = `Swing: ${tempDiff.toFixed(2)}°C (Normal)`;
      }
    } else {
      tempMessage = "Insufficient data for temp swing";
    }

    // Weather Lux (Algae Activity based on 10 AM - 5 PM avg)
    let weatherLuxMessage = "Low Algae Activity";
    let weatherLuxWarning = false;

    const luxVal = Math.round(luxTodayAvg) || 0;
    if (luxVal > 80000) {
      weatherLuxMessage = "High Algae Activity";
    } else if (luxVal > 55000) {
      weatherLuxMessage = "Moderate Algae Activity";
    } else {
      weatherLuxMessage = "Low Algae Activity";
      weatherLuxWarning = true;
    }

    // Weather Rain
    let weatherRainMessage = `Today's rain: ${rainTodaySum.toFixed(2)}mm`;
    let weatherRainWarning = rainTodaySum > 50; // Arbitrary high threshold for example
    if (weatherRainWarning) {
      weatherRainMessage += " (High)";
    }

    // Feeding Action
    let feedingAction = "Normal Feed - Optimal Conditions.";
    if (doWarning || tempWarning || weatherLuxWarning) {
      feedingAction = "Reduce/Cut Feed - Shrimp metabolism slowed.";
    }

    // --- Fetch Pond Details & Sampling from Operational Sheet ---
    const pondDetails = fetchPondOperationalDetails(targetPond, today);

    // --- Historical Analysis & Anomaly Tracking (using 2-year 'Sheet1' archive for weather) ---
    const historyData = processPondHistory(wqsData, weatherHistoryData, pondDetails.stockingDateRaw, pondDetails.doc, today);

    const payload = {
      status: "success",
      data: {
        pondDetails: pondDetails,
        raw: {
          timestamp: recentTimestamp instanceof Date ? recentTimestamp.toISOString() : recentTimestamp,
          do: recentDO,
          ph: recentPH,
          waterTemp: recentWaterTemp,
          lux: recentLux,
          airTemp: recentAirTemp
        },
        analysis: {
          do: { status: doStatus, message: doMessage, warning: doWarning, value: do5amMin },
          ph: { message: phMessage, warning: phWarning },
          temperature: { message: tempMessage, warning: tempWarning },
          weatherLux: { message: weatherLuxMessage, warning: weatherLuxWarning, avgToday: luxTodayAvg, avgYest: luxYestAvg },
          weatherRain: { message: weatherRainMessage, warning: weatherRainWarning, sumToday: rainTodaySum },
          feedingAction: feedingAction
        },
        history: historyData
      }
    };
    
    // Enable CORS by using ContentService JSON Output
    return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Processes full dataset history to find:
 * 1. Lifetime water temperature extremes (Lowest & Highest with DOC and Date)
 * 2. Abnormal days where:
 *    - DO < 3.0 ppm (around 5 AM / daily low)
 *    - pH swing > 0.5 (5 PM vs 5 AM)
 *    - Temp swing > 2.0°C (Day Max vs Night Min)
 *    - Single-day rain > 40 mm
 *    - Continuous 7-day cumulative rain > 120 mm
 */
function processPondHistory(wqsData, weatherData, stockingDateRaw, currentDoc, today) {
  let stockingDate = null;
  if (stockingDateRaw) {
    stockingDate = stockingDateRaw instanceof Date ? stockingDateRaw : new Date(stockingDateRaw);
    if (isNaN(stockingDate.getTime())) stockingDate = null;
  }

  // Helper to compute DOC for any given date
  const getDocForDate = (targetDate) => {
    if (stockingDate) {
      const diffMs = targetDate.getTime() - stockingDate.getTime();
      return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
    }
    if (currentDoc && today) {
      const diffDays = Math.floor((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
      return Math.max(1, currentDoc - diffDays);
    }
    return null;
  };

  const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // 1. Lifetime Water Temp Extremes
  let minTempRecord = null;
  let maxTempRecord = null;

  // Daily map for WQS
  const dailyWqs = {}; // key -> { dateObj, doc, do5amMin, ph5am, ph5pm, tempNightMin, tempDayMax }

  for (let i = 1; i < wqsData.length; i++) {
    const row = wqsData[i];
    const ts = new Date(row[0]);
    if (isNaN(ts.getTime())) continue;

    const rowDO = parseFloat(row[1]);
    const rowPH = parseFloat(row[2]);
    const rowTemp = parseFloat(row[4]);
    const hr = ts.getHours();

    const dKey = dateKey(ts);
    if (!dailyWqs[dKey]) {
      const dayDate = new Date(ts.getFullYear(), ts.getMonth(), ts.getDate());
      dailyWqs[dKey] = {
        dateObj: dayDate,
        dateKey: dKey,
        doc: getDocForDate(dayDate),
        do5amMin: null,
        ph5am: null,
        ph5pm: null,
        tempNightMin: null,
        tempDayMax: null
      };
    }

    const dayObj = dailyWqs[dKey];

    // DO & pH around 5:00 AM (4 AM - 6 AM)
    if (hr >= 4 && hr <= 6) {
      if (!isNaN(rowDO) && (dayObj.do5amMin === null || rowDO < dayObj.do5amMin)) dayObj.do5amMin = rowDO;
      if (!isNaN(rowPH) && dayObj.ph5am === null) dayObj.ph5am = rowPH;
    }

    // pH around 5:00 PM (16:00 - 18:00)
    if (hr >= 16 && hr <= 18) {
      if (!isNaN(rowPH) && dayObj.ph5pm === null) dayObj.ph5pm = rowPH;
    }

    // Temp Day Max (10:00 - 18:00)
    if (hr >= 10 && hr <= 18) {
      if (!isNaN(rowTemp) && (dayObj.tempDayMax === null || rowTemp > dayObj.tempDayMax)) dayObj.tempDayMax = rowTemp;
    }

    // Temp Night Min (00:00 - 06:00 or 18:00 - 23:59)
    if (hr <= 6 || hr >= 18) {
      if (!isNaN(rowTemp) && (dayObj.tempNightMin === null || rowTemp < dayObj.tempNightMin)) dayObj.tempNightMin = rowTemp;
    }

    // Lifetime extremes check
    if (!isNaN(rowTemp) && rowTemp > 10 && rowTemp < 45) { // Filter out sensor errors
      if (minTempRecord === null || rowTemp < minTempRecord.value) {
        minTempRecord = {
          value: rowTemp,
          timestamp: ts.toISOString(),
          dateStr: formatDateStandard(ts),
          timeStr: formatTimeStandard(ts),
          doc: getDocForDate(ts)
        };
      }
      if (maxTempRecord === null || rowTemp > maxTempRecord.value) {
        maxTempRecord = {
          value: rowTemp,
          timestamp: ts.toISOString(),
          dateStr: formatDateStandard(ts),
          timeStr: formatTimeStandard(ts),
          doc: getDocForDate(ts)
        };
      }
    }
  }

  // Daily map for Weather (Rainfall & 7-Day sum from 2-year history 'Sheet1')
  const dailyWeather = {}; // key -> { dateObj, rainSum }

  for (let i = 1; i < weatherData.length; i++) {
    const row = weatherData[i];
    if (!row[0]) continue;

    let ts = row[0] instanceof Date ? row[0] : new Date(row[0]);
    if (isNaN(ts.getTime()) && row[1]) {
      ts = new Date(String(row[0]).trim() + ' ' + String(row[1]).trim());
    }
    if (isNaN(ts.getTime())) continue;

    const rain = parseFloat(row[2]) || 0; // Column C (index 2): 'Rainfall'
    const dKey = dateKey(ts);

    if (!dailyWeather[dKey]) {
      const dayDate = new Date(ts.getFullYear(), ts.getMonth(), ts.getDate());
      dailyWeather[dKey] = {
        dateObj: dayDate,
        dateKey: dKey,
        rainSum: 0
      };
    }
    dailyWeather[dKey].rainSum += rain;
  }

  // Calculate 7-day rolling rainfall for each weather day
  const weatherKeys = Object.keys(dailyWeather).sort();
  const sevenDayRainMap = {};

  for (let i = 0; i < weatherKeys.length; i++) {
    const currKey = weatherKeys[i];
    const currDate = dailyWeather[currKey].dateObj;
    let sum7d = 0;

    for (let j = 0; j < weatherKeys.length; j++) {
      const compDate = dailyWeather[weatherKeys[j]].dateObj;
      const diffDays = (currDate.getTime() - compDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays >= 0 && diffDays < 7) {
        sum7d += dailyWeather[weatherKeys[j]].rainSum;
      }
    }
    sevenDayRainMap[currKey] = sum7d;
  }

  // 2. Identify Abnormal Days
  const allDateKeys = Array.from(new Set([...Object.keys(dailyWqs), ...Object.keys(dailyWeather)])).sort().reverse();
  const abnormalities = [];

  for (let i = 0; i < allDateKeys.length; i++) {
    const k = allDateKeys[i];
    const wqs = dailyWqs[k];
    const weather = dailyWeather[k];

    const dateObj = (wqs && wqs.dateObj) || (weather && weather.dateObj);
    const doc = (wqs && wqs.doc) || getDocForDate(dateObj);
    const issues = [];

    // Check DO (< 3.0 ppm)
    if (wqs && wqs.do5amMin !== null && wqs.do5amMin < 3.0) {
      issues.push({
        type: 'do',
        name: 'Low DO',
        value: `${wqs.do5amMin.toFixed(2)} ppm`,
        desc: `DO dropped to ${wqs.do5amMin.toFixed(2)} ppm at 5 AM (< 3.0 ppm threshold).`
      });
    }

    // Check pH Swing (> 0.5)
    if (wqs && wqs.ph5am !== null && wqs.ph5pm !== null) {
      const phSwing = Math.abs(wqs.ph5pm - wqs.ph5am);
      if (phSwing > 0.5) {
        issues.push({
          type: 'ph',
          name: 'High pH Swing',
          value: phSwing.toFixed(2),
          desc: `pH fluctuated by ${phSwing.toFixed(2)} between 5 AM (${wqs.ph5am.toFixed(2)}) and 5 PM (${wqs.ph5pm.toFixed(2)}).`
        });
      }
    }

    // Check Temp Swing (> 2.0°C)
    if (wqs && wqs.tempNightMin !== null && wqs.tempDayMax !== null) {
      const tempSwing = wqs.tempDayMax - wqs.tempNightMin;
      if (tempSwing > 2.0) {
        issues.push({
          type: 'temp',
          name: 'Thermal Stress',
          value: `${tempSwing.toFixed(2)}°C swing`,
          desc: `Water temp fluctuated ${tempSwing.toFixed(2)}°C between night min (${wqs.tempNightMin.toFixed(1)}°C) and day max (${wqs.tempDayMax.toFixed(1)}°C).`
        });
      }
    }

    // Check Weather Rain (> 40mm/day or > 120mm/7-day)
    if (weather) {
      if (weather.rainSum > 40) {
        issues.push({
          type: 'rain',
          name: 'Heavy Rainfall',
          value: `${weather.rainSum.toFixed(1)} mm`,
          desc: `Single-day rainfall reached ${weather.rainSum.toFixed(1)} mm (> 40 mm threshold).`
        });
      }

      const rain7d = sevenDayRainMap[k] || 0;
      if (rain7d > 120 && weather.rainSum <= 40) { // If not already flagged by single-day rain
        issues.push({
          type: 'rain',
          name: 'Continuous Rain (7-Day)',
          value: `${rain7d.toFixed(1)} mm / 7d`,
          desc: `Cumulative rainfall reached ${rain7d.toFixed(1)} mm across 7 consecutive days (> 120 mm threshold).`
        });
      }
    }

    if (issues.length > 0) {
      abnormalities.push({
        date: formatDateStandard(dateObj),
        dateRaw: dateObj.toISOString(),
        doc: doc,
        issues: issues
      });
    }
  }

  return {
    totalAbnormalDays: abnormalities.length,
    tempExtremes: {
      min: minTempRecord,
      max: maxTempRecord
    },
    abnormalities: abnormalities
  };
}

/**
 * Reads the operational spreadsheet and extracts pond info & latest sampling data for a given pond ID.
 */
function fetchPondOperationalDetails(targetPondId, today) {
  const result = {
    pondId: targetPondId,
    species: null,
    line: null,
    stockSource: null,
    stockingDate: null,
    doc: null,
    sampleDate: null,
    sampleABW: null,
    sampleAWG: null,
    sr: null,
    sampleFCR: null,
    rawFound: false
  };

  try {
    const ss = SpreadsheetApp.openById(POND_OPERATIONAL_SHEET_ID);
    const sheet = ss.getSheetByName("Current Operational Data") || ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();

    if (!data || data.length < 2) return result;

    const headers = data[0].map(h => String(h || '').trim().toLowerCase());

    // Helper to find column index with various possible naming conventions
    const findCol = (possibleNames) => {
      for (let name of possibleNames) {
        const idx = headers.indexOf(name.toLowerCase().trim());
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const pondColIdx = findCol(['pond']);
    const speciesColIdx = findCol(['species']);
    const lineColIdx = findCol(['line']);
    const stockSourceColIdx = findCol(['stock source']);
    const stkDateColIdx = findCol(['stock date']);
    const docColIdx = findCol(['doc']);
    const sampleDateColIdx = findCol(['sample date']);
    const sampleABWColIdx = findCol(['sample abw']);
    const sampleAWGColIdx = findCol(['awg']);
    const srColIdx = findCol(['sr']);
    const sampleFCRColIdx = findCol(['sample fcr']);

    // Traverse rows from bottom to top to get the most recent row for this pond
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      let pondVal = pondColIdx !== -1 ? String(row[pondColIdx] || '').trim() : '';

      // Direct exact match for 'xx.xx.xx' format (e.g. '01.02.12')
      if (pondVal === targetPondId) {
        result.rawFound = true;
        result.pondId = pondVal;

        // Species
        if (speciesColIdx !== -1 && row[speciesColIdx]) {
          result.species = String(row[speciesColIdx]).trim();
        } else {
          result.species = 'L. vannamei'; // Default aquaculture standard
        }

        // Line (Shrimp Genetic Line from column 'line')
        if (lineColIdx !== -1 && row[lineColIdx]) {
          result.line = String(row[lineColIdx]).trim();
        }

        // Stock Source
        if (stockSourceColIdx !== -1 && row[stockSourceColIdx]) {
          result.stockSource = String(row[stockSourceColIdx]).trim();
        }

        // Stocking Date & DOC calculation
        let stockingDateObj = null;
        if (stkDateColIdx !== -1 && row[stkDateColIdx]) {
          const rawStk = row[stkDateColIdx];
          stockingDateObj = rawStk instanceof Date ? rawStk : new Date(rawStk);
          if (!isNaN(stockingDateObj.getTime())) {
            result.stockingDate = formatDateStandard(stockingDateObj);
            result.stockingDateRaw = stockingDateObj;
            // Calculate DOC = (Today - StockingDate) in days + 1
            const diffMs = today.getTime() - stockingDateObj.getTime();
            result.doc = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
          }
        }

        // If DOC is explicitly recorded and stocking date was missing, use recorded DOC
        if (result.doc === null && docColIdx !== -1 && row[docColIdx] !== '') {
          const explicitDoc = parseInt(row[docColIdx], 10);
          if (!isNaN(explicitDoc)) result.doc = explicitDoc;
        }

        // Sampling Date
        if (sampleDateColIdx !== -1 && row[sampleDateColIdx]) {
          const rawSampleDate = row[sampleDateColIdx];
          const sampleDateObj = rawSampleDate instanceof Date ? rawSampleDate : new Date(rawSampleDate);
          result.sampleDate = !isNaN(sampleDateObj.getTime()) ? formatDateStandard(sampleDateObj) : String(rawSampleDate);
        }

        // Sample ABW
        if (sampleABWColIdx !== -1 && row[sampleABWColIdx] !== '') {
          const abw = parseFloat(row[sampleABWColIdx]);
          if (!isNaN(abw)) result.sampleABW = abw;
        }

        // Sample AWG
        if (sampleAWGColIdx !== -1 && row[sampleAWGColIdx] !== '') {
          const awg = parseFloat(row[sampleAWGColIdx]);
          if (!isNaN(awg)) result.sampleAWG = awg;
        }

        // Survival Rate (SR)
        if (srColIdx !== -1 && row[srColIdx] !== '') {
          let srVal = String(row[srColIdx]).replace('%', '').trim();
          const srNum = parseFloat(srVal);
          if (!isNaN(srNum)) result.sr = srNum <= 1 && srNum > 0 ? srNum * 100 : srNum;
        }

        // Sample FCR
        if (sampleFCRColIdx !== -1 && row[sampleFCRColIdx] !== '') {
          const fcr = parseFloat(row[sampleFCRColIdx]);
          if (!isNaN(fcr)) result.sampleFCR = fcr;
        }

        break; // Latest row for pond found
      }
    }
  } catch (err) {
    result.error = err.toString();
  }

  return result;
}

/**
 * Format Date to standard readable string (e.g. 26 Aug 2026)
 */
function formatDateStandard(d) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Format Time to 12-hour AM/PM string (e.g. 05:45 AM)
 */
function formatTimeStandard(d) {
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesStr = minutes < 10 ? '0' + minutes : minutes;
  const hoursStr = hours < 10 ? '0' + hours : hours;
  return `${hoursStr}:${minutesStr} ${ampm}`;
}
