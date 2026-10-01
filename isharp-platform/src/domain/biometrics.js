/**
 * iSHARP DBMS 2.0 — Aquaculture Biometrics Calculations
 * PURE DOMAIN FUNCTIONS (No DOM dependencies, No network dependencies)
 */

/**
 * Calculates Day of Culture (DOC) given a stocking date and reference date.
 * If pond is not yet stocked or date is invalid, returns 0.
 * @param {string|Date} stckDate 
 * @param {string|Date} [referenceDate] 
 * @returns {number}
 */
export function calculateDOC(stckDate, referenceDate = new Date()) {
    if (!stckDate) return 0;

    const normalize = (val) => {
        if (!val) return null;
        if (val instanceof Date) {
            return new Date(val.getFullYear(), val.getMonth(), val.getDate());
        }
        if (typeof val === 'string') {
            const parts = val.split('T')[0].split('-').map(Number);
            if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
                return new Date(parts[0], parts[1] - 1, parts[2]);
            }
        }
        const dt = new Date(val);
        return isNaN(dt.getTime()) ? null : new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    };

    const start = normalize(stckDate);
    const end = normalize(referenceDate) || normalize(new Date());

    if (!start || !end) return 0;

    const diffMs = end.getTime() - start.getTime();
    const doc = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(0, doc);
}

/**
 * Calculates estimated Pond Biomass in Kilograms.
 * Formula: (Stocked Pcs * Survival % * ABW in grams) / 1000 / 100
 * @param {number} stockedPcs 
 * @param {number} survivalPct (e.g. 85 for 85%)
 * @param {number} abwGrams 
 * @returns {number} Biomass in kg rounded to 1 decimal place
 */
export function calculateBiomass(stockedPcs, survivalPct, abwGrams) {
    const pcs = Number(stockedPcs) || 0;
    const sr = Number(survivalPct) || 0;
    const abw = Number(abwGrams) || 0;

    if (pcs <= 0 || sr <= 0 || abw <= 0) return 0;
    const biomassKg = (pcs * (sr / 100) * abw) / 1000;
    return Math.round(biomassKg * 10) / 10;
}

/**
 * Calculates Average Daily Gain (ADG) in grams per day between two samplings.
 * Formula: (ABW2 - ABW1) / Days Between
 * @param {number} abwInitial (grams)
 * @param {number} abwFinal (grams)
 * @param {number} days 
 * @returns {number} ADG in g/day rounded to 2 decimal places
 */
export function calculateADG(abwInitial, abwFinal, days) {
    const initial = Number(abwInitial) || 0;
    const final = Number(abwFinal) || 0;
    const d = Number(days) || 0;

    if (d <= 0) return 0;
    const adg = (final - initial) / d;
    return Math.round(adg * 100) / 100;
}

/**
 * Benchmark target standard ABW growth curve for Penaeus vannamei in Setiu farm.
 * @param {number} doc 
 * @returns {number} Standard target ABW in grams
 */
export function getStandardABW(doc) {
    const d = Number(doc) || 0;
    if (d <= 0) return 0;
    if (d < 30) return Math.round((d * 0.12) * 10) / 10;
    if (d < 60) return Math.round((3.6 + (d - 30) * 0.22) * 10) / 10;
    if (d < 90) return Math.round((10.2 + (d - 60) * 0.28) * 10) / 10;
    return Math.round((18.6 + (d - 90) * 0.32) * 10) / 10;
}
