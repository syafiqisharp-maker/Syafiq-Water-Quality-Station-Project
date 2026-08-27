// IMPORTANT: Replace this URL with your deployed Google Apps Script Web App URL
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxg0g4k_1wqGGHOCFoSVETFBTJTipT-X7UJKlggySfUGqxGGE54I9wqMPe96NF8TsSIRA/exec';

document.addEventListener('DOMContentLoaded', () => {
    fetchData();
});

async function fetchData() {
    try {
        if (GAS_WEB_APP_URL === 'YOUR_DEPLOYED_WEB_APP_URL_HERE') {
            console.warn("GAS_WEB_APP_URL is placeholder. Loading simulation data.");
            simulateData();
            return;
        }

        const response = await fetch(GAS_WEB_APP_URL);
        const result = await response.json();

        if (result.status === 'success') {
            populateUI(result.data);
        } else {
            console.error("Backend Error:", result.message);
            // Fall back to simulation data if backend error occurs
            simulateData();
        }
    } catch (error) {
        console.warn("Fetch Error (likely CORS or network), falling back to simulation data:", error);
        simulateData();
    } finally {
        hideLoader();
    }
}

function hideLoader() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

function populateUI(data) {
    const { analysis, raw, pondDetails } = data;

    // --- Section 0: Pond Details & Sampling Results ---
    const pd = pondDetails || {};

    const pondBadgeEl = document.getElementById('pond-id-badge');
    if (pondBadgeEl) pondBadgeEl.textContent = pd.pondId || '01.02.12';

    const speciesEl = document.getElementById('pond-species');
    if (speciesEl) speciesEl.textContent = pd.species || 'L. vannamei';

    const lineEl = document.getElementById('pond-line');
    if (lineEl) {
        lineEl.textContent = pd.line || '-';
    }

    const stockSourceEl = document.getElementById('pond-stock-source');
    if (stockSourceEl) stockSourceEl.textContent = pd.stockSource || '-';

    const docEl = document.getElementById('pond-doc');
    if (docEl) {
        docEl.textContent = (pd.doc !== null && pd.doc !== undefined)
            ? `DOC ${pd.doc} Days`
            : 'DOC Pending';
    }

    const sampleDateEl = document.getElementById('pond-sample-date');
    if (sampleDateEl) {
        sampleDateEl.textContent = pd.sampleDate ? `Sampled: ${pd.sampleDate}` : 'Pending update';
    }

    const sampleAbwEl = document.getElementById('sample-abw');
    if (sampleAbwEl) {
        sampleAbwEl.textContent = (pd.sampleABW !== null && pd.sampleABW !== undefined)
            ? `${parseFloat(pd.sampleABW).toFixed(2)} g`
            : '-';
    }

    const sampleAwgEl = document.getElementById('sample-awg');
    if (sampleAwgEl) {
        sampleAwgEl.textContent = (pd.sampleAWG !== null && pd.sampleAWG !== undefined)
            ? `${parseFloat(pd.sampleAWG).toFixed(2)} g/wk`
            : '-';
    }

    const sampleSrEl = document.getElementById('sample-sr');
    if (sampleSrEl) {
        if (pd.sr !== null && pd.sr !== undefined) {
            const srVal = parseFloat(pd.sr);
            sampleSrEl.textContent = `${srVal.toFixed(1)}%`;
            sampleSrEl.className = 'val ' + (srVal >= 80 ? 'text-good' : (srVal >= 65 ? 'text-warning' : 'text-danger'));
        } else {
            sampleSrEl.textContent = '-';
        }
    }

    const sampleFcrEl = document.getElementById('sample-fcr');
    if (sampleFcrEl) {
        sampleFcrEl.textContent = (pd.sampleFCR !== null && pd.sampleFCR !== undefined)
            ? `${parseFloat(pd.sampleFCR).toFixed(2)}`
            : '-';
    }

    // --- Top Section: WQ Status ---
    const wqGrid = document.getElementById('wq-status-grid');
    if (wqGrid && analysis) {
        wqGrid.innerHTML = `
            <div class="status-item">
                <h3>DO at 5 AM</h3>
                <div class="value ${analysis.do.warning ? (analysis.do.status === 'Danger' ? 'text-danger' : 'text-warning') : 'text-good'}">
                    ${analysis.do.message}
                </div>
            </div>
            <div class="status-item">
                <h3>pH Swing (5AM vs 5PM)</h3>
                <div class="value ${analysis.ph.warning ? 'text-danger' : 'text-good'}">
                    ${analysis.ph.message}
                </div>
            </div>
            <div class="status-item">
                <h3>Temp Swing (Yest. Night vs Day)</h3>
                <div class="value ${analysis.temperature.warning ? 'text-danger' : 'text-good'}">
                    ${analysis.temperature.message}
                </div>
            </div>
        `;
    }

    // --- Middle Section: Weather & Feed ---
    const weatherContainer = document.getElementById('weather-status-container');
    if (weatherContainer && analysis) {
        weatherContainer.innerHTML = `
            <div class="status-item" style="margin-bottom:1rem;">
                <h3>Lux (Photosynthesis)</h3>
                <div class="value ${analysis.weatherLux.warning ? 'text-warning' : 'text-good'}">
                    ${analysis.weatherLux.message}
                </div>
            </div>
            <div class="status-item">
                <h3>Rainfall</h3>
                <div class="value ${analysis.weatherRain.warning ? 'text-warning' : 'text-good'}">
                    ${analysis.weatherRain.message}
                </div>
            </div>
        `;
    }

    const feedContainer = document.getElementById('feeding-action-container');
    if (feedContainer && analysis) {
        feedContainer.textContent = analysis.feedingAction;
        if (analysis.feedingAction.includes("Reduce/Cut")) {
            feedContainer.classList.add('action-warning');
        } else {
            feedContainer.classList.remove('action-warning');
        }
    }

    // --- Bottom Section: Raw Stats ---
    if (raw) {
        if (raw.timestamp) {
            const dateObj = new Date(raw.timestamp);
            if (!isNaN(dateObj.getTime())) {
                const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                const timeStr = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                const titleEl = document.getElementById('recent-readings-title');
                if (titleEl) {
                    titleEl.textContent = `Recent Sensor Readings (${dateStr} ${timeStr})`;
                }
            }
        }

        const rawGrid = document.getElementById('raw-stats-grid');
        if (rawGrid) {
            rawGrid.innerHTML = `
                <div class="stat-card">
                    <div class="label">DO</div>
                    <div class="val">${raw.do !== undefined ? parseFloat(raw.do).toFixed(2) + ' ppm' : '-'}</div>
                </div>
                <div class="stat-card">
                    <div class="label">pH</div>
                    <div class="val">${raw.ph !== undefined ? parseFloat(raw.ph).toFixed(2) : '-'}</div>
                </div>
                <div class="stat-card">
                    <div class="label">Water Temp</div>
                    <div class="val">${raw.waterTemp !== undefined ? parseFloat(raw.waterTemp).toFixed(1) + '°C' : '-'}</div>
                </div>
                <div class="stat-card">
                    <div class="label">Lux</div>
                    <div class="val">${raw.lux !== undefined ? Math.round(raw.lux).toLocaleString() : '-'}</div>
                </div>
                <div class="stat-card">
                    <div class="label">Air Temp</div>
                    <div class="val">${raw.airTemp !== undefined ? parseFloat(raw.airTemp).toFixed(1) + '°C' : '-'}</div>
                </div>
            `;
        }
    }

    // --- History Section: Temp Extremes & Abnormalities Log ---
    populateHistory(data.history);
}

