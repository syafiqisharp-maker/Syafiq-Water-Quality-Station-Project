# Supabase Database Migration & Integration Guide
**Project:** Aquaculture Water Quality Station (WQS) & Environmental Telemetry  
**Supabase Project URL:** `https://keappoukeagyzpoxkrru.supabase.co`  
**Last Updated:** 23 September 2026  
**Status:** Live Database Deployed, Seeded, and Operational with Active GAS Bridge  

---

## 1. System Architecture: The Active Gatekeeper Pattern

The farm operates ~200 ponds, with approximately 120–135 ponds culturing shrimp simultaneously.

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
       │                   (Primary Key: pond_index)                            │
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

### Architectural Principles:
1. **`active_operational_ponds` is the Gatekeeper**:
   - Contains only currently active cycles (~133 ponds).
   - When a pond is harvested, simply **delete** its row from this table.
   - Deleting from the gate **does not** delete historical sensor data because foreign keys reference `stocking_records`.
2. **`stocking_records` is the Permanent Master**:
   - Every culture cycle (past and present) is kept here permanently under its unique `pond_index` (e.g. `2010212.43`).
3. **Devices Send Physical Pond Label**:
   - Sensor firmware sends physical `Pond` (e.g. `01.02.12`).
   - Hardware does not need re-flashing when a new cycle starts.
   - PostgreSQL RPC function `log_water_quality` resolves `pond` $\rightarrow$ `pond_index` on arrival.

---

## 2. Live Database Status & Data Sources

