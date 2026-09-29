/**
 * iSHARP DBMS 2.0 — Mineral & Probiotic Usage Repository
 * Data Access Layer for public.mineral_probiotic_used in Supabase
 */

import { supabase } from "../supabase.js";

export class MineralProbioticRepository {
    /**
     * Fetches all treatment records for a given pond cycle.
     * @param {string} pondIndex 
     * @returns {Promise<Array<object>>}
     */
    static async getTreatmentsForPond(pondIndex) {
        if (!pondIndex) return [];
        try {
            const endpoint = `mineral_probiotic_used?pond_index=eq.${encodeURIComponent(pondIndex)}&order=log_date.asc,created_at.asc`;
            const records = await supabase.request(endpoint);
            return records || [];
        } catch (err) {
            console.error("Error fetching mineral/probiotic usage:", err);
            return [];
        }
    }

    /**
     * Fetches treatments for a given pond on a specific date.
     * @param {string} pondIndex 
     * @param {string} logDate YYYY-MM-DD
     * @returns {Promise<Array<object>>}
     */
    static async getTreatmentsByDate(pondIndex, logDate) {
        if (!pondIndex || !logDate) return [];
        try {
            const endpoint = `mineral_probiotic_used?pond_index=eq.${encodeURIComponent(pondIndex)}&log_date=eq.${encodeURIComponent(logDate)}`;
            const records = await supabase.request(endpoint);
            return records || [];
        } catch (err) {
            console.error("Error fetching daily treatments by date:", err);
            return [];
        }
    }

    /**
     * Syncs (replaces) treatments for a specific day's record.
     * Deletes existing rows for that pond and date, then inserts new rows.
     * @param {string} dailyRecordId 
     * @param {string} pondIndex 
     * @param {string} pond 
     * @param {string} logDate 
     * @param {Array<object>} items [{ category, name, amount, unit, remarks }]
     * @returns {Promise<Array<object>>}
     */
    static async syncDailyTreatments(dailyRecordId, pondIndex, pond, logDate, items = []) {
        if (!pondIndex || !logDate) return [];

        try {
            // 1. Delete existing treatments for this date & pond
            const delEndpoint = `mineral_probiotic_used?pond_index=eq.${encodeURIComponent(pondIndex)}&log_date=eq.${encodeURIComponent(logDate)}`;
            await supabase.request(delEndpoint, { method: "DELETE" });

            // Filter valid items
            const validItems = items.filter(it => it.name && parseFloat(it.amount) > 0);
            if (validItems.length === 0) return [];

            // 2. Prepare insert records
            const rows = validItems.map(it => ({
                daily_record_id: dailyRecordId || null,
                pond_index: pondIndex,
                pond: pond || (pondIndex.includes(".") ? pondIndex : pondIndex),
                log_date: logDate,
                category: it.category === 'PROBIOTIC' ? 'PROBIOTIC' : 'MINERAL',
                item_name: String(it.name).trim().toUpperCase(),
                amount: parseFloat(it.amount),
                unit: it.unit || (it.category === 'PROBIOTIC' ? 'L' : 'KG'),
                remarks: it.remarks || null,
                updated_at: new Date().toISOString()
            }));

            // 3. Batch insert
            const insertRes = await supabase.request("mineral_probiotic_used", {
                method: "POST",
                headers: { "Prefer": "return=representation" },
                body: JSON.stringify(rows)
            });

            return insertRes || rows;
        } catch (err) {
            console.error("Error syncing mineral_probiotic_used records:", err);
            throw err;
        }
    }

    /**
     * Computes cumulative usage summary by item for the entire cycle.
     * @param {string} pondIndex 
     * @returns {Promise<{ minerals: Array<object>, probiotics: Array<object>, totalMineralKg: number, totalProbioticL: number }>}
     */
    static async getCycleUsageSummary(pondIndex) {
        const records = await this.getTreatmentsForPond(pondIndex);
        const mineralsMap = new Map();
        const probioticsMap = new Map();
        let totalMineralKg = 0;
        let totalProbioticL = 0;

        records.forEach(r => {
            const key = `${r.item_name}__${r.unit || 'KG'}`;
            const amount = parseFloat(r.amount || 0);

            if (r.category === 'MINERAL') {
                if (r.unit === 'KG') totalMineralKg += amount;
                const existing = mineralsMap.get(key) || { item_name: r.item_name, unit: r.unit || 'KG', total_amount: 0, count: 0 };
                existing.total_amount += amount;
                existing.count++;
                mineralsMap.set(key, existing);
            } else if (r.category === 'PROBIOTIC') {
                if (r.unit === 'L') totalProbioticL += amount;
                const existing = probioticsMap.get(key) || { item_name: r.item_name, unit: r.unit || 'L', total_amount: 0, count: 0 };
                existing.total_amount += amount;
                existing.count++;
                probioticsMap.set(key, existing);
            }
        });

        return {
            minerals: Array.from(mineralsMap.values()).sort((a, b) => b.total_amount - a.total_amount),
            probiotics: Array.from(probioticsMap.values()).sort((a, b) => b.total_amount - a.total_amount),
            totalMineralKg: Math.round(totalMineralKg * 10) / 10,
            totalProbioticL: Math.round(totalProbioticL * 10) / 10
        };
    }
}
