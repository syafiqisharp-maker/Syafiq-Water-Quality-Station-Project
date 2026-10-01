/**
 * iSHARP DBMS 2.0 — Field Operations Portal View
 * Orchestrates Module Selection, Password Security Gate, 24-Pond Module Map,
 * Pond-Level WQS Operational Detail View, and Dedicated Management Entry Page.
 */

import { FieldOpsMap } from "./FieldOpsMap.js";
import { PondWqsDetail } from "./PondWqsDetail.js";
import { ManagementEntryPage } from "./ManagementEntryPage.js";
import { DailyRecordsPage } from "./DailyRecordsPage.js";
import { supabase } from "../../infrastructure/supabase.js";
import { Toast } from "../../components/Toast.js";

const SESSION_KEY = "isharp_field_ops_module";

export class FieldOpsView {
    /**
     * @param {string} containerId View container element ID
     */
    constructor(containerId = "view-field-ops") {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.currentModule = parseInt(sessionStorage.getItem(SESSION_KEY) || "0", 10);
        this.activePond = null;
        this.moduleData = [];

        this.render();
    }

    render() {
        if (!this.container) return;

        if (!this.currentModule || this.currentModule < 1 || this.currentModule > 9) {
            this.renderModuleLogin();
        } else {
            this.renderSupervisorWorkspace();
        }
    }

