/**
 * iSHARP DBMS 2.0 — Inventory Repository
 * Data Access Layer for pond aerator inventory, equipment & field notes
 */

import { supabase } from "../supabase.js";

export class InventoryRepository {
    /**
     * Fetches aerator inventory records for a pond cycle.
     * @param {string} pondIndex 
     * @returns {Promise<Array<object>>}
     */
    static async getAerators(pondIndex) {
        if (!pondIndex) return [];
        const endpoint = `pond_aerator_inventory?pond_index=eq.${encodeURIComponent(pondIndex)}`;
        return await supabase.request(endpoint);
    }

    /**
     * Updates or syncs aerator inventory counts (1HP, 2HP, 4HP).
     * @param {string} pondIndex 
     * @param {Array<{ hp_rating: number, total_units: number }>} aerators 
     * @returns {Promise<any>}
     */
    static async syncAeratorInventory(pondIndex, aerators) {
        if (!pondIndex) return;
        const records = aerators.map(a => ({
            pond_index: pondIndex,
            hp_rating: a.hp_rating,
            total_units: a.total_units,
            updated_at: new Date().toISOString()
        }));

        return await supabase.request("pond_aerator_inventory", {
            method: "POST",
            headers: { "Prefer": "resolution=merge-duplicates" },
            body: JSON.stringify(records)
        });
    }

    /**
     * Fetches field notes for a pond cycle.
     * @param {string} pondIndex 
     * @returns {Promise<Array<object>>}
     */
    static async getNotes(pondIndex) {
        if (!pondIndex) return [];
        const endpoint = `pond_notes?pond_index=eq.${encodeURIComponent(pondIndex)}&order=created_at.desc`;
        try {
            return await supabase.request(endpoint);
        } catch {
            return []; // Table may not exist yet in legacy DB
        }
    }
}
