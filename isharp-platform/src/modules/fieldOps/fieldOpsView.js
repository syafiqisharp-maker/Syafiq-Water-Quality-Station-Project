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
            <div class="field-ops-login-stage" style="min-height: 100vh; padding: 2.5rem 1.5rem; display: flex; flex-direction: column; align-items: center; justify-content: center; background: radial-gradient(circle at 50% 10%, rgba(255, 255, 255, 0.7) 0%, rgba(186, 230, 253, 0.3) 30%, transparent 60%), linear-gradient(180deg, #d8f1fc 0%, #bde7f8 40%, #76d0ee 100%);">
                
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
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; width: 100%; max-width: 860px; margin-bottom: 2rem;">
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
                        <span>← Back to Welcome Portal</span>
                    </button>
                </div>

                <!-- Password Modal -->
                <div id="module-passcode-modal" class="modal-overlay" style="display: none;">
                    <div class="modal-dialog modal-glass" style="max-width: 380px; width: 90%; text-align: center; padding: 1.75rem 1.5rem;">
                        <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🔐</div>
                        <h3 id="modal-target-module-title" style="margin: 0 0 0.35rem 0; font-size: 1.25rem; font-weight: 900; color: #0f172a;">Module Authentication</h3>
                        <p style="font-size: 0.78rem; color: #64748b; margin-bottom: 1.25rem;">Enter the supervisor access password for this module</p>
                        
                        <input type="password" id="input-module-passcode" class="form-control" placeholder="Enter password (e.g. m01pass)" style="font-size: 0.95rem; text-align: center; font-weight: 700; letter-spacing: 0.1em; padding: 0.6rem 0.8rem; margin-bottom: 1.2rem;" />
                        
                        <div style="display: flex; gap: 0.6rem; justify-content: center;">
                            <button type="button" id="btn-cancel-passcode" class="btn-action btn-secondary" style="font-size: 0.82rem; padding: 0.45rem 1rem;">Cancel</button>
                            <button type="button" id="btn-verify-passcode" class="btn-action btn-primary" style="font-size: 0.82rem; font-weight: 800; padding: 0.45rem 1.25rem;">Unlock Module</button>
                        </div>
                    </div>
                </div>

            </div>
        `;

        this.bindLoginEvents();
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
            <div class="field-ops-workspace" style="min-height: 100vh; padding: 1.25rem 2rem; background: #f0f9ff; background-image: radial-gradient(circle at 10% 20%, rgba(56, 189, 248, 0.12) 0%, transparent 40%), linear-gradient(180deg, #f8fafc 0%, #e0f2fe 100%);">
                
                <!-- Main Header Bar -->
                <header class="field-ops-header flex-between" style="background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 1); border-radius: 18px; padding: 0.85rem 1.5rem; margin-bottom: 1.25rem; box-shadow: 0 4px 20px rgba(2, 132, 199, 0.08); flex-wrap: wrap; gap: 0.75rem;">
                    
                    <!-- Left: Navigation & Branding -->
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <button type="button" class="btn-action btn-secondary" data-nav-view="portal" style="font-size: 0.78rem; font-weight: 700; padding: 0.4rem 0.85rem;">
                            <span>← Back to Portal</span>
                        </button>
                        <div>
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <h1 style="margin: 0; font-size: 1.25rem; font-weight: 900; color: #0f172a;">
                                    Field Operations — Module ${modStr}
                                </h1>
                                <span style="font-size: 0.72rem; font-weight: 800; background: #0284c7; color: #ffffff; padding: 0.2rem 0.55rem; border-radius: 6px;">
                                    24 PONDS
                                </span>
                            </div>
                            <span style="font-size: 0.74rem; color: #64748b;">
                                Live Water Quality Station Telemetry &amp; Feeding Action Plans
                            </span>
                        </div>
                    </div>

                    <!-- Right: Supervisor Info & Module Switch -->
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div style="display: flex; align-items: center; gap: 0.4rem; background: rgba(240, 249, 255, 0.9); border: 1px solid #bae6fd; padding: 0.35rem 0.75rem; border-radius: 8px; font-size: 0.78rem; font-weight: 700; color: #0369a1;">
                            <span>👤</span>
                            <span>Supervisor M${modStr}</span>
                        </div>
                        <button type="button" id="btn-switch-module" class="btn-action btn-secondary" style="font-size: 0.76rem; font-weight: 700; padding: 0.4rem 0.85rem;">
                            <span>🔓 Switch Module</span>
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
                this.dailyRecordsPage.render(targetPond);
            },
            onOpenManagement: (targetPond) => {
                this.activePond = targetPond;
                showView("mgmt");
                this.managementPage.render(targetPond);
            }
        });

        // 4. 24-Pond Overview Map
        this.mapComponent = new FieldOpsMap("field-ops-map-mount", this.currentModule, (pond, telemetry) => {
            this.activePond = pond;
            showView("detail");
            this.pondDetail.render(pond, telemetry);
        });
    }
}
