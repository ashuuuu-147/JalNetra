# Data & Prediction Provenance Architecture — JalNetra (FloodGuard AI)

## 1. Provenance Contract
Every observation, static terrain layer, training row, and model prediction in **JalNetra (FloodGuard AI)** carries complete, auditable provenance metadata. No observation or prediction is stored or rendered without its lineage chain.

---

## 2. Observation-Level Provenance
Every ingested hydrometeorological, terrain, river, or IoT record stores:
- `source_id`: Registered identifier in `DATA_SOURCE_REGISTRY.csv` (e.g., `era5_land`, `nasadem`, `osm`, `iot_esp32`)
- `dataset_version`: Specific dataset release (e.g., `ERA5-Land-Hourly-v1`, `NASADEM_HGT_v001`, `ODbL-v1`)
- `observation_time`: Physical UTC timestamp of the phenomenon
- `retrieval_time`: UTC timestamp when the adapter retrieved the payload
- `processing_version`: Pipeline version (`ingestion-v1.0.0`)
- `quality_flag`: Automated validation outcome (`ok`, `stale`, `missing`, `suspect`, `invalid`, `unavailable`, `authentication_required`)
- `raw_payload_hash`: SHA-256 cryptographic digest of the raw HTTP/MQTT payload

### Raw HTTP Cache & Checksums
Raw responses retrieved during dataset construction are persisted in `data/raw/` (`http_cache_era5_*.json`, `http_cache_elev_*.json`, `http_cache_osrm_*.json`), and their SHA-256 digests are recorded in `data/curated/training_provenance.json`.

---

## 3. Dataset-Level Provenance (`data/curated/training_provenance.json`)
Before `train_floodguard.py` executes, it runs `validate_provenance()` on `data/curated/training_provenance.json`:
- Verifies `synthetic_rows == 0` and `mock_rows == 0`.
- Verifies every source in `sources` is a documented primary/research dataset (`era5_land`, `nasadem`, `global_flood_db`, `jrc_gsw`, `isro_landslide_atlas`, `osm`).
- Records the exact SHA-256 digest of `data/curated/training_features.parquet`.

---

## 4. Model & Prediction-Level Provenance (`artifacts/provenance/v1.0.0.json`)
Every prediction returned by `/api/v1/risk/current` or `/api/v1/risk/areas/{area_id}` includes:
- `model_version`: `v1.0.0` (`calibrated_xgboost`)
- `prediction_time`: UTC timestamp of inference
- `valid_until`: Forecast validity horizon (`+6 hours`)
- `feature_version`: `features_v1.0.0` (31 validated physical features)
- `input_sources`: Array of contributing source versions, observation timestamps, and quality flags
- `explanation_version`: `shap_tree_v1.0.0`

Users and auditors can inspect the full end-to-end chain interactively on the **Data Provenance** screen in the web UI or via `GET /api/v1/provenance`.
