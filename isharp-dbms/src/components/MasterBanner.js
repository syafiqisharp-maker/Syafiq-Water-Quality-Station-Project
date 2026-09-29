/**
 * iSHARP DBMS 2.0 — Master KPI Banner Component
 * Displays selected pond callout bubble, cycle number, DOC, area, total HP, and status.
 */

import { appState } from "../state/appState.js";
import { calculateDOC } from "../domain/biometrics.js";
import { formatPondLabel } from "../domain/rollover.js";
import { PondRepository } from "../infrastructure/repositories/pondRepository.js";
import { LabRepository } from "../infrastructure/repositories/labRepository.js";

export class MasterBanner {
    constructor(onSelectCycle) {
        this.onSelectCycle = onSelectCycle;
        this.dom = {
            badgePondIndex: document.getElementById("badge-pond-index"),
            badgePondLabel: document.getElementById("badge-pond-label"),
            badgePondStatus: document.getElementById("badge-pond-status"),
            badgePondActive: document.getElementById("badge-pond-active"),
            badgeSpecies: document.getElementById("badge-species") || document.getElementById("snap-species"),
            badgeGenetic: document.getElementById("badge-genetic") || document.getElementById("snap-genetic"),
            badgeCycleNo: document.getElementById("badge-cycle-no"),
            selectCycleHistory: document.getElementById("select-cycle-history"),
            badgeCropNo: document.getElementById("badge-crop-no"),
            badgeDoc: document.getElementById("badge-doc"),
            badgeArea: document.getElementById("badge-area"),
            badgeTotalHp: document.getElementById("badge-total-hp"),
            badgeDiseaseStatus: document.getElementById("badge-disease-status")
        };

        if (this.dom.selectCycleHistory) {
            this.dom.selectCycleHistory.addEventListener("change", (e) => {
                if (e.target.value && this.onSelectCycle) {
                    this.onSelectCycle(e.target.value);
                }
            });
        }

        // Click pathology block to quickly inspect Laboratory Logbook
        const diseaseBlock = document.querySelector(".disease-block");
        if (diseaseBlock) {
            diseaseBlock.addEventListener("click", () => {
                const labTabBtn = document.getElementById("btn-tab-laboratory");
                if (labTabBtn) labTabBtn.click();
            });
        }

        // Listen for active pond changes
        appState.subscribe("pondChanged", (pond) => this.render(pond));
    }

    render(pond) {
        if (!pond) {
            if (this.dom.badgePondLabel) this.dom.badgePondLabel.textContent = "No Pond Selected";
            return;
        }

        // Physical Pond Label & Index
        const pondCode = formatPondLabel(pond.pond);
        if (this.dom.badgePondLabel) this.dom.badgePondLabel.textContent = `Pond ${pondCode}`;
        if (this.dom.badgePondIndex) this.dom.badgePondIndex.textContent = pond.pond_index || "—";

        // Cycle Status
        const st = (pond.status || "UNKNOWN").toUpperCase();
        if (this.dom.badgePondStatus) {
            this.dom.badgePondStatus.textContent = st;
            this.dom.badgePondStatus.className = `status-badge ${this.getStatusClass(st)}`;
        }

        // Active State Badge
        if (this.dom.badgePondActive) {
            const isActive = (pond.active || pond.pond_active || "").toUpperCase() === "ACTIVE";
            this.dom.badgePondActive.textContent = pond.active || pond.pond_active || "ACTIVE";
            this.dom.badgePondActive.className = `status-badge ${isActive ? "status-production" : "status-close"}`;
        }

        // Species & Genetics
        const isProd = (pond.status || pond.pond_status || "").toUpperCase() === "PRODUCTION";
        const species = pond.species || pond.stck_species;
        if (this.dom.badgeSpecies) {
            this.dom.badgeSpecies.textContent = (species && species !== "—") ? species : (isProd ? "P. VANNAMEi" : "—");
        }
        const genetic = pond.genetic_line || pond.bs_line;
        if (this.dom.badgeGenetic) {
            this.dom.badgeGenetic.textContent = (genetic && genetic !== "—") ? genetic : (isProd ? "Standard Line" : "—");
        }

        // Cycle & Crop Numbers
        const parts = String(pond.pond_index || "").split(".");
        const cycleNum = parts.length > 1 ? parts[1] : (pond.cycle_no || "1");
        if (this.dom.badgeCycleNo) this.dom.badgeCycleNo.textContent = cycleNum;
        if (this.dom.badgeCropNo) this.dom.badgeCropNo.textContent = pond.crop_no || "—";

        // Load Cycle History dropdown
        if (this.dom.selectCycleHistory && pond.pond) {
            PondRepository.getCycleHistory(pond.pond).then(history => {
                if (history && history.length > 0) {
                    this.dom.selectCycleHistory.innerHTML = history.map(c => {
                        const st = (c.status || c.pond_status || "").toUpperCase();
                        const isCurrent = c.pond_index === pond.pond_index;
                        return `<option value="${c.pond_index}" ${isCurrent ? 'selected' : ''}>Cycle ${c.cycle_no || c.pond_index} (${st})</option>`;
                    }).join("");
                } else {
                    this.dom.selectCycleHistory.innerHTML = `<option value="${pond.pond_index}" selected>Cycle ${cycleNum}</option>`;
                }
            }).catch(e => {
                console.warn("Could not load cycle history:", e);
                this.dom.selectCycleHistory.innerHTML = `<option value="${pond.pond_index}" selected>Cycle ${cycleNum}</option>`;
            });
        }

        // DOC Calculation (from stocking date)
        if (this.dom.badgeDoc) {
            if (pond.stck_date && pond.stck_date.trim() !== "") {
                const doc = calculateDOC(pond.stck_date, pond.date_close || null);
                this.dom.badgeDoc.textContent = `${doc}`;
            } else {
                this.dom.badgeDoc.textContent = "0";
            }
        }

        // Area (Hectares)
        if (this.dom.badgeArea) {
            const areaVal = parseFloat(pond.area);
            this.dom.badgeArea.textContent = !isNaN(areaVal) ? `${areaVal.toFixed(2)}` : "—";
        }

        // Disease Status (Synced with Laboratory reports)
        this.updateDiseaseBadge(pond.pond_index);
    }