function populateHistory(history) {
    if (!history) return;

    // 1. All-Time Water Temperature Records
    const extremes = history.tempExtremes || {};
    const minTempEl = document.getElementById('min-water-temp');
    const minMetaEl = document.getElementById('min-water-temp-meta');
    if (minTempEl && minMetaEl) {
        if (extremes.min && extremes.min.value !== null && extremes.min.value !== undefined) {
            minTempEl.textContent = `${parseFloat(extremes.min.value).toFixed(1)}°C`;
            const docText = extremes.min.doc ? `DOC ${extremes.min.doc}` : 'DOC -';
            const dateText = extremes.min.dateStr || '-';
            const timeText = extremes.min.timeStr ? `, ${extremes.min.timeStr}` : '';
            minMetaEl.textContent = `${docText} • ${dateText}${timeText}`;
        } else {
            minTempEl.textContent = '-';
            minMetaEl.textContent = 'No records yet';
        }
    }

    const maxTempEl = document.getElementById('max-water-temp');
    const maxMetaEl = document.getElementById('max-water-temp-meta');
    if (maxTempEl && maxMetaEl) {
        if (extremes.max && extremes.max.value !== null && extremes.max.value !== undefined) {
            maxTempEl.textContent = `${parseFloat(extremes.max.value).toFixed(1)}°C`;
            const docText = extremes.max.doc ? `DOC ${extremes.max.doc}` : 'DOC -';
            const dateText = extremes.max.dateStr || '-';
            const timeText = extremes.max.timeStr ? `, ${extremes.max.timeStr}` : '';
            maxMetaEl.textContent = `${docText} • ${dateText}${timeText}`;
        } else {
            maxTempEl.textContent = '-';
            maxMetaEl.textContent = 'No records yet';
        }
    }

    // 2. Summary Badge & Abnormal Days Counter
    const count = history.totalAbnormalDays || (history.abnormalities ? history.abnormalities.length : 0);
    const summaryBadge = document.getElementById('abnormal-summary-badge');
    const countTextEl = document.getElementById('abnormal-count-text');

    if (summaryBadge && countTextEl) {
        if (count > 0) {
            summaryBadge.className = 'abnormal-counter-badge';
            summaryBadge.querySelector('.badge-icon').textContent = '⚠️';
            countTextEl.textContent = `${count} Abnormal ${count === 1 ? 'Day' : 'Days'} Detected`;
        } else {
            summaryBadge.className = 'abnormal-counter-badge no-issues';
            summaryBadge.querySelector('.badge-icon').textContent = '✅';
            countTextEl.textContent = '0 Abnormal Days Detected (All Optimal)';
        }
    }

    // 3. Render List of All Detected Abnormal Days
    const anomalyContainer = document.getElementById('anomaly-list-container');
    if (!anomalyContainer) return;

    const list = history.abnormalities || [];

    if (list.length === 0) {
        anomalyContainer.innerHTML = `
            <div class="no-anomalies-card">
                <div class="no-anomalies-icon">🛡️</div>
                <div class="no-anomalies-title">No Water Quality or Weather Abnormalities Detected</div>
                <div class="no-anomalies-desc">All parameters (DO ≥ 3.0 ppm, pH swing ≤ 0.5, Temp swing ≤ 2.0°C, and Rainfall limits) have remained within optimal ranges throughout the culture cycle.</div>
            </div>
        `;
        return;
    }

    anomalyContainer.innerHTML = list.map(item => {
        const docBadge = item.doc ? `DOC ${item.doc}` : 'DOC -';
        const dateStr = item.date || 'Unknown Date';

        const badgesHtml = (item.issues || []).map(issue => {
            let pillClass = 'pill-do';
            let icon = '🚨';
            if (issue.type === 'ph') { pillClass = 'pill-ph'; icon = '📈'; }
            else if (issue.type === 'temp') { pillClass = 'pill-temp'; icon = '🌡️'; }
            else if (issue.type === 'rain') { pillClass = 'pill-rain'; icon = '🌧️'; }
            else if (issue.type === 'lux') { pillClass = 'pill-lux'; icon = '☁️'; }

            return `<span class="anomaly-pill ${pillClass}">${icon} ${issue.name} (${issue.value})</span>`;
        }).join('');

        const detailsHtml = (item.issues || []).map(issue => {
            return `<li class="anomaly-detail-item">${issue.desc || issue.name}</li>`;
        }).join('');

        return `
            <div class="anomaly-card">
                <div class="anomaly-card-top">
                    <div class="anomaly-date-group">
                        <span class="anomaly-doc-tag">${docBadge}</span>
                        <span class="anomaly-date">${dateStr}</span>
                    </div>
                    <div class="anomaly-badges">
                        ${badgesHtml}
                    </div>
                </div>
                <ul class="anomaly-details-list">
                    ${detailsHtml}
                </ul>
            </div>
        `;
    }).join('');
}

