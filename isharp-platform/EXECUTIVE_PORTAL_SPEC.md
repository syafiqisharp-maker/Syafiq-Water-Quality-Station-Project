# iSHARP Executive Portal & Farm Map — Master Specification & Memory File

> **Project:** iSHARP DBMS 2.0 — Executive Portal & Interactive Farm Map  
> **Facility:** Blue Archipelago Berhad • Setiu Farm (SETiU)  
> **Total Infrastructure:** 216 Ponds (18 Rows × 12 Ponds)  
> **File Purpose:** Master context, architecture guide, design specifications, and phase tracker across sessions.

---

## 1. Project Background & Vision

The iSHARP system is an enterprise aquaculture management platform for a 216-pond shrimp facility cultivating *Litopenaeus vannamei* (VAN) and *Penaeus monodon* (MON). 

The operational DBMS (10 modules: Master, Sampling, Feeding, Harvest, Stocking, Lab, Lifecycle, Staff, Utilities, Performance) has been built. The next major phase is creating a **Unified Portal Entryway**:

```
                              ┌────────────────────────────────────────┐
                              │         iSHARP Welcome Portal          │
                              │             (Landing Page)             │
                              └───────────────────┬────────────────────┘
                                                  │
                        ┌─────────────────────────┴─────────────────────────┐
                        ▼                                                   ▼
         ┌─────────────────────────────┐                     ┌─────────────────────────────┐
         │   📊 Executive Dashboard    │                     │     ⚙️ Operational DBMS     │
         │  - 216-Pond Interactive Map │                     │  - 10 Operational Modules   │
         │  - Pathogen Risk Badges     │                     │  - Daily Feeding & Sampling │
         │  - Target vs Actual Biomass │                     │  - Lab PCR & Water Quality  │
         │  - Trajectory & Forecast    │                     │  - Harvest & Batch Logs     │
         └─────────────────────────────┘                     └─────────────────────────────┘
```

---

## 2. Component Specifications

### A. The Landing Page (Welcome Gateway — Minimalist Frutiger Aero)
- **Objective:** Pure, uncluttered 50/50 split gateway without dense text or redundant buttons.
- **Components:**
  1. **Top Branding:** Official Blue Archipelago Berhad corporate logo housed in a glossy, translucent glass badge.
  2. **Atmosphere:** Crystalline tropical ocean-sky background with animated translucent floating water bubbles drifting upward at varying speeds and depths.
  3. **Left Option — 📊 Executive Dashboard:**
     - 3D Frutiger Aero glass orb (ocean emerald & cerulean map prism).
     - Title: `Executive Dashboard` (clean, bold, no extra description).
     - Interaction: Entire orb/card is clickable (`cursor: pointer`), no "Enter" button.
  4. **Right Option — ⚙️ iSHARP DBMS:**
     - 3D Frutiger Aero glass orb (crystalline cyan database prism).
     - Title: `iSHARP DBMS` (clean, bold, no extra description).
     - Interaction: Entire orb/card is clickable (`cursor: pointer`), no "Enter" button.
  5. **Tactile Click Transition:**
     - Clicked orb triggers water ripple wave and zooms forward (`scale(1.18)`).
     - Non-selected option smoothly fades and blurs out (`opacity: 0`, `scale(0.9)`).
     - Smooth 360ms crossfade into the destination view.
  6. **Universal Navigation:** Persistent **"← Back to Portal"** button in top header across both views.

---

### B. The 216-Pond Interactive Farm Map
- **Layout Architecture:**
  - **9 Modules** total (Module 01 to Module 09).
  - **2 Rows per Module** (18 rows total: `01.01`, `01.02` to `09.17`, `09.18`).
  - **12 Culturing Ponds per Row** (Ponds `01` through `12`).
  - Total = 9 Modules × 2 Rows × 12 Ponds = **216 ponds**.
- **Cell Content (Clean & Simple):**
  - **DOC** (Days of Culture, e.g. `19`, `70`, `161`, or `-` if idle/prep).
  - **Species Badge**: `VAN` (*L. vannamei*) or `MON` (*P. monodon*).
