/**
 * =========================================================================
 * AQUACULTURE WATER QUALITY DASHBOARD - FRONTEND ENGINE
 * Architecture: Clean Architecture / Modular Component Renderers (SOLID / ES6+)
 * Performance: Stale-While-Revalidate Instant Caching & Batch DOM Rendering
 * =========================================================================
 */

'use strict';

// =========================================================================
// 1. CONFIGURATION & CONSTANTS
// =========================================================================

/**
 * System-wide operational settings
 */
const AppConfig = Object.freeze({
    GAS_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbxg0g4k_1wqGGHOCFoSVETFBTJTipT-X7UJKlggySfUGqxGGE54I9wqMPe96NF8TsSIRA/exec',
    CACHE_KEY: 'AQUA_WQS_DASHBOARD_CACHE_V3',
    CACHE_STALE_THRESHOLD_MS: 10 * 60 * 1000, // 10 minutes cache freshness window
    INITIAL_FETCH_TIMEOUT_MS: 8000, // 8s timeout for initial blocking load
    MANUAL_FETCH_TIMEOUT_MS: 12000, // 12s timeout for manual/background refresh
    AUTO_REFRESH_INTERVAL_MS: 60 * 1000, // 1 minute background poll
    ANIMATION_DELAY_MS: 300
});

/**
 * Aquaculture Domain Thresholds & Farm Operational Advisories
 * (Single Source of Truth for all Alert & Advisory Logic)
 */
class AquacultureConfig {
    // Dissolved Oxygen Thresholds (ppm)
    static DO = {
        CRITICAL_LOW: 3.0,
        CAUTION_LOW: 4.0,
        OPTIMAL_MIN: 5.0,
        WEEKLY_DROP_ALERT: -0.40,
        WEEKLY_RECOVERY: 0.40,
        ADVISORIES: {
            CRITICAL: '🚨 Critical DO Baseline - Close monitoring, increase water exchange, partial harvest, and standby oxygen powder.',
            BORDERLINE: '⚠️ Borderline morning DO - Carefull on feeding amount.',
            DECLINING: '⚠️ DO baseline declining — Organic sludge accumulation suspected; schedule central drain flushing.',
            RECOVERING: '📈 Strong oxygen recovery — Aerator adjustments & sludge management effective.',
            OPTIMAL: '✅ Healthy morning DO baseline — Aeration capacity good for pond biomass.',
            MORNING_CLIMB: '☀️ Morning photosynthesis climb (healthy)',
            MORNING_DROP: '⚠️ Morning DO drop — Check paddlewheels!'
        }
    };

    // pH Thresholds
    static PH = {
        CRITICAL_HIGH: 8.5,
        CRITICAL_LOW: 7.3,
        MAX_SAFE_SWING: 0.5,
        SEVERE_SWING: 1.0,
        WEEKLY_BLOOM_RISE: 0.30,
        WEEKLY_CRASH_DROP: -0.30,
        ADVISORIES: {
            BLOOM_RISING: '📈 Algae bloom thickening — Monitor afternoon pH peak & consider light shading or water exchange.',
            CRASH_DECLINING: '📉 Alkalinity depletion / Bloom crash — Check total alkalinity & apply lime / dolomite.',
            HIGH_ALERT: '⚠️ High pH baseline — Risk of toxic free ammonia (NH₃); adjust organic carbon / probiotics.',
            LOW_ALERT: '⚠️ Low pH baseline — Acidic stress; apply lime and check alkalinity.',
            OPTIMAL: '✅ Optimal pH balance — Pond buffering capacity & phytoplankton density stable.'
        }
    };

    // Water Temperature Thresholds (°C)
    static WATER_TEMP = {
        STRESS_HIGH: 33.0,
        STRESS_LOW: 27.0,
        OPTIMAL_MIN: 28.5,
        OPTIMAL_MAX: 31.0,
        MAX_SAFE_SWING: 3.0,
        WEEKLY_COOLING: -1.2,
        WEEKLY_WARMING: 1.2,
        ADVISORIES: {
            COOLING: '📉 Sustained cooling trend — Carefull on feeding amount.',
            WARMING: '🔥 Warming trend — Shrimp metabolism & oxygen demand elevated; monitor feed consumption speed.',
            STRESS_HIGH: '🚨 Thermal stress threshold exceeded — Cut feeding.',
            STRESS_LOW: '❄️ Low water temperature — Reduced digestive enzyme activity; reduce feed.',
            OPTIMAL: '✅ Optimal thermal stability — Normal feeding amount.'
        }
    };

    // Sunlight Irradiance (Lux)
    static LUX = {
        INTENSE: 110000,
        CLEAR: 85000,
        PARTLY_CLOUDY: 55000,
        OVERCAST: 20000,
        NIGHT: 5000
    };

    // Rainfall Thresholds (mm)
    static RAINFALL = {
        CRITICAL_DAILY: 40.0,   // Severe storm / heavy danger threshold (mm/day)
        CAUTION_DAILY: 20.0,    // Moderate shower / caution threshold (mm/day)
        CRITICAL_7DAY: 120.0,   // Cumulative 7-day danger threshold (mm)
        CAUTION_7DAY: 100.0     // Cumulative 7-day caution threshold (mm)
    };

    /**
     * Synchronizes in-memory thresholds with Code.gs AlertConfig received via API
     * @param {Object} serverConfig - data.config from Code.gs
     */
    static syncFromBackend(serverConfig) {
        if (!serverConfig || typeof serverConfig !== 'object') return;
        try {
            if (serverConfig.DO) Object.assign(AquacultureConfig.DO, serverConfig.DO);
            if (serverConfig.PH) Object.assign(AquacultureConfig.PH, serverConfig.PH);
            if (serverConfig.WATER_TEMP) Object.assign(AquacultureConfig.WATER_TEMP, serverConfig.WATER_TEMP);
            if (serverConfig.LUX) Object.assign(AquacultureConfig.LUX, serverConfig.LUX);
            if (serverConfig.RAINFALL) Object.assign(AquacultureConfig.RAINFALL, serverConfig.RAINFALL);
            console.log('[AquacultureConfig] Thresholds synchronized from Code.gs Single Source of Truth');
        } catch (e) {
            console.warn('[AquacultureConfig] Threshold sync error:', e);
        }
    }
}


// =========================================================================
// 2. PURE FORMATTING & UTILITY SERVICES
// =========================================================================

class Formatters {
    static number(val, decimals = 1, suffix = '') {
        if (val === null || val === undefined || val === '' || isNaN(parseFloat(val))) return '-';
        return `${parseFloat(val).toFixed(decimals)}${suffix}`;
    }

    static integer(val) {
        if (val === null || val === undefined || val === '' || isNaN(parseInt(val, 10))) return '-';
        return parseInt(val, 10).toLocaleString();
    }

    static percentage(val, decimals = 1) {
        if (val === null || val === undefined || val === '' || isNaN(parseFloat(val))) return '-';
        return `${parseFloat(val).toFixed(decimals)}%`;
    }

    static luxCondition(luxVal) {
        if (luxVal === null || luxVal === undefined || isNaN(luxVal)) {
            return { statement: 'Pending Lux', badgeClass: 'badge-lux-overcast', icon: '☁️', sparkColor: '#94a3b8' };
        }
        const val = parseFloat(luxVal);
        if (val > AquacultureConfig.LUX.INTENSE) {
            return { statement: 'Intense Sunlight', badgeClass: 'badge-lux-intense', icon: '☀️', sparkColor: '#eab308' };
        } else if (val > AquacultureConfig.LUX.CLEAR) {
            return { statement: 'Clear sky', badgeClass: 'badge-lux-clear', icon: '🌤️', sparkColor: '#0284c7' };
        } else if (val > AquacultureConfig.LUX.PARTLY_CLOUDY) {
            return { statement: 'Partly cloudy', badgeClass: 'badge-lux-partly', icon: '⛅', sparkColor: '#10b981' };
        } else if (val > AquacultureConfig.LUX.OVERCAST) {
            return { statement: 'Moderate Light', badgeClass: 'badge-lux-partly', icon: '⛅', sparkColor: '#10b981' };
        } else if (val > AquacultureConfig.LUX.NIGHT) {
            return { statement: 'Overcast', badgeClass: 'badge-lux-overcast', icon: '☁️', sparkColor: '#64748b' };
        } else {
            return { statement: 'Low Light / Night', badgeClass: 'badge-lux-night', icon: '🌙', sparkColor: '#6366f1' };
        }
    }

    static trendDelta(trendObj, unit = '', decimals = 2) {
        if (!trendObj) {
            return {
                html: `<span class="trend-indicator trend-stable"><span class="trend-arrow">▬</span><span class="trend-delta">Stable / hr</span></span>`,
                direction: 'stable',
                delta1h: 0
            };
        }
        const rate = parseFloat(trendObj.ratePerHour || trendObj.delta1h || 0);
        const direction = trendObj.direction || (rate > 0 ? 'up' : (rate < 0 ? 'down' : 'stable'));
        const arrow = direction === 'up' ? '▲' : (direction === 'down' ? '▼' : '▬');
        const sign = rate > 0 ? '+' : (rate < 0 ? '-' : '±');
        const formattedRate = Math.abs(rate).toFixed(decimals);
        const unitStr = unit ? ` ${unit}` : '';

        return {
            html: `
                <span class="trend-indicator trend-${direction}">
                    <span class="trend-arrow">${arrow}</span>
                    <span class="trend-delta">${sign}${formattedRate}${unitStr} / hr</span>
                </span>
            `,
            direction,
            rate
        };
    }
}


// =========================================================================
// 3. SVG SPARKLINE RENDERING SERVICE (Native, Lightweight <1ms)
// =========================================================================

