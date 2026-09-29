# iSHARP DBMS 2.0 — Architectural Guardrails & Coding Standards

This document establishes the architectural standards for iSHARP DBMS 2.0. Any developer, AI agent, or collaborator working on this codebase MUST adhere strictly to these principles to prevent code degradation, avoid "vibe-coding" regressions, and maintain long-term reliability.

---

## 1. Core Architectural Layers & Inward Dependency Rule

Code is organized into 5 strict layers. Dependencies can only flow downward/inward:

```
UI Modules (src/modules/) & Components (src/components/)
               │
               ▼
   Reactive State (src/state/)
               │
               ▼
Infrastructure & Repositories (src/infrastructure/)
               │
               ▼
 Domain Logic (src/domain/) [Zero Dependencies, Pure Functions]
```

- **Domain Layer (`src/domain/`):**
  - Contains all aquaculture math (DOC, ADG, Biomass, FCR, Aerator HP calculation, Cycle Rollover state transitions).
  - **Rule:** Pure functions only. ZERO imports from `src/components/`, ZERO direct `fetch()` calls, ZERO DOM references (`document.getElementById`).
  - Must be 100% testable in isolation.

- **Infrastructure Layer (`src/infrastructure/`):**
  - Manages Supabase REST communication and data mapping.
  - **Rule:** UI components must NEVER write raw SQL, REST queries, or Supabase fetch calls directly. They must always call a repository method (e.g. `PondRepository.getActiveCycles()`).

- **State Layer (`src/state/`):**
  - Central reactive pub/sub stores (`appState.js`, `filterStore.js`).
  - Coordinates active pond selection, filters, and user session across all tabs without coupling tabs together.

- **Feature Modules (`src/modules/`):**
  - Each tab has its own self-contained directory (e.g., `master/`, `sampling/`, `feeding/`).
  - **Rule:** Sibling modules must NEVER import from each other directly (e.g., `sampling/` cannot import `feeding/`). Communication happens via `appState.js` events.

---

## 2. Pragmatic Single-Responsibility Rule

- **One file, one logical responsibility.**
- Avoid creating "God Files" that combine networking, business logic, and UI rendering into a single class.
- When a file grows because it is doing multiple different jobs, split those responsibilities across the appropriate layers.
- Do not artificially fragment code that naturally belongs together into dozens of tiny files.

---

## 3. Role-Based Access Control (RBAC) Gating

Every modification action must respect user roles defined in `src/config/permissions.js`:

1. **`ROLE_PLANNER` (Full Edit Power):**
   - Can create new cycles, change cycle start dates, trigger cycle rollovers, adjust master stocking numbers, and archive ponds.
2. **`ROLE_SUPERVISOR` / `ROLE_MANAGER` (Inventory & Operations):**
   - Can update PWA / aerator units, log feed tray counts, record equipment inventory, and add field notes.
   - Master cycle configuration and rollover actions are locked/disabled.
3. **`ROLE_LAB_TECH` (Laboratory Only):**
   - Can edit water quality telemetry logs and PCR pathogen data.
   - All other tabs are read-only.
4. **`ROLE_VIEWER` (Read-Only):**
   - Can view data, filter ponds, and review analytics. All save/edit buttons are hidden or disabled.

---

## 4. Excel Import & Clipboard Guidelines

- All spreadsheet pasting (Sampling, Feeding, Harvest) must flow through `src/features/excelImporter/`.
- Must provide clear visual column guides to users before pasting.
- Must provide a "Copy Excel Template" one-click action.
- Data must be validated cell-by-cell with real-time green/red visual previews before committing to Supabase.

---

## 5. Single Source of Truth & Database Query Standards

- **Unified Views for Cycles:** When querying culture cycles, stocking dates (`stck_date`), species, or breeding lines, always query `view_growout_pond_cycles`. Do not query `stck_date` on the raw table `growout_pond_master`, as multi-batch stocking is normalized in `pond_stocking_batches`.
- **Personnel Directory & Assignment:**
  - `pond_staff` is the master directory containing personnel identity (`staff_no`, `staff_name`, `staff_position`, `is_active`).
  - Cycle assignments (`pm_staff_no`, `sv_staff_no`, `rl_staff_no`, `po_staff_no`, `support_staff_no`) are stored strictly on `growout_pond_master`.
- **Hardware & Field Inventory:**
  - Feeding trays, autofeeders, hut condition, and supervisor field remarks are stored strictly on `pond_inventories` keyed by `pond_index`.

---

## 6. Paddlewheel Standard (1.0 HP & 2.0 HP Only)

- On this farm, **only 1.0 HP and 2.0 HP paddlewheels exist**.
- There is **no such thing as 4.0 HP units**. Any 4.0 HP inputs or calculations are strictly prohibited.
- Total Active HP formula:
  $$\text{Total Active HP} = (1.0 \times \text{aerator\_1hp}) + (2.0 \times \text{aerator\_2hp})$$

---

## 7. Field Operations & Zero-Fake-Telemetry Policy

- **Never fabricate or simulate sensor telemetry**: If an IoT device is not installed or offline, never invent random DO, pH, or water temperature values.
- Instead, render clean, professional placeholder cards indicating:
  `📡 IoT Node Offline — Awaiting Sensor Deployment (DO: -- | pH: -- | T: --)`
- Use live `weather_logs` for meteorological mast telemetry (Solar Lux, Rainfall, Air Temp, Humidity, Pressure).
- Biometrics sampling queries must always order by `smpl_doc.desc` so the latest sampling record is resolved first.

