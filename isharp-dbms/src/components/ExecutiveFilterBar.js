/**
 * iSHARP DBMS 2.0 — Executive Filter Bar Component
 * Controls status, module, and active state filters with auto-synchronization.
 */

import { filterStore } from "../state/filterStore.js";
import { appState } from "../state/appState.js";
import { PondRepository } from "../infrastructure/repositories/pondRepository.js";
import { Toast } from "./Toast.js";

export class ExecutiveFilterBar {
    constructor() {
        this.dom = {
            filterStatus: document.getElementById("filter-pond-status"),
            filterModule: document.getElementById("filter-pond-module"),
            filterActive: document.getElementById("filter-pond-active"),
            badgeCount: document.getElementById("filtered-count-badge"),
            btnReset: document.getElementById("btn-reset-filters"),
            inputSearch: document.getElementById("input-pond-search")
        };

        this.bindEvents();
        this.syncUIFromStore();

        // Listen for filter changes
        filterStore.subscribe(() => {
            this.syncUIFromStore();
            this.reloadCycles();
        });

        // Listen for cycle list changes to update count badge
        appState.subscribe("cyclesLoaded", (cycles) => {
            if (this.dom.badgeCount) {
                this.dom.badgeCount.textContent = `${cycles.length} Ponds`;
            }
        });
    }

    bindEvents() {
        if (this.dom.filterStatus) {
            this.dom.filterStatus.addEventListener("change", (e) => {
                filterStore.setStatus(e.target.value);
            });
        }

        if (this.dom.filterModule) {
            this.dom.filterModule.addEventListener("change", (e) => {
                filterStore.setModule(e.target.value);
            });
        }

        if (this.dom.filterActive) {
            this.dom.filterActive.addEventListener("change", (e) => {
                filterStore.setActive(e.target.value);
            });
        }

        if (this.dom.btnReset) {
            this.dom.btnReset.addEventListener("click", () => {
                filterStore.reset();
                if (this.dom.inputSearch) this.dom.inputSearch.value = "";
                Toast.info("Filters reset to default.");
            });
        }

        if (this.dom.inputSearch) {
            this.dom.inputSearch.addEventListener("input", (e) => {
                filterStore.setSearchQuery(e.target.value);
                this.applyClientSearch();
            });
        }
    }

    syncUIFromStore() {
        const filters = filterStore.getFilters();
        if (this.dom.filterStatus) this.dom.filterStatus.value = filters.status;
        if (this.dom.filterModule) this.dom.filterModule.value = filters.module;
        if (this.dom.filterActive) this.dom.filterActive.value = filters.active;
    }

    async reloadCycles() {
        try {
            appState.setLoading(true);
            const filters = filterStore.getFilters();
            const cycles = await PondRepository.getCycles(filters);
            appState.setCycles(cycles);
            this.applyClientSearch();
        } catch (err) {
            console.error("Filter reload error:", err);
            Toast.error(`Failed to load ponds: ${err.message}`);
        } finally {
            appState.setLoading(false);
        }
    }

    applyClientSearch() {
        const query = filterStore.searchQuery;
        const all = appState.allCycles;
        if (!query) {
            appState.setFilteredCycles(all);
            return;
        }

        const filtered = all.filter(c => {
            const pondCode = String(c.pond || "").toLowerCase();
            const pondIndex = String(c.pond_index || "").toLowerCase();
            return pondCode.includes(query) || pondIndex.includes(query);
        });

        appState.setFilteredCycles(filtered);
    }
}
