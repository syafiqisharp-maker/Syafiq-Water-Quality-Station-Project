/**
 * iSHARP DBMS 2.0 — Pond Repository
 * Data Access Layer for stocking_records and active_operational_ponds
 */

import { supabase } from "../supabase.js";

export class PondRepository {
    /**
     * Fetches pond cycles matching executive filters.
     * @param {object} filters 
     * @param {string} [filters.status] e.g. "PRODUCTION", "iDLE", "CLOSE", or "ALL"
     * @param {string} [filters.module] e.g. "MODULE 1", "MODULE 2", or "ALL"
     * @param {string} [filters.active] e.g. "ACTiVE", "iN ACTiVE", or "ALL"
     * @returns {Promise<Array<object>>}
     */
    static async getCycles(filters = {}) {
        let queryParams = [
            "select=pond_index,pond,modl,row_no,cycle_no,crop_no,pond_status,pond_active,stck_date,date_close,aerator_1hp,aerator_2hp,area,stck_species,bs_line,stck_source,stck_size,stck_tank,stck_pcs,stck_allow,stck_total",
            "order=pond_index.asc"
        ];

        const status = filters.status || "ALL";
        const moduleVal = filters.module || "ALL";
        const active = filters.active || "ALL";

        if (status !== "ALL") {
            if (status === "PRODUCTION") {
                queryParams.push("pond_status=eq.PRODUCTION");
            } else if (status === "iDLE") {
                queryParams.push("pond_status=ilike.idle");
            } else if (status === "CLOSE") {
                queryParams.push("pond_status=eq.CLOSE");
            } else if (status === "MAINTENANCE") {
                queryParams.push("pond_status=ilike.maintenance");
            } else if (status === "RESERVOIR") {
                queryParams.push("pond_status=ilike.reservoir");
            } else if (status === "PREPARATION") {
                queryParams.push("pond_status=ilike.*prep*");
            }
        }
        if (moduleVal !== "ALL") {
            queryParams.push(`modl=eq.${encodeURIComponent(moduleVal)}`);
        }
        if (active !== "ALL") {
            if (active === "ACTiVE") {
                queryParams.push("pond_active=ilike.active");
            } else if (active === "iN ACTiVE") {
                queryParams.push("pond_active=ilike.*in*active*");
            }
        }

        const endpoint = `stocking_records?${queryParams.join("&")}&limit=1000`;
        const records = await supabase.request(endpoint);

        // Normalize schema fields for consistent UI consumption
        return (records || []).map(r => ({
            ...r,
            status: r.pond_status || "PRODUCTION",
            active: r.pond_active || "ACTiVE",
            module: r.modl || "MODULE 1",
            species: r.stck_species || "P. VANNAMEi",
            genetic_line: r.bs_line || "Standard",
            pl_origin: r.stck_source || "Hatchery",
            stck_size: r.stck_size,
            stck_tank: r.stck_tank,
            stck_netto: r.stck_pcs || r.stck_netto || 0,
            stck_total: r.stck_total || ((parseFloat(r.stck_pcs || 0)) + (parseFloat(r.stck_allow || 0)))
        }));
    }

    /**
     * Fetches complete details of a single pond cycle by pond_index.
     * @param {string} pondIndex 
     * @returns {Promise<object|null>}
     */
    static async getCycleDetails(pondIndex) {
        if (!pondIndex) return null;
        const endpoint = `stocking_records?select=*&pond_index=eq.${encodeURIComponent(pondIndex)}&limit=1`;
        const res = await supabase.request(endpoint);
        if (!res || res.length === 0) return null;
        const r = res[0];
        return {
            ...r,
            status: r.pond_status || "PRODUCTION",
            active: r.pond_active || "ACTiVE",
            module: r.modl || "MODULE 1",
            species: r.stck_species || "P. VANNAMEi",
            genetic_line: r.bs_line || "Standard",
            pl_origin: r.stck_source || "Hatchery",
            stck_netto: r.stck_pcs || r.stck_netto || 0,
            stck_size: r.stck_size,
            stck_tank: r.stck_tank,
            stck_allow: r.stck_allow || 0,
            stck_total: r.stck_total || ((parseFloat(r.stck_pcs || 0)) + (parseFloat(r.stck_allow || 0))),
            date_babybox: r.date_baby_box || r.date_babybox || null
        };
    }

    /**
     * Fetches individual stocking batch records for a cycle from pond_stocking_batches.
     * @param {string} pondIndex 
     * @returns {Promise<Array<object>>}
     */
    static async getStockingBatches(pondIndex) {
        if (!pondIndex) return [];
        const endpoint = `pond_stocking_batches?pond_index=eq.${encodeURIComponent(pondIndex)}&order=stck_date.asc,index_no.asc`;
        try {
            return await supabase.request(endpoint);
        } catch (err) {
            console.warn("Could not fetch stocking batches:", err);
            return [];
        }
    }

