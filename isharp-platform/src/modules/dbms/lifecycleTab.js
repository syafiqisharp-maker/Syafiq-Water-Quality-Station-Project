/**
 * iSHARP DBMS 2.0 — Pond & Cycle Lifecycle Tab Module (Tab 8)
 * Single Source of Truth for Cycle Status, Termination (Rollover vs Close Only),
 * Revive Reversals, Custom Cycle Creation, and Physical Pond Cycle Registry.
 */

import { appState } from "../../state/appState.js";
import { PondRepository } from "../../infrastructure/repositories/pondRepository.js";
import { isCycleClosed, parsePondIndex } from "../../domain/rollover.js";
import { Toast } from "../../components/Toast.js";

export class LifecycleTab {
    constructor(onSelectPond) {
        this.onSelectPond = onSelectPond;
        this.distinctPonds = [];
        this.selectedPondHistory = [];

        this.dom = {
            // Current Cycle Status Widget
            currentIndex: document.getElementById("lifecycle-current-index"),
            currentPond: document.getElementById("lifecycle-current-pond"),
            statusBadge: document.getElementById("lifecycle-status-badge"),
            activeBadge: document.getElementById("lifecycle-active-badge"),
            docVal: document.getElementById("lifecycle-doc-val"),
            stockDate: document.getElementById("lifecycle-stock-date"),
            closeDate: document.getElementById("lifecycle-close-date"),
            areaVal: document.getElementById("lifecycle-area-val"),
            
            // Action Buttons
            btnTerminateRollover: document.getElementById("btn-lifecycle-terminate-rollover"),
            btnTerminateOnly: document.getElementById("btn-lifecycle-terminate-only"),
            btnReviveAction: document.getElementById("btn-lifecycle-revive-action"),
            calloutStatusTitle: document.getElementById("lifecycle-callout-title"),
            calloutStatusDesc: document.getElementById("lifecycle-callout-desc"),

            // Termination Modal
            modalTerminate: document.getElementById("modal-terminate-options"),
            terminateModalPondIndex: document.getElementById("terminate-modal-pond-index"),
            terminateDateInput: document.getElementById("terminate-date-input"),
            terminateStatusSelect: document.getElementById("terminate-status-select"),
            radioRolloverYes: document.getElementById("radio-rollover-yes"),
            radioRolloverNo: document.getElementById("radio-rollover-no"),
            btnConfirmTerminate: document.getElementById("btn-confirm-terminate-execution"),
            btnCancelTerminate: document.getElementById("btn-cancel-terminate-modal"),
            btnCloseTerminateIcon: document.getElementById("btn-close-terminate-icon"),

            // Revive Modal
            modalRevive: document.getElementById("modal-revive-cycle"),
            reviveModalPondIndex: document.getElementById("revive-modal-pond-index"),
            reviveModalPondName: document.getElementById("revive-modal-pond-name"),
            reviveModalCycleCode: document.getElementById("revive-modal-cycle-code"),
            reviveModalNextCycle: document.getElementById("revive-modal-next-cycle"),
            btnConfirmReviveDelete: document.getElementById("btn-confirm-revive-delete"),
            btnConfirmReviveKeep: document.getElementById("btn-confirm-revive-keep"),
            btnCloseReviveModal: document.getElementById("btn-close-revive-modal"),
            btnCloseReviveModalIcon: document.getElementById("btn-close-revive-modal-icon"),

            // Custom Cycle Registration Form
            selectCreatePond: document.getElementById("select-create-pond"),
            inputCustomPond: document.getElementById("input-create-custom-pond"),
            customPondWrap: document.getElementById("wrap-create-custom-pond"),
            inputCycleNo: document.getElementById("input-create-cycle-no"),
            hintCycleSuggestion: document.getElementById("hint-create-cycle-suggestion"),
            selectCreateStatus: document.getElementById("select-create-status"),
            inputCreateArea: document.getElementById("input-create-area"),
            inputCreateStockDate: document.getElementById("input-create-stock-date"),
            btnSubmitCreateCycle: document.getElementById("btn-submit-create-cycle"),

            // Cycle Registry Table
            tableRegistry: document.getElementById("table-cycle-registry"),
            tbodyRegistry: document.getElementById("tbody-cycle-registry"),
            registryPondTitle: document.getElementById("registry-pond-title")
        };

        this.bindEvents();
        appState.subscribe("pondChanged", (pond) => this.render(pond));
        this.initPondDropdown();
    }

