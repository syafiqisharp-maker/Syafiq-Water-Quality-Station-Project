# Supabase Database Migration Guide
**Project:** Aquaculture Water Quality Station (WQS)  
**Date:** 22 September 2026  
**Status:** Schema Finalized & Audited — Ready for Deployment

---

## 1. System Architecture: The Active Gatekeeper Pattern

The farm operates ~200 ponds, with approximately 120 ponds culturing shrimp simultaneously.

```
                       ┌───────────────────────────────┐
                       │  IoT SENSOR DEVICE (e.g. WQS) │
                       └──────────────┬────────────────┘
                                      │ Sends: "Pond 01.02.12"
                                      ▼
               ┌──────────────────────────────────────────────┐
               │    GATE: active_operational_ponds            │
               │    (Pond: 01.02.12  ──►  PondIndex: 2010212.43)
               └──────────────────────┬───────────────────────┘
                                      │
                   ┌──────────────────┴──────────────────┐
                   ▼                                     ▼
           Pond NOT in Gate?                       Pond Found!
         ┌───────────────────┐               ┌────────────────────────┐
         │ 🛑 IGNORE / DROP  │               │ 💾 RECORD TO FACT TABLE│
         │ Pond is harvested,│               │ using PondIndex        │
         │ do not record junk│               │ (water_quality_logs)   │
         └───────────────────┘               └───────────┬────────────┘
                                                         │
                                                         ▼
       ┌────────────────────────────────────────────────────────────────────────┐
       │                 MASTER DIMENSION: stocking_records                     │
       │                   (Primary Key: PondIndex)                             │
       │  Permanent history of all cycles (never deleted, even after harvest!)  │
       └──────────────┬──────────────────────────────────────────┬──────────────┘
                      ▲                                          ▲
                      │ Foreign Key                              │ Foreign Key
                      │                                          │
       ┌──────────────┴──────────────┐            ┌──────────────┴──────────────┐
       │   FACT: biometrics_sampling │            │   FACT: feed_barrel_logs    │
       │   (ABW, SR, Biomass, FCR)   │            │   (Sonar, Feed Rate)        │
       └─────────────────────────────┘            └─────────────────────────────┘
```

### Key Architectural Rules:
1. **`active_operational_ponds` is the Gatekeeper**:
   - Contains only currently active cycles (~120 ponds).
   - When a pond is harvested, simply **delete** its row from this table.
   - Deleting from the gate **does not** delete historical sensor data because foreign keys reference `stocking_records`.
2. **`stocking_records` is the Permanent Master**:
   - Every culture cycle (past and present) is kept here permanently under its unique `PondIndex` (e.g. `2010212.43`).
3. **Devices Send Physical Pond Label**:
   - Sensor firmware sends `Pond` (e.g. `01.02.12`).
   - Hardware does not need re-flashing when a new cycle starts.

---

## 2. Google Sheets Source Mapping