    /**
     * Dynamically synchronizes the Pathology & Biosecurity badge with lab reports for this pond cycle.
     * @param {string} pondIndex 
     */
    async updateDiseaseBadge(pondIndex) {
        if (!this.dom.badgeDiseaseStatus) return;

        if (!pondIndex) {
            this.dom.badgeDiseaseStatus.textContent = "Pathogen Negative (Normal)";
            this.dom.badgeDiseaseStatus.className = "disease-pill disease-ok";
            this.dom.badgeDiseaseStatus.title = "No pond selected";
            return;
        }

        try {
            const issues = await LabRepository.getIssuesByPond(pondIndex);
            if (!issues || issues.length === 0) {
                this.dom.badgeDiseaseStatus.textContent = "Pathogen Negative (Normal)";
                this.dom.badgeDiseaseStatus.className = "disease-pill disease-ok";
                this.dom.badgeDiseaseStatus.title = "No laboratory issues recorded for this cycle (Clean / Negative).";
                return;
            }

            // 1. Check for RED / CRITICAL alerts or POSITIVE pathogen test results
            const redIssues = issues.filter(r => {
                const flag = (r.issue_flag || "").toUpperCase();
                const note = (r.issue_note || "").toUpperCase();
                return flag === "RED" || flag === "CRITICAL" || note.includes("POSIT");
            });

            if (redIssues.length > 0) {
                const primary = redIssues[0];
                let pathogen = primary.issue_status || primary.issue_test || primary.issue_category || "Pathogen";
                if (["ACTIVE", "CRITICAL", "POSITIVE", "DISEASE", "PATHOLOGY"].includes(pathogen.toUpperCase())) {
                    pathogen = primary.issue_test || primary.issue_category || "Pathogen";
                }
                const grade = primary.issue_grade && primary.issue_grade.toUpperCase() !== "G0" 
                    ? ` (${primary.issue_grade})` 
                    : "";

                this.dom.badgeDiseaseStatus.textContent = `⚠️ ${pathogen} Alert${grade}`;
                this.dom.badgeDiseaseStatus.className = "disease-pill disease-danger";
                this.dom.badgeDiseaseStatus.title = `${pathogen}: ${primary.issue_note || 'Positive'} (${primary.issue_date || 'Date N/A'})\n${redIssues.length} active alert(s). Click to open Laboratory tab.`;
                return;
            }

            // 2. Check for YELLOW / Warning flags
            const yellowIssues = issues.filter(r => {
                const flag = (r.issue_flag || "").toUpperCase();
                return flag === "YELLOW" || flag === "WARNING";
            });

            if (yellowIssues.length > 0) {
                const primary = yellowIssues[0];
                const pathogen = primary.issue_status || primary.issue_test || "Condition";
                const grade = primary.issue_grade && primary.issue_grade.toUpperCase() !== "G0" 
                    ? ` (${primary.issue_grade})` 
                    : "";

                this.dom.badgeDiseaseStatus.textContent = `⚠️ Monitored: ${pathogen}${grade}`;
                this.dom.badgeDiseaseStatus.className = "disease-pill disease-warning";
                this.dom.badgeDiseaseStatus.title = `Monitored: ${pathogen} (${primary.issue_date || 'Date N/A'}). Click to open Laboratory tab.`;
                return;
            }

            // 3. All logged tests are GREEN / Negative
            this.dom.badgeDiseaseStatus.textContent = "Pathogen Negative (Normal)";
            this.dom.badgeDiseaseStatus.className = "disease-pill disease-ok";
            this.dom.badgeDiseaseStatus.title = `All ${issues.length} lab records negative / normal.`;
        } catch (err) {
            console.warn("Could not sync pathology badge with laboratory:", err);
            this.dom.badgeDiseaseStatus.textContent = "Pathogen Negative (Normal)";
            this.dom.badgeDiseaseStatus.className = "disease-pill disease-ok";
        }
    }

    getStatusClass(status) {
        switch (status) {
            case "PRODUCTION": return "status-production";
            case "iDLE":
            case "IDLE": return "status-idle";
            case "CLOSE": return "status-close";
            case "MAINTENANCE": return "status-maintenance";
            case "RESERVOIR": return "status-reservoir";
            default: return "status-idle";
        }
    }
}
