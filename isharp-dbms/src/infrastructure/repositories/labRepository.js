/**
 * iSHARP DBMS 2.0 — Laboratory Repository
 * Data Access Layer for pond_issues (disease pathology, PCR, biosecurity)
 */

import { supabase } from "../supabase.js";

export class LabRepository {
    /**
     * Fetches pathology and disease issues for a specific pond cycle.
     * @param {string} pondIndex 
     * @returns {Promise<Array<object>>}
     */
    static async getIssuesByPond(pondIndex) {
        if (!pondIndex) return [];
        const endpoint = `pond_issues?pond_index=eq.${encodeURIComponent(pondIndex)}&order=issue_date.desc`;
        try {
            return await supabase.request(endpoint);
        } catch (err) {
            console.warn("Could not fetch laboratory issues:", err);
            return [];
        }
    }

    /**
     * Fetches all recent pathology / disease issues across all active ponds in a single batch.
     * @param {number} [limit=1000]
     * @returns {Promise<Array<object>>}
     */
    static async getAllRecentIssues(limit = 1000) {
        const endpoint = `pond_issues?order=issue_date.desc&limit=${limit}`;
        try {
            return await supabase.request(endpoint) || [];
        } catch (err) {
            console.warn("Could not fetch batch laboratory issues:", err);
            return [];
        }
    }

    /**
     * Inserts a batch of pathology / lab issue records into pond_issues.
     * @param {Array<object>} records 
     * @returns {Promise<any>}
     */
    static async insertBatch(records) {
        if (!records || records.length === 0) return [];
        return await supabase.request("pond_issues", {
            method: "POST",
            body: JSON.stringify(records)
        });
    }
}
