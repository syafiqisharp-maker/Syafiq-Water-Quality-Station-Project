import { appState } from "../../state/appState.js";
import { PondRepository } from "../../infrastructure/repositories/pondRepository.js";
import { HarvestRepository } from "../../infrastructure/repositories/harvestRepository.js";
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

    async render(pond) {
        if (!pond) return;

        try {
            const [dailyRecords, salesRecords] = await Promise.all([
                HarvestRepository.getHarvestDaily(pond.pond_index),
                HarvestRepository.getHarvestSales(pond.pond_index)
            ]);

            // Render Daily Harvest
            if (this.dom.tbodyHarvest) {
                if (dailyRecords && dailyRecords.length > 0) {
                    this.dom.tbodyHarvest.innerHTML = dailyRecords.map(r => {
                        const weight = parseFloat(r.harv_weight || 0);
                        const abw = parseFloat(r.harv_abw || 0);
                        const revenue = parseFloat(r.harv_revenue || 0);
                        const pcs = (abw > 0 && weight > 0) ? Math.round((weight * 1000) / abw) : 0;
                        const isFinal = (r.harv_status || "").toUpperCase().includes("TERMINATION") || (r.harv_status || "").toUpperCase().includes("FINAL");
                        const statusClass = isFinal ? "status-production" : "status-idle";

                        return `
                            <tr>
                                <td class="font-mono">${r.harv_date || '—'}</td>
                                <td><span class="status-badge ${statusClass}">${r.harv_status || 'HARVEST'}</span></td>
                                <td class="font-mono font-bold text-success">${weight > 0 ? weight.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' kg' : '—'}</td>
                                <td class="font-mono font-bold">${abw > 0 ? abw.toFixed(2) + ' g' : '—'}</td>
                                <td class="font-mono">${pcs > 0 ? pcs.toLocaleString() : '—'}</td>
                                <td>${r.harv_method === 'M' ? 'Mechanical (Pump/Net)' : (r.harv_method || 'Standard')}</td>
                                <td class="font-mono font-bold text-success">${revenue > 0 ? 'RM ' + revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
                            </tr>
                        `;
                    }).join("");
                } else {
                    this.dom.tbodyHarvest.innerHTML = `
                        <tr>
                            <td colspan="7" class="text-center text-muted" style="padding: 2rem 1rem;">
                                🦐 No harvest runs logged for cycle <strong>[${pond.pond_index}]</strong> (Current Status: <strong>${pond.pond_status || 'PRODUCTION'}</strong>).
                            </td>
                        </tr>
                    `;
                }
            }

            // Render Commercial Buyer Sales
            if (this.dom.tbodySales) {
                if (salesRecords && salesRecords.length > 0) {
                    this.dom.tbodySales.innerHTML = salesRecords.map(s => {
                        const goodWgt = parseFloat(s.good_wgt || 0);
                        const goodPrc = parseFloat(s.good_prc || 0);
                        const secondWgt = parseFloat(s.second_grade_wgt || 0);
                        const smallWgt = parseFloat(s.small_wgt || 0);
                        const belowWgt = parseFloat(s.below_wgt || 0);
                        const rubbishWgt = parseFloat(s.rubbish_wgt || 0);
                        const netSales = parseFloat(s.net_sales || 0);
                        const abw = parseFloat(s.hvt_abw || 0);

                        return `
                            <tr>
                                <td class="font-mono">${s.hvt_date || '—'}</td>
                                <td class="font-bold">${s.hvt_buyer || 'Commercial Buyer'}</td>
                                <td class="font-mono">${abw > 0 ? abw.toFixed(2) + ' g' : '—'}</td>
                                <td class="font-mono font-bold">${goodWgt > 0 ? goodWgt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg' : '—'}</td>
                                <td class="font-mono">${goodPrc > 0 ? 'RM ' + goodPrc.toFixed(2) + ' / kg' : '—'}</td>
                                <td class="font-mono">${secondWgt > 0 ? secondWgt.toFixed(2) + ' kg' : '—'}</td>
                                <td class="font-mono">${smallWgt > 0 ? smallWgt.toFixed(2) + ' kg' : '—'}</td>
                                <td class="font-mono">${belowWgt > 0 ? belowWgt.toFixed(2) + ' kg' : '—'}</td>
                                <td class="font-mono">${rubbishWgt > 0 ? rubbishWgt.toFixed(2) + ' kg' : '—'}</td>
                                <td class="font-mono font-bold text-success">${netSales > 0 ? 'RM ' + netSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
                            </tr>
                        `;
                    }).join("");
                } else {
                    this.dom.tbodySales.innerHTML = `
                        <tr>
                            <td colspan="10" class="text-center text-muted" style="padding: 2rem 1rem;">
                                📦 No commercial buyer packout transactions recorded yet for cycle <strong>[${pond.pond_index}]</strong>.
                            </td>
                        </tr>
                    `;
                }
            }
        } catch (err) {
            console.error("Error loading harvest and sales records:", err);
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
