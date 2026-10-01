/**
 * iSHARP DBMS 2.0 — Field Operations: Dedicated Management Entry Page
 * Standalone full-screen operational view for Supervisors to manage:
 * - Assigned Pond Personnel (Manager, Supervisor, Row Leader, Primary Operator, Support Operator)
 * - Active Paddlewheels (1.0 HP & 2.0 HP units only)
 * - Feeding Trays, Autofeeders, Pond Hut Condition, and Field Remarks
 * 
 * Single Source of Truth:
 * - Personnel & Aerators -> growout_pond_master
 * - Staff Directory -> pond_staff
 * - Hardware & Hut Condition -> pond_inventories
 */

import { StaffRepository } from "../../infrastructure/repositories/staffRepository.js";
import { InventoryRepository } from "../../infrastructure/repositories/inventoryRepository.js";
import { calculateTotalActiveHP, calculateAerationDensity } from "../../domain/aeration.js";
import { calculateDOC } from "../../domain/biometrics.js";
import { Toast } from "../../components/Toast.js";

export class ManagementEntryPage {
    /**
     * @param {string} containerId Element ID where page is mounted
     * @param {object} callbacks Navigation callbacks { onBackToPond, onBackToMap, onSaved }
     */
    constructor(containerId = "field-ops-management-mount", callbacks = {}) {
        this.container = document.getElementById(containerId);
        this.callbacks = callbacks;
        this.currentPond = null;
        this.isSaving = false;
    }

