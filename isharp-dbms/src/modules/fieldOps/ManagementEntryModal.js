/**
 * iSHARP DBMS 2.0 — Field Operations: Management Entry Modal
 * Single Source of Truth for Staff Allocation, Aerator Units, Feeding Hardware,
 * Pond Hut Maintenance, and Field Notes.
 * Directly synchronized with Supabase (growout_pond_master, pond_staff, pond_aerator_inventory, pond_inventories).
 */

import { StaffRepository } from "../../infrastructure/repositories/staffRepository.js";
import { InventoryRepository } from "../../infrastructure/repositories/inventoryRepository.js";
import { calculateTotalActiveHP, calculateAerationDensity } from "../../domain/aeration.js";
import { Toast } from "../../components/Toast.js";

export class ManagementEntryModal {
    /**
     * @param {Function} onSaved Callback invoked when updates are successfully saved
     */
    constructor(onSaved = null) {
        this.onSaved = onSaved;
        this.currentPond = null;
        this.modalEl = null;
        this.isSaving = false;

        this.createModalDOM();
    }

    createModalDOM() {
        this.modalEl = document.createElement("div");
        this.modalEl.id = "management-entry-modal";
        this.modalEl.className = "modal-overlay";
        this.modalEl.style.display = "none";

        this.modalEl.innerHTML = `
            <div class="modal-dialog modal-glass" style="max-width: 680px; width: 92%; max-height: 90vh; overflow-y: auto;">
                
                <!-- Modal Header -->
                <div class="modal-header flex-between" style="border-bottom: 1px solid rgba(226, 232, 240, 0.8); padding-bottom: 0.85rem; margin-bottom: 1rem;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="font-size: 1.3rem;">📝</span>
                            <h3 id="mgmt-modal-title" style="margin: 0; font-size: 1.15rem; color: #0f172a; font-weight: 800;">Management Entry</h3>
                        </div>
                        <span id="mgmt-modal-subtitle" style="font-size: 0.76rem; color: #64748b;">Update crew, aerators, feeders, and hut condition for this pond</span>
                    </div>
                    <button type="button" id="btn-close-mgmt-modal" class="btn-close" aria-label="Close" style="background: none; border: none; font-size: 1.4rem; color: #64748b; cursor: pointer;">&times;</button>
                </div>

                <!-- Modal Body -->
                <form id="form-management-entry" style="display: flex; flex-direction: column; gap: 1.1rem;">
                    
                    <!-- SECTION 1: ASSIGNED POND PERSONNEL (SINGLE SOURCE OF TRUTH) -->
                    <div class="mgmt-section-box" style="background: rgba(248, 250, 252, 0.9); border: 1px solid #e2e8f0; border-radius: 12px; padding: 0.9rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;">
                            <h4 style="font-size: 0.84rem; font-weight: 800; color: #0284c7; margin: 0; display: flex; align-items: center; gap: 0.35rem;">
                                <span>👥 Assigned Pond Personnel</span>
                                <span style="font-size: 0.68rem; font-weight: 600; color: #166534; background: #dcfce7; padding: 0.1rem 0.4rem; border-radius: 4px;">Incentive Tracked</span>
                            </h4>
                            <span style="font-size: 0.7rem; color: #64748b;">Single Source of Truth with DBMS</span>
                        </div>

                        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                            <!-- PM -->
                            <div style="display: grid; grid-template-columns: 110px 95px 1fr; gap: 0.45rem; align-items: center;">
                                <label style="font-size: 0.75rem; font-weight: 700; color: #334155; margin: 0;">👔 Manager</label>
                                <input type="text" id="mgmt-staff-pm-id" list="staff-directory-datalist" class="form-control" placeholder="ID (0042)" style="font-size: 0.8rem; font-weight: 700; text-align: center;">
                                <input type="text" id="mgmt-staff-pm-name" class="form-control" placeholder="Manager Name" readonly style="background: rgba(255, 255, 255, 0.85); font-size: 0.78rem;">
                            </div>
                            <!-- SV -->
                            <div style="display: grid; grid-template-columns: 110px 95px 1fr; gap: 0.45rem; align-items: center;">
                                <label style="font-size: 0.75rem; font-weight: 700; color: #334155; margin: 0;">📋 Supervisor</label>
                                <input type="text" id="mgmt-staff-sv-id" list="staff-directory-datalist" class="form-control" placeholder="ID (1157)" style="font-size: 0.8rem; font-weight: 700; text-align: center;">
                                <input type="text" id="mgmt-staff-sv-name" class="form-control" placeholder="Supervisor Name" readonly style="background: rgba(255, 255, 255, 0.85); font-size: 0.78rem;">
                            </div>
                            <!-- RL -->
                            <div style="display: grid; grid-template-columns: 110px 95px 1fr; gap: 0.45rem; align-items: center;">
                                <label style="font-size: 0.75rem; font-weight: 700; color: #334155; margin: 0;">🚜 Row Leader</label>
                                <input type="text" id="mgmt-staff-rl-id" list="staff-directory-datalist" class="form-control" placeholder="ID (1120)" style="font-size: 0.8rem; font-weight: 700; text-align: center;">
                                <input type="text" id="mgmt-staff-rl-name" class="form-control" placeholder="Row Leader Name" readonly style="background: rgba(255, 255, 255, 0.85); font-size: 0.78rem;">
                            </div>
                            <!-- PO -->
                            <div style="display: grid; grid-template-columns: 110px 95px 1fr; gap: 0.45rem; align-items: center;">
                                <label style="font-size: 0.75rem; font-weight: 700; color: #334155; margin: 0;">🦐 Operator</label>
                                <input type="text" id="mgmt-staff-po-id" list="staff-directory-datalist" class="form-control" placeholder="ID (1216)" style="font-size: 0.8rem; font-weight: 700; text-align: center;">
                                <input type="text" id="mgmt-staff-po-name" class="form-control" placeholder="Operator Name" readonly style="background: rgba(255, 255, 255, 0.85); font-size: 0.78rem;">
                            </div>
                            <!-- Support -->
                            <div style="display: grid; grid-template-columns: 110px 95px 1fr; gap: 0.45rem; align-items: center;">
                                <label style="font-size: 0.75rem; font-weight: 700; color: #334155; margin: 0;">🛠️ Support</label>
                                <input type="text" id="mgmt-staff-support-id" list="staff-directory-datalist" class="form-control" placeholder="ID (2057)" style="font-size: 0.8rem; font-weight: 700; text-align: center;">
                                <input type="text" id="mgmt-staff-support-name" class="form-control" placeholder="Support Name" readonly style="background: rgba(255, 255, 255, 0.85); font-size: 0.78rem;">
                            </div>
                        </div>
                    </div>

                    <!-- SECTION 2: PADDLEWHEEL / AERATOR UNITS -->
                    <div class="mgmt-section-box" style="background: rgba(248, 250, 252, 0.9); border: 1px solid #e2e8f0; border-radius: 12px; padding: 0.9rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;">
                            <h4 style="font-size: 0.84rem; font-weight: 800; color: #0284c7; margin: 0; display: flex; align-items: center; gap: 0.35rem;">
                                <span>⚡ Paddlewheels &amp; Aeration (Active Units)</span>
                            </h4>
                            <div id="mgmt-aeration-calc-badge" style="font-size: 0.72rem; font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 0.2rem 0.55rem; border-radius: 6px;">
                                Total: 0.0 HP (0.0 HP/Ha)
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.65rem;">
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 0.72rem; font-weight: 700; color: #475569;">1.0 HP Units</label>
                                <input type="number" id="mgmt-aerator-1hp" class="form-control" min="0" max="20" placeholder="0" style="text-align: center; font-weight: 700;">
                            </div>
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 0.72rem; font-weight: 700; color: #475569;">2.0 HP Units</label>
                                <input type="number" id="mgmt-aerator-2hp" class="form-control" min="0" max="20" placeholder="0" style="text-align: center; font-weight: 700;">
                            </div>
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 0.72rem; font-weight: 700; color: #475569;">4.0 HP Units</label>
                                <input type="number" id="mgmt-aerator-4hp" class="form-control" min="0" max="20" placeholder="0" style="text-align: center; font-weight: 700;">
                            </div>
                        </div>
                    </div>

                    <!-- SECTION 3: FEEDING HARDWARE & POND HUT CONDITION -->
                    <div class="mgmt-section-box" style="background: rgba(248, 250, 252, 0.9); border: 1px solid #e2e8f0; border-radius: 12px; padding: 0.9rem;">
                        <h4 style="font-size: 0.84rem; font-weight: 800; color: #0284c7; margin: 0 0 0.6rem 0;">
                            🍽️ Feeding Equipment &amp; Infrastructure
                        </h4>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 0.65rem;">
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 0.72rem; font-weight: 700; color: #475569;">Feeding Trays (Qty)</label>
                                <input type="number" id="mgmt-tray-count" class="form-control" min="0" max="15" placeholder="4" style="text-align: center; font-weight: 700;">
                            </div>
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 0.72rem; font-weight: 700; color: #475569;">Autofeeders (Qty)</label>
                                <input type="number" id="mgmt-feeder-count" class="form-control" min="0" max="10" placeholder="2" style="text-align: center; font-weight: 700;">
                            </div>
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 0.72rem; font-weight: 700; color: #475569;">Pond Hut Condition</label>
                                <select id="mgmt-hut-condition" class="form-control" style="font-weight: 700; font-size: 0.8rem;">
                                    <option value="OK">🟢 OK (Good Condition)</option>
                                    <option value="Need Repair">🟡 Need Repair (Minor)</option>
                                    <option value="Urgent Repair">🔴 Urgent Repair (Critical)</option>
                                </select>
                            </div>
                        </div>

                        <!-- Supervisor Remarks / Notes -->
                        <div class="form-group" style="margin-top: 0.65rem; margin-bottom: 0;">
                            <label style="font-size: 0.72rem; font-weight: 700; color: #475569;">Supervisor Operational Notes / Remarks</label>
                            <textarea id="mgmt-notes" class="form-control" rows="2" placeholder="Record maintenance requests, feeding adjustments, or paddlewheel servicing..." style="font-size: 0.8rem;"></textarea>
                        </div>
                    </div>

                    <!-- Modal Actions -->
                    <div style="display: flex; justify-content: flex-end; gap: 0.65rem; margin-top: 0.4rem; padding-top: 0.75rem; border-top: 1px solid rgba(226, 232, 240, 0.8);">
                        <button type="button" id="btn-cancel-mgmt" class="btn-action btn-secondary" style="font-size: 0.82rem; padding: 0.5rem 1rem;">Cancel</button>
                        <button type="button" id="btn-submit-mgmt" class="btn-action btn-primary" style="font-size: 0.82rem; font-weight: 800; padding: 0.5rem 1.4rem; display: flex; align-items: center; gap: 0.4rem;">
                            <span>💾 Save Management Entry</span>
                        </button>
                    </div>

                </form>

            </div>
        `;

        document.body.appendChild(this.modalEl);
        this.bindEvents();
    }

