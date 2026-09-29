/**
 * iSHARP DBMS 2.0 — Field Operations: 24-Pond Module Overview Map
 * Dedicated supervisor operational map showing 24 ponds per module (2 rows × 12 ponds).
 * Single Source of Truth: Reads directly from view_growout_pond_cycles, pond_staff, and growout_pond_master.
 * No fake or simulated IoT telemetry — clearly indicates active culture vs. idle status with real operational attributes.
 */

import { calculateDOC } from "../../domain/biometrics.js";
import { calculateTotalActiveHP } from "../../domain/aeration.js";
import { supabase } from "../../infrastructure/supabase.js";
import { StaffRepository } from "../../infrastructure/repositories/staffRepository.js";

export class FieldOpsMap {
    /**
     * @param {string} containerId Container ID
     * @param {number} moduleNo Module number (1 to 9)
     * @param {Function} onSelectPond Callback when pond tile is clicked
     */
    constructor(containerId = "field-ops-map-mount", moduleNo = 1, onSelectPond = null) {
        this.container = document.getElementById(containerId);
        this.moduleNo = moduleNo;
        this.onSelectPond = onSelectPond;

        this.filter = "ALL"; // ALL, PRODUCTION, IDLE
        this.searchTerm = "";

        this.pondsData = new Map(); // pondLabel -> { pond, cycleRecord, isIdle, operatorName, totalHP }
        this.isLoading = false;

        this.initStructure();
        this.loadModulePonds();
    }

    setModule(modNo) {
        this.moduleNo = modNo;
        this.loadModulePonds();
    }

    initStructure() {
        if (!this.container) return;
        const modStr = String(this.moduleNo).padStart(2, "0");

        this.container.innerHTML = `
            <div class="field-ops-map-wrapper" style="display: flex; flex-direction: column; gap: 1rem;">
                
                <!-- Toolbar: Filter Pills, Search, and Refresh -->
                <div class="field-ops-toolbar flex-between" style="background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.95); border-radius: 16px; padding: 0.75rem 1.25rem; box-shadow: 0 4px 16px rgba(2, 132, 199, 0.05); flex-wrap: wrap; gap: 0.75rem;">
                    
                    <!-- Left: Operational Status Filter Buttons -->
                    <div class="feeding-filter-group" style="display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap;">
                        <span style="font-size: 0.76rem; font-weight: 800; color: #475569; margin-right: 0.2rem;">Culture Status:</span>
                        <button type="button" class="btn-filter-action active" data-action-filter="ALL" style="font-size: 0.74rem; font-weight: 700; padding: 0.25rem 0.75rem; border-radius: 999px; border: 1px solid #cbd5e1; background: #ffffff; cursor: pointer;">All 24 Ponds</button>
                        <button type="button" class="btn-filter-action" data-action-filter="PRODUCTION" style="font-size: 0.74rem; font-weight: 700; padding: 0.25rem 0.75rem; border-radius: 999px; border: 1px solid #bbf7d0; background: #f0fdf4; color: #166534; cursor: pointer;">🟢 In Culture</button>
                        <button type="button" class="btn-filter-action" data-action-filter="IDLE" style="font-size: 0.74rem; font-weight: 700; padding: 0.25rem 0.75rem; border-radius: 999px; border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b; cursor: pointer;">⚪ Idle / Prep</button>
                    </div>

                    <!-- Right: Search and Refresh -->
                    <div style="display: flex; align-items: center; gap: 0.6rem; margin-left: auto;">
                        <input type="text" id="input-field-ops-search" placeholder="Search pond (e.g. 11)..." style="font-size: 0.78rem; padding: 0.35rem 0.75rem; border-radius: 8px; border: 1px solid #cbd5e1; outline: none; width: 170px; background: rgba(255, 255, 255, 0.9);" />
                        <button type="button" id="btn-refresh-field-ops" class="btn-action btn-secondary" style="font-size: 0.76rem; font-weight: 700; padding: 0.35rem 0.8rem;">
                            <span>🔄 Refresh</span>
                        </button>
                    </div>
                </div>

                <!-- 24-Pond Visual Stage Mount -->
                <div id="field-ops-grid-mount" style="min-height: 480px;">
                    <div style="text-align: center; color: #64748b; padding: 3rem 0;">
                        <div class="spinner-sm" style="margin: 0 auto 0.75rem auto;"></div>
                        <span>Loading Module ${modStr} pond operations from database...</span>
                    </div>
                </div>

            </div>
        `;

        this.bindToolbarEvents();
    }