class SvgSparklineService {
    /**
     * Renders a 12-hour continuous SVG sparkline with High/Low point labels
     */
    static renderContinuous(data, colorHex = '#10b981', gradId = 'grad-default', height = 50, width = 220, formatFn = null) {
        if (!data || !Array.isArray(data) || data.length < 2) {
            return `<svg class="mini-sparkline" viewBox="0 0 ${width} ${height}"><line x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="3 3" /></svg>`;
        }

        const paddingX = 14;
        const paddingTop = 11;
        const paddingBottom = 11;
        const minVal = Math.min(...data);
        const maxVal = Math.max(...data);
        const range = (maxVal - minVal) === 0 ? 1 : (maxVal - minVal);
        const usableHeight = height - paddingTop - paddingBottom;
        const usableWidth = width - (paddingX * 2);

        const points = data.map((val, idx) => {
            const x = paddingX + (idx / (data.length - 1)) * usableWidth;
            const y = paddingTop + usableHeight - ((val - minVal) / range) * usableHeight;
            return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), val, idx };
        });

        const polylineStr = points.map(p => `${p.x},${p.y}`).join(' ');
        const areaStr = `${polylineStr} ${usableWidth + paddingX},${height} ${paddingX},${height}`;
        const lastPoint = points[points.length - 1];

        // Find min and max point indices
        const maxIdx = data.indexOf(maxVal);
        const minIdx = data.indexOf(minVal);
        const maxPoint = points[maxIdx];
        const minPoint = points[minIdx];

        const defaultFmt = v => Number(v).toFixed(2);
        const fmt = (typeof formatFn === 'function') ? formatFn : defaultFmt;

        // Labels and highlight circles for Max and Min points
        let labelsSvg = '';
        let circlesSvg = '';

        if (maxPoint) {
            const maxAnchor = maxIdx === 0 ? 'start' : (maxIdx === data.length - 1 ? 'end' : 'middle');
            const maxValStr = fmt(maxVal);
            const labelY = Math.max(9, maxPoint.y - 5);
            labelsSvg += `<text x="${maxPoint.x}" y="${labelY}" text-anchor="${maxAnchor}" class="sparkline-point-label sparkline-max-label">${maxValStr}</text>`;
            circlesSvg += `<circle cx="${maxPoint.x}" cy="${maxPoint.y}" r="3" fill="${colorHex}" stroke="#ffffff" stroke-width="1.5" />`;
        }

        if (minPoint && minVal !== maxVal) {
            const minAnchor = minIdx === 0 ? 'start' : (minIdx === data.length - 1 ? 'end' : 'middle');
            const minValStr = fmt(minVal);
            const labelY = Math.min(height - 2, minPoint.y + 11);
            labelsSvg += `<text x="${minPoint.x}" y="${labelY}" text-anchor="${minAnchor}" class="sparkline-point-label sparkline-min-label">${minValStr}</text>`;
            if (minIdx !== maxIdx) {
                circlesSvg += `<circle cx="${minPoint.x}" cy="${minPoint.y}" r="3" fill="${colorHex}" stroke="#ffffff" stroke-width="1.5" />`;
            }
        }

        // Always show the current/latest point circle if not already covered
        if (lastPoint && lastPoint.idx !== maxIdx && lastPoint.idx !== minIdx) {
            circlesSvg += `<circle cx="${lastPoint.x}" cy="${lastPoint.y}" r="3" fill="${colorHex}" stroke="#ffffff" stroke-width="1.5" />`;
        }

        return `
            <svg class="mini-sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${colorHex}" stop-opacity="0.28" />
                        <stop offset="100%" stop-color="${colorHex}" stop-opacity="0.0" />
                    </linearGradient>
                </defs>
                <polygon points="${areaStr}" fill="url(#${gradId})" />
                <polyline points="${polylineStr}" fill="none" stroke="${colorHex}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                ${circlesSvg}
                ${labelsSvg}
            </svg>
        `;
    }

    /**
     * Renders a 7-day discrete daily sparkline with circular markers and inline High/Low labels
     */
    static renderDiscrete7Day(data, colorHex = '#10b981', gradId = 'weekly-grad-default', height = 52, width = 240, formatFn = null) {
        if (!data || !Array.isArray(data) || data.length < 2) {
            return `<svg class="weekly-sparkline" viewBox="0 0 ${width} ${height}"><line x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="3 3" /></svg>`;
        }

        const paddingX = 14;
        const paddingTop = 12;
        const paddingBottom = 12;
        const minVal = Math.min(...data);
        const maxVal = Math.max(...data);
        const range = (maxVal - minVal) === 0 ? 1 : (maxVal - minVal);
        const usableHeight = height - paddingTop - paddingBottom;
        const usableWidth = width - (paddingX * 2);

        const points = data.map((val, idx) => {
            const x = paddingX + (idx / (data.length - 1)) * usableWidth;
            const y = paddingTop + usableHeight - ((val - minVal) / range) * usableHeight;
            return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), val, idx };
        });

        const polylineStr = points.map(p => `${p.x},${p.y}`).join(' ');
        const areaStr = `${polylineStr} ${usableWidth + paddingX},${height} ${paddingX},${height}`;
        const circles = points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3.2" fill="${colorHex}" stroke="#ffffff" stroke-width="1.8" />`).join('');

        // Find min and max point indices
        const maxIdx = data.indexOf(maxVal);
        const minIdx = data.indexOf(minVal);
        const maxPoint = points[maxIdx];
        const minPoint = points[minIdx];

        const defaultFmt = v => Number(v).toFixed(2);
        const fmt = (typeof formatFn === 'function') ? formatFn : defaultFmt;

        // Labels for Max and Min points
        let labelsSvg = '';
        if (maxPoint) {
            const maxAnchor = maxIdx === 0 ? 'start' : (maxIdx === data.length - 1 ? 'end' : 'middle');
            const maxValStr = fmt(maxVal);
            const labelY = Math.max(9, maxPoint.y - 5);
            labelsSvg += `<text x="${maxPoint.x}" y="${labelY}" text-anchor="${maxAnchor}" class="sparkline-point-label sparkline-max-label">${maxValStr}</text>`;
        }

        if (minPoint && minVal !== maxVal) {
            const minAnchor = minIdx === 0 ? 'start' : (minIdx === data.length - 1 ? 'end' : 'middle');
            const minValStr = fmt(minVal);
            const labelY = Math.min(height - 2, minPoint.y + 11);
            labelsSvg += `<text x="${minPoint.x}" y="${labelY}" text-anchor="${minAnchor}" class="sparkline-point-label sparkline-min-label">${minValStr}</text>`;
        }

        return `
            <svg class="weekly-sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${colorHex}" stop-opacity="0.25" />
                        <stop offset="100%" stop-color="${colorHex}" stop-opacity="0.0" />
                    </linearGradient>
                </defs>
                <polygon points="${areaStr}" fill="url(#${gradId})" />
                <polyline points="${polylineStr}" fill="none" stroke="${colorHex}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
                ${circles}
                ${labelsSvg}
            </svg>
        `;
    }

    /**
     * Renders a live 24-hour feed barrel sparkline (30-min moving mean) with dual Y-axis:
     * - Left Y-axis: Distance in cm (30 cm Full to 69 cm Empty)
     * - Right Y-axis: Feed weight range bands: (100-125), (75-100), (50-75), (25-50), (0-25)
     * - X-axis: Rolling 2-digit hours (e.g. 15, 19, 23, 03, 07, 11, 15)
     * - Supports gaps for telemetry dropouts
     */
    static renderLive24HourFeedSparkline(liveSparkline24h, width = 640, height = 195) {
        const points = (liveSparkline24h && Array.isArray(liveSparkline24h.points)) ? liveSparkline24h.points : [];
        if (points.length === 0) {
            return `<div style="text-align:center;padding:2rem;color:#94a3b8;font-size:0.85rem;">No 24-hour feed telemetry available</div>`;
        }

        const paddingLeft = 56;
        const paddingRight = 78;
        const paddingTop = 26;
        const paddingBottom = 32;
        const maxKg = 125.0;
        const usableWidth = width - paddingLeft - paddingRight;
        const usableHeight = height - paddingTop - paddingBottom;
        const baseY = paddingTop + usableHeight;

        // 1. Gridlines and Dual Y-Axis Labels
        const gridKgSteps = [125, 100, 75, 50, 25, 0];
        let gridSvg = '';

        // Column Titles
        gridSvg += `<text x="${paddingLeft - 8}" y="${paddingTop - 11}" text-anchor="end" font-size="8.5" fill="#94a3b8" font-weight="700">DIST (cm)</text>`;
        gridSvg += `<text x="${width - paddingRight + 8}" y="${paddingTop - 11}" text-anchor="start" font-size="8.5" fill="#94a3b8" font-weight="700">BAND (kg)</text>`;

        gridKgSteps.forEach(stepKg => {
            const y = paddingTop + usableHeight - (stepKg / maxKg) * usableHeight;
            const isBase = (stepKg === 0);
            gridSvg += `<line x1="${paddingLeft}" y1="${y.toFixed(1)}" x2="${width - paddingRight}" y2="${y.toFixed(1)}" stroke="${isBase ? '#cbd5e1' : '#f1f5f9'}" stroke-dasharray="${isBase ? 'none' : '3 3'}" stroke-width="${isBase ? 1.2 : 1}" />`;

            // Left Axis: Distance in cm (25 cm = Full 125 kg, 69 cm = Empty 0 kg)
            const cmVal = Math.round(69.0 - (stepKg / maxKg) * (69.0 - 25.0));
            gridSvg += `<text x="${paddingLeft - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b" font-weight="600">${cmVal} cm</text>`;
        });

        // Right Axis: kg range bands centered in each 25 kg corridor
        const bands = [
            { midKg: 112.5, text: '(100-125)' },
            { midKg: 87.5, text: '(75-100)' },
            { midKg: 62.5, text: '(50-75)' },
            { midKg: 37.5, text: '(25-50)' },
            { midKg: 12.5, text: '(0-25)' }
        ];

        bands.forEach(b => {
            const yMid = paddingTop + usableHeight - (b.midKg / maxKg) * usableHeight;
            gridSvg += `<text x="${width - paddingRight + 8}" y="${(yMid + 3.5).toFixed(1)}" text-anchor="start" font-size="8.5" fill="#0284c7" font-weight="700">${b.text}</text>`;
        });

        // 2. Data Segments & Gap Handling
        const count = points.length;
        const segments = [];
        let currentSegment = [];

        points.forEach((p, idx) => {
            const x = paddingLeft + (idx / Math.max(1, count - 1)) * usableWidth;
            if (p.hasData && p.kg !== null && !isNaN(p.kg)) {
                const clampedKg = Math.max(0, Math.min(maxKg, p.kg));
                const y = paddingTop + usableHeight - (clampedKg / maxKg) * usableHeight;
                currentSegment.push({ x, y, kg: clampedKg, cm: p.cm, timeStr: p.timeStr, idx });
            } else {
                if (currentSegment.length > 0) {
                    segments.push(currentSegment);
                    currentSegment = [];
                }
            }
        });
        if (currentSegment.length > 0) {
            segments.push(currentSegment);
        }

        let pathsSvg = '';
        let dotsSvg = '';

        segments.forEach(seg => {
            if (seg.length >= 2) {
                const polylinePts = seg.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
                const areaPts = `${seg[0].x.toFixed(1)},${baseY.toFixed(1)} ${polylinePts} ${seg[seg.length - 1].x.toFixed(1)},${baseY.toFixed(1)}`;
                pathsSvg += `
                    <polygon points="${areaPts}" fill="url(#grad-feed-24h)" />
                    <polyline points="${polylinePts}" fill="none" stroke="#0284c7" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
                `;
            } else if (seg.length === 1) {
                const p = seg[0];
                dotsSvg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="#0284c7" stroke="#ffffff" stroke-width="1.5" />`;
            }
        });

        // Highlight latest valid point with live indicator
        const allValid = segments.flat();
        if (allValid.length > 0) {
            const last = allValid[allValid.length - 1];
            dotsSvg += `
                <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="4.5" fill="#0284c7" stroke="#ffffff" stroke-width="2">
                    <title>Live Level: ${last.kg} kg (${last.cm} cm) at ${last.timeStr}</title>
                </circle>
                <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="8.5" fill="none" stroke="#38bdf8" stroke-width="1.5" opacity="0.6" />
            `;
        }

        // 3. X-Axis Rolling Hour Labels
        let xLabelsSvg = '';
        const xLabels = (liveSparkline24h && Array.isArray(liveSparkline24h.xLabels)) ? liveSparkline24h.xLabels : [];
        if (xLabels.length > 0) {
            xLabels.forEach(lbl => {
                const x = paddingLeft + (lbl.index / Math.max(1, count - 1)) * usableWidth;
                xLabelsSvg += `
                    <line x1="${x.toFixed(1)}" y1="${baseY.toFixed(1)}" x2="${x.toFixed(1)}" y2="${(baseY + 4).toFixed(1)}" stroke="#cbd5e1" stroke-width="1" />
                    <text x="${x.toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="9" font-weight="600" fill="#64748b">${lbl.hour}:00</text>
                `;
            });
        }

        return `
            <svg class="feed-live-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-label="Live 24-Hour Feed Barrel Level Chart">
                <defs>
                    <linearGradient id="grad-feed-24h" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#0284c7" stop-opacity="0.30" />
                        <stop offset="100%" stop-color="#0284c7" stop-opacity="0.0" />
                    </linearGradient>
                </defs>
                ${gridSvg}
                ${pathsSvg}
                ${dotsSvg}
                ${xLabelsSvg}
            </svg>
        `;
    }

    /**
     * Renders a 14-day daily feed trend line graph with prominent circular dots and band range Y-axis
     * Theme: Emerald Green (#059669 / #10b981) for contrast with the 24h Live chart
     */
    static render14DayFeedTrendLine(past14Days, width = 640, height = 195) {
        if (!past14Days || !Array.isArray(past14Days) || past14Days.length === 0) {
            return `<div style="text-align:center;padding:2rem;color:#94a3b8;font-size:0.85rem;">No feeding data available</div>`;
        }

        const paddingLeft = 36;
        const paddingRight = 92;
        const paddingTop = 26;
        const paddingBottom = 32;
        const usableWidth = width - paddingLeft - paddingRight;
        const usableHeight = height - paddingTop - paddingBottom;
        const baseY = paddingTop + usableHeight;

        // Fixed scale: Up to 200 kg with 50 kg intermittent broad range bands
        const maxScale = 200;

        // 1. Gridlines and Right Y-Axis Range Bands (50 kg broad bands up to 200 kg)
        let gridSvg = '';
        gridSvg += `<text x="${width - paddingRight + 10}" y="${paddingTop - 11}" text-anchor="start" font-size="8.5" fill="#94a3b8" font-weight="700">FEED BAND</text>`;

        const gridSteps = [200, 150, 100, 50, 0];
        gridSteps.forEach(stepVal => {
            const y = paddingTop + usableHeight - (stepVal / maxScale) * usableHeight;
            const isBase = (stepVal === 0);
            gridSvg += `<line x1="${paddingLeft}" y1="${y.toFixed(1)}" x2="${width - paddingRight}" y2="${y.toFixed(1)}" stroke="${isBase ? '#cbd5e1' : '#f1f5f9'}" stroke-dasharray="${isBase ? 'none' : '3 3'}" stroke-width="${isBase ? 1.2 : 1}" />`;
        });

        // Right Y-axis bands: 4 broad corridors: (150-200), (100-150), (50-100), (0-50)
        const bands50 = [
            { midKg: 175, text: '(150-200)' },
            { midKg: 125, text: '(100-150)' },
            { midKg: 75,  text: '(50-100)' },
            { midKg: 25,  text: '(0-50)' }
        ];

        bands50.forEach(b => {
            const yMid = paddingTop + usableHeight - (b.midKg / maxScale) * usableHeight;
            gridSvg += `<text x="${width - paddingRight + 10}" y="${(yMid + 3.5).toFixed(1)}" text-anchor="start" font-size="9" fill="#059669" font-weight="700">${b.text}</text>`;
        });

        // 2. 14 Daily Points with Missing Telemetry Detection
        const count = past14Days.length;
        const rawPoints = past14Days.map((item, idx) => {
            const hasData = (item.hasData !== false && item.consumed !== null && item.consumed !== undefined && !isNaN(item.consumed));
            const val = hasData ? Math.max(0, item.consumed) : null;
            const x = paddingLeft + (idx / Math.max(1, count - 1)) * usableWidth;
            return {
                idx,
                x,
                y: 0,
                val,
                hasData,
                displayDate: item.displayDate,
                isToday: !!item.isToday
            };
        });

        // Compute Y positions with linear interpolation across missing telemetry intervals
        const points = rawPoints.map((p, idx) => {
            if (p.hasData) {
                const y = (p.val === 0) ? baseY : (paddingTop + usableHeight - (p.val / maxScale) * usableHeight);
                return { ...p, y };
            }

            // Find nearest previous valid and next valid point for smooth bridging
            let prevValid = null;
            for (let i = idx - 1; i >= 0; i--) {
                if (rawPoints[i].hasData) { prevValid = rawPoints[i]; break; }
            }
            let nextValid = null;
            for (let i = idx + 1; i < count; i++) {
                if (rawPoints[i].hasData) { nextValid = rawPoints[i]; break; }
            }

            let y;
            if (prevValid && nextValid) {
                const prevY = (prevValid.val === 0) ? baseY : (paddingTop + usableHeight - (prevValid.val / maxScale) * usableHeight);
                const nextY = (nextValid.val === 0) ? baseY : (paddingTop + usableHeight - (nextValid.val / maxScale) * usableHeight);
                const ratio = (p.x - prevValid.x) / (nextValid.x - prevValid.x);
                y = prevY + ratio * (nextY - prevY);
            } else if (prevValid) {
                y = (prevValid.val === 0) ? baseY : (paddingTop + usableHeight - (prevValid.val / maxScale) * usableHeight);
            } else if (nextValid) {
                y = (nextValid.val === 0) ? baseY : (paddingTop + usableHeight - (nextValid.val / maxScale) * usableHeight);
            } else {
                y = baseY;
            }
            return { ...p, y };
        });

        // 3. Path Generation: Solid curves for valid runs, Broken/Dashed lines for missing data
        let solidSegmentsSvg = '';
        let dashedSegmentsSvg = '';
        let areaSvg = '';

        // Identify contiguous valid runs for gradient fill underneath
        let currentValidRun = [];
        const validRuns = [];
        points.forEach(p => {
            if (p.hasData) {
                currentValidRun.push(p);
            } else {
                if (currentValidRun.length >= 2) {
                    validRuns.push(currentValidRun);
                }
                currentValidRun = [];
            }
        });
        if (currentValidRun.length >= 2) {
            validRuns.push(currentValidRun);
        }

        // Render gradient area under valid runs
        validRuns.forEach(run => {
            let runPathD = `M ${run[0].x.toFixed(1)} ${run[0].y.toFixed(1)}`;
            for (let i = 0; i < run.length - 1; i++) {
                const p0 = run[Math.max(0, i - 1)];
                const p1 = run[i];
                const p2 = run[i + 1];
                const p3 = run[Math.min(run.length - 1, i + 2)];

                const cp1x = p1.x + (p2.x - p0.x) / 6;
                let cp1y = p1.y + (p2.y - p0.y) / 6;
                const cp2x = p2.x - (p3.x - p1.x) / 6;
                let cp2y = p2.y - (p3.y - p1.y) / 6;
                cp1y = Math.min(baseY, Math.max(paddingTop, cp1y));
                cp2y = Math.min(baseY, Math.max(paddingTop, cp2y));

                runPathD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
            }
            const runAreaD = `${runPathD} L ${run[run.length - 1].x.toFixed(1)} ${baseY.toFixed(1)} L ${run[0].x.toFixed(1)} ${baseY.toFixed(1)} Z`;
            areaSvg += `<path d="${runAreaD}" fill="url(#grad-feed-14d)" />`;
        });

        // Draw curves between each consecutive pair [i, i+1]
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[Math.max(0, i - 1)];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[Math.min(points.length - 1, i + 2)];

            const cp1x = p1.x + (p2.x - p0.x) / 6;
            let cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            let cp2y = p2.y - (p3.y - p1.y) / 6;
            cp1y = Math.min(baseY, Math.max(paddingTop, cp1y));
            cp2y = Math.min(baseY, Math.max(paddingTop, cp2y));

            const segD = `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;

            if (p1.hasData && p2.hasData) {
                solidSegmentsSvg += `<path d="${segD}" fill="none" stroke="#059669" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />`;
            } else {
                // Missing data bridge: broken / dashed line
                dashedSegmentsSvg += `<path d="${segD}" fill="none" stroke="#10b981" stroke-width="2.2" stroke-dasharray="5 4" stroke-linecap="round" stroke-linejoin="round" opacity="0.8" />`;
            }
        }

        // 4. Prominent Circular Nodes (Solid for valid feed, Hollow/Dashed for missing data)
        let dotsSvg = '';
        let xLabelsSvg = '';

        points.forEach(p => {
            if (p.hasData) {
                const hasFeed = p.val > 0;
                const dotColor = p.isToday ? '#059669' : (hasFeed ? '#10b981' : '#94a3b8');
                const dotR = p.isToday ? 6.5 : (hasFeed ? 5.5 : 4.0);

                if (p.isToday) {
                    dotsSvg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="10" fill="none" stroke="#10b981" stroke-width="1.8" opacity="0.6" />`;
                }

                dotsSvg += `
                    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${dotR}" fill="${dotColor}" stroke="#ffffff" stroke-width="2.2">
                        <title>${p.displayDate}: ~${p.val} kg estimated (${Math.round(p.val / 25)} bags)</title>
                    </circle>
                `;
            } else {
                // Missing Telemetry: Hollow circular dot with dashed ring
                dotsSvg += `
                    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.8" stroke-dasharray="2.5 2">
                        <title>${p.displayDate}: No telemetry / Sensor offline</title>
                    </circle>
                `;
            }

            // X-Axis Date label
            const labelColor = p.isToday ? '#059669' : (p.hasData ? '#64748b' : '#94a3b8');
            const labelWeight = p.isToday ? '800' : (p.hasData ? '600' : '500');
            const dayPart = p.displayDate ? p.displayDate.split(' ')[0] : (p.idx + 1);
            xLabelsSvg += `
                <line x1="${p.x.toFixed(1)}" y1="${baseY.toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${(baseY + 4).toFixed(1)}" stroke="#cbd5e1" stroke-width="1" />
                <text x="${p.x.toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="9" font-weight="${labelWeight}" fill="${labelColor}">
                    ${p.isToday ? 'Today' : dayPart}
                </text>
            `;
        });

        return `
            <svg class="feed-trend-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-label="14-Day Daily Feed Trend Chart">
                <defs>
                    <linearGradient id="grad-feed-14d" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#059669" stop-opacity="0.25" />
                        <stop offset="100%" stop-color="#059669" stop-opacity="0.0" />
                    </linearGradient>
                </defs>
                ${gridSvg}
                ${areaSvg}
                ${solidSegmentsSvg}
                ${dashedSegmentsSvg}
                ${dotsSvg}
                ${xLabelsSvg}
            </svg>
        `;
    }

    /**
     * Legacy adapter for backward compatibility
     */
    static renderDiscrete14DayColumns(past14Days, colorHex = '#0284c7', width = 640, height = 150) {
        return SvgSparklineService.render14DayFeedTrendLine(past14Days, width, height);
    }
}


// =========================================================================
// 4. COMPONENT RENDERERS (Modular UI Separation)
// =========================================================================

/**
 * 4.1 Pond Identity & Weekly Sampling Metrics
 */
class PondDetailsRenderer {
    static render(pondDetails) {
        const pd = pondDetails || {};

        const pondBadgeEl = document.getElementById('pond-id-badge');
        if (pondBadgeEl) pondBadgeEl.textContent = pd.pondId || '01.02.12';

        const speciesEl = document.getElementById('pond-species');
        if (speciesEl) speciesEl.textContent = pd.species || 'L. vannamei';

        const lineEl = document.getElementById('pond-line');
        if (lineEl) lineEl.textContent = pd.line || '-';

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
        if (sampleAbwEl) sampleAbwEl.textContent = Formatters.number(pd.sampleABW, 2, ' g');

        const sampleAwgEl = document.getElementById('sample-awg');
        if (sampleAwgEl) sampleAwgEl.textContent = Formatters.number(pd.sampleAWG, 2, ' g/wk');

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

        const sampleBiomassEl = document.getElementById('sample-biomass');
        if (sampleBiomassEl) {
            if (pd.biomass !== null && pd.biomass !== undefined && pd.biomass !== '') {
                const numBio = typeof pd.biomass === 'number' ? pd.biomass : parseFloat(String(pd.biomass).replace(/[^\d.-]/g, ''));
                if (!isNaN(numBio)) {
                    sampleBiomassEl.textContent = `${Math.round(numBio).toLocaleString('en-US')} kg`;
                } else {
                    sampleBiomassEl.textContent = '-';
                }
            } else {
                sampleBiomassEl.textContent = '-';
            }
        }

        const sampleFcrEl = document.getElementById('sample-fcr');
        if (sampleFcrEl) sampleFcrEl.textContent = Formatters.number(pd.sampleFCR, 2);
    }
}

/**
 * 4.2 Top Section: Daily Fluctuations (Min, Max, Δ)
 */
class DailyWqRenderer {
    static render(analysis, raw) {
        const grid = document.getElementById('wq-status-grid');
        if (!grid) return;

        const an = analysis || {};
        const temp = an.temperature || {};
        const doData = an.do || {};
        const phData = an.ph || {};

        const rawTemp = raw && raw.waterTemp !== undefined ? parseFloat(raw.waterTemp) : 31.8;
        const tempMin = (temp.min !== undefined && temp.min !== null) ? temp.min : (rawTemp ? (rawTemp - 2.1).toFixed(1) : 29.7);
        const tempMax = (temp.max !== undefined && temp.max !== null) ? temp.max : (rawTemp ? rawTemp.toFixed(1) : 31.8);
        const tempDelta = (temp.delta !== undefined && temp.delta !== null) ? temp.delta : (parseFloat(tempMax) - parseFloat(tempMin)).toFixed(1);

        const rawDo = raw && raw.do !== undefined ? parseFloat(raw.do) : 5.25;
        const doMin = (doData.min !== undefined && doData.min !== null) ? doData.min : (doData.value !== undefined ? doData.value : (rawDo ? (rawDo - 0.45).toFixed(2) : 4.80));
        const doMax = (doData.max !== undefined && doData.max !== null) ? doData.max : (rawDo ? (rawDo + 0.25).toFixed(2) : 5.50);
        const doDelta = (doData.delta !== undefined && doData.delta !== null) ? doData.delta : (parseFloat(doMax) - parseFloat(doMin)).toFixed(2);

        const rawPh = raw && raw.ph !== undefined ? parseFloat(raw.ph) : 7.27;
        const phMin = (phData.min !== undefined && phData.min !== null) ? phData.min : (rawPh ? (rawPh - 0.08).toFixed(2) : 7.19);
        const phMax = (phData.max !== undefined && phData.max !== null) ? phData.max : (rawPh ? (rawPh + 0.09).toFixed(2) : 7.36);
        const phDelta = (phData.delta !== undefined && phData.delta !== null) ? phData.delta : (parseFloat(phMax) - parseFloat(phMin)).toFixed(2);

        // Temperature Card Evaluation
        let tempCardClass = 'wq-card';
        let tempBadgeHtml = '';
        const isHighTemp = parseFloat(tempMax) >= AquacultureConfig.WATER_TEMP.STRESS_HIGH;
        const isHighTempSwing = parseFloat(tempDelta) > AquacultureConfig.WATER_TEMP.MAX_SAFE_SWING;

        if (temp.warning || isHighTemp || isHighTempSwing) {
            if (isHighTemp && isHighTempSwing) {
                tempCardClass += ' alert-danger';
                tempBadgeHtml = `<span class="wq-alert-badge badge-danger">High Temp & Swing</span>`;
            } else if (isHighTemp) {
                tempCardClass += ' alert-danger';
                tempBadgeHtml = `<span class="wq-alert-badge badge-danger">&gt;33°C Alert</span>`;
            } else if (isHighTempSwing || temp.warning) {
                tempCardClass += ' alert-warning';
                tempBadgeHtml = `<span class="wq-alert-badge badge-warning">Thermal Stress</span>`;
            }
        }

        // DO Card Evaluation
        let doCardClass = 'wq-card';
        let doBadgeHtml = '';
        if (doData.warning || parseFloat(doMin) < AquacultureConfig.DO.CAUTION_LOW) {
            if (parseFloat(doMin) < AquacultureConfig.DO.CRITICAL_LOW) {
                doCardClass += ' alert-danger';
                doBadgeHtml = `<span class="wq-alert-badge badge-danger">Critical Low</span>`;
            } else {
                doCardClass += ' alert-warning';
                doBadgeHtml = `<span class="wq-alert-badge badge-warning">Low DO</span>`;
            }
        }

        // pH Card Evaluation
        let phCardClass = 'wq-card';
        let phBadgeHtml = '';
        if (phData.warning || parseFloat(phDelta) > AquacultureConfig.PH.MAX_SAFE_SWING) {
            phCardClass += ' alert-warning';
            phBadgeHtml = `<span class="wq-alert-badge badge-warning">High Swing</span>`;
        }

        grid.innerHTML = `
            <!-- Dissolved Oxygen Card -->
            <div class="${doCardClass}">
                <div class="wq-card-header">
                    <div class="wq-card-title-group">
                        <span class="wq-card-title">Dissolved Oxygen</span>
                    </div>
                    ${doBadgeHtml}
                </div>
                <div class="wq-metrics-grid">
                    <div class="wq-metric-col">
                        <span class="wq-metric-label">Min (Dip)</span>
                        <span class="wq-metric-val ${parseFloat(doMin) < AquacultureConfig.DO.CAUTION_LOW ? 'val-alert' : ''}">${Formatters.number(doMin, 2)}</span>
                    </div>
                    <div class="wq-metric-col">
                        <span class="wq-metric-label">Max</span>
                        <span class="wq-metric-val">${Formatters.number(doMax, 2)}</span>
                    </div>
                    <div class="wq-metric-col">
                        <span class="wq-metric-label">Δ Swing</span>
                        <span class="wq-metric-val">${Formatters.number(doDelta, 2)}</span>
                    </div>
                </div>
            </div>

            <!-- pH Level Card -->
            <div class="${phCardClass}">
                <div class="wq-card-header">
                    <div class="wq-card-title-group">
                        <span class="wq-card-title">pH Level</span>
                    </div>
                    ${phBadgeHtml}
                </div>
                <div class="wq-metrics-grid">
                    <div class="wq-metric-col">
                        <span class="wq-metric-label">Min</span>
                        <span class="wq-metric-val">${Formatters.number(phMin, 2)}</span>
                    </div>
                    <div class="wq-metric-col">
                        <span class="wq-metric-label">Max</span>
                        <span class="wq-metric-val">${Formatters.number(phMax, 2)}</span>
                    </div>
                    <div class="wq-metric-col">
                        <span class="wq-metric-label">Δ Swing</span>
                        <span class="wq-metric-val ${parseFloat(phDelta) > AquacultureConfig.PH.MAX_SAFE_SWING ? 'val-alert' : ''}">${Formatters.number(phDelta, 2)}</span>
                    </div>
                </div>
            </div>

            <!-- Water Temperature Card -->
            <div class="${tempCardClass}">
                <div class="wq-card-header">
                    <div class="wq-card-title-group">
                        <span class="wq-card-title">Water Temp</span>
                    </div>
                    ${tempBadgeHtml}
                </div>
                <div class="wq-metrics-grid">
                    <div class="wq-metric-col">
                        <span class="wq-metric-label">Min</span>
                        <span class="wq-metric-val">${Formatters.number(tempMin, 1, '°')}</span>
                    </div>
                    <div class="wq-metric-col">
                        <span class="wq-metric-label">Max</span>
                        <span class="wq-metric-val">${Formatters.number(tempMax, 1, '°')}</span>
                    </div>
                    <div class="wq-metric-col">
                        <span class="wq-metric-label">Δ Swing</span>
                        <span class="wq-metric-val ${parseFloat(tempDelta) > AquacultureConfig.WATER_TEMP.MAX_SAFE_SWING ? 'val-alert' : ''}">${Formatters.number(tempDelta, 1, '°')}</span>
                    </div>
                </div>
            </div>
        `;
    }
}

/**
 * 4.3 Feeding Action Plan & "Why?" Diagnostic Decision Engine
 */
class FeedingActionRenderer {
    /**
     * Evaluates feeding recommendation & compiles "Why?" reason items
     * Reuses already calculated metrics from analysis, raw, and weeklyMetrics
     */
    static evaluate({ analysis, raw, weeklyMetrics }) {
        const an = analysis || {};
        const temp = an.temperature || {};
        const doData = an.do || {};
        const phData = an.ph || {};
        const luxData = an.weatherLux || {};
        const rainData = an.weatherRain || {};
        const wm = weeklyMetrics || {};

        const rawDo = raw && raw.do !== undefined ? parseFloat(raw.do) : 5.25;
        const doMin = (doData.min !== undefined && doData.min !== null) ? parseFloat(doData.min) : (rawDo ? rawDo - 0.45 : 4.80);

        const rawTemp = raw && raw.waterTemp !== undefined ? parseFloat(raw.waterTemp) : 29.8;
        const tempMax = (temp.max !== undefined && temp.max !== null) ? parseFloat(temp.max) : (rawTemp || 29.8);
        const tempDelta = (temp.delta !== undefined && temp.delta !== null) ? parseFloat(temp.delta) : 1.1;

        const rawPh = raw && raw.ph !== undefined ? parseFloat(raw.ph) : 7.27;
        const phDelta = (phData.delta !== undefined && phData.delta !== null) ? parseFloat(phData.delta) : 0.12;

        const rainToday = (rainData.sumToday !== undefined && rainData.sumToday !== null) ? parseFloat(rainData.sumToday) : 0;
        const rain7d = (rainData.sum7Day !== undefined && rainData.sum7Day !== null) ? parseFloat(rainData.sum7Day) : 0;

        const hasTodayLux = luxData.avgToday !== undefined && luxData.avgToday !== null && parseFloat(luxData.avgToday) > 0;
        const luxVal = hasTodayLux
            ? parseFloat(luxData.avgToday)
            : ((luxData.avgYest !== undefined && luxData.avgYest !== null && parseFloat(luxData.avgYest) > 0) ? parseFloat(luxData.avgYest) : 60000);
        const isLuxYesterday = !hasTodayLux && luxData.avgYest !== undefined && luxData.avgYest !== null && parseFloat(luxData.avgYest) > 0;

        // Weekly Trends
        const wmDo = wm.do || {};
        const wmDoDelta = (wmDo.delta7d !== undefined && wmDo.delta7d !== null) ? parseFloat(wmDo.delta7d) : null;
        const wmDoAvg = (wmDo.avg !== undefined && wmDo.avg !== null) ? parseFloat(wmDo.avg) : null;

        const wmPh = wm.ph || {};
        const wmPhDelta = (wmPh.delta7d !== undefined && wmPh.delta7d !== null) ? parseFloat(wmPh.delta7d) : null;

        const wmTemp = wm.temperature || {};
        const wmTempDelta = (wmTemp.delta7d !== undefined && wmTemp.delta7d !== null) ? parseFloat(wmTemp.delta7d) : null;

        const criticalReasons = [];
        const cautionReasons = [];

        // --- 1. EVALUATE CRITICAL TRIGGERS (REDUCE / CUT FEED) ---
        // A. Heavy Rainfall (≥ 40 mm/day or ≥ 120 mm/7-day)
        if (rainToday >= AquacultureConfig.RAINFALL.CRITICAL_DAILY || rain7d >= AquacultureConfig.RAINFALL.CRITICAL_7DAY || (rainData && rainData.isDanger)) {
            const isDaily = rainToday >= AquacultureConfig.RAINFALL.CRITICAL_DAILY;
            criticalReasons.push({
                icon: '🌧️',
                headline: isDaily
                    ? `Heavy Rain Alert (${Formatters.number(rainToday, 1)} mm recorded today ≥ 40.0 mm)`
                    : `Severe 7-Day Cumulative Rain (${Formatters.number(rain7d, 1)} mm ≥ 120.0 mm)`,
                desc: 'Causes severe pond thermal & salinity stratification, plankton die-off, and rapid bottom DO drop.',
                tag: 'Critical Trigger'
            });
        }

        // B. Critical Low DO (< 3.0 ppm)
        if (doMin < AquacultureConfig.DO.CRITICAL_LOW || rawDo < AquacultureConfig.DO.CRITICAL_LOW) {
            const currentDoDip = Math.min(doMin, rawDo);
            criticalReasons.push({
                icon: '💧',
                headline: `Critical Low DO (${Formatters.number(currentDoDip, 2)} ppm < 3.0 ppm)`,
                desc: 'Severe hypoxic stress stops shrimp digestion. Uneaten feed dirty pond bottom.',
                tag: 'Critical Trigger'
            });
        }

        // C. Severe pH Swing (Δ > 1.0)
        if (phDelta > 1.0) {
            criticalReasons.push({
                icon: '🧪',
                headline: `Severe pH Swing (Daily Δ ${Formatters.number(phDelta, 2)} > 1.0)`,
                desc: 'Extreme daily pH swing induces shock and suppresses feeding response.',
                tag: 'Critical Trigger'
            });
        }

        // D. Extreme Water Temperature (≥ 33.0 °C)
        if (tempMax >= AquacultureConfig.WATER_TEMP.STRESS_HIGH || rawTemp >= AquacultureConfig.WATER_TEMP.STRESS_HIGH) {
            const currentMaxT = Math.max(tempMax, rawTemp);
            criticalReasons.push({
                icon: '🌡️',
                headline: `Thermal Stress Threshold (${Formatters.number(currentMaxT, 1)}°C ≥ 33.0°C)`,
                desc: 'Exceeds shrimp metabolic comfort, sharply increasing oxygen demand while slowing digestion.',
                tag: 'Critical Trigger'
            });
        }

        // --- 2. EVALUATE CAUTIONARY TRIGGERS (CAREFUL FEEDING) ---
        // A. Borderline DO Dip (3.0 - 4.0 ppm)
        if (doMin >= AquacultureConfig.DO.CRITICAL_LOW && doMin < AquacultureConfig.DO.CAUTION_LOW) {
            cautionReasons.push({
                icon: '💧',
                headline: `Borderline Morning DO (${Formatters.number(doMin, 2)} ppm)`,
                desc: 'Dissolved oxygen dropped below safe 4.0 ppm baseline during early morning hours.',
                tag: 'Caution Dip'
            });
        }

        // B. 7-Day DO Declining Trend
        if (wmDoDelta !== null && wmDoDelta <= AquacultureConfig.DO.WEEKLY_DROP_ALERT) {
            cautionReasons.push({
                icon: '📉',
                headline: `7-Day Declining DO Trend (${Formatters.number(wmDoDelta, 2)} ppm / week)`,
                desc: 'Sustained downward oxygen baseline indicates organic bottom sludge accumulation.',
                tag: 'Weekly Trend'
            });
        } else if (wmDoAvg !== null && wmDoAvg < AquacultureConfig.DO.CAUTION_LOW) {
            cautionReasons.push({
                icon: '⚠️',
                headline: `Low 7-Day Mean DO (${Formatters.number(wmDoAvg, 2)} ppm)`,
                desc: 'Average morning dissolved oxygen has remained below optimal 4.0 ppm over the past week.',
                tag: 'Weekly Trend'
            });
        }

        // C. Moderate Daily pH Swing (0.5 < Δ ≤ 1.0)
        if (phDelta > AquacultureConfig.PH.MAX_SAFE_SWING && phDelta <= 1.0) {
            cautionReasons.push({
                icon: '🧪',
                headline: `Moderate pH Swing (Daily Δ ${Formatters.number(phDelta, 2)})`,
                desc: 'Daily pH fluctuation exceeds safe 0.5 buffer limit, indicating active algal photosynthesis swing.',
                tag: 'Daily Fluctuation'
            });
        }

        // D. 7-Day pH Shift (Algae bloom or crash)
        if (wmPhDelta !== null && wmPhDelta >= AquacultureConfig.PH.WEEKLY_BLOOM_RISE) {
            cautionReasons.push({
                icon: '📈',
                headline: `7-Day Algae Bloom Thickening (pH +${Formatters.number(wmPhDelta, 2)} / week)`,
                desc: 'Phytoplankton density is multiplying rapidly; monitor afternoon pH spike and feeding.',
                tag: 'Weekly Trend'
            });
        } else if (wmPhDelta !== null && wmPhDelta <= AquacultureConfig.PH.WEEKLY_CRASH_DROP) {
            cautionReasons.push({
                icon: '📉',
                headline: `7-Day pH Decline / Bloom Crash (pH ${Formatters.number(wmPhDelta, 2)} / week)`,
                desc: 'Algae collapse or alkalinity depletion suspected; check pond alkalinity.',
                tag: 'Weekly Trend'
            });
        }

        // E. Daily Water Temp Swing (Δ > 3.0 °C)
        if (tempDelta > AquacultureConfig.WATER_TEMP.MAX_SAFE_SWING && tempMax < AquacultureConfig.WATER_TEMP.STRESS_HIGH) {
            cautionReasons.push({
                icon: '🌡️',
                headline: `Thermal Fluctuation (Daily Δ ${Formatters.number(tempDelta, 1)}°C > 3.0°C)`,
                desc: 'Wide water temperature variation disrupts feeding rhythms.',
                tag: 'Daily Fluctuation'
            });
        }

        // F. 7-Day Water Temp Trend
        if (wmTempDelta !== null && wmTempDelta <= AquacultureConfig.WATER_TEMP.WEEKLY_COOLING) {
            cautionReasons.push({
                icon: '❄️',
                headline: `7-Day Cooling Trend (${Formatters.number(wmTempDelta, 1)}°C / week)`,
                desc: 'Cooling trend lowers shrimp metabolic rate; reduce feeding if needed.',
                tag: 'Weekly Trend'
            });
        } else if (wmTempDelta !== null && wmTempDelta >= AquacultureConfig.WATER_TEMP.WEEKLY_WARMING) {
            cautionReasons.push({
                icon: '🔥',
                headline: `7-Day Warming Trend (+${Formatters.number(wmTempDelta, 1)}°C / week)`,
                desc: 'Warming trend increase shrimp oxygen demand; monitor feeding.',
                tag: 'Weekly Trend'
            });
        }

        // G. Low Sunlight / Overcast (Only alert if truly overcast / low irradiance, e.g. < 20,000 lux or backend overcast warning)
        if (luxVal < AquacultureConfig.LUX.OVERCAST || (luxData && luxData.warning)) {
            const timeLabel = isLuxYesterday ? 'Yesterday' : 'Today';
            cautionReasons.push({
                icon: '☁️',
                headline: `Low Sunlight / Overcast (${timeLabel}: ${Formatters.integer(luxVal)} lux)`,
                desc: `${timeLabel}'s low solar reduces natural oxygen generation.`,
                tag: 'Weather Condition'
            });
        }

        // H. Moderate Daily Rainfall (20.0 - 39.9 mm) or Sustained 7-Day Rain (100 - 119.9 mm)
        if (rainToday >= AquacultureConfig.RAINFALL.CAUTION_DAILY && rainToday < AquacultureConfig.RAINFALL.CRITICAL_DAILY) {
            cautionReasons.push({
                icon: '🌧️',
                headline: `Moderate Rain Alert (${Formatters.number(rainToday, 1)} mm today)`,
                desc: 'Rainfall lowers surface water temperature and suppresses feeding response; monitor feed trays.',
                tag: 'Weather Condition'
            });
        } else if (rain7d >= AquacultureConfig.RAINFALL.CAUTION_7DAY && rain7d < AquacultureConfig.RAINFALL.CRITICAL_7DAY && rainToday < AquacultureConfig.RAINFALL.CAUTION_DAILY) {
            cautionReasons.push({
                icon: '🌧️',
                headline: `7-Day Sustained Rain (${Formatters.number(rain7d, 1)} mm / week)`,
                desc: 'Prolonged rainfall lowers pond salinity and buffering capacity; reduce feeding if needed.',
                tag: 'Weekly Trend'
            });
        }

        // --- 3. DETERMINE FINAL STATUS & ACTION DIRECTIVE ---
        if (criticalReasons.length > 0) {
            return {
                level: 'critical',
                badgeText: 'Reduce / Cut Feed',
                badgeClass: 'badge-danger',
                bannerClass: 'banner-critical',
                bannerIcon: '🚨',
                title: 'REDUCE FEEDING — CRITICAL WATER QUALITY / WEATHER ALERT',
                reasons: [...criticalReasons, ...cautionReasons]
            };
        } else if (cautionReasons.length > 0) {
            return {
                level: 'caution',
                badgeText: 'Careful Feeding',
                badgeClass: 'badge-warning',
                bannerClass: 'banner-caution',
                bannerIcon: '⚠️',
                title: 'CAREFUL FEEDING — ADJUST RATION & MONITOR CLOSELY',
                reasons: cautionReasons
            };
        } else {
            return {
                level: 'optimal',
                badgeText: 'Normal Feed',
                badgeClass: 'badge-good',
                bannerClass: 'banner-optimal',
                bannerIcon: '🟢',
                title: 'NORMAL FEEDING — OPTIMAL CONDITIONS',
                reasons: [{
                    icon: '✅',
                    headline: 'All Water Quality & Weather Parameters in Safe Optimal Ranges'
                }]
            };
        }
    }

    static render(analysis, raw, weeklyMetrics) {
        const container = document.getElementById('feeding-action-container');
        if (!container) return;

        const evalResult = FeedingActionRenderer.evaluate({ analysis, raw, weeklyMetrics });

        const reasonItemsHtml = evalResult.reasons.map(r => {
            let itemClass = 'why-item why-optimal';
            let tagClass = 'why-tag why-tag-optimal';

            if (r.tag === 'Critical Trigger' || evalResult.level === 'critical') {
                if (r.tag === 'Critical Trigger') {
                    itemClass = 'why-item why-critical';
                    tagClass = 'why-tag why-tag-critical';
                } else {
                    itemClass = 'why-item why-caution';
                    tagClass = 'why-tag why-tag-caution';
                }
            } else if (evalResult.level === 'caution') {
                itemClass = 'why-item why-caution';
                tagClass = 'why-tag why-tag-caution';
            }

            return `
                <div class="${itemClass}">
                    <span class="why-item-icon">${r.icon}</span>
                    <div class="why-item-content">
                        <span class="why-item-headline">${r.headline}</span>
                        ${r.desc ? `<span class="why-item-sub">${r.desc}</span>` : ''}
                    </div>
                    ${r.tag ? `<span class="${tagClass}">${r.tag}</span>` : ''}
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <!-- Action Directive Banner -->
            <div class="feeding-banner ${evalResult.bannerClass}">
                <span class="feeding-banner-icon">${evalResult.bannerIcon}</span>
                <div class="feeding-banner-title">${evalResult.title}</div>
            </div>

            <!-- "Why?" Diagnostic Section -->
            <div class="why-container">
                <div class="why-header">
                    <div class="why-title">
                        <span>🔍 Why this recommendation?</span>
                    </div>
                    <span class="why-badge-count">${evalResult.reasons.length} ${evalResult.reasons.length === 1 ? 'Condition' : 'Conditions'}</span>
                </div>
                <div class="why-list">
                    ${reasonItemsHtml}
                </div>
            </div>
        `;
    }
}

/**
 * 4.35 Feeding Activity Renderer (Feed Barrel Sonar Telemetry)
 */
class FeedingActivityRenderer {
    static render(feedingActivity, pondDetails) {
        const container = document.getElementById('feeding-activity-container');
        if (!container) return;

        const pondIdBadge = document.getElementById('feed-pond-id');
        const targetPond = (pondDetails && pondDetails.pondId) || (feedingActivity && feedingActivity.pondId) || '01.02.12';
        if (pondIdBadge) {
            pondIdBadge.textContent = targetPond;
        }

        const fa = feedingActivity || {};
        const liveSparkline24h = fa.liveSparkline24h || { points: [], xLabels: [] };
        const past14Days = Array.isArray(fa.past14Days) && fa.past14Days.length === 14
            ? fa.past14Days
            : [];

        const live24hSvg = SvgSparklineService.renderLive24HourFeedSparkline(liveSparkline24h);
        const trend14dSvg = SvgSparklineService.render14DayFeedTrendLine(past14Days);

        container.innerHTML = `
            <!-- 1. Live 24 Hour Feed Level -->
            <div class="feed-chart-card feed-live-card">
                <div class="feed-chart-header">
                    <div class="feed-chart-title">
                        <span>📈 Live 24 Hour Feed Level</span>
                    </div>
                </div>
                <div class="feed-svg-container">
                    ${live24hSvg}
                </div>
            </div>

            <!-- 2. 14-Day Daily Feed Trend -->
            <div class="feed-chart-card feed-trend-card">
                <div class="feed-chart-header">
                    <div class="feed-chart-title">
                        <span>📊 14-Day Daily Feed Trend</span>
                    </div>
                </div>
                <div class="feed-svg-container">
                    ${trend14dSvg}
                </div>
            </div>
        `;
    }
}

/**
 * 4.4 Dedicated Weather & Sunlight Renderer
 */
class WeatherRenderer {
    /**
     * Evaluates sunlight irradiance into human-readable weather conditions & photosynthesis viability
     */
    static evaluateSunlight(luxVal) {
        const lux = (luxVal !== null && luxVal !== undefined && !isNaN(luxVal)) ? parseFloat(luxVal) : null;
        if (lux === null || lux <= 0) {
            return {
                condition: 'Pending Data',
                icon: '⏳',
                photosynthesis: 'Awaiting Data',
                levelClass: 'status-neutral'
            };
        }
        if (lux > AquacultureConfig.LUX.INTENSE) {
            return {
                condition: 'Intense Sunlight',
                icon: '☀️',
                photosynthesis: 'Intense Photosynthesis',
                levelClass: 'status-good'
            };
        }
        if (lux > AquacultureConfig.LUX.CLEAR) {
            return {
                condition: 'Clear Sky',
                icon: '☀️',
                photosynthesis: 'Optimal Photosynthesis',
                levelClass: 'status-good'
            };
        }
        if (lux > AquacultureConfig.LUX.PARTLY_CLOUDY) {
            return {
                condition: 'Partly Cloudy',
                icon: '⛅',
                photosynthesis: 'Moderate Photosynthesis',
                levelClass: 'status-moderate'
            };
        }
        if (lux > AquacultureConfig.LUX.OVERCAST) {
            return {
                condition: 'Overcast',
                icon: '☁️',
                photosynthesis: 'Weak Photosynthesis',
                levelClass: 'status-warning'
            };
        }
        return {
            condition: 'Dark / Heavy Cloud',
            icon: '🌧️',
            photosynthesis: 'Critical Light Deficit',
            levelClass: 'status-danger'
        };
    }

    /**
     * Evaluates daily rainfall accumulation into operational descriptive status & color
     */
    static evaluateRain(mmVal) {
        const mm = (mmVal !== null && mmVal !== undefined && !isNaN(mmVal)) ? parseFloat(mmVal) : 0;
        if (mm >= AquacultureConfig.RAINFALL.CRITICAL_DAILY) {
            return {
                text: 'Heavy Storm Danger',
                levelClass: 'status-danger'
            };
        }
        if (mm >= AquacultureConfig.RAINFALL.CAUTION_DAILY) {
            return {
                text: 'Moderate Rain Warning',
                levelClass: 'status-warning'
            };
        }
        if (mm > 0.1) {
            return {
                text: 'Light Rain',
                levelClass: 'status-moderate'
            };
        }
        return {
            text: 'No Rain',
            levelClass: 'status-good'
        };
    }

    static render(analysis, raw = null) {
        if (!analysis) return;
        const { weatherLux, weatherRain } = analysis;

        const weatherContainer = document.getElementById('weather-status-container');
        if (!weatherContainer) return;

        // 1. Evaluate Sunlight for Yesterday (Primary Morning Benchmark)
        const yestLux = (weatherLux && weatherLux.avgYest !== undefined) ? weatherLux.avgYest : 0;
        const yestStatus = WeatherRenderer.evaluateSunlight(yestLux);

        // 2. Evaluate Sunlight for 2 Days Ago (Trend Context)
        const twoDaysAgoLux = (weatherLux && weatherLux.avg2DaysAgo !== undefined) ? weatherLux.avg2DaysAgo : 0;
        const twoDaysAgoStatus = WeatherRenderer.evaluateSunlight(twoDaysAgoLux);

        // 3. Dynamic Evaluation for Today (Live)
        const currentHour = new Date().getHours();
        let todayStatus;

        if (currentHour < 10) {
            // Before 10:00 AM: Evaluate live instantaneous lux reading
            const liveLux = (raw && raw.lux !== undefined && raw.lux !== null) ? parseFloat(raw.lux) : 0;
            todayStatus = WeatherRenderer.evaluateSunlight(liveLux);
        } else {
            // From 10:00 AM onwards: Accumulate and evaluate daytime average
            const hasTodayAvg = weatherLux && weatherLux.avgToday !== undefined && weatherLux.avgToday > 0;
            const evaluatedTodayLux = hasTodayAvg ? weatherLux.avgToday : ((raw && raw.lux !== undefined) ? parseFloat(raw.lux) : 0);
            todayStatus = WeatherRenderer.evaluateSunlight(evaluatedTodayLux);
        }

        // 4. Evaluate Rainfall
        const rainToday = (weatherRain && weatherRain.sumToday !== undefined) ? weatherRain.sumToday : 0;
        const rainYest = (weatherRain && weatherRain.sumYest !== undefined) ? weatherRain.sumYest : 0;
        const rain2DaysAgo = (weatherRain && weatherRain.sum2DaysAgo !== undefined) ? weatherRain.sum2DaysAgo : 0;
        const rain7d = (weatherRain && weatherRain.sum7Day !== undefined) ? weatherRain.sum7Day : 0;

        const rainTodayStatus = WeatherRenderer.evaluateRain(rainToday);
        const rainYestStatus = WeatherRenderer.evaluateRain(rainYest);
        const rain2DaysAgoStatus = WeatherRenderer.evaluateRain(rain2DaysAgo);

        const isRainDanger = (weatherRain && weatherRain.isDanger) || rainToday >= AquacultureConfig.RAINFALL.CRITICAL_DAILY || rain7d >= AquacultureConfig.RAINFALL.CRITICAL_7DAY;
        const isRainWarning = isRainDanger || (weatherRain && weatherRain.warning) || rainToday >= AquacultureConfig.RAINFALL.CAUTION_DAILY || rain7d >= AquacultureConfig.RAINFALL.CAUTION_7DAY;

        weatherContainer.innerHTML = `
            <!-- Sunlight & Photosynthesis Card -->
            <div class="weather-card sunlight-card">
                <div class="weather-card-top">
                    <span class="weather-card-title">☀️ Sunlight Activity</span>
                </div>

                <!-- Primary Benchmark: Today's Live Solar Viability -->
                <div class="sunlight-hero">
                    <div class="sunlight-hero-main">
                        <span class="sunlight-hero-icon">${todayStatus.icon}</span>
                        <div class="sunlight-hero-text">
                            <div class="sunlight-hero-condition">${todayStatus.condition}</div>
                            <div class="sunlight-hero-photo ${todayStatus.levelClass}">${todayStatus.photosynthesis}</div>
                        </div>
                    </div>
                    <div class="sunlight-hero-caption">Today's Sunlight Condition (Live)</div>
                </div>

                <!-- 2-Day History Breakdown -->
                <div class="sunlight-history">
                    <div class="sunlight-row">
                        <div class="sunlight-day-info">
                            <span class="day-title">Yesterday</span>
                        </div>
                        <div class="sunlight-day-status ${yestStatus.levelClass}">
                            <span class="status-dot"></span>
                            <span class="status-name">${yestStatus.condition}</span>
                            <span class="status-sep">&bull;</span>
                            <span class="status-photo">${yestStatus.photosynthesis}</span>
                        </div>
                    </div>

                    <div class="sunlight-row">
                        <div class="sunlight-day-info">
                            <span class="day-title">2 Days Ago</span>
                        </div>
                        <div class="sunlight-day-status ${twoDaysAgoStatus.levelClass}">
                            <span class="status-dot"></span>
                            <span class="status-name">${twoDaysAgoStatus.condition}</span>
                            <span class="status-sep">&bull;</span>
                            <span class="status-photo">${twoDaysAgoStatus.photosynthesis}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Rainfall Activity Card (Symmetrical Layout) -->
            <div class="weather-card rainfall-card">
                <div class="weather-card-top">
                    <span class="weather-card-title">🌧️ Rainfall Activity</span>
                </div>

                <!-- Primary Benchmark: Today's Rainfall Status -->
                <div class="rainfall-hero">
                    <div class="rainfall-hero-main">
                        <span class="rainfall-hero-icon">🌧️</span>
                        <div class="rainfall-hero-text">
                            <div class="rainfall-hero-val">${Formatters.number(rainToday, 1)} <span class="rainfall-unit">mm (today)</span></div>
                            <div class="rainfall-hero-photo ${rainTodayStatus.levelClass}">${rainTodayStatus.text}</div>
                        </div>
                    </div>
                    <div class="rainfall-hero-caption">7-Day Cumulative Total: ${Formatters.number(rain7d, 1)} mm</div>
                </div>

                <!-- 2-Day History Breakdown (Identical Symmetrical Rows) -->
                <div class="rainfall-history">
                    <div class="rainfall-row">
                        <div class="rainfall-day-info">
                            <span class="day-title">Yesterday</span>
                        </div>
                        <div class="rainfall-day-status ${rainYestStatus.levelClass}">
                            <span class="status-dot"></span>
                            <span class="status-name">${Formatters.number(rainYest, 1)} mm</span>
                            <span class="status-sep">&bull;</span>
                            <span class="status-photo">${rainYestStatus.text}</span>
                        </div>
                    </div>

                    <div class="rainfall-row">
                        <div class="rainfall-day-info">
                            <span class="day-title">2 Days Ago</span>
                        </div>
                        <div class="rainfall-day-status ${rain2DaysAgoStatus.levelClass}">
                            <span class="status-dot"></span>
                            <span class="status-name">${Formatters.number(rain2DaysAgo, 1)} mm</span>
                            <span class="status-sep">&bull;</span>
                            <span class="status-photo">${rain2DaysAgoStatus.text}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

/**
 * 4.4 Recent Sensor Readings (12H Tactical Real-Time)
 */
class RecentReadingsRenderer {
    static render(raw, analysis) {
        const rawGrid = document.getElementById('raw-stats-grid');
        if (!rawGrid || !raw) return;

        const ts = raw.timestamp ? new Date(raw.timestamp) : new Date();
        const validTs = !isNaN(ts.getTime()) ? ts : new Date();
        const hour = validTs.getHours();
        const timeStr = !isNaN(ts.getTime())
            ? ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Live';

        const titleEl = document.getElementById('recent-readings-title');
        if (titleEl) {
            titleEl.innerHTML = `Recent Sensor Readings <span class="readings-timestamp-badge">🕒 ${timeStr}</span>`;
        }

        // 12-Hour X-Axis Time Markers (Start = -12h, Mid = -6h, End = Latest)
        const endHourDate = validTs;
        const midHourDate = new Date(validTs.getTime() - (6 * 3600 * 1000));
        const startHourDate = new Date(validTs.getTime() - (12 * 3600 * 1000));

        const formatAxisHour = (d) => {
            const h = d.getHours().toString().padStart(2, '0');
            return `${h}:00`;
        };

        const startHourStr = formatAxisHour(startHourDate);
        const midHourStr = formatAxisHour(midHourDate);
        const endHourStr = formatAxisHour(endHourDate);

        const hoursAxisHtml = `
            <div class="stat-hours-axis">
                <span>${startHourStr}</span>
                <span>${midHourStr}</span>
                <span>${endHourStr}</span>
            </div>
        `;

        const trends = raw.trends || {};
        const sparklines = raw.sparklines || {};

        // 1. DO Card
        const doVal = parseFloat(raw.do);
        let doBadgeClass = 'badge-optimal';
        let doBadgeText = 'Optimal';
        if (doVal < AquacultureConfig.DO.CRITICAL_LOW) {
            doBadgeClass = 'badge-danger';
            doBadgeText = 'Critical Low';
        } else if (doVal < AquacultureConfig.DO.CAUTION_LOW) {
            doBadgeClass = 'badge-warning';
            doBadgeText = 'Caution';
        }

        const doTrendObj = trends.do || { delta1h: (hour >= 7 && hour <= 13) ? 0.15 : -0.12, ratePerHour: (hour >= 7 && hour <= 13) ? 0.15 : -0.12, direction: (hour >= 7 && hour <= 13) ? 'up' : 'down' };
        const doTrendInfo = Formatters.trendDelta(doTrendObj, 'ppm', 2);
        let doContextNote = `<span class="context-note text-good">Stable dissolved oxygen</span>`;
        if (hour >= 6 && hour <= 12) {
            doContextNote = doTrendInfo.direction === 'up'
                ? `<span class="context-note text-good">${AquacultureConfig.DO.ADVISORIES.MORNING_CLIMB}</span>`
                : `<span class="context-note text-danger">${AquacultureConfig.DO.ADVISORIES.MORNING_DROP}</span>`;
        } else if (doVal >= AquacultureConfig.DO.CAUTION_LOW) {
            doContextNote = `<span class="context-note text-good">Above safety threshold (≥4.0 ppm)</span>`;
        }

        const doSparkData = (sparklines.do && sparklines.do.length >= 2) ? sparklines.do : [doVal - 0.77, doVal - 0.64, doVal - 0.41, doVal - 0.21, doVal - 0.10, doVal];
        const doSparkSvg = SvgSparklineService.renderContinuous(doSparkData, '#10b981', 'grad-do', 50, 220, v => Number(v).toFixed(2));

        // 2. pH Card
        const phVal = parseFloat(raw.ph);
        let phBadgeClass = 'badge-normal';
        let phBadgeText = 'Normal';
        if (phVal > AquacultureConfig.PH.CRITICAL_HIGH || phVal < AquacultureConfig.PH.CRITICAL_LOW) {
            phBadgeClass = 'badge-danger';
            phBadgeText = 'Alert';
        }

        const phTrendObj = trends.ph || { delta1h: (hour >= 8 && hour <= 16) ? 0.04 : -0.03, ratePerHour: (hour >= 8 && hour <= 16) ? 0.04 : -0.03, direction: (hour >= 8 && hour <= 16) ? 'up' : 'down' };
        const phTrendInfo = Formatters.trendDelta(phTrendObj, '', 2);
        const phSparkData = (sparklines.ph && sparklines.ph.length >= 2) ? sparklines.ph : [phVal - 0.12, phVal - 0.09, phVal - 0.06, phVal - 0.03, phVal - 0.01, phVal];
        const phDeltaToday = (analysis && analysis.ph && analysis.ph.delta !== undefined && analysis.ph.delta !== null && !isNaN(analysis.ph.delta))
            ? analysis.ph.delta
            : (phSparkData.length >= 2 ? (Math.max(...phSparkData) - Math.min(...phSparkData)).toFixed(2) : 0.12);
        const phContextNote = `<span class="context-note">Daily Swing Δ: ${Formatters.number(phDeltaToday, 2)} (Safe ≤ 0.5)</span>`;
        const phSparkSvg = SvgSparklineService.renderContinuous(phSparkData, '#6366f1', 'grad-ph', 50, 220, v => Number(v).toFixed(2));

        // 3. Water Temp Card
        const tempVal = parseFloat(raw.waterTemp);
        let tempBadgeClass = 'badge-optimal';
        let tempBadgeText = 'Stable';
        if (tempVal > AquacultureConfig.WATER_TEMP.STRESS_HIGH) {
            tempBadgeClass = 'badge-danger';
            tempBadgeText = 'High Temp';
        } else if (tempVal < AquacultureConfig.WATER_TEMP.STRESS_LOW) {
            tempBadgeClass = 'badge-warning';
            tempBadgeText = 'Cold Water';
        }

        const tempTrendObj = trends.waterTemp || { delta1h: (hour >= 9 && hour <= 15) ? 0.2 : -0.1, ratePerHour: (hour >= 9 && hour <= 15) ? 0.2 : -0.1, direction: (hour >= 9 && hour <= 15) ? 'up' : 'down' };
        const tempTrendInfo = Formatters.trendDelta(tempTrendObj, '°C', 1);
        const tempSparkData = (sparklines.waterTemp && sparklines.waterTemp.length >= 2) ? sparklines.waterTemp : [tempVal - 1.1, tempVal - 0.9, tempVal - 0.7, tempVal - 0.5, tempVal - 0.2, tempVal];
        const tempDeltaToday = (analysis && analysis.temperature && analysis.temperature.delta !== undefined && analysis.temperature.delta !== null && !isNaN(analysis.temperature.delta))
            ? analysis.temperature.delta
            : (tempSparkData.length >= 2 ? (Math.max(...tempSparkData) - Math.min(...tempSparkData)).toFixed(1) : 1.1);
        const tempContextNote = `<span class="context-note">Thermal Delta: ${Formatters.number(tempDeltaToday, 1)} °C (Optimal 28–31°C)</span>`;
        const tempSparkSvg = SvgSparklineService.renderContinuous(tempSparkData, '#0284c7', 'grad-wtemp', 50, 220, v => `${Number(v).toFixed(1)}°`);

        // 4. Sunlight (Lux) Card
        const luxVal = parseFloat(raw.lux);
        const luxCondition = Formatters.luxCondition(luxVal);
        const luxTrendObj = trends.lux || { delta1h: (hour >= 6 && hour <= 12) ? 3800 : (hour >= 13 && hour <= 18 ? -4200 : 0), ratePerHour: (hour >= 6 && hour <= 12) ? 3800 : (hour >= 13 && hour <= 18 ? -4200 : 0), direction: (hour >= 6 && hour <= 12) ? 'up' : (hour >= 13 && hour <= 18 ? 'down' : 'stable') };
        const luxTrendInfo = Formatters.trendDelta(luxTrendObj, 'lux', 0);
        let luxContextNote = `<span class="context-note">Active daylight</span>`;
        if (hour >= 6 && hour <= 11) {
            luxContextNote = `<span class="context-note text-good">☀️ Rising solar irradiance (climbing)</span>`;
        } else if (luxVal > AquacultureConfig.LUX.CLEAR) {
            luxContextNote = `<span class="context-note text-good">Peak daylight photosynthesis</span>`;
        } else if (luxVal <= AquacultureConfig.LUX.OVERCAST) {
            luxContextNote = `<span class="context-note">Low light / night phase</span>`;
        }

        const luxSparkData = (sparklines.lux && sparklines.lux.length >= 2) ? sparklines.lux : [Math.round(luxVal * 0.2), Math.round(luxVal * 0.4), Math.round(luxVal * 0.65), Math.round(luxVal * 0.85), Math.round(luxVal * 0.95), Math.round(luxVal)];
        const luxSparkSvg = SvgSparklineService.renderContinuous(luxSparkData, luxCondition.sparkColor, 'grad-lux', 50, 220, v => Number(v) >= 10000 ? `${(Number(v) / 1000).toFixed(1)}k` : Math.round(Number(v)).toLocaleString());

        // 5. Air Temp Card
        const airTempVal = parseFloat(raw.airTemp);
        let airTempBadgeClass = 'badge-normal';
        let airTempBadgeText = 'Optimal Ambient';
        let airTempSparkColor = '#ea580c';

        if (!isNaN(airTempVal) && airTempVal >= 34.0) {
            airTempBadgeClass = 'badge-warning';
            airTempBadgeText = 'Warm Ambient';
        } else if (!isNaN(airTempVal) && airTempVal <= 24.0) {
            airTempBadgeText = 'Cool Ambient';
            airTempSparkColor = '#0284c7';
        }

        const airTempTrendObj = trends.airTemp || { delta1h: (hour >= 8 && hour <= 14) ? 0.4 : -0.3, ratePerHour: (hour >= 8 && hour <= 14) ? 0.4 : -0.3, direction: (hour >= 8 && hour <= 14) ? 'up' : 'down' };
        const airTempTrendInfo = Formatters.trendDelta(airTempTrendObj, '°C', 1);
        const airTempContextNote = `<span class="context-note">Ambient weather station</span>`;
        const airTempSparkData = (sparklines.airTemp && sparklines.airTemp.length >= 2) ? sparklines.airTemp : [Math.round((airTempVal - 1.8) * 10) / 10, Math.round((airTempVal - 1.2) * 10) / 10, Math.round((airTempVal - 0.7) * 10) / 10, Math.round((airTempVal - 0.3) * 10) / 10, Math.round(airTempVal * 10) / 10];
        const airTempSparkSvg = SvgSparklineService.renderContinuous(airTempSparkData, airTempSparkColor, 'grad-air', 50, 220, v => `${Number(v).toFixed(1)}°`);

        // Single Batch DOM Injection (Zero Reflows)
        rawGrid.innerHTML = `
            <!-- DO Card -->
            <div class="stat-card stat-card-do">
                <div class="stat-card-header">
                    <div class="stat-title-group">
                        <span class="stat-icon-symbol">💧</span>
                        <span class="stat-card-name">DO (Dissolved Oxygen)</span>
                    </div>
                    <span class="sensor-badge ${doBadgeClass}">${doBadgeText}</span>
                </div>
                <div class="stat-main-row">
                    <div class="stat-val-wrapper">
                        <span class="stat-val">${Formatters.number(raw.do, 2)}</span>
                        <span class="stat-unit">ppm</span>
                    </div>
                    ${doTrendInfo.html}
                </div>
                <div class="stat-context-row">${doContextNote}</div>
                <div class="stat-sparkline-box">
                    <div class="sparkline-meta">
                        <span class="spark-label">12H Trend</span>
                    </div>
                    ${doSparkSvg}
                    ${hoursAxisHtml}
                </div>
            </div>

            <!-- pH Card -->
            <div class="stat-card stat-card-ph">
                <div class="stat-card-header">
                    <div class="stat-title-group">
                        <span class="stat-icon-symbol">🧪</span>
                        <span class="stat-card-name">pH Level</span>
                    </div>
                    <span class="sensor-badge ${phBadgeClass}">${phBadgeText}</span>
                </div>
                <div class="stat-main-row">
                    <div class="stat-val-wrapper">
                        <span class="stat-val">${Formatters.number(raw.ph, 2)}</span>
                    </div>
                    ${phTrendInfo.html}
                </div>
                <div class="stat-context-row">${phContextNote}</div>
                <div class="stat-sparkline-box">
                    <div class="sparkline-meta">
                        <span class="spark-label">12H Trend</span>
                    </div>
                    ${phSparkSvg}
                    ${hoursAxisHtml}
                </div>
            </div>

            <!-- Water Temp Card -->
            <div class="stat-card stat-card-water-temp">
                <div class="stat-card-header">
                    <div class="stat-title-group">
                        <span class="stat-icon-symbol">🌡️</span>
                        <span class="stat-card-name">Water Temp</span>
                    </div>
                    <span class="sensor-badge ${tempBadgeClass}">${tempBadgeText}</span>
                </div>
                <div class="stat-main-row">
                    <div class="stat-val-wrapper">
                        <span class="stat-val">${Formatters.number(raw.waterTemp, 1)}</span>
                        <span class="stat-unit">°C</span>
                    </div>
                    ${tempTrendInfo.html}
                </div>
                <div class="stat-context-row">${tempContextNote}</div>
                <div class="stat-sparkline-box">
                    <div class="sparkline-meta">
                        <span class="spark-label">12H Trend</span>
                    </div>
                    ${tempSparkSvg}
                    ${hoursAxisHtml}
                </div>
            </div>

            <!-- Lux Card -->
            <div class="stat-card stat-card-lux">
                <div class="stat-card-header">
                    <div class="stat-title-group">
                        <span class="stat-icon-symbol">${luxCondition.icon}</span>
                        <span class="stat-card-name">Sunlight (Lux)</span>
                    </div>
                    <span class="sensor-badge ${luxCondition.badgeClass}">${luxCondition.statement}</span>
                </div>
                <div class="stat-main-row">
                    <div class="stat-val-wrapper">
                        <span class="stat-val">${Formatters.integer(raw.lux)}</span>
                        <span class="stat-unit">lux</span>
                    </div>
                    ${luxTrendInfo.html}
                </div>
                <div class="stat-context-row">${luxContextNote}</div>
                <div class="stat-sparkline-box">
                    <div class="sparkline-meta">
                        <span class="spark-label">12H Trend</span>
                    </div>
                    ${luxSparkSvg}
                    ${hoursAxisHtml}
                </div>
            </div>

            <!-- Air Temp Card -->
            <div class="stat-card stat-card-air-temp">
                <div class="stat-card-header">
                    <div class="stat-title-group">
                        <span class="stat-icon-symbol">🌤️</span>
                        <span class="stat-card-name">Air Temp</span>
                    </div>
                    <span class="sensor-badge ${airTempBadgeClass}">${airTempBadgeText}</span>
                </div>
                <div class="stat-main-row">
                    <div class="stat-val-wrapper">
                        <span class="stat-val">${Formatters.number(raw.airTemp, 1)}</span>
                        <span class="stat-unit">°C</span>
                    </div>
                    ${airTempTrendInfo.html}
                </div>
                <div class="stat-context-row">${airTempContextNote}</div>
                <div class="stat-sparkline-box">
                    <div class="sparkline-meta">
                        <span class="spark-label">12H Trend</span>
                    </div>
                    ${airTempSparkSvg}
                    ${hoursAxisHtml}
                </div>
            </div>
        `;
    }
}

/**
 * 4.5 7-Day Water Quality Trends (Strategic Trajectory & Minimum DO)
 */
class WeeklyTrendsRenderer {
    static render(weeklyMetrics, raw, pondDetails) {
        const gridEl = document.getElementById('weekly-metrics-grid');
        const badgeEl = document.getElementById('weekly-window-badge');
        if (!gridEl) return;

        const wm = weeklyMetrics || {};
        const doData = wm.do || {};
        const phData = wm.ph || {};
        const tempData = wm.temperature || {};

        const rawDo = raw ? parseFloat(raw.do) : 5.39;
        const rawPh = raw ? parseFloat(raw.ph) : 7.24;
        const rawTemp = raw ? parseFloat(raw.waterTemp) : 29.9;
        const currentDoc = (pondDetails && pondDetails.doc) ? parseInt(pondDetails.doc, 10) : 46;
        const startDoc = wm.startDoc || (currentDoc ? Math.max(1, currentDoc - 6) : null);
        const endDoc = wm.endDoc || currentDoc;

        // Window Range Tag (Date only)
        if (badgeEl) {
            badgeEl.textContent = (wm.startDate && wm.endDate)
                ? `${wm.startDate} – ${wm.endDate}`
                : 'Past 7 Days';
        }

        // 1. DO: 7-Day Morning Minimums
        const doSpark = (doData.sparkline && doData.sparkline.length >= 2)
            ? doData.sparkline
            : [4.45, 4.52, 4.60, 4.55, 4.68, 4.75, rawDo ? Math.min(rawDo, 4.85) : 4.85];
        const doAvg = doData.avg !== null && doData.avg !== undefined
            ? parseFloat(doData.avg)
            : Math.round((doSpark.reduce((a, b) => a + b, 0) / doSpark.length) * 100) / 100;
        const doDelta = doData.delta7d !== null && doData.delta7d !== undefined
            ? parseFloat(doData.delta7d)
            : Math.round((doSpark[doSpark.length - 1] - doSpark[0]) * 100) / 100;

        let doBadgeClass = 'badge-optimal';
        let doBadgeText = 'Optimal Baseline';
        let doAdvisoryClass = 'advisory-good';
        let doAdvisoryText = AquacultureConfig.DO.ADVISORIES.OPTIMAL;

        if (doAvg < 3.5 || doSpark[doSpark.length - 1] < AquacultureConfig.DO.CRITICAL_LOW) {
            doBadgeClass = 'badge-danger';
            doBadgeText = 'Critical Low';
            doAdvisoryClass = 'advisory-alert';
            doAdvisoryText = AquacultureConfig.DO.ADVISORIES.CRITICAL;
        } else if (doDelta <= AquacultureConfig.DO.WEEKLY_DROP_ALERT) {
            doBadgeClass = 'badge-warning';
            doBadgeText = 'Declining DO';
            doAdvisoryClass = 'advisory-caution';
            doAdvisoryText = AquacultureConfig.DO.ADVISORIES.DECLINING;
        } else if (doAvg < AquacultureConfig.DO.CAUTION_LOW) {
            doBadgeClass = 'badge-warning';
            doBadgeText = 'Caution';
            doAdvisoryClass = 'advisory-caution';
            doAdvisoryText = AquacultureConfig.DO.ADVISORIES.BORDERLINE;
        } else if (doDelta >= AquacultureConfig.DO.WEEKLY_RECOVERY) {
            doBadgeClass = 'badge-good';
            doBadgeText = 'DO Recovering';
            doAdvisoryClass = 'advisory-good';
            doAdvisoryText = AquacultureConfig.DO.ADVISORIES.RECOVERING;
        }

        const doSign = doDelta > 0 ? '+' : (doDelta < 0 ? '-' : '±');
        const doShiftPillClass = doDelta > 0.05 ? 'shift-up' : (doDelta < -0.05 ? 'shift-down' : 'shift-stable');
        const doSparkSvg = SvgSparklineService.renderDiscrete7Day(doSpark, '#10b981', 'weekly-grad-do', 52, 240, v => `${v.toFixed(2)}`);

        // 2. pH: 7-Day Daily Mean
        const phSpark = (phData.sparkline && phData.sparkline.length >= 2)
            ? phData.sparkline
            : [7.38, 7.40, 7.42, 7.45, 7.44, 7.46, rawPh || 7.48];
        const phAvg = phData.avg !== null && phData.avg !== undefined
            ? parseFloat(phData.avg)
            : Math.round((phSpark.reduce((a, b) => a + b, 0) / phSpark.length) * 100) / 100;
        const phDelta = phData.delta7d !== null && phData.delta7d !== undefined
            ? parseFloat(phData.delta7d)
            : Math.round((phSpark[phSpark.length - 1] - phSpark[0]) * 100) / 100;

        let phBadgeClass = 'badge-normal';
        let phBadgeText = 'Stable Balance';
        let phAdvisoryClass = 'advisory-good';
        let phAdvisoryText = AquacultureConfig.PH.ADVISORIES.OPTIMAL;

        if (phAvg > AquacultureConfig.PH.CRITICAL_HIGH) {
            phBadgeClass = 'badge-danger';
            phBadgeText = 'High pH Alert';
            phAdvisoryClass = 'advisory-alert';
            phAdvisoryText = AquacultureConfig.PH.ADVISORIES.HIGH_ALERT;
        } else if (phAvg < AquacultureConfig.PH.CRITICAL_LOW) {
            phBadgeClass = 'badge-danger';
            phBadgeText = 'Low pH Alert';
            phAdvisoryClass = 'advisory-alert';
            phAdvisoryText = AquacultureConfig.PH.ADVISORIES.LOW_ALERT;
        } else if (phDelta >= AquacultureConfig.PH.WEEKLY_BLOOM_RISE) {
            phBadgeClass = 'badge-warning';
            phBadgeText = 'Rising Bloom';
            phAdvisoryClass = 'advisory-caution';
            phAdvisoryText = AquacultureConfig.PH.ADVISORIES.BLOOM_RISING;
        } else if (phDelta <= AquacultureConfig.PH.WEEKLY_CRASH_DROP) {
            phBadgeClass = 'badge-warning';
            phBadgeText = 'pH Declining';
            phAdvisoryClass = 'advisory-caution';
            phAdvisoryText = AquacultureConfig.PH.ADVISORIES.CRASH_DECLINING;
        }

        const phSign = phDelta > 0 ? '+' : (phDelta < 0 ? '-' : '±');
        const phShiftPillClass = Math.abs(phDelta) > 0.05 ? (phDelta > 0 ? 'shift-up' : 'shift-down') : 'shift-stable';
        const phSparkSvg = SvgSparklineService.renderDiscrete7Day(phSpark, '#6366f1', 'weekly-grad-ph', 52, 240, v => `${v.toFixed(2)}`);

        // 3. Water Temp: 7-Day Daily Mean
        const tempSpark = (tempData.sparkline && tempData.sparkline.length >= 2)
            ? tempData.sparkline
            : [30.1, 30.0, 29.8, 29.7, 29.6, 29.5, rawTemp || 29.6];
        const tempAvg = tempData.avg !== null && tempData.avg !== undefined
            ? parseFloat(tempData.avg)
            : Math.round((tempSpark.reduce((a, b) => a + b, 0) / tempSpark.length) * 10) / 10;
        const tempDelta = tempData.delta7d !== null && tempData.delta7d !== undefined
            ? parseFloat(tempData.delta7d)
            : Math.round((tempSpark[tempSpark.length - 1] - tempSpark[0]) * 10) / 10;

        let tempBadgeClass = 'badge-optimal';
        let tempBadgeText = 'Optimal Range';
        let tempAdvisoryClass = 'advisory-good';
        let tempAdvisoryText = AquacultureConfig.WATER_TEMP.ADVISORIES.OPTIMAL;

        if (tempAvg > AquacultureConfig.WATER_TEMP.STRESS_HIGH) {
            tempBadgeClass = 'badge-danger';
            tempBadgeText = 'Thermal Stress';
            tempAdvisoryClass = 'advisory-alert';
            tempAdvisoryText = AquacultureConfig.WATER_TEMP.ADVISORIES.STRESS_HIGH;
        } else if (tempAvg < AquacultureConfig.WATER_TEMP.STRESS_LOW) {
            tempBadgeClass = 'badge-warning';
            tempBadgeText = 'Cold Water';
            tempAdvisoryClass = 'advisory-caution';
            tempAdvisoryText = AquacultureConfig.WATER_TEMP.ADVISORIES.STRESS_LOW;
        } else if (tempDelta <= AquacultureConfig.WATER_TEMP.WEEKLY_COOLING) {
            tempBadgeClass = 'badge-warning';
            tempBadgeText = 'Cooling Trend';
            tempAdvisoryClass = 'advisory-caution';
            tempAdvisoryText = AquacultureConfig.WATER_TEMP.ADVISORIES.COOLING;
        } else if (tempDelta >= AquacultureConfig.WATER_TEMP.WEEKLY_WARMING || tempAvg >= 32.0) {
            tempBadgeClass = 'badge-warning';
            tempBadgeText = 'Warming Trend';
            tempAdvisoryClass = 'advisory-caution';
            tempAdvisoryText = AquacultureConfig.WATER_TEMP.ADVISORIES.WARMING;
        }

        const tempSign = tempDelta > 0 ? '+' : (tempDelta < 0 ? '-' : '±');
        const tempShiftPillClass = Math.abs(tempDelta) > 0.2 ? (tempDelta > 0 ? 'shift-up' : 'shift-down') : 'shift-stable';
        const tempSparkSvg = SvgSparklineService.renderDiscrete7Day(tempSpark, '#0284c7', 'weekly-grad-temp', 52, 240, v => `${v.toFixed(1)}°C`);

        // Dynamic Day Labels Axis (Start DOC and End DOC only)
        const daysAxisHtml = (startDoc && endDoc)
            ? `<div class="weekly-days-axis"><span>DOC ${startDoc}</span><span>DOC ${endDoc}</span></div>`
            : `<div class="weekly-days-axis"><span>7 Days Ago</span><span>Today</span></div>`;

        gridEl.innerHTML = `
            <!-- Morning DO Min Card -->
            <div class="weekly-card weekly-card-do">
                <div class="weekly-card-header">
                    <div class="weekly-title-wrapper">
                        <span class="weekly-icon-symbol">💧</span>
                        <span class="weekly-card-title">Morning DO Min</span>
                    </div>
                    <span class="sensor-badge ${doBadgeClass}">${doBadgeText}</span>
                </div>
                <div class="weekly-main-row">
                    <div class="weekly-val-wrapper">
                        <span class="weekly-val">${doAvg.toFixed(2)}</span>
                        <span class="weekly-unit">ppm (7d avg)</span>
                    </div>
                    <span class="weekly-shift-pill ${doShiftPillClass}">
                        ${doDelta !== 0 ? (doDelta > 0 ? '▲' : '▼') : '▬'} ${doSign}${Math.abs(doDelta).toFixed(2)} ppm / week
                    </span>
                </div>
                <div class="weekly-advisory-box ${doAdvisoryClass}">${doAdvisoryText}</div>
                <div class="weekly-sparkline-container">
                    <div class="weekly-spark-meta">
                        <span class="weekly-spark-label">Morning Minimums</span>
                    </div>
                    ${doSparkSvg}
                    ${daysAxisHtml}
                </div>
            </div>

            <!-- pH Level Card -->
            <div class="weekly-card weekly-card-ph">
                <div class="weekly-card-header">
                    <div class="weekly-title-wrapper">
                        <span class="weekly-icon-symbol">🧪</span>
                        <span class="weekly-card-title">pH Level</span>
                    </div>
                    <span class="sensor-badge ${phBadgeClass}">${phBadgeText}</span>
                </div>
                <div class="weekly-main-row">
                    <div class="weekly-val-wrapper">
                        <span class="weekly-val">${phAvg.toFixed(2)}</span>
                        <span class="weekly-unit">(7d avg)</span>
                    </div>
                    <span class="weekly-shift-pill ${phShiftPillClass}">
                        ${phDelta !== 0 ? (phDelta > 0 ? '▲' : '▼') : '▬'} ${phSign}${Math.abs(phDelta).toFixed(2)} / week
                    </span>
                </div>
                <div class="weekly-advisory-box ${phAdvisoryClass}">${phAdvisoryText}</div>
                <div class="weekly-sparkline-container">
                    <div class="weekly-spark-meta">
                        <span class="weekly-spark-label">Daily Averages</span>
                    </div>
                    ${phSparkSvg}
                    ${daysAxisHtml}
                </div>
            </div>

            <!-- Water Temp Card -->
            <div class="weekly-card weekly-card-temp">
                <div class="weekly-card-header">
                    <div class="weekly-title-wrapper">
                        <span class="weekly-icon-symbol">🌡️</span>
                        <span class="weekly-card-title">Water Temp</span>
                    </div>
                    <span class="sensor-badge ${tempBadgeClass}">${tempBadgeText}</span>
                </div>
                <div class="weekly-main-row">
                    <div class="weekly-val-wrapper">
                        <span class="weekly-val">${tempAvg.toFixed(1)}</span>
                        <span class="weekly-unit">°C (7d avg)</span>
                    </div>
                    <span class="weekly-shift-pill ${tempShiftPillClass}">
                        ${tempDelta !== 0 ? (tempDelta > 0 ? '▲' : '▼') : '▬'} ${tempSign}${Math.abs(tempDelta).toFixed(1)} °C / week
                    </span>
                </div>
                <div class="weekly-advisory-box ${tempAdvisoryClass}">${tempAdvisoryText}</div>
                <div class="weekly-sparkline-container">
                    <div class="weekly-spark-meta">
                        <span class="weekly-spark-label">Daily Averages</span>
                    </div>
                    ${tempSparkSvg}
                    ${daysAxisHtml}
                </div>
            </div>
        `;
    }
}

/**
 * 4.6 Water Quality History (Lifetime Records & Abnormal Logs)
 */
class HistoryRenderer {
    static render(history) {
        if (!history) return;

        // 1. All-Time Temperature Records
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

        // 2. Abnormality Counter Badge
        const count = history.totalAbnormalDays || (history.abnormalities ? history.abnormalities.length : 0);
        const summaryBadge = document.getElementById('abnormal-summary-badge');
        const countTextEl = document.getElementById('abnormal-count-text');

        if (summaryBadge && countTextEl) {
            if (count > 0) {
                countTextEl.textContent = `${count} Abnormal Day${count > 1 ? 's' : ''} Detected`;
                summaryBadge.className = 'abnormal-counter-badge';
            } else {
                countTextEl.textContent = '0 Abnormal Days';
                summaryBadge.className = 'abnormal-counter-badge no-issues';
            }
        }

        // Dynamically update criteria hint based on active AquacultureConfig
        const criteriaEl = document.getElementById('history-criteria-hint') || document.querySelector('.history-criteria-hint');
        if (criteriaEl) {
            criteriaEl.innerHTML = `Criteria: DO &lt; ${AquacultureConfig.DO.CRITICAL_LOW.toFixed(1)} ppm | pH swing &gt; ${AquacultureConfig.PH.MAX_SAFE_SWING.toFixed(1)} | Temp swing &ge; ${AquacultureConfig.WATER_TEMP.MAX_SAFE_SWING.toFixed(1)}°C | Temp &ge; ${AquacultureConfig.WATER_TEMP.STRESS_HIGH.toFixed(1)}°C | Rain &ge; ${AquacultureConfig.RAINFALL.CRITICAL_DAILY.toFixed(0)}mm/day or &ge; ${AquacultureConfig.RAINFALL.CRITICAL_7DAY.toFixed(0)}mm/week`;
        }

        // 3. Render Abnormality Timeline Rows
        const listContainer = document.getElementById('anomaly-list-container');
        if (!listContainer) return;

        const items = history.abnormalities || [];
        if (items.length === 0) {
            listContainer.innerHTML = `
                <div class="no-anomalies-card">
                    <div class="no-anomalies-icon">✅</div>
                    <div class="no-anomalies-title">All Parameters Within Normal Limits</div>
                    <div style="font-size: 0.85rem; color: #166534; font-weight: 600;">No abnormal water quality spikes or weather thresholds have been triggered across this cycle.</div>
                </div>
            `;
            return;
        }

        let html = '';
        items.forEach(day => {
            const docBadge = day.doc ? `<span class="anomaly-doc-tag">DOC ${day.doc}</span>` : '';
            const dateStr = day.date || 'Recorded Date';
            let pillsHtml = '';
            let detailsHtml = '';

            (day.issues || []).forEach(iss => {
                let pillClass = 'pill-temp';
                let icon = '⚠️';
                if (iss.type === 'do') { pillClass = 'pill-do'; icon = '💧'; }
                else if (iss.type === 'ph') { pillClass = 'pill-ph'; icon = '🧪'; }
                else if (iss.type === 'temp') { pillClass = 'pill-temp'; icon = '🌡️'; }
                else if (iss.type === 'rain') { pillClass = 'pill-rain'; icon = '🌧️'; }

                pillsHtml += `<span class="anomaly-pill ${pillClass}">${icon} ${iss.name || 'Alert'}: ${iss.value || ''}</span>`;
                detailsHtml += `<li class="anomaly-detail-item">${iss.desc || ''}</li>`;
            });

            html += `
                <div class="anomaly-card">
                    <div class="anomaly-card-top">
                        <div class="anomaly-date-group">
                            ${docBadge}
                            <span class="anomaly-date">${dateStr}</span>
                        </div>
                        <div class="anomaly-badges">
                            ${pillsHtml}
                        </div>
                    </div>
                    <ul class="anomaly-details-list">
                        ${detailsHtml}
                    </ul>
                </div>
            `;
        });

        listContainer.innerHTML = html;
    }
}


// =========================================================================
// 5. DATA SERVICE (Stale-While-Revalidate Engine)
// =========================================================================

class DataService {
    static lastFetchTimestamp = 0;
    static isFetching = false;

    /**
     * Attempts to read cached payload instantly from localStorage
     */
    static getLocalCache() {
        try {
            const raw = localStorage.getItem(AppConfig.CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed && parsed.timestamp && parsed.data) {
                return parsed;
            }
        } catch (e) {
            console.warn('[DataService] Cache read error:', e);
        }
        return null;
    }

    /**
     * Persists fresh payload to localStorage
     */
    static setLocalCache(data) {
        try {
            localStorage.setItem(AppConfig.CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                data: data
            }));
        } catch (e) {
            console.warn('[DataService] Cache write error:', e);
        }
    }

    /**
     * Asynchronously fetches fresh data from Google Apps Script endpoint.
     * Uses HTTP cache-busting query parameter and `cache: 'no-store'` to prevent
     * mobile browsers (Safari/Chrome) from serving stale disk/memory responses.
     * 
     * @param {boolean} force - If true, passes bypass parameters to backend CacheService.
     * @param {number} timeoutMs - Timeout in milliseconds.
     * @param {Function|null} onProgress - Callback for progressive status updates during fetch.
     */
    static async fetchNetwork(force = false, timeoutMs = AppConfig.MANUAL_FETCH_TIMEOUT_MS, onProgress = null) {
        if (!AppConfig.GAS_WEB_APP_URL || AppConfig.GAS_WEB_APP_URL.includes('YOUR_DEPLOYED_WEB_APP_URL_HERE')) {
            return { status: 'mock', data: DataService.getMockData() };
        }

        // Prevent redundant parallel fetch requests
        if (DataService.isFetching) {
            return null;
        }
        DataService.isFetching = true;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort(new Error('TIMEOUT'));
        }, timeoutMs);

        // Progressive latency timers to reassure user during cold-starts or network lag
        const progressiveTimers = [];
        if (typeof onProgress === 'function') {
            if (timeoutMs > 4000) {
                progressiveTimers.push(setTimeout(() => {
                    onProgress('GAS waking up, please wait...');
                }, 4000));
            }
            if (timeoutMs > 8000) {
                progressiveTimers.push(setTimeout(() => {
                    onProgress('Slow response from Google Sheets... almost there...');
                }, 8000));
            }
            if (timeoutMs > 10500) {
                progressiveTimers.push(setTimeout(() => {
                    onProgress('Finalizing telemetry response...');
                }, 10500));
            }
        }

        const clearAllTimers = () => {
            clearTimeout(timeoutId);
            progressiveTimers.forEach(t => clearTimeout(t));
        };

        try {
            // Build cache-busted URL with dynamic timestamp
            const url = new URL(AppConfig.GAS_WEB_APP_URL);
            url.searchParams.set('t', Date.now().toString());
            if (force) {
                url.searchParams.set('nocache', 'true');
            }

            const response = await fetch(url.toString(), {
                method: 'GET',
                redirect: 'follow',
                signal: controller.signal
            });
            clearAllTimers();

            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            if (result.status === 'success' && result.data) {
                // Always fetch the latest feedingActivity telemetry directly via fetchFeedingGviz for accurate client-side calculation
                try {
                    result.data.feedingActivity = await DataService.fetchFeedingGviz('01.02.12');
                } catch (e) {
                    console.warn('[DataService] Direct feeding gviz fetch error, keeping backend payload:', e);
                }
                DataService.lastFetchTimestamp = Date.now();
                DataService.setLocalCache(result.data);
                return { status: 'success', data: result.data };
            } else {
                throw new Error(result.message || 'Invalid API payload structure');
            }
        } catch (error) {
            clearAllTimers();
            const isTimeout = error.name === 'AbortError' || error.message === 'TIMEOUT';
            console.warn(`[DataService] Network fetch failed (${isTimeout ? 'Timeout' : error.message}), evaluating fallback.`);

            const cached = DataService.getLocalCache();
            if (cached && cached.data) {
                return { 
                    status: isTimeout ? 'timeout_fallback' : 'error_fallback', 
                    data: cached.data,
                    cacheTimestamp: cached.timestamp,
                    error: isTimeout ? 'timeout' : error.message
                };
            }
            // Try live sheet fetch before mock
            try {
                const mock = DataService.getMockData();
                mock.feedingActivity = await DataService.fetchFeedingGviz('01.02.12');
                return { status: 'mock_live_feed', data: mock, error: error.message };
            } catch (e) {
                return { status: 'mock_fallback', data: DataService.getMockData(), error: error.message };
            }
        } finally {
            DataService.isFetching = false;
        }
    }

    /**
     * Directly queries Feed Barrel public Google Sheet gviz CSV endpoint
     */
    static async fetchFeedingGviz(targetPondId = '01.02.12') {
        const url = 'https://docs.google.com/spreadsheets/d/19lHzaW6WengVOE1N-zNk-trIGwLduU7rDfaZGGLwSuM/gviz/tq?tqx=out:csv&sheet=RawData&t=' + Date.now();
        const res = await fetch(url);
        if (!res.ok) throw new Error('Sheet gviz error ' + res.status);
        const text = await res.text();
        const lines = text.trim().split('\n');

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const past14Days = [];
        const toDateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        for (let i = 13; i >= 0; i--) {
            const d = new Date(today.getTime() - i * 86400000);
            past14Days.push({
                dateKey: toDateKey(d),
                displayDate: `${d.getDate()} ${monthNames[d.getMonth()]}`,
                consumed: 0,
                isToday: (i === 0)
            });
        }

        const rowsForPond = [];
        const pondLower = String(targetPondId || '').trim().toLowerCase();

        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',').map(s => s.replace(/^"|"$/g, '').trim());
            if (parts.length < 5) continue;
            if (String(parts[1] || '').trim().toLowerCase() !== pondLower) continue;

            const tsStr = (parts[0] || '').replace(' ', 'T');
            const withTz = (tsStr.indexOf('+') === -1 && tsStr.indexOf('Z') === -1) ? tsStr + '+08:00' : tsStr;
            const rowDate = new Date(withTz);
            if (isNaN(rowDate.getTime())) continue;

            rowsForPond.push({
                date: rowDate,
                dateKey: toDateKey(rowDate),
                distance: parseFloat(parts[2]) || 0,
                weight: parseFloat(parts[4]) || 0,
                consumed: parseFloat(parts[5]) || 0,
                rate: parseFloat(parts[6]) || 0,
                eventType: String(parts[7] || '').trim().toUpperCase()
            });
        }

        if (rowsForPond.length === 0) {
            return DataService.getMockData().feedingActivity;
        }

        rowsForPond.sort((a, b) => a.date.getTime() - b.date.getTime());
        const latest = rowsForPond[rowsForPond.length - 1];
        const latestValid = rowsForPond.slice().reverse().find(r => 
            r.distance >= 15.0 && r.distance <= 85.0
        ) || latest;

        // 2. 3-Pillar Refill Detection & Discrete Bag Quantization across history (using EventType)
        const dayRefillMap = {};
        const dayPingCountMap = {};
        past14Days.forEach(d => { 
            dayRefillMap[d.dateKey] = 0; 
            dayPingCountMap[d.dateKey] = 0;
        });

        function quantizeBagKg(rawKg) {
            if (rawKg >= 108.0) return 125; // 5 bags (Full capacity clamp)
            if (rawKg >= 85.0) return 100;  // 4 bags
            if (rawKg >= 60.0) return 75;   // 3 bags
            if (rawKg >= 35.0) return 50;   // 2 bags
            if (rawKg >= 15.0) return 25;   // 1 bag
            return 0;
        }

        let stableWeight = 0;
        let lastStableDate = null;
        let pendingCandidate = null;

        for (let i = 0; i < rowsForPond.length; i++) {
            const r = rowsForPond[i];
            if (dayPingCountMap[r.dateKey] !== undefined) {
                dayPingCountMap[r.dateKey]++;
            }

            // FULL-ZONE HYSTERESIS / LATCH:
            // When barrel was confirmed full (stableWeight >= 115 kg), readings down to 110 kg (dist <= 34.5 cm)
            // are physical cone mound / transducer blind-zone reflections, NOT genuine feeding drops.
            if (stableWeight >= 115.0 && r.weight >= 110.0) {
                r.weight = 125.0;
            }

            // Identify acoustic crater bounces (physically impossible drop > 5.0 kg in <= 15 min)
            let isCraterGlitch = (r.eventType === 'BOUNCE_CRATER' || r.eventType === 'BOUNCE_NIGHT' || r.eventType === 'OUTLIER_REJECTED');
            if (stableWeight > 0 && lastStableDate && !(stableWeight >= 115.0 && r.weight >= 110.0)) {
                const weightDrop = stableWeight - r.weight;
                const elapsedMin = (r.date.getTime() - lastStableDate.getTime()) / 60000;
                const maxAllowedDrop = (elapsedMin <= 15.0) ? 5.0 : Math.max(5.0, (elapsedMin / 60.0) * 20.0 * 1.25);
                if (weightDrop > maxAllowedDrop) {
                    isCraterGlitch = true;
                }
            }

            if (isCraterGlitch) {
                continue;
            }

            const isFullTransition = (r.weight >= 120.0 && stableWeight < 110.0);
            const isRefillTag = (r.eventType === 'REFILL');

            // Check if row is an explicitly confirmed REFILL or a legacy FULL_SATURATED transition into Full Zone
            if (isRefillTag || (r.eventType === 'FULL_SATURATED' && isFullTransition)) {
                const baseline = (pendingCandidate && pendingCandidate.baselineWeight !== undefined)
                    ? pendingCandidate.baselineWeight
                    : stableWeight;
                const finalWeight = pendingCandidate
                    ? Math.max(r.weight, pendingCandidate.peakWeight || 0)
                    : r.weight;
                const rawRefillAmount = Math.max(0, finalWeight - baseline);
                const quantizedRefill = quantizeBagKg(rawRefillAmount);

                if (quantizedRefill > 0 && dayRefillMap[r.dateKey] !== undefined) {
                    dayRefillMap[r.dateKey] += quantizedRefill;
                }

                pendingCandidate = null;
                stableWeight = r.weight;
                lastStableDate = r.date;
                continue;
            }

            // Multi-ping state machine tracking (handles unconfirmed, top-up, or legacy rows)
            const weightGain = r.weight - stableWeight;
            if ((weightGain >= 20.0 || isFullTransition) && r.eventType !== 'REFILL_VERIFY') {
                // New candidate refill ping (Ping 1)
                pendingCandidate = {
                    initialWeight: r.weight,
                    baselineWeight: stableWeight,
                    peakWeight: r.weight,
                    pingsPassed: 1,
                    dateKey: r.dateKey
                };
                stableWeight = r.weight;
                lastStableDate = r.date;
            } else if (pendingCandidate) {
                // Refill candidate in progress (Ping 2 or Ping 3)
                const toleranceDrop = pendingCandidate.pingsPassed * 5.0; // 5 kg per 6-min verification interval
                if (r.weight >= (pendingCandidate.initialWeight - toleranceDrop)) {
                    pendingCandidate.pingsPassed++;
                    pendingCandidate.peakWeight = Math.max(pendingCandidate.peakWeight, r.weight);
                    if (pendingCandidate.pingsPassed >= 3) {
                        // 3 consecutive pings confirmed! Commit refill.
                        const rawRefillAmount = pendingCandidate.peakWeight - pendingCandidate.baselineWeight;
                        const quantizedRefill = quantizeBagKg(rawRefillAmount);
                        if (quantizedRefill > 0 && dayRefillMap[pendingCandidate.dateKey] !== undefined) {
                            dayRefillMap[pendingCandidate.dateKey] += quantizedRefill;
                        }
                        pendingCandidate = null;
                    }
                } else {
                    // Level dropped back (mound collapsed or transient bounce) -> abort candidate
                    pendingCandidate = null;
                }
                stableWeight = r.weight;
                lastStableDate = r.date;
            } else {
                // Normal feeding or idle
                stableWeight = r.weight;
                lastStableDate = r.date;
            }
        }

        // 3. Map into 14-day history and sparkline array (Single Source of Truth)
        past14Days.forEach(dayItem => {
            const pings = dayPingCountMap[dayItem.dateKey] || 0;
            dayItem.hasData = (pings > 0);
            dayItem.consumed = (pings > 0) ? (dayRefillMap[dayItem.dateKey] || 0) : null;
        });

        const todayKey = toDateKey(today);

        // 4. Generate Live 24-Hour Sparkline Data (Rolling 24 Hours with 30-min Simple Mean)
        const nowTime = new Date().getTime();
        const referenceTime = (rowsForPond.length > 0 && (nowTime - latestValid.date.getTime() > 48 * 3600 * 1000))
            ? latestValid.date.getTime()
            : nowTime;
        const rolling24hStart = referenceTime - 24 * 3600 * 1000;
        const bucketSizeMs = 30 * 60 * 1000; // 30 minutes
        const totalBuckets = 48;

        const livePoints = [];
        for (let b = 0; b < totalBuckets; b++) {
            const bucketStart = rolling24hStart + b * bucketSizeMs;
            const bucketEnd = bucketStart + bucketSizeMs;
            const bucketDate = new Date(bucketEnd);

            const pingsInBucket = rowsForPond.filter(r => {
                const t = r.date.getTime();
                return t >= bucketStart && t < bucketEnd && r.distance >= 15.0 && r.distance <= 85.0;
            });

            const padZero = n => String(n).padStart(2, '0');
            const hourStr = padZero(bucketDate.getHours());
            const timeStr = `${hourStr}:${padZero(bucketDate.getMinutes())}`;

            if (pingsInBucket.length > 0) {
                const sumKg = pingsInBucket.reduce((acc, p) => acc + p.weight, 0);
                const sumCm = pingsInBucket.reduce((acc, p) => acc + p.distance, 0);
                const validCount = pingsInBucket.length;

                if (validCount > 0) {
                    livePoints.push({
                        index: b,
                        timeStr: timeStr,
                        hourStr: hourStr,
                        kg: Math.round((sumKg / validCount) * 10) / 10,
                        cm: Math.round((sumCm / validCount) * 10) / 10,
                        hasData: true
                    });
                } else {
                    livePoints.push({
                        index: b,
                        timeStr: timeStr,
                        hourStr: hourStr,
                        kg: null,
                        cm: null,
                        hasData: false
                    });
                }
            } else {
                livePoints.push({
                    index: b,
                    timeStr: timeStr,
                    hourStr: hourStr,
                    kg: null,
                    cm: null,
                    hasData: false
                });
            }
        }

        const xLabels = [];
        for (let i = 0; i < totalBuckets; i += 8) {
            xLabels.push({
                index: i,
                hour: livePoints[i].hourStr
            });
        }
        if (xLabels.length === 0 || xLabels[xLabels.length - 1].index !== totalBuckets - 1) {
            xLabels.push({
                index: totalBuckets - 1,
                hour: livePoints[totalBuckets - 1].hourStr
            });
        }

        return {
            pondId: targetPondId,
            currentRemainingKg: Math.min(125, Math.max(0, Math.round(latestValid.weight * 100) / 100)),
            percentRemaining: Math.min(100, Math.max(0, Math.round((Math.min(125, Math.max(0, latestValid.weight)) / 125.0) * 100))),
            currentFeedRate: Math.max(0, Math.round(latestValid.rate * 100) / 100),
            todayTotalConsumedKg: dayRefillMap[todayKey] || 0,
            lastTimestamp: latestValid.date.toISOString(),
            sparkline14d: past14Days.map(d => d.consumed),
            past14Days: past14Days,
            liveSparkline24h: {
                points: livePoints,
                xLabels: xLabels
            },
            formulaSheets: `=SPARKLINE(MAP(SEQUENCE(14,1,TODAY()-13,1), LAMBDA(d, IFERROR(ROUND(SUMIFS(RawData!E:E, RawData!B:B, "${targetPondId}", RawData!H:H, "REFILL", INDEX(INT(RawData!A:A)), d)/25)*25, 0))), {"charttype","column";"color","#0284c7"})`
        };
    }

    /**
     * Fallback mock simulation data for offline testing
     */
    static getMockData() {
        const mockNow = new Date();
        const mockPoints = [];
        for (let b = 0; b < 48; b++) {
            const bDate = new Date(mockNow.getTime() - (47 - b) * 30 * 60 * 1000);
            const hour = bDate.getHours();
            const hourStr = String(hour).padStart(2, '0');
            const timeStr = `${hourStr}:${String(bDate.getMinutes()).padStart(2, '0')}`;
            let simKg = 75;
            if (hour >= 0 && hour < 8) {
                simKg = Math.max(30, 48 - (hour * 1.8));
            } else if (hour >= 8 && hour < 14) {
                simKg = Math.max(50, 125 - ((hour - 8) * 11));
            } else if (hour >= 14 && hour < 19) {
                simKg = Math.max(55, 100 - ((hour - 14) * 8.5));
            } else {
                simKg = Math.max(35, 58 - ((hour - 19) * 4.2));
            }
            const simCm = Math.round(69.0 - (simKg / 125.0) * 39.0);
            mockPoints.push({
                index: b,
                timeStr,
                hourStr,
                kg: Math.round(simKg * 10) / 10,
                cm: simCm,
                hasData: true
            });
        }
        const mockXLabels = [];
        for (let i = 0; i < 48; i += 8) {
            mockXLabels.push({ index: i, hour: mockPoints[i].hourStr });
        }
        mockXLabels.push({ index: 47, hour: mockPoints[47].hourStr });

        return {
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
                biomass: 4500,
                sampleFCR: 1.22
            },
            feedingActivity: {
                pondId: '01.02.12',
                currentRemainingKg: 1.28,
                percentRemaining: 1.0,
                currentFeedRate: 25.66,
                todayTotalConsumedKg: 100,
                lastTimestamp: new Date().toISOString(),
                sparkline14d: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100],
                past14Days: [
                    { dateKey: '2026-08-28', displayDate: '28 Aug', consumed: 0, isToday: false },
                    { dateKey: '2026-08-29', displayDate: '29 Aug', consumed: 0, isToday: false },
                    { dateKey: '2026-08-30', displayDate: '30 Aug', consumed: 0, isToday: false },
                    { dateKey: '2026-08-31', displayDate: '31 Aug', consumed: 0, isToday: false },
                    { dateKey: '2026-09-01', displayDate: '1 Sep', consumed: 0, isToday: false },
                    { dateKey: '2026-09-02', displayDate: '2 Sep', consumed: 0, isToday: false },
                    { dateKey: '2026-09-03', displayDate: '3 Sep', consumed: 0, isToday: false },
                    { dateKey: '2026-09-04', displayDate: '4 Sep', consumed: 0, isToday: false },
                    { dateKey: '2026-09-05', displayDate: '5 Sep', consumed: 0, isToday: false },
                    { dateKey: '2026-09-06', displayDate: '6 Sep', consumed: 0, isToday: false },
                    { dateKey: '2026-09-07', displayDate: '7 Sep', consumed: 0, isToday: false },
                    { dateKey: '2026-09-08', displayDate: '8 Sep', consumed: 0, isToday: false },
                    { dateKey: '2026-09-09', displayDate: '9 Sep', consumed: 100, isToday: false },
                    { dateKey: '2026-09-10', displayDate: '10 Sep', consumed: 100, isToday: true }
                ],
                liveSparkline24h: {
                    points: mockPoints,
                    xLabels: mockXLabels
                },
                formulaSheets: `=SPARKLINE(MAP(SEQUENCE(14,1,TODAY()-13,1), LAMBDA(d, IFERROR(ROUND(SUMIFS(RawData!E:E, RawData!B:B, "01.02.12", RawData!H:H, "REFILL", INDEX(INT(RawData!A:A)), d)/25)*25, 0))), {"charttype","column";"color","#0284c7"})`
            },
            raw: {
                timestamp: new Date().toISOString(),
                do: 5.39,
                ph: 7.24,
                waterTemp: 29.9,
                lux: 61130,
                airTemp: 32.5,
                trends: {
                    do: { delta1h: 0.15, ratePerHour: 0.15, direction: 'up' },
                    ph: { delta1h: 0.04, ratePerHour: 0.04, direction: 'up' },
                    waterTemp: { delta1h: 0.2, ratePerHour: 0.2, direction: 'up' },
                    lux: { delta1h: 3800, ratePerHour: 3800, direction: 'up' },
                    airTemp: { delta1h: 0.4, ratePerHour: 0.4, direction: 'up' }
                },
                sparklines: {
                    do: [4.62, 4.75, 4.88, 4.98, 5.05, 5.18, 5.29, 5.39],
                    ph: [7.12, 7.15, 7.18, 7.20, 7.21, 7.23, 7.24],
                    waterTemp: [28.8, 29.0, 29.2, 29.4, 29.6, 29.8, 29.9],
                    lux: [12000, 24000, 38000, 49000, 56000, 61130],
                    airTemp: [29.5, 30.2, 31.0, 31.8, 32.2, 32.5]
                }
            },
            weeklyMetrics: {
                daysCount: 7,
                startDate: "24 Aug",
                endDate: "30 Aug",
                startDoc: 46,
                endDoc: 52,
                do: {
                    avg: 4.82,
                    delta7d: 0.35,
                    sparkline: [4.45, 4.52, 4.60, 4.58, 4.72, 4.78, 4.82]
                },
                ph: {
                    avg: 7.42,
                    delta7d: 0.08,
                    sparkline: [7.36, 7.38, 7.40, 7.44, 7.42, 7.45, 7.44]
                },
                temperature: {
                    avg: 29.6,
                    delta7d: -0.4,
                    sparkline: [30.0, 29.9, 29.8, 29.7, 29.6, 29.5, 29.6]
                }
            },
            analysis: {
                temperature: {
                    min: 28.8,
                    max: 29.9,
                    delta: 1.1,
                    warning: false,
                    isHighTemp: false,
                    isHighFluctuation: false,
                    status: "Normal",
                    message: "Swing: 1.1°C (Normal)"
                },
                do: {
                    min: 4.62,
                    max: 5.39,
                    delta: 0.77,
                    warning: false,
                    isDanger: false,
                    status: "Good",
                    message: "DO Min: 4.62 ppm (Good)"
                },
                ph: {
                    min: 7.12,
                    max: 7.24,
                    delta: 0.12,
                    warning: false,
                    status: "Normal",
                    message: "Swing: 0.12 (Normal)"
                },
                weatherLux: { message: "High Algae Activity", warning: false, avgToday: 61130, avgYest: 58000, avg2DaysAgo: 52000 },
                weatherRain: { message: "Today's rain: 0.00mm", warning: false, sumToday: 0.56, sumYest: 0.0, sum2DaysAgo: 12.4, sum7Day: 47.5 },
                feedingAction: "Normal Feed - Optimal Conditions."
            },
            config: {
                DO: AquacultureConfig.DO,
                PH: AquacultureConfig.PH,
                WATER_TEMP: AquacultureConfig.WATER_TEMP,
                LUX: AquacultureConfig.LUX,
                RAINFALL: AquacultureConfig.RAINFALL
            },
            history: {
                totalAbnormalDays: 3,
                tempExtremes: {
                    min: { value: 24.6, doc: 38, dateStr: "12 Aug 2026", timeStr: "05:45 AM" },
                    max: { value: 33.4, doc: 47, dateStr: "21 Aug 2026", timeStr: "03:15 PM" }
                },
                abnormalities: [
                    {
                        doc: 48,
                        date: "22 Aug 2026",
                        issues: [
                            { type: "do", name: "Low DO", value: "2.45 ppm", desc: "Critical DO drop at 5:00 AM below 3.0 ppm (Recorded 2.45 ppm). Aerator boost required." },
                            { type: "ph", name: "High pH Swing", value: "0.68", desc: "Daytime pH swing exceeded 0.5 (5 AM: 7.42 vs 5 PM: 8.10), indicating dense algae bloom." }
                        ]
                    },
                    {
                        doc: 34,
                        date: "08 Aug 2026",
                        issues: [
                            { type: "temp", name: "Thermal Stress", value: "3.20°C swing", desc: "Water temperature fluctuated > 3.0°C between night min (26.8°C) and afternoon peak (30.0°C)." },
                            { type: "rain", name: "Heavy Rainfall", value: "54.5 mm", desc: "Daily rainfall exceeded 40 mm threshold (Recorded 54.5 mm), risking salinity drop and thermocline." }
                        ]
                    },
                    {
                        doc: 21,
                        date: "26 Jul 2026",
                        issues: [
                            { type: "rain", name: "Continuous Rain (7-Day)", value: "138.0 mm / week", desc: "Cumulative rainfall exceeded 120 mm over 7 consecutive days (Total 138.0 mm)." },
                            { type: "do", name: "Low DO", value: "2.85 ppm", desc: "Morning DO dropped to 2.85 ppm due to prolonged cloud cover and rain runoff." }
                        ]
                    }
                ]
            }
        };
    }
}


// =========================================================================
// 5.5 SYNC STATUS MANAGER (Header Badge & User Feedback Controller)
// =========================================================================

class SyncStatusManager {
    static badgeEl = null;
    static textEl = null;
    static refreshBtn = null;
    static overlaySubtextEl = null;

    static init() {
        this.badgeEl = document.getElementById('sync-status-badge');
        this.textEl = document.getElementById('sync-status-text');
        this.refreshBtn = document.getElementById('btn-refresh-dashboard');
        this.overlaySubtextEl = document.getElementById('loading-subtext');

        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                AppController.handleManualRefresh();
            });
        }

        if (this.badgeEl) {
            this.badgeEl.addEventListener('click', () => {
                // If in warning, error or stale state, tapping badge also triggers refresh
                if (this.badgeEl.classList.contains('status-warning') || 
                    this.badgeEl.classList.contains('status-stale') || 
                    this.badgeEl.classList.contains('status-offline') || 
                    this.badgeEl.classList.contains('status-error')) {
                    AppController.handleManualRefresh();
                }
            });
        }
    }

    static formatTime(ts) {
        if (!ts) return 'just now';
        const d = new Date(ts);
        if (isNaN(d.getTime())) return 'recently';
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    }

    static setSyncing(message = 'Connecting to station...') {
        if (!this.badgeEl) return;
        this.badgeEl.className = 'sync-badge status-syncing';
        if (this.textEl) this.textEl.textContent = message;
        this.setButtonSpinning(true);
    }

    static setLive(timestamp = Date.now()) {
        if (!this.badgeEl) return;
        this.badgeEl.className = 'sync-badge status-live';
        const timeStr = this.formatTime(timestamp);
        if (this.textEl) this.textEl.textContent = `Live • Updated ${timeStr}`;
        this.setButtonSpinning(false);
    }

    static setStale(cacheTimestamp, reason = 'timeout') {
        if (!this.badgeEl) return;
        this.badgeEl.className = 'sync-badge status-stale';
        const timeStr = cacheTimestamp ? this.formatTime(cacheTimestamp) : 'earlier';
        const label = reason === 'timeout' 
            ? `Timeout (8s+) • Showing cache (${timeStr}) [Retry 🔄]` 
            : `Sync issue • Showing cache (${timeStr}) [Retry 🔄]`;
        if (this.textEl) this.textEl.textContent = label;
        this.setButtonSpinning(false);
    }

    static setOffline(message = 'Offline • Showing saved cache [Retry 🔄]') {
        if (!this.badgeEl) return;
        this.badgeEl.className = 'sync-badge status-offline';
        if (this.textEl) this.textEl.textContent = message;
        this.setButtonSpinning(false);
    }

    static setError(message = 'Sync failed. Tap Refresh to retry.') {
        if (!this.badgeEl) return;
        this.badgeEl.className = 'sync-badge status-error';
        if (this.textEl) this.textEl.textContent = message;
        this.setButtonSpinning(false);
    }

    static setProgressText(text) {
        if (this.textEl && this.badgeEl && this.badgeEl.classList.contains('status-syncing')) {
            this.textEl.textContent = text;
        }
        if (this.overlaySubtextEl) {
            this.overlaySubtextEl.textContent = text;
        }
    }

    static setOverlaySubtext(text) {
        if (this.overlaySubtextEl) {
            this.overlaySubtextEl.textContent = text;
        }
    }

    static setButtonSpinning(isSpinning) {
        if (!this.refreshBtn) return;
        if (isSpinning) {
            this.refreshBtn.classList.add('is-spinning');
            this.refreshBtn.disabled = true;
        } else {
            this.refreshBtn.classList.remove('is-spinning');
            this.refreshBtn.disabled = false;
        }
    }
}


// =========================================================================
// 6. MAIN APPLICATION CONTROLLER (Lifecycle & Orchestration)
// =========================================================================

class AppController {
    static refreshTimer = null;
    static STALE_THRESHOLD_MS = 30 * 1000; // 30s throttle for visibility re-sync

    static async init() {
        // Initialize UI status tracker & refresh button listeners
        SyncStatusManager.init();

        // 1. Evaluate cache age against 10-minute threshold
        const cached = DataService.getLocalCache();
        const now = Date.now();
        const cacheAge = (cached && cached.timestamp) ? (now - cached.timestamp) : Infinity;
        const isCacheFresh = cached && cached.data && (cacheAge < AppConfig.CACHE_STALE_THRESHOLD_MS);

        if (isCacheFresh) {
            // Case A: Fresh Cache (< 10 minutes) -> Instant render (< 50ms)
            AppController.render(cached.data);
            AppController.hideLoader();
            SyncStatusManager.setSyncing('Updating telemetry in background...');

            // Background re-sync (12s allowance)
            await AppController.refresh({ force: false, timeoutMs: AppConfig.MANUAL_FETCH_TIMEOUT_MS });
        } else {
            // Case B: Stale Cache (> 10 minutes) or No Cache -> Keep loading screen up
            SyncStatusManager.setOverlaySubtext('Syncing latest pond telemetry from station...');
            SyncStatusManager.setSyncing('Connecting to station (max 8s)...');

            // Blocking fetch with 8-second limit
            const result = await DataService.fetchNetwork(
                false, 
                AppConfig.INITIAL_FETCH_TIMEOUT_MS, 
                (progressText) => SyncStatusManager.setProgressText(progressText)
            );

            if (result && (result.status === 'success' || result.status === 'mock' || result.status === 'mock_live_feed')) {
                // Fresh data received within 8 seconds!
                AppController.render(result.data);
                AppController.hideLoader();
                SyncStatusManager.setLive(DataService.lastFetchTimestamp || Date.now());
            } else if (result && (result.status === 'timeout_fallback' || result.status === 'error_fallback') && result.data) {
                // 8s timeout or network error occurred -> fallback to cached data
                AppController.render(result.data);
                AppController.hideLoader();
                SyncStatusManager.setStale(result.cacheTimestamp, result.error === 'timeout' ? 'timeout' : 'error');
            } else if (cached && cached.data) {
                // Secondary fallback if fetchNetwork returned null or errored
                AppController.render(cached.data);
                AppController.hideLoader();
                SyncStatusManager.setStale(cached.timestamp, 'timeout');
            } else {
                // Zero cache available (first load offline)
                AppController.hideLoader();
                SyncStatusManager.setError('Connection failed. No offline data available. [Retry]');
            }
        }

        // 2. Set recurring background refresh (1 minute interval)
        AppController.startAutoRefresh();

        // 3. Register mobile browser lifecycle listeners (Page Visibility / Tab Wake / Online)
        AppController.registerLifecycleListeners();
    }

    /**
     * Handles manual tap on the Refresh button
     */
    static async handleManualRefresh() {
        if (DataService.isFetching) {
            return;
        }

        if (!navigator.onLine) {
            const cached = DataService.getLocalCache();
            SyncStatusManager.setOffline(
                cached && cached.timestamp 
                    ? `Offline • Saved cache (${SyncStatusManager.formatTime(cached.timestamp)}) [Retry 🔄]`
                    : 'Offline • Reconnect Wi-Fi/4G to refresh'
            );
            return;
        }

        SyncStatusManager.setSyncing('Connecting to station...');

        try {
            const result = await DataService.fetchNetwork(
                true, // bypass server cache
                AppConfig.MANUAL_FETCH_TIMEOUT_MS, // 12 seconds
                (progressText) => SyncStatusManager.setProgressText(progressText)
            );

            if (result && (result.status === 'success' || result.status === 'mock' || result.status === 'mock_live_feed')) {
                AppController.render(result.data);
                SyncStatusManager.setLive(DataService.lastFetchTimestamp || Date.now());
            } else if (result && result.status === 'timeout_fallback') {
                SyncStatusManager.setStale(result.cacheTimestamp, 'timeout');
            } else {
                SyncStatusManager.setError('Response timeout (GAS busy). [Tap to Retry]');
            }
        } catch (e) {
            SyncStatusManager.setError('Network error. [Tap to Retry]');
        }
    }

    /**
     * Periodic background auto-refresh scheduler
     */
    static startAutoRefresh() {
        if (AppController.refreshTimer) {
            clearInterval(AppController.refreshTimer);
        }
        AppController.refreshTimer = setInterval(() => {
            // Only auto-refresh if tab is active/visible and not already fetching
            if (!document.hidden && !DataService.isFetching) {
                AppController.refresh({ force: false, timeoutMs: AppConfig.MANUAL_FETCH_TIMEOUT_MS });
            }
        }, AppConfig.AUTO_REFRESH_INTERVAL_MS);
    }

    /**
     * Registers mobile and browser lifecycle events:
     * - 'visibilitychange': triggers re-fetch when user unlocks phone or switches back to tab
     * - 'pageshow': triggers re-fetch when browser restores page from bfcache (Back/Forward cache)
     * - 'online': triggers re-fetch when network reconnects
     * - 'offline': immediately notifies user of offline status
     */
    static registerLifecycleListeners() {
        // Tab / App focus & mobile phone unlock
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                const timeSinceLastFetch = Date.now() - DataService.lastFetchTimestamp;
                if (timeSinceLastFetch > AppController.STALE_THRESHOLD_MS && !DataService.isFetching) {
                    AppController.refresh({ force: false, timeoutMs: AppConfig.MANUAL_FETCH_TIMEOUT_MS });
                }
            }
        });

        // Mobile Back-Forward Cache (bfcache) resume
        window.addEventListener('pageshow', (event) => {
            if (event.persisted && !DataService.isFetching) {
                AppController.refresh({ force: false, timeoutMs: AppConfig.MANUAL_FETCH_TIMEOUT_MS });
            }
        });

        // Network connection restoration
        window.addEventListener('online', () => {
            SyncStatusManager.setSyncing('Back online. Syncing...');
            AppController.refresh({ force: true, timeoutMs: AppConfig.MANUAL_FETCH_TIMEOUT_MS });
        });

        // Network connection loss
        window.addEventListener('offline', () => {
            const cached = DataService.getLocalCache();
            SyncStatusManager.setOffline(
                cached && cached.timestamp 
                    ? `Offline • Saved cache (${SyncStatusManager.formatTime(cached.timestamp)})` 
                    : 'Offline • No internet connection'
            );
        });
    }

    static async refresh({ force = false, timeoutMs = AppConfig.MANUAL_FETCH_TIMEOUT_MS } = {}) {
        if (!navigator.onLine) {
            const cached = DataService.getLocalCache();
            SyncStatusManager.setOffline(
                cached && cached.timestamp 
                    ? `Offline • Saved cache (${SyncStatusManager.formatTime(cached.timestamp)}) [Retry 🔄]` 
                    : 'Offline • Reconnect to refresh'
            );
            return;
        }

        SyncStatusManager.setSyncing('Checking telemetry...');
        const result = await DataService.fetchNetwork(
            force, 
            timeoutMs, 
            (progressText) => SyncStatusManager.setProgressText(progressText)
        );

        if (result && (result.status === 'success' || result.status === 'mock' || result.status === 'mock_live_feed')) {
            AppController.render(result.data);
            SyncStatusManager.setLive(DataService.lastFetchTimestamp || Date.now());
        } else if (result && result.status === 'timeout_fallback') {
            SyncStatusManager.setStale(result.cacheTimestamp, 'timeout');
        } else {
            const cached = DataService.getLocalCache();
            if (cached && cached.timestamp) {
                SyncStatusManager.setStale(cached.timestamp, 'error');
            }
        }
        AppController.hideLoader();
    }

    static render(data) {
        if (!data) return;

        // 1. Synchronize in-memory thresholds with Code.gs AlertConfig if provided in payload
        if (data.config) {
            AquacultureConfig.syncFromBackend(data.config);
        }

        const analysis = data.analysis || {
            temperature: { min: 28.8, max: 29.9, delta: 1.1, warning: false },
            do: { min: 4.62, max: 5.39, delta: 0.77, warning: false },
            ph: { min: 7.12, max: 7.24, delta: 0.12, warning: false },
            weatherLux: { message: "High Algae Activity", warning: false, avgToday: 61130, avgYest: 58000, avg2DaysAgo: 52000 },
            weatherRain: { message: "Today's rain: 0.00mm", warning: false, sumToday: 0.56, sumYest: 0.0, sum2DaysAgo: 12.4, sum7Day: 47.5 },
            feedingAction: "Normal Feed - Optimal Conditions."
        };

        // Batch component rendering
        PondDetailsRenderer.render(data.pondDetails);
        FeedingActionRenderer.render(analysis, data.raw, data.weeklyMetrics);
        FeedingActivityRenderer.render(data.feedingActivity, data.pondDetails);
        DailyWqRenderer.render(analysis, data.raw);
        WeatherRenderer.render(analysis, data.raw);
        RecentReadingsRenderer.render(data.raw, analysis);
        WeeklyTrendsRenderer.render(data.weeklyMetrics, data.raw, data.pondDetails);
        HistoryRenderer.render(data.history);
    }

    static hideLoader() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay && !overlay.classList.contains('hidden')) {
            overlay.classList.add('hidden');
        }
    }
}

// Global entry point
document.addEventListener('DOMContentLoaded', () => {
    AppController.init();
});
