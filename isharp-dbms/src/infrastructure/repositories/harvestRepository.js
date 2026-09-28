/**
 * iSHARP DBMS 2.0 — Harvest Repository
 * Data Access Layer for pond_harvest_daily and pond_harvest_sales
 */

import { supabase } from "../supabase.js";

export class HarvestRepository {
    /**
     * Fetches daily harvest records for a pond cycle.
     * @param {string} pondIndex 
     * @returns {Promise<Array<object>>}
     */
    static async getHarvestDaily(pondIndex) {
        if (!pondIndex) return [];
        const endpoint = `pond_harvest_daily?select=id,pond_index,harv_date,harv_status,harv_weight,harv_abw,harv_revenue,harv_method&pond_index=eq.${encodeURIComponent(pondIndex)}&order=harv_date.asc`;
        return (await supabase.request(endpoint)) || [];
    }

    /**
     * Fetches sales transactions associated with a pond harvest.
     * @param {string} pondIndex 
     * @returns {Promise<Array<object>>}
     */
    static async getHarvestSales(pondIndex) {
        if (!pondIndex) return [];
        const endpoint = `pond_harvest_sales?select=id,pond_index,hvt_date,hvt_buyer,hvt_abw,good_wgt,good_prc,second_grade_wgt,second_grade_prc,small_wgt,below_wgt,rubbish_wgt,net_sales&pond_index=eq.${encodeURIComponent(pondIndex)}&order=hvt_date.asc`;
        return (await supabase.request(endpoint)) || [];
    }

    /**
     * Computes cumulative harvest summary (total kg and total revenue) for a cycle.
     * @param {string} pondIndex 
     * @returns {Promise<{totalWeightKg: number, totalRevenue: number, hasHarvest: boolean}>}
     */
    static async getHarvestSummary(pondIndex) {
        const records = await this.getHarvestDaily(pondIndex);
        if (!records || records.length === 0) {
            return { totalWeightKg: 0, totalRevenue: 0, hasHarvest: false };
        }
        let totalWeightKg = 0;
        let totalRevenue = 0;
        records.forEach(r => {
            totalWeightKg += parseFloat(r.harv_weight || 0);
            totalRevenue += parseFloat(r.harv_revenue || 0);
        });
        return {
            totalWeightKg: Math.round(totalWeightKg * 10) / 10,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            hasHarvest: totalWeightKg > 0
        };
    }

    /**
     * Inserts a batch of harvest daily records.
     * @param {Array<object>} records 
     * @returns {Promise<any>}
     */
    static async insertBatch(records) {
        if (!records || records.length === 0) return [];
        return await supabase.request("pond_harvest_daily", {
            method: "POST",
            body: JSON.stringify(records)
        });
    }
}