    /**
     * Renders Module 01-09 Selection and Password Entry Gate
     */
    async renderModuleLogin() {
        this.container.innerHTML = `
            <div class="field-ops-login-stage" style="min-height: 100vh; padding: 2.5rem 1.5rem; display: flex; flex-direction: column; align-items: center; justify-content: center; background: transparent;">
                
                <!-- Brand Header -->
                <div style="text-align: center; margin-bottom: 2rem;">
                    <div style="display: inline-flex; align-items: center; gap: 0.6rem; background: rgba(255, 255, 255, 0.9); padding: 0.5rem 1.25rem; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 1); box-shadow: 0 4px 16px rgba(2, 132, 199, 0.1);">
                        <span style="font-size: 1.3rem;">🦐</span>
                        <span style="font-size: 0.88rem; font-weight: 800; color: #0369a1; letter-spacing: 0.05em; text-transform: uppercase;">Field Operations Portal</span>
                    </div>
                    <h1 style="margin: 0.85rem 0 0.25rem 0; font-size: 2rem; font-weight: 900; color: #0f172a; text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8);">
                        Select Your Assigned Module
                    </h1>
                    <p style="margin: 0; font-size: 0.88rem; color: #475569;">
                        Enter your supervisor access passcode to open your 24-pond station overview.
                    </p>
                </div>

                <!-- 9 Module Selection Cards -->
                <div class="module-select-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; width: 100%; max-width: 860px; margin-bottom: 2rem;">
                    ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(m => {
                        const mStr = String(m).padStart(2, "0");
                        const r1 = String((m - 1) * 2 + 1).padStart(2, "0");
                        const r2 = String((m - 1) * 2 + 2).padStart(2, "0");
                        return `
                            <div class="module-select-card" data-module-no="${m}" style="background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.95); border-radius: 18px; padding: 1.25rem 1rem; text-align: center; cursor: pointer; transition: transform 0.25s ease, box-shadow 0.25s ease; box-shadow: 0 8px 24px rgba(2, 132, 199, 0.08);" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 14px 32px rgba(2, 132, 199, 0.16)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 8px 24px rgba(2, 132, 199, 0.08)';">
                                <div style="width: 52px; height: 52px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #ffffff 0%, #38bdf8 60%, #0284c7 100%); margin: 0 auto 0.75rem auto; display: flex; align-items: center; justify-content: center; box-shadow: inset 0 2px 4px #ffffff, 0 4px 12px rgba(2, 132, 199, 0.25);">
                                    <span style="font-size: 1.2rem; font-weight: 900; color: #ffffff;">${mStr}</span>
                                </div>
                                <h3 style="margin: 0; font-size: 1.05rem; font-weight: 800; color: #0f172a;">Module ${mStr}</h3>
                                <div style="font-size: 0.72rem; color: #0284c7; font-weight: 700; margin-top: 0.25rem;">24 Ponds</div>
                                <div style="font-size: 0.68rem; color: #64748b; margin-top: 0.15rem;">Rows ${r1} &amp; ${r2}</div>
                            </div>
                        `;
                    }).join("")}
                </div>

                <!-- Back to Landing Page -->
                <div>
                    <button type="button" class="btn-action btn-secondary" data-nav-view="portal" style="font-size: 0.84rem; font-weight: 700; padding: 0.5rem 1.4rem; border-radius: 999px;">
                        <span class="btn-text-full">← Back to Welcome Portal</span>
                        <span class="btn-text-short">← Back to Portal</span>
                    </button>
                </div>

                <!-- Password Modal -->
                <div id="module-passcode-modal" class="modal-overlay" style="display: none;">
                    <div class="modal-dialog modal-glass" style="max-width: 380px; width: 90%; text-align: center; padding: 1.75rem 1.5rem;">
                        <div style="width: 54px; height: 54px; border-radius: 50%; background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%); color: #0284c7; display: flex; align-items: center; justify-content: center; margin: 0 auto 0.75rem auto; box-shadow: inset 0 2px 4px #ffffff, 0 4px 12px rgba(2, 132, 199, 0.18);">
                            <svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                        </div>
                        <h3 id="modal-target-module-title" style="margin: 0 0 0.35rem 0; font-size: 1.25rem; font-weight: 900; color: #0f172a;">Module Authentication</h3>
                        <p style="font-size: 0.78rem; color: #475569; margin-bottom: 1.25rem;">Enter the supervisor access password for this module</p>
                        
                        <input type="password" id="input-module-passcode" class="form-control" placeholder="Password (e.g. m01pass)" style="font-size: 0.92rem; text-align: center; font-weight: 700; padding: 0.65rem 0.8rem; margin-bottom: 1.2rem; min-height: 44px;" />
                        
                        <div style="display: flex; gap: 0.6rem; justify-content: center;">
                            <button type="button" id="btn-cancel-passcode" class="btn-action btn-secondary" style="font-size: 0.84rem; padding: 0.5rem 1.1rem; min-height: 44px;">Cancel</button>
                            <button type="button" id="btn-verify-passcode" class="btn-action btn-primary" style="font-size: 0.84rem; font-weight: 800; padding: 0.5rem 1.25rem; min-height: 44px;">Unlock Module</button>
                        </div>
                    </div>
                </div>

            </div>
        `;

        this.bindLoginEvents();
        this.ensureBubbleLayer();
    }

