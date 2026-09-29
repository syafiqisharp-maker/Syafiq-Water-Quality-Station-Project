/**
 * iSHARP DBMS 2.0 — Feeding Repository
 * Data Access Layer for daily_pond_records and feeding logs
 */

import { supabase } from "../supabase.js";

export class FeedRepository {
    /**
     * Fetches recent daily feeding records for a pond cycle.
     * @param {string} pondIndex 
     * @param {number} [limit=30] 
     * @returns {Promise<Array<object>>}
     */
    static async getDailyRecords(pondIndex, limit = 30) {
        if (!pondIndex) return [];
        const endpoint = `daily_pond_records?pond_index=eq.${encodeURIComponent(pondIndex)}&order=log_date.desc&limit=${limit}`;
        return await supabase.request(endpoint);
    }

    /**
     * Inserts a batch of daily feeding / pond records.
     * @param {Array<object>} records 
     * @returns {Promise<any>}
     */
    static async insertBatch(records) {
        if (!records || records.length === 0) return [];
        return await supabase.request("daily_pond_records", {
            method: "POST",
            body: JSON.stringify(records)
        });
    }
}