    bindEvents() {
        // Close modal
        this.modalEl.querySelector("#btn-close-mgmt-modal").addEventListener("click", () => this.close());
        this.modalEl.querySelector("#btn-cancel-mgmt").addEventListener("click", () => this.close());
        this.modalEl.addEventListener("click", (e) => {
            if (e.target === this.modalEl) this.close();
        });

        // Interactive Staff Lookups
        const staffRoles = [
            { idEl: this.modalEl.querySelector("#mgmt-staff-pm-id"), nameEl: this.modalEl.querySelector("#mgmt-staff-pm-name") },
            { idEl: this.modalEl.querySelector("#mgmt-staff-sv-id"), nameEl: this.modalEl.querySelector("#mgmt-staff-sv-name") },
            { idEl: this.modalEl.querySelector("#mgmt-staff-rl-id"), nameEl: this.modalEl.querySelector("#mgmt-staff-rl-name") },
            { idEl: this.modalEl.querySelector("#mgmt-staff-po-id"), nameEl: this.modalEl.querySelector("#mgmt-staff-po-name") },
            { idEl: this.modalEl.querySelector("#mgmt-staff-support-id"), nameEl: this.modalEl.querySelector("#mgmt-staff-support-name") }
        ];

        staffRoles.forEach(({ idEl, nameEl }) => {
            if (!idEl || !nameEl) return;
            const lookup = () => {
                const val = idEl.value ? idEl.value.trim() : "";
                if (!val) {
                    nameEl.value = "";
                    return;
                }
                const staff = StaffRepository.findStaffByNo(val);
                if (staff) {
                    nameEl.value = `${staff.staff_name} (${staff.staff_position || 'Staff'})`;
                    nameEl.style.color = "#0f172a";
                } else {
                    nameEl.value = "⚠️ Unrecognized Staff ID";
                    nameEl.style.color = "#b91c1c";
                }
            };
            idEl.addEventListener("input", lookup);
            idEl.addEventListener("change", lookup);
            idEl.addEventListener("blur", lookup);
        });

        // Aerator real-time recalculation
        const u1 = this.modalEl.querySelector("#mgmt-aerator-1hp");
        const u2 = this.modalEl.querySelector("#mgmt-aerator-2hp");
        const u4 = this.modalEl.querySelector("#mgmt-aerator-4hp");

        const updateHP = () => {
            const totalHP = calculateTotalActiveHP(u1.value, u2.value, u4.value);
            const area = this.currentPond?.area || 0.5;
            const density = calculateAerationDensity(totalHP, area);
            const badge = this.modalEl.querySelector("#mgmt-aeration-calc-badge");
            if (badge) {
                badge.textContent = `Total: ${totalHP} HP (${density} HP/Ha)`;
            }
        };

        [u1, u2, u4].forEach(el => {
            el.addEventListener("input", updateHP);
            el.addEventListener("change", updateHP);
        });

        // Submit Save
        this.modalEl.querySelector("#btn-submit-mgmt").addEventListener("click", () => this.handleSave());
    }

