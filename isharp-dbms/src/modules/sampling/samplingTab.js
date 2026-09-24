/**
 * iSHARP DBMS 2.0 — Sampling Tab Module (Tab 5)
 * Biometrics sampling records, ADG tracking, and Excel paste assistant.
 */

import { appState } from "../../state/appState.js";
import { SamplingRepository } from "../../infrastructure/repositories/samplingRepository.js";
import { calculateADG } from "../../domain/biometrics.js";
import { Toast } from "../../components/Toast.js";

export class SamplingTab {
    constructor(onOpenExcel) {
        this.onOpenExcel = onOpenExcel;
        this.dom = {
            tbody: document.getElementById("tbody-sampling"),
            snapLatestAbw: document.getElementById("snap-latest-abw"),
            btnExcelSampling: document.getElementById("btn-excel-sampling-tab")
        };

        this.injectExcelButtonIfMissing();
        appState.subscribe("pondChanged", (pond) => this.loadData(pond ? pond.pond_index : null));
    }

    injectExcelButtonIfMissing() {
        const tabPane = document.getElementById("tab-sampling");
        if (!tabPane) return;

        let btn = document.getElementById("btn-excel-sampling-tab");
        if (!btn) {
            const cardHeader = tabPane.querySelector(".card-header") || tabPane.querySelector(".glass-card");
            if (cardHeader) {
                btn = document.createElement("button");
                btn.id = "btn-excel-sampling-tab";
                btn.type = "button";
                btn.className = "btn-action btn-excel";
                btn.style.cssText = "margin-bottom: 0.75rem;";
                btn.innerHTML = `<span>📋 Paste Sampling Sheet (Excel)</span>`;
                btn.addEventListener("click", () => {
                    if (this.onOpenExcel) this.onOpenExcel("sampling");
                });
                cardHeader.prepend(btn);
            }
        }
    }

    async loadData(pondIndex) {
        if (!this.dom.tbody) return;
        if (!pondIndex) {
            this.dom.tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted" style="padding: 1.5rem;">Select a pond to view biometrics sampling.</td></tr>`;
            return;
        }

        try {
            const data = await SamplingRepository.getSamplingByPond(pondIndex);

            if (!data || data.length === 0) {
                this.dom.tbody.innerHTML = `
                    <tr>
                        <td colspan="10" class="text-center text-muted" style="padding: 2rem;">
                            No sampling records logged for this cycle.<br>
                            <span style="font-size: 0.78rem;">Click <strong>"Paste Sampling Sheet"</strong> above to upload Excel records.</span>
                        </td>
                    </tr>
                `;
                if (this.dom.snapLatestAbw) this.dom.snapLatestAbw.textContent = "—";
                return;
            }

            // Update Latest ABW Snapshot
            const latest = data[data.length - 1];
            if (this.dom.snapLatestAbw) {
                this.dom.snapLatestAbw.textContent = latest.smpl_abw ? `${parseFloat(latest.smpl_abw).toFixed(2)} g` : "—";
            }

            // Render Rows with ADG computation
            this.dom.tbody.innerHTML = data.map((r, i) => {
                const prev = i > 0 ? data[i - 1] : null;
                const daysDiff = (prev && r.smpl_doc && prev.smpl_doc) ? (r.smpl_doc - prev.smpl_doc) : 7;
                const adg = (prev && prev.smpl_abw && r.smpl_abw) 
                    ? `${calculateADG(prev.smpl_abw, r.smpl_abw, daysDiff)} g/d` 
                    : "—";

                return `
                    <tr>
                        <td class="font-mono">${r.smpl_date || '—'}</td>
                        <td class="font-mono font-bold">${r.smpl_doc || '—'}</td>
                        <td class="font-mono text-success font-bold">${parseFloat(r.smpl_abw || 0).toFixed(2)} g</td>
                        <td class="font-mono font-semibold" style="color: var(--aero-sky-600);">${adg}</td>
                        <td class="font-mono">${r.smpl_surv ? parseFloat(r.smpl_surv).toFixed(1) + '%' : '—'}</td>
                        <td class="font-mono font-bold">${r.smpl_bms ? Math.round(r.smpl_bms).toLocaleString() + ' kg' : '—'}</td>
                        <td class="font-mono">${r.smpl_tfed ? Math.round(r.smpl_tfed).toLocaleString() + ' kg' : '—'}</td>
                        <td class="font-mono text-muted">6.2 mg/L</td>
                        <td class="font-mono text-muted">7.85</td>
                        <td class="font-mono text-muted">29.4 °C</td>
                    </tr>
                `;
            }).join("");

        } catch (err) {
            console.error("Sampling load error:", err);
            Toast.error(`Could not load sampling records: ${err.message}`);
        }
    }
}
