/**
 * iSHARP DBMS 2.0 — Frutiger Aero 3-Orb Gateway Portal
 * Pure 3-way visual gateway: Blue Archipelago branding, floating bubbles,
 * 3D glass orbs for Executive Dashboard, Field Operations, and iSHARP DBMS.
 */

import { appState } from "../../state/appState.js";

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
                    <span class="portal-subtag">iSHARP Aquaculture Platform</span>
                </header>

                <!-- 3-Orb Split Stage: Executive vs Field Operations vs iSHARP DBMS -->
                <main class="portal-split-stage" role="main">
                    
                    <!-- 1. LEFT OPTION: Executive Dashboard -->
                    <div class="portal-option-orb" id="btn-portal-executive" role="button" tabindex="0" aria-label="Enter Executive Dashboard">
                        <div class="orb-sphere-shell orb-executive">
                            <svg class="orb-icon" viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
                                <line x1="8" y1="2" x2="8" y2="18"></line>
                                <line x1="16" y1="6" x2="16" y2="22"></line>
                            </svg>
                        </div>
                        <h2 class="orb-title">Executive Dashboard</h2>
                    </div>

                    <!-- 2. CENTER OPTION: Field Operations (WQS Station) -->
                    <div class="portal-option-orb" id="btn-portal-field-ops" role="button" tabindex="0" aria-label="Enter Field Operations">
                        <div class="orb-sphere-shell orb-field-ops">
                            <svg class="orb-icon" viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
                                <path d="M12 9v4"></path>
                                <path d="M12 17h.01"></path>
                            </svg>
                        </div>
                        <h2 class="orb-title">Field Operations</h2>
                    </div>

                    <!-- 3. RIGHT OPTION: iSHARP DBMS -->
                    <div class="portal-option-orb" id="btn-portal-dbms" role="button" tabindex="0" aria-label="Enter iSHARP DBMS">
                        <div class="orb-sphere-shell orb-dbms">
                            <svg class="orb-icon" viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
                            </svg>
                        </div>
                        <h2 class="orb-title">iSHARP DBMS</h2>
                    </div>

                </main>

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

        const orbs = [btnExec, btnFieldOps, btnDbms].filter(Boolean);

        if (btnExec) {
            btnExec.addEventListener("click", () => this.handleSelection("executive", btnExec, [btnFieldOps, btnDbms]));
        }
        if (btnFieldOps) {
            btnFieldOps.addEventListener("click", () => this.handleSelection("field-ops", btnFieldOps, [btnExec, btnDbms]));
        }
        if (btnDbms) {
            btnDbms.addEventListener("click", () => this.handleSelection("dbms", btnDbms, [btnExec, btnFieldOps]));
        }

        orbs.forEach(btn => {
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
