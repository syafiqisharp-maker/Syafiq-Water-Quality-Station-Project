/**
 * iSHARP DBMS 2.0 — Harvest & Sales Tab Module (Tab 7)
 * Focuses purely on harvest events, catch biometrics, commercial buyer grading packout, and revenue.
 */

import { appState } from "../../state/appState.js";
import { HarvestRepository } from "../../infrastructure/repositories/harvestRepository.js";
import { Toast } from "../../components/Toast.js";

export class HarvestTab {
    constructor(onOpenExcel) {
        this.onOpenExcel = onOpenExcel;
        this.dom = {
            tbodyHarvest: document.getElementById("tbody-harvest"),
            tbodySales: document.getElementById("tbody-harvest-sales"),
            totalWeight: document.getElementById("stat-harvest-weight"),
            totalRevenue: document.getElementById("stat-harvest-revenue"),
            meanAbw: document.getElementById("stat-harvest-abw"),
            btnAddHarvest: document.getElementById("btn-add-harvest-event")
        };

        this.bindEvents();
        appState.subscribe("pondChanged", (pond) => this.render(pond));
    }

    bindEvents() {
        if (this.dom.btnAddHarvest) {
            this.dom.btnAddHarvest.addEventListener("click", () => {
                if (this.onOpenExcel) this.onOpenExcel("harvest");
            });
        }
    }

    async render(pond) {
        if (!pond) {
            if (this.dom.tbodyHarvest) {
                this.dom.tbodyHarvest.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 1.5rem;">Select a pond cycle to view harvest records.</td></tr>`;
            }
            if (this.dom.tbodySales) {
                this.dom.tbodySales.innerHTML = `<tr><td colspan="10" class="text-center text-muted" style="padding: 1.5rem;">Select a pond cycle to view buyer sales records.</td></tr>`;
            }
            return;
        }

        try {
            const [dailyRecords, salesRecords] = await Promise.all([
                HarvestRepository.getHarvestDaily(pond.pond_index),
                HarvestRepository.getHarvestSales(pond.pond_index)
            ]);

            let sumWeight = 0;
            let sumRevenue = 0;
            let weightedAbwSum = 0;

            // 1. Render Daily Harvest
            if (this.dom.tbodyHarvest) {
                if (dailyRecords && dailyRecords.length > 0) {
                    this.dom.tbodyHarvest.innerHTML = dailyRecords.map(r => {
                        const weight = parseFloat(r.harv_weight || 0);
                        const abw = parseFloat(r.harv_abw || 0);
                        const revenue = parseFloat(r.harv_revenue || 0);
                        const pcs = (abw > 0 && weight > 0) ? Math.round((weight * 1000) / abw) : 0;
                        const isFinal = (r.harv_status || "").toUpperCase().includes("TERMINATION") || (r.harv_status || "").toUpperCase().includes("FINAL");
                        const statusClass = isFinal ? "status-production" : "status-idle";

                        sumWeight += weight;
                        sumRevenue += revenue;
                        if (abw > 0 && weight > 0) {
                            weightedAbwSum += (abw * weight);
                        }

                        return `
                            <tr>
                                <td class="font-mono">${r.harv_date || '—'}</td>
                                <td><span class="status-badge ${statusClass}">${r.harv_status || 'HARVEST'}</span></td>
                                <td class="font-mono font-bold text-success">${weight > 0 ? weight.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' kg' : '—'}</td>
                                <td class="font-mono font-bold">${abw > 0 ? abw.toFixed(2) + ' g' : '—'}</td>
                                <td class="font-mono">${pcs > 0 ? pcs.toLocaleString() : '—'}</td>
                                <td>${r.harv_method === 'M' ? 'Mechanical (Pump/Net)' : (r.harv_method || 'Standard Netting')}</td>
                                <td class="font-mono font-bold text-success">${revenue > 0 ? 'RM ' + revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
                            </tr>
                        `;
                    }).join("");
                } else {
                    this.dom.tbodyHarvest.innerHTML = `
                        <tr>
                            <td colspan="7" class="text-center text-muted" style="padding: 2.2rem 1rem;">
                                🦐 No harvest runs logged yet for cycle <strong>[${pond.pond_index}]</strong> (Current Status: <strong>${pond.pond_status || 'PRODUCTION'}</strong>).
                            </td>
                        </tr>
                    `;
                }
            }

            // 2. Render Commercial Buyer Sales Packout
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
                            <td colspan="10" class="text-center text-muted" style="padding: 2.2rem 1rem;">
                                📦 No commercial buyer packout transactions recorded yet for cycle <strong>[${pond.pond_index}]</strong>.
                            </td>
                        </tr>
                    `;
                }
            }

            // 3. Update Stat Badges (if present in DOM)
            if (this.dom.totalWeight) {
                this.dom.totalWeight.textContent = sumWeight > 0 ? `${sumWeight.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg` : '—';
            }
            if (this.dom.totalRevenue) {
                this.dom.totalRevenue.textContent = sumRevenue > 0 ? `RM ${sumRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
            }
            if (this.dom.meanAbw) {
                const avgAbw = sumWeight > 0 ? (weightedAbwSum / sumWeight) : 0;
                this.dom.meanAbw.textContent = avgAbw > 0 ? `${avgAbw.toFixed(2)} g` : '—';
            }

        } catch (err) {
            console.error("Error loading harvest and sales records:", err);
            Toast.error(`Could not load harvest data: ${err.message}`);
        }
    }
}
