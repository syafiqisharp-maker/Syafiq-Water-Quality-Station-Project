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