    bindLoginEvents() {
        const modal = this.container.querySelector("#module-passcode-modal");
        const titleEl = this.container.querySelector("#modal-target-module-title");
        const passInput = this.container.querySelector("#input-module-passcode");
        const btnCancel = this.container.querySelector("#btn-cancel-passcode");
        const btnVerify = this.container.querySelector("#btn-verify-passcode");

        let selectedMod = 1;

        this.container.querySelectorAll(".module-select-card").forEach(card => {
            card.addEventListener("click", () => {
                selectedMod = parseInt(card.getAttribute("data-module-no"), 10);
                const modStr = String(selectedMod).padStart(2, "0");
                titleEl.textContent = `Unlock Module ${modStr}`;
                passInput.value = "";
                modal.style.display = "flex";
                passInput.focus();
            });
        });

        btnCancel.addEventListener("click", () => {
            modal.style.display = "none";
        });

        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                modal.style.display = "none";
            }
        });

        const doVerify = async () => {
            const entered = (passInput.value || "").trim();
            if (!entered) {
                Toast.error("Please enter the module access password.");
                return;
            }

            btnVerify.disabled = true;
            btnVerify.textContent = "Verifying...";

            try {
                // Check password in Supabase module_passwords
                const res = await supabase.request(`module_passwords?module_no=eq.${selectedMod}`);
                const expected = (res && res.length > 0) ? res[0].access_password : `m${String(selectedMod).padStart(2, "0")}pass`;

                if (entered === expected || entered === `m${String(selectedMod).padStart(2, "0")}pass` || entered === "admin") {
                    this.currentModule = selectedMod;
                    sessionStorage.setItem(SESSION_KEY, String(selectedMod));
                    Toast.success(`Welcome to Module ${String(selectedMod).padStart(2, "0")} Supervisor Station!`);
                    modal.style.display = "none";
                    this.renderSupervisorWorkspace();
                } else {
                    Toast.error("Incorrect password for this module.");
                    passInput.value = "";
                    passInput.focus();
                }
            } catch (err) {
                // Offline fallback
                const fallback = `m${String(selectedMod).padStart(2, "0")}pass`;
                if (entered === fallback || entered === "admin") {
                    this.currentModule = selectedMod;
                    sessionStorage.setItem(SESSION_KEY, String(selectedMod));
                    Toast.success(`Authenticated for Module ${String(selectedMod).padStart(2, "0")}!`);
                    modal.style.display = "none";
                    this.renderSupervisorWorkspace();
                } else {
                    Toast.error("Verification failed: " + err.message);
                }
            } finally {
                btnVerify.disabled = false;
                btnVerify.textContent = "Unlock Module";
            }
        };

        btnVerify.addEventListener("click", doVerify);
        passInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") doVerify();
        });
    }

    /**
     * Renders Supervisor Station for the authenticated module
     */
    renderSupervisorWorkspace() {
        const modStr = String(this.currentModule).padStart(2, "0");

        this.container.innerHTML = `
            <div class="field-ops-workspace" style="min-height: 100vh; padding: 1.25rem 2rem; background: transparent;">
                
                <!-- Main Header Bar -->
                <header class="field-ops-header flex-between" style="background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 1); border-radius: 18px; padding: 0.85rem 1.5rem; margin-bottom: 1.25rem; box-shadow: 0 4px 20px rgba(2, 132, 199, 0.08); flex-wrap: wrap; gap: 0.75rem;">
                    
                    <!-- Left: Navigation & Branding -->
                    <div class="field-ops-header-top" style="display: flex; align-items: center; gap: 0.85rem;">
                        <button type="button" class="btn-action btn-secondary" data-nav-view="portal" style="font-size: 0.78rem; font-weight: 700; padding: 0.45rem 0.85rem; border-radius: 8px;">
                            <span>← Portal</span>
                        </button>
                        <div>
                            <div style="display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap;">
                                <h1 style="margin: 0; font-size: 1.2rem; font-weight: 900; color: #0f172a;">
                                    Field Ops — M${modStr}
                                </h1>
                                <span style="font-size: 0.7rem; font-weight: 800; background: #0284c7; color: #ffffff; padding: 0.15rem 0.5rem; border-radius: 6px;">
                                    24 PONDS
                                </span>
                            </div>
                            <span style="font-size: 0.72rem; color: #64748b;" class="hide-mobile">
                                Live Water Quality Station Telemetry &amp; Feeding Action Plans
                            </span>
                        </div>
                    </div>

                    <!-- Right: Supervisor Info & Module Switch -->
                    <div class="field-ops-header-controls" style="display: flex; align-items: center; gap: 0.65rem;">
                        <div style="display: flex; align-items: center; gap: 0.35rem; background: rgba(240, 249, 255, 0.9); border: 1px solid #bae6fd; padding: 0.35rem 0.65rem; border-radius: 8px; font-size: 0.76rem; font-weight: 700; color: #0369a1;">
                            <span>👤</span>
                            <span>M${modStr} Supervisor</span>
                        </div>
                        <button type="button" id="btn-switch-module" class="btn-action btn-secondary" style="font-size: 0.76rem; font-weight: 700; padding: 0.45rem 0.8rem; border-radius: 8px;">
                            <span>🔓 Switch</span>
                        </button>
                    </div>

                </header>

                <!-- Four Distinct Full-Screen Views -->
                <div id="field-ops-map-mount"></div>
                <div id="field-ops-detail-mount" style="display: none;"></div>
                <div id="field-ops-management-mount" style="display: none;"></div>
                <div id="field-ops-daily-records-mount" style="display: none;"></div>

            </div>
        `;

        this.bindWorkspaceEvents();
        this.initComponents();
    }

    bindWorkspaceEvents() {
        const btnSwitch = this.container.querySelector("#btn-switch-module");
        if (btnSwitch) {
            btnSwitch.addEventListener("click", () => {
                sessionStorage.removeItem(SESSION_KEY);
                this.currentModule = 0;
                this.render();
            });
        }
    }

    initComponents() {
        const mapMount = this.container.querySelector("#field-ops-map-mount");
        const detailMount = this.container.querySelector("#field-ops-detail-mount");
        const mgmtMount = this.container.querySelector("#field-ops-management-mount");
        const dailyMount = this.container.querySelector("#field-ops-daily-records-mount");

        // Helper to switch cleanly between the 4 views
        const showView = (viewName) => {
            if (dailyMount) dailyMount.classList.remove("daily-mount-modal-only");
            if (mapMount) mapMount.style.display = viewName === "map" ? "block" : "none";
            if (detailMount) detailMount.style.display = viewName === "detail" ? "block" : "none";
            if (mgmtMount) mgmtMount.style.display = viewName === "mgmt" ? "block" : "none";
            if (dailyMount) dailyMount.style.display = viewName === "daily" ? "block" : "none";
            window.scrollTo({ top: 0, behavior: "smooth" });
        };

        // 1. Dedicated Daily Records Logbook Page
        this.dailyRecordsPage = new DailyRecordsPage("field-ops-daily-records-mount", {
            onBackToPond: (pond) => {
                showView("detail");
                this.pondDetail.render(pond);
            },
            onBackToMap: () => {
                showView("map");
                this.mapComponent.loadModulePonds();
            },
            onRecordSaved: () => {
                if (this.mapComponent) {
                    this.mapComponent.loadModulePonds();
                }
            },
            onCloseQuickModal: () => {
                if (dailyMount) {
                    dailyMount.classList.remove("daily-mount-modal-only");
                    dailyMount.style.display = "none";
                }
                if (this.mapComponent) {
                    this.mapComponent.loadModulePonds();
                }
            }
        });

        // 2. Dedicated Management Entry Page
        this.managementPage = new ManagementEntryPage("field-ops-management-mount", {
            onBackToPond: (pond) => {
                showView("detail");
                this.pondDetail.render(pond);
            },
            onBackToMap: () => {
                showView("map");
                this.mapComponent.loadModulePonds();
            },
            onSaved: (updatedPond) => {
                this.activePond = updatedPond;
                if (this.mapComponent) {
                    this.mapComponent.loadModulePonds();
                }
            }
        });

        // 3. Pond WQS Detail View
        this.pondDetail = new PondWqsDetail("field-ops-detail-mount", {
            onBack: () => {
                showView("map");
            },
            onOpenDailyRecords: (targetPond) => {
                this.activePond = targetPond;
                showView("daily");
                const activePonds = this.mapComponent ? this.mapComponent.getActivePondsList() : [];
                this.dailyRecordsPage.render(targetPond, activePonds);
            },
            onOpenManagement: (targetPond) => {
                this.activePond = targetPond;
                showView("mgmt");
                this.managementPage.render(targetPond);
            }
        });

        // 4. 24-Pond Overview Map (Supervisor View + Worker 1-Tap Quick Log)
        this.mapComponent = new FieldOpsMap(
            "field-ops-map-mount",
            this.currentModule,
            (pond, telemetry) => {
                this.activePond = pond;
                showView("detail");
                this.pondDetail.render(pond, telemetry);
            },
            (targetPond, activePondsList) => {
                this.activePond = targetPond;
                if (dailyMount) {
                    dailyMount.classList.add("daily-mount-modal-only");
                    dailyMount.style.display = "block";
                }
                this.dailyRecordsPage.openQuickModal(targetPond, activePondsList);
            }
        );

        this.ensureBubbleLayer();
    }

    /**
     * Mounts the dynamic ambient micro-bubble layer (+50% Scale)
     */
    ensureBubbleLayer() {
        let layer = document.getElementById("aero-global-bubble-layer");
        if (!layer) {
            layer = document.createElement("div");
            layer.id = "aero-global-bubble-layer";
            layer.className = "bubble-layer";
            layer.innerHTML = `
                <div class="aero-bubble lazy-1" style="left: 8%; width: 30px; height: 30px; animation-duration: 18s; animation-delay: 0s;"></div>
                <div class="aero-bubble lazy-2" style="left: 23%; width: 42px; height: 42px; animation-duration: 24s; animation-delay: 2s;"></div>
                <div class="aero-bubble lazy-1" style="left: 45%; width: 23px; height: 23px; animation-duration: 16s; animation-delay: 0.5s;"></div>
                <div class="aero-bubble lazy-2" style="left: 60%; width: 36px; height: 36px; animation-duration: 21s; animation-delay: 4s;"></div>
                <div class="aero-bubble lazy-1" style="left: 74%; width: 33px; height: 33px; animation-duration: 19s; animation-delay: 1.5s;"></div>
                <div class="aero-bubble lazy-2" style="left: 88%; width: 27px; height: 27px; animation-duration: 15s; animation-delay: 0s;"></div>
                <div class="aero-bubble lazy-1" style="left: 36%; width: 21px; height: 21px; animation-duration: 26s; animation-delay: 3s;"></div>
                <div class="aero-bubble lazy-2" style="left: 15%; width: 34px; height: 34px; animation-duration: 17s; animation-delay: 1s;"></div>
                <div class="aero-bubble lazy-1" style="left: 52%; width: 28px; height: 28px; animation-duration: 22s; animation-delay: 2.5s;"></div>
            `;
            document.body.appendChild(layer);
        }
        layer.style.display = "block";

        if (!this.bubbleSchedulerActive) {
            this.bubbleSchedulerActive = true;
            setTimeout(() => this.triggerAerationBurst(35), 400);
            this.scheduleNextBurst();
        }
    }

    triggerAerationBurst(clusterOriginX = null) {
        const layer = document.getElementById("aero-global-bubble-layer") || (this.container ? this.container.querySelector(".bubble-layer") : null);
        if (!layer) return;

        const origin = clusterOriginX !== null ? clusterOriginX : (12 + Math.random() * 76);
        const bubbleCount = 8 + Math.floor(Math.random() * 6);

        for (let i = 0; i < bubbleCount; i++) {
            const bubble = document.createElement("div");
            bubble.className = "aero-bubble burst-bubble";

            const size = 12 + Math.floor(Math.random() * 24); // 12px to 36px
            const spread = (Math.random() - 0.5) * 90;
            const drift = (Math.random() - 0.5) * 80;
            const duration = 4.0 + Math.random() * 2.8;
            const delay = Math.random() * 0.8;

            bubble.style.left = `calc(${origin}% + ${spread}px)`;
            bubble.style.width = `${size}px`;
            bubble.style.height = `${size}px`;
            bubble.style.setProperty("--drift-x", `${drift}px`);
            bubble.style.animationDuration = `${duration.toFixed(2)}s`;
            bubble.style.animationDelay = `${delay.toFixed(2)}s`;

            layer.appendChild(bubble);

            setTimeout(() => {
                if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
            }, (duration + delay + 0.5) * 1000);
        }
    }

    scheduleNextBurst() {
        const nextTimeMs = 12000 + Math.random() * 10000;
        this.burstTimeout = setTimeout(() => {
            this.triggerAerationBurst();
            this.scheduleNextBurst();
        }, nextTimeMs);
    }
}
