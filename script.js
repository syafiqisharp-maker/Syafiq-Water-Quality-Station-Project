// IMPORTANT: Replace this URL with your deployed Google Apps Script Web App URL
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyCtF5PgLoT3P0MVc3emVybCk7hpfHZtswoxaa0jjIXN3usq0e5Lghd0k0yzPzk3gqg5g/exec';

document.addEventListener('DOMContentLoaded', () => {
    fetchData();
});

async function fetchData() {
    try {
        if (GAS_WEB_APP_URL === 'YOUR_DEPLOYED_WEB_APP_URL_HERE') {
            console.warn("GAS_WEB_APP_URL is not set. Simulating data for UI demonstration.");
            simulateData();
            return;
        }

        const response = await fetch(GAS_WEB_APP_URL);
        const result = await response.json();

        if (result.status === 'success') {
            populateUI(result.data);
        } else {
            console.error("Backend Error:", result.message);
            alert("Failed to load dashboard data. Check console for details.");
        }
    } catch (error) {
        console.error("Fetch Error:", error);
    } finally {
        if (GAS_WEB_APP_URL !== 'YOUR_DEPLOYED_WEB_APP_URL_HERE') {
            hideLoader();
        }
    }
}

function hideLoader() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

function populateUI(data) {
    const { analysis, raw } = data;

    // --- Top Section: WQ Status ---
    const wqGrid = document.getElementById('wq-status-grid');
    wqGrid.innerHTML = `
        <div class="status-item">
            <h3>Dissolved Oxygen (DO)</h3>
            <div class="value ${analysis.do.warning ? (analysis.do.status === 'Danger' ? 'text-danger' : 'text-warning') : 'text-good'}">
                ${analysis.do.message}
            </div>
        </div>
        <div class="status-item">
            <h3>pH Swing</h3>
            <div class="value ${analysis.ph.warning ? 'text-danger' : 'text-good'}">
                ${analysis.ph.message}
            </div>
        </div>
        <div class="status-item">
            <h3>Temperature Swing</h3>
            <div class="value ${analysis.temperature.warning ? 'text-danger' : 'text-good'}">
                ${analysis.temperature.message}
            </div>
        </div>
    `;

    // --- Middle Section: Weather & Feed ---
    const weatherContainer = document.getElementById('weather-status-container');
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

    const feedContainer = document.getElementById('feeding-action-container');
    feedContainer.textContent = analysis.feedingAction;
    if (analysis.feedingAction.includes("Reduce/Cut")) {
        feedContainer.classList.add('action-warning');
    } else {
        feedContainer.classList.remove('action-warning');
    }

    // --- Bottom Section: Raw Stats ---
    const rawGrid = document.getElementById('raw-stats-grid');
    rawGrid.innerHTML = `
        <div class="stat-card">
            <div class="label">DO</div>
            <div class="val">${raw.do !== undefined ? parseFloat(raw.do).toFixed(2) : '-'}</div>
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

// Simulates a data fetch to show off the UI before the GAS is hooked up.
function simulateData() {
    setTimeout(() => {
        const mockData = {
            raw: { do: 3.8, ph: 7.9, waterTemp: 29.5, lux: 85000, airTemp: 31.0 },
            analysis: {
                do: { status: "Caution", message: "DO: 3.8 (Caution)", warning: true, value: 3.8 },
                ph: { message: "Swing: 0.20 (Normal)", warning: false },
                temperature: { message: "Swing: 1.50°C (Normal)", warning: false },
                weatherLux: { message: "Normal", warning: false, avgToday: 80000, avgYest: 85000 },
                weatherRain: { message: "Today's rain: 10.00mm", warning: false, sumToday: 10 },
                feedingAction: "Reduce/Cut Feed - Shrimp metabolism slowed."
            }
        };
        populateUI(mockData);
        hideLoader();
    }, 1200);
}
