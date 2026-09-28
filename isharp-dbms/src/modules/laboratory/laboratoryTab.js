/**
 * iSHARP DBMS 2.0 — Laboratory Tab Module (Tab 2)
 * Water chemistry telemetry, microbiology, and PCR pathogen records.
 */

import { appState } from "../../state/appState.js";
import { LabRepository } from "../../infrastructure/repositories/labRepository.js";
import { hasPermission, PERMISSIONS } from "../../config/permissions.js";

export class LaboratoryTab {
    constructor(onOpenExcel) {
        this.onOpenExcel = onOpenExcel;
        this.dom = {
            tabPane: document.getElementById("tab-laboratory"),
            tbodyIssues: document.getElementById("tbody-issues"),
            btnAddLab: document.getElementById("btn-add-lab-record")
        };

        this.bindEvents();
        appState.subscribe("pondChanged", (pond) => this.render(pond));
        appState.subscribe("roleChanged", () => this.applyRolePermissions());
    }

    bindEvents() {
        if (this.dom.btnAddLab) {
            this.dom.btnAddLab.addEventListener("click", () => {
                if (this.onOpenExcel) this.onOpenExcel("issues");
            });
        }
    }

    async render(pond) {
        if (!pond || !this.dom.tabPane) return;
        this.applyRolePermissions();
        await this.loadIssues(pond.pond_index);
    }

    async loadIssues(pondIndex) {
        if (!this.dom.tbodyIssues) return;
        if (!pondIndex) {
            this.dom.tbodyIssues.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding: 1.5rem;">Select a pond to view laboratory records.</td></tr>`;
            return;
        }

        try {
            const data = await LabRepository.getIssuesByPond(pondIndex);

            if (!data || data.length === 0) {
                this.dom.tbodyIssues.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding: 1.5rem;">No pathology issues recorded for this cycle (Pond is clean / negative).</td></tr>`;
                return;
            }

            this.dom.tbodyIssues.innerHTML = data.map(r => {
                const isRed = (r.issue_flag || "").toUpperCase() === "RED";
                const isGreen = (r.issue_flag || "").toUpperCase() === "GREEN";
                const flagClass = isRed ? "status-close text-danger font-bold" : isGreen ? "status-production font-bold" : "status-idle";

                return `
                    <tr>
                        <td class="font-mono">${r.issue_date || '—'}</td>
                        <td>${r.issue_category || 'PATHOLOGY'}</td>
                        <td><strong>${r.issue_status || '—'}</strong></td>
                        <td>${r.issue_test || '—'}</td>
                        <td><span class="status-badge ${flagClass}">${r.issue_flag || 'OK'}</span></td>
                        <td>${r.issue_grade || 'G0'}</td>
                        <td class="${isRed ? 'text-danger font-bold' : ''}">${r.issue_note || 'NEGATIVE'}</td>
                        <td>${r.remarks || '—'}</td>
                    </tr>
                `;
            }).join("");
        } catch (err) {
            console.error("Failed to load laboratory issues:", err);
            this.dom.tbodyIssues.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Error loading issues: ${err.message}</td></tr>`;
        }
    }

    applyRolePermissions() {
        const canEdit = hasPermission(appState.userRole, PERMISSIONS.EDIT_LAB_RECORDS);
        if (!this.dom.tabPane) return;

        const inputs = this.dom.tabPane.querySelectorAll("input, select, textarea");
        inputs.forEach(inp => {
            inp.disabled = !canEdit;
            inp.style.opacity = canEdit ? "1" : "0.75";
        });
    }
}
