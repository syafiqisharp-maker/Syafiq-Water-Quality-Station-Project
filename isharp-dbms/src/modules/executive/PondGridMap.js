/**
 * iSHARP DBMS 2.0 — 216-Pond Interactive Farm Grid Map
 * Executive Biosecurity, Pathogen Surveillance, and Culture Stage Visualization
 * Setiu Farm (9 Modules × 2 Rows × 12 Ponds = 216 Ponds)
 */

import { PondRepository } from "../../infrastructure/repositories/pondRepository.js";
import { LabRepository } from "../../infrastructure/repositories/labRepository.js";
import { SamplingRepository } from "../../infrastructure/repositories/samplingRepository.js";
import { appState } from "../../state/appState.js";
import { calculateDOC } from "../../domain/biometrics.js";
import { Toast } from "../../components/Toast.js";

const CACHE_KEY = "isharp_farm_map_cache_v2";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute smart in-memory session cache

export class PondGridMap {
    /**
     * @param {string} containerId 
     */
    constructor(containerId = "exec-map-container") {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        // Internal State
        this.filters = {
            species: "ALL",      // ALL, VAN, MON
            health: "ALL",       // ALL, RED, YELLOW, GREEN, IDLE
            stage: "ALL",        // ALL, EARLY, MID, FINISHING
            search: ""
        };

        this.activeCycleMap = new Map(); // normalized pond_code (e.g. "04.08.02") -> stocking record
        this.issuesMap = new Map();      // pond_index -> array of issues
        this.selectedPond = null;
        this.isLoading = false;

        this.initStructure();
        this.initDrawer();
        this.bindEvents();
        this.loadData();
    }

    /**
     * Initialize static container layout (Toolbar + Grid Mount).
     */
    initStructure() {
        this.container.innerHTML = `
            <div class="farm-map-wrapper">
                
                <!-- Filter & Control Toolbar -->
                <div class="farm-map-toolbar">
                    <!-- Left: Filters -->
                    <div class="farm-filter-group">
                        <span class="farm-filter-label">Species:</span>
                        <button type="button" class="farm-filter-btn active" data-filter-type="species" data-filter-val="ALL">All</button>
                        <button type="button" class="farm-filter-btn" data-filter-type="species" data-filter-val="VAN">VAN</button>
                        <button type="button" class="farm-filter-btn" data-filter-type="species" data-filter-val="MON">MON</button>
                    </div>

                    <div class="farm-filter-group">
                        <span class="farm-filter-label">Biosecurity:</span>
                        <button type="button" class="farm-filter-btn active" data-filter-type="health" data-filter-val="ALL">All</button>
                        <button type="button" class="farm-filter-btn" data-filter-type="health" data-filter-val="RED" style="color: #b91c1c;">🔴 Red Alert</button>
                        <button type="button" class="farm-filter-btn" data-filter-type="health" data-filter-val="YELLOW" style="color: #b45309;">🟡 Warning</button>
                        <button type="button" class="farm-filter-btn" data-filter-type="health" data-filter-val="GREEN" style="color: #15803d;">🟢 Clean</button>
                        <button type="button" class="farm-filter-btn" data-filter-type="health" data-filter-val="IDLE">⚪ Idle</button>
                    </div>

                    <div class="farm-filter-group">
                        <span class="farm-filter-label">Stage:</span>
                        <button type="button" class="farm-filter-btn active" data-filter-type="stage" data-filter-val="ALL">All</button>
                        <button type="button" class="farm-filter-btn" data-filter-type="stage" data-filter-val="EARLY">Early (&lt;30)</button>
                        <button type="button" class="farm-filter-btn" data-filter-type="stage" data-filter-val="MID">Mid (30–70)</button>
                        <button type="button" class="farm-filter-btn" data-filter-type="stage" data-filter-val="FINISHING">Finishing (&gt;70)</button>
                    </div>

                    <!-- Right: Search & Refresh -->
                    <div class="farm-filter-group" style="margin-left: auto;">
                        <input type="text" id="map-pond-search" class="farm-search-input" placeholder="Search pond (e.g. 04.08.02)..." />
                        <button type="button" id="btn-map-refresh" class="farm-filter-btn" title="Refresh live farm data from Supabase">
                            <span>🔄 Refresh</span>
                        </button>
                    </div>
                </div>

                <!-- 216-Pond Farm Grid Container -->
                <div class="farm-grid-container" id="farm-grid-mount">
                    <div style="padding: 2.5rem; text-align: center; color: #64748b;">
                        <div class="spinner-sm" style="margin: 0 auto 0.75rem auto;"></div>
                        <span>Loading live farm telemetry across all 9 modules...</span>
                    </div>
                </div>

            </div>
        `;

        this.dom = {
            gridMount: document.getElementById("farm-grid-mount"),
            searchInput: document.getElementById("map-pond-search"),
            btnRefresh: document.getElementById("btn-map-refresh")
        };
    }