    /**
     * Opens modal for a specific pond object.
     * @param {object} pond
     */
    async open(pond) {
        this.currentPond = pond;
        if (!pond) return;

        const pondTitle = pond.pond || pond.pond_index || "Pond";
        const cycleNo = pond.cycle_no || (pond.pond_index ? pond.pond_index.split(".")[1] : "—");
        
        this.modalEl.querySelector("#mgmt-modal-title").textContent = `Management Entry — Pond ${pondTitle}`;
        this.modalEl.querySelector("#mgmt-modal-subtitle").textContent = `Cycle ${cycleNo} · Area: ${pond.area || 0.5} Ha · Status: ${pond.pond_status || 'PRODUCTION'}`;

        this.modalEl.style.display = "flex";
        this.clearForm();

        // Ensure staff directory is loaded
        await StaffRepository.getStaffDirectory();

        // Load existing staff assignments
        await this.loadStaffAssignments(pond.pond_index);

        // Load existing aerators
        await this.loadAerators(pond);

        // Load existing inventory equipment
        await this.loadInventory(pond.pond_index);
    }

    close() {
        this.modalEl.style.display = "none";
    }

    clearForm() {
        ["pm", "sv", "rl", "po", "support"].forEach(r => {
            const idEl = this.modalEl.querySelector(`#mgmt-staff-${r}-id`);
            const nameEl = this.modalEl.querySelector(`#mgmt-staff-${r}-name`);
            if (idEl) idEl.value = "";
            if (nameEl) nameEl.value = "";
        });

        this.modalEl.querySelector("#mgmt-aerator-1hp").value = 0;
        this.modalEl.querySelector("#mgmt-aerator-2hp").value = 0;
        this.modalEl.querySelector("#mgmt-aerator-4hp").value = 0;
        this.modalEl.querySelector("#mgmt-tray-count").value = 4;
        this.modalEl.querySelector("#mgmt-feeder-count").value = 2;
        this.modalEl.querySelector("#mgmt-hut-condition").value = "OK";
        this.modalEl.querySelector("#mgmt-notes").value = "";
    }

