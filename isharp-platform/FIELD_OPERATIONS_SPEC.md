# iSHARP DBMS 2.0 — Field Operations Specification & Activity Log

> **Target Audience:** Field Operators, Row Leaders, and Field Supervisors  
> **Hardware Target:** Mobile Smartphones & Rugged Outdoor Field Tablets  
> **Single Source of Truth:** Cloud Supabase Database (`public` schema)  
> **Last Updated:** 2026-09-30

---

## 1. Executive Summary & Operational Scope

The **Field Operations** module of the iSHARP Aquaculture Platform provides real-time, pond-side decision support for farm teams working directly on the dikes in Setiu. 

While the **Executive Dashboard** and **iSHARP DBMS** are engineered for desktop analytics and corporate management, **Field Operations** is strictly optimized for **mobile web browsers**:
- **Zero Horizontal Jitter:** Hard-clamped `max-width: 100vw; overflow-x: hidden;`.
- **Sunlight & Glove Ergonomics:** Minimum 44px tap targets, active touch feedback, and high-contrast badges.
- **Wet-Finger Steppers:** Integrated `+` / `−` steppers so workers with wet or gloved hands do not need to operate the mobile virtual keyboard for paddlewheel or feed tray counts.
- **Dual Representation Mode:** Desktop screens render deep data tables; mobile phones automatically switch to compact, thumb-friendly DOC Day Cards.

---

## 2. Component Architecture & File Structure

```
isharp-platform/
├── index.html                               # Viewport-fit=cover & mobile stylesheet linkage
└── src/
    ├── styles/
    │   └── field-ops-mobile.css            # Scoped strictly to #view-field-ops & max-width: 768px
    ├── infrastructure/
    │   └── repositories/
    │       ├── dailyRecordsRepository.js   # Data access for daily_pond_records & treatments
    │       ├── inventoryRepository.js      # Data access for pond_inventories & aerators
    │       ├── staffRepository.js          # Master directory resolver from pond_staff
    │       └── pondRepository.js           # Cycle parameters from growout_pond_master
    └── modules/
        └── fieldOps/
            ├── fieldOpsView.js             # Module gate (01–09) & supervisor workspace shell
            ├── FieldOpsMap.js              # 24-pond overview mapping & row status filters
            ├── PondWqsDetail.js            # WQS operational detail, feeding action & weather telemetry
            ├── DailyRecordsPage.js         # Growout book records, continuous timeline & daily entry modal
            └── ManagementEntryPage.js      # Full-page personnel, aerator & inventory roster
```

---

## 3. Database Schema & Single Source of Truth

| Module Section | Primary Supabase Table | Key Fields / Constraints |
| :--- | :--- | :--- |
| **Cycle & Pond Coordinates** | `public.growout_pond_master` | `pond_index` (PK), `pond`, `pond_status`, `stck_date`, `area` |
| **Pond Personnel Roster** | `public.growout_pond_master`<br/>`public.pond_staff` | `pm_staff_no`, `sv_staff_no`, `rl_staff_no`, `po_staff_no`, `support_staff_no`<br/>Names resolved live against `pond_staff.staff_no` |
| **Active Paddlewheels** | `public.growout_pond_master`<br/>`public.pond_aerator_inventory` | `aerator_1hp` (1.0 HP units only), `aerator_2hp` (2.0 HP units only). **Note:** 4.0 HP units strictly prohibited. |
| **Daily Growout Records** | `public.daily_pond_records` | `pond_index`, `log_date`, `feed_kg`, `feed_tray_remnant_pct`, `water_level_cm`, `water_colour`, `mortality_kg` (`numeric(8,2)`), `mortality_count` (`integer`), `remarks` |
| **Minerals & Probiotics** | `public.mineral_probiotic_used` | `record_id` (FK $\rightarrow$ `daily_pond_records.id`), `pond_index`, `log_date`, `category` (`MINERAL` / `PROBIOTIC`), `item_name`, `amount_used`, `unit` |
| **Field Hut & Hardware** | `public.pond_inventories` | `pond_index`, `feeding_tray_count`, `autofeeder_count`, `hut_condition` (`OK` / `Need Repair` / `Urgent Repair`), `notes` |
| **Live Meteorological Mast**| `public.weather_logs` | `air_temp_c`, `humidity_pct`, `solar_lux`, `rainfall_mm`, `baro_pressure_hpa` |

