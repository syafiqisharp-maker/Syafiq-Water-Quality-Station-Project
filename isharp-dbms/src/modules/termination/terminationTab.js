/**
 * iSHARP DBMS 2.0 — Termination & Cycle Rollover Wizard (Tab 7)
 * Automated cycle rollover, harvest logs, and gatekeeper transition.
 */

import { appState } from "../../state/appState.js";
import { PondRepository } from "../../infrastructure/repositories/pondRepository.js";
import { validateRolloverEligibility, parsePondIndex } from "../../domain/rollover.js";
import { hasPermission, PERMISSIONS } from "../../config/permissions.js";
import { Toast } from "../../components/Toast.js";

export class TerminationTab {
    constructor() {
        this.dom = {
            tbodyHarvest: document.getElementById("tbody-harvest"),
            tbodySales: document.getElementById("tbody-harvest-sales"),
            btnRollover: document.getElementById("btn-action-new-cycle")
        };

        appState.subscribe("pondChanged", (pond) => this.render(pond));
    }

    render(pond) {
        if (!pond) return;

        // Render harvest preview
        if (this.dom.tbodyHarvest) {
            this.dom.tbodyHarvest.innerHTML = `
                <tr>
                    <td class="font-mono">${pond.date_close || '—'}</td>
                    <td><span class="status-badge status-production">Final Clean Harvest</span></td>
                    <td class="font-mono font-bold text-success">3,450 kg</td>
                    <td class="font-mono font-bold">19.20 g</td>
                    <td class="font-mono">115</td>
                    <td>Main Processing Plant (Setiu)</td>
                </tr>
            `;
        }

        if (this.dom.tbodySales) {
            this.dom.tbodySales.innerHTML = `
                <tr>
                    <td class="font-mono">${pond.date_close || '—'}</td>
                    <td>Wholesale Local Export</td>
                    <td class="font-mono font-bold">3,450 kg</td>
                    <td class="font-mono">RM 24.50 / kg</td>
                    <td class="font-mono text-success font-bold">RM 84,525.00</td>
                    <td><span class="status-badge status-production">PAID</span></td>
                </tr>
            `;
        }
    }

    async promptRollover() {
        const pond = appState.currentPond;
        if (!pond) {
            Toast.error("Please select a pond cycle first.");
            return;
        }

        if (!hasPermission(appState.userRole, PERMISSIONS.EXECUTE_ROLLOVER)) {
            Toast.error("Only Planner role can execute cycle rollover.");
            return;
        }

        const eligibility = validateRolloverEligibility(pond);
        if (!eligibility.eligible) {
            alert(`⚠️ Cannot Rollover:\n\n${eligibility.reason}`);
            return;
        }

        const info = parsePondIndex(pond.pond_index);
        const confirmed = confirm(
            `🦐 CYCLE ROLLOVER CONFIRMATION\n\n` +
            `Are you sure you want to close cycle [${pond.pond_index}] for Pond ${pond.pond}?\n\n` +
            `This will:\n` +
            `1. Lock this cycle and set status to 'CLOSE' / 'iN ACTiVE'.\n` +
            `2. Automatically increment the cycle number.\n` +
            `3. Generate the next cycle record: [${info.nextIndex}] in 'iDLE' status ready for preparation.\n\n` +
            `Click OK to proceed with rollover.`
        );

        if (!confirmed) return;

        try {
            appState.setLoading(true);
            Toast.info("Executing automated cycle rollover...");

            const res = await PondRepository.executeRollover(pond.pond_index);

            if (res && res.success) {
                alert(`✅ SUCCESS!\n\nPond ${res.pond} is now closed.\nNew Cycle Created: ${res.new_pond_index} (Status: IDLE).`);
                Toast.success(`New Cycle ${res.new_pond_index} created!`);

                // Reload cycles and auto-select newly spawned cycle
                const cycles = await PondRepository.getCycles();
                appState.setCycles(cycles);
                appState.setCurrentPond({ pond_index: res.new_pond_index });
            } else {
                throw new Error("RPC returned unexpected result: " + JSON.stringify(res));
            }
        } catch (err) {
            console.error("Rollover failed:", err);
            alert(`Rollover Failed: ${err.message}`);
            Toast.error(`Rollover Failed: ${err.message}`);
        } finally {
            appState.setLoading(false);
        }
    }
}