| Supabase Table | Role | Live Row Count | Source / Seed Artifact |
| :--- | :--- | :--- | :--- |
| **`stocking_records`** | Master Dimension | **373** | [seed_data.sql](file:///c:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/seed_data.sql) / [Stocking Sheet](https://docs.google.com/spreadsheets/d/1oXKgF2b4hBm1KIOwC5cD1aOiQMDQsW2SGvI0p-i3rII/edit?usp=sharing) |
| **`active_operational_ponds`** | Gatekeeper (Active Ponds) | **133** | [seed_data.sql](file:///c:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/seed_data.sql) / [Gatekeeper Sheet](https://docs.google.com/spreadsheets/d/16Yx8ugQUCP89D2zonWRPrdCFNORXVkz9K4tFqPiAMLo/edit?usp=sharing) |
| **`biometrics_sampling`** | Fact (Biometrics) | **2,431** | [seed_sampling.sql](file:///c:/Users/syafiq/My%20Drive/Syafiq%20Water%20Quality%20Station%20Project/seed_sampling.sql) / [Sampling Sheet](https://docs.google.com/spreadsheets/d/1E_4tOu_24I0dHHYHdX-Q6ST9DN4bceId1IkwYWQ0Les/edit?usp=sharing) |
| **`water_quality_logs`** | Fact (WQS Telemetry) | **1** (Verified) | Field WQS Stations / ESP32 Receiver Gateway |
| **`weather_logs`** | Fact (Weather Node) | **378+** (Streaming) | Weather Station v10 via Active GAS Bridge |
| **`feed_barrel_logs`** | Fact (Autofeeder Sonar) | **0** (Ready) | [Feed Barrel Sheet](https://docs.google.com/spreadsheets/d/19lHzaW6WengVOE1N-zNk-trIGwLduU7rDfaZGGLwSuM/edit?usp=sharing) |
| **`pond_aerator_inventory`** | Fact/Dim (Multi-Model Aerator) | **0** (Deployed) | Portal 1 Field Inventory Form / PWA Master |
| **`pond_inventories`** | Dim (Assets & Trays) | **0** (Deployed) | Portal 1 Field Inventory Form |
| **`daily_pond_records`** | Fact (Daily Field Logbook) | **0** (Deployed) | Portal 1 Daily Pond Record Journal |
| **`view_pond_aeration_summary`** | Computed View (Total HP) | **Live** | Automated aggregated HP view |

---

## 3. Today's Milestone: Weather Station GAS Cloud Bridge

On **23 September 2026**, the Google Apps Script for the Weather Station (`GoogleAppsScript.gs`) was successfully upgraded to act as an active cloud bridge between physical hardware and Supabase.

### Pipeline:
```
┌────────────────────────────┐
│ Weather Station ESP32 (v10)│
└─────────────┬──────────────┘
              │ HTTPS POST (Batch JSON)
              ▼
┌────────────────────────────────────────────────────────┐
│ Google Apps Script (doPost)                            │
│ 1. Appends to Google Sheet ("Live")                    │
│ 2. Calls forwardToSupabase(records, timeZone)          │
└─────────────────────────────┬──────────────────────────┘
                              │ HTTPS REST POST
                              ▼
┌────────────────────────────────────────────────────────┐
│ Supabase: https://keappoukeagyzpoxkrru.supabase.co     │
│ Endpoint: /rest/v1/weather_logs                        │
│ Headers:  apikey, Prefer: resolution=ignore-duplicates │
│ Table:    public.weather_logs (89+ records received)   │
└────────────────────────────────────────────────────────┘
```

### Key Technical Details of the Bridge:
* **Zero Downtime:** Live farm monitoring on Google Sheets continues uninterrupted while Supabase receives parallel data.
* **Timestamp Formatting:** Automatically formats ESP32 timestamps to ISO 8601 with GMT+8 offset (`YYYY-MM-DDTHH:mm:ss+08:00`).
* **Field Mapping:** Translates device keys (`temp`, `pressure`, `humidity`, `rainfall`, `lux`) directly to database columns (`air_temp_c`, `air_pressure_hpa`, `humidity_pct`, `rainfall_mm`, `lux`).
* **Deduplication:** Uses Supabase's `Prefer: resolution=ignore-duplicates` with `UNIQUE(recorded_at)` to eliminate duplicate records during network retransmissions.

---

## 4. Live PostgreSQL / Supabase Schema (DDL)

```sql
-- 1. MASTER DIMENSION: STOCKING RECORDS
CREATE TABLE IF NOT EXISTS stocking_records (
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
CREATE TABLE IF NOT EXISTS active_operational_ponds (
    pond VARCHAR(20) PRIMARY KEY,
    pond_index VARCHAR(50) NOT NULL REFERENCES stocking_records(pond_index) ON DELETE RESTRICT,
    activated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. FACT: BIOMETRICS SAMPLING
CREATE TABLE IF NOT EXISTS biometrics_sampling (
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
CREATE INDEX IF NOT EXISTS idx_sampling_pond_index ON biometrics_sampling(pond_index, smpl_date DESC);

-- 4. FACT: WATER QUALITY TELEMETRY
CREATE TABLE IF NOT EXISTS water_quality_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pond_index VARCHAR(50) NOT NULL REFERENCES stocking_records(pond_index) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL,
    do_ppm NUMERIC(5, 2),
    ph NUMERIC(4, 2),
    water_temp_c NUMERIC(5, 2),
    turbidity_ntu NUMERIC(6, 2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wqs_pond_index_time ON water_quality_logs(pond_index, recorded_at DESC);

-- 5. FACT: AUTOFEEDER TELEMETRY
CREATE TABLE IF NOT EXISTS feed_barrel_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pond_index VARCHAR(50) NOT NULL REFERENCES stocking_records(pond_index) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL,
    distance_cm NUMERIC(6, 2),
    battery_v NUMERIC(4, 2),
    weight_kg NUMERIC(6, 2),
    consumed_kg NUMERIC(6, 2),
    feed_rate NUMERIC(6, 2),
    event_type VARCHAR(20) DEFAULT 'IDLE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feed_pond_index_time ON feed_barrel_logs(pond_index, recorded_at DESC);

-- 6. FACT: WEATHER TELEMETRY
CREATE TABLE IF NOT EXISTS weather_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recorded_at TIMESTAMPTZ NOT NULL UNIQUE,
    rainfall_mm NUMERIC(6, 2) DEFAULT 0,
    lux NUMERIC(10, 2),
    air_temp_c NUMERIC(5, 2),
    air_pressure_hpa NUMERIC(6, 1),
    humidity_pct NUMERIC(5, 2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_weather_time ON weather_logs(recorded_at DESC);

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

CREATE POLICY "Allow modify stocking" ON stocking_records FOR ALL USING (true);
CREATE POLICY "Allow modify gate" ON active_operational_ponds FOR ALL USING (true);
CREATE POLICY "Allow modify sampling" ON biometrics_sampling FOR ALL USING (true);
CREATE POLICY "Allow modify wqs" ON water_quality_logs FOR ALL USING (true);
CREATE POLICY "Allow modify feed" ON feed_barrel_logs FOR ALL USING (true);
CREATE POLICY "Allow modify weather" ON weather_logs FOR ALL USING (true);

-- 8. WQS GATEKEEPER INGESTION FUNCTION (RPC)
CREATE OR REPLACE FUNCTION log_water_quality(
    p_pond VARCHAR,
    p_do NUMERIC,
    p_ph NUMERIC,
    p_temp NUMERIC,
    p_turbidity NUMERIC
) RETURNS JSONB AS $$
DECLARE
    v_pond_index VARCHAR;
BEGIN
    SELECT pond_index INTO v_pond_index 
    FROM active_operational_ponds 
    WHERE pond = p_pond;
    
    IF v_pond_index IS NOT NULL THEN
        INSERT INTO water_quality_logs (
            pond_index, 
            recorded_at, 
            do_ppm, 
            ph, 
            water_temp_c, 
            turbidity_ntu
        )
        VALUES (
            v_pond_index, 
            NOW(), 
            p_do, 
            p_ph, 
            p_temp, 
            p_turbidity
        );
        RETURN jsonb_build_object('status', 'success', 'pond_index', v_pond_index);
    ELSE
        RETURN jsonb_build_object('status', 'ignored', 'reason', 'Pond not active');
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. WEATHER STATION BATCH INGESTION (RPC)
CREATE OR REPLACE FUNCTION log_weather_telemetry(records JSONB)
RETURNS JSONB AS $$
DECLARE
    rec RECORD;
    inserted_count INT := 0;
BEGIN
    FOR rec IN SELECT * FROM jsonb_to_recordset(records) AS x(
        "timestamp" TEXT,
        temp NUMERIC,
        lux NUMERIC,
        rainfall NUMERIC,
        humidity NUMERIC,
        pressure NUMERIC
    )
    LOOP
        INSERT INTO weather_logs (
            recorded_at,
            air_temp_c,
            lux,
            rainfall_mm,
            humidity_pct,
            air_pressure_hpa
        )
        VALUES (
            (rec."timestamp" || '+08')::TIMESTAMPTZ,
            rec.temp,
            rec.lux,
            rec.rainfall,
            rec.humidity,
            rec.pressure
        )
        ON CONFLICT (recorded_at) DO NOTHING;
        
        inserted_count := inserted_count + 1;
    END LOOP;

    RETURN jsonb_build_object('status', 'success', 'processed', inserted_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. ANALYTICAL VIEW: HOURLY WEATHER SUMMARY
CREATE OR REPLACE VIEW weather_hourly_summary AS
SELECT 
    date_trunc('hour', recorded_at) AS hour_bucket,
    ROUND(AVG(air_temp_c), 2) AS avg_temp_c,
    ROUND(AVG(humidity_pct), 2) AS avg_humidity_pct,
    ROUND(AVG(air_pressure_hpa), 1) AS avg_pressure_hpa,
    ROUND(AVG(lux), 0) AS avg_lux,
    ROUND(MAX(rainfall_mm) - MIN(rainfall_mm), 2) AS hourly_rainfall_mm
FROM weather_logs
GROUP BY date_trunc('hour', recorded_at)
ORDER BY hour_bucket DESC;
```

---

## 5. Next Steps: Hardware Migration Roadmap

### Step A: Water Quality Station (WQS) Receiver Migration
* **Target File:** `LoRa/LoRa_Receiver/NetworkManager.cpp` & `Config.h`
* **Configuration:**
  ```cpp
  #define SUPABASE_URL "https://keappoukeagyzpoxkrru.supabase.co/rest/v1/rpc/log_water_quality"
  #define SUPABASE_KEY "YOUR_ANON_KEY"
  ```
* **Payload sent to RPC endpoint:**
  ```json
  {
    "p_pond": "01.02.12",
    "p_do": 6.85,
    "p_ph": 7.82,
    "p_temp": 29.40,
    "p_turbidity": 15.20
  }
  ```

### Step B: Weather Station Direct Upload (Optional Final Cutover)
* Currently, the Weather Station v10 sends to GAS, which forwards to Supabase seamlessly.
* When ready to eliminate Google Sheets completely:
  * Update `googleScriptUrl` in `Weather_Station_v10.ino` to point directly to `https://keappoukeagyzpoxkrru.supabase.co/rest/v1/rpc/log_weather_telemetry`.
  * Add the `apikey: YOUR_ANON_KEY` header.
  * Disable the Apps Script trigger and archive the sheet.

---

## 6. Weekly Operations: Access-to-Supabase Smart Delta Sync Engine

During the transitional phase while iSHARP DBMS 2.0 is being completed, the farm team updates the operational Microsoft Access database (`.accdb`) and emails it out every Friday.

### Architecture & Pipeline
```
[Friday Access DB (.accdb)]
          │ Save to: Legacy Access DB/
          ▼
   Run_Friday_Sync.bat
          │
          ▼
   sync_weekly_access.ps1
          │ 1. Auto-detects newest .accdb
          │ 2. Queries Supabase for current checkpoints (MAX index_no)
          │ 3. Delta-extracts only new/modified rows:
          │    - stocking_records (upserts all active & recently closed cycles)
          │    - active_operational_ponds (reconciles gatekeeper: adds newly stocked, drops harvested)
          │    - biometrics_sampling (WHERE indexNo > max_sampling)
          │    - pond_harvest_daily & sales (WHERE indexNo > max_harvest)
          │    - pond_stocking_batches (WHERE indexNo > max_stocking)
          │    - pond_issues & pond_notes (WHERE indexNo > max_issues/notes)
          ▼
   Supabase Cloud (Sync completed in ~15-25 seconds)
```

### Standard Friday Routine:
1. Save the new email attachment into `Legacy Access DB\`.
2. Double-click `Run_Friday_Sync.bat`.
3. The console will display real-time progress and output a verification report of all new rows synchronized.

