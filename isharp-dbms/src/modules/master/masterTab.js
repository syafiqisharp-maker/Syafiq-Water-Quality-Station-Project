/**
 * iSHARP DBMS 2.0 — Master Tab Module (Tab 1)
 * Cycle management, operational milestones, aerator configuration, and snapshot KPIs.
 */

import { appState } from "../../state/appState.js";
import { calculateTotalActiveHP, calculateAerationDensity } from "../../domain/aeration.js";
import { InventoryRepository } from "../../infrastructure/repositories/inventoryRepository.js";
import { PondRepository } from "../../infrastructure/repositories/pondRepository.js";
import { SamplingRepository } from "../../infrastructure/repositories/samplingRepository.js";
import { HarvestRepository } from "../../infrastructure/repositories/harvestRepository.js";
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
            snapSpecies: document.getElementById("badge-species") || document.getElementById("snap-species"),
            snapGenetic: document.getElementById("badge-genetic") || document.getElementById("snap-genetic"),
            snapStockedPcs: document.getElementById("snap-stocked-pcs"),
            snapStockedFoot: document.getElementById("snap-stocked-foot"),
            snapLatestAbw: document.getElementById("snap-latest-abw"),
            snapAbwFoot: document.getElementById("snap-abw-foot"),
            snapTotalFeed: document.getElementById("snap-total-feed"),
            snapFeedFoot: document.getElementById("snap-feed-foot"),
            snapTotalHarvest: document.getElementById("snap-total-harvest"),
            snapHarvestFoot: document.getElementById("snap-harvest-foot"),
            snapCycleStatus: document.getElementById("snap-cycle-status")
        };

        this.btnSave = document.getElementById("btn-save-master");
        this.btnSaveAerators = document.getElementById("btn-save-aerators");

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

        // Inline Save buttons
        if (this.btnSave) {
            this.btnSave.addEventListener("click", () => this.savePreparationDates());
        }
        if (this.btnSaveAerators) {
            this.btnSaveAerators.addEventListener("click", () => this.saveAeratorInventory());
        }
    }

    async render(pond) {
        if (!pond) return;

        // Populate Milestone Dates
        if (this.dom.inputDateCycle) this.dom.inputDateCycle.value = pond.date_cycle || "";
        if (this.dom.inputDateCleaning) this.dom.inputDateCleaning.value = pond.date_cleaning || "";
        if (this.dom.inputDateRepair) this.dom.inputDateRepair.value = pond.date_repair || "";
        if (this.dom.inputDateFilling) this.dom.inputDateFilling.value = pond.date_filling || "";
        if (this.dom.inputDateCulture) this.dom.inputDateCulture.value = pond.date_culture || "";
        if (this.dom.inputDateBabyBox) this.dom.inputDateBabyBox.value = pond.date_baby_box || pond.date_babybox || "";
        if (this.dom.inputDateQaqc) this.dom.inputDateQaqc.value = pond.date_qaqc || "";
        if (this.dom.inputDateReady) this.dom.inputDateReady.value = pond.date_ready || "";
        if (this.dom.inputDatePlanStock) this.dom.inputDatePlanStock.value = pond.date_plan_stock || "";
        if (this.dom.inputIdleDays) this.dom.inputIdleDays.value = pond.idle_days || "0";
        if (this.dom.inputIdleStatus) this.dom.inputIdleStatus.value = pond.idle_status || "";
        if (this.dom.inputWaterType) this.dom.inputWaterType.value = pond.water_type || "Marine (Saltwater)";

        // Populate Real-Time Snapshots from Database
        await this.loadSnapshots(pond);

        // Fetch Aerator Inventory from DB
        await this.loadAerators(pond.pond_index, pond.area);

        // Apply RBAC
        this.applyRolePermissions();
    }

    /**
     * Loads live cycle metrics (Stocking, Biometrics Sampling, and Harvest) from Supabase.
     * @param {object} pond 
     */
    async loadSnapshots(pond) {
        if (!pond) return;

        // 0. Species & Genetic Line
        if (this.dom.snapSpecies) {
            this.dom.snapSpecies.textContent = pond.species || pond.stck_species || "P. VANNAMEi";
        }
        if (this.dom.snapGenetic) {
            this.dom.snapGenetic.textContent = pond.genetic_line || pond.bs_line || "Standard Line";
        }

        // 1. Stocked Pieces & Density
        const pcs = parseInt(pond.stck_netto || pond.stck_pcs || 0, 10);
        if (this.dom.snapStockedPcs) {
            this.dom.snapStockedPcs.textContent = !isNaN(pcs) && pcs > 0 ? `${pcs.toLocaleString()} pcs` : "—";
        }
        if (this.dom.snapStockedFoot) {
            const areaHa = parseFloat(pond.area || 0);
            if (areaHa > 0 && pcs > 0) {
                const areaM2 = (areaHa <= 10) ? areaHa * 10000 : areaHa;
                const density = Math.round(pcs / areaM2);
                this.dom.snapStockedFoot.textContent = `${density} PL/m² (${areaHa} Ha)`;
            } else {
                this.dom.snapStockedFoot.textContent = "Gross PL count";
            }
        }

        // Cycle Status Badge
        if (this.dom.snapCycleStatus) {
            const status = (pond.pond_status || "PRODUCTION").toUpperCase();
            this.dom.snapCycleStatus.textContent = status;
            this.dom.snapCycleStatus.className = `status-badge ${status === 'PRODUCTION' ? 'status-production' : status === 'CLOSE' ? 'status-close' : 'status-idle'}`;
        }

        // 2. Biometrics Sampling (Latest ABW & Cumulative Feed)
        try {
            const samples = await SamplingRepository.getSamplingByPond(pond.pond_index);
            if (samples && samples.length > 0) {
                // Grab the highest DOC sampling
                const latest = samples[samples.length - 1];
                const abw = parseFloat(latest.smpl_abw || 0);
                const doc = latest.smpl_doc;
                const tfed = parseFloat(latest.smpl_tfed || 0);

                if (this.dom.snapLatestAbw) {
                    this.dom.snapLatestAbw.textContent = abw > 0 ? `${abw.toFixed(2)} g` : "—";
                }
                if (this.dom.snapAbwFoot) {
                    this.dom.snapAbwFoot.textContent = doc ? `DOC ${doc} sampling` : "Latest biometrics";
                }
                if (this.dom.snapTotalFeed) {
                    this.dom.snapTotalFeed.textContent = tfed > 0 ? `${Math.round(tfed).toLocaleString()} kg` : "—";
                }
                if (this.dom.snapFeedFoot) {
                    this.dom.snapFeedFoot.textContent = doc ? `Cumulative feed (DOC ${doc})` : "Cumulative feed";
                }
            } else {
                if (this.dom.snapLatestAbw) this.dom.snapLatestAbw.textContent = "—";
                if (this.dom.snapAbwFoot) this.dom.snapAbwFoot.textContent = "No sampling yet";
                if (this.dom.snapTotalFeed) this.dom.snapTotalFeed.textContent = "0 kg";
                if (this.dom.snapFeedFoot) this.dom.snapFeedFoot.textContent = "Cumulative feed";
            }
        } catch (err) {
            console.warn("Could not load biometrics sampling for snapshot:", err);
            if (this.dom.snapLatestAbw) this.dom.snapLatestAbw.textContent = "—";
            if (this.dom.snapTotalFeed) this.dom.snapTotalFeed.textContent = "—";
        }

        // 3. Harvest Summary (Actual Harvest kg & Revenue)
        try {
            const harvest = await HarvestRepository.getHarvestSummary(pond.pond_index);
            if (harvest.hasHarvest) {
                if (this.dom.snapTotalHarvest) {
                    this.dom.snapTotalHarvest.textContent = `${harvest.totalWeightKg.toLocaleString()} kg`;
                }
                if (this.dom.snapHarvestFoot) {
                    this.dom.snapHarvestFoot.textContent = harvest.totalRevenue > 0
                        ? `RM ${harvest.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "Harvest logged";
                }
            } else {
                if (this.dom.snapTotalHarvest) {
                    this.dom.snapTotalHarvest.textContent = "0.0 kg";
                }
                if (this.dom.snapHarvestFoot) {
                    this.dom.snapHarvestFoot.textContent = pond.pond_status === "CLOSE" ? "Cycle closed" : "Status: IN CULTURE";
                }
            }
        } catch (err) {
            console.warn("Could not load harvest summary for snapshot:", err);
            if (this.dom.snapTotalHarvest) this.dom.snapTotalHarvest.textContent = "0.0 kg";
        }
    }

    async loadAerators(pondIndex, pondArea) {
        let u1 = 0, u2 = 0, u4 = 0;
        try {
            const items = await InventoryRepository.getAerators(pondIndex);
            if (items && items.length > 0) {
                items.forEach(item => {
                    const hp = parseFloat(item.hp !== undefined && item.hp !== null ? item.hp : item.hp_rating);
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

    async savePreparationDates() {
        const pondIndex = appState.currentPondIndex;
        if (!pondIndex) return;

        const role = appState.userRole;
        if (!hasPermission(role, PERMISSIONS.EDIT_MASTER_CYCLE)) {
            Toast.error("Your current role does not have permission to modify Master cycle dates.");
            return;
        }

        try {
            appState.setLoading(true);
            Toast.info("Saving preparation dates...");

            const updates = {
                date_cycle: this.dom.inputDateCycle?.value || null,
                date_cleaning: this.dom.inputDateCleaning?.value || null,
                date_repair: this.dom.inputDateRepair?.value || null,
                date_filling: this.dom.inputDateFilling?.value || null,
                date_culture: this.dom.inputDateCulture?.value || null,
                date_baby_box: this.dom.inputDateBabyBox?.value || null,
                date_qaqc: this.dom.inputDateQaqc?.value || null,
                date_ready: this.dom.inputDateReady?.value || null,
                date_plan_stock: this.dom.inputDatePlanStock?.value || null,
                idle_days: parseInt(this.dom.inputIdleDays?.value || 0, 10),
                idle_status: this.dom.inputIdleStatus?.value || null,
                water_type: this.dom.inputWaterType?.value || null
            };
            await PondRepository.updateCycle(pondIndex, updates);
            Toast.success("Pond preparation dates saved successfully!");
        } catch (err) {
            console.error("Save preparation dates error:", err);
            Toast.error(`Save failed: ${err.message}`);
        } finally {
            appState.setLoading(false);
        }
    }

    async saveAeratorInventory() {
        const pondIndex = appState.currentPondIndex;
        if (!pondIndex) return;

        const role = appState.userRole;
        if (!hasPermission(role, PERMISSIONS.EDIT_AERATORS)) {
            Toast.error("Your current role does not have permission to modify Aerator inventory.");
            return;
        }

        try {
            appState.setLoading(true);
            Toast.info("Saving paddlewheel inventory...");

            const aeratorPayload = [
                { hp_rating: 1.0, total_units: parseInt(this.dom.aerator1hp?.value || 0, 10) },
                { hp_rating: 2.0, total_units: parseInt(this.dom.aerator2hp?.value || 0, 10) },
                { hp_rating: 4.0, total_units: parseInt(this.dom.aerator4hp?.value || 0, 10) }
            ];
            await InventoryRepository.syncAeratorInventory(pondIndex, aeratorPayload);
            Toast.success("Paddlewheel inventory saved successfully!");
        } catch (err) {
            console.error("Save aerator inventory error:", err);
            Toast.error(`Save failed: ${err.message}`);
        } finally {
            appState.setLoading(false);
        }
    }

    async saveData() {
        await Promise.all([
            this.savePreparationDates(),
            this.saveAeratorInventory()
        ]);
    }

    applyRolePermissions() {
        const canEditMaster = hasPermission(appState.userRole, PERMISSIONS.EDIT_MASTER_CYCLE);
        const canEditAerators = hasPermission(appState.userRole, PERMISSIONS.EDIT_AERATORS);

        const inputs = [
            this.dom.inputDateCycle, this.dom.inputDateCleaning, this.dom.inputDateRepair,
            this.dom.inputDateFilling, this.dom.inputDateCulture, this.dom.inputDateBabyBox,
            this.dom.inputDateQaqc, this.dom.inputDateReady, this.dom.inputDatePlanStock,
            this.dom.inputIdleDays, this.dom.inputIdleStatus, this.dom.inputWaterType
        ];

        inputs.forEach(inp => {
            if (inp) {
                inp.disabled = !canEditMaster;
                inp.style.opacity = canEditMaster ? "1" : "0.7";
            }
        });

        // Aerator inputs & steppers
        [this.dom.aerator1hp, this.dom.aerator2hp, this.dom.aerator4hp].forEach(inp => {
            if (inp) {
                inp.disabled = !canEditAerators;
                inp.style.opacity = canEditAerators ? "1" : "0.7";
            }
        });

        const stepperButtons = document.querySelectorAll(".paddlewheel-card .btn-stepper");
        stepperButtons.forEach(btn => {
            btn.disabled = !canEditAerators;
            btn.style.opacity = canEditAerators ? "1" : "0.5";
            btn.style.pointerEvents = canEditAerators ? "auto" : "none";
        });

        // Save buttons
        if (this.btnSave) {
            this.btnSave.disabled = !canEditMaster;
            this.btnSave.style.opacity = canEditMaster ? "1" : "0.5";
            this.btnSave.style.pointerEvents = canEditMaster ? "auto" : "none";
        }

        if (this.btnSaveAerators) {
            this.btnSaveAerators.disabled = !canEditAerators;
            this.btnSaveAerators.style.opacity = canEditAerators ? "1" : "0.5";
            this.btnSaveAerators.style.pointerEvents = canEditAerators ? "auto" : "none";
        }
    }
}
