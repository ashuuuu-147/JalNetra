# FloodGuard AI — Real Data & Model Training Specification

## 1. Absolute rule
**No dummy data. No synthetic rows. No invented measurements. No fabricated performance metrics.**

When a real source is unavailable, return an explicit missing/degraded state. For the SIH demo, use a **real historical event replay**, not a simulated disaster.

## 2. Real datasets

### IMD API
Official API catalogue: https://api.imd.gov.in/public/api_reference.html
Relevant APIs: district rainfall, district nowcast, AWS/ARG, district warnings, basin QPF. Access may require registration/authorization. Never bypass it.

### IMD Flash Flood Guidance
https://hydro.imd.gov.in/national/
The operational bulletin uses 6-hour and 24-hour rainfall, soil saturation, forecast rainfall and flash-flood threat/risk products.

### GSMaP_ISRO Rain
https://mosdac.gov.in/gsmap-isro-rain
- March 2000 onward
- 0.1° × 0.1°
- hourly
- HDF5
- IMD gauge-adjusted satellite rainfall
- open access

### NASA GPM IMERG
https://gpm.nasa.gov/data/imerg
Use the documented near-real-time/historical precipitation products and preserve product/version metadata.

### ERA5-Land
https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land
- 1950-present
- hourly
- native ~9 km; time-series regridded 0.1° × 0.1°
- volumetric soil water layers 1–4, precipitation, runoff, snow variables
- CC-BY

### NASADEM / SRTM
NASADEM: https://developers.google.com/earth-engine/datasets/catalog/NASA_NASADEM_HGT_001
SRTM: https://developers.google.com/earth-engine/datasets/catalog/USGS_SRTMGL1_003
Use 30 m terrain. Derive slope, aspect, curvature, flow accumulation and distance-to-stream.

### JRC Global Surface Water
https://developers.google.com/earth-engine/datasets/catalog/JRC_GSW1_4_GlobalSurfaceWater
30 m surface-water history (1984–2021). Use to mask permanent/seasonal water and derive water-context features. Include `Source: EC JRC/Google` attribution.

### Global Flood Database v1
Earth Engine: `GLOBAL_FLOOD_DB/MODIS_EVENTS/V1`
https://developers.google.com/earth-engine/datasets/catalog/GLOBAL_FLOOD_DB_MODIS_EVENTS_V1
- 913 mapped flood events
- 2000–2018
- event flood extent + duration
- event metadata including DFO identifiers, severity, displacement, deaths, cause and country fields
- CC BY-NC 4.0 in the Earth Engine catalogue

Use this as the primary supervised observed-flood label set. It is not an India-only flash-flood ground-truth corpus, so product claims must be phrased accordingly until locally validated.

### ISRO Landslide Atlas
https://www.isro.gov.in/Landslide_Atlas_India.html
- approximately 80,000 mapped landslides
- 1998–2022
- 17 states + 2 UTs
- Himalayas and Western Ghats
- seasonal, event-based and route-wise inventories

Use as static/contextual landslide hazard information, not as a direct proxy for today's landslide condition.

### CWC Hydro-Meteorological Observation
https://cwc.gov.in/hydro-meteorological-observation
CWC states it has a network of 878 sites on major rivers/tributaries. Use only data that is publicly accessible or explicitly authorized.

### NDEM
https://ndem.nrsc.gov.in/
Official disaster geoportal with flood inundation, landslide, CWC river-gauge and route-planning functions. Use as reference/validation where access is permitted; do not bypass authentication or scrape protected pages.

### OpenStreetMap
https://www.openstreetmap.org/
Use real road geometry. Attribute OSM/ODbL. OSM shelters are not automatically “verified”; show verification status.

## 3. Training target
Primary target column:
`observed_flood_inundation`

Positive = cell/polygon intersects observed event flood footprint.  
Negative = carefully sampled non-flood cells from the same region/season outside the flood footprint, after masking permanent water and low-quality areas.

Do not claim this label is “flash flood” until the chosen local validation set demonstrates that correspondence.

