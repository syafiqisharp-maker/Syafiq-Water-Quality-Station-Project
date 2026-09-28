/**
 * iSHARP DBMS 2.0 — Staff Tab Module (Tab 8)
 * Shift schedules, pond technicians, and manager assignments.
 */

import { appState } from "../../state/appState.js";
import { InventoryRepository } from "../../infrastructure/repositories/inventoryRepository.js";

export class StaffTab {
    constructor() {
        this.dom = {
            tabPane: document.getElementById("tab-staff"),
            inputPm: document.getElementById("input-staff-pm"),
            inputSv: document.getElementById("input-staff-sv"),
            inputPo: document.getElementById("input-staff-po"),
            notesContainer: document.getElementById("notes-feed-container")
        };

        appState.subscribe("pondChanged", (pond) => this.render(pond));
    }

    async render(pond) {
        if (!pond) return;

        // Populate staff allocations based on operational module
        const mod = String(pond.modl || pond.module || "01").replace(/\D/g, "");
        if (this.dom.inputPm) this.dom.inputPm.value = "En. Azmi (Pond Manager)";
        if (this.dom.inputSv) {
            this.dom.inputSv.value = mod === "02" ? "En. Hafiz (Field Supervisor)" : "En. Roslan (Field Supervisor)";
        }
        if (this.dom.inputPo) {
            this.dom.inputPo.value = mod === "02" ? "Hassan / Zaki (Technician)" : "Kamal / Shafiq (Technician)";
        }

        // Load historical field remarks & operational logbook
        await this.loadNotes(pond.pond_index);
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