    /**
     * Initializes slide-out detail drawer DOM element.
     */
    initDrawer() {
        let backdrop = document.getElementById("pond-drawer-backdrop");
        if (!backdrop) {
            backdrop = document.createElement("div");
            backdrop.id = "pond-drawer-backdrop";
            backdrop.className = "pond-drawer-backdrop";
            document.body.appendChild(backdrop);
        }

        let drawer = document.getElementById("pond-detail-drawer");
        if (!drawer) {
            drawer = document.createElement("div");
            drawer.id = "pond-detail-drawer";
            drawer.className = "pond-detail-drawer";
            document.body.appendChild(drawer);
        }

        this.drawerBackdrop = backdrop;
        this.drawer = drawer;

        // Close events
        backdrop.addEventListener("click", () => this.closeDrawer());
    }

    /**
     * Event Listeners for Filters, Search, and Refresh.
     */
    bindEvents() {
        // Filter Buttons
        this.container.addEventListener("click", (e) => {
            const btn = e.target.closest(".farm-filter-btn[data-filter-type]");
            if (btn) {
                const type = btn.getAttribute("data-filter-type");
                const val = btn.getAttribute("data-filter-val");

                // Toggle active class inside group
                const group = btn.closest(".farm-filter-group");
                group.querySelectorAll(".farm-filter-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");

                this.filters[type] = val;
                this.applyFilters();
            }
        });

        // Search Input
        if (this.dom.searchInput) {
            this.dom.searchInput.addEventListener("input", (e) => {
                this.filters.search = e.target.value.trim().toLowerCase();
                this.applyFilters();
            });
        }

        // Refresh Button
        if (this.dom.btnRefresh) {
            this.dom.btnRefresh.addEventListener("click", () => {
                this.loadData(true);
            });
        }
    }

