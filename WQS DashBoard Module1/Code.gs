// =========================================================================
// AQUACULTURE WATER QUALITY STATION (WQS) - BACKEND ENGINE
// Architecture: Single-File Clean Class-Based Architecture (SOLID / GAS V8)
// =========================================================================

// =========================================================================
// 1. CONFIGURATION & THRESHOLDS
// =========================================================================

/**
 * System-wide operational and spreadsheet configuration
 */
class AppConfig {
  static get TARGET_POND() { return '01.02.12'; }
  static get POND_OPERATIONAL_SHEET_ID() { return '1pUrjGBmOmDHjZdzYUz6kfV5aBxAi1zABBjF0rLWeHkQ'; }
  static get WQS_SHEET_ID() { return '1zVXbhakvH8kFIcV_YL-YS89dsAF0eDNE-eeTxV-IWuY'; }
  static get WEATHER_SHEET_ID() { return '1xhWN6yg5u229HS-LbCDL2qVKs2b2v16XxGlklKR63BQ'; }
  static get CACHE_DURATION_SECONDS() { return 180; } // 3 minutes cache for sub-second responses
  static get DEFAULT_HISTORY_DAYS() { return 120; }
}

/**
 * Centralized water quality and weather alert thresholds
 */
class AlertConfig {
  // Water Temperature (°C)
  static get TEMP_HIGH_THRESHOLD() { return 33.0; }       // Alert if Water Temp > 33.0°C
  static get TEMP_DELTA_ALERT_THRESHOLD() { return 3.0; } // Alert if Temp Swing (Δ) >= 3.0°C in same day

  // Dissolved Oxygen (ppm)
  static get DO_DANGER_THRESHOLD() { return 3.0; }        // Critical Danger if DO Min < 3.0 ppm
  static get DO_WARNING_THRESHOLD() { return 4.0; }       // Caution / Warning if DO Min < 4.0 ppm

  // pH
  static get PH_DELTA_ALERT_THRESHOLD() { return 0.5; }   // Alert if pH Swing (Δ) > 0.5

  // Weather & Sunlight
  static get LUX_LOW_THRESHOLD() { return 20000; }        // Overcast / Low Sunlight alert threshold
  static get LUX_OPTIMAL_MIN() { return 55000; }          // Moderate/Optimal algae activity threshold
  static get LUX_HIGH_MIN() { return 80000; }             // High algae activity threshold
  static get RAIN_DAILY_DANGER_MM() { return 40.0; }      // Single-day rainfall danger threshold (>= 40mm)
  static get RAIN_DAILY_WARNING_MM() { return 20.0; }     // Single-day rainfall caution threshold (>= 20mm)
  static get RAIN_7DAY_DANGER_MM() { return 120.0; }      // 7-day cumulative rainfall danger threshold (>= 120mm)
  static get RAIN_7DAY_WARNING_MM() { return 100.0; }     // 7-day cumulative rainfall caution threshold (>= 100mm)
}

// Backward-compatible global alias for legacy references
const ALERT_CONFIG = AlertConfig;


// =========================================================================
// 2. UTILITY CLASSES
// =========================================================================

/**
 * Standard date, time, and DOC calculation helpers
 */
class DateUtils {
  static get MONTH_NAMES() {
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  }

  static isSameDate(d1, d2) {
    return !!(d1 && d2 &&
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate());
  }

  static toDateKey(d) {
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  }

