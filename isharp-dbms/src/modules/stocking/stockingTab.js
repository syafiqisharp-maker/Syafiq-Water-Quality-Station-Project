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

        this.btnSave = document.getElementById("btn-save-stocking");

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

        // Inline Save button
        if (this.btnSave) {
            this.btnSave.addEventListener("click", () => this.saveData());
        }
    }

    async render(pond) {
        if (!pond) return;

        if (this.dom.stckDate) this.dom.stckDate.value = pond.stck_date || "";
        const cleanOrigin = (pond.stck_source && pond.stck_source !== "—") ? pond.stck_source : (pond.pl_origin && pond.pl_origin !== "—" ? pond.pl_origin : "");
        if (this.dom.stckSource) this.dom.stckSource.value = cleanOrigin;
        
        const cleanSpecies = (pond.stck_species && pond.stck_species !== "—") ? pond.stck_species : (pond.species && pond.species !== "—" ? pond.species : "");
        if (this.dom.stckSpecies) this.dom.stckSpecies.value = cleanSpecies || "P. VANNAMEi";
        if (this.dom.stckNetto) this.dom.stckNetto.value = pond.stck_pcs || pond.stck_netto || "";
        if (this.dom.stckAllow) this.dom.stckAllow.value = pond.stck_allow !== undefined && pond.stck_allow !== null ? pond.stck_allow : "";
        
        const nettoVal = parseFloat(pond.stck_pcs || pond.stck_netto || 0) || 0;
        const allowVal = parseFloat(pond.stck_allow || 0) || 0;
        const grossVal = pond.stck_total !== undefined && pond.stck_total !== null ? pond.stck_total : (nettoVal + allowVal);
        if (this.dom.stckGross) this.dom.stckGross.value = grossVal || "";

        const cleanLine = (pond.bs_line && pond.bs_line !== "—") ? pond.bs_line : (pond.genetic_line && pond.genetic_line !== "—" ? pond.genetic_line : "");
        if (this.dom.stckLine) this.dom.stckLine.value = cleanLine;
        if (this.dom.stckSize) {
            const rawSize = pond.stck_size !== undefined && pond.stck_size !== null ? pond.stck_size : (pond.pl_size || "");
            this.dom.stckSize.value = rawSize ? (String(rawSize).toUpperCase().startsWith("PL") ? String(rawSize) : `PL ${rawSize}`) : "";
        }
        if (this.dom.stckTank) this.dom.stckTank.value = pond.stck_tank || pond.tank_no || "";

        await this.loadBatches(pond);
        this.applyRolePermissions();
    }

    async loadBatches(pond) {
        if (!this.dom.tbodyBatches) return;
        if (!pond || !pond.pond_index) {
            this.dom.tbodyBatches.innerHTML = `<tr><td colspan="9" class="text-center text-muted" style="padding: 1.5rem;">Select a pond to view stocking batches.</td></tr>`;
            return;
        }

        try {
            const batches = await PondRepository.getStockingBatches(pond.pond_index);

            if (batches && batches.length > 0) {
                this.dom.tbodyBatches.innerHTML = batches.map((r, i) => {
                    const netto = parseFloat(r.stck_pcs || 0);
                    const allow = parseFloat(r.stck_allow || 0);
                    const total = r.stck_total ? parseFloat(r.stck_total) : (netto + allow);
                    const sizeStr = r.stck_size ? (String(r.stck_size).toUpperCase().startsWith("PL") ? r.stck_size : `PL ${r.stck_size}`) : "—";

                    return `
                        <tr>
                            <td class="font-mono font-bold">BATCH-${String(i + 1).padStart(2, '0')}</td>
                            <td class="font-mono">${r.stck_date || '—'}</td>
                            <td>${r.stck_source || pond.stck_source || '—'}</td>
                            <td>${r.bs_line || pond.bs_line || '—'}</td>
                            <td class="font-mono font-bold">${netto > 0 ? Math.round(netto).toLocaleString() : '—'}</td>
                            <td class="font-mono">${allow > 0 ? Math.round(allow).toLocaleString() : '0'}</td>
                            <td class="font-mono text-success font-bold">${total > 0 ? Math.round(total).toLocaleString() : '—'}</td>
                            <td class="font-mono">${sizeStr}</td>
                            <td class="font-mono">${r.stck_tank || pond.stck_tank || '—'}</td>
                        </tr>
                    `;
                }).join("");
            } else if (pond.stck_pcs || pond.stck_date) {
                // Fallback to cycle-level stocking record
                const netto = parseFloat(pond.stck_pcs || pond.stck_netto || 0);
                const allow = parseFloat(pond.stck_allow || 0);
                const total = pond.stck_total ? parseFloat(pond.stck_total) : (netto + allow);
                const sizeStr = pond.stck_size ? (String(pond.stck_size).toUpperCase().startsWith("PL") ? pond.stck_size : `PL ${pond.stck_size}`) : "—";

                this.dom.tbodyBatches.innerHTML = `
                    <tr>
                        <td class="font-mono font-bold">BATCH-01</td>
                        <td class="font-mono">${pond.stck_date || '—'}</td>
                        <td>${pond.stck_source || pond.pl_origin || '—'}</td>
                        <td>${pond.bs_line || pond.genetic_line || '—'}</td>
                        <td class="font-mono font-bold">${netto > 0 ? Math.round(netto).toLocaleString() : '—'}</td>
                        <td class="font-mono">${allow > 0 ? Math.round(allow).toLocaleString() : '0'}</td>
                        <td class="font-mono text-success font-bold">${total > 0 ? Math.round(total).toLocaleString() : '—'}</td>
                        <td class="font-mono">${sizeStr}</td>
                        <td class="font-mono">${pond.stck_tank || pond.tank_no || '—'}</td>
                    </tr>
                `;
            } else {
                this.dom.tbodyBatches.innerHTML = `
                    <tr>
                        <td colspan="9" class="text-center text-muted" style="padding: 1.5rem;">
                            No stocking batch records logged for cycle <strong>[${pond.pond_index}]</strong>.
                        </td>
                    </tr>
                `;
            }
        } catch (err) {
            console.error("Failed to load stocking batches:", err);
            this.dom.tbodyBatches.innerHTML = `<tr><td colspan="9" class="text-center text-danger">Error loading batch records: ${err.message}</td></tr>`;
        }
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
            const nettoVal = parseFloat(this.dom.stckNetto?.value || 0) || 0;
            const allowVal = parseFloat(this.dom.stckAllow?.value || 0) || 0;
            const totalVal = nettoVal + allowVal;

            let sizeVal = null;
            if (this.dom.stckSize?.value) {
                const num = parseInt(String(this.dom.stckSize.value).replace(/\D/g, ''), 10);
                if (!isNaN(num)) sizeVal = num;
            }

            const updates = {
                stck_date: this.dom.stckDate?.value || null,
                stck_source: this.dom.stckSource?.value || null,
                stck_species: this.dom.stckSpecies?.value || null,
                stck_pcs: nettoVal,
                stck_allow: allowVal,
                stck_total: totalVal,
                bs_line: this.dom.stckLine?.value || null,
                stck_size: sizeVal,
                stck_tank: this.dom.stckTank?.value || null
            };

            await PondRepository.saveStockingBatch(pondIndex, updates);
            await this.loadBatches(appState.currentPond);
            
            // Sync active state
            if (appState.currentPond) {
                Object.assign(appState.currentPond, updates, {
                    stck_netto: nettoVal,
                    species: updates.stck_species,
                    genetic_line: updates.bs_line
                });
            }

            Toast.success("Stocking batch parameters saved successfully!");
        } catch (err) {
            console.error("Save Stocking error:", err);
            Toast.error(`Save failed: ${err.message}`);
        } finally {
            appState.setLoading(false);
        }
    }

    applyRolePermissions() {
        const canEdit = hasPermission(appState.userRole, PERMISSIONS.EDIT_STOCKING_PARAMS);
        const inputs = [
            this.dom.stckDate, this.dom.stckSource, this.dom.stckSpecies,
            this.dom.stckNetto, this.dom.stckAllow, this.dom.stckLine,
            this.dom.stckSize, this.dom.stckTank
        ];
        inputs.forEach(inp => {
            if (inp) {
                inp.disabled = !canEdit;
                inp.style.opacity = canEdit ? "1" : "0.7";
            }
        });

        if (this.btnSave) {
            this.btnSave.disabled = !canEdit;
            this.btnSave.style.opacity = canEdit ? "1" : "0.5";
            this.btnSave.style.pointerEvents = canEdit ? "auto" : "none";
        }
    }
}
