/**
 * iSHARP DBMS 2.0 — Staff Repository
 * Data Access Layer for the Staff Master Directory (pond_staff)
 * and cycle-specific personnel allocations in growout_pond_master.
 */

import { supabase } from "../supabase.js";

export class StaffRepository {
    static _directoryCache = null;

    /**
     * Fetches all active personnel from the master staff directory.
     * Caches in memory for instant typing lookup.
     * @returns {Promise<Array<{ staff_no: string, staff_name: string, staff_position: string }>>}
     */
    static async getStaffDirectory() {
        if (this._directoryCache && this._directoryCache.length > 0) {
            return this._directoryCache;
        }

        try {
            const res = await supabase.request("pond_staff?select=staff_no,staff_name,staff_position,is_active&order=staff_name.asc");
            this._directoryCache = res || [];
            return this._directoryCache;
        } catch (err) {
            console.warn("Could not fetch staff directory from pond_staff:", err);
            return [];
        }
    }

    /**
     * Synchronous lookup of a staff member by ID number from in-memory cache.
     * @param {string} staffNo 
     * @returns {object|null}
     */
    static findStaffByNo(staffNo) {
        if (!staffNo || !this._directoryCache) return null;
        const normalized = String(staffNo).trim().padStart(4, "0"); // Handles "42" -> "0042" as well as exact match
        return this._directoryCache.find(s => s.staff_no === staffNo.trim() || s.staff_no === normalized) || null;
    }

    /**
     * Fetches current personnel assignments for a specific culture cycle (pond_index)
     * from growout_pond_master.
     * @param {string} pondIndex 
     * @returns {Promise<{ pm_staff_no: string, sv_staff_no: string, rl_staff_no: string, po_staff_no: string, support_staff_no: string }|null>}
     */
    static async getCycleStaff(pondIndex) {
        if (!pondIndex) return null;
        try {
            const res = await supabase.request(`growout_pond_master?pond_index=eq.${encodeURIComponent(pondIndex)}&select=pond_index,pm_staff_no,sv_staff_no,rl_staff_no,po_staff_no,support_staff_no`);
            return (res && res.length > 0) ? res[0] : null;
        } catch (err) {
            console.warn("Could not fetch cycle staff from growout_pond_master:", err);
            return null;
        }
    }

    /**
     * Saves personnel assignments for a specific culture cycle to growout_pond_master.
     * @param {string} pondIndex 
     * @param {object} assignments { pm_staff_no, sv_staff_no, rl_staff_no, po_staff_no, support_staff_no }
     * @returns {Promise<any>}
     */
    static async saveCycleStaff(pondIndex, assignments) {
        if (!pondIndex) throw new Error("Missing pond index for staff assignment.");

        const payload = {
            pm_staff_no: assignments.pm_staff_no ? String(assignments.pm_staff_no).trim() : null,
            sv_staff_no: assignments.sv_staff_no ? String(assignments.sv_staff_no).trim() : null,
            rl_staff_no: assignments.rl_staff_no ? String(assignments.rl_staff_no).trim() : null,
            po_staff_no: assignments.po_staff_no ? String(assignments.po_staff_no).trim() : null,
            support_staff_no: assignments.support_staff_no ? String(assignments.support_staff_no).trim() : null
        };

        return await supabase.request(`growout_pond_master?pond_index=eq.${encodeURIComponent(pondIndex)}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
        });
    }
}
