/**
 * iSHARP DBMS 2.0 — Reactive Application State
 * Centralized pub/sub store coordinating active pond, cycles, role, and active tab.
 */

import { ROLES } from "../config/permissions.js";

class AppState {
    constructor() {
        this._state = {
            currentView: "portal", // "portal" | "executive" | "dbms"
            currentPondIndex: null,
            currentPond: null,
            allCycles: [],
            filteredCycles: [],
            userRole: ROLES.PLANNER, // Default to Planner for full capability, user can switch role in UI
            activeTab: "tab-master",
            isLoading: false,
            syncStatus: "connected" // "connected" | "syncing" | "offline"
        };

        this._listeners = new Map();
    }

    /**
     * Subscribe to a state change event.
     * Events: "pondChanged", "cyclesLoaded", "roleChanged", "tabChanged", "loadingChanged"
     * @param {string} event 
     * @param {Function} callback 
     * @returns {Function} Unsubscribe function
     */
    subscribe(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(callback);

        return () => {
            const set = this._listeners.get(event);
            if (set) set.delete(callback);
        };
    }

    /**
     * Emit an event to all subscribers.
     * @param {string} event 
     * @param {any} data 
     */
    emit(event, data) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            listeners.forEach(cb => {
                try {
                    cb(data, this._state);
                } catch (err) {
                    console.error(`Error in subscriber for event "${event}":`, err);
                }
            });
        }
    }

    // Getters
    get currentPond() { return this._state.currentPond; }
    get currentPondIndex() { return this._state.currentPondIndex; }
    get allCycles() { return this._state.allCycles; }
    get filteredCycles() { return this._state.filteredCycles; }
    get userRole() { return this._state.userRole; }
    get activeTab() { return this._state.activeTab; }
    get currentView() { return this._state.currentView; }
    get isLoading() { return this._state.isLoading; }

    // Setters / Actions
    setView(viewName) {
        if (!["portal", "executive", "dbms"].includes(viewName)) {
            viewName = "portal";
        }
        if (this._state.currentView === viewName) return;
        this._state.currentView = viewName;
        this.emit("viewChanged", viewName);
    }
    setCycles(cycles) {
        this._state.allCycles = cycles || [];
        this.emit("cyclesLoaded", this._state.allCycles);
    }

    setFilteredCycles(cycles) {
        this._state.filteredCycles = cycles || [];
        this.emit("filteredCyclesChanged", this._state.filteredCycles);
    }

    setCurrentPond(pond) {
        this._state.currentPond = pond;
        this._state.currentPondIndex = pond ? pond.pond_index : null;
        this.emit("pondChanged", pond);
    }

    setUserRole(role) {
        this._state.userRole = role;
        this.emit("roleChanged", role);
    }

    setActiveTab(tabId) {
        this._state.activeTab = tabId;
        this.emit("tabChanged", tabId);
    }

    setLoading(loading) {
        this._state.isLoading = Boolean(loading);
        this.emit("loadingChanged", this._state.isLoading);
    }

    setSyncStatus(status) {
        this._state.syncStatus = status;
        this.emit("syncStatusChanged", status);
    }
}

export const appState = new AppState();