- **Cell Color (Directly from Laboratory & Pathogen Data in `pond_issues`):**
  - 🔴 **Red Alert**: Active pathogen detected (`issue_flag = 'RED'` or EHP / EMS / WSSV positive).
  - 🟡 **Yellow Warning**: Elevated risk / suspicious pathology (`issue_flag = 'YELLOW'`).
  - 🟢 **Green (Clean Active)**: In production with clean negative laboratory tests.
  - ⚪ / 🔵 **Neutral / Faint Slate**: Idle, maintenance, or reservoir ponds.
- **Interactive Drawer / Tooltip on Hover/Click:**
  - Displays Pond ID (e.g. `04.08.05`), Stocking Date, Latest ABW (g), Survival Rate (%), Current Biomass (kg), and Laboratory test status.

---

### C. Executive / CEO Production Dashboard (Scroll Below Map)
- **Live Production Intelligence:**
  - **Active Culturing Capacity:** Ponds currently in `PRODUCTION` vs `IDLE` / `RESERVOIR`.
  - **Total Live Standing Biomass:** Aggregated live tonnage across the farm.
  - **Species Distribution:** Ratio of *Vannamei* vs *Monodon* (by pond count and standing biomass).
  - **Biosecurity & Pathogen Radar:** Clean vs Monitoring vs Pathogen Positive count.
  - **Pond Culture Stages:** Nursery (<30 DOC), Mid-Cycle (30–70 DOC), Finishing (>70 DOC).
  - **Harvest-Ready Pipeline:** Ponds nearing target harvest weight.
- **Business Plan Target (Placeholder):**
  - Dedicated section: *"Business Plan Target Biomass & Budget Trajectory"* with a placeholder ready to connect once target figures/files are provided.

---

## 3. Technical Architecture & Database Mapping

### Tech Stack
- **Frontend:** Vanilla ES6+ Modules with Vite bundler.
- **Styling:** CSS variables design tokens (`tokens.css`, `base.css`, `components.css`).
- **Data Layer:** Supabase Cloud PostgreSQL REST API (`src/infrastructure/repositories/`).
- **Charting:** Chart.js or Canvas-based visual rendering.

### Supabase Table Integrations
| Visualization Element | Supabase Source Table | Key Fields |
| :--- | :--- | :--- |
| **Pond Status & Species** | `stocking_records` | `pond_index`, `pond`, `stck_species`, `stck_date`, `stck_total`, `pond_status` |
| **Pathogen Risk & EHP** | `pond_issues` | `pond_index`, `issue_type`, `pcr_result`, `severity`, `issue_date` |
| **Current Biomass & ABW** | `sampling_records` | `pond_index`, `sample_date`, `abw_g`, `sr_pct`, `biomass_kg` |
| **Harvest History & Plan** | `harvest_records` | `pond_index`, `harvest_date`, `actual_kg`, `size_pcs_kg` |

---

## 4. Phased Implementation Roadmap

- [x] **Phase 1: Portal Routing & Landing Page**
  - [x] Add URL router / view coordinator (`portal`, `executive`, `dbms`).
  - [x] Build high-impact Landing Page with 2 Gateway Cards (Exec vs DBMS).
  - [x] Add persistent top-bar navigation toggle between Exec and DBMS.
  - [x] Add "← Back to Portal" button across both Executive and DBMS views.

- [x] **Phase 2: 216-Pond Interactive Farm Grid Map**
  - [x] Construct the 18-row × 12-column grid layout component matching Setiu farm layout (9 Modules × 2 Rows × 12 Ponds = 216 Ponds).
  - [x] Wire pond cells to Supabase `stocking_records` and `active_operational_ponds` (DOC calculation, Species VAN/MON).
  - [x] Integrate pathogen biosecurity data from `pond_issues` (Red Alert, Yellow Warning, Clean Green, Slate Idle).
  - [x] Build rich hover tooltips and slide-out quick-detail drawer with `[ ⚙️ Open in DBMS View ]`.
  - [x] Add map view filters (Species: All/VAN/MON, Biosecurity: All/Red/Yellow/Green/Idle, Stages: All/Early/Mid/Finishing, and quick search).
  - [x] Add dual top-left navigation buttons on DBMS view (`[ ← Back to Portal ]` and `[ 🗺️ Executive Map ]`).

