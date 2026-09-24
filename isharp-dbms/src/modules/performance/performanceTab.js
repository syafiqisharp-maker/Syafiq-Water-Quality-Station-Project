/**
 * iSHARP DBMS 2.0 — Performance Tab Module (Tab 6)
 * Growth curve visualizer & dynamic Efficiency KPIs calculation.
 * Frutiger Aero high-contrast canvas styling & live pond telemetry.
 */

import { appState } from "../../state/appState.js";
import { SamplingRepository } from "../../infrastructure/repositories/samplingRepository.js";
import { calculateADG, calculateBiomass, getStandardABW } from "../../domain/biometrics.js";
import { calculateFCR } from "../../domain/feeding.js";

export class PerformanceTab {
    constructor() {
        this.dom = {
            canvas: document.getElementById("growthChart") || document.getElementById("growth-curve-canvas"),
            kpiAdg: document.getElementById("kpi-adg"),
            kpiAdgSub: document.getElementById("kpi-adg-sub"),
            kpiFcr: document.getElementById("kpi-fcr"),
            kpiFcrSub: document.getElementById("kpi-fcr-sub"),
            kpiBiomass: document.getElementById("kpi-biomass"),
            kpiBiomassSub: document.getElementById("kpi-biomass-sub"),
            kpiProjDoc: document.getElementById("kpi-proj-doc"),
            kpiProjDocSub: document.getElementById("kpi-proj-doc-sub")
        };

        this.ctx = this.dom.canvas ? this.dom.canvas.getContext("2d") : null;

        // Auto-refresh when tab is clicked
        appState.subscribe("tabChanged", (tabId) => {
            if (tabId === "tab-performance") {
                setTimeout(() => this.updateView(), 60);
            }
        });

        // Auto-refresh when active pond changes
        appState.subscribe("pondChanged", () => {
            if (appState.activeTab === "tab-performance") {
                this.updateView();
            }
        });
    }

    async updateView() {
        const pondIndex = appState.currentPondIndex;
        const pond = appState.currentPond;
        if (!pondIndex) return;

        // 1. Fetch live sampling data
        let samplings = [];
        try {
            samplings = await SamplingRepository.getSamplingByPond(pondIndex);
        } catch (err) {
            console.warn("Could not load sampling records for performance tab:", err);
        }

        // 2. Update Efficiency KPIs
        this.updateKPIs(samplings, pond);

        // 3. Render High-Contrast Frutiger Aero Canvas
        this.renderGrowthChart(samplings, pond);
    }