## 4. Features

### Dynamic
`rain_1h`, `rain_3h`, `rain_6h`, `rain_12h`, `rain_24h`, `rain_48h`, `rain_72h`, `forecast_rain_6h`, `forecast_rain_24h`, `rain_anomaly_24h`, `antecedent_precipitation_index`, `soil_water_l1`, `soil_water_l2`, `soil_water_l3`, `soil_water_l4`, `runoff`, `snow_depth`, `snowmelt`.

### Terrain
`elevation`, `slope`, `aspect`, `curvature`, `twi`, `tri`, `flow_accumulation`, `distance_to_stream`, `drainage_density`.

### Hazard context
`historical_flood_frequency`, `landslide_density`, `distance_to_landslide`, `permanent_water_fraction`.

### Optional live
`river_level`, `river_level_change_1h`, `sensor_rain_1h`, `sensor_soil_moisture`, `sensor_water_level`.

## 5. Feature alignment rules
- Internal timestamps in UTC.
- Display local time separately.
- Never use information that would not have been available at prediction time.
- Forecast features must use forecast issue time, not future observed values.
- Rainfall accumulations are sums over the specified window.
- Soil moisture can use a documented last/mean value rule.
- Store raw and processed values.

## 6. Split strategy — no leakage
Use event-aware temporal split:
- earliest events = train
- later events = validation
- latest events = test

Do NOT randomly split neighboring pixels from the same flood event. Keep complete event IDs together.

Also create a geographic holdout where feasible to test transfer beyond the training catchments.

## 7. Model benchmark
Train and compare:
1. Logistic Regression
2. Random Forest
3. XGBoost
4. LightGBM (optional)

Priority metrics:
- PR-AUC
- recall
- precision
- F1
- Brier score
- calibration curve
- false-alarm rate

Secondary: ROC-AUC, inference latency, model size.

Select on validation metrics; freeze the selection before test evaluation.

## 8. Calibration
Use a validation-set calibrator such as isotonic or Platt/sigmoid calibration. Do not fit calibration on test. Store calibrator version with model artifact.

## 9. Explainability
For tree models use SHAP. Store top contributors and the actual input values. Every explanation must be traceable to the prediction record.

## 10. Recent Himalayan validation
Use independent recent evidence after 2018, such as:
- Himachal Pradesh July 2023 flash-flood/FFG case study
- Wayanad 30 July 2024 NRSC/ISRO rapid mapping

These must be treated as held-out validation/replay data where possible. Do not train on their future/post-event observations.

## 11. Required provenance file
`data/curated/training_provenance.json` must record dataset versions, URLs, retrieval dates, license/source notes and counts. Required fields include `synthetic_rows: 0` and `mock_rows: 0`.

Training must fail if provenance is missing or either value is non-zero.

## 12. Artifacts
Save:
- `artifacts/models/floodguard_<model>.joblib`
- `artifacts/models/calibrator_<version>.joblib`
- `artifacts/models/features_<version>.json`
- `artifacts/metrics/training_metrics.json`
- `artifacts/explainability/<version>/`
- `artifacts/provenance/<version>.json`

## 13. Research evidence — do not mislabel as FloodGuard results
A 2026 MAUSAM study evaluated India's SAsiaFFGS in Himachal Pradesh and describes its integration of real-time hydrometeorological observations and numerical weather prediction to produce watershed-scale FFR/IFFT/PFFT products.

ISRO's 2024–25 annual report reported an operational Godavari/Tapi spatial flood early-warning system with **2 days lead time and 85% accuracy** in its stated context, and Assam FLEWS with **80–85% average alert success score and 12–36 h lead time**. These are existing-system benchmarks, not FloodGuard performance.

WMO reports globally that countries with substantial-to-comprehensive multi-hazard early-warning coverage have a nearly six-times lower disaster-related mortality ratio than countries with limited-to-moderate coverage; it also cites an average 1:9 net economic benefit and that 24-hour notice can reduce potential damage by 30%. These are global evidence, not India-specific FloodGuard impact estimates.