    async loadStaffAssignments(pondIndex) {
        if (!pondIndex) return;
        try {
            const data = await StaffRepository.getCycleStaff(pondIndex);
            if (!data) return;

            const setRole = (roleKey, staffNo) => {
                const idEl = this.modalEl.querySelector(`#mgmt-staff-${roleKey}-id`);
                const nameEl = this.modalEl.querySelector(`#mgmt-staff-${roleKey}-name`);
                if (idEl && staffNo) {
                    idEl.value = staffNo;
                    const staff = StaffRepository.findStaffByNo(staffNo);
                    if (staff) {
                        nameEl.value = `${staff.staff_name} (${staff.staff_position || 'Staff'})`;
                        nameEl.style.color = "#0f172a";
                    } else {
                        nameEl.value = `ID #${staffNo}`;
                        nameEl.style.color = "#64748b";
                    }
                }
            };

            setRole("pm", data.pm_staff_no);
            setRole("sv", data.sv_staff_no);
            setRole("rl", data.rl_staff_no);
            setRole("po", data.po_staff_no);
            setRole("support", data.support_staff_no);
        } catch (err) {
            console.warn("Could not load modal staff:", err);
        }
    }

    async loadAerators(pond) {
        const u1 = parseInt(pond.aerator_1hp || 0, 10);
        const u2 = parseInt(pond.aerator_2hp || 0, 10);
        this.modalEl.querySelector("#mgmt-aerator-1hp").value = u1;
        this.modalEl.querySelector("#mgmt-aerator-2hp").value = u2;

        try {
            const aerators = await InventoryRepository.getAerators(pond.pond_index);
            const a4 = aerators.find(a => parseFloat(a.hp) === 4.0);
            if (a4) {
                this.modalEl.querySelector("#mgmt-aerator-4hp").value = a4.total_units || 0;
            }
        } catch {}

        const totalHP = calculateTotalActiveHP(u1, u2, this.modalEl.querySelector("#mgmt-aerator-4hp").value);
        const density = calculateAerationDensity(totalHP, pond.area || 0.5);
        const badge = this.modalEl.querySelector("#mgmt-aeration-calc-badge");
        if (badge) badge.textContent = `Total: ${totalHP} HP (${density} HP/Ha)`;
    }

