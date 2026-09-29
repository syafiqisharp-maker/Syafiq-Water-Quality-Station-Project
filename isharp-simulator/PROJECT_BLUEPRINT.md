# iSHARP Shrimp Farm Simulator (Bio-Economic Digital Twin)
**Project Blueprint & Architecture Handoff Document**  
**Created:** September 29, 2026  
**Location:** `C:\Users\syafiq\My Drive\Syafiq Water Quality Station Project\isharp-simulator`

---

## 1. Executive Vision & Core Problem

### The Pain Point
In large-scale commercial shrimp farming (Setiu Farm), planning operations from **next month up to the next 12 months** is exhausting and error-prone when done manually on spreadsheets. Every stocking decision creates a chain reaction across:
- **Module Synchronization:** Ensuring entire modules are stocked together and minimizing pond idle time (strict farm rule: **keep idle duration $\le$ 30 days**).
- **Species Strategy:** Choosing between *Penaeus vannamei* (whiteleg shrimp) and *Penaeus monodon* (black tiger shrimp) based on season, cycle length, and festive market windows.
- **Feed Procurement:** Estimating weekly/monthly feed tonnage across pellet sizes (Starter, Grower, Finisher) so purchasing orders are accurate ahead of time.
- **Utilities & Consumables:** Projecting monthly TNB electrical costs (based on 1HP & 2HP aerator counts and DOC run-hours), minerals, lime, and chemical requirements.
- **Manpower & Labour:** Allocating technician/operator headcount per active module.
- **Monsoon Risk Management:** Adjusting stocking density or fallowing vulnerable ponds during the **Northeast Monsoon (Nov – Jan)** on the East Coast of Peninsular Malaysia.
- **Harvest & Cash Flow Timing:** Predicting when standing biomass reaches target market sizes, estimating shrimp market prices at harvest time, and balancing monthly OPEX burn against harvest revenue.

### The Solution: A "Human Sandbox Powered by AI & Math"
Build an interactive **Shrimp Farm Simulator** (like a management strategy game / Digital Twin) where executives and farm managers can test "What-If" scenarios on top of live farm data, fast-forward through time, and let historical data + biological math calculate the exact resource, cost, and revenue outcomes.

---

## 2. Platform & Folder Architecture

- **Project Folder:** `C:\Users\syafiq\My Drive\Syafiq Water Quality Station Project\isharp-simulator`
- **Sibling Operational App:** `C:\Users\syafiq\My Drive\Syafiq Water Quality Station Project\isharp-dbms`
- **Separation of Concerns:**
  - `isharp-dbms` records **Actual Reality** (daily operations, stocking batches, biometrics sampling, harvest logs).
  - `isharp-simulator` explores **Future Scenarios** (read-only access to live Supabase production tables; saves simulation scenarios separately).
- **Target Platform:** **Web Browser Application (with PWA Desktop/Tablet install capability)**.
  - Designed for wide monitors, laptops, and meeting room iPads/projectors.
  - Connects directly to the existing Supabase PostgreSQL backend so every simulation starts from **Today's Live Pond State**.

---

## 3. Current Supabase Database Context (Single Source of Truth)

When continuing development on this simulator, use the normalized Supabase schema established in September 2026:

1. **`public.growout_pond_master`** (Cycle Master Table)
   - Holds 1 row per pond cycle (`pond_index`, e.g., `0101.56`).
   - Key columns: `pond`, `modl`, `row_no`, `cycle_no`, `crop_no`, `area`, `aerator_1hp`, `aerator_2hp`, `pond_status`, `pond_active`, `date_cycle`, `date_close`, `target_stck_date`.
   - Standardized uppercase `pond_active`: `'ACTIVE'`, `'INACTIVE'`.
   - Standardized uppercase `pond_status`: `'PRODUCTION'`, `'IDLE'`, `'PREPARATION'`, `'RESERVOIR'`, `'MAINTENANCE'`, `'CLOSE'`, `'NOT IN USE'`.
2. **`public.pond_stocking_batches`** (Single Source of Truth for Stocking)
   - Holds batch-level PL releases (`batch_id`, `pond_index`, `stck_date`, `stck_source`, `stck_species`, `bs_line`, `stck_pcs`, `stck_allow`, `stck_total`, `stck_size`, `stck_tank`, `stck_doc`, `date_baby_box`, `stck_ems`, `stck_wssv`, `stck_ehp`).