---

## 4. Key Engineering Standards Delivered

### A. Daily Mortality: Migration from Pieces (pcs) to Kilograms (kg)
- **Problem:** Farm technicians cannot count thousands of dead shrimp piece-by-piece; practical estimation is done by weighing scooped mortality in kilograms.
- **Supabase Migration:**
  ```sql
  ALTER TABLE public.daily_pond_records 
  ADD COLUMN IF NOT EXISTS mortality_kg numeric(8,2) DEFAULT 0.0;

  UPDATE public.daily_pond_records 
  SET mortality_kg = COALESCE(mortality_count, 0)::numeric(8,2) 
  WHERE mortality_kg IS NULL OR mortality_kg = 0.0;

  NOTIFY pgrst, 'reload schema';
  ```
- **Sync Architecture:** `DailyRecordsRepository` saves decimal weights to `mortality_kg` and maintains `mortality_count: Math.round(mortality_kg)` for backward compatibility with legacy reporting scripts.
- **UI Integration:** Input step is `0.1`, placeholder is `0.0`, summary cards report cumulative `kg`, table column displays `Mort. (kg)`, and mobile cards display `⚠️ Mortality: X.X kg`.

### B. Mobile UI Simplification & Responsive Dual-Labels (Clutter-Free Outdoor Design)
- **24-Pond Mapping Headers:** Cleaned from `Module 01 — Row 01 (Line 01: Ponds 01–12)` down to **`Module XX - Row YY`**.
- **Responsive Button Labels (`.btn-text-full` / `.btn-text-short`):**
  - `"← Back to 24-Pond Map"` automatically shortens to **`"← Back to Map"`** on mobile viewports ($\le 768\text{px}$).
  - `"📖 Growout Book Records"` shortens to **`"📖 Book Records"`** on mobile.
  - `"👷 Management & Personnel Entry"` shortens to **`"👷 Mgmt & Crew"`** on mobile.
- **Pond WQS Detail Cards:**
  - `Feeding Action Plan`: Subtitle description removed for rapid readability.
  - `Weather Station iSHARP`: Subtitle removed.
  - `Personnel & Aset Status`: Subtitle updated to reflect direct Supabase sync; displays true **Row Leader** name resolved from `rl_staff_no`.
- **Growout Book Records:**
  - Rebranded from "Pond Daily Operational Records" to **"Growout Book Records"**.
  - Redundant `"DAILY LEDGER"` badge and descriptive subtitle removed.
- **Management & Personnel Entry:**
  - Page renamed to **"Management & Personnel Entry"**.
  - Supervisor role title standardized to **"Supervisor"**.
  - Aeration header simplified to **"Active Paddlewheels"**.

### C. Dual-Persona Rapid Field Logging Architecture (3-In-1 Workflow)
Designed to satisfy both **Field Workers** (who need to log 12–24 ponds in under 2 minutes with wet hands) and **Supervisors** (who need an instant 24-pond overview map):
1. **24-Pond Map with Live Logging Progress & 1-Tap Quick Log (`FieldOpsMap.js`, `DailyRecordsRepository.getRecordsByDate`):**
   - Single-query batch fetch loads today's `daily_pond_records` across the module.
   - Displays a live **`📊 Today's Log: X / Y Ponds`** completion counter and **`⚡ Rapid Log`** button in the toolbar.
   - Every active pond tile displays either a green **`✓ Logged (XXkg)`** badge or an orange **`➕ Log`** quick-action pill that opens the entry sheet directly over the map (`openQuickModal`) without losing scroll position.
   - Tapping the main pond card body continues to open the full WQS Operational Detail view for Supervisors.