    /**
     * Loads live farm telemetry and active cycles across ALL modules from Supabase.
     * @param {boolean} forceRefresh 
     */
    async loadData(forceRefresh = false) {
        if (this.isLoading) return;
        this.isLoading = true;

        if (this.dom.btnRefresh) {
            this.dom.btnRefresh.innerHTML = "<span>⏳ Syncing...</span>";
            this.dom.btnRefresh.disabled = true;
        }

        try {
            // Check session cache if not forced
            if (!forceRefresh) {
                const cached = sessionStorage.getItem(CACHE_KEY);
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached);
                        if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
                            this.populateFromData(parsed.activeCycles, parsed.activePonds, parsed.issues);
                            this.renderGrid();
                            this.isLoading = false;
                            if (this.dom.btnRefresh) {
                                this.dom.btnRefresh.innerHTML = "<span>🔄 Refresh</span>";
                                this.dom.btnRefresh.disabled = false;
                            }
                            return;
                        }
                    } catch (e) {
                        sessionStorage.removeItem(CACHE_KEY);
                    }
                }
            }

            // Batch fetch non-closed cycles (covers all 9 modules), gatekeeper, and issues
            const [activeCycles, activePonds, issues] = await Promise.all([
                PondRepository.getActiveCycles(),
                PondRepository.getActiveOperationalPonds(),
                LabRepository.getAllRecentIssues(1000)
            ]);

            // Save to session cache
            try {
                sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                    timestamp: Date.now(),
                    activeCycles,
                    activePonds,
                    issues
                }));
            } catch (e) {
                console.warn("Could not cache farm map state in sessionStorage", e);
            }

            this.populateFromData(activeCycles, activePonds, issues);
            this.renderGrid();
            Toast.success("Farm biosecurity map updated across all 9 modules.");
        } catch (err) {
            console.error("Error loading farm map data:", err);
            Toast.error("Failed to sync farm map data. Using cached snapshot.");
        } finally {
            this.isLoading = false;
            if (this.dom.btnRefresh) {
                this.dom.btnRefresh.innerHTML = "<span>🔄 Refresh</span>";
                this.dom.btnRefresh.disabled = false;
            }
        }
    }

    /**
     * Ingests cycles, gatekeeper active ponds, and issues into fast lookup tables.
     */
    populateFromData(cycles = [], activePonds = [], issues = []) {
        this.activeCycleMap.clear();
        this.issuesMap.clear();

        // 1. Map issues by pond_index
        (issues || []).forEach(issue => {
            if (!issue.pond_index) return;
            const pIdx = String(issue.pond_index);
            if (!this.issuesMap.has(pIdx)) {
                this.issuesMap.set(pIdx, []);
            }
            this.issuesMap.get(pIdx).push(issue);
        });

        // 2. Build set of active gatekeeper ponds
        const gatekeeperSet = new Set();
        (activePonds || []).forEach(p => {
            const norm = this.normalizePondCode(p.pond) || this.derivePondCode(p.pond_index);
            if (norm) gatekeeperSet.add(norm);
        });

        // 3. Map cycles by normalized pond code (e.g. "02.03.07")
        (cycles || []).forEach(cycle => {
            let code = this.normalizePondCode(cycle.pond);
            // Fallback: derive coordinate directly from pond_index (e.g. 2020307.41 -> 02.03.07)
            if (!code && cycle.pond_index) {
                code = this.derivePondCode(cycle.pond_index);
            }
            if (!code) return;

            const isGatekeeper = gatekeeperSet.has(code);
            const isProd = (cycle.pond_status || '').toUpperCase() === 'PRODUCTION';

            // Only overwrite if this cycle is active/prod or not yet mapped
            if (!this.activeCycleMap.has(code) || isGatekeeper || isProd) {
                this.activeCycleMap.set(code, cycle);
            }
        });
    }

    /**
     * Normalizes pond code format to standard MM.RR.PP (e.g. "01.02.12" or "1.2.12").
     */
    normalizePondCode(code) {
        if (!code) return "";
        const parts = String(code).trim().split(".");
        if (parts.length === 3) {
            return `${parts[0].padStart(2, "0")}.${parts[1].padStart(2, "0")}.${parts[2].padStart(2, "0")}`;
        }
        return String(code).trim();
    }

    /**
     * Derives MM.RR.PP coordinate from compound PondIndex (e.g. "2020307.41" -> "02.03.07").
     */
    derivePondCode(pondIndex) {
        if (!pondIndex || String(pondIndex).trim().length < 7) return "";
        const clean = String(pondIndex).trim();
        const m = clean.substring(1, 3);
        const r = clean.substring(3, 5);
        const p = clean.substring(5, 7);
        return `${m}.${r}.${p}`;
    }

    /**
     * Generates the 216-pond matrix and renders HTML into DOM.
     */
    renderGrid() {
        if (!this.dom.gridMount) return;

        let html = "";
        let redCount = 0;
        let yellowCount = 0;
        let greenCount = 0;
        let activeCount = 0;
        let idleCount = 0;

        // Loop through 9 Modules
        for (let m = 1; m <= 9; m++) {
            const modStr = String(m).padStart(2, "0");
            const r1 = (m * 2) - 1; // e.g. M1 -> R1, M2 -> R3
            const r2 = m * 2;       // e.g. M1 -> R2, M2 -> R4
            const r1Str = String(r1).padStart(2, "0");
            const r2Str = String(r2).padStart(2, "0");

            html += `
                <div class="farm-module-block" data-module="${modStr}">
                    <div class="farm-module-header">
                        <div class="farm-module-name">
                            <span>Module ${modStr}</span>
                        </div>
                    </div>

                    <!-- Row 1 -->
                    <div class="farm-row-container">
                        <div class="farm-row-label">R${r1Str}</div>
                        <div class="farm-row-ponds">
                            ${this.renderRowPonds(modStr, r1Str, (stats) => {
                                redCount += stats.red;
                                yellowCount += stats.yellow;
                                greenCount += stats.green;
                                activeCount += stats.active;
                                idleCount += stats.idle;
                            })}
                        </div>
                    </div>

                    <!-- Row 2 -->
                    <div class="farm-row-container">
                        <div class="farm-row-label">R${r2Str}</div>
                        <div class="farm-row-ponds">
                            ${this.renderRowPonds(modStr, r2Str, (stats) => {
                                redCount += stats.red;
                                yellowCount += stats.yellow;
                                greenCount += stats.green;
                                activeCount += stats.active;
                                idleCount += stats.idle;
                            })}
                        </div>
                    </div>
                </div>
            `;
        }

        this.dom.gridMount.innerHTML = html;
        this.bindPondTileEvents();
        this.updateHeaderKPIs(activeCount, idleCount, redCount, yellowCount, greenCount);
        this.applyFilters();
    }

    /**
     * Renders 12 ponds for a single row.
     */
    renderRowPonds(modStr, rowStr, statCallback) {
        let cells = "";
        let red = 0, yellow = 0, green = 0, active = 0, idle = 0;

        for (let p = 1; p <= 12; p++) {
            const pStr = String(p).padStart(2, "0");
            const pondCode = `${modStr}.${rowStr}.${pStr}`;
            const cycle = this.activeCycleMap.get(pondCode);

            // Compute Biosecurity & Culture Stage
            const pondData = this.evaluatePondState(pondCode, cycle);

            if (pondData.health === "RED") red++;
            else if (pondData.health === "YELLOW") yellow++;
            else if (pondData.health === "GREEN") green++;

            if (pondData.isActive) active++;
            else idle++;

            cells += `
                <div class="pond-tile ${pondData.cssClass}" 
                     data-pond="${pondCode}"
                     data-index="${pondData.pondIndex}"
                     data-species="${pondData.speciesCode}"
                     data-health="${pondData.health}"
                     data-stage="${pondData.stageCode}"
                     data-doc="${pondData.doc}">
                    
                    <div class="pond-tile-top">
                        <span class="pond-tile-id">${pStr}</span>
                        <span class="pond-badge-indicator" title="${pondData.healthDescription}"></span>
                    </div>

                    <div class="pond-tile-doc">${pondData.docDisplay}</div>

                    <div class="pond-tile-bottom">
                        <span class="pond-species-badge ${pondData.speciesBadgeClass}">${pondData.speciesLabel}</span>
                    </div>
                </div>
            `;
        }

        if (statCallback) statCallback({ red, yellow, green, active, idle });
        return cells;
    }

    /**
     * Computes the biosecurity status, species, and DOC for a pond.
     */
    evaluatePondState(pondCode, cycle) {
        if (!cycle) {
            return {
                pondCode,
                pondIndex: "",
                isActive: false,
                doc: 0,
                docDisplay: "—",
                speciesCode: "IDLE",
                speciesLabel: "IDLE",
                speciesBadgeClass: "sp-idle",
                health: "IDLE",
                healthDescription: "Idle / Preparation Pond",
                stageCode: "IDLE",
                cssClass: "risk-idle"
            };
        }

        const isProd = (cycle.pond_status || '').toUpperCase() === 'PRODUCTION';
        const doc = cycle.stck_date ? calculateDOC(cycle.stck_date, cycle.date_close) : 0;
        const species = (cycle.stck_species || cycle.species || '').toUpperCase();
        const isVan = species.includes("VAN");
        const isMon = species.includes("MON");
        const speciesCode = isVan ? "VAN" : isMon ? "MON" : "VAN";
        const speciesLabel = isVan ? "VAN" : isMon ? "MON" : "VAN";
        const speciesBadgeClass = isVan ? "sp-van" : "sp-mon";

        // Culture Stage
        let stageCode = "EARLY";
        if (doc >= 30 && doc <= 70) stageCode = "MID";
        else if (doc > 70) stageCode = "FINISHING";

        // Biosecurity & Pathology Evaluation
        const issues = this.issuesMap.get(String(cycle.pond_index)) || [];
        let health = "GREEN";
        let healthDesc = "Clean production (Negative lab test)";

        // Check recent issues for RED or YELLOW flags
        for (const issue of issues) {
            const flag = (issue.issue_flag || '').toUpperCase();
            const note = (issue.issue_note || '').toUpperCase();
            const pcr = (issue.pcr_result || '').toUpperCase();

            if (flag === "RED" || note.includes("POSITIVE") || pcr === "POSITIVE") {
                health = "RED";
                healthDesc = `Active pathogen alert: ${issue.issue_status || 'Disease'} (${issue.issue_test || 'PCR'})`;
                break;
            } else if (flag === "YELLOW" || note.includes("SUSPICIOUS") || flag === "WARN") {
                health = "YELLOW";
                healthDesc = `Observation warning: ${issue.issue_status || 'Elevated risk'}`;
            }
        }

        if (!isProd) {
            health = "IDLE";
            healthDesc = "Idle / Pond Preparation";
        }

        let cssClass = "risk-green";
        if (health === "RED") cssClass = "risk-red";
        else if (health === "YELLOW") cssClass = "risk-yellow";
        else if (health === "IDLE") cssClass = "risk-idle";

        return {
            pondCode,
            pondIndex: cycle.pond_index,
            isActive: isProd,
            doc,
            docDisplay: isProd ? `${doc}` : "—",
            speciesCode,
            speciesLabel: isProd ? speciesLabel : "IDLE",
            speciesBadgeClass: isProd ? speciesBadgeClass : "sp-idle",
            health,
            healthDescription: healthDesc,
            stageCode: isProd ? stageCode : "IDLE",
            cssClass
        };
    }

    /**
     * Binds Click Drawer to pond tiles.
     */
    bindPondTileEvents() {
        const tiles = this.container.querySelectorAll(".pond-tile");

        tiles.forEach(tile => {
            // Click Drawer
            tile.addEventListener("click", () => {
                const pondCode = tile.getAttribute("data-pond");
                const pondIndex = tile.getAttribute("data-index");
                this.openDrawer(pondCode, pondIndex);
            });
        });
    }

    /**
     * Opens Slide-Out Detail Drawer for selected pond.
     */
    async openDrawer(pondCode, pondIndex) {
        if (!this.drawer || !this.drawerBackdrop) return;

        const cycle = this.activeCycleMap.get(pondCode);
        const issues = pondIndex ? (this.issuesMap.get(String(pondIndex)) || []) : [];

        // Render drawer loading skeleton
        this.drawer.innerHTML = `
            <div class="drawer-header">
                <div>
                    <div class="drawer-pond-title">Pond ${pondCode}</div>
                    <div class="drawer-pond-sub">${cycle ? `Cycle Index: ${cycle.pond_index}` : 'No active culture cycle'}</div>
                </div>
                <button type="button" class="drawer-close-btn" id="btn-close-drawer">✕</button>
            </div>

            <div class="drawer-body">
                <div class="drawer-stat-grid">
                    <div class="drawer-stat-box">
                        <div class="drawer-stat-lbl">Culture Age</div>
                        <div class="drawer-stat-val">${cycle && cycle.stck_date ? calculateDOC(cycle.stck_date, cycle.date_close) + ' DOC' : '—'}</div>
                    </div>
                    <div class="drawer-stat-box">
                        <div class="drawer-stat-lbl">Species</div>
                        <div class="drawer-stat-val">${cycle ? (cycle.stck_species || 'P. VANNAMEI') : 'IDLE'}</div>
                    </div>
                    <div class="drawer-stat-box">
                        <div class="drawer-stat-lbl">Stocking Date</div>
                        <div class="drawer-stat-val" style="font-size: 0.95rem;">${cycle && cycle.stck_date ? cycle.stck_date : '—'}</div>
                    </div>
                    <div class="drawer-stat-box">
                        <div class="drawer-stat-lbl">Stocked Pieces</div>
                        <div class="drawer-stat-val" style="font-size: 1.05rem;">${cycle && cycle.stck_total ? Number(cycle.stck_total).toLocaleString() : '—'}</div>
                    </div>
                </div>

                <!-- Biometrics Sampling Preview -->
                <div class="drawer-section">
                    <div class="drawer-section-title">
                        <span>📊 Latest Growth Biometrics</span>
                    </div>
                    <div id="drawer-sampling-container" style="padding: 0.5rem; text-align: center; color: #64748b; font-size: 0.8rem;">
                        <span>Loading sampling history...</span>
                    </div>
                </div>

                <!-- Biosecurity & Pathology History -->
                <div class="drawer-section">
                    <div class="drawer-section-title">
                        <span>🔬 Laboratory &amp; Pathogen Tests</span>
                        <span style="font-size: 0.72rem; color: #64748b; font-weight: 500;">(${issues.length} records)</span>
                    </div>
                    <div class="drawer-issues-list">
                        ${issues.length === 0 ? `
                            <div style="padding: 0.85rem; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; color: #166534; font-size: 0.78rem;">
                                🟢 <strong>Clean Biosecurity:</strong> No negative pathology or active pathogen alerts recorded for this cycle.
                            </div>
                        ` : issues.map(iss => {
                            const isRed = (iss.issue_flag || '').toUpperCase() === 'RED' || (iss.pcr_result || '').toUpperCase() === 'POSITIVE';
                            const isYellow = (iss.issue_flag || '').toUpperCase() === 'YELLOW';
                            const css = isRed ? 'risk-red' : isYellow ? 'risk-yellow' : '';
                            return `
                                <div class="drawer-issue-item ${css}">
                                    <div>
                                        <div style="font-weight: 800;">${iss.issue_status || 'Pathology Test'} (${iss.issue_test || 'PCR'})</div>
                                        <div style="font-size: 0.7rem; color: #64748b;">${iss.issue_date || 'Recent'} • Grade: ${iss.issue_grade || 'G0'}</div>
                                    </div>
                                    <div style="text-align: right;">
                                        <span class="status-badge ${isRed ? 'status-close' : isYellow ? 'status-idle' : 'status-production'}">${iss.issue_flag || 'OK'}</span>
                                        <div style="font-size: 0.7rem; font-weight: 700; margin-top: 0.2rem;">${iss.issue_note || 'NEGATIVE'}</div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>

            </div>

            <div class="drawer-footer">
                <button type="button" class="btn-open-dbms" id="btn-drawer-to-dbms" ${!cycle ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                    <span>⚙️ Open in DBMS View →</span>
                </button>
            </div>
        `;

        // Slide Drawer Open
        this.drawerBackdrop.classList.add("open");
        this.drawer.classList.add("open");

        // Bind Drawer Inner Events
        const btnClose = this.drawer.querySelector("#btn-close-drawer");
        if (btnClose) btnClose.addEventListener("click", () => this.closeDrawer());

        const btnDbms = this.drawer.querySelector("#btn-drawer-to-dbms");
        if (btnDbms && cycle) {
            btnDbms.addEventListener("click", () => {
                this.closeDrawer();
                // Set active pond and navigate to DBMS view
                appState.setCurrentPond(cycle);
                window.location.hash = "#/dbms";
            });
        }

        // Fetch on-demand sampling records for this pond
        if (pondIndex) {
            this.loadDrawerSampling(pondIndex);
        }
    }

    /**
     * Loads biometrics sampling for the drawer.
     */
    async loadDrawerSampling(pondIndex) {
        const container = document.getElementById("drawer-sampling-container");
        if (!container) return;

        try {
            const sampling = await SamplingRepository.getSamplingByPond(pondIndex);
            if (!sampling || sampling.length === 0) {
                container.innerHTML = `<div style="font-size: 0.76rem; color: #94a3b8; padding: 0.5rem;">No net-cast sampling data logged yet for this cycle.</div>`;
                return;
            }

            const latest = sampling[sampling.length - 1];
            container.innerHTML = `
                <div class="drawer-stat-grid" style="margin-top: 0.25rem;">
                    <div class="drawer-stat-box" style="background: #ffffff;">
                        <div class="drawer-stat-lbl">Latest ABW</div>
                        <div class="drawer-stat-val" style="color: #0284c7;">${latest.smpl_abw ? latest.smpl_abw + ' g' : '—'}</div>
                    </div>
                    <div class="drawer-stat-box" style="background: #ffffff;">
                        <div class="drawer-stat-lbl">Est. Biomass</div>
                        <div class="drawer-stat-val" style="color: #059669;">${latest.smpl_bms ? Number(latest.smpl_bms).toLocaleString() + ' kg' : '—'}</div>
                    </div>
                    <div class="drawer-stat-box" style="background: #ffffff;">
                        <div class="drawer-stat-lbl">Survival Rate (SR)</div>
                        <div class="drawer-stat-val">${latest.smpl_surv ? latest.smpl_surv + ' %' : '—'}</div>
                    </div>
                    <div class="drawer-stat-box" style="background: #ffffff;">
                        <div class="drawer-stat-lbl">Sample Date</div>
                        <div class="drawer-stat-val" style="font-size: 0.92rem;">${latest.smpl_date || '—'}</div>
                    </div>
                </div>
            `;
        } catch (err) {
            container.innerHTML = `<div style="font-size: 0.76rem; color: #ef4444;">Could not load sampling records.</div>`;
        }
    }

    /**
     * Closes the slide-out detail drawer.
     */
    closeDrawer() {
        if (this.drawerBackdrop) this.drawerBackdrop.classList.remove("open");
        if (this.drawer) this.drawer.classList.remove("open");
    }

    /**
     * Updates top KPI cards in Executive View.
     */
    updateHeaderKPIs(active, idle, red, yellow, green) {
        const elActive = document.getElementById("exec-kpi-active");
        if (elActive) {
            elActive.innerHTML = `${active} <span style="font-size: 0.9rem; color: #64748b; font-weight: 500;">/ 216</span>`;
        }

        const elIdle = document.getElementById("exec-kpi-idle");
        if (elIdle) {
            elIdle.innerHTML = `${idle} <span style="font-size: 0.9rem; color: #64748b; font-weight: 500;">Ponds</span>`;
        }

        const elHealth = document.getElementById("exec-kpi-health");
        if (elHealth) {
            if (red > 0) {
                elHealth.innerHTML = `<span style="color: #ef4444;">${red} Red Alerts</span>`;
            } else if (yellow > 0) {
                elHealth.innerHTML = `<span style="color: #d97706;">${yellow} Warnings</span>`;
            } else {
                elHealth.innerHTML = `<span style="color: #10b981;">All Clean</span>`;
            }
        }
    }

    /**
     * Applies toolbar filters and dims unmatched pond tiles.
     */
    applyFilters() {
        const tiles = this.container.querySelectorAll(".pond-tile");

        tiles.forEach(tile => {
            const sp = tile.getAttribute("data-species");
            const hl = tile.getAttribute("data-health");
            const st = tile.getAttribute("data-stage");
            const pd = tile.getAttribute("data-pond").toLowerCase();

            let match = true;

            // Species Filter
            if (this.filters.species !== "ALL") {
                if (this.filters.species !== sp) match = false;
            }

            // Health Filter
            if (this.filters.health !== "ALL") {
                if (this.filters.health !== hl) match = false;
            }

            // Stage Filter
            if (this.filters.stage !== "ALL") {
                if (this.filters.stage !== st) match = false;
            }

            // Search Filter
            if (this.filters.search && this.filters.search !== "") {
                if (!pd.includes(this.filters.search)) match = false;
            }

            if (match) {
                tile.classList.remove("dimmed");
            } else {
                tile.classList.add("dimmed");
            }
        });
    }
}
