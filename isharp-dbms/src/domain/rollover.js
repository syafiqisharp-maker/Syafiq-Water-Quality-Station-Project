/**
 * iSHARP DBMS 2.0 — Cycle Rollover & Index Rules
 * PURE DOMAIN FUNCTIONS
 */

/**
 * Extracts the base pond number and cycle number from a pond_index (e.g., '2010212.43' -> { base: '2010212', cycle: 43 })
 * @param {string} pondIndex 
 * @returns {{ base: string, cycle: number, nextIndex: string }}
 */
export function parsePondIndex(pondIndex) {
    if (!pondIndex || typeof pondIndex !== "string") {
        return { base: "", cycle: 0, nextIndex: "" };
    }

    const parts = pondIndex.trim().split(".");
    const base = parts[0] || "";
    const cycle = parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0;
    const nextCycle = cycle + 1;
    const nextIndex = `${base}.${nextCycle}`;

    return { base, cycle, nextIndex };
}

/**
 * Formats physical pond code (e.g. "01.02.12" or "Pond 01.02.12")
 * @param {string} pond 
 * @returns {string}
 */
export function formatPondLabel(pond) {
    if (!pond) return "Unknown Pond";
    return String(pond).trim();
}

/**
 * Validates whether a pond cycle is eligible for termination/rollover.
 * @param {object} pond 
 * @returns {{ eligible: boolean, reason?: string }}
 */
export function validateRolloverEligibility(pond) {
    if (!pond) {
        return { eligible: false, reason: "No pond cycle selected." };
    }
    const status = String(pond.status || "").toUpperCase();
    if (status === "CLOSE" || status === "IN ACTIVE" || status === "INACTIVE") {
        return { eligible: false, reason: "This cycle is already closed. Please select an active cycle to terminate." };
    }
    return { eligible: true };
}