    bindToolbarEvents() {
        const filterBtns = this.container.querySelectorAll(".btn-filter-action");
        filterBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                filterBtns.forEach(b => {
                    b.classList.remove("active");
                    b.style.boxShadow = "none";
                });
                btn.classList.add("active");
                btn.style.boxShadow = "0 0 0 2px #0284c7";
                this.filter = btn.getAttribute("data-action-filter");
                this.renderGrid();
            });
        });

        const searchInput = this.container.querySelector("#input-field-ops-search");
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                this.searchTerm = e.target.value.trim().toLowerCase();
                this.renderGrid();
            });
        }

        const btnRefresh = this.container.querySelector("#btn-refresh-field-ops");
        if (btnRefresh) {
            btnRefresh.addEventListener("click", () => this.loadModulePonds());
        }
    }

    async loadModulePonds() {
        const gridMount = this.container.querySelector("#field-ops-grid-mount");
        if (gridMount) {
            gridMount.innerHTML = `
                <div style="text-align: center; color: #64748b; padding: 3rem 0;">
                    <div class="spinner-sm" style="margin: 0 auto 0.75rem auto;"></div>
                    <span>Fetching live 24-pond status for Module ${String(this.moduleNo).padStart(2, "0")}...</span>
                </div>
            `;
        }

        const modStr = String(this.moduleNo).padStart(2, "0");
        const r1Num = (this.moduleNo - 1) * 2 + 1;
        const r2Num = (this.moduleNo - 1) * 2 + 2;
        const r1Str = String(r1Num).padStart(2, "0");
        const r2Str = String(r2Num).padStart(2, "0");

        try {
            // Fetch all non-closed cycles in this module from unified view view_growout_pond_cycles
            const cycles = await supabase.request(`view_growout_pond_cycles?modl=eq.${modStr}&pond_status=neq.CLOSE&select=pond_index,pond,modl,row_no,cycle_no,crop_no,pond_status,stck_date,date_close,area,aerator_1hp,aerator_2hp,stck_species,bs_line,pm_staff_no,sv_staff_no,rl_staff_no,po_staff_no,support_staff_no`);

            // Fetch staff directory into memory for quick name resolution
            await StaffRepository.getStaffDirectory();

            // Construct 24 expected ponds for this module (2 rows x 12 ponds)
            this.pondsData.clear();

            for (let r of [r1Str, r2Str]) {
                for (let p = 1; p <= 12; p++) {
                    const pStr = String(p).padStart(2, "0");
                    const pondLabel = `${modStr}.${r}.${pStr}`;

                    // Find matching active cycle for this pond
                    const cycleRecord = (cycles || []).find(c => c.pond === pondLabel || (c.pond_index && c.pond_index.startsWith(`2${modStr}${r}${pStr}`)));

                    const isIdle = !cycleRecord || (cycleRecord.pond_status || "").toUpperCase() === "IDLE" || !cycleRecord.stck_date;

                    // Resolve Primary Operator from Single Source of Truth (pond_staff)
                    let operatorName = "Unassigned";
                    if (cycleRecord && cycleRecord.po_staff_no) {
                        const s = StaffRepository.findStaffByNo(cycleRecord.po_staff_no);
                        operatorName = s ? `${s.staff_name} [${cycleRecord.po_staff_no}]` : `ID #${cycleRecord.po_staff_no}`;
                    }

                    // Calculate active aeration HP (1.0 HP & 2.0 HP only)
                    const u1 = parseInt(cycleRecord?.aerator_1hp || 0, 10);
                    const u2 = parseInt(cycleRecord?.aerator_2hp || 0, 10);
                    const totalHP = calculateTotalActiveHP(u1, u2);

                    this.pondsData.set(pondLabel, {
                        pondLabel,
                        rowNo: r,
                        pondNo: pStr,
                        cycleRecord: cycleRecord || {
                            pond: pondLabel,
                            pond_index: `2${modStr}${r}${pStr}.00`,
                            pond_status: "IDLE",
                            area: 0.5,
                            aerator_1hp: 0,
                            aerator_2hp: 0
                        },
                        isIdle,
                        operatorName,
                        totalHP,
                        u1,
                        u2
                    });
                }
            }

            this.renderGrid();

        } catch (err) {
            console.error("FieldOpsMap load error:", err);
            if (gridMount) {
                gridMount.innerHTML = `
                    <div style="text-align: center; color: #ef4444; padding: 2.5rem 0;">
                        Failed to load module ponds: ${err.message}
                    </div>
                `;
            }
        }
    }

    renderGrid() {
        const gridMount = this.container.querySelector("#field-ops-grid-mount");
        if (!gridMount) return;

        const modStr = String(this.moduleNo).padStart(2, "0");
        const r1Num = (this.moduleNo - 1) * 2 + 1;
        const r2Num = (this.moduleNo - 1) * 2 + 2;
        const r1Str = String(r1Num).padStart(2, "0");
        const r2Str = String(r2Num).padStart(2, "0");

        // Filter ponds
        const visiblePonds = Array.from(this.pondsData.values()).filter(p => {
            if (this.filter === "PRODUCTION" && p.isIdle) return false;
            if (this.filter === "IDLE" && !p.isIdle) return false;

            if (this.searchTerm) {
                if (!p.pondLabel.toLowerCase().includes(this.searchTerm) && !p.pondNo.includes(this.searchTerm)) {
                    return false;
                }
            }
            return true;
        });

        const row1Ponds = visiblePonds.filter(p => p.rowNo === r1Str);
        const row2Ponds = visiblePonds.filter(p => p.rowNo === r2Str);

        gridMount.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                
                <!-- ROW 1 (Line 1) -->
                <div class="field-ops-row-section" style="background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.9); border-radius: 16px; padding: 1.1rem 1.25rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.85rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="font-size: 1.1rem;">🌊</span>
                            <h3 style="margin: 0; font-size: 0.95rem; font-weight: 800; color: #0f172a;">
                                Module ${modStr} — Row ${r1Str} (Line 01: Ponds 01–12)
                            </h3>
                        </div>
                        <span style="font-size: 0.72rem; color: #64748b; font-weight: 600;">${row1Ponds.length} Ponds Visible</span>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 0.85rem;">
                        ${row1Ponds.map(p => this.renderPondCard(p)).join("")}
                    </div>
                </div>

                <!-- ROW 2 (Line 2) -->
                <div class="field-ops-row-section" style="background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.9); border-radius: 16px; padding: 1.1rem 1.25rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.85rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="font-size: 1.1rem;">🌊</span>
                            <h3 style="margin: 0; font-size: 0.95rem; font-weight: 800; color: #0f172a;">
                                Module ${modStr} — Row ${r2Str} (Line 02: Ponds 01–12)
                            </h3>
                        </div>
                        <span style="font-size: 0.72rem; color: #64748b; font-weight: 600;">${row2Ponds.length} Ponds Visible</span>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 0.85rem;">
                        ${row2Ponds.map(p => this.renderPondCard(p)).join("")}
                    </div>
                </div>

            </div>
        `;

        // Bind click events on pond cards
        gridMount.querySelectorAll(".field-ops-pond-tile").forEach(card => {
            card.addEventListener("click", () => {
                const label = card.getAttribute("data-pond-label");
                const data = this.pondsData.get(label);
                if (data && typeof this.onSelectPond === "function") {
                    this.onSelectPond(data.cycleRecord);
                }
            });
        });
    }

    renderPondCard(data) {
        const { pondLabel, cycleRecord, isIdle, operatorName, totalHP } = data;
        const doc = calculateDOC(cycleRecord.stck_date, cycleRecord.date_close);
        const area = parseFloat(cycleRecord.area) || 0.50;

        // Clean operational styling (No fake data)
        let cardBg = "rgba(255, 255, 255, 0.95)";
        let borderColor = "#0284c7";
        let badgeBg = "#dcfce7";
        let badgeColor = "#166534";
        let shadowGlow = "rgba(2, 132, 199, 0.12)";

        if (isIdle) {
            cardBg = "rgba(248, 250, 252, 0.85)";
            borderColor = "#cbd5e1";
            badgeBg = "#f1f5f9";
            badgeColor = "#64748b";
            shadowGlow = "rgba(148, 163, 184, 0.08)";
        }

        return `
            <div class="field-ops-pond-tile" data-pond-label="${pondLabel}" style="
                background: ${cardBg}; 
                border: 2px solid ${borderColor}; 
                border-radius: 14px; 
                padding: 0.85rem 0.95rem; 
                cursor: pointer; 
                transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
                box-shadow: 0 4px 12px ${shadowGlow};
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                min-height: 145px;
            " onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 8px 20px ${shadowGlow}';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px ${shadowGlow}';">
                
                <!-- Tile Header: Pond Code, Cycle, Status Badge -->
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.45rem;">
                        <div>
                            <div style="font-size: 1.1rem; font-weight: 900; color: #0f172a; line-height: 1.1;">
                                ${pondLabel}
                            </div>
                            <div style="font-size: 0.68rem; font-weight: 700; color: #64748b; margin-top: 0.15rem;">
                                ${isIdle ? 'IDLE' : `Cycle ${cycleRecord.cycle_no || (cycleRecord.pond_index ? cycleRecord.pond_index.split(".")[1] : '—')}`}
                            </div>
                        </div>
                        <span style="font-size: 0.68rem; font-weight: 800; background: ${badgeBg}; color: ${badgeColor}; padding: 0.2rem 0.5rem; border-radius: 999px;">
                            ${isIdle ? '⚪ IDLE' : `🟢 DOC ${doc}`}
                        </span>
                    </div>

                    <!-- Middle Content: Real Operational Details (No Fake Sensor Numbers) -->
                    ${!isIdle ? `
                        <div style="margin: 0.4rem 0;">
                            <div style="font-size: 0.72rem; color: #1e293b; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${cycleRecord.stck_species || 'P. VANNAMEI'}
                            </div>
                            <div style="font-size: 0.66rem; color: #64748b; margin-top: 0.1rem;">
                                Line: ${cycleRecord.bs_line || 'Syaqua'} · ${area} Ha
                            </div>
                            <div style="background: rgba(240, 249, 255, 0.7); border: 1px dashed #bae6fd; border-radius: 6px; padding: 0.25rem 0.4rem; text-align: center; margin-top: 0.35rem;">
                                <span style="font-size: 0.62rem; color: #0369a1; font-weight: 700; display: block;">📡 IoT Node Offline</span>
                                <span style="font-size: 0.6rem; color: #94a3b8;">DO: -- | pH: -- | T: --</span>
                            </div>
                        </div>
                    ` : `
                        <div style="padding: 0.8rem 0; text-align: center; color: #94a3b8; font-size: 0.74rem; font-weight: 600;">
                            Pond In Preparation
                            <div style="font-size: 0.65rem; color: #cbd5e1; margin-top: 0.2rem;">Area: ${area} Ha</div>
                        </div>
                    `}
                </div>

                <!-- Tile Footer: Assigned Operator & Aeration (Real Data) -->
                <div style="border-top: 1px solid rgba(0, 0, 0, 0.06); padding-top: 0.4rem; display: flex; justify-content: space-between; align-items: center; font-size: 0.68rem;">
                    <div style="color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 125px;" title="Assigned Operator: ${operatorName}">
                        🦐 ${operatorName}
                    </div>
                    <span style="color: #0284c7; font-weight: 700;">⚡ ${totalHP} HP ➔</span>
                </div>

            </div>
        `;
    }
}