  static formatDateStandard(d) {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '-';
    return `${d.getDate()} ${DateUtils.MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }

  static formatTimeStandard(d) {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
    let hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    const hoursStr = hours < 10 ? '0' + hours : hours;
    return `${hoursStr}:${minutesStr} ${ampm}`;
  }

  static calculateDoc(targetDate, stockingDate, fallbackDoc, today) {
    if (stockingDate && stockingDate instanceof Date && !isNaN(stockingDate.getTime())) {
      const diffMs = targetDate.getTime() - stockingDate.getTime();
      return Math.max(1, Math.floor(diffMs / 86400000) + 1);
    }
    if (fallbackDoc && today) {
      const diffDays = Math.floor((today.getTime() - targetDate.getTime()) / 86400000);
      return Math.max(1, fallbackDoc - diffDays);
    }
    return null;
  }
}

/**
 * Sensor data sanitization and numeric validation helpers
 */
class SensorUtils {
  static isValid(val) {
    if (val === null || val === undefined || val === '') return false;
    if (typeof val === 'string') {
      const trimmed = val.trim().toUpperCase();
      if (['N/A', '#N/A', 'NA', 'NULL', 'NONE', 'ERROR', 'ERR'].includes(trimmed)) {
        return false;
      }
    }
    const num = parseFloat(val);
    return !isNaN(num) && isFinite(num);
  }

  static parseFloatSafe(val, defaultVal = null) {
    if (!SensorUtils.isValid(val)) return defaultVal;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? defaultVal : parsed;
  }
}


// =========================================================================
// 3. DATA ACCESS LAYER (REPOSITORY)
// =========================================================================

/**
 * Handles communication with the Pond Operational spreadsheet
 */
class PondRepository {
  /**
   * Fetches pond stocking, culture cycle, and biometric sampling data
   */
  static fetchDetails(targetPondId, today) {
    const result = {
      pondId: targetPondId,
      species: null,
      line: null,
      stockSource: null,
      stockingDate: null,
      stockingDateRaw: null,
      doc: null,
      sampleDate: null,
      sampleABW: null,
      sampleAWG: null,
      sr: null,
      biomass: null,
      sampleFCR: null,
      rawFound: false
    };

    try {
      const ss = SpreadsheetApp.openById(AppConfig.POND_OPERATIONAL_SHEET_ID);
      const sheet = ss.getSheetByName("Current Operational Data") || ss.getSheets()[0];
      const data = sheet.getDataRange().getValues();

      if (!data || data.length < 2) return result;

      // Build dynamic case-insensitive header mapping
      const headerMap = {};
      for (let col = 0; col < data[0].length; col++) {
        const headerName = String(data[0][col] || '').trim().toLowerCase();
        if (headerName) headerMap[headerName] = col;
      }

      const getColIndex = (...candidateNames) => {
        for (const name of candidateNames) {
          if (headerMap[name.toLowerCase()] !== undefined) return headerMap[name.toLowerCase()];
        }
        return -1;
      };

      const pondCol = getColIndex('pond');
      const speciesCol = getColIndex('species');
      const lineCol = getColIndex('line');
      const stockSourceCol = getColIndex('stock source');
      const stkDateCol = getColIndex('stock date');
      const docCol = getColIndex('doc');
      const sampleDateCol = getColIndex('sample date');
      const sampleABWCol = getColIndex('sample abw');
      const sampleAWGCol = getColIndex('awg');
      const srCol = getColIndex('sr');
      const biomassCol = getColIndex('biomass', 'biomass (kg)', 'biomass(kg)', 'est biomass', 'estimated biomass', 'total biomass');
      const sampleFCRCol = getColIndex('sample fcr');

      // Search rows backwards to get latest configuration for this pond
      for (let i = data.length - 1; i >= 1; i--) {
        const row = data[i];
        const pondVal = pondCol !== -1 ? String(row[pondCol] || '').trim() : '';

        if (pondVal === targetPondId) {
          result.rawFound = true;
          result.pondId = pondVal;
          result.species = (speciesCol !== -1 && row[speciesCol]) ? String(row[speciesCol]).trim() : 'L. vannamei';
          if (lineCol !== -1 && row[lineCol]) result.line = String(row[lineCol]).trim();
          if (stockSourceCol !== -1 && row[stockSourceCol]) result.stockSource = String(row[stockSourceCol]).trim();

          // Stocking date & DOC calculation
          if (stkDateCol !== -1 && row[stkDateCol]) {
            const rawStk = row[stkDateCol];
            const stkDateObj = rawStk instanceof Date ? rawStk : new Date(rawStk);
            if (!isNaN(stkDateObj.getTime())) {
              result.stockingDate = DateUtils.formatDateStandard(stkDateObj);
              result.stockingDateRaw = stkDateObj;
              const diffMs = today.getTime() - stkDateObj.getTime();
              result.doc = Math.max(1, Math.floor(diffMs / 86400000) + 1);
            }
          }

          // Fallback explicit DOC
          if (result.doc === null && docCol !== -1 && row[docCol] !== '') {
            const explicitDoc = parseInt(row[docCol], 10);
            if (!isNaN(explicitDoc)) result.doc = explicitDoc;
          }

          // Biometrics sampling date
          if (sampleDateCol !== -1 && row[sampleDateCol]) {
            const rawSampleDate = row[sampleDateCol];
            const sampleDateObj = rawSampleDate instanceof Date ? rawSampleDate : new Date(rawSampleDate);
            result.sampleDate = !isNaN(sampleDateObj.getTime())
              ? DateUtils.formatDateStandard(sampleDateObj)
              : String(rawSampleDate);
          }

          // ABW
          if (sampleABWCol !== -1 && row[sampleABWCol] !== '') {
            const abw = parseFloat(row[sampleABWCol]);
            if (!isNaN(abw)) result.sampleABW = abw;
          }

          // AWG
          if (sampleAWGCol !== -1 && row[sampleAWGCol] !== '') {
            const awg = parseFloat(row[sampleAWGCol]);
            if (!isNaN(awg)) result.sampleAWG = awg;
          }

          // Survival Rate (SR)
          if (srCol !== -1 && row[srCol] !== '') {
            const srVal = parseFloat(String(row[srCol]).replace('%', '').trim());
            if (!isNaN(srVal)) result.sr = (srVal <= 1 && srVal > 0) ? srVal * 100 : srVal;
          }

          // Biomass (kg)
          if (biomassCol !== -1 && row[biomassCol] !== '' && row[biomassCol] !== null && row[biomassCol] !== undefined) {
            const cleanedBio = String(row[biomassCol]).replace(/[^\d.-]/g, '').trim();
            const bio = parseFloat(cleanedBio);
            if (!isNaN(bio)) result.biomass = Math.round(bio);
          }

          // FCR
          if (sampleFCRCol !== -1 && row[sampleFCRCol] !== '') {
            const fcr = parseFloat(row[sampleFCRCol]);
            if (!isNaN(fcr)) result.sampleFCR = fcr;
          }

          break;
        }
      }
    } catch (err) {
      result.error = err.toString();
    }

    return result;
  }
}


// =========================================================================
// 4. WEATHER DATA PROCESSOR
// =========================================================================

/**
 * Handles Lux daylight calculations, cumulative reboot-immune rainfall, and rolling rainfall windows
 */
class WeatherProcessor {
  /**
   * Processes Weather Live sheet data in a single forward pass:
   * - Recent Lux & Air Temp
   * - Daytime average Lux for today and yesterday (10:00 - 17:00)
   * - Accumulated rainfall today with rollover & reboot immunity
   */
  static processLive(weatherLiveData, today, yesterday) {
    let luxTodaySum = 0, luxTodayCount = 0;
    let luxYestSum = 0, luxYestCount = 0;
    let rainTodaySum = 0, lastRain = 0, isFirstRain = true;
    let recentLux = 0, recentAirTemp = 0;
    const weatherSeries = [];

    for (let i = 1; i < weatherLiveData.length; i++) {
      const row = weatherLiveData[i];
      if (!row) continue;

      let ts = row[9] instanceof Date ? row[9] : new Date(row[9]);
      if (isNaN(ts.getTime()) && typeof row[0] === 'string') {
        ts = new Date(row[0] + ' ' + (row[1] || ''));
      }
      if (isNaN(ts.getTime())) ts = new Date(row[0]);
      if (isNaN(ts.getTime())) continue;

      const rowLux = parseFloat(row[3]);
      const rowAirTemp = parseFloat(row[2]);
      const rowRain = parseFloat(row[4]);

      if (!isNaN(rowLux)) recentLux = rowLux;
      if (!isNaN(rowAirTemp)) recentAirTemp = rowAirTemp;

      if (!isNaN(rowLux) || !isNaN(rowAirTemp)) {
        weatherSeries.push({
          time: ts.getTime(),
          lux: !isNaN(rowLux) ? rowLux : null,
          airTemp: !isNaN(rowAirTemp) ? rowAirTemp : null
        });
      }

      const hr = ts.getHours();

      // Today calculations
      if (DateUtils.isSameDate(ts, today)) {
        if (hr >= 10 && hr <= 17 && !isNaN(rowLux)) {
          luxTodaySum += rowLux;
          luxTodayCount++;
        }
        // Cumulative rainfall with reboot protection
        if (!isNaN(rowRain) && rowRain >= 0) {
          if (isFirstRain) {
            rainTodaySum = rowRain;
            isFirstRain = false;
          } else {
            rainTodaySum += (rowRain >= lastRain) ? (rowRain - lastRain) : rowRain;
          }
          lastRain = rowRain;
        }
      } else if (DateUtils.isSameDate(ts, yesterday)) {
        if (hr >= 10 && hr <= 17 && !isNaN(rowLux)) {
          luxYestSum += rowLux;
          luxYestCount++;
        }
      }
    }

    // Process 12-hour trends and sparkline series
    const luxTrend = WeatherProcessor._calculateTrend(weatherSeries, 'lux', recentLux, 500);
    const airTempTrend = WeatherProcessor._calculateTrend(weatherSeries, 'airTemp', recentAirTemp, 0.2);

    return {
      recentLux: recentLux,
      recentAirTemp: recentAirTemp,
      luxTodayAvg: luxTodayCount > 0 ? luxTodaySum / luxTodayCount : 0,
      luxYestAvg: luxYestCount > 0 ? luxYestSum / luxYestCount : 0,
      rainTodaySum: parseFloat(rainTodaySum.toFixed(2)),
      trends: {
        lux: luxTrend.trend,
        airTemp: airTempTrend.trend
      },
      sparklines: {
        lux: luxTrend.sparkline,
        airTemp: airTempTrend.sparkline
      }
    };
  }

  /**
   * Helper to compute 1-hour delta rate and downsampled sparkline points
   */
  static _calculateTrend(series, key, latestVal, threshold = 0.1) {
    if (!series || series.length === 0) {
      return { trend: { delta1h: 0, ratePerHour: 0, direction: 'stable' }, sparkline: latestVal !== null ? [latestVal] : [] };
    }

    const validPoints = series
      .filter(p => p[key] !== null && !isNaN(p[key]))
      .sort((a, b) => a.time - b.time);

    if (validPoints.length === 0) {
      return { trend: { delta1h: 0, ratePerHour: 0, direction: 'stable' }, sparkline: latestVal !== null ? [latestVal] : [] };
    }

    const latest = validPoints[validPoints.length - 1];
    const latestTime = latest.time;
    const cutoff12h = latestTime - (12 * 3600 * 1000);
    const recentWindow = validPoints.filter(p => p.time >= cutoff12h);

    // Find reading ~1 hour ago (30 to 90 min)
    const target1hTime = latestTime - (3600 * 1000);
    let bestPoint = null;
    let minDiff = Infinity;

    for (const p of recentWindow) {
      if (p.time < latestTime) {
        const diff = Math.abs(p.time - target1hTime);
        if (diff < minDiff) {
          minDiff = diff;
          bestPoint = p;
        }
      }
    }

    let delta1h = 0;
    let ratePerHour = 0;
    if (bestPoint && bestPoint !== latest) {
      const dtHours = Math.max(0.1, (latestTime - bestPoint.time) / 3600000);
      delta1h = latest[key] - bestPoint[key];
      ratePerHour = delta1h / dtHours;
    }

    let direction = 'stable';
    if (ratePerHour > threshold) direction = 'up';
    else if (ratePerHour < -threshold) direction = 'down';

    // Downsample window to 16 points for clean sparkline
    const sparkline = [];
    const step = Math.max(1, Math.floor(recentWindow.length / 16));
    for (let i = 0; i < recentWindow.length; i += step) {
      sparkline.push(Math.round(recentWindow[i][key] * 100) / 100);
    }
    if (recentWindow.length > 0 && sparkline[sparkline.length - 1] !== Math.round(latest[key] * 100) / 100) {
      sparkline.push(Math.round(latest[key] * 100) / 100);
    }

    return {
      trend: {
        delta1h: Math.round(delta1h * 100) / 100,
        ratePerHour: Math.round(ratePerHour * 100) / 100,
        direction: direction
      },
      sparkline: sparkline
    };
  }

  /**
   * Processes historical weather archive and computes 7-day rolling rainfall using an O(N) sliding window
   */
  static processHistory(weatherHistoryData, startFilterTime) {
    const dailyWeather = {};

    for (let i = 1; i < weatherHistoryData.length; i++) {
      const row = weatherHistoryData[i];
      if (!row[0]) continue;

      let ts = row[0] instanceof Date ? row[0] : new Date(row[0]);
      if (isNaN(ts.getTime()) && row[1]) {
        ts = new Date(String(row[0]).trim() + ' ' + String(row[1]).trim());
      }
      if (isNaN(ts.getTime()) || ts.getTime() < startFilterTime) continue;

      const rain = parseFloat(row[2]) || 0;
      const dKey = DateUtils.toDateKey(ts);

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

    // 7-day rolling rainfall calculation via O(N) sliding window
    const weatherKeys = Object.keys(dailyWeather).sort();
    const sevenDayRainMap = {};
    let windowSum = 0;
    let windowStart = 0;

    for (let i = 0; i < weatherKeys.length; i++) {
      const currKey = weatherKeys[i];
      const currDate = dailyWeather[currKey].dateObj;
      windowSum += dailyWeather[currKey].rainSum;

      while (windowStart < i) {
        const startDate = dailyWeather[weatherKeys[windowStart]].dateObj;
        const diffDays = (currDate.getTime() - startDate.getTime()) / 86400000;
        if (diffDays >= 7) {
          windowSum -= dailyWeather[weatherKeys[windowStart]].rainSum;
          windowStart++;
        } else {
          break;
        }
      }
      sevenDayRainMap[currKey] = Math.max(0, windowSum);
    }

    const latestKey = weatherKeys.length > 0 ? weatherKeys[weatherKeys.length - 1] : null;

    return {
      dailyWeather: dailyWeather,
      sevenDayRainMap: sevenDayRainMap,
      latestRain7d: latestKey ? (sevenDayRainMap[latestKey] || 0) : 0
    };
  }
}


// =========================================================================
// 5. WATER QUALITY DATA PROCESSOR
// =========================================================================

/**
 * Handles parsing, sensor metric calculations (Min/Max/Deltas), extremes, and daily groupings
 */
class WaterQualityProcessor {
  /**
   * Processes WQS sensor data in a single pass:
   * - Latest valid sensor readings
   * - Today's metrics (Min from 00:00-19:00 window, Max all-day, Deltas)
   * - Lifetime extreme water temperatures
   * - Daily aggregations for anomaly tracking
   */
  static process(wqsData, startFilterTime, stockingDate, currentDoc, today) {
    let recentTimestamp = null, recentDO = null, recentPH = null, recentWaterTemp = null;
    let minTempRecord = null, maxTempRecord = null;
    const dailyWqs = {};
    const wqsSeries = [];

    // Today metrics tracking
    let tempTodayMin = null, tempTodayMax = null;
    let doTodayMin = null, doTodayMax = null;
    let phTodayMin = null, phTodayMax = null;

    // Single pass over WQS data
    for (let i = 1; i < wqsData.length; i++) {
      const row = wqsData[i];
      if (!row[0]) continue;

      let ts = row[0] instanceof Date ? row[0] : new Date(row[0]);
      if (isNaN(ts.getTime())) continue;

      const rowTime = ts.getTime();
      const hasDO = SensorUtils.isValid(row[1]);
      const hasPH = SensorUtils.isValid(row[2]);
      const hasTemp = SensorUtils.isValid(row[4]);

      const rowDO = hasDO ? parseFloat(row[1]) : null;
      const rowPH = hasPH ? parseFloat(row[2]) : null;
      const rowTemp = hasTemp ? parseFloat(row[4]) : null;

      // Track most recent valid reading with all 3 parameters
      if (hasDO && hasPH && hasTemp) {
        recentTimestamp = ts;
        recentDO = rowDO;
        recentPH = rowPH;
        recentWaterTemp = rowTemp;
      }

      if (hasDO || hasPH || hasTemp) {
        wqsSeries.push({
          time: rowTime,
          do: rowDO,
          ph: rowPH,
          waterTemp: rowTemp
        });
      }

      // Skip historical aggregation if earlier than stocking / cycle start date
      if (rowTime < startFilterTime) continue;

      const hr = ts.getHours();

      // Today calculations
      if (DateUtils.isSameDate(ts, today)) {
        // Min data is lowest data between 00:00 and 19:00 (hr <= 19)
        if (hr <= 19) {
          if (rowTemp !== null && (tempTodayMin === null || rowTemp < tempTodayMin)) tempTodayMin = rowTemp;
          if (rowDO !== null && (doTodayMin === null || rowDO < doTodayMin)) doTodayMin = rowDO;
          if (rowPH !== null && (phTodayMin === null || rowPH < phTodayMin)) phTodayMin = rowPH;
        }
        // Max data is updated throughout the day
        if (rowTemp !== null && (tempTodayMax === null || rowTemp > tempTodayMax)) tempTodayMax = rowTemp;
        if (rowDO !== null && (doTodayMax === null || rowDO > doTodayMax)) doTodayMax = rowDO;
        if (rowPH !== null && (phTodayMax === null || rowPH > phTodayMax)) phTodayMax = rowPH;
      }

      // Lifetime extremes (filtered for sensor glitches: 10°C - 45°C)
      if (rowTemp !== null && rowTemp > 10 && rowTemp < 45) {
        if (minTempRecord === null || rowTemp < minTempRecord.value) {
          minTempRecord = {
            value: rowTemp,
            timestamp: ts.toISOString(),
            dateStr: DateUtils.formatDateStandard(ts),
            timeStr: DateUtils.formatTimeStandard(ts),
            doc: DateUtils.calculateDoc(ts, stockingDate, currentDoc, today)
          };
        }
        if (maxTempRecord === null || rowTemp > maxTempRecord.value) {
          maxTempRecord = {
            value: rowTemp,
            timestamp: ts.toISOString(),
            dateStr: DateUtils.formatDateStandard(ts),
            timeStr: DateUtils.formatTimeStandard(ts),
            doc: DateUtils.calculateDoc(ts, stockingDate, currentDoc, today)
          };
        }
      }

      // Daily WQS map for anomaly tracking
      const dKey = DateUtils.toDateKey(ts);
      if (!dailyWqs[dKey]) {
        const dayDate = new Date(ts.getFullYear(), ts.getMonth(), ts.getDate());
        dailyWqs[dKey] = {
          dateObj: dayDate,
          dateKey: dKey,
          doc: DateUtils.calculateDoc(dayDate, stockingDate, currentDoc, today),
          tempMin: null,
          tempMax: null,
          doMin: null,
          doMax: null,
          phMin: null,
          phMax: null,
          tempSum: 0,
          tempCount: 0,
          phSum: 0,
          phCount: 0
        };
      }

      const dayObj = dailyWqs[dKey];
      if (rowTemp !== null) { dayObj.tempSum += rowTemp; dayObj.tempCount++; }
      if (rowPH !== null) { dayObj.phSum += rowPH; dayObj.phCount++; }

      // Daily min between 00:00 and 19:00
      if (hr <= 19) {
        if (rowTemp !== null && (dayObj.tempMin === null || rowTemp < dayObj.tempMin)) dayObj.tempMin = rowTemp;
        if (rowDO !== null && (dayObj.doMin === null || rowDO < dayObj.doMin)) dayObj.doMin = rowDO;
        if (rowPH !== null && (dayObj.phMin === null || rowPH < dayObj.phMin)) dayObj.phMin = rowPH;
      }
      // Daily max throughout the day
      if (rowTemp !== null && (dayObj.tempMax === null || rowTemp > dayObj.tempMax)) dayObj.tempMax = rowTemp;
      if (rowDO !== null && (dayObj.doMax === null || rowDO > dayObj.doMax)) dayObj.doMax = rowDO;
      if (rowPH !== null && (dayObj.phMax === null || rowPH > dayObj.phMax)) dayObj.phMax = rowPH;
    }

    // Fallback for recent readings if none had all 3 parameters valid simultaneously
    if (recentDO === null || recentPH === null || recentWaterTemp === null) {
      for (let i = wqsData.length - 1; i > 0; i--) {
        const row = wqsData[i];
        if (!row[0]) continue;
        if (recentDO === null && SensorUtils.isValid(row[1])) recentDO = parseFloat(row[1]);
        if (recentPH === null && SensorUtils.isValid(row[2])) recentPH = parseFloat(row[2]);
        if (recentWaterTemp === null && SensorUtils.isValid(row[4])) recentWaterTemp = parseFloat(row[4]);
        if (recentTimestamp === null && (SensorUtils.isValid(row[1]) || SensorUtils.isValid(row[2]) || SensorUtils.isValid(row[4]))) {
          recentTimestamp = row[0];
        }
        if (recentDO !== null && recentPH !== null && recentWaterTemp !== null) break;
      }
    }

    // Calculate Deltas for today
    const tempTodayDelta = (tempTodayMin !== null && tempTodayMax !== null)
      ? parseFloat((tempTodayMax - tempTodayMin).toFixed(1))
      : null;

    const doTodayDelta = (doTodayMin !== null && doTodayMax !== null)
      ? parseFloat((doTodayMax - doTodayMin).toFixed(1))
      : null;

    const phTodayDelta = (phTodayMin !== null && phTodayMax !== null)
      ? parseFloat((phTodayMax - phTodayMin).toFixed(2))
      : null;

    // Process 12-hour trends and sparklines for WQS
    const doTrend = WaterQualityProcessor._calculateTrend(wqsSeries, 'do', recentDO, 0.05);
    const phTrend = WaterQualityProcessor._calculateTrend(wqsSeries, 'ph', recentPH, 0.02);
    const waterTempTrend = WaterQualityProcessor._calculateTrend(wqsSeries, 'waterTemp', recentWaterTemp, 0.1);

    // Calculate 7-Day Strategic Water Quality Trends
    const sortedDateKeys = Object.keys(dailyWqs).sort();
    const last7Keys = sortedDateKeys.slice(-7);
    const past7DaysData = [];

    for (const k of last7Keys) {
      const d = dailyWqs[k];
      const dayLabel = d.dateObj ? DateUtils.formatDateStandard(d.dateObj) : k;
      const shortDate = d.dateObj ? `${d.dateObj.getDate()} ${DateUtils.MONTH_NAMES[d.dateObj.getMonth()]}` : k;
      const doMinVal = d.doMin !== null ? Math.round(d.doMin * 100) / 100 : null;
      const phAvgVal = d.phCount > 0 ? Math.round((d.phSum / d.phCount) * 100) / 100 : ((d.phMin !== null && d.phMax !== null) ? Math.round(((d.phMin + d.phMax) / 2) * 100) / 100 : null);
      const tempAvgVal = d.tempCount > 0 ? Math.round((d.tempSum / d.tempCount) * 10) / 10 : ((d.tempMin !== null && d.tempMax !== null) ? Math.round(((d.tempMin + d.tempMax) / 2) * 10) / 10 : null);

      past7DaysData.push({
        dateKey: k,
        dateLabel: dayLabel,
        shortDate: shortDate,
        doc: d.doc,
        doMin: doMinVal,
        phAvg: phAvgVal,
        tempAvg: tempAvgVal
      });
    }

    // DO 7-Day Morning Minima Summary
    const validDo7d = past7DaysData.map(d => d.doMin).filter(v => v !== null);
    const doAvg7d = validDo7d.length > 0 ? Math.round((validDo7d.reduce((a, b) => a + b, 0) / validDo7d.length) * 100) / 100 : null;
    const do7dDelta = validDo7d.length >= 2 ? Math.round((validDo7d[validDo7d.length - 1] - validDo7d[0]) * 100) / 100 : 0;

    // pH 7-Day Daily Mean Summary
    const validPh7d = past7DaysData.map(d => d.phAvg).filter(v => v !== null);
    const phAvg7d = validPh7d.length > 0 ? Math.round((validPh7d.reduce((a, b) => a + b, 0) / validPh7d.length) * 100) / 100 : null;
    const ph7dDelta = validPh7d.length >= 2 ? Math.round((validPh7d[validPh7d.length - 1] - validPh7d[0]) * 100) / 100 : 0;

    // Water Temp 7-Day Daily Mean Summary
    const validTemp7d = past7DaysData.map(d => d.tempAvg).filter(v => v !== null);
    const tempAvg7d = validTemp7d.length > 0 ? Math.round((validTemp7d.reduce((a, b) => a + b, 0) / validTemp7d.length) * 10) / 10 : null;
    const temp7dDelta = validTemp7d.length >= 2 ? Math.round((validTemp7d[validTemp7d.length - 1] - validTemp7d[0]) * 10) / 10 : 0;

    const weeklyMetrics = {
      daysCount: past7DaysData.length,
      startDate: past7DaysData.length > 0 ? past7DaysData[0].shortDate : '',
      endDate: past7DaysData.length > 0 ? past7DaysData[past7DaysData.length - 1].shortDate : '',
      startDoc: past7DaysData.length > 0 ? past7DaysData[0].doc : null,
      endDoc: past7DaysData.length > 0 ? past7DaysData[past7DaysData.length - 1].doc : null,
      do: {
        avg: doAvg7d,
        delta7d: do7dDelta,
        sparkline: validDo7d,
        days: past7DaysData.map(d => ({ date: d.shortDate, val: d.doMin, doc: d.doc }))
      },
      ph: {
        avg: phAvg7d,
        delta7d: ph7dDelta,
        sparkline: validPh7d,
        days: past7DaysData.map(d => ({ date: d.shortDate, val: d.phAvg, doc: d.doc }))
      },
      temperature: {
        avg: tempAvg7d,
        delta7d: temp7dDelta,
        sparkline: validTemp7d,
        days: past7DaysData.map(d => ({ date: d.shortDate, val: d.tempAvg, doc: d.doc }))
      }
    };

    return {
      recentRaw: {
        timestamp: recentTimestamp,
        do: recentDO || 0,
        ph: recentPH || 0,
        waterTemp: recentWaterTemp || 0
      },
      todayMetrics: {
        temperature: { min: tempTodayMin, max: tempTodayMax, delta: tempTodayDelta },
        do: { min: doTodayMin, max: doTodayMax, delta: doTodayDelta },
        ph: { min: phTodayMin, max: phTodayMax, delta: phTodayDelta }
      },
      trends: {
        do: doTrend.trend,
        ph: phTrend.trend,
        waterTemp: waterTempTrend.trend
      },
      sparklines: {
        do: doTrend.sparkline,
        ph: phTrend.sparkline,
        waterTemp: waterTempTrend.sparkline
      },
      weeklyMetrics: weeklyMetrics,
      dailyWqs: dailyWqs,
      minTempRecord: minTempRecord,
      maxTempRecord: maxTempRecord
    };
  }

  /**
   * Helper to compute 1-hour delta rate and downsampled sparkline points for WQS
   */
  static _calculateTrend(series, key, latestVal, threshold = 0.05) {
    if (!series || series.length === 0) {
      return { trend: { delta1h: 0, ratePerHour: 0, direction: 'stable' }, sparkline: latestVal !== null ? [latestVal] : [] };
    }

    const validPoints = series
      .filter(p => p[key] !== null && !isNaN(p[key]))
      .sort((a, b) => a.time - b.time);

    if (validPoints.length === 0) {
      return { trend: { delta1h: 0, ratePerHour: 0, direction: 'stable' }, sparkline: latestVal !== null ? [latestVal] : [] };
    }

    const latest = validPoints[validPoints.length - 1];
    const latestTime = latest.time;
    const cutoff12h = latestTime - (12 * 3600 * 1000);
    const recentWindow = validPoints.filter(p => p.time >= cutoff12h);

    // Find reading ~1 hour ago (30 to 90 min)
    const target1hTime = latestTime - (3600 * 1000);
    let bestPoint = null;
    let minDiff = Infinity;

    for (const p of recentWindow) {
      if (p.time < latestTime) {
        const diff = Math.abs(p.time - target1hTime);
        if (diff < minDiff) {
          minDiff = diff;
          bestPoint = p;
        }
      }
    }

    let delta1h = 0;
    let ratePerHour = 0;
    if (bestPoint && bestPoint !== latest) {
      const dtHours = Math.max(0.1, (latestTime - bestPoint.time) / 3600000);
      delta1h = latest[key] - bestPoint[key];
      ratePerHour = delta1h / dtHours;
    }

    let direction = 'stable';
    if (ratePerHour > threshold) direction = 'up';
    else if (ratePerHour < -threshold) direction = 'down';

    // Downsample window to 16 points for clean sparkline
    const sparkline = [];
    const step = Math.max(1, Math.floor(recentWindow.length / 16));
    for (let i = 0; i < recentWindow.length; i += step) {
      sparkline.push(Math.round(recentWindow[i][key] * 100) / 100);
    }
    if (recentWindow.length > 0 && sparkline[sparkline.length - 1] !== Math.round(latest[key] * 100) / 100) {
      sparkline.push(Math.round(latest[key] * 100) / 100);
    }

    return {
      trend: {
        delta1h: Math.round(delta1h * 100) / 100,
        ratePerHour: Math.round(ratePerHour * 100) / 100,
        direction: direction
      },
      sparkline: sparkline
    };
  }
}


// =========================================================================
// 6. ALERT & ADVISORY ENGINE
// =========================================================================

/**
 * Evaluates water quality and weather metrics against alert rules and generates advisory messages
 */
class AlertEngine {
  /**
   * Evaluates historical daily logs against AlertConfig thresholds
   */
  static detectAbnormalities(dailyWqs, dailyWeather, sevenDayRainMap, stockingDate, currentDoc, today) {
    const allDateKeys = Array.from(new Set([...Object.keys(dailyWqs), ...Object.keys(dailyWeather)])).sort().reverse();
    const abnormalities = [];

    for (const k of allDateKeys) {
      const wqs = dailyWqs[k];
      const weather = dailyWeather[k];
      const dateObj = (wqs && wqs.dateObj) || (weather && weather.dateObj);
      const doc = (wqs && wqs.doc) || DateUtils.calculateDoc(dateObj, stockingDate, currentDoc, today);
      const issues = [];

      if (wqs) {
        // 1. High Temperature Alert (> 33.0°C)
        if (wqs.tempMax !== null && wqs.tempMax > AlertConfig.TEMP_HIGH_THRESHOLD) {
          issues.push({
            type: 'temp',
            name: 'High Water Temp',
            value: `${wqs.tempMax.toFixed(1)}°C`,
            desc: `Water temperature peaked at ${wqs.tempMax.toFixed(1)}°C (> ${AlertConfig.TEMP_HIGH_THRESHOLD}°C threshold).`
          });
        }

        // 2. High Temperature Fluctuation Alert (Δ >= 3.0°C in same day)
        if (wqs.tempMin !== null && wqs.tempMax !== null) {
          const tempDelta = wqs.tempMax - wqs.tempMin;
          if (tempDelta >= AlertConfig.TEMP_DELTA_ALERT_THRESHOLD) {
            issues.push({
              type: 'temp',
              name: 'Thermal Fluctuation',
              value: `${tempDelta.toFixed(1)}°C swing`,
              desc: `Water temp fluctuated ${tempDelta.toFixed(1)}°C in the same day (Min: ${wqs.tempMin.toFixed(1)}°C, Max: ${wqs.tempMax.toFixed(1)}°C).`
            });
          }
        }

        // 3. Low DO Alert (< 3.0 ppm)
        if (wqs.doMin !== null && wqs.doMin < AlertConfig.DO_DANGER_THRESHOLD) {
          issues.push({
            type: 'do',
            name: 'Low DO',
            value: `${wqs.doMin.toFixed(1)} ppm`,
            desc: `Daily minimum DO dropped to ${wqs.doMin.toFixed(1)} ppm (< ${AlertConfig.DO_DANGER_THRESHOLD} ppm threshold).`
          });
        }

        // 4. High pH Swing Alert (> 0.5)
        if (wqs.phMin !== null && wqs.phMax !== null) {
          const phDelta = wqs.phMax - wqs.phMin;
          if (phDelta > AlertConfig.PH_DELTA_ALERT_THRESHOLD) {
            issues.push({
              type: 'ph',
              name: 'High pH Swing',
              value: phDelta.toFixed(2),
              desc: `pH fluctuated by ${phDelta.toFixed(2)} (Min: ${wqs.phMin.toFixed(2)}, Max: ${wqs.phMax.toFixed(2)}).`
            });
          }
        }
      }

      // 5. Heavy Rainfall (>= 40mm/day or >= 120mm/7-day)
      if (weather) {
        if (weather.rainSum >= AlertConfig.RAIN_DAILY_DANGER_MM) {
          issues.push({
            type: 'rain',
            name: 'Heavy Rainfall',
            value: `${weather.rainSum.toFixed(1)} mm`,
            desc: `Single-day rainfall reached ${weather.rainSum.toFixed(1)} mm (≥ ${AlertConfig.RAIN_DAILY_DANGER_MM} mm threshold).`
          });
        }

        const rain7d = sevenDayRainMap[k] || 0;
        if (rain7d >= AlertConfig.RAIN_7DAY_DANGER_MM && weather.rainSum < AlertConfig.RAIN_DAILY_DANGER_MM) {
          issues.push({
            type: 'rain',
            name: 'Continuous Rain (7-Day)',
            value: `${rain7d.toFixed(1)} mm / week`,
            desc: `Cumulative rainfall reached ${rain7d.toFixed(1)} mm across 7 consecutive days (≥ ${AlertConfig.RAIN_7DAY_DANGER_MM} mm threshold).`
          });
        }
      }

      if (issues.length > 0) {
        abnormalities.push({
          date: DateUtils.formatDateStandard(dateObj),
          dateRaw: dateObj.toISOString(),
          doc: doc,
          issues: issues
        });
      }
    }

    return abnormalities;
  }

  /**
   * Builds real-time status determinations, badges, and feeding action plan
   */
  static buildAnalysisStatus(todayMetrics, weatherLive, weatherHistory, today) {
    // 1. Water Temperature Analysis
    const temp = (todayMetrics && todayMetrics.temperature) || {};
    const isHighTemp = temp.max !== null && temp.max > AlertConfig.TEMP_HIGH_THRESHOLD;
    const isHighTempDelta = temp.delta !== null && temp.delta >= AlertConfig.TEMP_DELTA_ALERT_THRESHOLD;
    const tempWarning = isHighTemp || isHighTempDelta;

    let tempStatus = "Normal";
    let tempMessage = "Normal";
    if (isHighTemp && isHighTempDelta) {
      tempStatus = "Danger";
      tempMessage = `High Temp (>33°C) & Swing (≥3.0°C)`;
    } else if (isHighTemp) {
      tempStatus = "Warning";
      tempMessage = `High Temp: ${temp.max.toFixed(1)}°C (>33°C)`;
    } else if (isHighTempDelta) {
      tempStatus = "Warning";
      tempMessage = `High Swing: ${temp.delta.toFixed(1)}°C (≥3.0°C)`;
    } else if (temp.delta !== null) {
      tempMessage = `Swing: ${temp.delta.toFixed(1)}°C (Normal)`;
    } else {
      tempMessage = "Pending Data";
    }

    // 2. Dissolved Oxygen (DO) Analysis
    const doData = (todayMetrics && todayMetrics.do) || {};
    const isLowDoDanger = doData.min !== null && doData.min < AlertConfig.DO_DANGER_THRESHOLD;
    const isLowDoWarning = doData.min !== null && doData.min < AlertConfig.DO_WARNING_THRESHOLD;
    const doWarning = isLowDoWarning;

    let doStatus = "Good";
    let doMessage = "Normal";
    if (isLowDoDanger) {
      doStatus = "Danger";
      doMessage = `Low DO: ${doData.min.toFixed(1)} ppm (Danger)`;
    } else if (isLowDoWarning) {
      doStatus = "Warning";
      doMessage = `Low DO: ${doData.min.toFixed(1)} ppm (Caution)`;
    } else if (doData.min !== null) {
      doStatus = "Good";
      doMessage = `DO Min: ${doData.min.toFixed(1)} ppm (Good)`;
    } else {
      doStatus = "Unknown";
      doMessage = "Pending Data";
    }

    // 3. pH Analysis
    const phData = (todayMetrics && todayMetrics.ph) || {};
    const isHighPhDelta = phData.delta !== null && phData.delta > AlertConfig.PH_DELTA_ALERT_THRESHOLD;
    const phWarning = isHighPhDelta;

    let phStatus = "Normal";
    let phMessage = "Normal";
    if (isHighPhDelta) {
      phStatus = "Warning";
      phMessage = `High pH Swing: ${phData.delta.toFixed(2)} (>0.5)`;
    } else if (phData.delta !== null) {
      phMessage = `Swing: ${phData.delta.toFixed(2)} (Normal)`;
    } else {
      phMessage = "Pending Data";
    }

    // 4. Weather Lux & Rainfall Analysis
    const hasTodayLux = weatherLive && weatherLive.luxTodayAvg !== undefined && weatherLive.luxTodayAvg > 0;
    const evaluatedLux = hasTodayLux
      ? Math.round(weatherLive.luxTodayAvg)
      : ((weatherLive && weatherLive.luxYestAvg !== undefined) ? Math.round(weatherLive.luxYestAvg) : 0);

    let weatherLuxMessage = "Optimal Sunlight";
    let weatherLuxWarning = false;

    if (evaluatedLux > AlertConfig.LUX_HIGH_MIN) {
      weatherLuxMessage = "High Algae Activity";
    } else if (evaluatedLux >= AlertConfig.LUX_OPTIMAL_MIN) {
      weatherLuxMessage = "Optimal Algae Activity";
    } else if (evaluatedLux >= AlertConfig.LUX_LOW_THRESHOLD) {
      weatherLuxMessage = "Moderate Algae Activity";
    } else if (evaluatedLux > 0) {
      weatherLuxMessage = "Low Algae Activity / Overcast";
      weatherLuxWarning = true;
    } else {
      weatherLuxMessage = "Pending Sunlight Data";
    }

    const rainToday = (weatherLive && weatherLive.rainTodaySum !== undefined) ? weatherLive.rainTodaySum : 0;
    const rain7d = (weatherHistory && weatherHistory.latestRain7d !== undefined) ? weatherHistory.latestRain7d : 0;

    let weatherRainMessage = `Today's rain: ${rainToday.toFixed(2)}mm`;
    const weatherRainIsDanger = rainToday >= AlertConfig.RAIN_DAILY_DANGER_MM || rain7d >= AlertConfig.RAIN_7DAY_DANGER_MM;
    let weatherRainWarning = weatherRainIsDanger || rainToday >= AlertConfig.RAIN_DAILY_WARNING_MM || rain7d >= AlertConfig.RAIN_7DAY_WARNING_MM;

    if (weatherRainIsDanger) {
      if (rainToday >= AlertConfig.RAIN_DAILY_DANGER_MM) {
        weatherRainMessage += " (Heavy Alert)";
      } else {
        weatherRainMessage += ` (7d: ${rain7d.toFixed(1)}mm High Alert)`;
      }
    } else if (weatherRainWarning) {
      if (rainToday >= AlertConfig.RAIN_DAILY_WARNING_MM) {
        weatherRainMessage += " (Rain Warning)";
      } else {
        weatherRainMessage += ` (7d: ${rain7d.toFixed(1)}mm High)`;
      }
    }

    // 5. Feeding Action Plan
    let feedingAction = "Normal Feed - Optimal Conditions.";
    if (tempWarning || doWarning || phWarning || weatherLuxWarning || weatherRainWarning) {
      feedingAction = "Reduce/Cut Feed - Water quality/weather alert active.";
    }

    return {
      temperature: {
        min: temp.min,
        max: temp.max,
        delta: temp.delta,
        warning: tempWarning,
        isHighTemp: isHighTemp,
        isHighFluctuation: isHighTempDelta,
        status: tempStatus,
        message: tempMessage
      },
      do: {
        min: doData.min,
        max: doData.max,
        delta: doData.delta,
        warning: doWarning,
        isDanger: isLowDoDanger,
        status: doStatus,
        message: doMessage
      },
      ph: {
        min: phData.min,
        max: phData.max,
        delta: phData.delta,
        warning: phWarning,
        status: phStatus,
        message: phMessage
      },
      weatherLux: {
        message: weatherLuxMessage,
        warning: weatherLuxWarning,
        avgToday: weatherLive ? weatherLive.luxTodayAvg : 0,
        avgYest: weatherLive ? weatherLive.luxYestAvg : 0
      },
      weatherRain: {
        message: weatherRainMessage,
        warning: weatherRainWarning,
        isDanger: weatherRainIsDanger,
        sumToday: rainToday,
        sum7Day: rain7d
      },
      feedingAction: feedingAction
    };
  }
}


