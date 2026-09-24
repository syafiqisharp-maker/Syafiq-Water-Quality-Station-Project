/**
 * iSHARP DBMS 2.0 — Master Tab Module (Tab 1)
 * Cycle management, operational milestones, aerator configuration, and snapshot KPIs.
 */

import { appState } from "../../state/appState.js";
import { calculateTotalActiveHP, calculateAerationDensity } from "../../domain/aeration.js";
import { InventoryRepository } from "../../infrastructure/repositories/inventoryRepository.js";
import { PondRepository } from "../../infrastructure/repositories/pondRepository.js";
import { hasPermission, PERMISSIONS } from "../../config/permissions.js";
import { Toast } from "../../components/Toast.js";

export class MasterTab {
    constructor() {
        this.dom = {
            // Milestone Inputs
            inputDateCycle: document.getElementById("input-date-cycle"),
            inputDateCleaning: document.getElementById("input-date-cleaning"),
            inputDateRepair: document.getElementById("input-date-repair"),
            inputDateFilling: document.getElementById("input-date-filling"),
            inputDateCulture: document.getElementById("input-date-culture"),
            inputDateBabyBox: document.getElementById("input-date-babybox"),
            inputDateQaqc: document.getElementById("input-date-qaqc"),
            inputDateReady: document.getElementById("input-date-ready"),
            inputDatePlanStock: document.getElementById("input-date-plan-stock"),
            inputIdleDays: document.getElementById("input-idle-days"),
            inputIdleStatus: document.getElementById("input-idle-status"),
            inputWaterType: document.getElementById("input-water-type"),

            // Aerator Steppers
            aerator1hp: document.getElementById("aerator-1hp-units"),
            aerator2hp: document.getElementById("aerator-2hp-units"),
            aerator4hp: document.getElementById("aerator-4hp-units"),
            summaryTotalActiveHp: document.getElementById("summary-total-active-hp"),
            badgeTotalHp: document.getElementById("badge-total-hp"),

            // Snapshots
            snapStockedPcs: document.getElementById("snap-stocked-pcs"),
            snapLatestAbw: document.getElementById("snap-latest-abw"),
            snapTotalFeed: document.getElementById("snap-total-feed"),
            snapTotalHarvest: document.getElementById("snap-total-harvest")
        };

        this.bindEvents();
        appState.subscribe("pondChanged", (pond) => this.render(pond));
        appState.subscribe("roleChanged", () => this.applyRolePermissions());
    }

    bindEvents() {
        // Real-time aerator HP recalculation
        [this.dom.aerator1hp, this.dom.aerator2hp, this.dom.aerator4hp].forEach(input => {
            if (input) {
                input.addEventListener("input", () => this.recalculateAeratorHP());
            }
        });
    }

    async render(pond) {
        if (!pond) return;

        // Populate Milestone Dates
        if (this.dom.inputDateCycle) this.dom.inputDateCycle.value = pond.date_cycle || "";
        if (this.dom.inputDateCleaning) this.dom.inputDateCleaning.value = pond.date_cleaning || "";
        if (this.dom.inputDateRepair) this.dom.inputDateRepair.value = pond.date_repair || "";
        if (this.dom.inputDateFilling) this.dom.inputDateFilling.value = pond.date_filling || "";
        if (this.dom.inputDateCulture) this.dom.inputDateCulture.value = pond.date_culture || "";
        if (this.dom.inputDateBabyBox) this.dom.inputDateBabyBox.value = pond.date_babybox || "";
        if (this.dom.inputDateQaqc) this.dom.inputDateQaqc.value = pond.date_qaqc || "";
        if (this.dom.inputDateReady) this.dom.inputDateReady.value = pond.date_ready || "";
        if (this.dom.inputDatePlanStock) this.dom.inputDatePlanStock.value = pond.date_plan_stock || "";
        if (this.dom.inputIdleDays) this.dom.inputIdleDays.value = pond.idle_days || "0";
        if (this.dom.inputIdleStatus) this.dom.inputIdleStatus.value = pond.idle_status || "";
        if (this.dom.inputWaterType) this.dom.inputWaterType.value = pond.water_type || "Marine (Saltwater)";

        // Stocked Pieces Snapshot
        if (this.dom.snapStockedPcs) {
            const pcs = parseInt(pond.stck_netto, 10);
            this.dom.snapStockedPcs.textContent = !isNaN(pcs) && pcs > 0 ? `${pcs.toLocaleString()} pcs` : "—";
        }

        // Fetch Aerator Inventory from DB
        await this.loadAerators(pond.pond_index, pond.area);

        // Apply RBAC
        this.applyRolePermissions();
    }