    async loadInventory(pondIndex) {
        if (!pondIndex) return;
        try {
            const inv = await InventoryRepository.getPondInventory(pondIndex);
            if (inv) {
                if (inv.feeding_tray_count !== null && inv.feeding_tray_count !== undefined) {
                    this.modalEl.querySelector("#mgmt-tray-count").value = inv.feeding_tray_count;
                }
                if (inv.autofeeder_count !== null && inv.autofeeder_count !== undefined) {
                    this.modalEl.querySelector("#mgmt-feeder-count").value = inv.autofeeder_count;
                }
                if (inv.hut_condition) {
                    this.modalEl.querySelector("#mgmt-hut-condition").value = inv.hut_condition;
                }
                if (inv.notes) {
                    this.modalEl.querySelector("#mgmt-notes").value = inv.notes;
                }
            }
        } catch (err) {
            console.warn("Could not load inventory:", err);
        }
    }

    async handleSave() {
        if (!this.currentPond || !this.currentPond.pond_index) {
            Toast.error("No active pond cycle selected.");
            return;
        }

        if (this.isSaving) return;
        this.isSaving = true;

        const btnSubmit = this.modalEl.querySelector("#btn-submit-mgmt");
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<span>⏳ Saving All...</span>`;

        try {
            const pondIndex = this.currentPond.pond_index;
            const pondLabel = this.currentPond.pond || pondIndex;

            // 1. Save Staff Allocation (Single Source of Truth)
            const staffAssignments = {
                pm_staff_no: this.modalEl.querySelector("#mgmt-staff-pm-id").value,
                sv_staff_no: this.modalEl.querySelector("#mgmt-staff-sv-id").value,
                rl_staff_no: this.modalEl.querySelector("#mgmt-staff-rl-id").value,
                po_staff_no: this.modalEl.querySelector("#mgmt-staff-po-id").value,
                support_staff_no: this.modalEl.querySelector("#mgmt-staff-support-id").value
            };
            await StaffRepository.saveCycleStaff(pondIndex, staffAssignments);

            // 2. Save Aerator Inventory
            const u1 = parseInt(this.modalEl.querySelector("#mgmt-aerator-1hp").value || 0, 10);
            const u2 = parseInt(this.modalEl.querySelector("#mgmt-aerator-2hp").value || 0, 10);
            const u4 = parseInt(this.modalEl.querySelector("#mgmt-aerator-4hp").value || 0, 10);
            const aeratorList = [
                { hp: 1, total_units: u1 },
                { hp: 2, total_units: u2 },
                { hp: 4, total_units: u4 }
            ];
            await InventoryRepository.syncAeratorInventory(pondIndex, aeratorList);

            // 3. Save Equipment Inventory & Hut Condition
            const trayCount = parseInt(this.modalEl.querySelector("#mgmt-tray-count").value || 0, 10);
            const feederCount = parseInt(this.modalEl.querySelector("#mgmt-feeder-count").value || 0, 10);
            const hutCondition = this.modalEl.querySelector("#mgmt-hut-condition").value;
            const notesText = this.modalEl.querySelector("#mgmt-notes").value;

            await InventoryRepository.savePondInventory(pondIndex, pondLabel, {
                feeding_tray_count: trayCount,
                autofeeder_count: feederCount,
                hut_condition: hutCondition,
                notes: notesText
            });

            // Update in-memory pond properties
            this.currentPond.aerator_1hp = u1;
            this.currentPond.aerator_2hp = u2;

            Toast.success(`Management Entry saved successfully for Pond ${pondLabel}!`);
            this.close();

            if (typeof this.onSaved === "function") {
                this.onSaved({
                    pondIndex,
                    staffAssignments,
                    aerators: { u1, u2, u4 },
                    inventory: { trayCount, feederCount, hutCondition, notesText }
                });
            }

        } catch (err) {
            console.error("Management Entry Save Error:", err);
            Toast.error(`Failed to save: ${err.message}`);
        } finally {
            this.isSaving = false;
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = `<span>💾 Save Management Entry</span>`;
        }
    }
}