// =========================================================================
// 7. CACHING & RESPONSE CONTROLLER
// =========================================================================

/**
 * Manages Google Apps Script ScriptCache for fast sub-second client response
 */
class CacheManager {
  static get(key) {
    try {
      return CacheService.getScriptCache().get(key);
    } catch (e) {
      return null;
    }
  }

  static put(key, valueString, seconds = AppConfig.CACHE_DURATION_SECONDS) {
    try {
      CacheService.getScriptCache().put(key, valueString, seconds);
    } catch (e) {
      // Ignore if cache size limits exceeded
    }
  }
}

/**
 * Main Application Orchestrator
 */
class AppController {
  static handleRequest(e) {
    try {
      const targetPond = (e && e.parameter && e.parameter.pond) ? e.parameter.pond : AppConfig.TARGET_POND;
      const forceRefresh = (e && e.parameter && (
        e.parameter.refresh === 'true' || 
        e.parameter.nocache === 'true' || 
        e.parameter.force === 'true' ||
        e.parameter.refresh === '1' ||
        e.parameter.nocache === '1'
      ));
      const cacheKey = `wqs_dashboard_${targetPond}`;

      // 1. Check Short-Term Cache
      if (!forceRefresh) {
        const cachedResponse = CacheManager.get(cacheKey);
        if (cachedResponse) {
          return ContentService.createTextOutput(cachedResponse).setMimeType(ContentService.MimeType.JSON);
        }
      }

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today.getTime() - 86400000);

      // 2. Fetch Operational Details (Stocking Date & Culture Cycle bounds)
      const pondDetails = PondRepository.fetchDetails(targetPond, today);

      let cycleStartDate = pondDetails.stockingDateRaw || null;
      if (!cycleStartDate && pondDetails.doc) {
        cycleStartDate = new Date(today.getTime() - (pondDetails.doc - 1) * 86400000);
      }
      const startFilterTime = cycleStartDate
        ? new Date(cycleStartDate.getFullYear(), cycleStartDate.getMonth(), cycleStartDate.getDate()).getTime()
        : (today.getTime() - AppConfig.DEFAULT_HISTORY_DAYS * 86400000);

      // 3. Open Spreadsheets and read data
      const wqsSheet = SpreadsheetApp.openById(AppConfig.WQS_SHEET_ID).getSheets()[0];
      const weatherSs = SpreadsheetApp.openById(AppConfig.WEATHER_SHEET_ID);
      const weatherLiveSheet = weatherSs.getSheetByName("Live");
      const weatherHistorySheet = weatherSs.getSheetByName("Sheet1");

      const wqsData = wqsSheet.getDataRange().getValues();
      const weatherLiveData = weatherLiveSheet.getDataRange().getValues();
      const weatherHistoryData = weatherHistorySheet.getDataRange().getValues();

      // 4. Process Weather Data
      const weatherLive = WeatherProcessor.processLive(weatherLiveData, today, yesterday);
      const weatherHistory = WeatherProcessor.processHistory(weatherHistoryData, startFilterTime);

      // 5. Process Water Quality Data
      const wqsResult = WaterQualityProcessor.process(wqsData, startFilterTime, cycleStartDate, pondDetails.doc, today);

      // 6. Alert & Advisory Evaluation
      const analysis = AlertEngine.buildAnalysisStatus(wqsResult.todayMetrics, weatherLive, weatherHistory, today);
      const abnormalities = AlertEngine.detectAbnormalities(
        wqsResult.dailyWqs,
        weatherHistory.dailyWeather,
        weatherHistory.sevenDayRainMap,
        cycleStartDate,
        pondDetails.doc,
        today
      );

      // 7. Construct Final Response Payload
      const payload = {
        status: "success",
        data: {
          pondDetails: pondDetails,
          raw: {
            timestamp: wqsResult.recentRaw.timestamp instanceof Date
              ? wqsResult.recentRaw.timestamp.toISOString()
              : (wqsResult.recentRaw.timestamp || now.toISOString()),
            do: wqsResult.recentRaw.do,
            ph: wqsResult.recentRaw.ph,
            waterTemp: wqsResult.recentRaw.waterTemp,
            lux: weatherLive.recentLux,
            airTemp: weatherLive.recentAirTemp,
            trends: {
              do: wqsResult.trends.do,
              ph: wqsResult.trends.ph,
              waterTemp: wqsResult.trends.waterTemp,
              lux: weatherLive.trends.lux,
              airTemp: weatherLive.trends.airTemp
            },
            sparklines: {
              do: wqsResult.sparklines.do,
              ph: wqsResult.sparklines.ph,
              waterTemp: wqsResult.sparklines.waterTemp,
              lux: weatherLive.sparklines.lux,
              airTemp: weatherLive.sparklines.airTemp
            }
          },
          weeklyMetrics: wqsResult.weeklyMetrics,
          analysis: analysis,
          history: {
            totalAbnormalDays: abnormalities.length,
            tempExtremes: {
              min: wqsResult.minTempRecord,
              max: wqsResult.maxTempRecord
            },
            abnormalities: abnormalities
          }
        }
      };

      const outputJson = JSON.stringify(payload);

      // Store in Cache
      CacheManager.put(cacheKey, outputJson, AppConfig.CACHE_DURATION_SECONDS);

      return ContentService.createTextOutput(outputJson).setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService.createTextOutput(
        JSON.stringify({ status: "error", message: error.toString() })
      ).setMimeType(ContentService.MimeType.JSON);
    }
  }
}


// =========================================================================
// 8. MAIN GOOGLE APPS SCRIPT WEB APP ENTRYPOINT
// =========================================================================

/**
 * Main Web App Entrypoint (GET handler)
 */
function doGet(e) {
  return AppController.handleRequest(e);
}
