/**
 * iSHARP DBMS 2.0 — Frutiger Aero Orbital Gateway Portal
 * Orbital Hub-and-Spoke Constellation:
 * - Center Hub: Executive Dashboard (Macro Intelligence)
 * - 6 Surrounding Satellites:
 *   1. Field Operations (Active)
 *   2. iSHARP DBMS (Active)
 *   3. Telaga Putat Hatchery (Upcoming)
 *   4. Lab & QA/QC (Upcoming)
 *   5. iSHARP Simulator (Upcoming)
 *   6. Future Expansion (Upcoming)
 * - Mobile View: Collapses to single column with Field Operations at the very top.
 */

import { appState } from "../../state/appState.js";
import { Toast } from "../../components/Toast.js";

export class LandingPage {
    constructor(containerId = "view-portal", router = null) {
        this.container = document.getElementById(containerId);
        this.router = router;
        if (!this.container) return;

        this.render();
        this.initBubbles();
        this.bindEvents();
    }

    setRouter(router) {
        this.router = router;
    }

    render() {
        this.container.innerHTML = `
            <div class="portal-fullscreen">
                
                <!-- Floating Animated Bubbles Chamber -->
                <div class="bubble-chamber" id="bubble-chamber" aria-hidden="true"></div>

                <!-- Top Brand Header: Official Blue Archipelago Logo -->
                <header class="portal-brand-header">
                    <div class="portal-logo-glass-frame" title="Blue Archipelago Berhad">
                        <img 
                            src="/assets/blue-archipelago-logo.png" 
                            alt="Blue Archipelago Berhad" 
                            class="portal-official-logo"
                            onerror="this.onerror=null; this.src='https://www.bluearchipelago.com/wp-content/uploads/2022/06/blue-archipelago-logo-color.png';"
                        />
                    </div>
                    <span class="portal-subtag">BAB Aquaculture Platform</span>
                </header>

                <!-- Orbital Constellation Stage (Hub & Spoke) -->
                <main class="portal-orbital-stage" role="main">
                    
                    <!-- Faint Orbit Ring Background (Desktop) -->
                    <div class="orbital-ring-track" aria-hidden="true"></div>
                    <div class="orbital-ring-track-inner" aria-hidden="true"></div>

                    <!-- 1. CENTER NUCLEUS: Executive Dashboard -->
                    <div class="portal-option-orb orb-center-hub" id="btn-portal-executive" role="button" tabindex="0" aria-label="Enter Executive Dashboard">
                        <div class="orb-sphere-shell orb-executive">
                            <svg class="orb-icon" viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
                                <line x1="8" y1="2" x2="8" y2="18"></line>
                                <line x1="16" y1="6" x2="16" y2="22"></line>
                            </svg>
                        </div>
                        <div class="orb-content">
                            <h2 class="orb-title">Executive Dashboard</h2>
                        </div>
                    </div>

                    <!-- 2. SATELLITE 1 (Top-Left): Field Operations (ACTIVE) -->
                    <div class="portal-option-orb orb-satellite pos-top-left" id="btn-portal-field-ops" role="button" tabindex="0" aria-label="Enter Field Operations">
                        <div class="orb-sphere-shell orb-field-ops">
                            <svg class="orb-icon" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
                                <path d="M12 9v4"></path>
                                <path d="M12 17h.01"></path>
                            </svg>
                        </div>
                        <div class="orb-content">
                            <h2 class="orb-title">Field Operations</h2>
                            <span class="orb-badge-active show-mobile">PRIMARY FIELD APP</span>
                        </div>
                    </div>

                    <!-- 3. SATELLITE 2 (Top-Right): iSHARP DBMS (ACTIVE) -->
                    <div class="portal-option-orb orb-satellite pos-top-right" id="btn-portal-dbms" role="button" tabindex="0" aria-label="Enter iSHARP DBMS">
                        <div class="orb-sphere-shell orb-dbms">
                            <svg class="orb-icon" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
                            </svg>
                        </div>
                        <div class="orb-content">
                            <h2 class="orb-title">iSHARP DBMS</h2>
                        </div>
                    </div>

                    <!-- MOBILE DIVIDER FOR PLANNED MODULES -->
                    <div class="portal-upcoming-divider show-mobile" aria-hidden="true">
                        <span>Planned System Expansions</span>
                    </div>

                    <!-- 4. SATELLITE 3 (Mid-Left): Telaga Putat Hatchery (UPCOMING) -->
                    <div class="portal-option-orb orb-satellite pos-mid-left orb-disabled" id="btn-portal-hatchery" role="button" tabindex="0" aria-label="Telaga Putat Hatchery (Upcoming)">
                        <div class="orb-sphere-shell orb-upcoming">
                            <svg class="orb-icon" aria-hidden="true" viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="#0369a1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"></path>
                                <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"></path>
                                <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"></path>
                            </svg>
                        </div>
                        <div class="orb-content">
                            <div class="orb-title-row">
                                <h2 class="orb-title">Telaga Putat Hatchery</h2>
                                <span class="orb-badge-upcoming">Upcoming</span>
                            </div>
                        </div>
                    </div>

                    <!-- 5. SATELLITE 4 (Mid-Right): Lab & QA/QC (UPCOMING) -->
                    <div class="portal-option-orb orb-satellite pos-mid-right orb-disabled" id="btn-portal-lab" role="button" tabindex="0" aria-label="Lab & QA/QC (Upcoming)">
                        <div class="orb-sphere-shell orb-upcoming">
                            <svg class="orb-icon" aria-hidden="true" viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="#0369a1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M10 2v7.31"></path>
                                <path d="M14 9.3V1.99"></path>
                                <path d="M8.5 2h7"></path>
                                <path d="M14 9.3a6.5 6.5 0 1 1-4 0"></path>
                                <path d="M5.52 16h12.96"></path>
                            </svg>
                        </div>
                        <div class="orb-content">
                            <div class="orb-title-row">
                                <h2 class="orb-title">Lab &amp; QA/QC</h2>
                                <span class="orb-badge-upcoming">Upcoming</span>
                            </div>
                        </div>
                    </div>

                    <!-- 6. SATELLITE 5 (Bottom-Left): iSHARP Simulator (UPCOMING) -->
                    <div class="portal-option-orb orb-satellite pos-bottom-left orb-disabled" id="btn-portal-simulator" role="button" tabindex="0" aria-label="iSHARP Simulator (Upcoming)">
                        <div class="orb-sphere-shell orb-upcoming">
                            <svg class="orb-icon" aria-hidden="true" viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="#0369a1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                                <line x1="12" y1="22.08" x2="12" y2="12"></line>
                            </svg>
                        </div>
                        <div class="orb-content">
                            <div class="orb-title-row">
                                <h2 class="orb-title">iSHARP Simulator</h2>
                                <span class="orb-badge-upcoming">Upcoming</span>
                            </div>
                        </div>
                    </div>

                    <!-- 7. SATELLITE 6 (Bottom-Right): Future Expansion (UPCOMING) -->
                    <div class="portal-option-orb orb-satellite pos-bottom-right orb-disabled" id="btn-portal-future" role="button" tabindex="0" aria-label="Future Expansion">
                        <div class="orb-sphere-shell orb-upcoming orb-placeholder">
                            <svg class="orb-icon" aria-hidden="true" viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="#0369a1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
                                <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path>
                                <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"></path>
                                <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path>
                            </svg>
                        </div>
                        <div class="orb-content">
                            <div class="orb-title-row">
                                <h2 class="orb-title">Future Expansion</h2>
                                <span class="orb-badge-upcoming">Reserved</span>
                            </div>
                        </div>
                    </div>

                </main>

                <footer class="portal-minimal-footer">
                    <span>Blue Archipelago Berhad &bull; Aquaculture Platform 2026</span>
                </footer>

            </div>
        `;
    }