    /**
     * Fetches all historical cycles for a physical pond (e.g. "01.02.12").
     * @param {string} physicalPond 
     * @returns {Promise<Array<object>>}
     */
    static async getCycleHistory(physicalPond) {
        if (!physicalPond) return [];
        const endpoint = `stocking_records?select=pond_index,pond,crop_no,cycle_no,pond_status,pond_active,stck_date,date_close,area&pond=eq.${encodeURIComponent(physicalPond)}&order=pond_index.desc`;
        const records = await supabase.request(endpoint);
        return (records || []).map(r => ({
            ...r,
            status: r.pond_status || "PRODUCTION",
            active: r.pond_active || "ACTiVE"
        }));
    }

    /**
     * Updates fields for an existing cycle in stocking_records.
     * @param {string} pondIndex 
     * @param {object} updates 
     * @returns {Promise<object>}
     */
    static async updateCycle(pondIndex, updates) {
        if (!pondIndex) throw new Error("pondIndex is required for update.");
        const endpoint = `stocking_records?pond_index=eq.${encodeURIComponent(pondIndex)}`;
        return await supabase.request(endpoint, {
            method: "PATCH",
            body: JSON.stringify(updates)
        });
    }

    /**
     * Terminates a pond cycle with option to create next cycle or close only.
     * @param {string} pondIndex 
     * @param {string} [harvestDate] 
     * @param {string} [finalStatus] 
     * @param {boolean} [createNextCycle=true]
     * @returns {Promise<object>}
     */
    static async terminateCycle(pondIndex, harvestDate, finalStatus = "NORMAL HARVEST", createNextCycle = true) {
        if (!pondIndex) throw new Error("pondIndex is required for termination.");
        const dateStr = harvestDate || new Date().toISOString().split("T")[0];
        return await supabase.rpc("fn_terminate_cycle", {
            p_pond_index: pondIndex,
            p_harvest_date: dateStr,
            p_final_status: finalStatus,
            p_create_next_cycle: createNextCycle
        });
    }

    /**
     * Backward-compatible alias for executeRollover.
     */
    static async executeRollover(pondIndex, harvestDate, finalStatus = "NORMAL HARVEST") {
        return await this.terminateCycle(pondIndex, harvestDate, finalStatus, true);
    }

    /**
     * Reopens an accidentally closed cycle and optionally deletes the next cycle spawned during rollover.
     * @param {string} pondIndex 
     * @param {boolean} [deleteNextCycle=false]
     * @returns {Promise<{ success: boolean, revived_pond_index: string, next_pond_index: string, next_cycle_deleted: boolean, status: string }>}
     */
    static async reviveCycle(pondIndex, deleteNextCycle = false) {
        if (!pondIndex) throw new Error("pondIndex is required for revive.");
        return await supabase.rpc("fn_revive_cycle", {
            p_pond_index: pondIndex,
            p_delete_next_cycle: deleteNextCycle
        });
    }

    /**
     * Creates a customized pond cycle with custom pond code and cycle number.
     * @param {object} params
     * @param {string} params.pond
     * @param {number} params.cycleNo
     * @param {number} [params.area=0.50]
     * @param {string} [params.status="iDLE"]
     * @param {string|null} [params.planStockDate=null]
     * @returns {Promise<object>}
     */
    static async createCustomCycle({ pond, cycleNo, area = 0.50, status = "iDLE", planStockDate = null }) {
        if (!pond) throw new Error("Pond code is required.");
        if (!cycleNo) throw new Error("Cycle number is required.");
        return await supabase.rpc("fn_create_custom_cycle", {
            p_pond: pond,
            p_cycle_no: parseInt(cycleNo, 10),
            p_area: parseFloat(area) || 0.50,
            p_status: status,
            p_plan_stock_date: planStockDate || null
        });
    }

    /**
     * Safely deletes an empty/idle cycle.
     * @param {string} pondIndex 
     * @returns {Promise<object>}
     */
    static async deleteIdleCycle(pondIndex) {
        if (!pondIndex) throw new Error("pondIndex is required for deletion.");
        return await supabase.rpc("fn_delete_idle_cycle", {
            p_pond_index: pondIndex
        });
    }

    /**
     * Fetches distinct physical pond codes across all cycles.
     * @returns {Promise<Array<{pond: string, modl: string, area: number}>>}
     */
    static async getDistinctPonds() {
        const endpoint = `stocking_records?select=pond,modl,area&order=pond.asc`;
        const data = await supabase.request(endpoint);
        const unique = new Map();
        (data || []).forEach(r => {
            if (r.pond && !unique.has(r.pond)) {
                unique.set(r.pond, {
                    pond: r.pond,
                    modl: r.modl || "",
                    area: parseFloat(r.area) || 0.50
                });
            }
        });
        return Array.from(unique.values());
    }
}