    bindEvents() {
        // Termination modal launchers
        if (this.dom.btnTerminateRollover) {
            this.dom.btnTerminateRollover.addEventListener("click", () => this.openTerminateModal(true));
        }

        if (this.dom.btnTerminateOnly) {
            this.dom.btnTerminateOnly.addEventListener("click", () => this.openTerminateModal(false));
        }

        if (this.dom.btnReviveAction) {
            this.dom.btnReviveAction.addEventListener("click", () => this.openReviveModal());
        }

        // Termination modal actions
        if (this.dom.btnConfirmTerminate) {
            this.dom.btnConfirmTerminate.addEventListener("click", () => this.executeTermination());
        }

        if (this.dom.btnCancelTerminate) {
            this.dom.btnCancelTerminate.addEventListener("click", () => this.closeTerminateModal());
        }

        if (this.dom.btnCloseTerminateIcon) {
            this.dom.btnCloseTerminateIcon.addEventListener("click", () => this.closeTerminateModal());
        }

        // Revive modal actions
        if (this.dom.btnConfirmReviveDelete) {
            this.dom.btnConfirmReviveDelete.addEventListener("click", () => this.executeRevive(true));
        }

        if (this.dom.btnConfirmReviveKeep) {
            this.dom.btnConfirmReviveKeep.addEventListener("click", () => this.executeRevive(false));
        }

        if (this.dom.btnCloseReviveModal) {
            this.dom.btnCloseReviveModal.addEventListener("click", () => this.closeReviveModal());
        }

        if (this.dom.btnCloseReviveModalIcon) {
            this.dom.btnCloseReviveModalIcon.addEventListener("click", () => this.closeReviveModal());
        }

        // Custom Cycle Creation
        if (this.dom.selectCreatePond) {
            this.dom.selectCreatePond.addEventListener("change", () => this.onSelectPondChange());
        }

        if (this.dom.btnSubmitCreateCycle) {
            this.dom.btnSubmitCreateCycle.addEventListener("click", () => this.executeCreateCustomCycle());
        }

        // Close modals on Esc
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                this.closeTerminateModal();
                this.closeReviveModal();
            }
        });
    }

    async initPondDropdown() {
        if (!this.dom.selectCreatePond) return;
        try {
            this.distinctPonds = await PondRepository.getDistinctPonds();
            const currentPond = appState.currentPond?.pond || "";

            this.dom.selectCreatePond.innerHTML = `
                <option value="">— Select Physical Pond —</option>
                ${this.distinctPonds.map(p => `
                    <option value="${p.pond}" ${p.pond === currentPond ? "selected" : ""}>
                        Pond ${p.pond} (Mod ${p.modl || "—"}, ${p.area || 0.50} ha)
                    </option>
                `).join("")}
                <option value="__CUSTOM__">➕ Enter New Pond Code...</option>
            `;

            this.onSelectPondChange();
        } catch (err) {
            console.error("Failed to load distinct ponds:", err);
        }
    }

    async onSelectPondChange() {
        if (!this.dom.selectCreatePond) return;
        const val = this.dom.selectCreatePond.value;

        if (val === "__CUSTOM__") {
            if (this.dom.customPondWrap) this.dom.customPondWrap.style.display = "block";
            if (this.dom.hintCycleSuggestion) this.dom.hintCycleSuggestion.textContent = "New pond: cycle will default to 01.";
            if (this.dom.inputCycleNo) this.dom.inputCycleNo.value = 1;
            return;
        }

        if (this.dom.customPondWrap) this.dom.customPondWrap.style.display = "none";

        if (!val) {
            if (this.dom.hintCycleSuggestion) this.dom.hintCycleSuggestion.textContent = "Select a pond above to see suggested cycle.";
            return;
        }

        // Fetch history of selected pond to find highest cycle
        try {
            const history = await PondRepository.getCycleHistory(val);
            let maxCycle = 0;
            history.forEach(h => {
                const parsed = parsePondIndex(h.pond_index);
                const c = parseInt(h.cycle_no || parsed.cycle, 10);
                if (c > maxCycle) maxCycle = c;
            });

            const next = maxCycle + 1;
            if (this.dom.inputCycleNo) this.dom.inputCycleNo.value = next;
            if (this.dom.hintCycleSuggestion) {
                this.dom.hintCycleSuggestion.innerHTML = `Highest recorded cycle for <strong>${val}</strong> is <strong>C${maxCycle}</strong>. Suggested: <span class="text-success font-bold">C${next}</span>`;
            }
        } catch (err) {
            console.warn("Could not calculate next cycle hint:", err);
        }
    }

    async render(pond) {
        if (!pond) return;

        const isClosed = isCycleClosed(pond);
        const status = pond.pond_status || (isClosed ? "CLOSE" : "PRODUCTION");
        const active = pond.pond_active || (isClosed ? "iN ACTiVE" : "ACTiVE");

        // 1. Populate Status Widget
        if (this.dom.currentIndex) this.dom.currentIndex.textContent = pond.pond_index || "—";
        if (this.dom.currentPond) this.dom.currentPond.textContent = pond.pond || "—";
        if (this.dom.docVal) this.dom.docVal.textContent = pond.doc !== undefined ? `${pond.doc} Days` : "—";
        if (this.dom.stockDate) this.dom.stockDate.textContent = pond.stck_date || "—";
        if (this.dom.closeDate) this.dom.closeDate.textContent = pond.date_close || (isClosed ? "Closed" : "Active (Unclosed)");
        if (this.dom.areaVal) this.dom.areaVal.textContent = `${parseFloat(pond.area || 0.50).toFixed(2)} ha`;

        // Badges
        if (this.dom.statusBadge) {
            this.dom.statusBadge.textContent = status;
            this.dom.statusBadge.className = `status-badge ${status === "PRODUCTION" ? "status-production" : status === "iDLE" ? "status-idle" : "status-close"}`;
        }
        if (this.dom.activeBadge) {
            this.dom.activeBadge.textContent = active;
            this.dom.activeBadge.className = `status-badge ${active.toUpperCase().includes("IN") ? "status-close" : "status-production"}`;
        }

        // Toggle Actions Display
        if (isClosed) {
            if (this.dom.btnTerminateRollover) this.dom.btnTerminateRollover.style.display = "none";
            if (this.dom.btnTerminateOnly) this.dom.btnTerminateOnly.style.display = "none";
            if (this.dom.btnReviveAction) this.dom.btnReviveAction.style.display = "inline-flex";

            if (this.dom.calloutStatusTitle) this.dom.calloutStatusTitle.textContent = "Pond Cycle Closed & Harvested";
            if (this.dom.calloutStatusDesc) {
                this.dom.calloutStatusDesc.innerHTML = `Cycle <strong>${pond.pond_index}</strong> is finalized. Click <strong>Revive Back Cycle</strong> if this pond was closed prematurely.`;
            }
        } else {
            if (this.dom.btnTerminateRollover) this.dom.btnTerminateRollover.style.display = "inline-flex";
            if (this.dom.btnTerminateOnly) this.dom.btnTerminateOnly.style.display = "inline-flex";
            if (this.dom.btnReviveAction) this.dom.btnReviveAction.style.display = "none";

            if (this.dom.calloutStatusTitle) this.dom.calloutStatusTitle.textContent = "Cycle Termination & Harvesting Control";
            if (this.dom.calloutStatusDesc) {
                this.dom.calloutStatusDesc.innerHTML = `Choose <strong>Terminate & Rollover</strong> to auto-spawn the next cycle in IDLE, or <strong>Terminate Only</strong> to close the pond without spawning a new cycle.`;
            }
        }

        // 2. Load Cycle Registry for Physical Pond
        await this.loadCycleRegistry(pond.pond);
    }

    async loadCycleRegistry(physicalPond) {
        if (!physicalPond) return;
        if (this.dom.registryPondTitle) {
            this.dom.registryPondTitle.textContent = `Cycle Registry & History — Pond ${physicalPond}`;
        }

        if (!this.dom.tbodyRegistry) return;

        try {
            this.selectedPondHistory = await PondRepository.getCycleHistory(physicalPond);

            if (!this.selectedPondHistory || this.selectedPondHistory.length === 0) {
                this.dom.tbodyRegistry.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 1.5rem;">No historical cycles recorded for pond ${physicalPond}.</td></tr>`;
                return;
            }

            const currentIdx = appState.currentPondIndex;

            this.dom.tbodyRegistry.innerHTML = this.selectedPondHistory.map(item => {
                const isSelected = item.pond_index === currentIdx;
                const parsed = parsePondIndex(item.pond_index);
                const isClosed = isCycleClosed(item);
                const isIdle = (item.status || "").toUpperCase() === "IDLE";
                const statusBadgeClass = item.status === "PRODUCTION" ? "status-production" : isIdle ? "status-idle" : "status-close";

                return `
                    <tr class="${isSelected ? "active-row" : ""}">
                        <td class="font-mono font-bold" style="color: var(--aero-sky-600);">C${item.cycle_no || parsed.cycle}</td>
                        <td class="font-mono">${item.pond_index}</td>
                        <td><span class="status-badge ${statusBadgeClass}">${item.status || "—"}</span></td>
                        <td><span class="status-badge ${isClosed ? "status-close" : "status-production"}">${item.active || "—"}</span></td>
                        <td class="font-mono">${item.stck_date || "—"}</td>
                        <td class="font-mono">${item.date_close || (isClosed ? "Closed" : "—")}</td>
                        <td>
                            <div class="btn-group" style="gap: 0.35rem; display: flex; align-items: center;">
                                ${!isSelected ? `
                                    <button class="btn-action btn-secondary btn-sm" type="button" data-switch-index="${item.pond_index}" style="padding: 0.2rem 0.55rem; font-size: 0.75rem;">
                                        Switch
                                    </button>
                                ` : `<span class="badge-current-cycle" style="font-size: 0.72rem; color: #0284c7; font-weight: 700; background: #e0f2fe; padding: 0.2rem 0.5rem; border-radius: 4px;">Current</span>`}
                                ${isIdle ? `
                                    <button class="btn-action btn-danger btn-sm" type="button" data-delete-index="${item.pond_index}" title="Safely remove unused idle cycle" style="padding: 0.2rem 0.45rem; font-size: 0.75rem; background: #fee2e2; color: #dc2626; border-color: #fca5a5;">
                                        🗑️
                                    </button>
                                ` : ""}
                            </div>
                        </td>
                    </tr>
                `;
            }).join("");

            // Wire switch and delete buttons
            this.dom.tbodyRegistry.querySelectorAll("[data-switch-index]").forEach(btn => {
                btn.addEventListener("click", () => {
                    const targetIdx = btn.getAttribute("data-switch-index");
                    if (targetIdx && this.onSelectPond) {
                        this.onSelectPond(targetIdx);
                    }
                });
            });

            this.dom.tbodyRegistry.querySelectorAll("[data-delete-index]").forEach(btn => {
                btn.addEventListener("click", () => {
                    const targetIdx = btn.getAttribute("data-delete-index");
                    if (targetIdx) this.confirmDeleteIdleCycle(targetIdx);
                });
            });

        } catch (err) {
            console.error("Error loading cycle registry:", err);
        }
    }

    openTerminateModal(defaultCreateNext = true) {
        const pond = appState.currentPond;
        if (!pond) {
            Toast.error("No active pond selected.");
            return;
        }

        if (isCycleClosed(pond)) {
            Toast.warning("This cycle is already closed.");
            return;
        }

        if (this.dom.terminateModalPondIndex) {
            this.dom.terminateModalPondIndex.textContent = pond.pond_index;
        }
        if (this.dom.terminateDateInput) {
            this.dom.terminateDateInput.value = new Date().toISOString().split("T")[0];
        }
        if (this.dom.terminateStatusSelect) {
            this.dom.terminateStatusSelect.value = "NORMAL HARVEST";
        }
        if (defaultCreateNext) {
            if (this.dom.radioRolloverYes) this.dom.radioRolloverYes.checked = true;
        } else {
            if (this.dom.radioRolloverNo) this.dom.radioRolloverNo.checked = true;
        }

        if (this.dom.modalTerminate) {
            this.dom.modalTerminate.classList.remove("hidden");
            this.dom.modalTerminate.style.display = "flex";
        }
    }

    closeTerminateModal() {
        if (this.dom.modalTerminate) {
            this.dom.modalTerminate.classList.add("hidden");
            this.dom.modalTerminate.style.display = "none";
        }
    }

    async executeTermination() {
        const pond = appState.currentPond;
        if (!pond) return;

        const harvestDate = this.dom.terminateDateInput?.value || new Date().toISOString().split("T")[0];
        const finalStatus = this.dom.terminateStatusSelect?.value || "NORMAL HARVEST";
        const createNext = this.dom.radioRolloverYes ? this.dom.radioRolloverYes.checked : true;

        try {
            appState.setLoading(true);
            this.closeTerminateModal();
            Toast.info(`Processing termination for ${pond.pond_index}...`);

            const res = await PondRepository.terminateCycle(pond.pond_index, harvestDate, finalStatus, createNext);

            if (res && res.success) {
                if (res.action === "TERMINATE_EXISTING_NEXT") {
                    Toast.success(`Pond closed! Next cycle ${res.new_pond_index} already existed in IDLE, so duplicate creation was safely skipped.`);
                } else if (res.action === "TERMINATE_ONLY") {
                    Toast.success(`Pond cycle ${pond.pond_index} was closed. No new cycle created.`);
                } else {
                    Toast.success(`Pond cycle closed! Next cycle ${res.new_pond_index} successfully initialized in IDLE.`);
                }

                // Refresh application pond list and reload state
                const allPonds = await PondRepository.getCycles();
                appState.setPonds(allPonds);

                if (createNext && res.new_pond_index) {
                    if (this.onSelectPond) this.onSelectPond(res.new_pond_index);
                } else {
                    if (this.onSelectPond) this.onSelectPond(pond.pond_index);
                }
            } else {
                Toast.error("Failed to terminate cycle. Please verify database connection.");
            }
        } catch (err) {
            console.error("Termination execution error:", err);
            Toast.error(`Termination error: ${err.message}`);
        } finally {
            appState.setLoading(false);
        }
    }

    openReviveModal() {
        const pond = appState.currentPond;
        if (!pond) return;

        const parsed = parsePondIndex(pond.pond_index);

        if (this.dom.reviveModalPondIndex) this.dom.reviveModalPondIndex.textContent = pond.pond_index;
        if (this.dom.reviveModalPondName) this.dom.reviveModalPondName.textContent = `Pond ${pond.pond} (Cycle ${parsed.cycle})`;
        if (this.dom.reviveModalCycleCode) this.dom.reviveModalCycleCode.textContent = pond.pond_index;
        if (this.dom.reviveModalNextCycle) this.dom.reviveModalNextCycle.textContent = parsed.nextIndex;

        if (this.dom.modalRevive) {
            this.dom.modalRevive.classList.remove("hidden");
            this.dom.modalRevive.style.display = "flex";
        }
    }

    closeReviveModal() {
        if (this.dom.modalRevive) {
            this.dom.modalRevive.classList.add("hidden");
            this.dom.modalRevive.style.display = "none";
        }
    }

    async executeRevive(deleteNextCycle) {
        const pond = appState.currentPond;
        if (!pond) return;

        try {
            appState.setLoading(true);
            this.closeReviveModal();
            Toast.info(`Reopening cycle ${pond.pond_index} in Supabase...`);

            const result = await PondRepository.reviveCycle(pond.pond_index, deleteNextCycle);

            if (result && result.success) {
                const deleteMsg = result.next_cycle_deleted 
                    ? ` (Next cycle ${result.next_pond_index} was deleted)`
                    : ` (Next cycle ${result.next_pond_index} kept in IDLE)`;

                Toast.success(`Pond ${result.revived_pond_index} revived to PRODUCTION!${deleteMsg}`);

                // Refresh cache and reload
                const allPonds = await PondRepository.getCycles();
                appState.setPonds(allPonds);
                if (this.onSelectPond) this.onSelectPond(pond.pond_index);
            } else {
                Toast.error("Could not revive cycle.");
            }
        } catch (err) {
            console.error("Revive cycle error:", err);
            Toast.error(`Revive failed: ${err.message}`);
        } finally {
            appState.setLoading(false);
        }
    }

    async executeCreateCustomCycle() {
        const pondSelect = this.dom.selectCreatePond?.value;
        const customPondInput = this.dom.inputCustomPond?.value?.trim();
        const cycleNo = parseInt(this.dom.inputCycleNo?.value, 10);
        const status = this.dom.selectCreateStatus?.value || "IDLE";
        const area = parseFloat(this.dom.inputCreateArea?.value) || 0.50;
        const planDate = this.dom.inputCreateStockDate?.value || null;

        const targetPond = (pondSelect === "__CUSTOM__") ? customPondInput : pondSelect;

        if (!targetPond) {
            Toast.error("Please enter or select a physical pond code.");
            return;
        }

        if (!cycleNo || cycleNo <= 0) {
            Toast.error("Please enter a valid positive cycle number.");
            return;
        }

        try {
            appState.setLoading(true);
            Toast.info(`Initializing cycle C${cycleNo} for Pond ${targetPond}...`);

            const res = await PondRepository.createCustomCycle({
                pond: targetPond,
                cycleNo: cycleNo,
                area: area,
                status: status,
                planStockDate: planDate
            });

            if (res && res.success) {
                Toast.success(`Cycle ${res.pond_index} successfully registered in ${res.status} status!`);

                // Refresh pond list and switch to newly created cycle
                const allPonds = await PondRepository.getCycles();
                appState.setPonds(allPonds);

                if (this.onSelectPond && res.pond_index) {
                    this.onSelectPond(res.pond_index);
                }

                // Refresh dropdown and history
                await this.initPondDropdown();
            } else {
                Toast.error("Could not create cycle. Verify index uniqueness.");
            }
        } catch (err) {
            console.error("Custom cycle creation error:", err);
            Toast.error(`Creation failed: ${err.message}`);
        } finally {
            appState.setLoading(false);
        }
    }

    async confirmDeleteIdleCycle(pondIndex) {
        if (!confirm(`Are you sure you want to delete empty idle cycle [${pondIndex}]?\n\nThis cannot be undone. This operation will be rejected by the database if any operational records exist.`)) {
            return;
        }

        try {
            appState.setLoading(true);
            Toast.info(`Deleting idle cycle ${pondIndex}...`);

            const res = await PondRepository.deleteIdleCycle(pondIndex);
            if (res && res.success) {
                Toast.success(`Idle cycle ${pondIndex} safely deleted.`);

                // Refresh ponds
                const allPonds = await PondRepository.getCycles();
                appState.setPonds(allPonds);

                // If currently viewing the deleted pond, switch back to previous or first available
                if (appState.currentPondIndex === pondIndex) {
                    const fallback = allPonds.find(p => p.pond === appState.currentPond?.pond) || allPonds[0];
                    if (fallback && this.onSelectPond) {
                        this.onSelectPond(fallback.pond_index);
                    }
                } else if (appState.currentPond) {
                    await this.loadCycleRegistry(appState.currentPond.pond);
                }
            } else {
                Toast.error("Could not delete idle cycle.");
            }
        } catch (err) {
            console.error("Delete idle cycle error:", err);
            Toast.error(`Delete rejected: ${err.message}`);
        } finally {
            appState.setLoading(false);
        }
    }
}
