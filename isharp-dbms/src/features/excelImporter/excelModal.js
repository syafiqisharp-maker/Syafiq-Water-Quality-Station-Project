/**
 * iSHARP DBMS 2.0 — Excel Paste & Sync Assistant
 * Provides clear column guides, one-click template copy, live validation preview, and batch cloud import.
 */

import { appState } from "../../state/appState.js";
import { SamplingRepository } from "../../infrastructure/repositories/samplingRepository.js";
import { FeedRepository } from "../../infrastructure/repositories/feedRepository.js";
import { Toast } from "../../components/Toast.js";

export const EXCEL_SCHEMAS = {
    sampling: {
        title: "Biometrics Sampling Sheet",
        headers: ["Date (YYYY-MM-DD)", "DOC", "ABW (g)", "Survival (%)", "Biomass (kg)", "Total Feed (kg)"],
        example: "2026-07-15\t45\t12.50\t88.5\t2850\t3400",
        notes: "Dates should be YYYY-MM-DD. Numbers should not contain commas or text units.",
        dbFields: ["smpl_date", "smpl_doc", "smpl_abw", "smpl_surv", "smpl_bms", "smpl_tfed"]
    },
    feed: {
        title: "Daily Feeding Journal",
        headers: ["Date (YYYY-MM-DD)", "Shift", "Feed (kg)", "Tray Remnant (%)", "Water Level (cm)", "Water Colour", "Mortality", "Remarks"],
        example: "2026-07-15\tMorning\t120.5\t15\t110\tHealthy Green\t0\tNormal feeding",
        notes: "Shift can be Morning, Afternoon, Evening, or Full Day. Tray remnant is integer %.",
        dbFields: ["log_date", "shift", "feed_kg", "feed_tray_remnant_pct", "water_level_cm", "water_colour", "mortality_count", "remarks"]
    },
    harvest: {
        title: "Harvest Sales & Tonnage",
        headers: ["Date (YYYY-MM-DD)", "Harvest Type", "Qty (kg)", "ABW (g)", "Crates", "Destination / Buyer"],
        example: "2026-09-10\tPartial Harvest\t1500\t18.2\t50\tProcessing Plant A",
        notes: "Harvest type can be 'Partial Harvest' or 'Final Clean Harvest'.",
        dbFields: ["harvest_date", "harvest_type", "qty_kg", "size_abw", "crates_count", "destination"]
    }
};

export class ExcelModal {
    constructor(onImportSuccess) {
        this.onImportSuccess = onImportSuccess;
        this.activeCategory = "sampling";
        this.parsedRows = [];

        this.dom = {
            modal: document.getElementById("modal-excel-paste"),
            categorySelect: document.getElementById("excel-target-category"),
            textarea: document.getElementById("excel-paste-textarea"),
            parsedCount: document.getElementById("excel-parsed-count"),
            thead: document.getElementById("thead-excel-preview"),
            tbody: document.getElementById("tbody-excel-preview"),
            btnCommit: document.getElementById("btn-commit-excel"),
            btnClose: document.getElementById("btn-close-excel-modal"),
            btnCloseIcon: document.getElementById("btn-modal-close-icon")
        };

        this.injectTemplateHelperUI();
        this.bindEvents();
    }

    injectTemplateHelperUI() {
        const modalBody = this.dom.modal?.querySelector(".modal-body") || this.dom.modal;
        if (!modalBody) return;

        // Create the instruction container if it doesn't exist
        let guideEl = document.getElementById("excel-column-guide-card");
        if (!guideEl) {
            guideEl = document.createElement("div");
            guideEl.id = "excel-column-guide-card";
            guideEl.className = "glass-card";
            guideEl.style.cssText = "margin-bottom: 0.85rem; padding: 0.85rem 1rem; border-left: 4px solid var(--aero-sky-500); background: rgba(240, 249, 255, 0.7);";
            
            const textareaParent = this.dom.textarea?.parentNode;
            if (textareaParent) {
                textareaParent.insertBefore(guideEl, this.dom.textarea);
            }
        }

        this.guideElement = guideEl;
        this.updateGuideUI();
    }

