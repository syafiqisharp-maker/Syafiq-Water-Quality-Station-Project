/**
 * iSHARP DBMS 2.0 — Executive View Module
 * Executive Dashboard featuring 216-Pond Farm Map and Production Analytics.
 */

import { appState } from "../../state/appState.js";
import { PondGridMap } from "./PondGridMap.js";

export class ExecutiveView {
    constructor(containerId = "view-executive") {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.render();
        this.bindEvents();

        // Initialize 216-Pond Interactive Farm Grid Map
        this.gridMap = new PondGridMap("exec-map-container");

        // Listen for cycles change to update KPI strip
        appState.subscribe("cyclesLoaded", (cycles) => this.updateKPIs(cycles));
    }

    render() {
        this.container.innerHTML = `
            <div class="executive-view-layout">
                
                <!-- Executive Header Bar -->
                <header class="exec-header">
                    <div class="exec-header-left">
                        <button class="btn-portal-back" type="button" data-nav-view="portal" title="Return to Portal Landing Page">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="19" y1="12" x2="5" y2="12"></line>
                                <polyline points="12 19 5 12 12 5"></polyline>
                            </svg>
                            <span>Back to Portal</span>
                        </button>
                        
                        <div>
                            <div class="exec-header-title">Executive &amp; Biosecurity Dashboard</div>
                            <div class="exec-header-sub">Blue Archipelago Berhad • Setiu Farm (216 Commercial Ponds)</div>
                        </div>
                    </div>

                    <div class="exec-header-right" style="display: flex; gap: 0.6rem;">
                        <button class="btn-action btn-secondary" type="button" data-nav-view="field-ops" style="font-weight: 700; font-size: 0.82rem; padding: 0.45rem 1rem;">
                            <span>Field Operations ➔</span>
                        </button>
                        <button class="btn-action btn-secondary" type="button" data-nav-view="dbms" style="font-weight: 700; font-size: 0.82rem; padding: 0.45rem 1rem;">
                            <span>Go to Operations DBMS →</span>
                        </button>
                    </div>
                </header>

                <!-- Executive Content Body -->
                <main class="exec-content-body">
                    
                    <!-- KPI Quick Strip -->
                    <section class="exec-kpi-strip" aria-label="Executive KPIs">
                        <div class="exec-kpi-card">
                            <div class="exec-kpi-title">Active Production Ponds</div>
                            <div class="exec-kpi-num" id="exec-kpi-active" style="color: #059669;">137 <span style="font-size: 0.9rem; color: #64748b; font-weight: 500;">/ 216</span></div>
                            <div class="exec-kpi-sub">Culturing across 9 Modules</div>
                        </div>

                        <div class="exec-kpi-card">
                            <div class="exec-kpi-title">Ponds in Preparation / Idle</div>
                            <div class="exec-kpi-num" id="exec-kpi-idle" style="color: #0284c7;">71 <span style="font-size: 0.9rem; color: #64748b; font-weight: 500;">Ponds</span></div>
                            <div class="exec-kpi-sub">Drying, liming &amp; nursery prep</div>
                        </div>

                        <div class="exec-kpi-card">
                            <div class="exec-kpi-title">Species Under Culture</div>
                            <div class="exec-kpi-num" style="color: #0e7490; font-size: 1.35rem;">VAN &amp; MON</div>
                            <div class="exec-kpi-sub">P. vannamei &amp; P. monodon</div>
                        </div>

                        <div class="exec-kpi-card">
                            <div class="exec-kpi-title">Pathogen Biosecurity</div>
                            <div class="exec-kpi-num" id="exec-kpi-health" style="color: #d97706;">Live Monitoring</div>
                            <div class="exec-kpi-sub">Supabase Lab Telemetry Active</div>
                        </div>
                    </section>

                    <!-- SECTION 1: 216-POND INTERACTIVE FARM MAP -->
                    <section class="exec-section-panel" id="exec-farm-map-section">
                        <div class="exec-section-header">
                            <div class="exec-section-title">
                                <span>🗺️ 216-Pond Farm Biosecurity Map</span>
                            </div>
                        </div>
                        <div class="exec-section-body" id="exec-map-container">
                            <div class="placeholder-box">
                                <div class="placeholder-icon">🗺️</div>
                                <div class="placeholder-title">216-Pond Farm Map Ready to Render (Phase 2)</div>
                                <p class="placeholder-desc">
                                    The 18-row × 12-pond grid will render here showing real-time <strong>DOC</strong>, species badge (<strong>VAN / MON</strong>), and cell color driven by laboratory PCR pathogen data (Green, Yellow, Red).
                                </p>
                            </div>
                        </div>
                    </section>

                    <!-- SECTION 2: EXECUTIVE PRODUCTION INTELLIGENCE -->
                    <section class="exec-section-panel" id="exec-production-section">
                        <div class="exec-section-header">
                            <div class="exec-section-title">
                                <span>📈 Executive Production &amp; Biomass Intelligence</span>
                            </div>
                        </div>
                        <div class="exec-section-body" id="exec-production-container">
                            <div class="placeholder-box">
                                <div class="placeholder-icon">📊</div>
                                <div class="placeholder-title">Executive Biomass &amp; Capacity Analytics (Phase 3)</div>
                                <p class="placeholder-desc">
                                    Live standing crop biomass tonnage, culture stage distribution (Early, Mid, Finishing), and upcoming harvest pipeline based on active production ponds.
                                </p>
                            </div>
                        </div>
                    </section>

                    <!-- SECTION 3: BUSINESS PLAN TARGET (PLACEHOLDER AS REQUESTED) -->
                    <section class="exec-section-panel" id="exec-business-plan-section">
                        <div class="exec-section-header">
                            <div class="exec-section-title">
                                <span>🎯 Business Plan Target &amp; Trajectory</span>
                                <span style="font-size: 0.72rem; background: #fef3c7; color: #92400e; padding: 0.2rem 0.6rem; border-radius: 9999px; font-weight: 700;">Pending Business Plan Dataset</span>
                            </div>
                        </div>
                        <div class="exec-section-body">
                            <div class="placeholder-box" style="background: rgba(254, 243, 199, 0.2); border-color: rgba(245, 158, 11, 0.4);">
                                <div class="placeholder-icon">📁</div>
                                <div class="placeholder-title">Business Plan Target Dashboard Pending File</div>
                                <p class="placeholder-desc">
                                    This module is reserved for comparing actual farm biomass trajectory against the corporate business plan targets. We will activate this as soon as you find and supply the target metrics.
                                </p>
                            </div>
                        </div>
                    </section>

                </main>

            </div>
        `;
    }

    bindEvents() {
        // [data-nav-view] is handled globally by ViewRouter
    }

    updateKPIs(cycles) {
        if (!cycles || cycles.length === 0) return;

        const inProd = cycles.filter(c => (c.pond_status || '').toUpperCase() === 'PRODUCTION');
        const idle = cycles.filter(c => (c.pond_status || '').toUpperCase() === 'IDLE');

        const activeEl = document.getElementById("exec-kpi-active");
        if (activeEl) {
            activeEl.innerHTML = `${inProd.length} <span style="font-size: 0.9rem; color: #64748b; font-weight: 500;">/ 216</span>`;
        }

        const idleEl = document.getElementById("exec-kpi-idle");
        if (idleEl) {
            idleEl.innerHTML = `${idle.length} <span style="font-size: 0.9rem; color: #64748b; font-weight: 500;">Ponds</span>`;
        }
    }
}
