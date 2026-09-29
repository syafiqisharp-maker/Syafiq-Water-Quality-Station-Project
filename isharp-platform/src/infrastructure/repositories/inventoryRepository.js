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
    static async syncAeratorInventory(pondIndex, pondLabel, aerators) {
        if (!pondIndex) return;
        const pondName = pondLabel || (pondIndex.includes(".") ? pondIndex.split(".")[0] : pondIndex);
        const records = aerators.map(a => ({
            pond_index: pondIndex,
            pond: pondName,
            aerator_model: a.aerator_model || `${a.hp || a.hp_rating || 1} HP Paddlewheel`,
            hp: parseFloat(a.hp || a.hp_rating || 1),
            total_units: parseInt(a.total_units || 0, 10),
            active_units: parseInt(a.total_units || 0, 10),
            updated_at: new Date().toISOString()
        }));

        try {
            await supabase.request("pond_aerator_inventory?on_conflict=pond_index,aerator_model,hp", {
                method: "POST",
                headers: { "Prefer": "resolution=merge-duplicates" },
                body: JSON.stringify(records)
            });
        } catch (err) {
            console.warn("Could not sync to pond_aerator_inventory table:", err);
        }

        // Also keep growout_pond_master aerator columns in sync
        const u1 = aerators.find(a => parseFloat(a.hp || a.hp_rating) === 1.0)?.total_units || 0;
        const u2 = aerators.find(a => parseFloat(a.hp || a.hp_rating) === 2.0)?.total_units || 0;
        try {
            await supabase.request(`growout_pond_master?pond_index=eq.${encodeURIComponent(pondIndex)}`, {
                method: "PATCH",
                body: JSON.stringify({ aerator_1hp: u1, aerator_2hp: u2 })
            });
        } catch (err) {
            console.warn("Could not sync aerators to growout_pond_master:", err);
        }
    }

    /**
     * Fetches equipment inventory (feeding trays, autofeeders, hut condition) for a pond cycle.
     * @param {string} pondIndex 
     * @returns {Promise<object|null>}
     */
    static async getPondInventory(pondIndex) {
        if (!pondIndex) return null;
        try {
            const res = await supabase.request(`pond_inventories?pond_index=eq.${encodeURIComponent(pondIndex)}`);
            return (res && res.length > 0) ? res[0] : null;
        } catch {
            return null;
        }
    }

    /**
     * Saves equipment inventory (feeding trays, autofeeders, hut condition, notes) for a pond cycle.
     * @param {string} pondIndex 
     * @param {string} pondLabel 
     * @param {object} inventoryData 
     * @returns {Promise<any>}
     */
    static async savePondInventory(pondIndex, pondLabel, inventoryData) {
        if (!pondIndex) return;
        const payload = {
            pond_index: pondIndex,
            pond: pondLabel || pondIndex,
            feeding_tray_count: parseInt(inventoryData.feeding_tray_count || 0, 10),
            autofeeder_count: parseInt(inventoryData.autofeeder_count || 0, 10),
            hut_condition: inventoryData.hut_condition || "OK",
            notes: inventoryData.notes || "",
            updated_at: new Date().toISOString()
        };
        try {
            await supabase.request("pond_inventories?on_conflict=pond_index", {
                method: "POST",
                headers: { "Prefer": "resolution=merge-duplicates" },
                body: JSON.stringify(payload)
            });
        } catch (err) {
            console.warn("Could not save to pond_inventories:", err);
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

