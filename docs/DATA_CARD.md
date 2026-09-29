# Data Card — JalNetra (FloodGuard AI) Curated Flash-Flood Dataset

## 1. Dataset Overview
- **Dataset Path**: `data/curated/training_features.parquet`
- **Provenance File**: `data/curated/training_provenance.json`
- **Replay Dataset Path**: `data/curated/replay_events.json`
- **Pilot Geography**: Kullu–Mandi–Beas–Parvati Hilly Catchment System, Himachal Pradesh, India (`31.65°N – 32.35°N`, `76.85°E – 77.50°E`)
- **Total Training/Eval Rows**: `1,504` watershed-hour observations across `16` documented historical events (`2005–2022`)
- **Synthetic / Mock Rows**: `0` (`synthetic_rows: 0`, `mock_rows: 0`)

---

## 2. Primary Data Sources & Lineage

| Source ID | Provider | Dataset / Endpoint | Role in Feature Matrix | Access Mode |
| :--- | :--- | :--- | :--- | :--- |
| `era5_land` | Copernicus / ECMWF (via Open-Meteo Archive API) | ERA5-Land Hourly Reanalysis (`0.1°`, 1950–present) | Hourly precipitation (`rain_1h`..`rain_72h`), antecedent precipitation index (`API`), volumetric soil moisture (`0–7cm`, `7–28cm`, `28–100cm`) | Public Historical API |
| `nasadem` | NASA / USGS (via Open-Elevation SRTM/NASADEM) | NASADEM HGT v001 (`30m` / `90m` 3x3 stencil) | Mean/min/max/std elevation, slope degrees, relief ratio, TWI, HAND, drainage density | Public Elevation Stencil |
| `global_flood_db` | Dartmouth Flood Observatory (DFO) / NASA MODIS / Emergency Disasters Database | Documented Himachal Pradesh & North India Flood Inventory (`2005–2023`) | Event-window inundation ground truth labels (`flood_occurred`) and historical flood frequency | Public Archival Inventory |
| `jrc_gsw` | European Commission Joint Research Centre | JRC Global Surface Water v1.4 | Permanent vs seasonal water ratios for river corridors | Public Archival |
| `isro_landslide_atlas` | ISRO / NRSC | Landslide Atlas of India (Mandi Zone #3 & Kullu Zone #16) | Catchment-level landslide susceptibility index and inventory points | Published NRSC Report |
| `osm` | OpenStreetMap Contributors & OSRM | Overpass Road Network, Shelters, Settlements & River Centerlines | Real highway geometry (`NH3`, `NH154`, etc.), settlement exposure, and shelter coordinates | Open Database License (ODbL) |

### Authorized Live Sources (Explicitly Gated)
The following sources require institutional credentials configured via `.env` (`IMD_API_KEY`, `MOSDAC_USERNAME`, `NASA_EARTHDATA_TOKEN`, `CWC_API_KEY`, `NDEM_TOKEN`):
- `imd_api` (IMD Public Weather & District Warning APIs)
- `imd_ffg` (IMD South Asia Flash Flood Guidance System)
- `gsmap_isro` (ISRO MOSDAC GSMaP_ISRO Satellite Rainfall)
- `gpm_imerg` (NASA GPM IMERG Half-Hourly Precipitation)
- `cwc_hmo` (Central Water Commission Hydro-Meteorological Observations)
- `ndem` (NRSC National Database for Emergency Management)

When credentials are not present, the ingestion adapters (`services/ingestion/adapters.py`) report `status: "authentication_required"` and never generate synthetic fallback values.

---

## 3. Feature Schema (31 Model Features)

### Dynamic Hydrometeorological Features (Causal Window `[t - W, t]` only)
- `rain_1h_mm`, `rain_3h_mm`, `rain_6h_mm`, `rain_12h_mm`, `rain_24h_mm`, `rain_72h_mm`: Rolling precipitation accumulations up to observation time $t$.
- `rain_intensity_max_1h_mm`, `rain_intensity_max_3h_mm`: Peak hourly rainfall intensity within the preceding 3h and 6h windows.
- `rain_forecast_3h_mm`, `rain_forecast_6h_mm`: Lead precipitation guidance window.
- `rain_zscore_24h`: Standardized 24h anomaly relative to catchment monsoon baseline.
- `api_index`: Antecedent Precipitation Index ($\sum_{d=1}^{7} 0.85^d P_d$).
- `soil_moisture_0_7cm`, `soil_moisture_7_28cm`, `soil_moisture_28_100cm`: ERA5-Land volumetric soil water layer fractions ($m^3/m^3$).
- `soil_saturation_ratio`, `soil_moisture_24h_change`, `effective_rain_6h_mm`: Non-linear runoff coupling between antecedent soil saturation and intense 6h rainfall.

### Static Geomorphic & Hazard Context Features
- `elev_mean_m`, `elev_min_m`, `elev_max_m`, `elev_std_m`, `relief_m`: Catchment hypsometry derived from NASADEM elevation stencils.
- `slope_mean_deg`, `slope_steep_pct`: Catchment slope distribution.
- `drainage_density_km_km2`, `twi_mean`, `hand_mean_m`: Topographic Wetness Index ($\ln(a / \tan \beta)$) and Height Above Nearest Drainage.
- `permanent_water_pct`, `seasonal_water_pct`: JRC surface water baseline.
- `historical_flood_freq`: Prior documented flood frequency prior to the observation window.
- `landslide_susceptibility`: ISRO Landslide Atlas susceptibility score (`0–1`).

---

## 4. Split Integrity & Held-Out Replay Separation
- **Train Split (`2005–2017`)**: `848` rows (`10` events)
- **Validation Split (`2018–2020`)**: `368` rows (`3` events)
- **Test Split (`2021–2022`)**: `288` rows (`3` events)
- **Held-Out Replay Events (`2023`, strictly excluded from training/val/test)**:
  - `REPLAY_2023_HP_BEAS_JULY`: July 8–11, 2023 Kullu–Manali–Mandi Beas River Extreme Flash Floods
  - `REPLAY_2023_HP_MANDI_AUG`: August 12–15, 2023 Mandi Cloudburst & Landslide-Dammed Flash Floods
