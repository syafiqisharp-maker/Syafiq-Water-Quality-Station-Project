/**
 * iSHARP DBMS 2.0 — Main Application Entry Point
 * Orchestrates modular components, reactive state, and tab coordination.
 */

import { appState } from "./state/appState.js";
import { filterStore } from "./state/filterStore.js";
import { PondRepository } from "./infrastructure/repositories/pondRepository.js";
import { Toast } from "./components/Toast.js";
import { Navbar } from "./components/Navbar.js";
import { ExecutiveFilterBar } from "./components/ExecutiveFilterBar.js";
import { MasterBanner } from "./components/MasterBanner.js";
import { ExcelModal } from "./features/excelImporter/excelModal.js";

import { isCycleClosed } from "./domain/rollover.js";

// Tab Modules
import { MasterTab } from "./modules/master/masterTab.js";
import { SamplingTab } from "./modules/sampling/samplingTab.js";
import { FeedingTab } from "./modules/feeding/feedingTab.js";
import { PerformanceTab } from "./modules/performance/performanceTab.js";
import { StockingTab } from "./modules/stocking/stockingTab.js";
import { HarvestTab } from "./modules/harvest/harvestTab.js";
import { LifecycleTab } from "./modules/lifecycle/lifecycleTab.js";
import { LaboratoryTab } from "./modules/laboratory/laboratoryTab.js";
import { StaffTab } from "./modules/staff/staffTab.js";
import { UtilitiesTab } from "./modules/utilities/utilitiesTab.js";

class App {
    constructor() {
        this.init();
    }

    async init() {
        try {
            console.log("🦐 Bootstrapping iSHARP DBMS 2.0 (Frutiger Aero Edition)...");

            // 1. Initialize Subsystems & Components
            this.excelModal = new ExcelModal((category, pondIndex) => {
                this.onExcelImportComplete(category, pondIndex);
            });

            this.harvestTab = new HarvestTab((cat) => this.excelModal.open(cat || "harvest"));
            this.lifecycleTab = new LifecycleTab((pondIndex) => this.navbar.selectPondByIndex(pondIndex));

            this.navbar = new Navbar(
                () => this.excelModal.open("sampling"),
                () => {
                    if (isCycleClosed(appState.currentPond)) {
                        this.lifecycleTab.openReviveModal();
                    } else {
                        this.lifecycleTab.openTerminateModal(true);
                    }
                },
                () => this.saveActiveTabData()
            );

            this.filterBar = new ExecutiveFilterBar();
            this.masterBanner = new MasterBanner((pondIndex) => {
                this.navbar.selectPondByIndex(pondIndex);
            });

            // 2. Initialize Tab Controllers
            this.tabs = {
                "tab-master": new MasterTab(),
                "tab-laboratory": new LaboratoryTab((cat) => this.excelModal.open(cat || "issues")),
                "tab-stocking": new StockingTab(),
                "tab-feeding": new FeedingTab((cat) => this.excelModal.open(cat || "feed")),
                "tab-sampling": new SamplingTab((cat) => this.excelModal.open(cat || "sampling")),
                "tab-performance": new PerformanceTab(),
                "tab-harvest": this.harvestTab,
                "tab-lifecycle": this.lifecycleTab,
                "tab-staff": new StaffTab(),
                "tab-utilities": new UtilitiesTab()
            };

            // 3. Tab Switching Coordinator
            this.bindTabNavigation();

            // 4. Initial Cloud Sync
            Toast.info("Connecting to Supabase Cloud PostgreSQL...");
            await this.loadInitialData();

        } catch (err) {
            console.error("App bootstrap error:", err);
            Toast.error(`Failed to initialize DBMS: ${err.message}`);
        }
    }

    bindTabNavigation() {
        const tabBtns = document.querySelectorAll(".tab-btn");
        tabBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                const targetTab = btn.dataset.tab;
                if (!targetTab) return;

                // Toggle active buttons
                tabBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");

                // Toggle active tab panes
                document.querySelectorAll(".tab-pane").forEach(pane => {
                    pane.classList.remove("active");
                });
                const targetPane = document.getElementById(targetTab);
                if (targetPane) targetPane.classList.add("active");

                // Update state
                appState.setActiveTab(targetTab);
            });
        });
    }

    async loadInitialData() {
        try {
            appState.setLoading(true);
            const initialFilters = filterStore.getFilters();
            const cycles = await PondRepository.getCycles(initialFilters);
            appState.setCycles(cycles);

            if (cycles && cycles.length > 0) {
                await this.navbar.selectPondByIndex(cycles[0].pond_index);
            }
            Toast.success(`Cloud Synced: Loaded ${cycles.length} production ponds.`);
        } catch (err) {
            console.error("Initial load error:", err);
            Toast.error(`Could not connect to Supabase: ${err.message}`);
        } finally {
            appState.setLoading(false);
        }
    }

    async saveActiveTabData() {
        const activeTab = appState.activeTab;
        const controller = this.tabs[activeTab];

        if (controller && typeof controller.saveData === "function") {
            await controller.saveData();
        } else {
            Toast.info(`No changes to save for this tab.`);
        }
    }

    onExcelImportComplete(category, pondIndex) {
        if (category === "sampling") {
            const samplingController = this.tabs["tab-sampling"];
            if (samplingController) samplingController.loadData(pondIndex);
        } else if (category === "feed") {
            const feedController = this.tabs["tab-feeding"];
            if (feedController) feedController.loadData(pondIndex);
        } else if (category === "issues") {
            const labController = this.tabs["tab-laboratory"];
            if (labController) labController.loadIssues(pondIndex);
        } else if (category === "harvest") {
            const harvestController = this.tabs["tab-harvest"];
            if (harvestController && appState.currentPond) harvestController.render(appState.currentPond);
        }
    }
}

// Instantiate on DOM ready
document.addEventListener("DOMContentLoaded", () => {
    window.__isharpApp = new App();
    window.app = {
        openExcelModal: (cat) => window.__isharpApp.excelModal?.open(cat),
        promptTerminatePond: (createNext = true) => window.__isharpApp.lifecycleTab?.openTerminateModal(createNext),
        promptRevivePond: () => window.__isharpApp.lifecycleTab?.openReviveModal(),
        exportCycleCsv: () => window.__isharpApp.tabs["tab-utilities"]?.exportCycleCsv(),
        verifySyncStatus: () => window.__isharpApp.tabs["tab-utilities"]?.verifySyncStatus()
    };
});

