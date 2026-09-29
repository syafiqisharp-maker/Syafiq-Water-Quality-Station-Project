# Project Walkthrough & Development Notes

This file serves as a persistent record of key milestones, architecture decisions, and development walkthroughs across the iSHARP Precision Aquaculture Platform.

---

## 2026-07-02
* Initial project setup and hardware telemetry planning.

---

## 2026-09-18 to 2026-09-22: Enterprise Database Reverse-Engineering & Architecture V2.0
* **Legacy Access Database Audit:**
  * Analyzed `Bab SGo (r41) 26.09.18.accdb` (180.8 MB) from Setiu Farm (`SETiU`), Terengganu.
  * Cataloged 118 tables, 314 saved queries, and 7,632 historical culture cycles.
  * Verified `PondIndex` compound hierarchy: `Farm.Module.Row.Pond.Cycle` (e.g. `2010112.43` $\rightarrow$ Physical Pond `01.01.12`, Cycle 43).
  * Confirmed 133 active production ponds out of 234 operational ponds (377 total farm assets).
* **Dual-Portal Ecosystem Designed:**
  * **Portal 1 (Field Operations / WQS):** Touch-friendly interface for 9 Supervisors + 9 Pond Managers (24-pond grid, real-time DO/pH alerts, daily feeding swatches, and aerator HP calculation).
  * **Portal 2 (Executive Management / iSHARP DBMS):** Recreating the 9-tab `GrowoutPondMaster` interface, P&L costing, buyer sales grading, and SAP ERP movements (261/262).

---

## 2026-09-23 to 2026-09-25: Supabase Cloud Migration & Automated Sync Engine
* **Cloud Schema Deployment:**
  * Deployed PostgreSQL schema on Supabase (`keappoukeagyzpoxkrru.supabase.co`).
  * Established the **Active Gatekeeper Pattern**: `active_operational_ponds` acts as the gatekeeper for telemetry, referencing permanent dimension `stocking_records(pond_index)`.
  * Deployed RPC ingestion functions: `log_water_quality` and `log_weather_telemetry`.
* **Hardware & Cloud Bridges:**
  * Upgraded Weather Station ESP32 v10 via Google Apps Script (`GoogleAppsScript.gs`) to forward streaming environmental telemetry directly into Supabase `weather_logs`.
  * Built the **Friday Smart Delta Sync Engine** (`sync_weekly_access.ps1` & `Run_Friday_Sync.bat`) to incrementally synchronize newly emailed weekly `.accdb` databases into Supabase in ~20 seconds.

---

