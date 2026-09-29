/**
 * iSHARP DBMS 2.0 — Executive Filter Store
 * Manages pond search, status, module, and cycle state filters with auto-synchronization.
 */

class FilterStore {
    constructor() {
        this.status = "PRODUCTION"; // Default to active crops
        this.module = "ALL";
        this.active = "ACTIVE";
        this.searchQuery = "";
        this._listeners = new Set();
    }

    subscribe(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }

    _notify() {
        const state = this.getFilters();
        this._listeners.forEach(cb => cb(state));
    }

    getFilters() {
        return {
            status: this.status,
            module: this.module,
            active: this.active,
            searchQuery: this.searchQuery
        };
    }

    setStatus(status) {
        this.status = status;
        // Auto-sync active cycle state based on status
        if (status === "CLOSE") {
            this.active = "INACTIVE";
        } else if (["PRODUCTION", "IDLE", "MAINTENANCE", "RESERVOIR", "PREPARATION"].includes(status)) {
            this.active = "ACTIVE";
        } else if (status === "ALL") {
            this.active = "ALL";
        }
        this._notify();
    }

    setActive(active) {
        this.active = active;
        // Auto-sync status if active state changes
        if (active === "INACTIVE" && this.status !== "ALL") {
            this.status = "CLOSE";
        } else if (active === "ACTIVE" && this.status === "CLOSE") {
            this.status = "PRODUCTION";
        }
        this._notify();
    }

    setModule(moduleVal) {
        this.module = moduleVal;
        this._notify();
    }

    setSearchQuery(query) {
        this.searchQuery = (query || "").trim().toLowerCase();
        this._notify();
    }

    reset() {
        this.status = "PRODUCTION";
        this.module = "ALL";
        this.active = "ACTiVE";
        this.searchQuery = "";
        this._notify();
    }
}

export const filterStore = new FilterStore();
