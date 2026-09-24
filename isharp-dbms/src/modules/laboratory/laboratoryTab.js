/**
 * iSHARP DBMS 2.0 — Laboratory Tab Module (Tab 2)
 * Water chemistry telemetry, microbiology, and PCR pathogen records.
 */

import { appState } from "../../state/appState.js";
import { hasPermission, PERMISSIONS } from "../../config/permissions.js";

export class LaboratoryTab {
    constructor() {
        this.dom = {
            tabPane: document.getElementById("tab-laboratory")
        };

        appState.subscribe("pondChanged", (pond) => this.render(pond));
        appState.subscribe("roleChanged", () => this.applyRolePermissions());
    }

    render(pond) {
        if (!pond || !this.dom.tabPane) return;
        this.applyRolePermissions();
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