    /**
     * Spawns translucent floating Frutiger Aero bubbles at varying depths and speeds
     */
    initBubbles() {
        const chamber = document.getElementById("bubble-chamber");
        if (!chamber) return;

        const bubbleCount = 20;
        chamber.innerHTML = "";

        for (let i = 0; i < bubbleCount; i++) {
            const bubble = document.createElement("div");
            bubble.className = "aero-bubble";

            const size = Math.floor(Math.random() * 45) + 16;
            const left = Math.random() * 96;
            const duration = Math.random() * 8 + 7;
            const delay = Math.random() * 6;
            const opacity = (Math.random() * 0.4 + 0.35).toFixed(2);

            bubble.style.width = `${size}px`;
            bubble.style.height = `${size}px`;
            bubble.style.left = `${left}%`;
            bubble.style.animationDuration = `${duration}s`;
            bubble.style.animationDelay = `${delay}s`;
            bubble.style.opacity = opacity;

            chamber.appendChild(bubble);
        }
    }

    bindEvents() {
        const btnExec = document.getElementById("btn-portal-executive");
        const btnFieldOps = document.getElementById("btn-portal-field-ops");
        const btnDbms = document.getElementById("btn-portal-dbms");

        const btnHatchery = document.getElementById("btn-portal-hatchery");
        const btnLab = document.getElementById("btn-portal-lab");
        const btnSimulator = document.getElementById("btn-portal-simulator");
        const btnFuture = document.getElementById("btn-portal-future");

        const activeOrbs = [btnExec, btnFieldOps, btnDbms].filter(Boolean);

        if (btnExec) {
            btnExec.addEventListener("click", () => this.handleSelection("executive", btnExec, [btnFieldOps, btnDbms]));
        }
        if (btnFieldOps) {
            btnFieldOps.addEventListener("click", () => this.handleSelection("field-ops", btnFieldOps, [btnExec, btnDbms]));
        }
        if (btnDbms) {
            btnDbms.addEventListener("click", () => this.handleSelection("dbms", btnDbms, [btnExec, btnFieldOps]));
        }

        // Informative toasts for upcoming modules
        if (btnHatchery) {
            btnHatchery.addEventListener("click", () => Toast.info("🌊 Telaga Putat Hatchery module is currently under development."));
        }
        if (btnLab) {
            btnLab.addEventListener("click", () => Toast.info("🔬 Lab & QA/QC module is currently under development."));
        }
        if (btnSimulator) {
            btnSimulator.addEventListener("click", () => Toast.info("🕹️ iSHARP Digital Twin Simulator is currently under development."));
        }
        if (btnFuture) {
            btnFuture.addEventListener("click", () => Toast.info("🚀 Future Expansion slot reserved for upcoming Blue Archipelago operations."));
        }

        // Accessibility: Keyboard navigation
        const allOrbs = [btnExec, btnFieldOps, btnDbms, btnHatchery, btnLab, btnSimulator, btnFuture].filter(Boolean);
        allOrbs.forEach(btn => {
            btn.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    btn.click();
                }
            });
        });
    }

    /**
     * Smooth Dive-in Wave Transition
     * @param {string} targetView 
     * @param {HTMLElement} selectedEl 
     * @param {Array<HTMLElement>} otherEls 
     */
    handleSelection(targetView, selectedEl, otherEls = []) {
        if (this._isTransitioning) return;
        this._isTransitioning = true;

        // 1. Trigger tactile water ripple
        const ripple = document.createElement("div");
        ripple.className = "water-ripple";
        selectedEl.appendChild(ripple);

        // 2. Animate selected vs unselected
        selectedEl.classList.add("selected-animation");
        otherEls.forEach(el => {
            if (el) el.classList.add("unselected-animation");
        });

        // 3. Execute navigation after 360ms
        setTimeout(() => {
            if (this.router) {
                this.router.navigate(targetView);
            } else {
                window.location.hash = `#/${targetView}`;
            }

            // Reset animation state for when user comes back
            setTimeout(() => {
                selectedEl.classList.remove("selected-animation");
                otherEls.forEach(el => {
                    if (el) el.classList.remove("unselected-animation");
                });
                if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
                this._isTransitioning = false;
            }, 300);
        }, 360);
    }
}

