/**
 * iSHARP DBMS 2.0 — Supabase REST Client
 * Robust fetch wrapper with timeout, custom headers, and structured error handling.
 */

import { ENV } from "../config/env.js";

class SupabaseClient {
    constructor() {
        this.baseUrl = ENV.SUPABASE_URL;
        this.apiKey = ENV.SUPABASE_KEY;
    }

    /**
     * Executes a REST API request to Supabase Cloud PostgreSQL
     * @param {string} endpoint e.g. "stocking_records?select=*&limit=10" or "rpc/fn_name"
     * @param {RequestInit} [options] 
     * @returns {Promise<any>}
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}/rest/v1/${endpoint}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), ENV.API_TIMEOUT_MS);

        const headers = {
            "apikey": this.apiKey,
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            "Prefer": "return=representation",
            ...(options.headers || {})
        };

        try {
            const response = await fetch(url, {
                ...options,
                headers,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                let errorDetails = "";
                try {
                    const errJson = await response.json();
                    errorDetails = errJson.message || errJson.hint || JSON.stringify(errJson);
                } catch {
                    errorDetails = await response.text();
                }
                throw new Error(`Supabase Error (${response.status} ${response.statusText}): ${errorDetails}`);
            }

            // For 204 No Content
            if (response.status === 204) return null;

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === "AbortError") {
                throw new Error(`Request timed out after ${ENV.API_TIMEOUT_MS / 1000}s. Please check your network.`);
            }
            throw error;
        }
    }

    /**
     * Executes a PostgreSQL Remote Procedure Call (RPC)
     * @param {string} functionName 
     * @param {object} params 
     * @returns {Promise<any>}
     */
    async rpc(functionName, params = {}) {
        return this.request(`rpc/${functionName}`, {
            method: "POST",
            body: JSON.stringify(params)
        });
    }
}

export const supabase = new SupabaseClient();