- [ ] **Phase 3: Executive Analytics & Biomass Visualizations**
  - [ ] Business Plan Target vs Current Biomass Gauge & KPI cards.
  - [ ] Trajectory Curve chart (Planned vs Realized biomass).
  - [ ] Biosecurity health index & Pathogen distribution chart.
  - [ ] 30-Day Harvest Forecast table/pipeline.

- [ ] **Phase 4: Polish, Responsiveness & Deployment**
  - [ ] Mobile & tablet responsive scaling for the 216-pond grid.
  - [ ] Export map as PDF / PNG report for executive meetings.
  - [ ] Production build and verification with Vite.

---

## 5. Decision Log (Brainstorming & Evolution)

| Date | Topic | Decision | Rationale |
| :--- | :--- | :--- | :--- |
| 2026-09-28 | Architecture | Single unified web app in `isharp-dbms` | Keeps Supabase connection, data models, and styles unified; zero duplicate maintenance. |
| 2026-09-28 | Entry Point | Landing page with 2 options (Exec vs DBMS) | Clear separation of concerns between operational workers and high-level management. |
| 2026-09-28 | Navigation | "← Back to Portal" button in top nav bar | Allows seamless toggling between Landing, Executive, and DBMS views. |
| 2026-09-28 | Grid Layout | 9 Modules × 2 Rows × 12 Ponds = 216 Ponds | Exactly 12 culturing ponds per row; clean grid without unnecessary excel fluff. |
| 2026-09-28 | Cell Display | Clean DOC number + Species Badge (`VAN` / `MON`) | Minimal, high-contrast, immediately readable at executive glance. |
| 2026-09-28 | Color Coding | Driven by Supabase `pond_issues` laboratory records | Red (Pathogen positive / alert), Yellow (caution/elevated), Green (clean active). |
| 2026-09-28 | Executive Analytics | Real-time Production/CEO Dashboard + Business Plan Placeholder | Delivers immediate live production insights today while waiting for the business plan target file. |
| 2026-09-28 | Landing Page UI | Minimalist 50/50 Frutiger Aero split with animated bubbles | Centered official Blue Archipelago logo, pure Left/Right clickable 3D glass orbs, no text descriptions or buttons, silky dive-in transition. |
| 2026-09-29 | Phase 2 Implementation | Dedicated `PondGridMap.js` component with Drawer & Tooltip | Decouples map layout, cell state computation, and biosecurity logic from `executiveTab.js` while maintaining reactive bindings with `appState.js`. |
| 2026-09-29 | Data Ingestion Fix | Query non-closed cycles via `pond_status=neq.CLOSE` | Overcomes PostgREST 1,000-row limit that previously truncated data at Module 01 historical cycles; now correctly surfaces all 137 active cycles across all 9 modules (`01` through `09`). |
| 2026-09-29 | UI Simplification | Removed hover tooltip and redundant section text | Floating tooltip was redundant with the map display; clicking directly opens the rich slide-out drawer. Removed "Rows 01 & 02 • 24 Ponds" and "9 Modules × 2 Rows × 12 Ponds" to keep the layout minimal and uncluttered. |
| 2026-09-30 | Field Ops Mobile | Strict mobile optimization for `#view-field-ops` | Outdoor field staff use phones/tablets; Executive and DBMS portals remain desktop-only. |
| 2026-09-30 | Field Ops Simplification | Simplified section titles & removed subtitles | "Module XX - Row YY", "Feeding Action Plan", "Growout Book Records", "Weather Station iSHARP", "Personnel & Aset Status". |
| 2026-09-30 | Mortality Measurement | Migrated from pieces (pcs) to kilograms (kg) | Practical farm estimation weighs scooped dead shrimp by kg. Added `mortality_kg numeric(8,2)` to `daily_pond_records` in Supabase. |
| 2026-09-30 | Landing Page Rebrand | Rebranded to `"BAB AQUACULTURE PLATFORM"` & `"Aquaculture Platform 2026"` | Removed all subtitles under the 3 gateway cards (`Executive Dashboard`, `Field Operations`, `iSHARP DBMS`) for a clean, executive gateway. |
| 2026-09-30 | Timezone-Safe Dates | Replaced UTC `toISOString()` with local calendar date helpers | Fixed off-by-one day bug in Malaysia (`UTC+8`) so the green `TODAY` badge and DOC calculations always match local farm time. |
| 2026-09-30 | Rapid Field Logging UX | Adopted 3-in-1 Dual-Persona Workflow & True 3D CSS Water Orbs | Added 1-Tap `➕ Log` & `✓ Logged` badges on the 24-Pond Map, Smart Yesterday Carry-Forward, `⚡ Save & Next ➔` pond switcher, and confined `.water-swatch-orb` chips with simple colour names (`Lt Green`, `Green`, `Dk Green`, `Brn Green`, `Tea`, `Brown`, `Clear`, `Turbid`). |