3. **`public.view_growout_pond_cycles`** (Unified Read View)
   - Joins `growout_pond_master` with aggregated `pond_stocking_batches` metrics (`stck_date`, `stck_species`, `stck_pcs`, `stck_total`, `batch_count`).
4. **Biometrics & Harvest Tables**
   - `biometrics_sampling` (`smpl_date`, `smpl_doc`, `smpl_abw`, `smpl_tfed`, etc.)
   - `harvest_records` (partial/full harvest weights, prices, revenues, survival rates, FCR).

---

## 4. The 4 Core Simulation Engines

### Engine 1: Biological Growth & Biomass Engine
- **Inputs:** Species (*P. vannamei* vs *P. monodon*), Stocking Density ($\text{PL/m}^2$), Pond Area (Ha), Season/Month.
- **Calculations:**
  - Daily/Weekly DOC progression.
  - Expected ABW (g) growth curve calibrated from Setiu's 7,900+ historical cycles.
  - Survival % decay curve over DOC.
  - Standing Biomass ($\text{kg} = \text{Surviving Pcs} \times \text{ABW}$).

### Engine 2: Operational & Resource Engine (OPEX)
- **Feed Requirement:** Daily/weekly feed demand (kg & bags) broken down by feed code/size based on current ABW and FCR curves.
- **Electrical Cost (TNB):** Calculated from pond `aerator_1hp` and `aerator_2hp` counts $\times$ daily operating hours (scaling up with DOC/biomass) $\times$ tariff rate.
- **Minerals, Lime & Probiotics:** Scheduled dosing based on pond area, water depth, and DOC phase.
- **Labour & Staffing:** Required operators/technicians per active module.

### Engine 3: Environmental & Monsoon Risk Guard
- **Setiu Operational Rules:**
  - **Idle Rule:** Flag any active pond where `IDLE` duration exceeds **30 days** from `date_cycle`.
  - **Module Sync Rule:** Prioritize stocking entire modules simultaneously for biosecurity and harvest efficiency.
  - **Northeast Monsoon Window (Nov – Jan):** Warn or automatically lower recommended stocking density when peak biomass coincides with heavy monsoon rainfall/low salinity periods.

### Engine 4: Market Price & Cash Flow Engine
- **Price Curve:** Shrimp selling price (RM/kg) mapped by shrimp count size (e.g., 30, 40, 50, 60, 80 pcs/kg) and seasonal festive demand (e.g., CNY, Hari Raya, year-end).
- **Harvest Optimizer:** Simulates Partial Harvest vs. Full Harvest timing to maximize net margin and relieve pond carrying capacity.
- **Financial Output:** Monthly OPEX outflow vs. Harvest Revenue inflow = Net Cash Flow trajectory.

---

## 5. Hybrid Decision Model (Math + ML + Human)

1. **Deterministic Rules (The Guardrails):** Hard aquaculture equations (biomass conservation, aerator kW math, feed tables, pond area limits).
2. **Historical ML / Statistical Calibration (The Brain):** Queries historical Supabase cycles to give realistic baselines for each module (e.g., *"Module 4 historically achieves 18g ABW at DOC 85 in dry season vs DOC 98 in monsoon"*).
3. **Human Sandbox (The Strategist):** Interactive UI where the user adjusts levers (Stock Date, Module, Species, Density) and compares saved scenario slots (*Scenario A* vs *Scenario B*).

---

## 6. Phased Development Roadmap (How to Build Step-by-Step)

When resuming this project, we will build incrementally so every step is tangible and easy to test:

- **Step 1: Data & Baseline Calibration**
  - Analyze historical Supabase data (`view_growout_pond_cycles`, `biometrics_sampling`, `harvest_records`) to extract Setiu's actual baseline curves (ABW by DOC, FCR, survival rates, cycle durations).
- **Step 2: Single-Pond / Single-Module "What-If" Calculator Prototype**
  - A simple interactive calculator where you pick a Module, Stocking Date, Species, and Density, and it outputs the complete cycle projection (Feed schedule, Electricity cost, Harvest date, Revenue).
- **Step 3: Multi-Module Timeline & Farm Board (The Simulator UI)**
  - Expand to all modules starting from Today's Live Farm State, adding the 12-month timeline scrubber, Monsoon risk flags, and monthly resource/cash-flow charts.
- **Step 4: Scenario Comparison & AI Optimizer**
  - Save multiple master plans ("Save Slots") and add smart recommendations for optimal module stocking order.
