/**
 * iSHARP DBMS 2.0 — Feeding Calculations
 * PURE DOMAIN FUNCTIONS
 */

/**
 * Calculates Feed Conversion Ratio (FCR).
 * Formula: Total Feed (kg) / Net Biomass Gain (kg)
 * @param {number} totalFeedKg 
 * @param {number} netBiomassGainKg 
 * @returns {number} FCR rounded to 2 decimal places
 */
export function calculateFCR(totalFeedKg, netBiomassGainKg) {
    const feed = Number(totalFeedKg) || 0;
    const gain = Number(netBiomassGainKg) || 0;
    if (gain <= 0 || feed <= 0) return 0;
    return Math.round((feed / gain) * 100) / 100;
}

/**
 * Calculates Daily Feeding Rate as a percentage of estimated total biomass.
 * Formula: (Daily Feed in kg / Current Biomass in kg) * 100
 * @param {number} dailyFeedKg 
 * @param {number} currentBiomassKg 
 * @returns {number} Feeding rate % rounded to 2 decimal places
 */
export function calculateFeedingRatePct(dailyFeedKg, currentBiomassKg) {
    const feed = Number(dailyFeedKg) || 0;
    const bio = Number(currentBiomassKg) || 0;
    if (bio <= 0 || feed <= 0) return 0;
    return Math.round(((feed / bio) * 100) * 100) / 100;
}