## 2026-09-28: iSHARP DBMS 2.0 & Phase 1 Portal Delivery
* **Architectural Guardrails Established:**
  * Drafted [RULES.md](file:///C:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/isharp-dbms/RULES.md) enforcing the 5-layer inward dependency rule and RBAC permissions.
* **Master Specification Authored:**
  * Created [EXECUTIVE_PORTAL_SPEC.md](file:///C:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/isharp-dbms/EXECUTIVE_PORTAL_SPEC.md) detailing the Welcome Portal and 216-Pond Interactive Farm Map.
* **Phase 1 Completed (Portal Routing & Minimalist Landing Page):**
  * Built single unified app with `viewRouter.js` handling `portal`, `executive`, and `dbms` views.
  * Designed 50/50 Frutiger Aero split landing page with animated upward-drifting water bubbles, official Blue Archipelago logo badge, and 3D clickable glass orbs with tactile zoom and ripple transitions.
  * Added persistent `"← Back to Portal"` navigation across Executive and DBMS views.

---

## 2026-09-29: Phase 2 Delivered — 216-Pond Interactive Farm Grid Map
* **Component Delivered:** Built and mounted `PondGridMap.js` inside `src/modules/executive/executiveTab.js`.
* **Farm Grid Architecture:** Rendered all 9 Modules (18 rows of 12 ponds = 216 commercial ponds).
* **Farm-Wide Data Fix:** Resolved PostgREST 1,000-row historical cycle ceiling by filtering on non-closed cycles (`pond_status=neq.CLOSE`); all 291 active farm cycles across Modules 01 through 09 now render seamlessly.
* **Dual DBMS Navigation:** Added both `[ ← Back to Portal ]` and `[ 🗺️ Executive Map ]` in DBMS top-left header for seamless switching without revisiting the landing page.
* **Biosecurity Engine:** Wired each pond cell to Supabase `stocking_records`, `active_operational_ponds`, and batch pathology records in `pond_issues` (🔴 Red Alert, 🟡 Observation Warning, 🟢 Clean Active, ⚪ Idle).
* **Culture Stages Standardized:** Applied `Early (<30 DOC)`, `Mid (30–70 DOC)`, and `Finishing (>70 DOC)`.
* **Clean UI & Slide-Out Drawer:** Removed redundant floating hover tooltip and module badges; clicking any pond tile opens the slide-out right drawer with full telemetry, sampling biometrics, and a direct `[ ⚙️ Open in DBMS View ]` button.
* **Performance & Cache:** Added 5-minute in-memory `sessionStorage` cache with manual refresh, eliminating redundant network requests.
* **Build Verified:** Vite production build passed cleanly (`dist/` generated with 0 errors).

---

## 2026-09-29: Enterprise Staff Directory Normalization & Cycle Incentive Assignment
* **Architectural Normalization (3NF):**
  * Recreated `public.pond_staff` strictly as the **Master Staff Directory** (`staff_no` PK, `staff_name`, `staff_position`, `is_active`) containing all **121 unique farm personnel** extracted and deduplicated from `Bab SGo (r41) 26.09.25.accdb`.
  * Removed static pond linkages from `pond_staff` to support rotation and cycle-accurate tracking.
* **Cycle Crew Allocation Schema:**
  * Added cycle-specific assignment columns to `public.growout_pond_master`: `pm_staff_no`, `sv_staff_no`, `rl_staff_no`, `po_staff_no`, `support_staff_no`.
  * Guarantees 100% accurate historical attribution for harvest target incentive payouts per `pond_index`.
* **Interactive DBMS Personnel UI (Tab 9: Staff & Remarks):**
  * Built smart ID entry with instant name lookup: typing or selecting a 4-digit ID (e.g. `0042` $\rightarrow$ Bujang Slamat, `1157` $\rightarrow$ Mohd Azlie, `1120` $\rightarrow$ Mohammad Fathuddin, `1216` $\rightarrow$ Mohd Ridzuan) immediately populates the corresponding staff name from the in-memory directory cache.
  * Added HTML5 datalist autocomplete for all 121 staff members.
  * Added **`[ 💾 Save Personnel Allocation ]`** button directly patching `growout_pond_master` with toast confirmation.
* **Build Verified:** Vite production build passed cleanly (`dist/` generated with 0 errors).

---

## 2026-09-29: Phase 3 Delivered — Field Operations Portal, 24-Pond Map & Management Entry
* **3-Orb Frutiger Aero Gateway:**
  * Upgraded [landingPage.js](file:///C:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/isharp-dbms/src/modules/landing/landingPage.js) and [landing.css](file:///C:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/isharp-dbms/src/styles/landing.css) to a 3-orb layout: **Executive Dashboard**, **Field Operations**, and **iSHARP DBMS**.
  * Registered `#field-ops` route in [viewRouter.js](file:///C:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/isharp-dbms/src/routing/viewRouter.js).
* **Module Authentication Gate:**
  * Created `module_passwords` table in Supabase Cloud for Modules 01 to 09.
  * Built password-protected module login with session persistence (`sessionStorage`).
* **24-Pond Supervisor Map ([FieldOpsMap.js](file:///C:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/isharp-dbms/src/modules/fieldOps/FieldOpsMap.js)):**
  * Displays the 24 ponds of the selected module (2 rows × 12 ponds).
  * Pond tiles are color-coded directly by the **WQS Feeding Action Plan**:
    * 🔴 **Critical / Reduce Feed** (DO < 3.0, Rain >= 40mm, pH swing > 1.0, Temp >= 33°C)
    * 🟡 **Caution / Careful Feed** (Morning DO dip 3.0–4.0, pH swing 0.5–1.0, Rain 20–40mm, Low Lux)
    * 🟢 **Optimal / Normal Feed** (All parameters safe)
    * ⚪ **Idle / Prep** (Unstocked)
* **Pond-Level WQS Detail ([PondWqsDetail.js](file:///C:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/isharp-dbms/src/modules/fieldOps/PondWqsDetail.js)):**
  * Ported from `WQS DashBoard Module1`: sampling biometrics (ABW, AWG, SR%, Biomass, FCR), dynamic Feeding Action Plan "Why?" diagnostics, diurnal DO/pH/Temp swings, and weather station telemetry.
* **Management Entry Architecture (Dedicated Full Screen Page):**
  * **No Modal / Separate Screen**: Ported Management Entry to a standalone, full-screen operational page ([ManagementEntryPage.js](file:///C:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/isharp-dbms/src/modules/fieldOps/ManagementEntryPage.js)), completely separating it from the pond monitoring view.
  * **Paddlewheel Standardization**: Completely eliminated 4.0 HP units across all calculations and inputs. Standardized strictly to farm reality: **1.0 HP and 2.0 HP paddlewheels only** ($\text{Total HP} = 1.0 \times \text{aerator\_1hp} + 2.0 \times \text{aerator\_2hp}$).
  * **Single Source of Truth Storage**:
    * Personnel $\rightarrow$ `growout_pond_master(pm_staff_no, sv_staff_no, rl_staff_no, po_staff_no, support_staff_no)` with live name resolution from `pond_staff`.
    * Aeration $\rightarrow$ `growout_pond_master(aerator_1hp, aerator_2hp)` and `pond_aerator_inventory`.
    * Feeding Trays, Autofeeders, Hut Condition, Supervisor Remarks $\rightarrow$ `pond_inventories(feeding_tray_count, autofeeder_count, hut_condition, notes)`.
* **Biometrics Sampling Latest Record Fix:**
  * Resolved critical order bug in [samplingRepository.js](file:///C:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/isharp-dbms/src/infrastructure/repositories/samplingRepository.js): switched from `smpl_doc.asc` to `smpl_doc.desc`.
  * Index `[0]` now correctly resolves the latest weekly sampling (e.g. Pond `01.02.11` DOC 69 correctly displays the 2026-09-23 DOC 63 record: ABW `13.05 g`, AWG `+2.05 g/wk`, SR `49.2%`, Biomass `2,812 kg`, FCR `1.48` instead of the old DOC 28 record).
  * Fixed AWG string formatting to avoid double sign (`+-`).
* **Zero Fake Data on 24-Pond Overview Map ([FieldOpsMap.js](file:///C:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/isharp-dbms/src/modules/fieldOps/FieldOpsMap.js)):**
  * Completely removed synthetic simulated sensor formulas (`5.1 + ((p % 5) * 0.15)`).
  * Map tiles now render 100% real database attributes: Pond Code, Cycle, DOC, Species, Line, Area, Assigned Operator, and Active Aeration HP.
  * Displays honest `📡 IoT Node Offline (DO: -- | pH: -- | T: --)` placeholder cards until hardware nodes are powered on.
  * Updated filter pills to: `All 24 Ponds`, `🟢 In Culture`, `⚪ Idle / Prep`.
* **Live Meteorological Telemetry Integration ([WeatherRepository.js](file:///C:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/isharp-dbms/src/infrastructure/repositories/weatherRepository.js)):**
  * Directly queries live Supabase `weather_logs` (2,727+ records) and `weather_hourly_summary`.
  * Visualizes real farm weather station metrics: Solar Lux, 24h Rainfall Today, Ambient Air Temp, Relative Humidity, and Barometric Pressure with real-time update timestamps.
* **Network & Database Client Hardening:**
  * Enhanced [supabase.js](file:///C:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/isharp-dbms/src/infrastructure/supabase.js) to safely handle empty 201 Created and 204 No Content responses without JSON parse exceptions.
  * Added `on_conflict` parameters to `pond_inventories` and `pond_aerator_inventory` upsert endpoints to guarantee non-destructive merges.
* **Build Verified:** Vite production build passed cleanly (`dist/` generated in 966ms with 0 errors).

---

## 2026-09-29: Phase 4 Delivered — Field Operations Daily Records Logbook & Multi-Item Ledger
* **4-View Supervisor Experience ([fieldOpsView.js](file:///C:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/isharp-dbms/src/modules/fieldOps/fieldOpsView.js)):**
  * Seamlessly orchestrated four full-screen operational interfaces with persistent state:
    1. **Module Supervisor Overview Map** (24-pond status & offline IoT placeholders)
    2. **Pond WQS Detail & Feeding Action Diagnostics**
    3. **Dedicated Management Entry Page** (Paddlewheel 1HP/2HP & inventory counts)
    4. **Dedicated Daily Records Logbook Page**
* **Continuous DOC 1 to Present Timeline ([DailyRecordsPage.js](file:///C:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/isharp-dbms/src/modules/fieldOps/DailyRecordsPage.js)):**
  * Built an interactive, full-screen digital ledger replacing manual paper logbooks.
  * Dynamically populates chronological daily rows for the active culture cycle (DOC 1 through harvest).
  * Tracks core aquaculture metrics per day:
    * **Feeding (kg/day)** & **4-Tray Leftover Remnants (% feed remaining)**
    * **Water Depth / Level (cm)** & **Visual Water Colour** classifications
    * **Daily Shrimp Mortality (pcs)** & **Operational Field Remarks**
* **Multi-Item Minerals & Probiotics Ledger Integration:**
  * Created [MineralProbioticRepository.js](file:///C:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/isharp-dbms/src/infrastructure/repositories/mineralProbioticRepository.js) linked directly to Supabase `public.mineral_probiotic_used`.
  * Built dynamic multi-row chemical/additive entry within daily modal dialogs:
    * Standardized **Minerals** list (Agricultural Lime, Calcium Carbonate, Dolomite, Sodium Bicarbonate, MgCl2, MgSO4, KCl, CuSO4, Zeolite, etc.)
    * Standardized **Probiotics & Fermentations** list (Super MS, EM Bokashi, FOS 50, Rice Bran, Bacillus subtilis, Super PS, Molasses, Yeast Ferments, etc.)
  * Live cycle rollup banner calculating total cumulative feed consumed (kg), total minerals applied (kg), total probiotics applied (L), and total mortality.
* **Backend Repository Services:**
  * Implemented [dailyRecordsRepository.js](file:///C:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/isharp-dbms/src/infrastructure/repositories/dailyRecordsRepository.js) with upsert, date range query, and batching.
  * Added instant optimistic updates and toast alerts on save.

---

## 2026-09-29: iSHARP Simulator Architecture Blueprint Authored
* **Bio-Economic Digital Twin Blueprint ([PROJECT_BLUEPRINT.md](file:///C:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/isharp-simulator/PROJECT_BLUEPRINT.md)):**
  * Documented the strategic architecture for the forward-looking 1-to-12-month farm simulator in `isharp-simulator/`.
  * Designed to solve module synchronization, strict $\le$ 30-day idle fallow window enforcement, Vannamei vs. Monodon species mix, feed procurement forecasting across pellet sizes, monthly TNB power & aerator OPEX, and East Coast Northeast Monsoon fallow planning.
  * Established clean architectural separation: `isharp-dbms` handles actual reality, while `isharp-simulator` tests future "What-If" scenarios on top of live Supabase tables.
  * Defined mathematical specifications for 4 core engines: Biological Growth & Biomass, Feeding Rate, Financial OPEX & Cash Flow, and Module Schedule / Fallowing Gantt.

---

## 2026-09-29: Access Sync Engine Normalization & Migration Scripts
* **Master Table Normalization ([sync_weekly_access.ps1](file:///C:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/database_migration/sync_weekly_access.ps1)):**
  * Standardized synchronization pipeline to populate `growout_pond_master` directly.
  * Enforced clean standard uppercase strings for `pond_status` (`PRODUCTION`, `IDLE`, `PREPARATION`, `RESERVOIR`, `MAINTENANCE`, `CLOSE`, `NOT IN USE`) and `pond_active` (`ACTIVE`, `INACTIVE`), resolving legacy Access case inconsistencies.
  * Isolated `pond_stocking_batches` as the sole source of truth for individual seed releases.
* **Staff Directory Tooling:**
  * Added [migrate_staff_to_supabase.ps1](file:///C:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/database_migration/migrate_staff_to_supabase.ps1) and [populate_staff_directory.ps1](file:///C:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/database_migration/populate_staff_directory.ps1) for extracting, normalizing (3NF), and synchronizing 121 farm personnel into `pond_staff`.



