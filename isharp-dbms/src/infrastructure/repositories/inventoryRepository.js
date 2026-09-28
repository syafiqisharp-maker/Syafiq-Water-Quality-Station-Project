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
            aerator_model: a.aerator_model || `${a.hp || a.hp_rating || 1} HP Paddlewheel`,
            hp: parseFloat(a.hp || a.hp_rating || 1),
            total_units: parseInt(a.total_units || 0, 10),
            active_units: parseInt(a.total_units || 0, 10),
            updated_at: new Date().toISOString()
        }));

        try {
            await supabase.request("pond_aerator_inventory", {
                method: "POST",
                headers: { "Prefer": "resolution=merge-duplicates" },
                body: JSON.stringify(records)
            });
        } catch (err) {
            console.warn("Could not sync to pond_aerator_inventory table:", err);
        }

        // Also keep stocking_records legacy aerator columns in sync
        const u1 = aerators.find(a => parseFloat(a.hp || a.hp_rating) === 1.0)?.total_units || 0;
        const u2 = aerators.find(a => parseFloat(a.hp || a.hp_rating) === 2.0)?.total_units || 0;
        try {
            await supabase.request(`stocking_records?pond_index=eq.${encodeURIComponent(pondIndex)}`, {
                method: "PATCH",
                body: JSON.stringify({ aerator_1hp: u1, aerator_2hp: u2 })
            });
        } catch (err) {
            console.warn("Could not sync aerators to stocking_records:", err);
        }
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
