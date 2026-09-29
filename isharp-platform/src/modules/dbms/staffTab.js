/**
 * iSHARP DBMS 2.0 — Staff Tab Module (Tab 9: Staff & Remarks)
 * Interactive ID lookup against master directory (pond_staff)
 * and cycle-level personnel allocation persistence in growout_pond_master.
 */

import { appState } from "../../state/appState.js";
import { InventoryRepository } from "../../infrastructure/repositories/inventoryRepository.js";
import { StaffRepository } from "../../infrastructure/repositories/staffRepository.js";
import { Toast } from "../../components/Toast.js";

export class StaffTab {
    constructor() {
        this.dom = {
            tabPane: document.getElementById("tab-staff"),
            cycleBadge: document.getElementById("staff-cycle-badge"),
            datalist: document.getElementById("staff-directory-datalist"),

            // ID Inputs
            inputPmId: document.getElementById("input-pm-id"),
            inputSvId: document.getElementById("input-sv-id"),
            inputRlId: document.getElementById("input-rl-id"),
            inputPoId: document.getElementById("input-po-id"),
            inputSupportId: document.getElementById("input-support-id"),

            // Name Outputs
            inputPmName: document.getElementById("input-pm-name"),
            inputSvName: document.getElementById("input-sv-name"),
            inputRlName: document.getElementById("input-rl-name"),
            inputPoName: document.getElementById("input-po-name"),
            inputSupportName: document.getElementById("input-support-name"),

            // Action Buttons
            btnSave: document.getElementById("btn-save-staff"),
            btnReset: document.getElementById("btn-reset-staff"),

            // Operational Notes
            notesContainer: document.getElementById("notes-feed-container"),
            textareaNotes: document.getElementById("textarea-notes")
        };

        this.currentPond = null;
        this.isSaving = false;

        this.init();
        appState.subscribe("pondChanged", (pond) => this.render(pond));
    }

    async init() {
        // Pre-fetch staff directory into memory and populate datalist
        await this.populateDatalist();

        // Bind interactive lookup events on ID typing
        this.bindLookupEvents();

        // Bind Save and Reset actions
        if (this.dom.btnSave) {
            this.dom.btnSave.addEventListener("click", () => this.handleSave());
        }

        if (this.dom.btnReset) {
            this.dom.btnReset.addEventListener("click", () => this.clearForm());
        }
    }

    /**
     * Pre-loads staff directory and populates HTML5 datalist for autocomplete
     */
    async populateDatalist() {
        if (!this.dom.datalist) return;
        try {
            const staffList = await StaffRepository.getStaffDirectory();
            this.dom.datalist.innerHTML = staffList.map(s => `
                <option value="${s.staff_no}">${s.staff_no} - ${s.staff_name} (${s.staff_position})</option>
            `).join("");
        } catch (err) {
            console.warn("Could not populate staff datalist:", err);
        }
    }

    /**
     * Binds input and blur handlers to automatically display staff names when ID is entered
     */
    bindLookupEvents() {
        const roles = [
            { idInput: this.dom.inputPmId, nameInput: this.dom.inputPmName, label: "Manager" },
            { idInput: this.dom.inputSvId, nameInput: this.dom.inputSvName, label: "Supervisor" },
            { idInput: this.dom.inputRlId, nameInput: this.dom.inputRlName, label: "Row Leader" },
            { idInput: this.dom.inputPoId, nameInput: this.dom.inputPoName, label: "Operator" },
            { idInput: this.dom.inputSupportId, nameInput: this.dom.inputSupportName, label: "Support" }
        ];

        roles.forEach(({ idInput, nameInput }) => {
            if (!idInput || !nameInput) return;

            const handleLookup = () => {
                const val = idInput.value ? idInput.value.trim() : "";
                if (!val) {
                    nameInput.value = "";
                    return;
                }

                const staff = StaffRepository.findStaffByNo(val);
                if (staff) {
                    nameInput.value = `${staff.staff_name} (${staff.staff_position || 'Staff'})`;
                    nameInput.style.color = "#0f172a";
                } else {
                    nameInput.value = "⚠️ Unrecognized Staff ID";
                    nameInput.style.color = "#b91c1c";
                }
            };

            idInput.addEventListener("input", handleLookup);
            idInput.addEventListener("change", handleLookup);
            idInput.addEventListener("blur", handleLookup);
        });
    }

    async render(pond) {
        this.currentPond = pond;
        if (!pond) return;

        // Update header cycle badge
        if (this.dom.cycleBadge) {
            this.dom.cycleBadge.textContent = `${pond.pond || 'Pond'} · Cycle ${pond.cycle_no || pond.pond_index || '—'}`;
        }

        // Start with clean form
        this.clearForm();

        // Load saved personnel from growout_pond_master for this cycle
        await this.loadCyclePersonnel(pond.pond_index);

        // Load historical field remarks & operational logbook
        await this.loadNotes(pond.pond_index);
    }

