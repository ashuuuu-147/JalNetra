# FloodGuard AI — SIH 2026 Product Requirements Document (PRD)

**Problem Statement:** SIH 2026 PS 26192 — Flash Flood Prediction System for Hilly Regions using Multi-Source Data  
**Product:** FloodGuard AI  
**Status:** Implementation-ready v1.0

## 1. Product position
FloodGuard AI is a hyperlocal disaster decision-support layer that combines real environmental observations, satellite/reanalysis products, terrain and historical hazard data, plus optional live IoT readings. It complements — not replaces — IMD, ISRO/NRSC, CWC, NDEM and state authorities.

**OBSERVE → FUSE → PREDICT → LOCALIZE → EXPLAIN → ACT**

The system must never invent a measurement, warning, sensor reading, shelter, road status, model metric or impact number. If a source is unavailable, show **Source unavailable / Authentication required / No observation received** rather than a fake value.

## 2. Goals
- Estimate flood-risk probability for a defined hilly pilot region at watershed/village scale.
- Train and validate using real historical data with event/time-aware splits.
- Ingest real live data where authorized and technically available.
- Accept real ESP32/MQTT observations.
- Explain why a location is at risk.
- Support safer evacuation planning using real road and verified shelter data.
- Maintain end-to-end provenance and model/version auditability.

## 3. Non-goals for SIH MVP
- Nationwide operational deployment.
- Guaranteed flood prediction.
- Replacing official warnings.
- Scraping/bypassing authenticated portals.
- Synthetic/random training data.
- Pretending public alert broadcast is live without an authorized channel.

## 4. Users
**Citizen:** local status, simple actions, verified shelter and route.  
**District/operator:** risk map, evidence, sensors, exposed zones, alerts, routing.  
**Admin:** sources, credentials, model versions, health and audit.

## 5. Required modules

### 5.1 Real-time data ingestion
Adapters for:
- IMD APIs: district rainfall, nowcast, AWS/ARG, warnings, basin QPF (where access is granted).
- MOSDAC GSMaP_ISRO Rain.
- NASA GPM IMERG.
- Copernicus ERA5-Land.
- CWC/WRIS where authorized/publicly accessible.
- NDEM as official reference/validation where access permits.
- ESP32 sensor gateway via MQTT/HTTP.

Every observation stores: `source`, `dataset_version`, `retrieved_at`, `observation_time`, `lat`, `lon`, `units`, `quality_flag`, `raw_record_id`.

### 5.2 Data-quality layer
Validate schema, units, timestamps, duplicates, geography, freshness, missingness and impossible values. Never silently repair an invalid reading.

### 5.3 Feature engineering
Dynamic: 1/3/6/12/24/48/72 h rainfall, forecast 6/24 h rainfall, rainfall anomaly, antecedent precipitation index, soil-water layers, runoff, snow variables when relevant, river level/change and sensor readings.

Static: elevation, slope, aspect, curvature, TWI, TRI, flow accumulation, distance to stream, drainage density, watershed ID, permanent-water fraction, historical flood frequency, landslide density/proximity and optional land cover.

### 5.4 Risk engine
Return:
- `flood_probability` [0,1]
- `risk_class`
- `model_version`
- `prediction_time`
- `valid_until`
- `uncertainty/calibration information`
- `top_contributors`

Thresholds must be calibrated from validation data; no arbitrary claims.

### 5.5 GIS map
Layers: current risk, forecast risk, rainfall, soil moisture, slope, rivers/drainage, historical flood footprint, landslides, settlements, roads, verified shelters, alerts and sensors.

Interactions: search, zoom, location click, layer toggle, legend, time slider, source metadata.

### 5.6 Explainability
For a selected area show probability, raw inputs, timestamps, top positive/negative contributors (SHAP for tree models), source and model version. Explanations must be derived from actual inputs.

### 5.7 Alert engine
States: advisory → watch → warning → critical. Every alert contains area, issue time, validity, evidence, message, source/model, acknowledgement and audit trail.

Public labels must distinguish:
- **Official warning** (ingested from official authority)
- **FloodGuard AI advisory** (model output)

### 5.8 Evacuation planner
Use real road geometry and verified shelter points. Objective is safest feasible route, not shortest path only. Use A*/Dijkstra with configurable hazard penalties. Unverified shelters must be explicitly labelled unverified.

### 5.9 IoT
ESP32 + rain gauge + soil moisture + water level. MQTT preferred, HTTP fallback. Store device ID, sensor type, reading, unit, timestamp, location, calibration metadata and quality flag. No synthetic sensor stream.

