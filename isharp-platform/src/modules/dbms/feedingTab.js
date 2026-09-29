/**
 * iSHARP DBMS 2.0 — Feeding Tab Module (Tab 4)
 * Daily feeding logs, feed tray monitoring, and Excel paste assistant.
 */

import { appState } from "../../state/appState.js";
import { FeedRepository } from "../../infrastructure/repositories/feedRepository.js";
import { Toast } from "../../components/Toast.js";

export class FeedingTab {
    constructor(onOpenExcel) {
        this.onOpenExcel = onOpenExcel;
        this.dom = {
            tbody: document.getElementById("tbody-feed"),
            snapTotalFeed: document.getElementById("snap-total-feed")
        };

        this.injectExcelButtonIfMissing();
        appState.subscribe("pondChanged", (pond) => this.loadData(pond ? pond.pond_index : null));
    }

    injectExcelButtonIfMissing() {
        const tabPane = document.getElementById("tab-feeding");
        if (!tabPane) return;

        let btn = document.getElementById("btn-excel-feeding-tab");
        if (!btn) {
            const cardHeader = tabPane.querySelector(".card-header") || tabPane.querySelector(".glass-card");
            if (cardHeader) {
                btn = document.createElement("button");
                btn.id = "btn-excel-feeding-tab";
                btn.type = "button";
                btn.className = "btn-action btn-excel";
                btn.style.cssText = "margin-bottom: 0.75rem;";
                btn.innerHTML = `<span>📋 Paste Feeding Sheet (Excel)</span>`;
                btn.addEventListener("click", () => {
                    if (this.onOpenExcel) this.onOpenExcel("feed");
                });
                cardHeader.prepend(btn);
            }
        }
    }

    async loadData(pondIndex) {
        if (!this.dom.tbody) return;
        if (!pondIndex) {
            this.dom.tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding: 1.5rem;">Select a pond to view feeding records.</td></tr>`;
            return;
        }

        try {
            const data = await FeedRepository.getDailyRecords(pondIndex);

            if (!data || data.length === 0) {
                this.dom.tbody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-center text-muted" style="padding: 2rem;">
                            No feeding records logged for this cycle.<br>
                            <span style="font-size: 0.78rem;">Click <strong>"Paste Feeding Sheet"</strong> above to upload Excel records.</span>
                        </td>
                    </tr>
                `;
                if (this.dom.snapTotalFeed) this.dom.snapTotalFeed.textContent = "0.0 kg";
                return;
            }

            const total = data.reduce((acc, row) => acc + (parseFloat(row.feed_kg) || 0), 0);
            if (this.dom.snapTotalFeed) {
                this.dom.snapTotalFeed.textContent = `${Math.round(total).toLocaleString()} kg`;
            }

            this.dom.tbody.innerHTML = data.map(r => `
                <tr>
                    <td class="font-mono">${r.log_date || '—'}</td>
                    <td>${r.shift || 'Full Day'}</td>
                    <td class="font-mono font-bold text-success">${parseFloat(r.feed_kg || 0).toFixed(1)} kg</td>
                    <td class="font-mono">${r.feed_tray_remnant_pct || 0}%</td>
                    <td class="font-mono">${r.water_level_cm ? r.water_level_cm + ' cm' : '—'}</td>
                    <td><span class="status-badge status-production">${r.water_colour || 'Healthy Green'}</span></td>
                    <td class="font-mono ${r.mortality_count > 0 ? 'text-danger font-bold' : ''}">${r.mortality_count || 0}</td>
                    <td>${r.remarks || '—'}</td>
                </tr>
            `).join("");

        } catch (err) {
            console.error("Feeding load error:", err);
            Toast.error(`Could not load feeding records: ${err.message}`);
        }
    }
}