// Simulates a data fetch for testing and previewing UI locally
function simulateData() {
    setTimeout(() => {
        const mockData = {
            pondDetails: {
                pondId: '01.02.12',
                species: 'L. vannamei',
                line: 'Line A (Fast Growth)',
                stockSource: 'SPF Hatchery',
                doc: 52,
                sampleDate: '26 Aug 2026',
                sampleABW: 14.85,
                sampleAWG: 2.20,
                sr: 87.5,
                sampleFCR: 1.22
            },
            raw: {
                timestamp: new Date().toISOString(),
                do: 4.2,
                ph: 7.85,
                waterTemp: 29.8,
                lux: 86500,
                airTemp: 31.4
            },
            analysis: {
                do: { status: "Good", message: "DO: 4.20 ppm", warning: false, value: 4.2 },
                ph: { message: "Swing: 0.25 (Normal)", warning: false },
                temperature: { message: "Swing: 1.40°C (Normal)", warning: false },
                weatherLux: { message: "High Algae Activity", warning: false, avgToday: 86500, avgYest: 84000 },
                weatherRain: { message: "Today's rain: 0.00mm", warning: false, sumToday: 0 },
                feedingAction: "Normal Feed - Optimal Conditions."
            },
            history: {
                totalAbnormalDays: 3,
                tempExtremes: {
                    min: {
                        value: 24.6,
                        doc: 38,
                        dateStr: "12 Aug 2026",
                        timeStr: "05:45 AM"
                    },
                    max: {
                        value: 33.4,
                        doc: 47,
                        dateStr: "21 Aug 2026",
                        timeStr: "03:15 PM"
                    }
                },
                abnormalities: [
                    {
                        doc: 48,
                        date: "22 Aug 2026",
                        issues: [
                            {
                                type: "do",
                                name: "Low DO",
                                value: "2.45 ppm",
                                desc: "Critical DO drop at 5:00 AM below 3.0 ppm (Recorded 2.45 ppm). Aerator boost required."
                            },
                            {
                                type: "ph",
                                name: "High pH Swing",
                                value: "0.68",
                                desc: "Daytime pH swing exceeded 0.5 (5 AM: 7.42 vs 5 PM: 8.10), indicating dense algae bloom."
                            }
                        ]
                    },
                    {
                        doc: 34,
                        date: "08 Aug 2026",
                        issues: [
                            {
                                type: "temp",
                                name: "Thermal Stress",
                                value: "2.40°C swing",
                                desc: "Water temperature fluctuated > 2.0°C between night min (27.1°C) and afternoon peak (29.5°C)."
                            },
                            {
                                type: "rain",
                                name: "Heavy Rainfall",
                                value: "54.5 mm",
                                desc: "Daily rainfall exceeded 40 mm threshold (Recorded 54.5 mm), risking salinity drop and thermocline."
                            }
                        ]
                    },
                    {
                        doc: 21,
                        date: "26 Jul 2026",
                        issues: [
                            {
                                type: "rain",
                                name: "Continuous Rain (7-Day)",
                                value: "138.0 mm / 7d",
                                desc: "Cumulative rainfall exceeded 120 mm over 7 consecutive days (Total 138.0 mm)."
                            },
                            {
                                type: "do",
                                name: "Low DO",
                                value: "2.85 ppm",
                                desc: "Morning DO dropped to 2.85 ppm due to prolonged cloud cover and rain runoff."
                            }
                        ]
                    }
                ]
            }
        };
        populateUI(mockData);
        hideLoader();
    }, 500);
}