2. **3-Tap Rapid Entry Sheet & Smart Yesterday Carry-Forward (`DailyRecordsPage.js`):**
   - **Smart Carry-Forward:** New daily logs automatically pre-fill `feed_kg`, `water_level_cm`, and `water_colour` from the pond's latest previous record, displaying a `↺ Pre-filled from [Date]` banner.
   - **1-Tap Steppers & Preset Chips:**
     - **Feed (`kg`):** `-5`, `-1`, `+1`, `+5` stepper buttons.
     - **Tray Leftover (`%`):** `0%`, `5%`, `10%`, `15%`, `25%` preset chips.
     - **Water Level (`cm`):** `-5`, `-2`, `+2`, `+5` stepper buttons aligned flush with full-width input inside `minmax(0, 1fr)` cards.
     - **Observed Water Colour:** 8 confined 1-tap swatch buttons using **true 3D CSS radial-gradient orbs (`.water-swatch-orb`)** and simple colour names (**`Lt Green`**, **`Green`**, **`Dk Green`**, **`Brn Green`**, **`Tea`**, **`Brown`**, **`Clear`**, **`Turbid`**). Legacy values such as `"Tea Brown"` or `"Tea / Light Brown"` automatically normalize to **`Tea`**.
   - **Progressive Disclosure:** Optional sections (`🧪 + Minerals`, `🦠 + Probiotics`, `⚠️ + Mortality / Note`) are collapsed into 1-tap toggle pills by default and auto-expand when editing records that contain treatments or mortality.
3. **Sequential Pond Switcher (`⚡ Save & Next ➔`):**
   - Header includes `◀ Prev` and `Next ▶` buttons to cycle through active ponds without closing the modal.
   - Sticky single-row footer includes `Cancel`, `💾 Save`, and **`⚡ Save & Next ➔`** (which saves the current pond and immediately loads the next active pond in sequence, with `2.85rem` bottom clearance on mobile).

