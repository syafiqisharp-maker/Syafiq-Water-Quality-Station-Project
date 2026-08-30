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

    // --- Top Section: WQ Status (Daily Min, Max, Δ) ---
    const wqGrid = document.getElementById('wq-status-grid');
    if (wqGrid && analysis) {
        const temp = analysis.temperature || {};
        const doData = analysis.do || {};
        const phData = analysis.ph || {};

        const formatVal = (val, decimals, suffix = '') => {
            if (val === null || val === undefined || val === '' || isNaN(parseFloat(val))) return '-';
            return `${parseFloat(val).toFixed(decimals)}${suffix}`;
        };

        // Temperature Card
        const tempMinStr = formatVal(temp.min, 1, '°');
        const tempMaxStr = formatVal(temp.max, 1, '°');
        const tempDeltaStr = formatVal(temp.delta, 1, '°');
        let tempCardClass = 'wq-card';
        let tempBadgeHtml = '';

        if (temp.warning) {
            if (temp.isHighTemp && temp.isHighFluctuation) {
                tempCardClass += ' alert-danger';
                tempBadgeHtml = `<span class="wq-alert-badge badge-danger">High Temp & Swing</span>`;
            } else if (temp.isHighTemp) {
                tempCardClass += ' alert-danger';
                tempBadgeHtml = `<span class="wq-alert-badge badge-danger">&gt;33°C Alert</span>`;
            } else if (temp.isHighFluctuation) {
                tempCardClass += ' alert-warning';
                tempBadgeHtml = `<span class="wq-alert-badge badge-warning">High Swing</span>`;
            }
        }

        // Dissolved Oxygen Card
        const doMinStr = formatVal(doData.min, 1);
        const doMaxStr = formatVal(doData.max, 1);
        const doDeltaStr = formatVal(doData.delta, 1);
        let doCardClass = 'wq-card';
        let doBadgeHtml = '';

        if (doData.warning) {
            if (doData.isDanger) {
                doCardClass += ' alert-danger';
                doBadgeHtml = `<span class="wq-alert-badge badge-danger">Critical Low</span>`;
            } else {
                doCardClass += ' alert-warning';
                doBadgeHtml = `<span class="wq-alert-badge badge-warning">Low DO</span>`;
            }
        }

        // pH Card
        const phMinStr = formatVal(phData.min, 2);
        const phMaxStr = formatVal(phData.max, 2);
        const phDeltaStr = formatVal(phData.delta, 2);
        let phCardClass = 'wq-card';
        let phBadgeHtml = '';

        if (phData.warning) {
            phCardClass += ' alert-warning';
            phBadgeHtml = `<span class="wq-alert-badge badge-warning">High Swing</span>`;
        }

        wqGrid.innerHTML = `
            <!-- Temperature Card -->
            <div class="${tempCardClass}">
                <div class="wq-card-header">
                    <div class="wq-card-title-group">
                        <span class="wq-card-icon">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path>
                            </svg>
                        </span>
                        <span class="wq-card-title">Temperature</span>
                    </div>
                    ${tempBadgeHtml}
                </div>
                <div class="wq-metrics-grid">
                    <div class="wq-metric-col">
                        <span class="wq-metric-label">Min</span>
                        <span class="wq-metric-val">${tempMinStr}</span>
                    </div>
                    <div class="wq-metric-col">
                        <span class="wq-metric-label">Max</span>
                        <span class="wq-metric-val ${temp.isHighTemp ? 'val-alert' : ''}">${tempMaxStr}</span>
                    </div>
                    <div class="wq-metric-col">
                        <span class="wq-metric-label">Δ</span>
                        <span class="wq-metric-val ${temp.isHighFluctuation ? 'val-alert' : ''}">${tempDeltaStr}</span>
                    </div>
                </div>
            </div>

            <!-- Dissolved Oxygen Card -->
            <div class="${doCardClass}">
                <div class="wq-card-header">
                    <div class="wq-card-title-group">
                        <span class="wq-card-icon">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
                            </svg>
                        </span>
                        <span class="wq-card-title">Dissolved oxygen</span>
                    </div>
                    ${doBadgeHtml}
                </div>
                <div class="wq-metrics-grid">
                    <div class="wq-metric-col">
                        <span class="wq-metric-label">Min</span>
                        <span class="wq-metric-val ${doData.warning ? 'val-alert' : ''}">${doMinStr}</span>
                    </div>
                    <div class="wq-metric-col">
                        <span class="wq-metric-label">Max</span>
                        <span class="wq-metric-val">${doMaxStr}</span>
                    </div>
                    <div class="wq-metric-col">
                        <span class="wq-metric-label">Δ</span>
                        <span class="wq-metric-val">${doDeltaStr}</span>
                    </div>
                </div>
            </div>

            <!-- pH Card -->
            <div class="${phCardClass}">
                <div class="wq-card-header">
                    <div class="wq-card-title-group">
                        <span class="wq-card-icon">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M10 2v7.31L4.69 17.5A2 2 0 0 0 6.42 20.5h11.16a2 2 0 0 0 1.73-3L14 9.31V2"></path>
                                <line x1="8.5" y1="2" x2="15.5" y2="2"></line>
                                <line x1="14" y1="9" x2="10" y2="9"></line>
                            </svg>
                        </span>
                        <span class="wq-card-title">pH</span>
                    </div>
                    ${phBadgeHtml}
                </div>
                <div class="wq-metrics-grid">
                    <div class="wq-metric-col">
                        <span class="wq-metric-label">Min</span>
                        <span class="wq-metric-val">${phMinStr}</span>
                    </div>
                    <div class="wq-metric-col">
                        <span class="wq-metric-label">Max</span>
                        <span class="wq-metric-val">${phMaxStr}</span>
                    </div>
                    <div class="wq-metric-col">
                        <span class="wq-metric-label">Δ</span>
                        <span class="wq-metric-val ${phData.warning ? 'val-alert' : ''}">${phDeltaStr}</span>
                    </div>
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
            const formatSensorVal = (val, decimals, unit = '') => {
                if (val === null || val === undefined || val === '' || val === 'N/A' || isNaN(parseFloat(val))) return '-';
                return `${parseFloat(val).toFixed(decimals)}${unit ? ' ' + unit : ''}`;
            };

            const formatLuxVal = (val) => {
                if (val === null || val === undefined || val === '' || val === 'N/A' || isNaN(parseFloat(val))) return '-';
                return Math.round(parseFloat(val)).toLocaleString();
            };

            rawGrid.innerHTML = `
                <div class="stat-card">
                    <div class="label">DO</div>
                    <div class="val">${formatSensorVal(raw.do, 2, 'ppm')}</div>
                </div>
                <div class="stat-card">
                    <div class="label">pH</div>
                    <div class="val">${formatSensorVal(raw.ph, 2)}</div>
                </div>
                <div class="stat-card">
                    <div class="label">Water Temp</div>
                    <div class="val">${formatSensorVal(raw.waterTemp, 1, '°C')}</div>
                </div>
                <div class="stat-card">
                    <div class="label">Lux</div>
                    <div class="val">${formatLuxVal(raw.lux)}</div>
                </div>
                <div class="stat-card">
                    <div class="label">Air Temp</div>
                    <div class="val">${formatSensorVal(raw.airTemp, 1, '°C')}</div>
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
                temperature: {
                    min: 29.6,
                    max: 32.9,
                    delta: 3.3,
                    warning: true,
                    isHighTemp: false,
                    isHighFluctuation: true,
                    status: "Warning",
                    message: "High Swing: 3.3°C (≥3.0°C)"
                },
                do: {
                    min: 4.6,
                    max: 6.7,
                    delta: 2.1,
                    warning: false,
                    isDanger: false,
                    status: "Good",
                    message: "DO Min: 4.6 ppm (Good)"
                },
                ph: {
                    min: 7.14,
                    max: 7.57,
                    delta: 0.43,
                    warning: false,
                    status: "Normal",
                    message: "Swing: 0.43 (Normal)"
                },
                weatherLux: { message: "High Algae Activity", warning: false, avgToday: 86500, avgYest: 84000 },
                weatherRain: { message: "Today's rain: 0.00mm", warning: false, sumToday: 0 },
                feedingAction: "Reduce/Cut Feed - Water quality/weather alert active."
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