### 5.10 Historical event replay
Use a real event not included in model training. Replay actual observations chronologically: data → features → risk → explanation → alert → exposed zones → route. This is the main SIH demo mode when a live disaster is not occurring.

### 5.11 Provenance
All data layers, observations and predictions must be traceable to source, version, acquisition time and processing version.

### 5.12 Model monitoring
Show precision, recall, F1, PR-AUC, ROC-AUC, Brier score, calibration, false-alarm rate, lead time on replay events, data freshness and sensor availability.

## 6. Pilot strategy
Use a Himalayan pilot such as Himachal Pradesh or Uttarakhand. Train on a broader real-event corpus, then validate/replay a held-out Himalayan event. Never train on the event used for final demonstration.

## 7. Data foundation
Primary sources are listed in `DATA_SOURCE_REGISTRY.csv` and fully specified in `DATA_AND_MODEL_TRAINING_SPEC.md`.

## 8. UI/UX contract
The interface should feel like a calm disaster-management utility, not a generic “AI dashboard”.

**Use:** warm white/light-grey surfaces, charcoal/slate text, muted forest/teal support accent, amber/orange/red only for hazard semantics, solid borders, restrained shadows, clear labels.

**Avoid:** neon purple/blue gradients, glow, excessive glassmorphism, decorative 3D, particles, giant type, color-only status indicators.

Accessibility: WCAG AA target, icon + text for status, keyboard navigation, >=44 px touch targets, responsive layout, reduced motion support, explicit loading/empty/stale/error states.

## 9. Core screens
1. Public status
2. Operations dashboard
3. Risk map
4. Area detail
5. Alert center
6. Evacuation planner
7. Sensor health
8. Data provenance
9. Historical replay
10. Model evaluation

## 10. API surface
`GET /api/v1/areas/{area_id}/risk`  
`GET /api/v1/areas/{area_id}/timeline`  
`GET /api/v1/map/layers`  
`GET /api/v1/sources/health`  
`POST /api/v1/sensors/readings`  
`GET /api/v1/sensors`  
`POST /api/v1/alerts`  
`GET /api/v1/alerts`  
`POST /api/v1/routes/plan`  
`GET /api/v1/shelters`  
`GET /api/v1/models/current`  
`GET /api/v1/models/{version}/metrics`  
`GET /api/v1/replay/events`  
`GET /api/v1/replay/{event_id}/timeline`

## 11. Database entities
`data_sources`, `source_fetches`, `weather_observations`, `weather_forecasts`, `soil_moisture_observations`, `river_observations`, `sensor_devices`, `sensor_readings`, `terrain_cells`, `watersheds`, `settlements`, `roads`, `shelters`, `historical_events`, `event_footprints`, `risk_predictions`, `risk_explanations`, `alerts`, `alert_acknowledgements`, `model_versions`, `model_metrics`, `audit_logs`.

## 12. Acceptance criteria
### Data
- Every live value has source + observation time.
- No dummy/sample/fabricated values.
- Source outage gives a visible degraded state.
- Missing fields are explicit.

### ML
- Provenance exists and reports zero synthetic/mock rows.
- Event/time-aware split is used.
- No future leakage.
- Calibration evaluated.
- Held-out replay works.

### Map
- Current risk comes from current model.
- Click shows real inputs and timestamps.
- Historical footprints are real datasets.

### Alerts
- Trigger evidence is traceable.
- Operator can acknowledge.
- Official vs AI advisory is explicit.

### Routing
- Real road geometry.
- Shelter verification status visible.
- Hazard penalties used.
- Missing road-status data is labelled unknown.

### Prototype quality
- Responsive, accessible, no dead buttons, no fake numbers, proper loading/error/empty states, secrets excluded.

## 13. Safety
Official emergency instructions always take precedence. FloodGuard is decision support, not autonomous evacuation authority.

Required notice: **“Use official emergency instructions during an active disaster. FloodGuard AI provides additional decision support and should not override official warnings.”**

## 14. SIH demo flow
1. Open source-health dashboard.
2. Open a real historical Himalayan replay event.
3. Play actual observations.
4. Show model probability change.
5. Click an at-risk catchment/village.
6. Show actual drivers.
7. Create/acknowledge an operator advisory.
8. Compute route using real OSM geometry + verified shelters.
9. Open provenance.
10. Show actual validation metrics and model version.
