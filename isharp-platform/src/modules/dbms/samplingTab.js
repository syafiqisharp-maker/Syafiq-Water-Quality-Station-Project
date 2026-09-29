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
                        <td colspan="10" class="text-center" style="padding: 2.5rem 1rem;">
                            <div class="empty-state-box">
                                <div class="empty-icon-wrap">
                                    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--aero-sky-600);">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                        <polyline points="14 2 14 8 20 8"></polyline>
                                        <line x1="12" y1="18" x2="12" y2="12"></line>
                                        <line x1="9" y1="15" x2="15" y2="15"></line>
                                    </svg>
                                </div>
                                <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin: 0.6rem 0 0.2rem 0;">No Biometrics Sampling Logged</h4>
                                <p style="font-size: 0.78rem; color: var(--text-muted); max-width: 400px; margin: 0 auto 0.9rem auto;">This pond cycle has not received cast-net weekly sampling measurements or ABW records yet.</p>
                                <button type="button" class="btn-action btn-excel" id="btn-empty-paste-sampling">
                                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                        <polyline points="14 2 14 8 20 8"></polyline>
                                        <line x1="8" y1="13" x2="16" y2="13"></line>
                                        <line x1="8" y1="17" x2="16" y2="17"></line>
                                    </svg>
                                    <span>Paste Sampling Sheet (Excel)</span>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
                const emptyBtn = document.getElementById("btn-empty-paste-sampling");
                if (emptyBtn && this.onOpenExcel) {
                    emptyBtn.addEventListener("click", () => this.onOpenExcel("sampling"));
                }
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
                        <td class="font-mono text-muted">—</td>
                        <td class="font-mono text-muted">—</td>
                        <td class="font-mono text-muted">—</td>
                    </tr>
                `;
            }).join("");

        } catch (err) {
            console.error("Sampling load error:", err);
            Toast.error(`Could not load sampling records: ${err.message}`);
        }
    }
}
