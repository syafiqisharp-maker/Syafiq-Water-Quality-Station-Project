/**
 * iSHARP DBMS 2.0 — Sampling Repository
 * Data Access Layer for biometrics_sampling
 */

import { supabase } from "../supabase.js";

export class SamplingRepository {
    /**
     * Fetches all biometrics sampling records for a given pond cycle.
     * @param {string} pondIndex 
     * @returns {Promise<Array<object>>}
     */
    static async getSamplingByPond(pondIndex) {
        if (!pondIndex) return [];
        const endpoint = `biometrics_sampling?pond_index=eq.${encodeURIComponent(pondIndex)}&order=smpl_doc.desc`;
        return await supabase.request(endpoint);
    }

    /**
     * Inserts a batch of parsed sampling records into biometrics_sampling.
     * @param {Array<object>} records 
     * @returns {Promise<any>}
     */
    static async insertBatch(records) {
        if (!records || records.length === 0) return [];
        return await supabase.request("biometrics_sampling", {
            method: "POST",
            body: JSON.stringify(records)
        });
    }
}