| Target Supabase Table | Role | Google Sheet Source URL |
| :--- | :--- | :--- |
| **`stocking_records`** | Master Dimension | [Stocking Sheet](https://docs.google.com/spreadsheets/d/1oXKgF2b4hBm1KIOwC5cD1aOiQMDQsW2SGvI0p-i3rII/edit?usp=sharing) |
| **`active_operational_ponds`** | Gatekeeper (Active Ponds) | [Current Operational Data](https://docs.google.com/spreadsheets/d/1pUrjGBmOmDHjZdzYUz6kfV5aBxAi1zABBjF0rLWeHkQ/edit?usp=sharing) |
| **`biometrics_sampling`** | Fact (Weekly Samples) | [Sampling Sheet](https://docs.google.com/spreadsheets/d/1E_4tOu_24I0dHHYHdX-Q6ST9DN4bceId1IkwYWQ0Les/edit?usp=sharing) |
| **`water_quality_logs`** | Fact (IoT WQS Telemetry) | [WQS Sheet](https://docs.google.com/spreadsheets/d/1zVXbhakvH8kFIcV_YL-YS89dsAF0eDNE-eeTxV-IWuY/edit?usp=sharing) |
| **`feed_barrel_logs`** | Fact (Autofeeder Sonar) | [Feed Barrel Sheet](https://docs.google.com/spreadsheets/d/19lHzaW6WengVOE1N-zNk-trIGwLduU7rDfaZGGLwSuM/edit?usp=sharing) |
| **`weather_logs`** | Fact (Weather Station) | [Weather Sheet](https://docs.google.com/spreadsheets/d/1xhWN6yg5u229HS-LbCDL2qVKs2b2v16XxGlklKR63BQ/edit?usp=sharing) |

---

## 3. Finalized PostgreSQL / Supabase Schema (SQL DDL)

Copy and run this in the Supabase **SQL Editor**:

```sql
-- 1. MASTER DIMENSION: STOCKING RECORDS
CREATE TABLE stocking_records (
    pond_index VARCHAR(50) PRIMARY KEY,
    stck_date DATE NOT NULL,
    stck_source VARCHAR(50),
    stck_species VARCHAR(50),
    stck_pcs NUMERIC(12, 2),
    stck_type VARCHAR(50),
    stck_allow NUMERIC(12, 2),
    stck_total NUMERIC(12, 2),
    stck_tank VARCHAR(50),
    stck_size NUMERIC(6, 2),
    stck_plstts VARCHAR(50),
    stck_ems VARCHAR(20),
    stck_wssv VARCHAR(20),
    stck_ehp VARCHAR(20),
    stck_remks TEXT,
    stck_status VARCHAR(50) DEFAULT 'NEW STOCK',
    lockline VARCHAR(20),
    tank_nursery VARCHAR(50),
    bs_line VARCHAR(50),
    index_no INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. GATEKEEPER: ACTIVE OPERATIONAL PONDS
CREATE TABLE active_operational_ponds (
    pond VARCHAR(20) PRIMARY KEY,
    pond_index VARCHAR(50) NOT NULL REFERENCES stocking_records(pond_index) ON DELETE RESTRICT,
    activated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. FACT: BIOMETRICS SAMPLING
CREATE TABLE biometrics_sampling (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pond_index VARCHAR(50) NOT NULL REFERENCES stocking_records(pond_index) ON DELETE CASCADE,
    smpl_date DATE NOT NULL,
    smpl_doc INT,
    smpl_abw NUMERIC(6, 2),
    smpl_surv NUMERIC(6, 2),
    smpl_dfed NUMERIC(10, 2),
    smpl_tfed NUMERIC(12, 2),
    p_smpl_date DATE,
    p_smpl_doc INT,
    p_smpl_abw NUMERIC(6, 2),
    p_smpl_surv NUMERIC(6, 2),
    p_smpl_dfed NUMERIC(10, 2),
    p_smpl_tfed NUMERIC(12, 2),
    sttg_abw NUMERIC(6, 2),
    sttg_surv NUMERIC(6, 2),
    sttg_bms NUMERIC(12, 2),
    sttg_dfed NUMERIC(10, 2),
    sttg_tfed NUMERIC(12, 2),
    smpl_bms NUMERIC(12, 2),
    index_no INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sampling_pond_index ON biometrics_sampling(pond_index, smpl_date DESC);

-- 4. FACT: WATER QUALITY TELEMETRY (No battery column)
CREATE TABLE water_quality_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pond_index VARCHAR(50) NOT NULL REFERENCES stocking_records(pond_index) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL,
    do_ppm NUMERIC(5, 2),
    ph NUMERIC(4, 2),
    water_temp_c NUMERIC(5, 2),
    turbidity_ntu NUMERIC(6, 2)
);

CREATE INDEX idx_wqs_pond_index_time ON water_quality_logs(pond_index, recorded_at DESC);

-- 5. FACT: AUTOFEEDER TELEMETRY
CREATE TABLE feed_barrel_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pond_index VARCHAR(50) NOT NULL REFERENCES stocking_records(pond_index) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL,
    distance_cm NUMERIC(6, 2),
    battery_v NUMERIC(4, 2),
    weight_kg NUMERIC(6, 2),
    consumed_kg NUMERIC(6, 2),
    feed_rate NUMERIC(6, 2),
    event_type VARCHAR(20) DEFAULT 'IDLE'
);

CREATE INDEX idx_feed_pond_index_time ON feed_barrel_logs(pond_index, recorded_at DESC);

-- 6. FACT: WEATHER TELEMETRY
CREATE TABLE weather_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recorded_at TIMESTAMPTZ NOT NULL,
    rainfall_mm NUMERIC(6, 2) DEFAULT 0,
    lux NUMERIC(10, 2),
    air_temp_c NUMERIC(5, 2),
    air_pressure_hpa NUMERIC(6, 1),
    humidity_pct NUMERIC(5, 2),
    rain_score INT DEFAULT 0,
    forecast VARCHAR(50)
);

CREATE INDEX idx_weather_time ON weather_logs(recorded_at DESC);

-- 7. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE stocking_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_operational_ponds ENABLE ROW LEVEL SECURITY;
ALTER TABLE biometrics_sampling ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_quality_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_barrel_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read all" ON stocking_records FOR SELECT USING (true);
CREATE POLICY "Allow read active gate" ON active_operational_ponds FOR SELECT USING (true);
CREATE POLICY "Allow read sampling" ON biometrics_sampling FOR SELECT USING (true);
CREATE POLICY "Allow read wqs" ON water_quality_logs FOR SELECT USING (true);
CREATE POLICY "Allow read feed" ON feed_barrel_logs FOR SELECT USING (true);
CREATE POLICY "Allow read weather" ON weather_logs FOR SELECT USING (true);

CREATE POLICY "Allow insert/modify all" ON stocking_records FOR ALL USING (true);
CREATE POLICY "Allow insert/delete gate" ON active_operational_ponds FOR ALL USING (true);
CREATE POLICY "Allow insert sampling" ON biometrics_sampling FOR ALL USING (true);
CREATE POLICY "Allow insert wqs" ON water_quality_logs FOR ALL USING (true);
CREATE POLICY "Allow insert feed" ON feed_barrel_logs FOR ALL USING (true);
CREATE POLICY "Allow insert weather" ON weather_logs FOR ALL USING (true);
```

---

## 4. Tomorrow's ESP32 Integration Options

The WQS ESP32 receiver currently posts to Google Apps Script (`NetworkManager.cpp`).

* **Option A (Recommended for speed & safety — No re-flashing)**:
  - Leave ESP32 firmware unchanged.
  - In Google Apps Script `doPost(e)`, forward readings to Supabase after checking the gate.
* **Option B (Direct to Supabase)**:
  - Update `Config.h` and `NetworkManager.cpp` on ESP32 to HTTP POST directly to Supabase REST endpoint:
    `https://YOUR_PROJECT.supabase.co/rest/v1/water_quality_logs`
