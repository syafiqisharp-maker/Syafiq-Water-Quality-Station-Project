/**
 * iSHARP DBMS 2.0 — Stocking Tab Module (Tab 3)
 * Post-Larvae (PL) stocking batches, source hatchery, and auto-gross calculations.
 */

import { appState } from "../../state/appState.js";
import { PondRepository } from "../../infrastructure/repositories/pondRepository.js";
import { hasPermission, PERMISSIONS } from "../../config/permissions.js";
import { Toast } from "../../components/Toast.js";

export class StockingTab {
    constructor() {
        this.dom = {
            stckDate: document.getElementById("input-stck-date"),
            stckSource: document.getElementById("input-stck-source"),
            stckSpecies: document.getElementById("input-stck-species"),
            stckNetto: document.getElementById("input-stck-netto"),
            stckAllow: document.getElementById("input-stck-allow"),
            stckGross: document.getElementById("input-stck-gross"),
            stckLine: document.getElementById("input-stck-line"),
            stckSize: document.getElementById("input-stck-size"),
            stckTank: document.getElementById("input-stck-tank"),
            tbodyBatches: document.getElementById("tbody-stocking-batches")
        };

        this.bindEvents();
        appState.subscribe("pondChanged", (pond) => this.render(pond));
        appState.subscribe("roleChanged", () => this.applyRolePermissions());
    }

    bindEvents() {
        const calcGross = () => {
            const netto = parseFloat(this.dom.stckNetto?.value || 0) || 0;
            const allow = parseFloat(this.dom.stckAllow?.value || 0) || 0;
            if (this.dom.stckGross) this.dom.stckGross.value = netto + allow;
        };

        if (this.dom.stckNetto) this.dom.stckNetto.addEventListener("input", calcGross);
        if (this.dom.stckAllow) this.dom.stckAllow.addEventListener("input", calcGross);
    }

    render(pond) {
        if (!pond) return;

        if (this.dom.stckDate) this.dom.stckDate.value = pond.stck_date || "";
        if (this.dom.stckSource) this.dom.stckSource.value = pond.pl_origin || pond.stck_source || "Hatchery Setiu";
        if (this.dom.stckSpecies) this.dom.stckSpecies.value = pond.species || "Penaeus vannamei";
        if (this.dom.stckNetto) this.dom.stckNetto.value = pond.stck_netto || 0;
        if (this.dom.stckAllow) this.dom.stckAllow.value = pond.stck_allow || 0;
        if (this.dom.stckGross) this.dom.stckGross.value = (parseFloat(pond.stck_netto) || 0) + (parseFloat(pond.stck_allow) || 0);
        if (this.dom.stckLine) this.dom.stckLine.value = pond.genetic_line || "SIS Superior";
        if (this.dom.stckSize) this.dom.stckSize.value = pond.pl_size || "PL 10";
        if (this.dom.stckTank) this.dom.stckTank.value = pond.tank_no || "T-04";

        if (this.dom.tbodyBatches) {
            this.dom.tbodyBatches.innerHTML = `
                <tr>
                    <td class="font-mono">BATCH-01</td>
                    <td class="font-mono">${pond.stck_date || '—'}</td>
                    <td>${pond.pl_origin || 'Local Hatchery'}</td>
                    <td>${pond.genetic_line || 'Standard Line'}</td>
                    <td class="font-mono font-bold">${(parseFloat(pond.stck_netto) || 0).toLocaleString()}</td>
                    <td class="font-mono">${(parseFloat(pond.stck_allow) || 0).toLocaleString()}</td>
                    <td class="font-mono text-success font-bold">${((parseFloat(pond.stck_netto) || 0) + (parseFloat(pond.stck_allow) || 0)).toLocaleString()}</td>
                    <td class="font-mono">${pond.pl_size || 'PL 10'}</td>
                    <td class="font-mono">${pond.tank_no || 'T-04'}</td>
                </tr>
            `;
        }

        this.applyRolePermissions();
    }

    async saveData() {
        const pondIndex = appState.currentPondIndex;
        if (!pondIndex) return;

        if (!hasPermission(appState.userRole, PERMISSIONS.EDIT_STOCKING_PARAMS)) {
            Toast.error("Your current role does not have permission to modify Stocking parameters.");
            return;
        }

        try {
            appState.setLoading(true);
            const updates = {
                stck_date: this.dom.stckDate?.value || null,
                stck_source: this.dom.stckSource?.value || null,
                species: this.dom.stckSpecies?.value || null,
                stck_netto: parseFloat(this.dom.stckNetto?.value || 0),
                stck_allow: parseFloat(this.dom.stckAllow?.value || 0),
                genetic_line: this.dom.stckLine?.value || null,
                pl_size: this.dom.stckSize?.value || null,
                tank_no: this.dom.stckTank?.value || null
            };

            await PondRepository.updateCycle(pondIndex, updates);
            Toast.success("Stocking parameters saved successfully!");
        } catch (err) {
            console.error("Save Stocking error:", err);
            Toast.error(`Save failed: ${err.message}`);
        } finally {
            appState.setLoading(false);
        }
    }

    applyRolePermissions() {
        const canEdit = hasPermission(appState.userRole, PERMISSIONS.EDIT_STOCKING_PARAMS);
        [
            this.dom.stckDate, this.dom.stckSource, this.dom.stckSpecies,
            this.dom.stckNetto, this.dom.stckAllow, this.dom.stckLine,
            this.dom.stckSize, this.dom.stckTank
        ].forEach(inp => {
            if (inp) {
                inp.disabled = !canEdit;
                inp.style.opacity = canEdit ? "1" : "0.7";
            }
        });
    }
}