    /**
     * Renders the Management Entry Page for the specified pond
     * @param {object} pond Cycle & Pond record
     */
    async render(pond) {
        this.currentPond = pond;
        if (!this.container) return;

        const pondLabel = pond.pond || pond.pond_index || "Pond";
        const doc = calculateDOC(pond.stck_date, pond.date_close);
        const areaHa = parseFloat(pond.area) || 0.50;
        const u1 = parseInt(pond.aerator_1hp || 0, 10);
        const u2 = parseInt(pond.aerator_2hp || 0, 10);
        const initialTotalHP = calculateTotalActiveHP(u1, u2);
        const initialDensity = calculateAerationDensity(initialTotalHP, areaHa);

        // Preload staff directory for quick ID resolution
        const staffList = await StaffRepository.getStaffDirectory();

        this.container.innerHTML = `
            <div class="management-page-wrapper mgmt-entry-wrapper" style="padding: 1.25rem 2rem; max-width: 1080px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem;">
                
                <!-- Breadcrumbs & Navigation Bar -->
                <div class="mgmt-nav-bar flex-between" style="background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 1); border-radius: 16px; padding: 0.85rem 1.4rem; box-shadow: 0 4px 20px rgba(2, 132, 199, 0.08); flex-wrap: wrap; gap: 0.75rem;">
                    <div class="mgmt-nav-actions" style="display: flex; align-items: center; gap: 0.75rem;">
                        <button type="button" id="btn-mgmt-back-pond" class="btn-action btn-secondary" style="font-size: 0.8rem; font-weight: 700; padding: 0.4rem 0.85rem;">
                            <span class="btn-text-full">← Back to Pond View</span>
                            <span class="btn-text-short">← Pond View</span>
                        </button>
                        <button type="button" id="btn-mgmt-back-map" class="btn-action btn-secondary" style="font-size: 0.8rem; font-weight: 700; padding: 0.4rem 0.85rem;">
                            <span class="btn-text-full">🗺️ Back to 24-Pond Map</span>
                            <span class="btn-text-short">🗺️ Back to Map</span>
                        </button>
                    </div>

                    <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
                        <span style="font-size: 0.76rem; font-weight: 800; background: #e0f2fe; color: #0284c7; padding: 0.25rem 0.65rem; border-radius: 999px;">
                            Pond ${pondLabel}
                        </span>
                        <span style="font-size: 0.76rem; font-weight: 800; background: #dcfce7; color: #166534; padding: 0.25rem 0.65rem; border-radius: 999px;">
                            Cycle ${pond.cycle_no || (pond.pond_index ? pond.pond_index.split(".")[1] : '—')}
                        </span>
                        <span style="font-size: 0.76rem; font-weight: 800; background: #f1f5f9; color: #475569; padding: 0.25rem 0.65rem; border-radius: 999px;">
                            DOC ${doc || '—'}
                        </span>
                    </div>
                </div>

                <!-- Page Header Title -->
                <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.85rem; flex-wrap: wrap; gap: 0.5rem;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="font-size: 1.5rem;">📝</span>
                            <h1 style="margin: 0; font-size: 1.5rem; font-weight: 900; color: #0f172a;">
                                Management &amp; Personnel Entry
                            </h1>
                        </div>
                        <p style="margin: 0.35rem 0 0 0; font-size: 0.84rem; color: #64748b;">
                            Update assigned personnel, active paddlewheels (1HP &amp; 2HP), feeding hardware, and pond condition for <strong>Pond ${pondLabel}</strong>.
                        </p>
                    </div>
                    <div>
                        <span style="font-size: 0.74rem; font-weight: 700; color: #0369a1; background: #f0f9ff; border: 1px solid #bae6fd; padding: 0.3rem 0.75rem; border-radius: 8px;">
                            Single Source of Truth: DBMS &amp; Supabase
                        </span>
                    </div>
                </div>

                <!-- Autocomplete Datalist for Staff ID Lookup -->
                <datalist id="mgmt-staff-datalist">
                    ${staffList.map(s => `<option value="${s.staff_no}">${s.staff_name} (${s.staff_position || 'Staff'})</option>`).join("")}
                </datalist>

                <!-- SECTION 1: ASSIGNED POND PERSONNEL -->
                <section class="glass-card" style="background: rgba(255, 255, 255, 0.9); border: 1px solid #e2e8f0; border-radius: 16px; padding: 1.4rem; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.6rem;">
                        <div>
                            <h2 style="margin: 0; font-size: 1.05rem; font-weight: 800; color: #0284c7; display: flex; align-items: center; gap: 0.45rem;">
                                <span>👥 Assigned Pond Personnel</span>
                                <span style="font-size: 0.7rem; font-weight: 700; background: #dcfce7; color: #15803d; padding: 0.15rem 0.5rem; border-radius: 6px;">Incentive Tracked</span>
                            </h2>
                            <span style="font-size: 0.75rem; color: #64748b;">Enter 4-digit Staff ID (e.g. 0042, 1157). Name resolves automatically from pond_staff master directory.</span>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr; gap: 0.85rem;">
                        
                        <!-- Manager (PM) -->
                        <div class="mgmt-staff-row" style="display: grid; grid-template-columns: 140px 130px 1fr; gap: 0.85rem; align-items: center; background: #f8fafc; padding: 0.65rem 0.9rem; border-radius: 10px; border: 1px solid #e2e8f0;">
                            <label style="font-size: 0.82rem; font-weight: 700; color: #334155; margin: 0;">👔 Farm Manager</label>
                            <input type="text" id="mgmt-pm-id" list="mgmt-staff-datalist" class="form-control" placeholder="ID" title="Enter 4-digit staff ID (e.g. 0042)" maxlength="6" value="${pond.pm_staff_no || ''}" style="font-size: 0.85rem; font-weight: 700; text-align: center; background: #ffffff;">
                            <input type="text" id="mgmt-pm-name" class="form-control" placeholder="Manager Name (Auto-resolved)" readonly style="background: rgba(241, 245, 249, 0.8); font-size: 0.84rem; color: #0f172a; font-weight: 600;">
                        </div>

                        <!-- Supervisor (SV) -->
                        <div class="mgmt-staff-row" style="display: grid; grid-template-columns: 140px 130px 1fr; gap: 0.85rem; align-items: center; background: #f8fafc; padding: 0.65rem 0.9rem; border-radius: 10px; border: 1px solid #e2e8f0;">
                            <label style="font-size: 0.82rem; font-weight: 700; color: #334155; margin: 0;">📋 Supervisor</label>
                            <input type="text" id="mgmt-sv-id" list="mgmt-staff-datalist" class="form-control" placeholder="ID" title="Enter 4-digit staff ID (e.g. 1157)" maxlength="6" value="${pond.sv_staff_no || ''}" style="font-size: 0.85rem; font-weight: 700; text-align: center; background: #ffffff;">
                            <input type="text" id="mgmt-sv-name" class="form-control" placeholder="Supervisor Name (Auto-resolved)" readonly style="background: rgba(241, 245, 249, 0.8); font-size: 0.84rem; color: #0f172a; font-weight: 600;">
                        </div>

                        <!-- Row Leader (RL) -->
                        <div class="mgmt-staff-row" style="display: grid; grid-template-columns: 140px 130px 1fr; gap: 0.85rem; align-items: center; background: #f8fafc; padding: 0.65rem 0.9rem; border-radius: 10px; border: 1px solid #e2e8f0;">
                            <label style="font-size: 0.82rem; font-weight: 700; color: #334155; margin: 0;">🚜 Row Leader</label>
                            <input type="text" id="mgmt-rl-id" list="mgmt-staff-datalist" class="form-control" placeholder="ID" title="Enter 4-digit staff ID (e.g. 1120)" maxlength="6" value="${pond.rl_staff_no || ''}" style="font-size: 0.85rem; font-weight: 700; text-align: center; background: #ffffff;">
                            <input type="text" id="mgmt-rl-name" class="form-control" placeholder="Row Leader Name (Auto-resolved)" readonly style="background: rgba(241, 245, 249, 0.8); font-size: 0.84rem; color: #0f172a; font-weight: 600;">
                        </div>

                        <!-- Pond Operator (PO) -->
                        <div class="mgmt-staff-row" style="display: grid; grid-template-columns: 140px 130px 1fr; gap: 0.85rem; align-items: center; background: #f8fafc; padding: 0.65rem 0.9rem; border-radius: 10px; border: 1px solid #e2e8f0;">
                            <label style="font-size: 0.82rem; font-weight: 700; color: #334155; margin: 0;">🦐 Pond Operator</label>
                            <input type="text" id="mgmt-po-id" list="mgmt-staff-datalist" class="form-control" placeholder="ID" title="Enter 4-digit staff ID (e.g. 1216)" maxlength="6" value="${pond.po_staff_no || ''}" style="font-size: 0.85rem; font-weight: 700; text-align: center; background: #ffffff;">
                            <input type="text" id="mgmt-po-name" class="form-control" placeholder="Operator Name (Auto-resolved)" readonly style="background: rgba(241, 245, 249, 0.8); font-size: 0.84rem; color: #0f172a; font-weight: 600;">
                        </div>

                        <!-- Support Operator -->
                        <div class="mgmt-staff-row" style="display: grid; grid-template-columns: 140px 130px 1fr; gap: 0.85rem; align-items: center; background: #f8fafc; padding: 0.65rem 0.9rem; border-radius: 10px; border: 1px solid #e2e8f0;">
                            <label style="font-size: 0.82rem; font-weight: 700; color: #334155; margin: 0;">🛠️ Support Operator</label>
                            <input type="text" id="mgmt-support-id" list="mgmt-staff-datalist" class="form-control" placeholder="ID" title="Enter 4-digit staff ID (e.g. 2057)" maxlength="6" value="${pond.support_staff_no || ''}" style="font-size: 0.85rem; font-weight: 700; text-align: center; background: #ffffff;">
                            <input type="text" id="mgmt-support-name" class="form-control" placeholder="Support Name (Auto-resolved)" readonly style="background: rgba(241, 245, 249, 0.8); font-size: 0.84rem; color: #0f172a; font-weight: 600;">
                        </div>

                    </div>
                </section>

                <!-- SECTION 2: ACTIVE PADDLEWHEELS (1.0 HP & 2.0 HP ONLY) -->
                <section class="glass-card" style="background: rgba(255, 255, 255, 0.9); border: 1px solid #e2e8f0; border-radius: 16px; padding: 1.4rem; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.6rem; flex-wrap: wrap; gap: 0.5rem;">
                        <div>
                            <h2 style="margin: 0; font-size: 1.05rem; font-weight: 800; color: #0284c7; display: flex; align-items: center; gap: 0.45rem;">
                                <span>⚡ Active Paddlewheels</span>
                            </h2>
                            <span style="font-size: 0.75rem; color: #64748b;">Farm standard: 1.0 HP and 2.0 HP paddlewheels only. Updates growout_pond_master.</span>
                        </div>
                        <div id="mgmt-aeration-badge" style="font-size: 0.82rem; font-weight: 800; color: #0284c7; background: #e0f2fe; border: 1px solid #bae6fd; padding: 0.35rem 0.85rem; border-radius: 8px;">
                            Total: ${initialTotalHP} HP (${initialDensity} HP/Ha)
                        </div>
                    </div>

                    <div class="mgmt-paddlewheels-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                        <div class="form-group" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; text-align: center;">
                            <label style="font-size: 0.84rem; font-weight: 800; color: #1e293b; display: block; margin-bottom: 0.5rem;">
                                1.0 HP Paddlewheels
                            </label>
                            <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                                <button type="button" class="stepper-btn btn-stepper-sub" data-target="mgmt-input-1hp" aria-label="Decrease 1.0 HP aerator">−</button>
                                <input type="number" id="mgmt-input-1hp" class="form-control" min="0" max="25" value="${u1}" style="font-size: 1.25rem; font-weight: 900; text-align: center; width: 75px; margin: 0; color: #0369a1; background: #ffffff;">
                                <button type="button" class="stepper-btn btn-stepper-add" data-target="mgmt-input-1hp" aria-label="Increase 1.0 HP aerator">+</button>
                            </div>
                        </div>

                        <div class="form-group" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; text-align: center;">
                            <label style="font-size: 0.84rem; font-weight: 800; color: #1e293b; display: block; margin-bottom: 0.5rem;">
                                2.0 HP Paddlewheels
                            </label>
                            <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                                <button type="button" class="stepper-btn btn-stepper-sub" data-target="mgmt-input-2hp" aria-label="Decrease 2.0 HP aerator">−</button>
                                <input type="number" id="mgmt-input-2hp" class="form-control" min="0" max="25" value="${u2}" style="font-size: 1.25rem; font-weight: 900; text-align: center; width: 75px; margin: 0; color: #0369a1; background: #ffffff;">
                                <button type="button" class="stepper-btn btn-stepper-add" data-target="mgmt-input-2hp" aria-label="Increase 2.0 HP aerator">+</button>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- SECTION 3: FEEDING HARDWARE & POND CONDITION -->
                <section class="glass-card" style="background: rgba(255, 255, 255, 0.9); border: 1px solid #e2e8f0; border-radius: 16px; padding: 1.4rem; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.6rem;">
                        <div>
                            <h2 style="margin: 0; font-size: 1.05rem; font-weight: 800; color: #0284c7; display: flex; align-items: center; gap: 0.45rem;">
                                <span>🛠️ Feeding Hardware &amp; Pond Infrastructure</span>
                            </h2>
                            <span style="font-size: 0.75rem; color: #64748b;">Track feed delivery apparatus and field hut readiness. Stored in pond_inventories.</span>
                        </div>
                    </div>

                    <div class="mgmt-hardware-grid" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem;">
                        <div class="form-group" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0.75rem; text-align: center;">
                            <label style="font-size: 0.78rem; font-weight: 700; color: #334155; margin-bottom: 0.45rem; display: block;">
                                🍽️ Feeding Trays
                            </label>
                            <div style="display: flex; align-items: center; justify-content: center; gap: 0.4rem;">
                                <button type="button" class="stepper-btn btn-stepper-sub" data-target="mgmt-input-tray" style="min-width: 38px; height: 38px; font-size: 1.1rem;">−</button>
                                <input type="number" id="mgmt-input-tray" class="form-control" min="0" max="20" placeholder="0" style="font-size: 1.05rem; font-weight: 800; text-align: center; width: 60px; margin: 0;">
                                <button type="button" class="stepper-btn btn-stepper-add" data-target="mgmt-input-tray" style="min-width: 38px; height: 38px; font-size: 1.1rem;">+</button>
                            </div>
                        </div>

                        <div class="form-group" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0.75rem; text-align: center;">
                            <label style="font-size: 0.78rem; font-weight: 700; color: #334155; margin-bottom: 0.45rem; display: block;">
                                🤖 Autofeeders Installed
                            </label>
                            <div style="display: flex; align-items: center; justify-content: center; gap: 0.4rem;">
                                <button type="button" class="stepper-btn btn-stepper-sub" data-target="mgmt-input-feeder" style="min-width: 38px; height: 38px; font-size: 1.1rem;">−</button>
                                <input type="number" id="mgmt-input-feeder" class="form-control" min="0" max="10" placeholder="0" style="font-size: 1.05rem; font-weight: 800; text-align: center; width: 60px; margin: 0;">
                                <button type="button" class="stepper-btn btn-stepper-add" data-target="mgmt-input-feeder" style="min-width: 38px; height: 38px; font-size: 1.1rem;">+</button>
                            </div>
                        </div>

                        <div class="form-group" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0.75rem;">
                            <label style="font-size: 0.78rem; font-weight: 700; color: #334155; margin-bottom: 0.45rem; display: block; text-align: center;">
                                🛖 Pond Hut Condition
                            </label>
                            <select id="mgmt-select-hut" class="form-control" style="font-size: 0.85rem; font-weight: 700; width: 100%;">
                                <option value="OK">🟢 OK (Good Condition)</option>
                                <option value="Need Repair">🟡 Need Repair (Minor Issues)</option>
                                <option value="Urgent Repair">🔴 Urgent Repair (Damaged)</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label style="font-size: 0.78rem; font-weight: 700; color: #334155; margin-bottom: 0.35rem; display: block;">
                            📝 Field Supervisor Notes / Operational Remarks
                        </label>
                        <textarea id="mgmt-textarea-notes" class="form-control" rows="3" placeholder="Enter notes regarding shrimp behavior, aeration adjustments, feeding response, or pond maintenance..." style="font-size: 0.84rem; resize: vertical;"></textarea>
                    </div>
                </section>

                <!-- BOTTOM ACTION BAR -->
                <div class="mgmt-action-bar mgmt-sticky-bottom-bar" style="display: flex; justify-content: flex-end; align-items: center; gap: 1rem; padding: 1rem 0; border-top: 1px solid #e2e8f0;">
                    <button type="button" id="btn-mgmt-cancel" class="btn-action btn-secondary" style="font-size: 0.85rem; font-weight: 700; padding: 0.55rem 1.4rem;">
                        <span>Cancel</span>
                    </button>
                    <button type="button" id="btn-mgmt-save" class="btn-action btn-primary" style="font-size: 0.9rem; font-weight: 800; padding: 0.6rem 1.8rem; display: flex; align-items: center; gap: 0.45rem;">
                        <span>💾 Save Management Entry</span>
                    </button>
                </div>

            </div>
        `;

        this.bindEvents(pond);
        await this.loadInitialData(pond);
    }

