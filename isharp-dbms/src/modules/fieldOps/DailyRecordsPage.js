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

export class DailyRecordsPage {
    /**
     * @param {string} containerId Element ID where page is mounted
     * @param {object} callbacks Navigation callbacks { onBackToPond, onBackToMap }
     */
    constructor(containerId = "field-ops-daily-records-mount", callbacks = {}) {
        this.container = document.getElementById(containerId);
        this.callbacks = callbacks;
        this.currentPond = null;
        this.records = [];
        this.treatments = [];
        this.usageSummary = { minerals: [], probiotics: [], totalMineralKg: 0, totalProbioticL: 0 };
        this.treatmentsByDate = new Map();
        this.activeModalRecord = null;
    }

    /**
     * Renders the Daily Records Logbook for a pond cycle
     * @param {object} pond Cycle record
     */
    async render(pond) {
        this.currentPond = pond;
        if (!this.container) return;

        this.container.innerHTML = `
            <div style="padding: 2.5rem 1.5rem; text-align: center; color: #0284c7; font-weight: 700;">
                <div class="spinner" style="margin: 0 auto 0.75rem auto;"></div>
                <span>Loading Daily Records Logbook for Pond ${pond.pond || pond.pond_index}...</span>
            </div>
        `;

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

        this.renderView();
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
        let totalMortalities = 0;

        this.records.forEach(r => {
            if (r.feed_kg) totalFeedKg += parseFloat(r.feed_kg || 0);
            if (r.feed_tray_remnant_pct !== null && r.feed_tray_remnant_pct !== undefined) {
                trayRemnantSum += parseInt(r.feed_tray_remnant_pct, 10);
                trayRemnantCount++;
            }
            if (r.mortality_count) totalMortalities += parseInt(r.mortality_count || 0, 10);
        });

        const avgTrayRemnant = trayRemnantCount > 0 ? Math.round(trayRemnantSum / trayRemnantCount) : 0;

        // Build continuous timeline rows from DOC 1 to Today
        const timelineRows = this.buildTimelineRows();

        this.container.innerHTML = `
            <div class="daily-records-page-wrapper" style="padding: 1.25rem 2rem; max-width: 1350px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.4rem;">
                
                <!-- 1. Breadcrumbs & Top Navigation Bar -->
                <div class="daily-nav-bar flex-between" style="background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 1); border-radius: 16px; padding: 0.85rem 1.4rem; box-shadow: 0 4px 20px rgba(2, 132, 199, 0.08); flex-wrap: wrap; gap: 0.75rem;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <button type="button" id="btn-daily-back-pond" class="btn-action btn-secondary" style="font-size: 0.8rem; font-weight: 700; padding: 0.4rem 0.85rem;">
                            <span>← Back to Pond View</span>
                        </button>
                        <button type="button" id="btn-daily-back-map" class="btn-action btn-secondary" style="font-size: 0.8rem; font-weight: 700; padding: 0.4rem 0.85rem;">
                            <span>🗺️ Back to 24-Pond Map</span>
                        </button>
                    </div>

                    <div style="display: flex; align-items: center; gap: 0.6rem;">
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
                        <div style="display: flex; align-items: center; gap: 0.6rem;">
                            <span style="font-size: 1.6rem;">📖</span>
                            <h1 style="margin: 0; font-size: 1.55rem; font-weight: 900; color: #0f172a;">
                                Pond Daily Operational Records
                            </h1>
                            <span style="font-size: 0.72rem; font-weight: 800; background: #0284c7; color: #ffffff; padding: 0.2rem 0.6rem; border-radius: 6px;">
                                DAILY LEDGER
                            </span>
                        </div>
                        <p style="margin: 0.35rem 0 0 0; font-size: 0.84rem; color: #64748b;">
                            Continuous day-by-day record of feed, tray remnant, water condition, and treatments from <code>daily_pond_records</code> &amp; <code>mineral_probiotic_used</code> for <strong>Pond ${pondLabel}</strong>.
                        </p>
                    </div>

                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <button type="button" id="btn-view-usage-summary" class="btn-action btn-secondary" style="font-size: 0.84rem; font-weight: 700; padding: 0.52rem 1.15rem; display: flex; align-items: center; gap: 0.4rem;">
                            <span>📊 Treatment Totals</span>
                        </button>
                        <button type="button" id="btn-quick-log-today" class="btn-action btn-primary" style="font-size: 0.88rem; font-weight: 800; padding: 0.55rem 1.35rem; display: flex; align-items: center; gap: 0.5rem; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.3);">
                            <span>➕ Log Today (DOC ${doc})</span>
                        </button>
                    </div>
                </div>

                <!-- 3. Cycle Metrics Summary Bar (Feed, Tray %, Mortalities, Mineral & Probiotic Totals) -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">
                    
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
                        <div style="font-size: 1.15rem; font-weight: 800; color: ${totalMortalities > 0 ? '#b91c1c' : '#15803d'}; margin-top: 0.2rem;">
                            ${totalMortalities} pcs
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

                    <!-- Scrollable Responsive Table Container -->
                    <div class="logbook-table-container" style="overflow-x: auto; max-height: 650px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 12px;">
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
                                    <th style="padding: 0.75rem 0.85rem; border-bottom: 2px solid #cbd5e1; width: 85px;">Mort.</th>
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

                <!-- 5. ENTRY / EDIT MODAL (With Autocomplete & Dynamic Mineral/Probiotic Rows) -->
                <div id="modal-daily-entry" class="modal-overlay" style="display: none; align-items: center; justify-content: center; z-index: 9999;">
                    <div class="modal-dialog modal-glass" style="max-width: 780px; width: 94%; max-height: 90vh; overflow-y: auto; padding: 1.75rem 2rem; border-radius: 20px;">
                        
                        <!-- Modal Title Bar -->
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.75rem;">
                            <div style="display: flex; align-items: center; gap: 0.6rem;">
                                <span style="font-size: 1.4rem;">📝</span>
                                <div>
                                    <h3 id="modal-entry-title" style="margin: 0; font-size: 1.25rem; font-weight: 900; color: #0f172a;">
                                        Log Daily Record — Pond ${pondLabel}
                                    </h3>
                                    <span id="modal-entry-subtitle" style="font-size: 0.76rem; color: #64748b;">
                                        Enter feed, water parameters, and daily treatments
                                    </span>
                                </div>
                            </div>
                            <button type="button" id="btn-close-entry-modal" style="background: none; border: none; font-size: 1.4rem; color: #64748b; cursor: pointer; padding: 0.2rem 0.5rem;">✕</button>
                        </div>

                        <!-- Autocomplete Datalists -->
                        <datalist id="minerals-autocomplete">
                            ${STANDARD_MINERALS.map(m => `<option value="${m}"></option>`).join("")}
                        </datalist>
                        <datalist id="probiotics-autocomplete">
                            ${STANDARD_PROBIOTICS.map(p => `<option value="${p}"></option>`).join("")}
                        </datalist>

                        <form id="form-daily-record" style="display: flex; flex-direction: column; gap: 1.25rem;">
                            
                            <!-- Date & DOC Selector -->
                            <div style="display: grid; grid-template-columns: 1fr 140px; gap: 1rem; background: #f8fafc; padding: 0.85rem 1rem; border-radius: 12px; border: 1px solid #e2e8f0; align-items: center;">
                                <div>
                                    <label style="font-size: 0.78rem; font-weight: 700; color: #334155; display: block; margin-bottom: 0.35rem;">
                                        📅 Record Date
                                    </label>
                                    <input type="date" id="input-entry-date" class="form-control" style="font-size: 0.9rem; font-weight: 700; padding: 0.45rem 0.75rem; background: #ffffff;" required />
                                </div>
                                <div style="text-align: center;">
                                    <span style="font-size: 0.72rem; font-weight: 700; color: #64748b; display: block;">Culture Age</span>
                                    <div id="modal-calc-doc" style="font-size: 1.15rem; font-weight: 900; color: #0284c7; margin-top: 0.2rem;">
                                        DOC —
                                    </div>
                                </div>
                            </div>

                            <!-- Section: Feeding & Tray Remnant -->
                            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem;">
                                <h4 style="margin: 0 0 0.75rem 0; font-size: 0.88rem; font-weight: 800; color: #0284c7; display: flex; align-items: center; gap: 0.4rem;">
                                    <span>🌾 Feeding &amp; Tray Observation</span>
                                </h4>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                    <div>
                                        <label style="font-size: 0.76rem; font-weight: 700; color: #475569; display: block; margin-bottom: 0.3rem;">
                                            Daily Feed (kg)
                                        </label>
                                        <input type="number" id="input-feed-kg" class="form-control" step="0.1" min="0" placeholder="e.g. 45.0" style="font-size: 0.9rem; font-weight: 700;" />
                                    </div>
                                    <div>
                                        <label style="font-size: 0.76rem; font-weight: 700; color: #475569; display: block; margin-bottom: 0.3rem;">
                                            Tray Remnant Leftover (%)
                                        </label>
                                        <input type="number" id="input-tray-pct" class="form-control" step="1" min="0" max="100" placeholder="e.g. 5" style="font-size: 0.9rem; font-weight: 700;" />
                                    </div>
                                </div>
                            </div>

                            <!-- Section: Water Physical Condition -->
                            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem;">
                                <h4 style="margin: 0 0 0.75rem 0; font-size: 0.88rem; font-weight: 800; color: #0284c7; display: flex; align-items: center; gap: 0.4rem;">
                                    <span>💧 Pond Water Physical Conditions</span>
                                </h4>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                    <div>
                                        <label style="font-size: 0.76rem; font-weight: 700; color: #475569; display: block; margin-bottom: 0.3rem;">
                                            Water Level / Depth (cm)
                                        </label>
                                        <input type="number" id="input-water-level" class="form-control" step="1" min="0" placeholder="e.g. 110" style="font-size: 0.9rem; font-weight: 700;" />
                                    </div>
                                    <div>
                                        <label style="font-size: 0.76rem; font-weight: 700; color: #475569; display: block; margin-bottom: 0.3rem;">
                                            Observed Water Colour
                                        </label>
                                        <select id="select-water-colour" class="form-control" style="font-size: 0.88rem; font-weight: 600;">
                                            <option value="">— Select Water Colour —</option>
                                            <option value="Light Green">🟢 Light Green (Good Diatom/Chlorella)</option>
                                            <option value="Green">🟢 Green</option>
                                            <option value="Dark Green">🟢 Dark Green (Dense Bloom)</option>
                                            <option value="Brownish Green">🟤 Brownish Green (Optimal)</option>
                                            <option value="Tea / Light Brown">🟤 Tea / Light Brown (Diatom Dominated)</option>
                                            <option value="Brown">🟤 Brown / Dark Brown</option>
                                            <option value="Clear">⚪ Clear / Low Bloom</option>
                                            <option value="Turbid">⚪ Turbid / Silty</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <!-- Section: Minerals Applied (Stored in mineral_probiotic_used) -->
                            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;">
                                    <div>
                                        <h4 style="margin: 0; font-size: 0.88rem; font-weight: 800; color: #0284c7; display: flex; align-items: center; gap: 0.4rem;">
                                            <span>🧪 Minerals &amp; Chemical Treatments</span>
                                        </h4>
                                        <span style="font-size: 0.72rem; color: #64748b;">Recorded in <code>mineral_probiotic_used</code> for accurate kg summation</span>
                                    </div>
                                    <button type="button" id="btn-add-mineral-row" class="btn-action btn-secondary" style="font-size: 0.75rem; font-weight: 700; padding: 0.25rem 0.65rem;">
                                        <span>+ Add Mineral</span>
                                    </button>
                                </div>
                                <div id="mineral-rows-container" style="display: flex; flex-direction: column; gap: 0.5rem;">
                                    <!-- Dynamic Mineral Rows injected here -->
                                </div>
                            </div>

                            <!-- Section: Probiotics Applied (Stored in mineral_probiotic_used) -->
                            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;">
                                    <div>
                                        <h4 style="margin: 0; font-size: 0.88rem; font-weight: 800; color: #0284c7; display: flex; align-items: center; gap: 0.4rem;">
                                            <span>🦠 Probiotics &amp; Ferments Applied</span>
                                        </h4>
                                        <span style="font-size: 0.72rem; color: #64748b;">Recorded in <code>mineral_probiotic_used</code> for accurate L/kg summation</span>
                                    </div>
                                    <button type="button" id="btn-add-probiotic-row" class="btn-action btn-secondary" style="font-size: 0.75rem; font-weight: 700; padding: 0.25rem 0.65rem;">
                                        <span>+ Add Probiotic</span>
                                    </button>
                                </div>
                                <div id="probiotic-rows-container" style="display: flex; flex-direction: column; gap: 0.5rem;">
                                    <!-- Dynamic Probiotic Rows injected here -->
                                </div>
                            </div>

                            <!-- Section: Mortality & Remarks -->
                            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem;">
                                <div style="display: grid; grid-template-columns: 160px 1fr; gap: 1rem;">
                                    <div>
                                        <label style="font-size: 0.76rem; font-weight: 700; color: #475569; display: block; margin-bottom: 0.3rem;">
                                            Daily Mortality (pcs)
                                        </label>
                                        <input type="number" id="input-mortality" class="form-control" min="0" step="1" placeholder="0" style="font-size: 0.9rem; font-weight: 700;" />
                                    </div>
                                    <div>
                                        <label style="font-size: 0.76rem; font-weight: 700; color: #475569; display: block; margin-bottom: 0.3rem;">
                                            Daily Observations &amp; Remarks
                                        </label>
                                        <input type="text" id="input-remarks" class="form-control" placeholder="e.g. Shrimp active on trays, liming after rain" style="font-size: 0.85rem;" />
                                    </div>
                                </div>
                            </div>

                            <!-- Modal Submit Actions -->
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
                                <button type="button" id="btn-delete-entry" class="btn-action" style="font-size: 0.8rem; color: #ef4444; background: #fee2e2; border: 1px solid #fecaca; padding: 0.5rem 1rem; display: none;">
                                    <span>🗑️ Delete Record</span>
                                </button>
                                <div style="display: flex; gap: 0.6rem; margin-left: auto;">
                                    <button type="button" id="btn-cancel-modal" class="btn-action btn-secondary" style="font-size: 0.84rem; padding: 0.5rem 1.1rem;">
                                        Cancel
                                    </button>
                                    <button type="submit" id="btn-save-record" class="btn-action btn-primary" style="font-size: 0.84rem; font-weight: 800; padding: 0.5rem 1.4rem;">
                                        💾 Save Daily Record
                                    </button>
                                </div>
                            </div>

                        </form>

                    </div>
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

        let startDate;
        if (pond.stck_date) {
            startDate = new Date(pond.stck_date);
            startDate.setHours(0, 0, 0, 0);
        } else {
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 14);
        }

        let cur = new Date(startDate);
        while (cur <= today) {
            const dateStr = cur.toISOString().split("T")[0];
            const doc = pond.stck_date ? calculateDOC(pond.stck_date, cur) : 0;
            const existing = recordsMap.get(dateStr) || null;

            rows.push({
                dateStr,
                doc,
                isToday: dateStr === today.toISOString().split("T")[0],
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
                    isToday: false,
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
        const dObj = new Date(dateStr);
        const formattedDate = dObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

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
            colourBadge = `<span style="font-size: 0.72rem; font-weight: 600; background: #f1f5f9; color: #334155; padding: 0.15rem 0.45rem; border-radius: 4px; border: 1px solid #e2e8f0;">${record.water_colour}</span>`;
        }

        const mortCount = (record && record.mortality_count) ? parseInt(record.mortality_count, 10) : 0;
        const mortBadge = mortCount > 0 
            ? `<span style="font-size: 0.72rem; font-weight: 800; background: #fee2e2; color: #b91c1c; padding: 0.15rem 0.45rem; border-radius: 4px;">${mortCount} pcs</span>`
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
                const todayStr = new Date().toISOString().split("T")[0];
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
        if (btnClose) btnClose.addEventListener("click", () => modal.style.display = "none");
        if (btnCancel) btnCancel.addEventListener("click", () => modal.style.display = "none");

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
        const mineralContainer = this.container.querySelector("#mineral-rows-container");
        if (btnAddMineral && mineralContainer) {
            btnAddMineral.addEventListener("click", () => {
                this.appendMineralRow(mineralContainer, { name: "", amount: "", unit: "KG" });
            });
        }

        // Add Probiotic Row Button
        const btnAddProbiotic = this.container.querySelector("#btn-add-probiotic-row");
        const probioticContainer = this.container.querySelector("#probiotic-rows-container");
        if (btnAddProbiotic && probioticContainer) {
            btnAddProbiotic.addEventListener("click", () => {
                this.appendProbioticRow(probioticContainer, { name: "", amount: "", unit: "L" });
            });
        }

        // Form Submit
        const form = this.container.querySelector("#form-daily-record");
        if (form) {
            form.addEventListener("submit", async (e) => {
                e.preventDefault();
                await this.handleSaveRecord();
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
                        modal.style.display = "none";
                        await this.render(this.currentPond);
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
        row.style.cssText = "display: grid; grid-template-columns: 1fr 110px 90px 36px; gap: 0.5rem; align-items: center;";

        row.innerHTML = `
            <input type="text" list="minerals-autocomplete" class="form-control mineral-name" placeholder="Search or type mineral name" value="${item.name || item.item_name || ''}" style="font-size: 0.85rem; font-weight: 600;" required />
            <input type="number" step="0.1" min="0" class="form-control mineral-amount" placeholder="Qty" value="${item.amount !== undefined ? item.amount : ''}" style="font-size: 0.85rem; font-weight: 700;" required />
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
        row.style.cssText = "display: grid; grid-template-columns: 1fr 110px 90px 36px; gap: 0.5rem; align-items: center;";

        row.innerHTML = `
            <input type="text" list="probiotics-autocomplete" class="form-control probiotic-name" placeholder="Search or type probiotic name" value="${item.name || item.item_name || ''}" style="font-size: 0.85rem; font-weight: 600;" required />
            <input type="number" step="0.1" min="0" class="form-control probiotic-amount" placeholder="Qty" value="${item.amount !== undefined ? item.amount : ''}" style="font-size: 0.85rem; font-weight: 700;" required />
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
     * Opens modal pre-populated for a given date and existing record
     */
    openEntryModal(targetDate, existingRecord = null) {
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

        const pondLabel = this.currentPond.pond || this.currentPond.pond_index || "Pond";
        const dateVal = targetDate || new Date().toISOString().split("T")[0];
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
            titleEl.textContent = `Edit Record — DOC ${doc} (${dateVal})`;
            subTitleEl.textContent = `Update existing log for Pond ${pondLabel}`;
            inputFeed.value = existingRecord.feed_kg !== null && existingRecord.feed_kg !== undefined ? existingRecord.feed_kg : "";
            inputTray.value = existingRecord.feed_tray_remnant_pct !== null && existingRecord.feed_tray_remnant_pct !== undefined ? existingRecord.feed_tray_remnant_pct : "";
            inputWaterLevel.value = existingRecord.water_level_cm !== null && existingRecord.water_level_cm !== undefined ? existingRecord.water_level_cm : "";
            selectColour.value = existingRecord.water_colour || "";
            inputMortality.value = existingRecord.mortality_count !== null && existingRecord.mortality_count !== undefined ? existingRecord.mortality_count : "0";
            inputRemarks.value = existingRecord.remarks || "";
            btnDelete.style.display = "block";
        } else {
            titleEl.textContent = `New Record — DOC ${doc} (${dateVal})`;
            subTitleEl.textContent = `Record daily data for Pond ${pondLabel}`;
            inputFeed.value = "";
            inputTray.value = "0";
            inputWaterLevel.value = "110";
            selectColour.value = "Brownish Green";
            inputMortality.value = "0";
            inputRemarks.value = "";
            btnDelete.style.display = "none";
        }

        // Populate minerals from mineral_probiotic_used
        existingMinerals.forEach(m => this.appendMineralRow(mineralContainer, m));

        // Populate probiotics from mineral_probiotic_used
        existingProbiotics.forEach(p => this.appendProbioticRow(probioticContainer, p));

        modal.style.display = "flex";
    }

    /**
     * Handles saving record to Supabase:
     * 1. Upserts into daily_pond_records
     * 2. Syncs rows into mineral_probiotic_used
     */
    async handleSaveRecord() {
        const inputDate = this.container.querySelector("#input-entry-date");
        const inputFeed = this.container.querySelector("#input-feed-kg");
        const inputTray = this.container.querySelector("#input-tray-pct");
        const inputWaterLevel = this.container.querySelector("#input-water-level");
        const selectColour = this.container.querySelector("#select-water-colour");
        const inputMortality = this.container.querySelector("#input-mortality");
        const inputRemarks = this.container.querySelector("#input-remarks");
        const btnSave = this.container.querySelector("#btn-save-record");

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

        const dailyPayload = {
            pond_index: pondIndex,
            pond: pondName,
            log_date: logDate,
            feed_kg: inputFeed.value !== "" ? parseFloat(inputFeed.value) : 0,
            feed_tray_remnant_pct: inputTray.value !== "" ? parseInt(inputTray.value, 10) : 0,
            water_level_cm: inputWaterLevel.value !== "" ? parseFloat(inputWaterLevel.value) : null,
            water_colour: selectColour.value || null,
            mortality_count: inputMortality.value !== "" ? parseInt(inputMortality.value, 10) : 0,
            remarks: (inputRemarks.value || "").trim() || null
        };

        if (this.activeModalRecord && this.activeModalRecord.id) {
            dailyPayload.id = this.activeModalRecord.id;
        }

        btnSave.disabled = true;
        btnSave.textContent = "Saving to Supabase...";

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

            Toast.success(`Daily record & treatments for ${logDate} saved successfully!`);
            this.container.querySelector("#modal-daily-entry").style.display = "none";

            // Refresh ledger book & totals
            await this.render(this.currentPond);
        } catch (err) {
            console.error("Save error:", err);
            Toast.error("Failed to save daily record: " + err.message);
        } finally {
            btnSave.disabled = false;
            btnSave.textContent = "💾 Save Daily Record";
        }
    }
}
