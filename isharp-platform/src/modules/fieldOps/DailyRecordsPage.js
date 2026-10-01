/**
 * iSHARP DBMS 2.0 — Field Operations: Pond Daily Records Logbook
 * Continuous interactive ledger book for daily pond records:
 * - DOC 1 to Present continuous scrollable timeline
 * - Feeding (kg) & Tray Remnant (%) tracking
 * - Water level (cm) & Water colour observations
 * - Multi-item Minerals Application (Stored in mineral_probiotic_used table)
 * - Multi-item Probiotics Application (Stored in mineral_probiotic_used table)
 * - Total kg / Liters cumulative usage aggregation & reporting
 * - Daily mortality & operational remarks
 * - Direct Supabase persistence with instant upsert & cascade delete
 */

import { DailyRecordsRepository } from "../../infrastructure/repositories/dailyRecordsRepository.js";
import { MineralProbioticRepository } from "../../infrastructure/repositories/mineralProbioticRepository.js";
import { calculateDOC } from "../../domain/biometrics.js";
import { Toast } from "../../components/Toast.js";

/**
 * Returns YYYY-MM-DD in local time without UTC offset skew
 */
function getLocalDateStr(d = new Date()) {
    const dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return "";
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/**
 * Parses YYYY-MM-DD safely into a local Date object
 */
function parseLocalDate(str) {
    if (!str) return new Date();
    if (str instanceof Date) return new Date(str.getFullYear(), str.getMonth(), str.getDate());
    const parts = String(str).split("T")[0].split("-").map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    return new Date(str);
}

/**
 * Formats YYYY-MM-DD to "DD Mon" safely without timezone shifts
 */
function formatLocalDateDisplay(dateStr) {
    if (!dateStr) return "—";
    const d = parseLocalDate(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

// Standard farm chemicals & minerals autocomplete list (from iSHARP Farm Inventory)
const STANDARD_MINERALS = [
    "CALCIUM CARBONATE",
    "CALCIUM HYDROXIDE (LIME)",
    "DOLOMITE",
    "SODIUM CARBONATE (Na2CO3)",
    "SODIUM BICARBONATE",
    "MAGNESIUM CHLORIDE (MgCl2)",
    "MAGNESIUM SULPHATE (MgSO4)",
    "POTASSIUM CHLORIDE (KCl)",
    "POTASSIUM PERMANGANATE",
    "CALCIUM HYPOCHLORITE 65%",
    "COPPER SULPHATE (CuSO4)",
    "ZEOLITE",
    "AGRICULTURAL LIME"
];

// Standard probiotics & fermentation products list
const STANDARD_PROBIOTICS = [
    "SUPER MS",
    "EM BOKASHI",
    "FOS 50",
    "RICE BRAN",
    "BACILLUS SUBTILIS",
    "SUPER PS",
    "MOLASSES",
    "YEAST FERMENT",
    "LACTOBACILLUS MIX",
    "RHODOPSEUDOMONAS"
];

// Realistic Aquaculture Pond Water Colour Swatches (True 3D CSS Orbs + Simple Names)
const WATER_COLOUR_OPTIONS = [
    {
        value: "Light Green",
        label: "Lt Green",
        fullLabel: "Lt Green",
        orbBg: "radial-gradient(circle at 35% 30%, #ecfccb 0%, #a3e635 55%, #65a30d 100%)",
        orbBorder: "#4d7c0f"
    },
    {
        value: "Green",
        label: "Green",
        fullLabel: "Green",
        orbBg: "radial-gradient(circle at 35% 30%, #bbf7d0 0%, #22c55e 55%, #15803d 100%)",
        orbBorder: "#15803d"
    },
    {
        value: "Dark Green",
        label: "Dk Green",
        fullLabel: "Dk Green",
        orbBg: "radial-gradient(circle at 35% 30%, #4ade80 0%, #14532d 60%, #052e16 100%)",
        orbBorder: "#052e16"
    },
    {
        value: "Brownish Green",
        label: "Brn Green",
        fullLabel: "Brn Green",
        orbBg: "radial-gradient(circle at 35% 30%, #bef264 0%, #656d1b 52%, #422006 100%)",
        orbBorder: "#3f3f14"
    },
    {
        value: "Tea",
        aliases: ["Tea / Light Brown", "Tea Brown", "Tea Brn"],
        label: "Tea",
        fullLabel: "Tea",
        orbBg: "radial-gradient(circle at 35% 30%, #fde68a 0%, #d97706 55%, #92400e 100%)",
        orbBorder: "#92400e"
    },
    {
        value: "Brown",
        label: "Brown",
        fullLabel: "Brown",
        orbBg: "radial-gradient(circle at 35% 30%, #bcaaa4 0%, #5d4037 55%, #271206 100%)",
        orbBorder: "#271206"
    },
    {
        value: "Clear",
        label: "Clear",
        fullLabel: "Clear",
        orbBg: "radial-gradient(circle at 35% 30%, #ffffff 0%, #e0f2fe 55%, #7dd3fc 100%)",
        orbBorder: "#0284c7"
    },
    {
        value: "Turbid",
        label: "Turbid",
        fullLabel: "Turbid",
        orbBg: "radial-gradient(circle at 35% 30%, #e2e8f0 0%, #94a3b8 55%, #475569 100%)",
        orbBorder: "#475569"
    }
];

function getWaterColourMeta(val) {
    if (!val) return null;
    const norm = String(val).trim().toLowerCase();
    return WATER_COLOUR_OPTIONS.find(o =>
        o.value.toLowerCase() === norm ||
        o.label.toLowerCase() === norm ||
        (o.aliases && o.aliases.some(a => a.toLowerCase() === norm))
    ) || null;
}

export class DailyRecordsPage {
    /**
     * @param {string} containerId Element ID where page is mounted
     * @param {object} callbacks Navigation callbacks { onBackToPond, onBackToMap, onRecordSaved, onCloseQuickModal }
     */
    constructor(containerId = "field-ops-daily-records-mount", callbacks = {}) {
        this.container = document.getElementById(containerId);
        this.callbacks = callbacks;
        this.currentPond = null;
        this.activePondsList = [];
        this.isModalOnlyMode = false;
        this.records = [];
        this.treatments = [];
        this.usageSummary = { minerals: [], probiotics: [], totalMineralKg: 0, totalProbioticL: 0 };
        this.treatmentsByDate = new Map();
        this.activeModalRecord = null;
    }

    /**
     * Loads records, treatments, and cycle usage summary for a pond
     */
    async loadPondData(pond) {
        this.currentPond = pond;
        try {
            const [records, treatments, summary] = await Promise.all([
                DailyRecordsRepository.getRecordsForPond(pond.pond_index),
                MineralProbioticRepository.getTreatmentsForPond(pond.pond_index),
                MineralProbioticRepository.getCycleUsageSummary(pond.pond_index)
            ]);

            this.records = records || [];
            this.treatments = treatments || [];
            this.usageSummary = summary || { minerals: [], probiotics: [], totalMineralKg: 0, totalProbioticL: 0 };

            // Group treatments by date
            this.treatmentsByDate.clear();
            this.treatments.forEach(t => {
                const list = this.treatmentsByDate.get(t.log_date) || [];
                list.push(t);
                this.treatmentsByDate.set(t.log_date, list);
            });

        } catch (err) {
            console.error("Failed to load records & treatments:", err);
            this.records = [];
            this.treatments = [];
        }
    }

    /**
     * Renders the Daily Records Logbook for a pond cycle
     * @param {object} pond Cycle record
     * @param {Array} activePondsList Optional list of active ponds in the module for sequential switching
     */
    async render(pond, activePondsList = []) {
        this.isModalOnlyMode = false;
        if (this.container) {
            this.container.classList.remove("daily-mount-modal-only");
        }
        if (activePondsList && activePondsList.length > 0) {
            this.activePondsList = activePondsList;
        }
        if (!this.container) return;

        this.container.innerHTML = `
            <div style="padding: 2.5rem 1.5rem; text-align: center; color: #0284c7; font-weight: 700;">
                <div class="spinner" style="margin: 0 auto 0.75rem auto;"></div>
                <span>Loading Daily Records Logbook for Pond ${pond.pond || pond.pond_index}...</span>
            </div>
        `;

        await this.loadPondData(pond);
        this.renderView();
    }

    /**
     * Opens Today's Entry Modal directly over the 24-Pond Map in 1 tap
     * @param {object} pond Cycle record
     * @param {Array} activePondsList List of active ponds in module for sequential "Save & Next"
     */
    async openQuickModal(pond, activePondsList = []) {
        this.isModalOnlyMode = true;
        if (activePondsList && activePondsList.length > 0) {
            this.activePondsList = activePondsList;
        }
        if (!this.container) return;

        await this.loadPondData(pond);
        this.renderView();

        const todayStr = getLocalDateStr();
        const existing = this.records.find(r => r.log_date === todayStr) || null;
        this.openEntryModal(todayStr, existing, { autoFocusFeed: false });
    }

    renderView() {
        const pond = this.currentPond;
        if (!pond || !this.container) return;

        const pondLabel = pond.pond || pond.pond_index || "Pond";
        const doc = calculateDOC(pond.stck_date, pond.date_close);
        const areaHa = parseFloat(pond.area) || 0.50;
        const stckDateStr = pond.stck_date ? new Date(pond.stck_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : "Not Stocked";

        // Calculate cycle totals
        let totalFeedKg = 0;
        let trayRemnantSum = 0;
        let trayRemnantCount = 0;
        let totalMortalitiesKg = 0;

        this.records.forEach(r => {
            if (r.feed_kg) totalFeedKg += parseFloat(r.feed_kg || 0);
            if (r.feed_tray_remnant_pct !== null && r.feed_tray_remnant_pct !== undefined) {
                trayRemnantSum += parseInt(r.feed_tray_remnant_pct, 10);
                trayRemnantCount++;
            }
            const mortVal = (r.mortality_kg !== undefined && r.mortality_kg !== null)
                ? parseFloat(r.mortality_kg)
                : (r.mortality_count ? parseFloat(r.mortality_count) : 0);
            if (!isNaN(mortVal)) totalMortalitiesKg += mortVal;
        });

        const avgTrayRemnant = trayRemnantCount > 0 ? Math.round(trayRemnantSum / trayRemnantCount) : 0;

        // Build continuous timeline rows from DOC 1 to Today
        const timelineRows = this.buildTimelineRows();

        this.container.innerHTML = `
            <div class="daily-records-page-wrapper" style="padding: 1.25rem 2rem; max-width: 1350px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.4rem;">
                
                <!-- 1. Breadcrumbs & Top Navigation Bar -->
                <div class="daily-nav-bar flex-between" style="background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 1); border-radius: 16px; padding: 0.85rem 1.4rem; box-shadow: 0 4px 20px rgba(2, 132, 199, 0.08); flex-wrap: wrap; gap: 0.75rem;">
                    <div class="btn-group" style="display: flex; align-items: center; gap: 0.75rem;">
                        <button type="button" id="btn-daily-back-pond" class="btn-action btn-secondary" style="font-size: 0.8rem; font-weight: 700; padding: 0.4rem 0.85rem;">
                            <span class="btn-text-full">← Back to Pond View</span>
                            <span class="btn-text-short">← Pond View</span>
                        </button>
                        <button type="button" id="btn-daily-back-map" class="btn-action btn-secondary" style="font-size: 0.8rem; font-weight: 700; padding: 0.4rem 0.85rem;">
                            <span class="btn-text-full">🗺️ Back to 24-Pond Map</span>
                            <span class="btn-text-short">🗺️ Back to Map</span>
                        </button>
                    </div>

                    <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
                        <span style="font-size: 0.78rem; font-weight: 800; background: #e0f2fe; color: #0284c7; padding: 0.25rem 0.65rem; border-radius: 999px;">
                            Pond ${pondLabel}
                        </span>
                        <span style="font-size: 0.78rem; font-weight: 800; background: #dcfce7; color: #166534; padding: 0.25rem 0.65rem; border-radius: 999px;">
                            Cycle ${pond.cycle_no || (pond.pond_index ? pond.pond_index.split(".")[1] : '—')}
                        </span>
                        <span style="font-size: 0.78rem; font-weight: 800; background: #f1f5f9; color: #475569; padding: 0.25rem 0.65rem; border-radius: 999px;">
                            DOC ${doc || '—'}
                        </span>
                    </div>
                </div>

                <!-- 2. Page Header & Quick Log Action -->
                <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.85rem; flex-wrap: wrap; gap: 1rem;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
                            <span style="font-size: 1.6rem;">📖</span>
                            <h1 style="margin: 0; font-size: 1.45rem; font-weight: 900; color: #0f172a;">
                                Growout Book Records
                            </h1>
                        </div>
                    </div>

                    <div class="daily-quick-actions" style="display: flex; align-items: center; gap: 0.75rem;">
                        <button type="button" id="btn-view-usage-summary" class="btn-action btn-secondary" style="font-size: 0.84rem; font-weight: 700; padding: 0.52rem 1.15rem; display: flex; align-items: center; gap: 0.4rem;">
                            <span class="btn-text-full">📊 Treatment Totals</span>
                            <span class="btn-text-short">📊 Totals</span>
                        </button>
                        <button type="button" id="btn-quick-log-today" class="btn-action btn-primary" style="font-size: 0.88rem; font-weight: 800; padding: 0.55rem 1.35rem; display: flex; align-items: center; gap: 0.5rem; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.3);">
                            <span class="btn-text-full">➕ Log Today (DOC ${doc})</span>
                            <span class="btn-text-short">➕ Log Today</span>
                        </button>
                    </div>
                </div>

                <!-- 3. Cycle Metrics Summary Bar (Feed, Tray %, Mortalities, Mineral & Probiotic Totals) -->
                <div class="daily-metrics-summary-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">
                    
                    <div style="background: rgba(255, 255, 255, 0.95); border: 1px solid #e2e8f0; border-radius: 14px; padding: 0.9rem 1.1rem; box-shadow: 0 2px 10px rgba(0,0,0,0.03);">
                        <span style="font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase;">Stocking Date</span>
                        <div style="font-size: 1.15rem; font-weight: 800; color: #0f172a; margin-top: 0.2rem;">${stckDateStr}</div>
                        <span style="font-size: 0.72rem; color: #0284c7; font-weight: 600;">Area: ${areaHa} Ha</span>
                    </div>

                    <div style="background: rgba(255, 255, 255, 0.95); border: 1px solid #e2e8f0; border-radius: 14px; padding: 0.9rem 1.1rem; box-shadow: 0 2px 10px rgba(0,0,0,0.03);">
                        <span style="font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase;">Total Cumulative Feed</span>
                        <div style="font-size: 1.15rem; font-weight: 800; color: #0369a1; margin-top: 0.2rem;">${totalFeedKg.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg</div>
                        <span style="font-size: 0.72rem; color: #64748b;">${this.records.length} logged days</span>
                    </div>

                    <div style="background: rgba(255, 255, 255, 0.95); border: 1px solid #e2e8f0; border-radius: 14px; padding: 0.9rem 1.1rem; box-shadow: 0 2px 10px rgba(0,0,0,0.03);">
                        <span style="font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase;">Avg Tray Remnant</span>
                        <div style="font-size: 1.15rem; font-weight: 800; color: ${avgTrayRemnant <= 10 ? '#15803d' : avgTrayRemnant <= 20 ? '#b45309' : '#b91c1c'}; margin-top: 0.2rem;">
                            ${avgTrayRemnant}%
                        </div>
                        <span style="font-size: 0.72rem; color: #64748b;">Target: &lt; 10%</span>
                    </div>

                    <div style="background: rgba(255, 255, 255, 0.95); border: 1px solid #e2e8f0; border-radius: 14px; padding: 0.9rem 1.1rem; box-shadow: 0 2px 10px rgba(0,0,0,0.03);">
                        <span style="font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase;">Total Minerals Applied</span>
                        <div style="font-size: 1.15rem; font-weight: 800; color: #0369a1; margin-top: 0.2rem;">
                            ${this.usageSummary.totalMineralKg.toLocaleString()} kg
                        </div>
                        <span style="font-size: 0.72rem; color: #64748b;">${this.usageSummary.minerals.length} distinct mineral types</span>
                    </div>

                    <div style="background: rgba(255, 255, 255, 0.95); border: 1px solid #e2e8f0; border-radius: 14px; padding: 0.9rem 1.1rem; box-shadow: 0 2px 10px rgba(0,0,0,0.03);">
                        <span style="font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase;">Total Probiotics Applied</span>
                        <div style="font-size: 1.15rem; font-weight: 800; color: #92400e; margin-top: 0.2rem;">
                            ${this.usageSummary.totalProbioticL.toLocaleString()} L
                        </div>
                        <span style="font-size: 0.72rem; color: #64748b;">${this.usageSummary.probiotics.length} distinct products</span>
                    </div>

                    <div style="background: rgba(255, 255, 255, 0.95); border: 1px solid #e2e8f0; border-radius: 14px; padding: 0.9rem 1.1rem; box-shadow: 0 2px 10px rgba(0,0,0,0.03);">
                        <span style="font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase;">Total Mortalities</span>
                        <div style="font-size: 1.15rem; font-weight: 800; color: ${totalMortalitiesKg > 0 ? '#b91c1c' : '#15803d'}; margin-top: 0.2rem;">
                            ${totalMortalitiesKg.toFixed(1)} kg
                        </div>
                        <span style="font-size: 0.72rem; color: #64748b;">Observed / scooped</span>
                    </div>

                </div>

                <!-- 4. CONTINUOUS SCROLLABLE LOGBOOK LEDGER (From Day 1 to Today) -->
                <section class="glass-card" style="background: rgba(255, 255, 255, 0.95); border: 1px solid #e2e8f0; border-radius: 16px; padding: 1.25rem 1.4rem; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.6rem; flex-wrap: wrap; gap: 0.5rem;">
                        <div style="display: flex; align-items: center; gap: 0.6rem;">
                            <h2 style="margin: 0; font-size: 1.05rem; font-weight: 800; color: #0284c7;">
                                Logbook Timeline (DOC 1 → DOC ${doc})
                            </h2>
                            <span style="font-size: 0.72rem; font-weight: 700; background: #e0f2fe; color: #0369a1; padding: 0.15rem 0.55rem; border-radius: 6px;">
                                ${timelineRows.length} Days Displayed
                            </span>
                        </div>
                        <span style="font-size: 0.76rem; color: #64748b;">
                            Click any row or <strong>✏️ Edit</strong> to view or modify that day's entry.
                        </span>
                    </div>

                    <!-- Mobile Timeline Card View (Screens <= 768px) -->
                    <div class="daily-mobile-timeline show-mobile" style="display: none; flex-direction: column; gap: 0.65rem;">
                        ${timelineRows.map(row => this.renderMobileCard(row)).join("")}
                    </div>

                    <!-- Scrollable Responsive Table Container (Screens > 768px) -->
                    <div class="logbook-table-container hide-mobile" style="overflow-x: auto; max-height: 650px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 12px;">
                        <table style="width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.82rem; text-align: left;">
                            <thead style="position: sticky; top: 0; background: #f8fafc; z-index: 10; box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
                                <tr style="color: #475569; font-size: 0.74rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em;">
                                    <th style="padding: 0.75rem 0.85rem; border-bottom: 2px solid #cbd5e1; width: 75px;">DOC</th>
                                    <th style="padding: 0.75rem 0.85rem; border-bottom: 2px solid #cbd5e1; width: 105px;">Date</th>
                                    <th style="padding: 0.75rem 0.85rem; border-bottom: 2px solid #cbd5e1; width: 95px;">Feed (kg)</th>
                                    <th style="padding: 0.75rem 0.85rem; border-bottom: 2px solid #cbd5e1; width: 100px;">Tray Left</th>
                                    <th style="padding: 0.75rem 0.85rem; border-bottom: 2px solid #cbd5e1; width: 95px;">Water Lvl</th>
                                    <th style="padding: 0.75rem 0.85rem; border-bottom: 2px solid #cbd5e1; width: 120px;">Colour</th>
                                    <th style="padding: 0.75rem 0.85rem; border-bottom: 2px solid #cbd5e1; min-width: 180px;">Minerals Applied</th>
                                    <th style="padding: 0.75rem 0.85rem; border-bottom: 2px solid #cbd5e1; min-width: 180px;">Probiotics Applied</th>
                                    <th style="padding: 0.75rem 0.85rem; border-bottom: 2px solid #cbd5e1; width: 95px;">Mort. (kg)</th>
                                    <th style="padding: 0.75rem 0.85rem; border-bottom: 2px solid #cbd5e1; min-width: 140px;">Remarks</th>
                                    <th style="padding: 0.75rem 0.85rem; border-bottom: 2px solid #cbd5e1; width: 85px; text-align: center;">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${timelineRows.map(row => this.renderTableRow(row)).join("")}
                            </tbody>
                        </table>
                    </div>
                </section>

                <!-- 5. ENTRY / EDIT MODAL (100% FRUTIGER AERO PREVIEW PARITY) -->
                <div id="modal-daily-entry" class="modal-backdrop-aero" style="display: none;">
                    <form id="form-daily-record" class="modal-sheet-aero" novalidate style="margin: 0;">
                        
                        <!-- Modal Sheet Header with Pond Title & Close -->
                        <div class="modal-sheet-header">
                            <div>
                                <div class="modal-sheet-title">
                                    <span style="font-size: 1.25rem;">⚡</span>
                                    <span id="modal-entry-title">Pond ${pondLabel} — Daily Log</span>
                                </div>
                                <span id="modal-entry-subtitle" style="font-size: 0.72rem; color: #64748b; margin-left: 28px; display: block;">1-tap rapid field logging</span>
                            </div>
                            <button type="button" id="btn-close-entry-modal" class="aero-btn aero-btn-secondary" style="padding: 4px 12px; min-height: 32px; font-size: 0.78rem;">
                                ✕ Close
                            </button>
                        </div>

                        <!-- Autocomplete Datalists -->
                        <datalist id="minerals-autocomplete">
                            ${STANDARD_MINERALS.map(m => `<option value="${m}"></option>`).join("")}
                        </datalist>
                        <datalist id="probiotics-autocomplete">
                            ${STANDARD_PROBIOTICS.map(p => `<option value="${p}"></option>`).join("")}
                        </datalist>

                        <!-- Modal Sheet Body (Scrollable) -->
                        <div class="modal-sheet-body">

                                <!-- Sequential Pond Switcher Bar (When multiple active ponds exist in module) -->
                                ${(this.activePondsList && this.activePondsList.length > 1) ? (() => {
                                    const currIdx = this.activePondsList.findIndex(p =>
                                        (p.pond_index && p.pond_index === pond.pond_index) ||
                                        (p.pond && p.pond === pond.pond)
                                    );
                                    const displayIdx = currIdx >= 0 ? currIdx + 1 : 1;
                                    return `
                                        <div id="modal-pond-switcher-bar" style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background: rgba(224, 242, 254, 0.75); border: 1.5px solid #bae6fd; border-radius: 14px; padding: 0.45rem 0.75rem; flex-shrink: 0;">
                                            <button type="button" id="btn-modal-prev-pond" class="btn-modal-pond-nav aero-btn aero-btn-secondary" style="padding: 0.35rem 0.65rem; font-size: 0.76rem; min-height: 32px;">
                                                ◀ Prev
                                            </button>
                                            <div style="text-align: center; flex: 1; min-width: 0; padding: 0 0.35rem;">
                                                <div style="font-family: 'Space Grotesk', monospace; font-size: 0.92rem; font-weight: 900; color: #0284c7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                                    Pond ${pondLabel} · DOC ${doc || '—'}
                                                </div>
                                                <div style="font-size: 0.7rem; font-weight: 700; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                                    Active Pond ${displayIdx} of ${this.activePondsList.length}
                                                    ${this.isModalOnlyMode ? ` · <button type="button" id="btn-modal-open-full-book" style="background: none; border: none; color: #0284c7; font-weight: 800; font-size: 0.7rem; text-decoration: underline; cursor: pointer; padding: 0;">📖 Full Book</button>` : ''}
                                                </div>
                                            </div>
                                            <button type="button" id="btn-modal-next-pond" class="btn-modal-pond-nav aero-btn aero-btn-secondary" style="padding: 0.35rem 0.65rem; font-size: 0.76rem; min-height: 32px;">
                                                Next ▶
                                            </button>
                                        </div>
                                    `;
                                })() : ''}

                                <!-- Smart Yesterday Carry-Forward Banner -->
                                <div id="carry-forward-badge" style="display: none; background: rgba(224, 242, 254, 0.75); border: 1.5px solid #bae6fd; border-radius: 12px; padding: 8px 12px; font-size: 0.75rem; color: #0369a1; font-weight: 700; align-items: center; justify-content: space-between; gap: 6px; flex-shrink: 0;">
                                    <span id="carry-forward-text">↺ Pre-filled from yesterday (tap steppers to adjust)</span>
                                    <span style="font-size: 0.66rem; background: #dcfce7; color: #15803d; padding: 0.15rem 0.55rem; border-radius: 999px; font-weight: 800; white-space: nowrap;">Smart Fill</span>
                                </div>

                                <!-- Date & DOC Selector -->
                                <div class="form-aero-section" style="padding: 0.85rem 1.1rem;">
                                    <div style="display: grid; grid-template-columns: 1fr 125px; gap: 0.85rem; align-items: center;">
                                        <div>
                                            <label style="font-size: 0.76rem; font-weight: 800; color: var(--aero-deep-ocean); display: block; margin-bottom: 0.25rem;">
                                                📅 Record Date
                                            </label>
                                            <input type="date" id="input-entry-date" class="form-control" style="font-size: 0.9rem; font-weight: 700; padding: 0.45rem 0.75rem; border-radius: 10px; border: 1.5px solid #cbd5e1; width: 100%; box-sizing: border-box;" required />
                                        </div>
                                        <div style="text-align: center; background: rgba(240, 249, 255, 0.8); border: 1px solid #bae6fd; border-radius: 10px; padding: 0.4rem 0.5rem;">
                                            <span style="font-size: 0.68rem; font-weight: 700; color: #64748b; display: block;">Culture Age</span>
                                            <div id="modal-calc-doc" style="font-family: 'Space Grotesk', monospace; font-size: 1.15rem; font-weight: 800; color: #0284c7; margin-top: 0.1rem;">
                                                DOC —
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 1. FEED TODAY (KG) WITH TACTILE CONVEX STEPPERS -->
                                <div class="form-aero-section">
                                    <div class="form-section-label">
                                        <span>🦐 Daily Feed (kg)</span>
                                        <span id="feed-yesterday-hint" style="color: var(--aero-cerulean); font-size: 0.72rem; font-weight: 700;">Tap steppers to adjust</span>
                                    </div>
                                    <input type="number" id="input-feed-kg" class="aero-num-input" step="0.1" min="0" placeholder="0.0" />
                                    <div class="stepper-row">
                                        <button type="button" class="aero-stepper-btn btn-feed-stepper" data-step="-5">-5</button>
                                        <button type="button" class="aero-stepper-btn btn-feed-stepper" data-step="-1">-1</button>
                                        <button type="button" class="aero-stepper-btn btn-feed-stepper" data-step="1">+1</button>
                                        <button type="button" class="aero-stepper-btn btn-feed-stepper" data-step="5">+5</button>
                                    </div>
                                </div>

                                <!-- 2. TRAY REMNANT LEFTOVER (%) WITH TACTILE CHIPS -->
                                <div class="form-aero-section">
                                    <div class="form-section-label">
                                        <span>🍽️ Tray Remnant Leftover (%)</span>
                                        <span style="color: var(--aero-cerulean); font-size: 0.72rem; font-weight: 700;">Consumption assessment</span>
                                    </div>
                                    <input type="number" id="input-tray-pct" class="aero-num-input" step="1" min="0" max="100" placeholder="0" />
                                    <div class="stepper-row">
                                        <button type="button" class="aero-stepper-btn btn-tray-chip" data-pct="0">0%</button>
                                        <button type="button" class="aero-stepper-btn btn-tray-chip" data-pct="5">5%</button>
                                        <button type="button" class="aero-stepper-btn btn-tray-chip" data-pct="10">10%</button>
                                        <button type="button" class="aero-stepper-btn btn-tray-chip" data-pct="15">15%</button>
                                        <button type="button" class="aero-stepper-btn btn-tray-chip" data-pct="25">25%</button>
                                    </div>
                                </div>

                                <!-- 3. WATER LEVEL (CM) WITH TACTILE STEPPERS -->
                                <div class="form-aero-section">
                                    <div class="form-section-label">
                                        <span>🌊 Water Level / Depth (cm)</span>
                                        <span style="color: var(--aero-cerulean); font-size: 0.72rem; font-weight: 700;">Target: 110 cm</span>
                                    </div>
                                    <input type="number" id="input-water-level" class="aero-num-input" step="1" min="0" placeholder="110" />
                                    <div class="stepper-row">
                                        <button type="button" class="aero-stepper-btn btn-water-stepper" data-step="-5">-5</button>
                                        <button type="button" class="aero-stepper-btn btn-water-stepper" data-step="-2">-2</button>
                                        <button type="button" class="aero-stepper-btn btn-water-stepper" data-step="2">+2</button>
                                        <button type="button" class="aero-stepper-btn btn-water-stepper" data-step="5">+5</button>
                                    </div>
                                </div>

                                <!-- 4. OBSERVED WATER COLOUR: 3D RADIAL-GRADIENT GLASS ORBS (4x2 Grid) -->
                                <div class="form-aero-section">
                                    <div class="form-section-label">
                                        <span>🎨 Observed Water Colour</span>
                                        <span id="selected-colour-label" style="color: #059669; font-weight: 800; font-size: 0.82rem;">Lt Green</span>
                                    </div>
                                    <!-- Hidden select synced for form submission -->
                                    <select id="select-water-colour" style="display: none;">
                                        <option value="">— Select Water Colour —</option>
                                        ${WATER_COLOUR_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join("")}
                                    </select>
                                    <div class="water-orbs-grid">
                                        ${WATER_COLOUR_OPTIONS.map(o => `
                                            <div class="water-swatch-card btn-colour-chip" data-colour="${o.value}">
                                                <div class="water-sphere" style="background: ${o.orbBg}; border-color: ${o.orbBorder};"></div>
                                                <span class="swatch-name">${o.label}</span>
                                            </div>
                                        `).join("")}
                                    </div>
                                </div>

                                <!-- 5. DAILY MORTALITY IN KG (Rule 8) -->
                                <div class="form-aero-section">
                                    <div class="form-section-label">
                                        <span>⚠️ Scooped Mortality (kg)</span>
                                        <span style="color: var(--aero-ink-subtle); font-size: 0.72rem; font-weight: 700;">Kilograms only</span>
                                    </div>
                                    <input type="number" id="input-mortality" class="aero-num-input" min="0" step="0.1" placeholder="0.0" />
                                </div>

                                <!-- 6. OBSERVATIONS & REMARKS -->
                                <div class="form-aero-section">
                                    <div class="form-section-label">
                                        <span>📝 Daily Observations &amp; Remarks</span>
                                    </div>
                                    <input type="text" id="input-remarks" class="form-control" placeholder="e.g. Shrimp active on trays, liming after rain..." style="width: 100%; font-size: 0.88rem; padding: 0.65rem 0.85rem; border-radius: 10px; border: 1.5px solid #cbd5e1; box-sizing: border-box;" />
                                </div>

                                <!-- 7. PROGRESSIVE DISCLOSURE: OPTIONAL TREATMENTS BAR -->
                                <div class="optional-sections-toggle-bar" style="display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; background: rgba(248, 250, 252, 0.8); padding: 0.55rem 0.8rem; border-radius: 12px; border: 1px dashed #cbd5e1;">
                                    <span style="font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase;">Optional Treatments:</span>
                                    <button type="button" id="btn-toggle-minerals-sec" class="quick-toggle-pill">🧪 + Minerals</button>
                                    <button type="button" id="btn-toggle-probiotics-sec" class="quick-toggle-pill">🦠 + Probiotics</button>
                                </div>

                                <!-- Collapsible Section: Minerals Applied (Stored in mineral_probiotic_used) -->
                                <div id="section-minerals-card" class="form-aero-section" style="display: none; border-color: #bae6fd;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;">
                                        <div>
                                            <h4 style="margin: 0; font-size: 0.86rem; font-weight: 800; color: #0284c7; display: flex; align-items: center; gap: 0.4rem;">
                                                <span>🧪 Minerals &amp; Chemical Treatments</span>
                                            </h4>
                                            <span style="font-size: 0.7rem; color: #64748b;">Recorded in <code>mineral_probiotic_used</code> for kg summation</span>
                                        </div>
                                        <button type="button" id="btn-add-mineral-row" class="aero-btn aero-btn-secondary" style="font-size: 0.75rem; font-weight: 700; padding: 0.25rem 0.65rem; min-height: 28px;">
                                            <span>+ Add Mineral</span>
                                        </button>
                                    </div>
                                    <div id="mineral-rows-container" style="display: flex; flex-direction: column; gap: 0.5rem;">
                                        <!-- Dynamic Mineral Rows injected here -->
                                    </div>
                                </div>

                                <!-- Collapsible Section: Probiotics Applied (Stored in mineral_probiotic_used) -->
                                <div id="section-probiotics-card" class="form-aero-section" style="display: none; border-color: #fde68a;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;">
                                        <div>
                                            <h4 style="margin: 0; font-size: 0.86rem; font-weight: 800; color: #92400e; display: flex; align-items: center; gap: 0.4rem;">
                                                <span>🦠 Probiotics &amp; Ferments Applied</span>
                                            </h4>
                                            <span style="font-size: 0.7rem; color: #64748b;">Recorded in <code>mineral_probiotic_used</code> for L/kg summation</span>
                                        </div>
                                        <button type="button" id="btn-add-probiotic-row" class="aero-btn aero-btn-secondary" style="font-size: 0.75rem; font-weight: 700; padding: 0.25rem 0.65rem; min-height: 28px;">
                                            <span>+ Add Probiotic</span>
                                        </button>
                                    </div>
                                    <div id="probiotic-rows-container" style="display: flex; flex-direction: column; gap: 0.5rem;">
                                        <!-- Dynamic Probiotic Rows injected here -->
                                    </div>
                                </div>

                            </div>

                            <!-- Sticky Floating Aero Dock Footer (100% Preview Design) -->
                            <div class="modal-sheet-footer">
                                <button type="button" id="btn-delete-entry" class="aero-btn aero-btn-secondary" title="Delete Record" style="font-size: 0.82rem; color: #ef4444; border-color: #fecaca; display: none;">
                                    🗑️
                                </button>
                                <button type="button" id="btn-cancel-modal" class="aero-btn aero-btn-secondary" style="flex: 1;">
                                    Cancel
                                </button>
                                <button type="submit" id="btn-save-record" class="aero-btn aero-btn-secondary" style="flex: 1; color: #0284c7; font-weight: 800;">
                                    💾 Save
                                </button>
                                ${(this.activePondsList && this.activePondsList.length > 1) ? `
                                    <button type="button" id="btn-save-and-next" class="aero-btn aero-btn-primary" style="flex: 2;">
                                        ⚡ Save &amp; Next ➔
                                    </button>
                                ` : ''}
                            </div>

                        </form>
                </div>

                <!-- 6. TREATMENT TOTALS SUMMARY MODAL -->
                <div id="modal-usage-summary" class="modal-overlay" style="display: none; align-items: center; justify-content: center; z-index: 9999;">
                    <div class="modal-dialog modal-glass" style="max-width: 650px; width: 92%; max-height: 85vh; overflow-y: auto; padding: 1.75rem 2rem; border-radius: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.75rem;">
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <span style="font-size: 1.4rem;">📊</span>
                                <h3 style="margin: 0; font-size: 1.25rem; font-weight: 900; color: #0f172a;">
                                    Cumulative Treatment Summary — Pond ${pondLabel}
                                </h3>
                            </div>
                            <button type="button" id="btn-close-usage-modal" style="background: none; border: none; font-size: 1.4rem; color: #64748b; cursor: pointer; padding: 0.2rem 0.5rem;">✕</button>
                        </div>

                        <!-- Minerals Table -->
                        <h4 style="margin: 0 0 0.5rem 0; font-size: 0.92rem; font-weight: 800; color: #0284c7;">
                            🧪 Total Minerals Used (${this.usageSummary.totalMineralKg.toLocaleString()} kg total)
                        </h4>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; font-size: 0.84rem;">
                            <thead>
                                <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left; color: #475569;">
                                    <th style="padding: 0.5rem 0.75rem;">Mineral Item</th>
                                    <th style="padding: 0.5rem 0.75rem; text-align: right;">Total Applied</th>
                                    <th style="padding: 0.5rem 0.75rem; text-align: center;">Times Used</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.usageSummary.minerals.length > 0 ? this.usageSummary.minerals.map(m => `
                                    <tr style="border-bottom: 1px solid #f1f5f9;">
                                        <td style="padding: 0.55rem 0.75rem; font-weight: 700; color: #0f172a;">${m.item_name}</td>
                                        <td style="padding: 0.55rem 0.75rem; text-align: right; font-weight: 800; color: #0369a1;">${m.total_amount.toLocaleString()} ${m.unit}</td>
                                        <td style="padding: 0.55rem 0.75rem; text-align: center; color: #64748b;">${m.count} days</td>
                                    </tr>
                                `).join("") : `
                                    <tr>
                                        <td colspan="3" style="padding: 0.75rem; text-align: center; color: #94a3b8; font-style: italic;">No minerals applied yet</td>
                                    </tr>
                                `}
                            </tbody>
                        </table>

                        <!-- Probiotics Table -->
                        <h4 style="margin: 0 0 0.5rem 0; font-size: 0.92rem; font-weight: 800; color: #92400e;">
                            🦠 Total Probiotics &amp; Ferments Used (${this.usageSummary.totalProbioticL.toLocaleString()} L total)
                        </h4>
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.84rem;">
                            <thead>
                                <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left; color: #475569;">
                                    <th style="padding: 0.5rem 0.75rem;">Probiotic / Product</th>
                                    <th style="padding: 0.5rem 0.75rem; text-align: right;">Total Applied</th>
                                    <th style="padding: 0.5rem 0.75rem; text-align: center;">Times Used</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.usageSummary.probiotics.length > 0 ? this.usageSummary.probiotics.map(p => `
                                    <tr style="border-bottom: 1px solid #f1f5f9;">
                                        <td style="padding: 0.55rem 0.75rem; font-weight: 700; color: #0f172a;">${p.item_name}</td>
                                        <td style="padding: 0.55rem 0.75rem; text-align: right; font-weight: 800; color: #92400e;">${p.total_amount.toLocaleString()} ${p.unit}</td>
                                        <td style="padding: 0.55rem 0.75rem; text-align: center; color: #64748b;">${p.count} days</td>
                                    </tr>
                                `).join("") : `
                                    <tr>
                                        <td colspan="3" style="padding: 0.75rem; text-align: center; color: #94a3b8; font-style: italic;">No probiotics applied yet</td>
                                    </tr>
                                `}
                            </tbody>
                        </table>

                        <div style="text-align: right; margin-top: 1.5rem;">
                            <button type="button" id="btn-close-usage-modal-bottom" class="btn-action btn-secondary" style="font-size: 0.84rem; padding: 0.45rem 1.25rem;">
                                Close
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        `;

        this.bindEvents();
    }

    /**
     * Builds continuous array of daily timeline rows from DOC 1 to today.
     * Matches existing records with timeline dates.
     */
    buildTimelineRows() {
        const pond = this.currentPond;
        const recordsMap = new Map();
        this.records.forEach(r => {
            recordsMap.set(r.log_date, r);
        });

        const rows = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = getLocalDateStr(today);

        let startDate;
        if (pond.stck_date) {
            startDate = parseLocalDate(pond.stck_date);
            startDate.setHours(0, 0, 0, 0);
        } else {
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 14);
        }

        let cur = new Date(startDate);
        while (cur <= today) {
            const dateStr = getLocalDateStr(cur);
            const doc = pond.stck_date ? calculateDOC(pond.stck_date, dateStr) : 0;
            const existing = recordsMap.get(dateStr) || null;

            rows.push({
                dateStr,
                doc,
                isToday: dateStr === todayStr,
                record: existing,
                treatments: this.treatmentsByDate.get(dateStr) || []
            });

            cur.setDate(cur.getDate() + 1);
        }

        this.records.forEach(r => {
            if (!rows.find(x => x.dateStr === r.log_date)) {
                rows.push({
                    dateStr: r.log_date,
                    doc: pond.stck_date ? calculateDOC(pond.stck_date, r.log_date) : 0,
                    isToday: r.log_date === todayStr,
                    record: r,
                    treatments: this.treatmentsByDate.get(r.log_date) || []
                });
            }
        });

        rows.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
        return rows;
    }

    /**
     * Renders a single row in the continuous ledger book
     */
    renderTableRow(row) {
        const { dateStr, doc, isToday, record, treatments } = row;
        const formattedDate = formatLocalDateDisplay(dateStr);

        const rowBg = isToday ? 'background: #f0fdf4;' : '';
        const docBadge = isToday
            ? `<span style="font-size: 0.72rem; font-weight: 800; background: #16a34a; color: #ffffff; padding: 0.15rem 0.5rem; border-radius: 999px;">DOC ${doc} (Today)</span>`
            : `<span style="font-size: 0.72rem; font-weight: 700; background: #e0f2fe; color: #0369a1; padding: 0.15rem 0.5rem; border-radius: 999px;">DOC ${doc}</span>`;

        // Minerals & Probiotics from mineral_probiotic_used
        const mineralsList = treatments.filter(t => t.category === 'MINERAL');
        const probioticsList = treatments.filter(t => t.category === 'PROBIOTIC');

        let mineralsBadges = '<span style="color: #94a3b8;">None</span>';
        if (mineralsList.length > 0) {
            mineralsBadges = `
                <div style="display: flex; flex-wrap: wrap; gap: 0.3rem;">
                    ${mineralsList.map(m => `
                        <span style="font-size: 0.7rem; font-weight: 700; background: #e0f2fe; color: #0369a1; padding: 0.15rem 0.45rem; border-radius: 4px; border: 1px solid #bae6fd;">
                            ${m.item_name}: <strong>${m.amount} ${m.unit}</strong>
                        </span>
                    `).join("")}
                </div>
            `;
        }

        let probioticsBadges = '<span style="color: #94a3b8;">None</span>';
        if (probioticsList.length > 0) {
            probioticsBadges = `
                <div style="display: flex; flex-wrap: wrap; gap: 0.3rem;">
                    ${probioticsList.map(p => `
                        <span style="font-size: 0.7rem; font-weight: 700; background: #fef3c7; color: #92400e; padding: 0.15rem 0.45rem; border-radius: 4px; border: 1px solid #fde68a;">
                            ${p.item_name}: <strong>${p.amount} ${p.unit}</strong>
                        </span>
                    `).join("")}
                </div>
            `;
        }

        if (!record && treatments.length === 0) {
            // Empty / Unlogged Day
            return `
                <tr class="logbook-row" style="border-bottom: 1px dashed #e2e8f0; ${rowBg} transition: background 0.15s ease;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='${isToday ? '#f0fdf4' : ''}'">
                    <td style="padding: 0.65rem 0.85rem; font-weight: 700;">${docBadge}</td>
                    <td style="padding: 0.65rem 0.85rem; color: #64748b; font-weight: 600;">${formattedDate}</td>
                    <td style="padding: 0.65rem 0.85rem; color: #94a3b8;">—</td>
                    <td style="padding: 0.65rem 0.85rem; color: #94a3b8;">—</td>
                    <td style="padding: 0.65rem 0.85rem; color: #94a3b8;">—</td>
                    <td style="padding: 0.65rem 0.85rem; color: #94a3b8;">—</td>
                    <td style="padding: 0.65rem 0.85rem; color: #94a3b8;">—</td>
                    <td style="padding: 0.65rem 0.85rem; color: #94a3b8;">—</td>
                    <td style="padding: 0.65rem 0.85rem; color: #94a3b8;">—</td>
                    <td style="padding: 0.65rem 0.85rem; color: #94a3b8; font-style: italic; font-size: 0.76rem;">No log recorded</td>
                    <td style="padding: 0.65rem 0.85rem; text-align: center;">
                        <button type="button" class="btn-log-day btn-action btn-secondary" data-date="${dateStr}" style="font-size: 0.72rem; font-weight: 700; padding: 0.2rem 0.55rem;">
                            <span>+ Log</span>
                        </button>
                    </td>
                </tr>
            `;
        }

        // Render filled record
        const feedText = (record && record.feed_kg !== null && record.feed_kg !== undefined) ? `${parseFloat(record.feed_kg).toFixed(1)} kg` : '0 kg';
        
        let remnantBadge = '—';
        if (record && record.feed_tray_remnant_pct !== null && record.feed_tray_remnant_pct !== undefined) {
            const pct = parseInt(record.feed_tray_remnant_pct, 10);
            let badgeBg = '#dcfce7';
            let badgeColor = '#15803d';
            if (pct > 20) {
                badgeBg = '#fee2e2';
                badgeColor = '#b91c1c';
            } else if (pct > 10) {
                badgeBg = '#fef3c7';
                badgeColor = '#b45309';
            }
            remnantBadge = `<span style="font-size: 0.72rem; font-weight: 700; background: ${badgeBg}; color: ${badgeColor}; padding: 0.15rem 0.45rem; border-radius: 4px;">${pct}%</span>`;
        }

        const waterLvl = (record && record.water_level_cm) ? `${record.water_level_cm} cm` : '—';
        
        let colourBadge = '—';
        if (record && record.water_colour) {
            const cMeta = getWaterColourMeta(record.water_colour);
            if (cMeta) {
                colourBadge = `<span style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.72rem; font-weight: 700; background: #f8fafc; color: #1e293b; padding: 0.18rem 0.5rem; border-radius: 6px; border: 1px solid #cbd5e1;"><span class="water-swatch-orb" style="width: 11px; height: 11px; background: ${cMeta.orbBg}; border-color: ${cMeta.orbBorder};"></span><span>${cMeta.label}</span></span>`;
            } else {
                colourBadge = `<span style="font-size: 0.72rem; font-weight: 600; background: #f1f5f9; color: #334155; padding: 0.15rem 0.45rem; border-radius: 4px; border: 1px solid #e2e8f0;">${record.water_colour}</span>`;
            }
        }

        const mortKg = (record && record.mortality_kg !== undefined && record.mortality_kg !== null)
            ? parseFloat(record.mortality_kg)
            : ((record && record.mortality_count) ? parseFloat(record.mortality_count) : 0);
        const mortBadge = mortKg > 0 
            ? `<span style="font-size: 0.72rem; font-weight: 800; background: #fee2e2; color: #b91c1c; padding: 0.15rem 0.45rem; border-radius: 4px;">${mortKg.toFixed(1)} kg</span>`
            : `<span style="color: #64748b;">0</span>`;

        const remarksText = (record && record.remarks) ? record.remarks : '—';

        return `
            <tr class="logbook-row" style="border-bottom: 1px solid #e2e8f0; ${rowBg} transition: background 0.15s ease;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='${isToday ? '#f0fdf4' : ''}'">
                <td style="padding: 0.65rem 0.85rem; font-weight: 700;">${docBadge}</td>
                <td style="padding: 0.65rem 0.85rem; font-weight: 700; color: #0f172a;">${formattedDate}</td>
                <td style="padding: 0.65rem 0.85rem; font-weight: 800; color: #0369a1;">${feedText}</td>
                <td style="padding: 0.65rem 0.85rem;">${remnantBadge}</td>
                <td style="padding: 0.65rem 0.85rem; color: #475569; font-weight: 600;">${waterLvl}</td>
                <td style="padding: 0.65rem 0.85rem;">${colourBadge}</td>
                <td style="padding: 0.65rem 0.85rem;">${mineralsBadges}</td>
                <td style="padding: 0.65rem 0.85rem;">${probioticsBadges}</td>
                <td style="padding: 0.65rem 0.85rem;">${mortBadge}</td>
                <td style="padding: 0.65rem 0.85rem; color: #475569; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${remarksText}">
                    ${remarksText}
                </td>
                <td style="padding: 0.65rem 0.85rem; text-align: center;">
                    <button type="button" class="btn-edit-record btn-action btn-secondary" data-date="${dateStr}" style="font-size: 0.72rem; font-weight: 700; padding: 0.2rem 0.55rem;">
                        <span>✏️ Edit</span>
                    </button>
                </td>
            </tr>
        `;
    }

    /**
     * Renders a mobile-optimized card for a single day in the timeline
     */
    renderMobileCard(row) {
        const { dateStr, doc, isToday, record, treatments } = row;
        const formattedDate = formatLocalDateDisplay(dateStr);

        const docBadge = isToday
            ? `<span style="font-size: 0.76rem; font-weight: 900; background: #15803d; color: #ffffff; padding: 0.2rem 0.55rem; border-radius: 6px;">DOC ${doc || '—'} · TODAY</span>`
            : `<span style="font-size: 0.76rem; font-weight: 800; background: #e0f2fe; color: #0284c7; padding: 0.2rem 0.55rem; border-radius: 6px;">DOC ${doc || '—'}</span>`;

        let remnantBadge = '—';
        if (record && record.feed_tray_remnant_pct !== null && record.feed_tray_remnant_pct !== undefined) {
            const pct = parseInt(record.feed_tray_remnant_pct, 10);
            let badgeBg = '#dcfce7';
            let badgeColor = '#15803d';
            if (pct > 20) {
                badgeBg = '#fee2e2';
                badgeColor = '#b91c1c';
            } else if (pct > 10) {
                badgeBg = '#fef3c7';
                badgeColor = '#b45309';
            }
            remnantBadge = `<span style="font-size: 0.75rem; font-weight: 800; background: ${badgeBg}; color: ${badgeColor}; padding: 0.15rem 0.45rem; border-radius: 4px;">${pct}%</span>`;
        }

        const feedText = (record && record.feed_kg) ? `${parseFloat(record.feed_kg).toFixed(1)} kg` : '—';
        const waterLvl = (record && record.water_level_cm) ? `${record.water_level_cm} cm` : '—';
        const mortKg = (record && record.mortality_kg !== undefined && record.mortality_kg !== null)
            ? parseFloat(record.mortality_kg)
            : ((record && record.mortality_count) ? parseFloat(record.mortality_count) : 0);
        const remarksText = (record && record.remarks) ? record.remarks : '';

        return `
            <div class="daily-mobile-card" style="background: ${isToday ? '#f0fdf4' : '#ffffff'}; border: 1.5px solid ${isToday ? '#86efac' : '#e2e8f0'}; border-radius: 12px; padding: 0.85rem 1rem; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.65rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        ${docBadge}
                        <strong style="font-size: 0.88rem; color: #0f172a;">${formattedDate}</strong>
                    </div>
                    ${record ? `
                        <button type="button" class="btn-edit-record btn-action btn-secondary" data-date="${dateStr}" style="font-size: 0.76rem; font-weight: 700; padding: 0.35rem 0.85rem; border-radius: 8px;">
                            <span>✏️ Edit</span>
                        </button>
                    ` : `
                        <button type="button" class="btn-log-day btn-action btn-primary" data-date="${dateStr}" style="font-size: 0.76rem; font-weight: 800; padding: 0.35rem 0.95rem; border-radius: 8px;">
                            <span>➕ Log</span>
                        </button>
                    `}
                </div>

                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.45rem; background: ${isToday ? '#ffffff' : '#f8fafc'}; padding: 0.55rem 0.75rem; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
                    <div>
                        <span style="font-size: 0.68rem; color: #64748b; font-weight: 700; display: block;">Feed</span>
                        <strong style="font-size: 0.88rem; color: #0369a1;">${feedText}</strong>
                    </div>
                    <div>
                        <span style="font-size: 0.68rem; color: #64748b; font-weight: 700; display: block;">Tray Left</span>
                        <div style="margin-top: 0.15rem;">${remnantBadge}</div>
                    </div>
                    <div>
                        <span style="font-size: 0.68rem; color: #64748b; font-weight: 700; display: block;">Water Lvl</span>
                        <strong style="font-size: 0.88rem; color: #334155;">${waterLvl}</strong>
                    </div>
                </div>

                ${(mortKg > 0 || remarksText || (treatments && treatments.length > 0)) ? `
                    <div style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.75rem;">
                        ${mortKg > 0 ? `<div style="color: #b91c1c; font-weight: 700;">⚠️ Mortality: ${mortKg.toFixed(1)} kg</div>` : ''}
                        ${(treatments && treatments.length > 0) ? `
                            <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
                                ${treatments.map(t => `<span style="background: #f1f5f9; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 600; color: #334155;">${t.category === 'MINERAL' ? '🧪' : '🦠'} ${t.item_name} (${t.amount_used} ${t.unit})</span>`).join('')}
                            </div>
                        ` : ''}
                        ${remarksText ? `<div style="color: #64748b; font-style: italic;">“${remarksText}”</div>` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }

    closeModal() {
        const modal = this.container.querySelector("#modal-daily-entry");
        if (modal) modal.style.display = "none";
        if (this.isModalOnlyMode) {
            this.isModalOnlyMode = false;
            if (this.callbacks.onCloseQuickModal) {
                this.callbacks.onCloseQuickModal();
            }
        }
    }

    async switchPondInModal(delta) {
        if (!this.activePondsList || this.activePondsList.length <= 1) return null;
        const currIdx = this.activePondsList.findIndex(p =>
            (p.pond_index && p.pond_index === this.currentPond.pond_index) ||
            (p.pond && p.pond === this.currentPond.pond)
        );
        const nextIdx = ((currIdx >= 0 ? currIdx : 0) + delta + this.activePondsList.length) % this.activePondsList.length;
        const nextPond = this.activePondsList[nextIdx];
        if (!nextPond) return null;

        if (this.isModalOnlyMode) {
            await this.openQuickModal(nextPond, this.activePondsList);
        } else {
            await this.render(nextPond, this.activePondsList);
            const todayStr = getLocalDateStr();
            const existing = this.records.find(r => r.log_date === todayStr) || null;
            this.openEntryModal(todayStr, existing, { autoFocusFeed: false });
        }
        return nextPond;
    }

    syncPresetHighlights() {
        const inputTray = this.container.querySelector("#input-tray-pct");
        const selectColour = this.container.querySelector("#select-water-colour");
        const selectedOrb = this.container.querySelector("#selected-colour-orb");
        const selectedLabel = this.container.querySelector("#selected-colour-label");

        const trayVal = inputTray ? String(inputTray.value).trim() : "";
        this.container.querySelectorAll(".btn-tray-chip").forEach(chip => {
            if (chip.getAttribute("data-pct") === trayVal) {
                chip.classList.add("active");
            } else {
                chip.classList.remove("active");
            }
        });

        const colVal = selectColour ? selectColour.value : "";
        const meta = getWaterColourMeta(colVal);
        const activeValue = meta ? meta.value : colVal;

        if (selectedOrb && selectedLabel) {
            if (meta) {
                selectedOrb.style.background = meta.orbBg;
                selectedOrb.style.borderColor = meta.orbBorder;
                selectedOrb.style.display = "inline-block";
                selectedLabel.textContent = meta.fullLabel;
            } else {
                selectedOrb.style.display = "none";
                selectedLabel.textContent = colVal || "— Select Colour —";
            }
        }

        this.container.querySelectorAll(".btn-colour-chip").forEach(chip => {
            if (chip.getAttribute("data-colour") === activeValue) {
                chip.classList.add("active");
            } else {
                chip.classList.remove("active");
            }
        });
    }

    syncOptionalTogglePills() {
        const minCard = this.container.querySelector("#section-minerals-card");
        const proCard = this.container.querySelector("#section-probiotics-card");
        const mortCard = this.container.querySelector("#section-mortality-card");

        const btnMin = this.container.querySelector("#btn-toggle-minerals-sec");
        const btnPro = this.container.querySelector("#btn-toggle-probiotics-sec");
        const btnMort = this.container.querySelector("#btn-toggle-mortality-sec");

        if (btnMin && minCard) {
            const open = minCard.style.display !== "none";
            btnMin.classList.toggle("active", open);
            btnMin.innerHTML = open ? "🧪 Minerals ▲" : "🧪 + Minerals";
        }
        if (btnPro && proCard) {
            const open = proCard.style.display !== "none";
            btnPro.classList.toggle("active", open);
            btnPro.innerHTML = open ? "🦠 Probiotics ▲" : "🦠 + Probiotics";
        }
        if (btnMort && mortCard) {
            const open = mortCard.style.display !== "none";
            btnMort.classList.toggle("active", open);
            btnMort.innerHTML = open ? "⚠️ Mortality / Note ▲" : "⚠️ + Mortality / Note";
        }
    }

    bindEvents() {
        const pond = this.currentPond;
        if (!pond) return;

        // Navigation Back to Pond View
        const btnBackPond = this.container.querySelector("#btn-daily-back-pond");
        if (btnBackPond && this.callbacks.onBackToPond) {
            btnBackPond.addEventListener("click", () => this.callbacks.onBackToPond(pond));
        }

        // Navigation Back to Map
        const btnBackMap = this.container.querySelector("#btn-daily-back-map");
        if (btnBackMap && this.callbacks.onBackToMap) {
            btnBackMap.addEventListener("click", () => this.callbacks.onBackToMap());
        }

        // View Usage Summary Modal
        const btnViewUsage = this.container.querySelector("#btn-view-usage-summary");
        const usageModal = this.container.querySelector("#modal-usage-summary");
        const btnCloseUsage = this.container.querySelector("#btn-close-usage-modal");
        const btnCloseUsageBottom = this.container.querySelector("#btn-close-usage-modal-bottom");
        if (btnViewUsage && usageModal) {
            btnViewUsage.addEventListener("click", () => usageModal.style.display = "flex");
        }
        if (btnCloseUsage) btnCloseUsage.addEventListener("click", () => usageModal.style.display = "none");
        if (btnCloseUsageBottom) btnCloseUsageBottom.addEventListener("click", () => usageModal.style.display = "none");

        // Quick Log Today
        const btnQuickToday = this.container.querySelector("#btn-quick-log-today");
        if (btnQuickToday) {
            btnQuickToday.addEventListener("click", () => {
                const todayStr = getLocalDateStr();
                const existing = this.records.find(r => r.log_date === todayStr);
                this.openEntryModal(todayStr, existing);
            });
        }

        // Table Edit Buttons
        this.container.querySelectorAll(".btn-edit-record").forEach(btn => {
            btn.addEventListener("click", () => {
                const dateStr = btn.getAttribute("data-date");
                const existing = this.records.find(r => r.log_date === dateStr);
                this.openEntryModal(dateStr, existing);
            });
        });

        // Table "+ Log" Buttons for empty days
        this.container.querySelectorAll(".btn-log-day").forEach(btn => {
            btn.addEventListener("click", () => {
                const dateStr = btn.getAttribute("data-date");
                this.openEntryModal(dateStr, null);
            });
        });

        // Modal Close Buttons
        const modal = this.container.querySelector("#modal-daily-entry");
        const btnClose = this.container.querySelector("#btn-close-entry-modal");
        const btnCancel = this.container.querySelector("#btn-cancel-modal");
        if (btnClose) btnClose.addEventListener("click", () => this.closeModal());
        if (btnCancel) btnCancel.addEventListener("click", () => this.closeModal());
        if (modal) {
            modal.addEventListener("click", (e) => {
                if (e.target === modal) this.closeModal();
            });
        }

        // Pond Switcher inside Modal (Prev / Next / Open Full Book)
        const btnPrevPond = this.container.querySelector("#btn-modal-prev-pond");
        const btnNextPond = this.container.querySelector("#btn-modal-next-pond");
        const btnOpenFullBook = this.container.querySelector("#btn-modal-open-full-book");
        if (btnPrevPond) {
            btnPrevPond.addEventListener("click", () => this.switchPondInModal(-1));
        }
        if (btnNextPond) {
            btnNextPond.addEventListener("click", () => this.switchPondInModal(1));
        }
        if (btnOpenFullBook) {
            btnOpenFullBook.addEventListener("click", () => {
                this.isModalOnlyMode = false;
                this.container.classList.remove("daily-mount-modal-only");
                const mapMount = document.getElementById("field-ops-map-mount");
                if (mapMount) mapMount.style.display = "none";
                if (modal) modal.style.display = "none";
                this.renderView();
            });
        }

        // 1-Tap Feed Steppers (-5, -1, +1, +5)
        const inputFeed = this.container.querySelector("#input-feed-kg");
        this.container.querySelectorAll(".btn-feed-stepper").forEach(btn => {
            btn.addEventListener("click", () => {
                if (!inputFeed) return;
                const step = parseFloat(btn.getAttribute("data-step") || "0");
                const curr = parseFloat(inputFeed.value || "0") || 0;
                const next = Math.max(0, Math.round((curr + step) * 10) / 10);
                inputFeed.value = next.toFixed(1).replace(/\.0$/, "");
            });
        });

        // 1-Tap Tray Remnant Preset Chips (0%, 5%, 10%, 15%, 25%)
        const inputTray = this.container.querySelector("#input-tray-pct");
        this.container.querySelectorAll(".btn-tray-chip").forEach(chip => {
            chip.addEventListener("click", () => {
                if (!inputTray) return;
                inputTray.value = chip.getAttribute("data-pct") || "0";
                this.syncPresetHighlights();
            });
        });
        if (inputTray) {
            inputTray.addEventListener("input", () => this.syncPresetHighlights());
        }

        // 1-Tap Water Level Steppers (-5, -2, +2, +5)
        const inputWaterLevel = this.container.querySelector("#input-water-level");
        this.container.querySelectorAll(".btn-water-stepper").forEach(btn => {
            btn.addEventListener("click", () => {
                if (!inputWaterLevel) return;
                const step = parseInt(btn.getAttribute("data-step") || "0", 10);
                const curr = parseInt(inputWaterLevel.value || "110", 10) || 110;
                inputWaterLevel.value = String(Math.max(0, curr + step));
            });
        });

        // 1-Tap Water Colour Swatch Pills & Display Box
        const selectColour = this.container.querySelector("#select-water-colour");
        const selectedDisplay = this.container.querySelector("#selected-water-colour-display");
        this.container.querySelectorAll(".btn-colour-chip").forEach(chip => {
            chip.addEventListener("click", () => {
                if (!selectColour) return;
                selectColour.value = chip.getAttribute("data-colour") || "";
                this.syncPresetHighlights();
            });
        });
        if (selectedDisplay && selectColour) {
            selectedDisplay.addEventListener("click", () => {
                const currMeta = getWaterColourMeta(selectColour.value);
                const currIdx = currMeta ? WATER_COLOUR_OPTIONS.findIndex(o => o.value === currMeta.value) : -1;
                const nextOpt = WATER_COLOUR_OPTIONS[(currIdx + 1) % WATER_COLOUR_OPTIONS.length];
                if (nextOpt) {
                    selectColour.value = nextOpt.value;
                    this.syncPresetHighlights();
                }
            });
        }
        if (selectColour) {
            selectColour.addEventListener("change", () => this.syncPresetHighlights());
        }

        // Progressive Disclosure Toggles for Optional Sections
        const minCard = this.container.querySelector("#section-minerals-card");
        const proCard = this.container.querySelector("#section-probiotics-card");
        const mortCard = this.container.querySelector("#section-mortality-card");
        const mineralContainer = this.container.querySelector("#mineral-rows-container");
        const probioticContainer = this.container.querySelector("#probiotic-rows-container");

        const btnToggleMin = this.container.querySelector("#btn-toggle-minerals-sec");
        if (btnToggleMin && minCard) {
            btnToggleMin.addEventListener("click", () => {
                const isHidden = minCard.style.display === "none";
                minCard.style.display = isHidden ? "block" : "none";
                if (isHidden && mineralContainer && mineralContainer.children.length === 0) {
                    this.appendMineralRow(mineralContainer, { name: "", amount: "", unit: "KG" });
                }
                this.syncOptionalTogglePills();
            });
        }

        const btnTogglePro = this.container.querySelector("#btn-toggle-probiotics-sec");
        if (btnTogglePro && proCard) {
            btnTogglePro.addEventListener("click", () => {
                const isHidden = proCard.style.display === "none";
                proCard.style.display = isHidden ? "block" : "none";
                if (isHidden && probioticContainer && probioticContainer.children.length === 0) {
                    this.appendProbioticRow(probioticContainer, { name: "", amount: "", unit: "L" });
                }
                this.syncOptionalTogglePills();
            });
        }

        const btnToggleMort = this.container.querySelector("#btn-toggle-mortality-sec");
        if (btnToggleMort && mortCard) {
            btnToggleMort.addEventListener("click", () => {
                const isHidden = mortCard.style.display === "none";
                mortCard.style.display = isHidden ? "block" : "none";
                this.syncOptionalTogglePills();
            });
        }

        // Date input change -> recalculate DOC
        const inputDate = this.container.querySelector("#input-entry-date");
        const calcDocEl = this.container.querySelector("#modal-calc-doc");
        if (inputDate) {
            inputDate.addEventListener("change", () => {
                const newDate = inputDate.value;
                if (pond.stck_date && newDate) {
                    const d = calculateDOC(pond.stck_date, newDate);
                    calcDocEl.textContent = `DOC ${d}`;
                } else {
                    calcDocEl.textContent = `DOC —`;
                }
            });
        }

        // Add Mineral Row Button
        const btnAddMineral = this.container.querySelector("#btn-add-mineral-row");
        if (btnAddMineral && mineralContainer) {
            btnAddMineral.addEventListener("click", () => {
                this.appendMineralRow(mineralContainer, { name: "", amount: "", unit: "KG" });
            });
        }

        // Add Probiotic Row Button
        const btnAddProbiotic = this.container.querySelector("#btn-add-probiotic-row");
        if (btnAddProbiotic && probioticContainer) {
            btnAddProbiotic.addEventListener("click", () => {
                this.appendProbioticRow(probioticContainer, { name: "", amount: "", unit: "L" });
            });
        }

        // Form Submit (Standard Save)
        const form = this.container.querySelector("#form-daily-record");
        if (form) {
            form.addEventListener("submit", async (e) => {
                e.preventDefault();
                await this.handleSaveRecord({ advanceToNextPond: false });
            });
        }

        // Save & Next Pond Button (Sequential Rapid Mode)
        const btnSaveNext = this.container.querySelector("#btn-save-and-next");
        if (btnSaveNext) {
            btnSaveNext.addEventListener("click", async () => {
                await this.handleSaveRecord({ advanceToNextPond: true });
            });
        }

        // Delete Button
        const btnDelete = this.container.querySelector("#btn-delete-entry");
        if (btnDelete) {
            btnDelete.addEventListener("click", async () => {
                if (!this.activeModalRecord || !this.activeModalRecord.id) return;
                if (confirm(`Are you sure you want to delete the daily record for ${this.activeModalRecord.log_date}?`)) {
                    try {
                        await DailyRecordsRepository.deleteRecord(this.activeModalRecord.id);
                        Toast.success("Daily record deleted.");
                        if (this.callbacks.onRecordSaved) this.callbacks.onRecordSaved();
                        if (this.isModalOnlyMode) {
                            this.closeModal();
                        } else {
                            if (modal) modal.style.display = "none";
                            await this.render(this.currentPond, this.activePondsList);
                        }
                    } catch (err) {
                        Toast.error("Failed to delete record: " + err.message);
                    }
                }
            });
        }
    }

    /**
     * Appends an interactive Mineral row
     */
    appendMineralRow(container, item = { name: "", amount: "", unit: "KG" }) {
        const row = document.createElement("div");
        row.className = "mineral-item-row";

        row.innerHTML = `
            <input type="text" list="minerals-autocomplete" class="form-control mineral-name" placeholder="Search or type mineral name" value="${item.name || item.item_name || ''}" style="font-size: 0.85rem; font-weight: 600;" />
            <input type="number" step="0.1" min="0" class="form-control mineral-amount" placeholder="Qty" value="${item.amount !== undefined ? item.amount : ''}" style="font-size: 0.85rem; font-weight: 700;" />
            <select class="form-control mineral-unit" style="font-size: 0.82rem; font-weight: 700;">
                <option value="KG" ${(item.unit || '').toUpperCase() === 'KG' ? 'selected' : ''}>KG</option>
                <option value="L" ${(item.unit || '').toUpperCase() === 'L' ? 'selected' : ''}>L</option>
                <option value="bag" ${(item.unit || '').toLowerCase() === 'bag' ? 'selected' : ''}>bag</option>
                <option value="g" ${(item.unit || '').toLowerCase() === 'g' ? 'selected' : ''}>g</option>
            </select>
            <button type="button" class="btn-remove-row" style="background: #fee2e2; border: 1px solid #fecaca; color: #ef4444; border-radius: 6px; height: 34px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                🗑️
            </button>
        `;

        row.querySelector(".btn-remove-row").addEventListener("click", () => row.remove());
        container.appendChild(row);
    }

    /**
     * Appends an interactive Probiotic row
     */
    appendProbioticRow(container, item = { name: "", amount: "", unit: "L" }) {
        const row = document.createElement("div");
        row.className = "probiotic-item-row";

        row.innerHTML = `
            <input type="text" list="probiotics-autocomplete" class="form-control probiotic-name" placeholder="Search or type probiotic name" value="${item.name || item.item_name || ''}" style="font-size: 0.85rem; font-weight: 600;" />
            <input type="number" step="0.1" min="0" class="form-control probiotic-amount" placeholder="Qty" value="${item.amount !== undefined ? item.amount : ''}" style="font-size: 0.85rem; font-weight: 700;" />
            <select class="form-control probiotic-unit" style="font-size: 0.82rem; font-weight: 700;">
                <option value="L" ${(item.unit || '').toUpperCase() === 'L' ? 'selected' : ''}>L</option>
                <option value="KG" ${(item.unit || '').toUpperCase() === 'KG' ? 'selected' : ''}>KG</option>
                <option value="bag" ${(item.unit || '').toLowerCase() === 'bag' ? 'selected' : ''}>bag</option>
                <option value="g" ${(item.unit || '').toLowerCase() === 'g' ? 'selected' : ''}>g</option>
            </select>
            <button type="button" class="btn-remove-row" style="background: #fee2e2; border: 1px solid #fecaca; color: #ef4444; border-radius: 6px; height: 34px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                🗑️
            </button>
        `;

        row.querySelector(".btn-remove-row").addEventListener("click", () => row.remove());
        container.appendChild(row);
    }

    /**
     * Opens modal pre-populated for a given date and existing record (or smart carry-forward from previous log)
     */
    openEntryModal(targetDate, existingRecord = null, options = { autoFocusFeed: true }) {
        this.activeModalRecord = existingRecord;
        const modal = this.container.querySelector("#modal-daily-entry");
        const titleEl = this.container.querySelector("#modal-entry-title");
        const subTitleEl = this.container.querySelector("#modal-entry-subtitle");
        const inputDate = this.container.querySelector("#input-entry-date");
        const calcDocEl = this.container.querySelector("#modal-calc-doc");
        const inputFeed = this.container.querySelector("#input-feed-kg");
        const inputTray = this.container.querySelector("#input-tray-pct");
        const inputWaterLevel = this.container.querySelector("#input-water-level");
        const selectColour = this.container.querySelector("#select-water-colour");
        const inputMortality = this.container.querySelector("#input-mortality");
        const inputRemarks = this.container.querySelector("#input-remarks");
        const mineralContainer = this.container.querySelector("#mineral-rows-container");
        const probioticContainer = this.container.querySelector("#probiotic-rows-container");
        const btnDelete = this.container.querySelector("#btn-delete-entry");
        const carryBadge = this.container.querySelector("#carry-forward-badge");
        const carryText = this.container.querySelector("#carry-forward-text");
        const minCard = this.container.querySelector("#section-minerals-card");
        const proCard = this.container.querySelector("#section-probiotics-card");
        const mortCard = this.container.querySelector("#section-mortality-card");

        const pondLabel = this.currentPond.pond || this.currentPond.pond_index || "Pond";
        const dateVal = targetDate || getLocalDateStr();
        inputDate.value = dateVal;

        const doc = this.currentPond.stck_date ? calculateDOC(this.currentPond.stck_date, dateVal) : 0;
        calcDocEl.textContent = `DOC ${doc}`;

        mineralContainer.innerHTML = "";
        probioticContainer.innerHTML = "";

        // Load existing treatments for this date from local cache
        const dayTreatments = this.treatmentsByDate.get(dateVal) || [];
        const existingMinerals = dayTreatments.filter(t => t.category === 'MINERAL');
        const existingProbiotics = dayTreatments.filter(t => t.category === 'PROBIOTIC');

        if (existingRecord) {
            titleEl.textContent = `Edit Record — Pond ${pondLabel}`;
            subTitleEl.textContent = `DOC ${doc} · ${formatLocalDateDisplay(dateVal)} (Existing Log)`;
            inputFeed.value = existingRecord.feed_kg !== null && existingRecord.feed_kg !== undefined ? existingRecord.feed_kg : "";
            inputTray.value = existingRecord.feed_tray_remnant_pct !== null && existingRecord.feed_tray_remnant_pct !== undefined ? existingRecord.feed_tray_remnant_pct : "0";
            inputWaterLevel.value = existingRecord.water_level_cm !== null && existingRecord.water_level_cm !== undefined ? existingRecord.water_level_cm : "110";
            selectColour.value = getWaterColourMeta(existingRecord.water_colour)?.value || "Brownish Green";
            inputMortality.value = (existingRecord.mortality_kg !== null && existingRecord.mortality_kg !== undefined)
                ? existingRecord.mortality_kg
                : (existingRecord.mortality_count !== null && existingRecord.mortality_count !== undefined ? existingRecord.mortality_count : "0");
            inputRemarks.value = existingRecord.remarks || "";
            btnDelete.style.display = "block";
            if (carryBadge) carryBadge.style.display = "none";
        } else {
            titleEl.textContent = `Quick Log — Pond ${pondLabel}`;
            subTitleEl.textContent = `DOC ${doc} · ${formatLocalDateDisplay(dateVal)}`;

            // Smart Yesterday Carry-Forward: find latest previous record
            const sortedPrev = [...this.records]
                .filter(r => r && r.log_date && r.log_date < dateVal)
                .sort((a, b) => b.log_date.localeCompare(a.log_date));
            const prevRecord = sortedPrev.length > 0 ? sortedPrev[0] : (this.records.length > 0 ? this.records[0] : null);

            if (prevRecord) {
                inputFeed.value = (prevRecord.feed_kg !== null && prevRecord.feed_kg !== undefined && parseFloat(prevRecord.feed_kg) > 0)
                    ? prevRecord.feed_kg
                    : "";
                inputTray.value = "0";
                inputWaterLevel.value = prevRecord.water_level_cm || "110";
                selectColour.value = getWaterColourMeta(prevRecord.water_colour)?.value || "Brownish Green";
                if (carryBadge && carryText) {
                    const prevFeedStr = prevRecord.feed_kg ? `${parseFloat(prevRecord.feed_kg).toFixed(1)} kg` : "—";
                    carryText.textContent = `↺ Pre-filled from ${formatLocalDateDisplay(prevRecord.log_date)} (${prevFeedStr}, ${prevRecord.water_level_cm || 110} cm)`;
                    carryBadge.style.display = "flex";
                }
            } else {
                inputFeed.value = "";
                inputTray.value = "0";
                inputWaterLevel.value = "110";
                selectColour.value = "Brownish Green";
                if (carryBadge) carryBadge.style.display = "none";
            }

            inputMortality.value = "0";
            inputRemarks.value = "";
            btnDelete.style.display = "none";
        }

        // Populate minerals & probiotics from mineral_probiotic_used
        existingMinerals.forEach(m => this.appendMineralRow(mineralContainer, m));
        existingProbiotics.forEach(p => this.appendProbioticRow(probioticContainer, p));

        // Progressive disclosure: auto-expand optional sections only if populated
        if (minCard) minCard.style.display = existingMinerals.length > 0 ? "block" : "none";
        if (proCard) proCard.style.display = existingProbiotics.length > 0 ? "block" : "none";
        const hasMortOrNote = existingRecord && (
            parseFloat(existingRecord.mortality_kg || existingRecord.mortality_count || 0) > 0 ||
            Boolean(existingRecord.remarks && existingRecord.remarks.trim())
        );
        if (mortCard) mortCard.style.display = hasMortOrNote ? "block" : "none";

        this.syncPresetHighlights();
        this.syncOptionalTogglePills();

        const sheetBody = modal.querySelector(".modal-sheet-body") || modal.querySelector(".modal-dialog");
        if (sheetBody) sheetBody.scrollTop = 0;
        modal.style.display = "flex";

        const isMobileViewport = window.innerWidth <= 768;
        if (options.autoFocusFeed && !isMobileViewport && !inputFeed.value) {
            setTimeout(() => {
                if (inputFeed) inputFeed.focus();
            }, 50);
        }
    }

    /**
     * Handles saving record to Supabase:
     * 1. Upserts into daily_pond_records
     * 2. Syncs rows into mineral_probiotic_used
     * 3. Supports sequential "Save & Next Pond" workflow
     */
    async handleSaveRecord({ advanceToNextPond = false } = {}) {
        const inputDate = this.container.querySelector("#input-entry-date");
        const inputFeed = this.container.querySelector("#input-feed-kg");
        const inputTray = this.container.querySelector("#input-tray-pct");
        const inputWaterLevel = this.container.querySelector("#input-water-level");
        const selectColour = this.container.querySelector("#select-water-colour");
        const inputMortality = this.container.querySelector("#input-mortality");
        const inputRemarks = this.container.querySelector("#input-remarks");
        const btnSave = this.container.querySelector("#btn-save-record");
        const btnSaveNext = this.container.querySelector("#btn-save-and-next");

        const logDate = inputDate.value;
        if (!logDate) {
            Toast.error("Please select a record date.");
            return;
        }

        // Collect Minerals
        const treatmentsPayload = [];
        this.container.querySelectorAll(".mineral-item-row").forEach(row => {
            const name = (row.querySelector(".mineral-name")?.value || "").trim().toUpperCase();
            const amount = parseFloat(row.querySelector(".mineral-amount")?.value || 0);
            const unit = row.querySelector(".mineral-unit")?.value || "KG";
            if (name && amount > 0) {
                treatmentsPayload.push({ category: "MINERAL", name, amount, unit });
            }
        });

        // Collect Probiotics
        this.container.querySelectorAll(".probiotic-item-row").forEach(row => {
            const name = (row.querySelector(".probiotic-name")?.value || "").trim().toUpperCase();
            const amount = parseFloat(row.querySelector(".probiotic-amount")?.value || 0);
            const unit = row.querySelector(".probiotic-unit")?.value || "L";
            if (name && amount > 0) {
                treatmentsPayload.push({ category: "PROBIOTIC", name, amount, unit });
            }
        });

        const pondIndex = this.currentPond.pond_index;
        const pondName = this.currentPond.pond || pondIndex;
        const mortVal = inputMortality.value !== "" ? parseFloat(inputMortality.value) : 0;

        const dailyPayload = {
            pond_index: pondIndex,
            pond: pondName,
            log_date: logDate,
            feed_kg: inputFeed.value !== "" ? parseFloat(inputFeed.value) : 0,
            feed_tray_remnant_pct: inputTray.value !== "" ? parseInt(inputTray.value, 10) : 0,
            water_level_cm: inputWaterLevel.value !== "" ? parseFloat(inputWaterLevel.value) : null,
            water_colour: selectColour.value || null,
            mortality_kg: isNaN(mortVal) ? 0.0 : mortVal,
            mortality_count: isNaN(mortVal) ? 0 : Math.round(mortVal),
            remarks: (inputRemarks.value || "").trim() || null
        };

        if (this.activeModalRecord && this.activeModalRecord.id) {
            dailyPayload.id = this.activeModalRecord.id;
        }

        if (btnSave) {
            btnSave.disabled = true;
            btnSave.textContent = "Saving...";
        }
        if (btnSaveNext) {
            btnSaveNext.disabled = true;
            btnSaveNext.textContent = "Saving...";
        }

        try {
            // 1. Upsert daily_pond_records
            const savedRecord = await DailyRecordsRepository.upsertRecord(dailyPayload);
            const recordId = (savedRecord && savedRecord.id) || (this.activeModalRecord && this.activeModalRecord.id) || null;

            // 2. Sync mineral_probiotic_used table
            await MineralProbioticRepository.syncDailyTreatments(
                recordId,
                pondIndex,
                pondName,
                logDate,
                treatmentsPayload
            );

            // Notify parent map so Today's status badge updates live
            if (this.callbacks.onRecordSaved) {
                this.callbacks.onRecordSaved();
            }

            if (advanceToNextPond && this.activePondsList && this.activePondsList.length > 1) {
                const nextPond = await this.switchPondInModal(1);
                const nextName = nextPond ? (nextPond.pond || nextPond.pond_index) : "Next Pond";
                Toast.success(`✅ Saved Pond ${pondName} — Ready for Pond ${nextName}!`);
            } else if (this.isModalOnlyMode) {
                Toast.success(`✅ Saved Pond ${pondName} (${dailyPayload.feed_kg} kg)!`);
                this.closeModal();
            } else {
                Toast.success(`Daily record & treatments for ${logDate} saved!`);
                this.container.querySelector("#modal-daily-entry").style.display = "none";
                await this.render(this.currentPond, this.activePondsList);
            }
        } catch (err) {
            console.error("Save error:", err);
            Toast.error("Failed to save daily record: " + err.message);
        } finally {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.textContent = "💾 Save";
            }
            if (btnSaveNext) {
                btnSaveNext.disabled = false;
                btnSaveNext.textContent = "⚡ Save & Next ➔";
            }
        }
    }
}