    async loadAerators(pondIndex, pondArea) {
        let u1 = 0, u2 = 0, u4 = 0;
        try {
            const items = await InventoryRepository.getAerators(pondIndex);
            if (items && items.length > 0) {
                items.forEach(item => {
                    const hp = parseFloat(item.hp_rating);
                    if (hp === 1.0) u1 = item.total_units || 0;
                    if (hp === 2.0) u2 = item.total_units || 0;
                    if (hp === 4.0) u4 = item.total_units || 0;
                });
            } else if (appState.currentPond) {
                // Fallback to legacy fields if present
                u1 = parseInt(appState.currentPond.aerator_1hp || 0, 10);
                u2 = parseInt(appState.currentPond.aerator_2hp || 0, 10);
            }
        } catch (err) {
            console.warn("Could not load aerator inventory:", err);
        }

        if (this.dom.aerator1hp) this.dom.aerator1hp.value = u1;
        if (this.dom.aerator2hp) this.dom.aerator2hp.value = u2;
        if (this.dom.aerator4hp) this.dom.aerator4hp.value = u4;

        this.recalculateAeratorHP(pondArea);
    }

    recalculateAeratorHP(pondArea) {
        const u1 = parseInt(this.dom.aerator1hp?.value || 0, 10);
        const u2 = parseInt(this.dom.aerator2hp?.value || 0, 10);
        const u4 = parseInt(this.dom.aerator4hp?.value || 0, 10);

        const totalHP = calculateTotalActiveHP(u1, u2, u4);
        const area = pondArea || (appState.currentPond ? appState.currentPond.area : 0);
        const density = calculateAerationDensity(totalHP, area);

        if (this.dom.summaryTotalActiveHp) {
            this.dom.summaryTotalActiveHp.textContent = `${totalHP.toFixed(1)} HP (${density} HP/Ha)`;
        }
        if (this.dom.badgeTotalHp) {
            this.dom.badgeTotalHp.textContent = `${totalHP.toFixed(1)} HP`;
        }
    }

    async saveData() {
        const pondIndex = appState.currentPondIndex;
        if (!pondIndex) return;

        const role = appState.userRole;
        const canEditMaster = hasPermission(role, PERMISSIONS.EDIT_MASTER_CYCLE);
        const canEditAerators = hasPermission(role, PERMISSIONS.EDIT_AERATORS);

        if (!canEditMaster && !canEditAerators) {
            Toast.error("Your current role does not have permission to modify Master cycle records.");
            return;
        }

        try {
            appState.setLoading(true);
            Toast.info("Saving Master cycle changes...");

            // 1. Save Master Dates if permitted
            if (canEditMaster) {
                const updates = {
                    date_cycle: this.dom.inputDateCycle?.value || null,
                    date_cleaning: this.dom.inputDateCleaning?.value || null,
                    date_repair: this.dom.inputDateRepair?.value || null,
                    date_filling: this.dom.inputDateFilling?.value || null,
                    date_culture: this.dom.inputDateCulture?.value || null,
                    date_babybox: this.dom.inputDateBabyBox?.value || null,
                    date_qaqc: this.dom.inputDateQaqc?.value || null,
                    date_ready: this.dom.inputDateReady?.value || null,
                    date_plan_stock: this.dom.inputDatePlanStock?.value || null,
                    idle_days: parseInt(this.dom.inputIdleDays?.value || 0, 10),
                    idle_status: this.dom.inputIdleStatus?.value || null,
                    water_type: this.dom.inputWaterType?.value || null
                };
                await PondRepository.updateCycle(pondIndex, updates);
            }

            // 2. Save Aerator inventory
            if (canEditAerators) {
                const aeratorPayload = [
                    { hp_rating: 1.0, total_units: parseInt(this.dom.aerator1hp?.value || 0, 10) },
                    { hp_rating: 2.0, total_units: parseInt(this.dom.aerator2hp?.value || 0, 10) },
                    { hp_rating: 4.0, total_units: parseInt(this.dom.aerator4hp?.value || 0, 10) }
                ];
                await InventoryRepository.syncAeratorInventory(pondIndex, aeratorPayload);
            }

            Toast.success("Master cycle data saved successfully!");
        } catch (err) {
            console.error("Save Master error:", err);
            Toast.error(`Save failed: ${err.message}`);
        } finally {
            appState.setLoading(false);
        }
    }

    applyRolePermissions() {
        const canEdit = hasPermission(appState.userRole, PERMISSIONS.EDIT_MASTER_CYCLE);
        const inputs = [
            this.dom.inputDateCycle, this.dom.inputDateCleaning, this.dom.inputDateRepair,
            this.dom.inputDateFilling, this.dom.inputDateCulture, this.dom.inputDateBabyBox,
            this.dom.inputDateQaqc, this.dom.inputDateReady, this.dom.inputDatePlanStock,
            this.dom.inputIdleDays, this.dom.inputIdleStatus, this.dom.inputWaterType
        ];

        inputs.forEach(inp => {
            if (inp) {
                inp.disabled = !canEdit;
                inp.style.opacity = canEdit ? "1" : "0.7";
            }
        });
    }
}
