/**
 * iSHARP DBMS 2.0 — App Navbar Component
 * Global pond selector, cycle stepping, role selector, and action buttons.
 */

import { appState } from "../state/appState.js";
import { ROLES, hasPermission, PERMISSIONS, getRoleMeta } from "../config/permissions.js";
import { PondRepository } from "../infrastructure/repositories/pondRepository.js";
import { calculateDOC } from "../domain/biometrics.js";
import { Toast } from "./Toast.js";

export class Navbar {
    constructor(onOpenExcel, onStartNextCycle, onSaveActive) {
        this.onOpenExcel = onOpenExcel;
        this.onStartNextCycle = onStartNextCycle;
        this.onSaveActive = onSaveActive;

        this.dom = {
            selectPond: document.getElementById("select-pond-index"),
            btnPrev: document.getElementById("btn-prev-pond"),
            btnNext: document.getElementById("btn-next-pond"),
            btnRefresh: document.getElementById("btn-refresh-master"),
            btnExcel: document.getElementById("btn-open-excel-modal"),
            btnNewCycle: document.getElementById("btn-action-new-cycle"),
            btnSave: document.getElementById("btn-save-active-tab"),
            selectRole: document.getElementById("select-user-role")
        };

        this.initRoleSelector();
        this.bindEvents();

        // Listen for cycles change to update dropdown
        appState.subscribe("filteredCyclesChanged", (cycles) => this.populatePondDropdown(cycles));
        appState.subscribe("cyclesLoaded", (cycles) => this.populatePondDropdown(cycles));

        // Listen for role change to update button visibility
        appState.subscribe("roleChanged", () => this.applyRolePermissions());
    }

    initRoleSelector() {
        // If role selector doesn't exist in header, inject it seamlessly
        let roleContainer = document.querySelector(".role-badge-container");
        if (!roleContainer) {
            const headerActions = document.querySelector(".header-actions");
            if (headerActions) {
                roleContainer = document.createElement("div");
                roleContainer.className = "role-badge-container";
                roleContainer.innerHTML = `
                    <span class="role-badge-label">Role:</span>
                    <select id="select-user-role" class="role-select" aria-label="Select User Role">
                        <option value="${ROLES.PLANNER}">👑 Planner (100% Edit)</option>
                        <option value="${ROLES.SUPERVISOR}">📋 Supervisor (Inventory)</option>
                        <option value="${ROLES.LAB_TECH}">🔬 Lab Tech (Lab Only)</option>
                        <option value="${ROLES.VIEWER}">👁️ Viewer (Read Only)</option>
                    </select>
                `;
                headerActions.prepend(roleContainer);
                this.dom.selectRole = document.getElementById("select-user-role");
            }
        }

        if (this.dom.selectRole) {
            this.dom.selectRole.value = appState.userRole;
            this.dom.selectRole.addEventListener("change", (e) => {
                const newRole = e.target.value;
                appState.setUserRole(newRole);
                const meta = getRoleMeta(newRole);
                Toast.info(`Switched role to: ${meta.label}`);
            });
        }
    }

    bindEvents() {
        // Pond select change
        if (this.dom.selectPond) {
            this.dom.selectPond.addEventListener("change", (e) => {
                this.selectPondByIndex(e.target.value);
            });
        }

        // Stepper buttons
        if (this.dom.btnPrev) {
            this.dom.btnPrev.addEventListener("click", () => this.stepPond(-1));
        }
        if (this.dom.btnNext) {
            this.dom.btnNext.addEventListener("click", () => this.stepPond(1));
        }

        // Refresh
        if (this.dom.btnRefresh) {
            this.dom.btnRefresh.addEventListener("click", async () => {
                Toast.info("Refreshing pond data from cloud...");
                const cycles = await PondRepository.getCycles();
                appState.setCycles(cycles);
                if (appState.currentPondIndex) {
                    await this.selectPondByIndex(appState.currentPondIndex);
                }
                Toast.success("Cloud data up to date.");
            });
        }

        // Header Action buttons
        if (this.dom.btnExcel && this.onOpenExcel) {
            this.dom.btnExcel.addEventListener("click", () => this.onOpenExcel());
        }
        if (this.dom.btnNewCycle && this.onStartNextCycle) {
            this.dom.btnNewCycle.addEventListener("click", () => this.onStartNextCycle());
        }
        if (this.dom.btnSave && this.onSaveActive) {
            this.dom.btnSave.addEventListener("click", () => this.onSaveActive());
        }
    }

    populatePondDropdown(cycles) {
        if (!this.dom.selectPond) return;

        if (!cycles || cycles.length === 0) {
            this.dom.selectPond.innerHTML = `<option value="" disabled selected>No matching ponds found</option>`;
            return;
        }

        this.dom.selectPond.innerHTML = cycles.map(c => {
            let docLabel = "DOC —";
            if (c.stck_date && String(c.stck_date).trim() !== "") {
                const doc = calculateDOC(c.stck_date, c.date_close);
                docLabel = `DOC ${doc}`;
            }
            return `<option value="${c.pond_index}">Pond ${c.pond} - ${c.pond_index} (${docLabel})</option>`;
        }).join("");

        if (appState.currentPondIndex) {
            this.dom.selectPond.value = String(appState.currentPondIndex);
        } else if (cycles.length > 0) {
            this.selectPondByIndex(cycles[0].pond_index);
        }
    }

    async selectPondByIndex(pondIndex) {
        if (!pondIndex) return;
        try {
            appState.setLoading(true);
            const pondDetails = await PondRepository.getCycleDetails(pondIndex);
            if (pondDetails) {
                appState.setCurrentPond(pondDetails);
                if (this.dom.selectPond) this.dom.selectPond.value = String(pondIndex);
            }
        } catch (err) {
            console.error("Failed to select pond:", err);
            Toast.error(`Could not load pond details: ${err.message}`);
        } finally {
            appState.setLoading(false);
        }
    }

    stepPond(delta) {
        const list = appState.filteredCycles.length > 0 ? appState.filteredCycles : appState.allCycles;
        if (!list || list.length === 0) return;

        const curIdx = list.findIndex(c => String(c.pond_index) === String(appState.currentPondIndex));
        let nextIdx = curIdx + delta;
        if (nextIdx < 0) nextIdx = list.length - 1;
        if (nextIdx >= list.length) nextIdx = 0;

        const nextPond = list[nextIdx];
        if (nextPond) {
            this.selectPondByIndex(nextPond.pond_index);
        }
    }

    applyRolePermissions() {
        const role = appState.userRole;
        const canRollover = hasPermission(role, PERMISSIONS.EXECUTE_ROLLOVER);
        const canSaveMaster = hasPermission(role, PERMISSIONS.EDIT_MASTER_CYCLE);

        if (this.dom.btnNewCycle) {
            this.dom.btnNewCycle.style.opacity = canRollover ? "1" : "0.5";
            this.dom.btnNewCycle.style.pointerEvents = canRollover ? "auto" : "none";
            this.dom.btnNewCycle.title = canRollover ? "Start Next Culture Cycle" : "Requires Planner Role";
        }

        if (this.dom.btnSave) {
            const isMasterTab = appState.activeTab === "tab-master";
            const allowed = isMasterTab ? canSaveMaster : true;
            this.dom.btnSave.style.opacity = allowed ? "1" : "0.5";
            this.dom.btnSave.style.pointerEvents = allowed ? "auto" : "none";
        }
    }
}
