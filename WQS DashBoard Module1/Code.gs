function doGet(e) {
  try {
    const wqsId = '1zVXbhakvH8kFIcV_YL-YS89dsAF0eDNE-eeTxV-IWuY';
    const weatherId = '1xhWN6yg5u229HS-LbCDL2qVKs2b2v16XxGlklKR63BQ';
    
    const wqsSheet = SpreadsheetApp.openById(wqsId).getSheets()[0];
    const weatherSheet = SpreadsheetApp.openById(weatherId).getSheets()[0];
    
    const wqsData = wqsSheet.getDataRange().getValues();
    const weatherData = weatherSheet.getDataRange().getValues();
    
    const now = new Date();
    // Use the spreadsheet timezone or current time, here we use Date assuming Apps Script time matches pond time
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    
    // Helper to check if two dates are same calendar day
    const isSameDate = (d1, d2) => d1.getFullYear() === d2.getFullYear() && 
                                   d1.getMonth() === d2.getMonth() && 
                                   d1.getDate() === d2.getDate();
    
    const getHour = (d) => d.getHours();

    let recentTimestamp = null, recentDO = 0, recentPH = 0, recentWaterTemp = 0, recentLux = 0, recentAirTemp = 0;
    
    for (let i = wqsData.length - 1; i > 0; i--) {
      if (wqsData[i][0]) { // Check if timestamp cell is not empty
        const lastRow = wqsData[i];
        recentTimestamp = lastRow[0];
        recentDO = lastRow[1];
        recentPH = lastRow[2];
        recentWaterTemp = lastRow[4];
        break;
      }
    }
    
    for (let i = weatherData.length - 1; i > 0; i--) {
      if (weatherData[i][9] || weatherData[i][0]) { // Timestamp check
        const lastRow = weatherData[i];
        recentLux = lastRow[3];
        recentAirTemp = lastRow[4];
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

      const rowDO = parseFloat(row[1]);
      const rowPH = parseFloat(row[2]);
      const rowTemp = parseFloat(row[4]);
      const hr = getHour(ts);

      // Today logic
      if (isSameDate(ts, today)) {
        // DO: Lowest around 5:00 AM (e.g. 4 AM - 6 AM)
        if (hr >= 4 && hr <= 6) {
          if (do5amMin === null || rowDO < do5amMin) do5amMin = rowDO;
          if (ph5am === null) ph5am = rowPH; 
        }
        // pH: around 5:00 PM (e.g. 16:00 - 18:00)
        if (hr >= 16 && hr <= 18) {
          if (ph5pm === null) ph5pm = rowPH;
        }
        // Temp: Highest today
        if (tempTodayMax === null || rowTemp > tempTodayMax) tempTodayMax = rowTemp;
      }
      
      // Yesterday night logic (18:00 yesterday to 06:00 today)
      if ((isSameDate(ts, yesterday) && hr >= 18) || (isSameDate(ts, today) && hr <= 6)) {
        if (tempNightMin === null || rowTemp < tempNightMin) tempNightMin = rowTemp;
      }
    }
    
    // --- Weather Logic ---
    let luxTodaySum = 0, luxTodayCount = 0;
    let luxYestSum = 0, luxYestCount = 0;
    let rainTodaySum = 0;
    
    // Skip header row
    for (let i = 1; i < weatherData.length; i++) {
      const row = weatherData[i];
      // J is Upload Timestamp (index 9)
      let ts = new Date(row[9]);
      if (isNaN(ts.getTime()) && typeof row[0] === 'string') {
        ts = new Date(row[0] + ' ' + row[1]);
      }
      if (isNaN(ts.getTime())) ts = new Date(row[0]);
      if (isNaN(ts.getTime())) continue;

      const rain = parseFloat(row[2]) || 0;
      const lux = parseFloat(row[3]) || 0;

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

    const payload = {
      status: "success",
      data: {
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
        }
      }
    };
    
    // Enable CORS by using ContentService JSON Output
    return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