    /**
     * Loads assigned personnel recorded for this specific pond_index
     * @param {string} pondIndex 
     */
    async loadCyclePersonnel(pondIndex) {
        if (!pondIndex) return;

        try {
            const data = await StaffRepository.getCycleStaff(pondIndex);
            if (!data) return;

            // Set IDs and trigger name lookup
            this.setStaffField(this.dom.inputPmId, this.dom.inputPmName, data.pm_staff_no);
            this.setStaffField(this.dom.inputSvId, this.dom.inputSvName, data.sv_staff_no);
            this.setStaffField(this.dom.inputRlId, this.dom.inputRlName, data.rl_staff_no);
            this.setStaffField(this.dom.inputPoId, this.dom.inputPoName, data.po_staff_no);
            this.setStaffField(this.dom.inputSupportId, this.dom.inputSupportName, data.support_staff_no);

        } catch (err) {
            console.error("Failed to load cycle personnel:", err);
        }
    }

    setStaffField(idInput, nameInput, staffNo) {
        if (!idInput || !nameInput) return;
        if (!staffNo) {
            idInput.value = "";
            nameInput.value = "";
            return;
        }

        idInput.value = staffNo;
        const staff = StaffRepository.findStaffByNo(staffNo);
        if (staff) {
            nameInput.value = `${staff.staff_name} (${staff.staff_position || 'Staff'})`;
            nameInput.style.color = "#0f172a";
        } else {
            nameInput.value = `ID #${staffNo}`;
            nameInput.style.color = "#64748b";
        }
    }

    clearForm() {
        [this.dom.inputPmId, this.dom.inputSvId, this.dom.inputRlId, this.dom.inputPoId, this.dom.inputSupportId].forEach(el => {
            if (el) el.value = "";
        });
        [this.dom.inputPmName, this.dom.inputSvName, this.dom.inputRlName, this.dom.inputPoName, this.dom.inputSupportName].forEach(el => {
            if (el) {
                el.value = "";
                el.style.color = "#0f172a";
            }
        });
    }

    /**
     * Saves crew assignments to growout_pond_master
     */
    async handleSave() {
        if (!this.currentPond || !this.currentPond.pond_index) {
            Toast.error("Please select a pond and cycle first.");
            return;
        }

        if (this.isSaving) return;
        this.isSaving = true;

        if (this.dom.btnSave) {
            this.dom.btnSave.disabled = true;
            this.dom.btnSave.innerHTML = `<span>⏳ Saving...</span>`;
        }

        try {
            const assignments = {
                pm_staff_no: this.dom.inputPmId?.value,
                sv_staff_no: this.dom.inputSvId?.value,
                rl_staff_no: this.dom.inputRlId?.value,
                po_staff_no: this.dom.inputPoId?.value,
                support_staff_no: this.dom.inputSupportId?.value
            };

            await StaffRepository.saveCycleStaff(this.currentPond.pond_index, assignments);
            Toast.success(`Personnel saved for ${this.currentPond.pond || 'Pond'} (Cycle ${this.currentPond.cycle_no || this.currentPond.pond_index})!`);

        } catch (err) {
            console.error("Save personnel failed:", err);
            Toast.error(`Failed to save personnel: ${err.message}`);
        } finally {
            this.isSaving = false;
            if (this.dom.btnSave) {
                this.dom.btnSave.disabled = false;
                this.dom.btnSave.innerHTML = `<span>💾 Save Personnel Allocation</span>`;
            }
        }
    }

    async loadNotes(pondIndex) {
        if (!this.dom.notesContainer) return;
        if (!pondIndex) {
            this.dom.notesContainer.innerHTML = `<div class="text-center text-muted p-3">Select a pond to view operational notes.</div>`;
            return;
        }

        try {
            const notes = await InventoryRepository.getNotes(pondIndex);
            if (!notes || notes.length === 0) {
                this.dom.notesContainer.innerHTML = `<div class="text-center text-muted p-3" style="font-size: 0.82rem;">No historical remarks or pathology field notes recorded for this cycle.</div>`;
                return;
            }

            this.dom.notesContainer.innerHTML = notes.map(r => `
                <div class="note-bubble" style="background: rgba(240, 249, 255, 0.7); border: 1px solid #bae6fd; border-radius: 8px; padding: 0.65rem 0.85rem; margin-bottom: 0.4rem;">
                    <div class="note-bubble-header" style="display: flex; justify-content: space-between; font-size: 0.72rem; color: #0284c7; font-weight: 600; margin-bottom: 0.25rem;">
                        <span>📅 ${r.note_date || 'Historical Log'}</span>
                        <span>👤 ${r.logged_by || 'Field Supervisor'}</span>
                    </div>
                    <div class="note-bubble-text" style="font-size: 0.8rem; color: #1e293b; line-height: 1.4;">${r.note}</div>
                </div>
            `).join("");
        } catch (err) {
            console.error("Failed to load pond notes:", err);
            this.dom.notesContainer.innerHTML = `<div class="text-center text-danger p-2">Error loading notes: ${err.message}</div>`;
        }
    }
}
