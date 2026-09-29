/**
 * iSHARP DBMS 2.0 — Weather Repository
 * Data Access Layer for live weather station telemetry and historical summaries.
 * Tables: weather_logs, weather_hourly_summary
 */

import { supabase } from "../supabase.js";

export class WeatherRepository {
    /**
     * Fetches the latest live weather telemetry log.
     * @returns {Promise<object|null>}
     */
    static async getLatestWeather() {
        try {
            const res = await supabase.request("weather_logs?order=recorded_at.desc&limit=1");
            return (res && res.length > 0) ? res[0] : null;
        } catch (err) {
            console.warn("Could not fetch latest weather:", err);
            return null;
        }
    }

    /**
     * Fetches recent weather logs (e.g. past 24 hours or past N records).
     * @param {number} limit 
     * @returns {Promise<Array<object>>}
     */
    static async getRecentLogs(limit = 48) {
        try {
            const res = await supabase.request(`weather_logs?order=recorded_at.desc&limit=${limit}`);
            return (res || []).reverse(); // chronological order
        } catch (err) {
            console.warn("Could not fetch recent weather logs:", err);
            return [];
        }
    }

    /**
     * Fetches 7-day hourly summary from weather_hourly_summary.
     * @param {number} limit Hours to fetch (default 168 = 7 days)
     * @returns {Promise<Array<object>>}
     */
    static async getHourlySummaries(limit = 168) {
        try {
            const res = await supabase.request(`weather_hourly_summary?order=hour_bucket.desc&limit=${limit}`);
            return (res || []).reverse();
        } catch (err) {
            console.warn("Could not fetch hourly weather summary:", err);
            return [];
        }
    }
}
