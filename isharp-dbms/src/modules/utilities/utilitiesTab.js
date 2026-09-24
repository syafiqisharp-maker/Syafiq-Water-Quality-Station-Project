/**
 * iSHARP DBMS 2.0 — Utilities & IoT Tab Module (Tab 9)
 * IoT WQS telemetry nodes, autofeeders, and equipment calibrations.
 */

import { appState } from "../../state/appState.js";
import { hasPermission, PERMISSIONS } from "../../config/permissions.js";

export class UtilitiesTab {
    constructor() {
        this.dom = {
            tabPane: document.getElementById("tab-utilities")
        };

        appState.subscribe("pondChanged", (pond) => this.render(pond));
        appState.subscribe("roleChanged", () => this.applyRolePermissions());
    }

    render(pond) {
        if (!pond) return;
        this.applyRolePermissions();
    }

    applyRolePermissions() {
        const canEdit = hasPermission(appState.userRole, PERMISSIONS.EDIT_WQS_CALIBRATION);
        if (!this.dom.tabPane) return;

        const inputs = this.dom.tabPane.querySelectorAll("input, select, textarea");
        inputs.forEach(inp => {
            inp.disabled = !canEdit;
            inp.style.opacity = canEdit ? "1" : "0.75";
        });
    }
}