    bindEvents(pond) {
        // Navigation buttons
        const btnBackPond = this.container.querySelector("#btn-mgmt-back-pond");
        if (btnBackPond && typeof this.callbacks.onBackToPond === "function") {
            btnBackPond.addEventListener("click", () => this.callbacks.onBackToPond(pond));
        }

        const btnBackMap = this.container.querySelector("#btn-mgmt-back-map");
        if (btnBackMap && typeof this.callbacks.onBackToMap === "function") {
            btnBackMap.addEventListener("click", () => this.callbacks.onBackToMap());
        }

        const btnCancel = this.container.querySelector("#btn-mgmt-cancel");
        if (btnCancel && typeof this.callbacks.onBackToPond === "function") {
            btnCancel.addEventListener("click", () => this.callbacks.onBackToPond(pond));
        }

        // Live staff name resolution on typing ID
        const staffRoles = ["pm", "sv", "rl", "po", "support"];
        staffRoles.forEach(role => {
            const idInput = this.container.querySelector(`#mgmt-${role}-id`);
            const nameInput = this.container.querySelector(`#mgmt-${role}-name`);
            if (idInput && nameInput) {
                idInput.addEventListener("input", (e) => {
                    const enteredId = e.target.value.trim();
                    if (!enteredId) {
                        nameInput.value = "";
                        return;
                    }
                    const found = StaffRepository.findStaffByNo(enteredId);
                    if (found) {
                        nameInput.value = `${found.staff_name} (${found.staff_position || 'Staff'})`;
                        nameInput.style.color = "#047857";
                    } else {
                        nameInput.value = "Unknown Staff ID";
                        nameInput.style.color = "#b91c1c";
                    }
                });
            }
        });

        // Live HP Calculation on changing 1HP / 2HP units
        const input1hp = this.container.querySelector("#mgmt-input-1hp");
        const input2hp = this.container.querySelector("#mgmt-input-2hp");
        const badge = this.container.querySelector("#mgmt-aeration-badge");
        const areaHa = parseFloat(pond.area) || 0.50;

        const updateAerationBadge = () => {
            const u1 = parseInt(input1hp.value || 0, 10);
            const u2 = parseInt(input2hp.value || 0, 10);
            const totalHP = calculateTotalActiveHP(u1, u2);
            const density = calculateAerationDensity(totalHP, areaHa);
            if (badge) {
                badge.textContent = `Total: ${totalHP} HP (${density} HP/Ha)`;
            }
        };

        if (input1hp) input1hp.addEventListener("input", updateAerationBadge);
        if (input2hp) input2hp.addEventListener("input", updateAerationBadge);

        // Quick stepper buttons (+ / −) for touchscreens
        this.container.querySelectorAll(".stepper-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const targetId = btn.dataset.target;
                const targetInput = this.container.querySelector(`#${targetId}`);
                if (!targetInput) return;
                const min = parseInt(targetInput.getAttribute("min") ?? "0", 10);
                const max = parseInt(targetInput.getAttribute("max") ?? "999", 10);
                let val = parseInt(targetInput.value || 0, 10);
                if (btn.classList.contains("btn-stepper-add")) {
                    if (val < max) val += 1;
                } else if (btn.classList.contains("btn-stepper-sub")) {
                    if (val > min) val -= 1;
                }
                targetInput.value = val;
                targetInput.dispatchEvent(new Event("input", { bubbles: true }));
            });
        });

        // Save Button
        const btnSave = this.container.querySelector("#btn-mgmt-save");
        if (btnSave) {
            btnSave.addEventListener("click", () => this.handleSave(pond));
        }
    }

    async loadInitialData(pond) {
        const pondIndex = pond.pond_index;
        if (!pondIndex) return;

        // 1. Resolve existing staff names for prefilled IDs
        const staffRoles = ["pm", "sv", "rl", "po", "support"];
        staffRoles.forEach(role => {
            const idVal = pond[`${role}_staff_no`];
            const nameInput = this.container.querySelector(`#mgmt-${role}-name`);
            if (idVal && nameInput) {
                const found = StaffRepository.findStaffByNo(idVal);
                if (found) {
                    nameInput.value = `${found.staff_name} (${found.staff_position || 'Staff'})`;
                    nameInput.style.color = "#047857";
                }
            }
        });

        // 2. Load inventory from pond_inventories table
        try {
            const inv = await InventoryRepository.getPondInventory(pondIndex);
            if (inv) {
                if (inv.feeding_tray_count !== null && inv.feeding_tray_count !== undefined) {
                    const trayInput = this.container.querySelector("#mgmt-input-tray");
                    if (trayInput) trayInput.value = inv.feeding_tray_count;
                }
                if (inv.autofeeder_count !== null && inv.autofeeder_count !== undefined) {
                    const feederInput = this.container.querySelector("#mgmt-input-feeder");
                    if (feederInput) feederInput.value = inv.autofeeder_count;
                }
                if (inv.hut_condition) {
                    const hutSelect = this.container.querySelector("#mgmt-select-hut");
                    if (hutSelect) hutSelect.value = inv.hut_condition;
                }
                if (inv.notes) {
                    const notesArea = this.container.querySelector("#mgmt-textarea-notes");
                    if (notesArea) notesArea.value = inv.notes;
                }
            }
        } catch (err) {
            console.warn("Could not load pond inventory:", err);
        }
    }

    async handleSave(pond) {
        if (!pond || !pond.pond_index) {
            Toast.error("No active pond cycle selected.");
            return;
        }

        if (this.isSaving) return;
        this.isSaving = true;

        const btnSave = this.container.querySelector("#btn-mgmt-save");
        btnSave.disabled = true;
        btnSave.innerHTML = `<span>⏳ Saving Management Data...</span>`;

        try {
            const pondIndex = pond.pond_index;
            const pondLabel = pond.pond || pondIndex;

            // 1. Staff Assignments (Saved to growout_pond_master)
            const staffAssignments = {
                pm_staff_no: this.container.querySelector("#mgmt-pm-id")?.value.trim() || null,
                sv_staff_no: this.container.querySelector("#mgmt-sv-id")?.value.trim() || null,
                rl_staff_no: this.container.querySelector("#mgmt-rl-id")?.value.trim() || null,
                po_staff_no: this.container.querySelector("#mgmt-po-id")?.value.trim() || null,
                support_staff_no: this.container.querySelector("#mgmt-support-id")?.value.trim() || null
            };
            await StaffRepository.saveCycleStaff(pondIndex, staffAssignments);

            // 2. Active Paddlewheels (1.0 HP & 2.0 HP only, saved to growout_pond_master & pond_aerator_inventory)
            const u1 = parseInt(this.container.querySelector("#mgmt-input-1hp")?.value || 0, 10);
            const u2 = parseInt(this.container.querySelector("#mgmt-input-2hp")?.value || 0, 10);
            const aeratorList = [
                { hp: 1, total_units: u1 },
                { hp: 2, total_units: u2 }
            ];
            await InventoryRepository.syncAeratorInventory(pondIndex, pondLabel, aeratorList);

            // 3. Hardware, Hut Condition & Remarks (Saved to pond_inventories)
            const trayCount = parseInt(this.container.querySelector("#mgmt-input-tray")?.value || 0, 10);
            const feederCount = parseInt(this.container.querySelector("#mgmt-input-feeder")?.value || 0, 10);
            const hutCondition = this.container.querySelector("#mgmt-select-hut")?.value || "OK";
            const notesText = this.container.querySelector("#mgmt-textarea-notes")?.value || "";

            await InventoryRepository.savePondInventory(pondIndex, pondLabel, {
                feeding_tray_count: trayCount,
                autofeeder_count: feederCount,
                hut_condition: hutCondition,
                notes: notesText
            });

            // Update in-memory pond properties
            Object.assign(pond, staffAssignments, {
                aerator_1hp: u1,
                aerator_2hp: u2
            });

            Toast.success(`Management Entry for Pond ${pondLabel} saved successfully!`);

            if (typeof this.callbacks.onSaved === "function") {
                this.callbacks.onSaved(pond);
            }

            // Return to Pond View after brief feedback
            setTimeout(() => {
                if (typeof this.callbacks.onBackToPond === "function") {
                    this.callbacks.onBackToPond(pond);
                }
            }, 600);

        } catch (err) {
            console.error("Management Entry Save Error:", err);
            Toast.error(`Failed to save: ${err.message}`);
        } finally {
            this.isSaving = false;
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.innerHTML = `<span>💾 Save Management Entry</span>`;
            }
        }
    }
}
