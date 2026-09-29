# JalNetra (FloodGuard AI) — REST API Documentation

Base URL: `http://localhost:8000`  
Interactive OpenAPI / Swagger UI: `http://localhost:8000/docs`

---

## 1. Health & Source Registry

### `GET /api/v1/health`
Returns service health, active ML model version, database status, and source summary counts.

### `GET /api/v1/sources/status`
Returns the live operational status of all 13 registered data sources from `DATA_SOURCE_REGISTRY.csv`.
- **Possible `status` values**: `ok`, `stale`, `authentication_required`, `unavailable`, `processing_error`, `empty`.
- Never fabricates data for unconfigured auth-gated feeds (`imd_api`, `imd_ffg`, `gsmap_isro`, `gpm_imerg`, `cwc_hmo`, `ndem`).

---

## 2. Regions, Hyperlocal Risk & Explanations

### `GET /api/v1/regions`
Lists all monitored Himalayan sub-catchments (Kullu–Mandi–Beas–Parvati basin) with their latest calibrated flood probability, risk class (`LOW`, `MODERATE`, `HIGH`, `CRITICAL`), official warning state, and FloodGuard AI advisory level.

### `GET /api/v1/risk/current?region_id=REG_KULLU_02&timestamp=...`
Computes or retrieves hyperlocal flash-flood risk across all sub-catchments (or a single region) using the calibrated ML model (`v1.0.0`).
- Optional `timestamp` query parameter allows inspecting any historical replay step.

### `GET /api/v1/risk/areas/{area_id}`
Returns detailed area telemetry for a specific sub-catchment (`REG_KULLU_01` .. `REG_MANDI_08`):
- Calibrated flood probability & risk class
- Prediction timestamp & `valid_until` window
- Rainfall windows (`1h`, `3h`, `6h`, `12h`, `24h`, `72h` in mm) and forecast `1h`/`6h`
- ERA5-Land volumetric soil moisture (`0-7cm`, `7-28cm`) and Antecedent Precipitation Index (`API`)
- NASADEM 30m terrain features (elevation, slope, TWI, HAND, drainage density, landslide susceptibility)
- Source freshness and provenance metadata

### `GET /api/v1/risk/areas/{area_id}/explanation`
Returns **local SHAP feature contributions** computed directly from the region's actual feature vector, plus plain-language operator and citizen summaries.

### `GET /api/v1/map/layers?timestamp=...`
Returns a complete GeoJSON bundle for the MapLibre 2D GIS viewer:
- `catchments`: Sub-catchment polygons with calibrated flood probability and risk class
- `rivers`: Beas and Parvati river `LineString` geometries
- `roads`: Real OpenStreetMap highway corridors (`NH3`, `NH154`, `Kullu–Manikaran Road`, `Mandi–Kamand Road`, etc.) with live hazard overlay and explicit `Hazard status unknown` flags where applicable
- `shelters`: Emergency shelters with explicit `verified` vs `Shelter location found — verification required` statuses
- `settlements`: Vulnerable valley-floor settlements
- `sensors`: Registered IoT hardware stations
- `historical_flood_footprints`: Documented DFO/MODIS historical inundation zones
- `landslide_Points`: ISRO NRSC Landslide Atlas inventory points

---

## 3. Alert Engine (`Trigger → Review → Issue → Acknowledge → Expire`)

### `GET /api/v1/alerts?region_id=...&state=...`
Lists alerts with full lifecycle history (`audit_log`) and explicit separation between:
- `warning_source_type: "OFFICIAL_WARNING"`
- `warning_source_type: "FLOODGUARD_ADVISORY"`

### `POST /api/v1/alerts/trigger`
Triggers a new FloodGuard AI Advisory or records an Official Warning.

### `POST /api/v1/alerts/{alert_id}/review`
Moves an alert from `triggered` to `under_review` with operator notes.

### `POST /api/v1/alerts/{alert_id}/issue`
Issues an alert (`state: "issued"`), recording the issuing operator and timestamp in the audit log.

### `POST /api/v1/alerts/{alert_id}/acknowledge`
Acknowledges an active alert (`state: "acknowledged"`).

### `POST /api/v1/alerts/{alert_id}/expire`
Expires an alert (`state: "expired"`).

---

## 4. Evacuation Routing

### `POST /api/v1/routes/evacuation`
Computes both the **Safest Feasible Route** (minimizing distance + flood hazard + landslide susceptibility + road closure penalties) and the **Shortest Distance Route** over the real OpenStreetMap road network.

**Request Body:**
```json
{
  "origin_node": "NODE_AUT_TUNNEL",
  "target_shelter_id": "SHELTER_KULLU_01",
  "prefer_verified_only": false
}
```
If `target_shelter_id` is omitted, the planner automatically evaluates all reachable shelters and selects the lowest-hazard destination, explicitly warning if the shelter is marked `verification_required`.

---

## 5. IoT Telemetry Ingestion

### `POST /api/v1/iot/readings`
Ingests a real hardware reading from an ESP32 station (rain gauge, capacitive soil moisture probe, or ultrasonic water-level sensor), runs physical range & rate-of-change validation, stores provenance & calibration metadata, and returns the assigned quality flag (`ok`, `suspect`, or `invalid`).

### `GET /api/v1/iot/devices`
Returns registered IoT devices and their latest verified readings (or `empty` state when no hardware stream has been pushed yet—never fake random sensor streams).

---

## 6. Historical Event Replay, Provenance & Model Metrics

### `GET /api/v1/replay/events`
Lists held-out real historical flood events (`REPLAY_2023_HP_BEAS_JULY`, `REPLAY_2023_HP_MANDI_AUG`) that were strictly excluded from ML training (`event_year <= 2022`).

### `GET /api/v1/replay/events/{event_id}?step_index=...`
Returns the chronological timeline of real ERA5-Land + NASADEM observations for the event, along with live model predictions, local SHAP explanations, exposed settlements, auto-generated advisories, and safest evacuation routes at the selected timestamp.

### `GET /api/v1/models/metrics`
Returns the stored training & evaluation artifact (`artifacts/metrics/training_metrics.json`), global SHAP feature importances, and the automated leakage verification report (`artifacts/metrics/leakage_report.json`).

### `GET /api/v1/provenance`
Returns the complete provenance chain: dataset SHA-256 hashes, row counts (`synthetic_rows: 0`, `mock_rows: 0`), model training provenance (`artifacts/provenance/v1.0.0.json`), and recent prediction lineage records.
