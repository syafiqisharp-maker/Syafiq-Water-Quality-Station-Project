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
            "select=pond_index,pond,modl,row_no,cycle_no,crop_no,pond_status,pond_active,stck_date,date_close,aerator_1hp,aerator_2hp,area,stck_species,bs_line,stck_source",
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
            pl_origin: r.stck_source || "Hatchery"
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
            date_babybox: r.date_baby_box || r.date_babybox || null
        };
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
     * Triggers the PostgreSQL RPC function to close current cycle and spawn the next cycle.
     * @param {string} pondIndex 
     * @param {string} [harvestDate] YYYY-MM-DD
     * @param {string} [finalStatus] e.g. "NORMAL HARVEST"
     * @returns {Promise<{ success: boolean, pond: string, new_pond_index: string }>}
     */
    static async executeRollover(pondIndex, harvestDate, finalStatus = "NORMAL HARVEST") {
        const dateStr = harvestDate || new Date().toISOString().split("T")[0];
        return await supabase.rpc("fn_close_and_create_next_cycle", {
            p_pond_index: pondIndex,
            p_harvest_date: dateStr,
            p_final_status: finalStatus
        });
    }
}