---

## 6. Sprint Log: Phase 2 Completed & Phase 3 Roadmap (2026-09-29)

### Phase 2 Accomplishments (Delivered):
1. **Grid Component Architecture (`PondGridMap.js`):**
   - 9 Modules (`Module 01` to `Module 09`) with 2 Rows each (`01.01` to `09.18`) and 12 Ponds per row = **216 Ponds rendered**.
   - Dual top-left navigation buttons on DBMS view: `[ ← Back to Portal ]` and `[ 🗺️ Executive Map ]` for fast direct switching.
   - Clean, uncluttered module headers (`Module 01`, `Module 02`, etc.) without redundant badge clutter.
2. **Farm-Wide Data Integration Across All 9 Modules:**
   - Implemented `PondRepository.getActiveCycles()` querying `stocking_records?pond_status=neq.CLOSE&limit=1000`.
   - Surfaces all 291 active farm cycles (137 Production, 71 Idle, 18 Reservoir, 8 Maintenance) across all 9 modules.
   - Robust coordinate fallback derivation via `derivePondCode(pond_index)` (e.g. `2020307.41` $\rightarrow$ `02.03.07`).
3. **Biosecurity & Pathology Engine:**
   - Evaluates laboratory records from `pond_issues`:
     - 🔴 **Red Alert**: Active positive PCR / clinical pathogen flag (`issue_flag = 'RED'` or EHP/EMS/WSSV positive).
     - 🟡 **Yellow Warning**: Elevated risk / suspicious pathology (`issue_flag = 'YELLOW'`).
     - 🟢 **Green (Clean Active)**: In production with clean lab results (`issue_flag = 'GREEN'` or no issues).
     - ⚪ / 🔵 **Neutral / Muted Slate**: Idle, maintenance, or reservoir ponds.
4. **Slide-Out Detail Drawer:**
   - Clicking any pond smoothly slides out full telemetry snapshot, Stocking Date, Latest ABW (g), Biomass (kg), Survival Rate (%), recent Lab issues, and a direct `[ ⚙️ Open in DBMS View ]` button.
   - Clean tile hover with subtle elevation (`scale(1.03)`); floating tooltip eliminated to prevent screen clutter.
5. **Interactive Filters & Cache:**
   - Filter by Species (`All`, `VAN`, `MON`).
   - Filter by Biosecurity (`All`, `🔴 Red Alert`, `🟡 Warning`, `🟢 Clean`, `⚪ Idle`).
   - Filter by Culture Stage: `All`, `Early (<30 DOC)`, `Mid (30–70 DOC)`, `Finishing (>70 DOC)`.
   - 5-minute smart in-memory session cache (`sessionStorage`) with one-click `[ 🔄 Refresh ]` button.
6. **Build Verification:**
   - Production Vite build compiled cleanly with zero errors.

### Next Sprint: Phase 3 (Executive Biomass Analytics & Trajectory)
- Construct live KPI cards (Total Standing Biomass, Farm Capacity %, Harvest Pipeline).
- Build the Biomass Trajectory Curve (Planned vs Realized biomass).
- Ready placeholder for corporate Business Plan targets once dataset is supplied.

