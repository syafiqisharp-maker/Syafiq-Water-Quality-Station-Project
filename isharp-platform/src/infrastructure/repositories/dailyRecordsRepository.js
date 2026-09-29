/**
 * iSHARP DBMS 2.0 — Daily Pond Records Repository
 * Data Access Layer for public.daily_pond_records in Supabase
 */

import { supabase } from "../supabase.js";

export class DailyRecordsRepository {
    /**
     * Fetches all daily records for a given pond cycle.
     * @param {string} pondIndex 
     * @returns {Promise<Array<object>>}
     */
    static async getRecordsForPond(pondIndex) {
        if (!pondIndex) return [];
        try {
            const endpoint = `daily_pond_records?pond_index=eq.${encodeURIComponent(pondIndex)}&order=log_date.asc`;
            const records = await supabase.request(endpoint);
            return records || [];
        } catch (err) {
            console.error("Error fetching daily pond records:", err);
            return [];
        }
    }

    /**
     * Fetches a single daily record by pond_index and log_date.
     * @param {string} pondIndex 
     * @param {string} logDate YYYY-MM-DD
     * @returns {Promise<object|null>}
     */
    static async getRecordByDate(pondIndex, logDate) {
        if (!pondIndex || !logDate) return null;
        try {
            const endpoint = `daily_pond_records?pond_index=eq.${encodeURIComponent(pondIndex)}&log_date=eq.${encodeURIComponent(logDate)}&limit=1`;
            const res = await supabase.request(endpoint);
            return (res && res.length > 0) ? res[0] : null;
        } catch (err) {
            console.error("Error fetching daily record by date:", err);
            return null;
        }
    }

    /**
     * Upserts a daily pond record (keyed on pond_index and log_date).
     * @param {object} record 
     * @returns {Promise<object>}
     */
    static async upsertRecord(record) {
        if (!record.pond_index || !record.log_date) {
            throw new Error("Pond index and log date are required.");
        }

        const payload = {
            pond_index: record.pond_index,
            pond: record.pond || (record.pond_index.includes(".") ? record.pond_index : record.pond_index),
            log_date: record.log_date,
            feed_kg: record.feed_kg !== undefined && record.feed_kg !== "" ? parseFloat(record.feed_kg) : 0.0,
            feed_tray_remnant_pct: record.feed_tray_remnant_pct !== undefined && record.feed_tray_remnant_pct !== "" ? parseInt(record.feed_tray_remnant_pct, 10) : 0,
            water_level_cm: record.water_level_cm !== undefined && record.water_level_cm !== "" ? parseFloat(record.water_level_cm) : null,
            water_colour: record.water_colour || null,
            mortality_count: record.mortality_count !== undefined && record.mortality_count !== "" ? parseInt(record.mortality_count, 10) : 0,
            remarks: record.remarks || null,
            updated_at: new Date().toISOString()
        };

        if (record.id) {
            payload.id = record.id;
        }

        try {
            const endpoint = "daily_pond_records?on_conflict=pond_index,log_date";
            const res = await supabase.request(endpoint, {
                method: "POST",
                headers: {
                    "Prefer": "resolution=merge-duplicates,return=representation"
                },
                body: JSON.stringify(payload)
            });
            return res && res.length > 0 ? res[0] : payload;
        } catch (err) {
            // Fallback: check if row exists and PATCH or INSERT
            console.warn("Direct upsert fallback to check-and-patch:", err);
            const existing = await this.getRecordByDate(record.pond_index, record.log_date);
            if (existing && existing.id) {
                const patchRes = await supabase.request(`daily_pond_records?id=eq.${existing.id}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload)
                });
                return patchRes && patchRes.length > 0 ? patchRes[0] : payload;
            } else {
                const postRes = await supabase.request("daily_pond_records", {
                    method: "POST",
                    body: JSON.stringify(payload)
                });
                return postRes && postRes.length > 0 ? postRes[0] : payload;
            }
        }
    }

    /**
     * Deletes a daily record by UUID.
     * @param {string} id 
     * @returns {Promise<boolean>}
     */
    static async deleteRecord(id) {
        if (!id) return false;
        try {
            await supabase.request(`daily_pond_records?id=eq.${encodeURIComponent(id)}`, {
                method: "DELETE"
            });
            return true;
        } catch (err) {
            console.error("Error deleting daily record:", err);
            throw err;
        }
    }
}