    updateKPIs(samplings, pond) {
        if (!samplings || samplings.length === 0) {
            if (this.dom.kpiAdg) this.dom.kpiAdg.textContent = "—";
            if (this.dom.kpiAdgSub) this.dom.kpiAdgSub.textContent = "Awaiting 1st sampling";
            if (this.dom.kpiFcr) this.dom.kpiFcr.textContent = "—";
            if (this.dom.kpiFcrSub) this.dom.kpiFcrSub.textContent = "Requires sampling & feed logs";
            if (this.dom.kpiBiomass) this.dom.kpiBiomass.textContent = "—";
            if (this.dom.kpiBiomassSub) this.dom.kpiBiomassSub.textContent = "Pending biometrics";
            if (this.dom.kpiProjDoc) this.dom.kpiProjDoc.textContent = "DOC 95";
            if (this.dom.kpiProjDocSub) this.dom.kpiProjDocSub.textContent = "Target harvest weight: 25.0 g";
            return;
        }

        const latest = samplings[samplings.length - 1];
        const prev = samplings.length > 1 ? samplings[samplings.length - 2] : null;

        // 1. Average Daily Gain (ADG)
        let adg = 0;
        if (prev && prev.smpl_abw && latest.smpl_abw) {
            const days = Math.max(1, (latest.smpl_doc || 0) - (prev.smpl_doc || 0));
            adg = calculateADG(prev.smpl_abw, latest.smpl_abw, days);
        } else if (latest.smpl_abw && latest.smpl_doc) {
            adg = latest.smpl_abw / latest.smpl_doc;
        }

        if (this.dom.kpiAdg) {
            this.dom.kpiAdg.textContent = adg > 0 ? `${adg.toFixed(2)} g/day` : "—";
        }
        if (this.dom.kpiAdgSub) {
            if (adg >= 0.28) {
                this.dom.kpiAdgSub.textContent = "🟢 Fast growth (On track for 30-count)";
                this.dom.kpiAdgSub.className = "kpi-sub text-success";
            } else if (adg >= 0.18) {
                this.dom.kpiAdgSub.textContent = "🟢 Standard growth (On track for 40-count)";
                this.dom.kpiAdgSub.className = "kpi-sub text-success";
            } else {
                this.dom.kpiAdgSub.textContent = "🟠 Moderate growth pace";
                this.dom.kpiAdgSub.className = "kpi-sub text-muted";
            }
        }

        // 2. Cumulative FCR
        const totalFeed = parseFloat(latest.smpl_tfed) || 0;
        const totalBiomass = parseFloat(latest.smpl_bms) || 0;
        let fcr = 0;
        if (totalFeed > 0 && totalBiomass > 0) {
            fcr = calculateFCR(totalFeed, totalBiomass);
        }

        if (this.dom.kpiFcr) {
            this.dom.kpiFcr.textContent = fcr > 0 ? `${fcr.toFixed(2)}` : "—";
        }
        if (this.dom.kpiFcrSub) {
            if (fcr > 0 && fcr <= 1.35) {
                this.dom.kpiFcrSub.textContent = "🟢 Exceptional feed efficiency";
            } else if (fcr > 1.35 && fcr <= 1.65) {
                this.dom.kpiFcrSub.textContent = "🟢 Good feed conversion";
            } else if (fcr > 1.65) {
                this.dom.kpiFcrSub.textContent = "🟠 High FCR — check feed trays";
            } else {
                this.dom.kpiFcrSub.textContent = "Feed tracking active";
            }
        }

        // 3. Estimated Current Biomass
        let bmsKg = totalBiomass;
        if (!bmsKg && pond && pond.stck_pcs && latest.smpl_abw) {
            bmsKg = calculateBiomass(pond.stck_pcs, latest.smpl_surv || 80, latest.smpl_abw);
        }

        if (this.dom.kpiBiomass) {
            this.dom.kpiBiomass.textContent = bmsKg > 0 ? `${Math.round(bmsKg).toLocaleString()} kg` : "—";
        }
        if (this.dom.kpiBiomassSub) {
            const areaHa = parseFloat(pond?.area) || 0.5;
            const density = bmsKg > 0 ? (bmsKg / (areaHa * 10000)).toFixed(2) : "—";
            this.dom.kpiBiomassSub.textContent = `Area: ${areaHa.toFixed(2)} Ha • Density: ${density} kg/m²`;
        }

        // 4. Projected Harvest DOC
        const currentAbw = parseFloat(latest.smpl_abw) || 0;
        const currentDoc = parseInt(latest.smpl_doc, 10) || 0;
        const targetAbw = 25.0; // Standard 25g target

        if (currentAbw > 0 && adg > 0.05) {
            const gramsLeft = Math.max(0, targetAbw - currentAbw);
            const daysLeft = Math.round(gramsLeft / adg);
            const projectedDoc = currentDoc + daysLeft;

            if (this.dom.kpiProjDoc) this.dom.kpiProjDoc.textContent = `DOC ${projectedDoc}`;
            if (this.dom.kpiProjDocSub) this.dom.kpiProjDocSub.textContent = `~${daysLeft} days to harvest (Target: 25.0 g)`;
        } else {
            if (this.dom.kpiProjDoc) this.dom.kpiProjDoc.textContent = "DOC 95";
            if (this.dom.kpiProjDocSub) this.dom.kpiProjDocSub.textContent = "Target weight: 25.0 g";
        }
    }