### D. Timezone-Safe Local Date Engine (`getLocalDateStr` & `parseLocalDate`)
- Eliminates `new Date().toISOString().split('T')[0]` UTC date-shift bugs (where Malaysia `UTC+8` between `00:00` and `07:59` local time resolved to yesterday's UTC date).
- All daily record timelines, `TODAY` badges, and `calculateDOC()` calculations in `src/domain/biometrics.js` and `DailyRecordsPage.js` strictly construct and compare local `YYYY-MM-DD` dates.

---

## 5. Daily Activity Log: 2026-09-30

| Timestamp | Scope | Activity / User Directive | Engineering Solution Delivered |
| :--- | :--- | :--- | :--- |
| **10:05** | UI Rebranding | Simplify titles & remove descriptions in `PondWqsDetail.js` | Rebranded to "Feeding Action Plan", removed subtitle description. Rebranded "Live Weather Station Telemetry" to "Weather Station iSHARP". Rebranded crew card to "Personnel & Aset Status", connected "Row Leader" directly to `rl_staff_no` in Supabase backend. |
| **10:12** | Management View | Clean up labels in `ManagementEntryPage.js` | Renamed page to "Management & Personnel Entry". Updated staff title to "Supervisor". Simplified aerator title to "Active Paddlewheels" and removed blade descriptions. |
| **10:15** | Mobile Optimization | Plan & implement mobile responsiveness for Field Operations (`/plan`) | Created `mobile_field_operations_plan.md`. Created `field-ops-mobile.css` scoped to `#view-field-ops`. Configured 44px touch targets, iOS auto-zoom prevention, horizontal filter scrolling, 2-column mobile grids, DOC day cards, and sticky bottom save bar. |
| **10:20** | Touch Ergonomics | Support wet/gloved fingers in `ManagementEntryPage.js` | Implemented large `+` / `−` stepper buttons for 1.0 HP and 2.0 HP paddlewheels, feeding trays, and autofeeders. Bound touch events with live HP badge updates. |
| **10:23** | Growout Records | Rebrand daily ledger page in `DailyRecordsPage.js` | Changed title to "Growout Book Records". Removed "DAILY LEDGER" badge and long description paragraph. |
| **10:40** | Database & Core | Convert Daily Mortality from pieces (pcs) to kilograms (kg) (`/plan`) | Created `mortality_kg_migration_plan.md`. Ran DDL on Supabase `daily_pond_records` to add `mortality_kg numeric(8,2)`. Updated `DailyRecordsRepository`, `DailyRecordsPage.js`, `feedingTab.js`, `index.html`, and `excelModal.js`. |
| **10:57** | 24-Pond Map | Simplify module row titles in `FieldOpsMap.js` | Changed `Module ${modStr} — Row ${rX} (Line 0X: Ponds 01–12)` to `Module ${modStr} - Row ${rX}` dynamically across all 9 modules. |
| **12:30** | Documentation | Consolidate and document morning activities | Updated `RULES.md` with Sections 8 & 9. Updated `EXECUTIVE_PORTAL_SPEC.md` Decision Log. Created `FIELD_OPERATIONS_SPEC.md`. |
| **14:15** | Landing Portal | Rebrand Landing Page & remove button subtitles | Changed header badge to `"BAB AQUACULTURE PLATFORM"`, footer to `"Aquaculture Platform 2026"`, and removed subtitles under all 3 portal gateway buttons in `landingPage.js` and `landing.css`. |
| **15:00** | Date & Auth Bugfix | Fix late "TODAY" badge in Growout Book Records & center login modal | Replaced UTC `toISOString()` date logic with local `getLocalDateStr()` and `parseLocalDate()` in `DailyRecordsPage.js` and `biometrics.js`. Centered the Module Password Modal vertically and horizontally in `fieldOpsView.js`. |
| **15:35** | UI/UX Pro Max | Platform UI/UX audit & mobile label shortening | Shortened mobile navigation buttons (`"← Back to Map"`, `"📖 Book Records"`, `"👷 Mgmt & Crew"`), added `tabular-nums`, boosted sunlight contrast, and disabled mobile keyboard auto-popup on modal open. |
| **16:05** | Rapid Field UX | Adopt 3-in-1 Rapid Field Logging brainstorm | Added `getRecordsByDate` batch query, 1-Tap `➕ Log` & `✓ Logged` badges on the 24-Pond Map, Smart Yesterday Carry-Forward, 1-Tap steppers/chips, collapsible optional sections, and `⚡ Save & Next ➔` sequential pond switcher. |
| **16:35** | Water Colour Orbs & Containment | Confine Water Level & Water Colour grids inside card borders, match orb colours, and use simple names | Enforced `minmax(0, 1fr)` containment on `.daily-entry-grid-2col`, replaced generic emojis with true 3D CSS radial-gradient orbs (`.water-swatch-orb`), and standardized simple colour names (`Lt Green`, `Green`, `Dk Green`, `Brn Green`, `Tea`, `Brown`, `Clear`, `Turbid`). |
| **16:55** | Mobile Modal Fix | Fix modal flex squashing & switcher button layout in `DailyRecordsPage.js` & `field-ops-mobile.css` | Replaced `.quick-chip-btn` with fixed-width `.btn-modal-pond-nav` (`68px`) on switcher bar so pond info text is never squashed into a 1-character column. Set `.modal-dialog` to `display: block` with natural `-webkit-overflow-scrolling: touch` and added `flex-shrink: 0` to `.daily-entry-card` to eliminate flexbox min-height collapsing of Feeding and Water sections. |

---

## 6. Verification & Build Status

- **Vite Production Bundler:**
  ```bash
  cmd.exe /c "npm run build"
  # Output: 53 modules transformed cleanly (dist/index.html 89.63 kB, CSS 74.48 kB, JS 327.22 kB, 0 errors)
  ```
- **Database Schema Integrity:** Verified via Supabase `information_schema.columns` and round-trip queries on `public.daily_pond_records` and `public.mineral_probiotic_used`.

