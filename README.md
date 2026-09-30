# iSHARP Precision Aquaculture Platform

Enterprise Farm Intelligence, Real-time Operations & Digital Twin Simulation for **Blue Archipelago Berhad** (Setiu Shrimp Farm, Terengganu).

[![Netlify Status](https://api.netlify.com/api/v1/badges/isharp-platform/deploy-status)](https://app.netlify.com)

---

## 🦐 The 3-System Platform Architecture

The platform provides a unified Frutiger Aero gateway connecting three distinct enterprise subsystems:

```
                          ┌──────────────────────────────────────────────┐
                          │         iSHARP AQUACULTURE PLATFORM          │
                          │          (3-Orb Frutiger Aero Gateway)       │
                          └──────────────────────┬───────────────────────┘
                                                 │
         ┌───────────────────────────────────────┼───────────────────────────────────────┐
         ▼                                       ▼                                       ▼
┌──────────────────┐                   ┌──────────────────┐                   ┌──────────────────┐
│   SYSTEM 1:      │                   │   SYSTEM 2:      │                   │   SYSTEM 3:      │
│   EXECUTIVE      │                   │   iSHARP DBMS    │                   │   FIELD OPS      │
│   DASHBOARD      │                   │                  │                   │                  │
├──────────────────┤                   ├──────────────────┤                   ├──────────────────┤
│• 216-Pond Grid   │                   │• 10 Deep Tabs    │                   │• Module 01-09    │
│• Farm Biosecurity│                   │• Master Records  │                   │• 24-Pond Map     │
│• Macro Telemetry │                   │• Cycle Lifecycle │                   │• Feeding Action  │
│• Slide-Out Drawer│                   │• Batch Stocking  │                   │• Daily Logbook   │
│• Management View │                   │• Staff Incentive │                   │• Chem / Minerals │
└──────────────────┘                   └──────────────────┘                   └──────────────────┘
```

---

## 📁 Repository Directory Structure

```
.
├── isharp-platform/              # 🚀 The 3-System Web Application (Vite + Vanilla JS)
│   ├── src/
│   │   ├── modules/
│   │   │   ├── landing/          # Gateway Portal (3 3D Glass Orbs)
│   │   │   ├── executive/        # System 1: 216-Pond Interactive Farm Map
│   │   │   ├── dbms/             # System 2: 10 Operational DBMS Tabs
│   │   │   └── fieldOps/         # System 3: Supervisor Map & Daily Logbook
│   │   ├── infrastructure/       # Supabase Cloud Client & Repositories
│   │   └── domain/               # Aeration, Biometrics & Feeding Action Models
│   ├── public/                   # Static assets, logos & Netlify _redirects
│   └── package.json              # isharp-aquaculture-platform
│
├── isharp-simulator/             # 🧠 Bio-Economic Digital Twin (1-12 Mo Simulation Sandbox)
│   └── PROJECT_BLUEPRINT.md      # 4 Simulation Engines (Growth, Feeding, OPEX, Schedule)
│
├── database_migration/           # 🔄 Data Ingestion & Supabase Migration Tools
│   ├── sync_weekly_access.ps1    # Friday Smart Delta Sync Engine (Access -> Supabase)
│   ├── migrate_staff_to_supabase.ps1 # 121-personnel 3NF Staff Directory Migrator
│   └── SUPABASE_MIGRATION_GUIDE.md # Supabase Cloud Architecture Specification
│
├── netlify.toml                  # 🌐 Netlify Edge Deployment Configuration
└── walkthrough.md                # 📖 Complete Development Walkthrough & Engineering Log
```

---

## 🌐 Netlify Cloud Hosting & Direct Routing

The application is deployed on Netlify's high-speed global Edge CDN. Each system has its own direct URL via hash-based routing:

* **Gateway Welcome Portal:** `https://your-site.netlify.app/#/`
* **System 1 (Executive Dashboard):** `https://your-site.netlify.app/#/executive`
* **System 2 (iSHARP DBMS 2.0):** `https://your-site.netlify.app/#/dbms`
* **System 3 (Field Operations):** `https://your-site.netlify.app/#/field-ops`

---

## 📡 Sibling Edge Hardware Repository

Edge firmware for pond IoT sensors, Dissolved Oxygen (DO), pH probes, water color sensors, feed barrel telemetry, and LoRa wireless gateways are maintained in the dedicated hardware repository:

👉 **[syafiqisharp-maker/isharp-iot-hardware](https://github.com/syafiqisharp-maker/isharp-iot-hardware)**