    renderGrowthChart(samplings, pond) {
        if (!this.dom.canvas) {
            this.dom.canvas = document.getElementById("growthChart") || document.getElementById("growth-curve-canvas");
        }
        if (!this.dom.canvas) return;
        this.ctx = this.dom.canvas.getContext("2d");
        const canvas = this.dom.canvas;
        const ctx = this.ctx;

        // Container sizing with device pixel ratio
        const container = canvas.parentElement;
        const rect = container ? container.getBoundingClientRect() : { width: 800, height: 350 };
        const dpr = window.devicePixelRatio || 1;
        const w = (rect.width || 800);
        const h = 350;

        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;

        ctx.resetTransform();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        const padLeft = 65;
        const padRight = 35;
        const padTop = 35;
        const padBottom = 45;
        const plotWidth = w - padLeft - padRight;
        const plotHeight = h - padTop - padBottom;

        const maxDOC = 120;
        const maxABW = 30;

        const getX = (doc) => padLeft + (doc / maxDOC) * plotWidth;
        const getY = (abw) => padTop + plotHeight - (abw / maxABW) * plotHeight;

        // 1. Draw Frutiger Aero Grid Lines
        ctx.strokeStyle = "rgba(186, 230, 253, 0.7)";
        ctx.lineWidth = 1;
        ctx.fillStyle = "#475569";
        ctx.font = "bold 11px 'JetBrains Mono', monospace";
        ctx.textAlign = "right";

        for (let abw = 0; abw <= maxABW; abw += 5) {
            const y = getY(abw);
            ctx.beginPath();
            ctx.moveTo(padLeft, y);
            ctx.lineTo(w - padRight, y);
            ctx.stroke();
            ctx.fillText(`${abw}g`, padLeft - 10, y + 4);
        }

        ctx.textAlign = "center";
        ctx.font = "bold 11px Inter, sans-serif";
        ctx.fillStyle = "#334155";
        for (let doc = 0; doc <= maxDOC; doc += 20) {
            const x = getX(doc);
            ctx.beginPath();
            ctx.moveTo(x, padTop);
            ctx.lineTo(x, padTop + plotHeight);
            ctx.stroke();
            ctx.fillText(`DOC ${doc}`, x, h - padBottom + 20);
        }

        // 2. Draw Target Strategy Curve (Dashed Sky Blue)
        ctx.beginPath();
        ctx.strokeStyle = "#0284c7";
        ctx.lineWidth = 2.2;
        ctx.setLineDash([6, 4]);

        for (let doc = 0; doc <= maxDOC; doc += 2) {
            const targetABW = getStandardABW(doc);
            const x = getX(doc);
            const y = getY(Math.min(maxABW, targetABW));
            if (doc === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]); // Reset dash

        // 3. Draw Actual Growth Trajectory & Gradient Fill
        const validPoints = (samplings || [])
            .filter(s => s.smpl_doc && s.smpl_abw)
            .map(s => ({
                doc: parseFloat(s.smpl_doc),
                abw: parseFloat(s.smpl_abw),
                x: getX(Math.min(maxDOC, parseFloat(s.smpl_doc))),
                y: getY(Math.min(maxABW, parseFloat(s.smpl_abw)))
            }))
            .sort((a, b) => a.doc - b.doc);

        if (validPoints.length > 0) {
            // Soft Emerald Gradient Fill under curve
            const fillGrad = ctx.createLinearGradient(0, padTop, 0, padTop + plotHeight);
            fillGrad.addColorStop(0, "rgba(16, 185, 129, 0.25)");
            fillGrad.addColorStop(1, "rgba(16, 185, 129, 0.01)");

            ctx.beginPath();
            ctx.moveTo(validPoints[0].x, padTop + plotHeight);
            validPoints.forEach(p => ctx.lineTo(p.x, p.y));
            ctx.lineTo(validPoints[validPoints.length - 1].x, padTop + plotHeight);
            ctx.closePath();
            ctx.fillStyle = fillGrad;
            ctx.fill();

            // Stroke Actual Path (Vibrant Emerald)
            ctx.beginPath();
            ctx.strokeStyle = "#10b981";
            ctx.lineWidth = 3.5;
            validPoints.forEach((p, i) => {
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.stroke();

            // Draw Tactile Point Dots
            validPoints.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
                ctx.fillStyle = "#10b981";
                ctx.fill();
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = "#ffffff";
                ctx.stroke();

                // Point Label with contrast background badge
                const labelText = `${p.abw.toFixed(1)}g`;
                ctx.font = "bold 11px 'JetBrains Mono', monospace";
                const textWidth = ctx.measureText(labelText).width;

                ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
                ctx.fillRect(p.x - (textWidth / 2) - 4, p.y - 25, textWidth + 8, 16);
                ctx.strokeStyle = "#bae6fd";
                ctx.lineWidth = 1;
                ctx.strokeRect(p.x - (textWidth / 2) - 4, p.y - 25, textWidth + 8, 16);

                ctx.fillStyle = "#0a2540";
                ctx.textAlign = "center";
                ctx.fillText(labelText, p.x, p.y - 13);
            });
        } else {
            // Friendly Empty State message on canvas
            ctx.fillStyle = "rgba(15, 41, 66, 0.7)";
            ctx.font = "600 13px Inter, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("No sampling points recorded yet for this cycle — Target curve displayed above.", w / 2, h / 2);
        }
    }
}
