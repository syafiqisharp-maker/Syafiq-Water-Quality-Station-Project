/**
 * iSHARP DBMS 2.0 — Frutiger Aero Minimalist Split Portal
 * Pure 50/50 visual gateway: Blue Archipelago branding, floating bubbles, 3D glass orbs.
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

                <!-- 50/50 Split Stage: Left (Executive Dashboard) vs Right (iSHARP DBMS) -->
                <main class="portal-split-stage" role="main">
                    
                    <!-- LEFT OPTION: Executive Dashboard -->
                    <div class="portal-option-orb" id="btn-portal-executive" role="button" tabindex="0" aria-label="Enter Executive Dashboard">
                        <div class="orb-sphere-shell orb-executive">
                            <svg class="orb-icon" viewBox="0 0 24 24" width="68" height="68" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
                                <line x1="8" y1="2" x2="8" y2="18"></line>
                                <line x1="16" y1="6" x2="16" y2="22"></line>
                            </svg>
                        </div>
                        <h2 class="orb-title">Executive Dashboard</h2>
                    </div>

                    <!-- RIGHT OPTION: iSHARP DBMS -->
                    <div class="portal-option-orb" id="btn-portal-dbms" role="button" tabindex="0" aria-label="Enter iSHARP DBMS">
                        <div class="orb-sphere-shell orb-dbms">
                            <svg class="orb-icon" viewBox="0 0 24 24" width="68" height="68" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
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

            const size = Math.floor(Math.random() * 45) + 16; // 16px to 60px
            const left = Math.random() * 96; // 0% to 96%
            const duration = Math.random() * 8 + 7; // 7s to 15s
            const delay = Math.random() * 6; // 0s to 6s
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
        const btnDbms = document.getElementById("btn-portal-dbms");

        if (btnExec && btnDbms) {
            btnExec.addEventListener("click", () => this.handleSelection("executive", btnExec, btnDbms));
            btnDbms.addEventListener("click", () => this.handleSelection("dbms", btnDbms, btnExec));

            // Keyboard accessibility (Enter or Space)
            [btnExec, btnDbms].forEach(btn => {
                btn.addEventListener("keydown", (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        btn.click();
                    }
                });
            });
        }
    }

    /**
     * Smooth Dive-in Wave Transition
     */
    handleSelection(targetView, selectedEl, unselectedEl) {
        if (this._isTransitioning) return;
        this._isTransitioning = true;

        // 1. Trigger tactile water ripple
        const ripple = document.createElement("div");
        ripple.className = "water-ripple";
        selectedEl.appendChild(ripple);

        // 2. Animate selected vs unselected
        selectedEl.classList.add("selected-animation");
        unselectedEl.classList.add("unselected-animation");

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
                unselectedEl.classList.remove("unselected-animation");
                if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
                this._isTransitioning = false;
            }, 300);
        }, 360);
    }
}