    updateGuideUI() {
        if (!this.guideElement) return;
        const schema = EXCEL_SCHEMAS[this.activeCategory];
        if (!schema) return;

        this.guideElement.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; flex-wrap: wrap; gap: 0.5rem;">
                <span style="font-weight: 700; color: var(--text-primary); font-size: 0.82rem;">📋 Required Columns: ${schema.title}</span>
                <button type="button" id="btn-copy-excel-headers" class="btn-action" style="background: #fff; padding: 0.2rem 0.6rem; font-size: 0.74rem; border: 1px solid var(--aero-sky-300); color: var(--aero-sky-700);">
                    📋 Copy Headers to Clipboard
                </button>
            </div>
            <div style="display: flex; gap: 0.35rem; flex-wrap: wrap; margin-bottom: 0.35rem;">
                ${schema.headers.map((h, i) => `<span style="background: #fff; padding: 2px 7px; border-radius: 4px; font-size: 0.7rem; font-family: var(--font-mono); border: 1px solid #bae6fd; color: #0369a1; font-weight: 600;">[Col ${i+1}] ${h}</span>`).join("")}
            </div>
            <p style="font-size: 0.72rem; color: var(--text-muted); margin: 0;">💡 <strong>Note:</strong> ${schema.notes} (Copy entire rows from Excel).</p>
        `;

        const btnCopy = document.getElementById("btn-copy-excel-headers");
        if (btnCopy) {
            btnCopy.addEventListener("click", () => {
                const headerTsv = schema.headers.join("\t");
                navigator.clipboard.writeText(headerTsv).then(() => {
                    Toast.success(`Copied ${schema.headers.length} headers! Paste into row 1 of Excel.`);
                }).catch(() => {
                    Toast.info(headerTsv);
                });
            });
        }
    }

    bindEvents() {
        if (this.dom.categorySelect) {
            this.dom.categorySelect.addEventListener("change", (e) => {
                this.activeCategory = e.target.value;
                this.updateGuideUI();
                this.parsePastedText();
            });
        }

        if (this.dom.textarea) {
            this.dom.textarea.addEventListener("input", () => this.parsePastedText());
        }

        // 1. Back button in footer
        if (this.dom.btnClose) {
            this.dom.btnClose.addEventListener("click", () => this.close());
        }

        // 2. Close 'X' icon in top-right
        if (this.dom.btnCloseIcon) {
            this.dom.btnCloseIcon.addEventListener("click", () => this.close());
        }

        // 3. Click backdrop outside modal dialog
        if (this.dom.modal) {
            this.dom.modal.addEventListener("click", (e) => {
                if (e.target === this.dom.modal) this.close();
            });
        }

        // 4. Press Escape key
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.isOpen()) {
                this.close();
            }
        });

        if (this.dom.btnCommit) {
            this.dom.btnCommit.addEventListener("click", () => this.commitToCloud());
        }
    }

    isOpen() {
        if (!this.dom.modal) return false;
        return !this.dom.modal.classList.contains("hidden") && this.dom.modal.style.display !== "none";
    }

    open(category = "sampling") {
        this.activeCategory = category;
        if (this.dom.categorySelect) this.dom.categorySelect.value = category;
        this.updateGuideUI();
        if (this.dom.modal) {
            this.dom.modal.classList.remove("hidden");
            this.dom.modal.style.display = "flex";
        }
        if (this.dom.textarea) {
            this.dom.textarea.value = "";
            this.dom.textarea.focus();
        }
        this.parsedRows = [];
        this.renderPreview();
    }

    close() {
        if (this.dom.modal) {
            this.dom.modal.classList.add("hidden");
            this.dom.modal.style.display = "none";
        }
    }

    parsePastedText() {
        const raw = (this.dom.textarea?.value || "").trim();
        if (!raw) {
            this.parsedRows = [];
            this.renderPreview();
            return;
        }

        const lines = raw.split(/\r?\n/).filter(line => line.trim().length > 0);
        const schema = EXCEL_SCHEMAS[this.activeCategory];
        const parsed = [];

        lines.forEach((line, index) => {
            const cols = line.split(/\t/).map(c => c.trim());
            // Skip header row if user copied headers
            if (index === 0 && (cols[0].toLowerCase().includes("date") || cols[0].toLowerCase().includes("tanggal"))) {
                return;
            }

            if (cols.length > 0 && cols[0] !== "") {
                parsed.push(cols);
            }
        });

        this.parsedRows = parsed;
        this.renderPreview();
    }

    renderPreview() {
        const schema = EXCEL_SCHEMAS[this.activeCategory];
        if (this.dom.parsedCount) {
            this.dom.parsedCount.textContent = `${this.parsedRows.length} rows ready`;
        }

        if (!this.dom.thead || !this.dom.tbody) return;

        // Render Thead
        this.dom.thead.innerHTML = `<tr>${schema.headers.map(h => `<th>${h}</th>`).join("")}<th>Status</th></tr>`;

        // Render Tbody
        if (this.parsedRows.length === 0) {
            this.dom.tbody.innerHTML = `<tr><td colspan="${schema.headers.length + 1}" class="text-center text-muted" style="padding: 1.5rem;">Paste rows from Excel above to preview columns.</td></tr>`;
            return;
        }

        this.dom.tbody.innerHTML = this.parsedRows.map((cols, idx) => {
            const hasDate = cols[0] && cols[0].length >= 8;
            const valid = hasDate;
            const cells = schema.headers.map((_, colIdx) => `<td>${cols[colIdx] || "—"}</td>`).join("");
            const statusCell = valid 
                ? `<td><span class="status-badge status-production">Valid</span></td>`
                : `<td><span class="status-badge status-close" title="Missing or invalid date">Check</span></td>`;

            return `<tr>${cells}${statusCell}</tr>`;
        }).join("");
    }

    async commitToCloud() {
        if (!appState.currentPondIndex) {
            Toast.error("Please select a pond cycle first.");
            return;
        }

        if (this.parsedRows.length === 0) {
            Toast.error("No valid rows to commit. Paste data from Excel first.");
            return;
        }

        const pondIndex = appState.currentPondIndex;
        const schema = EXCEL_SCHEMAS[this.activeCategory];

        try {
            appState.setLoading(true);
            Toast.info(`Syncing ${this.parsedRows.length} rows to Supabase...`);

            if (this.activeCategory === "sampling") {
                const records = this.parsedRows.map(cols => ({
                    pond_index: pondIndex,
                    smpl_date: cols[0],
                    smpl_doc: parseInt(cols[1], 10) || null,
                    smpl_abw: parseFloat(cols[2]) || null,
                    smpl_surv: parseFloat(cols[3]) || null,
                    smpl_bms: parseFloat(cols[4]) || null,
                    smpl_tfed: parseFloat(cols[5]) || null
                }));

                await SamplingRepository.insertBatch(records);
            } else if (this.activeCategory === "feed") {
                const records = this.parsedRows.map(cols => ({
                    pond_index: pondIndex,
                    log_date: cols[0],
                    shift: cols[1] || "Full Day",
                    feed_kg: parseFloat(cols[2]) || 0,
                    feed_tray_remnant_pct: parseInt(cols[3], 10) || 0,
                    water_level_cm: parseInt(cols[4], 10) || null,
                    water_colour: cols[5] || "Healthy Green",
                    mortality_count: parseInt(cols[6], 10) || 0,
                    remarks: cols[7] || null
                }));

                await FeedRepository.insertBatch(records);
            }

            Toast.success(`Successfully uploaded ${this.parsedRows.length} records!`);
            this.close();

            if (this.onImportSuccess) {
                this.onImportSuccess(this.activeCategory, pondIndex);
            }
        } catch (err) {
            console.error("Excel import commit error:", err);
            Toast.error(`Upload failed: ${err.message}`);
        } finally {
            appState.setLoading(false);
        }
    }
}
