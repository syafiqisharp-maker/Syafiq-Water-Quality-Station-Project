/**
 * iSHARP DBMS 2.0 — Aeration Calculations
 * PURE DOMAIN FUNCTIONS
 */

/**
 * Calculates total active mechanical horsepower across standard pond aerators.
 * Formula: (units1HP * 1.0) + (units2HP * 2.0) + (units4HP * 4.0)
 * @param {number} u1 Count of 1 HP aerators
 * @param {number} u2 Count of 2 HP aerators
 * @param {number} u4 Count of 4 HP aerators
 * @returns {number} Total HP rounded to 1 decimal place
 */
export function calculateTotalActiveHP(u1, u2, u4) {
    const units1 = Math.max(0, parseInt(u1, 10) || 0);
    const units2 = Math.max(0, parseInt(u2, 10) || 0);
    const units4 = Math.max(0, parseInt(u4, 10) || 0);

    const total = (units1 * 1.0) + (units2 * 2.0) + (units4 * 4.0);
    return Math.round(total * 10) / 10;
}

/**
 * Calculates aeration density ratio (HP per Hectare).
 * @param {number} totalHP 
 * @param {number} areaHa (Pond surface area in Hectares)
 * @returns {number} HP/Ha rounded to 1 decimal place
 */
export function calculateAerationDensity(totalHP, areaHa) {
    const hp = Number(totalHP) || 0;
    const area = Number(areaHa) || 0;
    if (area <= 0) return 0;
    return Math.round((hp / area) * 10) / 10;
}
