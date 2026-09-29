-- ============================================================================
-- JalNetra (FloodGuard AI) — PostGIS Schema Migration 001
-- SIH 2026 PS 26192: Flash Flood Prediction System for Hilly Regions
-- Defines all 22 core relational & geospatial entities specified in PRD.md
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. data_sources
CREATE TABLE IF NOT EXISTS data_sources (
    source_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    provider VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    role TEXT NOT NULL,
    resolution_or_cadence VARCHAR(128),
    coverage VARCHAR(128),
    access_or_license VARCHAR(255),
    notes TEXT,
    auth_required BOOLEAN NOT NULL DEFAULT FALSE,
    health_status VARCHAR(64) NOT NULL DEFAULT 'unknown',
    last_checked_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    status_message TEXT
);

-- 2. source_fetches
CREATE TABLE IF NOT EXISTS source_fetches (
    fetch_id VARCHAR(64) PRIMARY KEY,
    source_id VARCHAR(64) NOT NULL REFERENCES data_sources(source_id),
    dataset_version VARCHAR(128) NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(64) NOT NULL,
    http_status INTEGER,
    records_fetched INTEGER NOT NULL DEFAULT 0,
    checksum_sha256 VARCHAR(128),
    processing_version VARCHAR(64) NOT NULL,
    error_detail TEXT
);

-- 3. watersheds
CREATE TABLE IF NOT EXISTS watersheds (
    watershed_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    basin VARCHAR(128) NOT NULL,
    district VARCHAR(128) NOT NULL,
    state VARCHAR(128) NOT NULL,
    centroid_lat DOUBLE PRECISION NOT NULL,
    centroid_lon DOUBLE PRECISION NOT NULL,
    area_sq_km DOUBLE PRECISION NOT NULL,
    mean_elevation_m DOUBLE PRECISION NOT NULL,
    mean_slope_deg DOUBLE PRECISION NOT NULL,
    drainage_density_km_per_sqkm DOUBLE PRECISION NOT NULL,
    boundary_geojson JSONB NOT NULL,
    geom GEOMETRY(Geometry, 4326)
);

-- 4. terrain_cells
CREATE TABLE IF NOT EXISTS terrain_cells (
    cell_id VARCHAR(64) PRIMARY KEY,
    watershed_id VARCHAR(64) NOT NULL REFERENCES watersheds(watershed_id),
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    elevation DOUBLE PRECISION NOT NULL,
    slope DOUBLE PRECISION NOT NULL,
    aspect DOUBLE PRECISION NOT NULL,
    curvature DOUBLE PRECISION NOT NULL,
    twi DOUBLE PRECISION NOT NULL,
    tri DOUBLE PRECISION NOT NULL,
    flow_accumulation DOUBLE PRECISION NOT NULL,
    distance_to_stream DOUBLE PRECISION NOT NULL,
    drainage_density DOUBLE PRECISION NOT NULL,
    historical_flood_frequency DOUBLE PRECISION NOT NULL,
    landslide_density DOUBLE PRECISION NOT NULL,
    distance_to_landslide DOUBLE PRECISION NOT NULL,
    permanent_water_fraction DOUBLE PRECISION NOT NULL,
    source VARCHAR(64) NOT NULL,
    dataset_version VARCHAR(128) NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL,
    geom GEOMETRY(Point, 4326)
);

-- 5. weather_observations
CREATE TABLE IF NOT EXISTS weather_observations (
    obs_id VARCHAR(64) PRIMARY KEY,
    watershed_id VARCHAR(64) REFERENCES watersheds(watershed_id),
    source VARCHAR(64) NOT NULL,
    dataset_version VARCHAR(128) NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL,
    observation_time TIMESTAMPTZ NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    rain_1h_mm DOUBLE PRECISION,
    rain_3h_mm DOUBLE PRECISION,
    rain_6h_mm DOUBLE PRECISION,
    rain_12h_mm DOUBLE PRECISION,
    rain_24h_mm DOUBLE PRECISION,
    rain_48h_mm DOUBLE PRECISION,
    rain_72h_mm DOUBLE PRECISION,
    rain_anomaly_24h DOUBLE PRECISION,
    antecedent_precipitation_index DOUBLE PRECISION,
    runoff_mm DOUBLE PRECISION,
    snow_depth_m DOUBLE PRECISION,
    snowmelt_mm DOUBLE PRECISION,
    units VARCHAR(32) NOT NULL DEFAULT 'mm',
    quality_flag VARCHAR(32) NOT NULL DEFAULT 'VALID',
    raw_record_id VARCHAR(128) NOT NULL
);

-- 6. weather_forecasts
CREATE TABLE IF NOT EXISTS weather_forecasts (
    forecast_id VARCHAR(64) PRIMARY KEY,
    watershed_id VARCHAR(64) REFERENCES watersheds(watershed_id),
    source VARCHAR(64) NOT NULL,
    dataset_version VARCHAR(128) NOT NULL,
    issue_time TIMESTAMPTZ NOT NULL,
    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    forecast_rain_6h_mm DOUBLE PRECISION,
    forecast_rain_24h_mm DOUBLE PRECISION,
    units VARCHAR(32) NOT NULL DEFAULT 'mm',
    quality_flag VARCHAR(32) NOT NULL DEFAULT 'VALID',
    raw_record_id VARCHAR(128) NOT NULL
);

-- 7. soil_moisture_observations
CREATE TABLE IF NOT EXISTS soil_moisture_observations (
    soil_obs_id VARCHAR(64) PRIMARY KEY,
    watershed_id VARCHAR(64) REFERENCES watersheds(watershed_id),
    source VARCHAR(64) NOT NULL,
    dataset_version VARCHAR(128) NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL,
    observation_time TIMESTAMPTZ NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    soil_water_l1 DOUBLE PRECISION,
    soil_water_l2 DOUBLE PRECISION,
    soil_water_l3 DOUBLE PRECISION,
    soil_water_l4 DOUBLE PRECISION,
    units VARCHAR(32) NOT NULL DEFAULT 'm3/m3',
    quality_flag VARCHAR(32) NOT NULL DEFAULT 'VALID',
    raw_record_id VARCHAR(128) NOT NULL
);

-- 8. river_observations
CREATE TABLE IF NOT EXISTS river_observations (
    river_obs_id VARCHAR(64) PRIMARY KEY,
    watershed_id VARCHAR(64) REFERENCES watersheds(watershed_id),
    station_name VARCHAR(255) NOT NULL,
    river_name VARCHAR(255) NOT NULL,
    source VARCHAR(64) NOT NULL,
    dataset_version VARCHAR(128) NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL,
    observation_time TIMESTAMPTZ,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    river_level_m DOUBLE PRECISION,
    river_level_change_1h_m DOUBLE PRECISION,
    discharge_cms DOUBLE PRECISION,
    warning_level_m DOUBLE PRECISION,
    danger_level_m DOUBLE PRECISION,
    units VARCHAR(32) NOT NULL DEFAULT 'm',
    quality_flag VARCHAR(64) NOT NULL,
    raw_record_id VARCHAR(128) NOT NULL
);

-- 9. sensor_devices
CREATE TABLE IF NOT EXISTS sensor_devices (
    device_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    watershed_id VARCHAR(64) REFERENCES watersheds(watershed_id),
    sensor_types JSONB NOT NULL,
    protocol VARCHAR(32) NOT NULL DEFAULT 'MQTT',
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    elevation_m DOUBLE PRECISION,
    calibration_metadata JSONB NOT NULL,
    status VARCHAR(64) NOT NULL DEFAULT 'awaiting_telemetry',
    last_seen_at TIMESTAMPTZ,
    installed_at TIMESTAMPTZ
);

-- 10. sensor_readings
CREATE TABLE IF NOT EXISTS sensor_readings (
    reading_id VARCHAR(64) PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL REFERENCES sensor_devices(device_id),
    sensor_type VARCHAR(64) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    unit VARCHAR(32) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    quality_flag VARCHAR(64) NOT NULL,
    calibration_metadata JSONB NOT NULL,
    raw_payload JSONB
);

-- 11. settlements
CREATE TABLE IF NOT EXISTS settlements (
    settlement_id VARCHAR(64) PRIMARY KEY,
    watershed_id VARCHAR(64) NOT NULL REFERENCES watersheds(watershed_id),
    name VARCHAR(255) NOT NULL,
    place_type VARCHAR(64) NOT NULL,
    district VARCHAR(128) NOT NULL,
    state VARCHAR(128) NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    elevation_m DOUBLE PRECISION,
    osm_id VARCHAR(64) NOT NULL,
    source VARCHAR(64) NOT NULL DEFAULT 'osm',
    retrieved_at TIMESTAMPTZ NOT NULL,
    geom GEOMETRY(Point, 4326)
);

-- 12. roads
CREATE TABLE IF NOT EXISTS roads (
    road_id VARCHAR(64) PRIMARY KEY,
    watershed_id VARCHAR(64) REFERENCES watersheds(watershed_id),
    osm_way_id VARCHAR(64) NOT NULL,
    name VARCHAR(255),
    highway_type VARCHAR(64) NOT NULL,
    surface VARCHAR(64),
    length_m DOUBLE PRECISION NOT NULL,
    flood_hazard_score DOUBLE PRECISION,
    landslide_hazard_score DOUBLE PRECISION,
    closure_status VARCHAR(64) NOT NULL DEFAULT 'hazard_status_unknown',
    coordinates_geojson JSONB NOT NULL,
    source VARCHAR(64) NOT NULL DEFAULT 'osm',
    retrieved_at TIMESTAMPTZ NOT NULL,
    geom GEOMETRY(LineString, 4326)
);

-- 13. shelters
CREATE TABLE IF NOT EXISTS shelters (
    shelter_id VARCHAR(64) PRIMARY KEY,
    watershed_id VARCHAR(64) REFERENCES watersheds(watershed_id),
    name VARCHAR(255) NOT NULL,
    facility_type VARCHAR(64) NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    elevation_m DOUBLE PRECISION,
    verification_status VARCHAR(64) NOT NULL DEFAULT 'verification_required',
    verified_by VARCHAR(255),
    verified_at TIMESTAMPTZ,
    capacity_note VARCHAR(255),
    osm_id VARCHAR(64),
    source VARCHAR(64) NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL,
    geom GEOMETRY(Point, 4326)
);

-- 14. historical_events
CREATE TABLE IF NOT EXISTS historical_events (
    event_id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    basin VARCHAR(128) NOT NULL,
    state VARCHAR(128) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    peak_time TIMESTAMPTZ NOT NULL,
    dfo_id VARCHAR(64),
    source VARCHAR(128) NOT NULL,
    dataset_version VARCHAR(128) NOT NULL,
    used_in_training BOOLEAN NOT NULL DEFAULT FALSE,
    split_role VARCHAR(32) NOT NULL,
    severity_class VARCHAR(64),
    summary TEXT NOT NULL
);

-- 15. event_footprints
CREATE TABLE IF NOT EXISTS event_footprints (
    footprint_id VARCHAR(64) PRIMARY KEY,
    event_id VARCHAR(64) NOT NULL REFERENCES historical_events(event_id),
    watershed_id VARCHAR(64) REFERENCES watersheds(watershed_id),
    observed_inundation BOOLEAN NOT NULL,
    inundated_fraction DOUBLE PRECISION,
    source VARCHAR(128) NOT NULL,
    dataset_version VARCHAR(128) NOT NULL,
    footprint_geojson JSONB NOT NULL,
    geom GEOMETRY(Geometry, 4326)
);

-- 16. model_versions
CREATE TABLE IF NOT EXISTS model_versions (
    model_version VARCHAR(64) PRIMARY KEY,
    algorithm VARCHAR(64) NOT NULL,
    trained_at TIMESTAMPTZ NOT NULL,
    artifact_path TEXT NOT NULL,
    calibrator_path TEXT NOT NULL,
    features_path TEXT NOT NULL,
    provenance_path TEXT NOT NULL,
    validation_threshold DOUBLE PRECISION NOT NULL,
    dataset_rows INTEGER NOT NULL,
    unique_events INTEGER NOT NULL,
    is_current BOOLEAN NOT NULL DEFAULT TRUE
);

-- 17. model_metrics
CREATE TABLE IF NOT EXISTS model_metrics (
    metric_id VARCHAR(64) PRIMARY KEY,
    model_version VARCHAR(64) NOT NULL REFERENCES model_versions(model_version),
    candidate_model VARCHAR(64) NOT NULL,
    split_name VARCHAR(32) NOT NULL,
    pr_auc DOUBLE PRECISION NOT NULL,
    roc_auc DOUBLE PRECISION NOT NULL,
    precision DOUBLE PRECISION NOT NULL,
    recall DOUBLE PRECISION NOT NULL,
    f1 DOUBLE PRECISION NOT NULL,
    brier_score DOUBLE PRECISION NOT NULL,
    false_alarm_rate DOUBLE PRECISION NOT NULL,
    validation_threshold DOUBLE PRECISION NOT NULL,
    confusion_matrix_json JSONB NOT NULL,
    calibration_curve_json JSONB NOT NULL
);

-- 18. risk_predictions
CREATE TABLE IF NOT EXISTS risk_predictions (
    prediction_id VARCHAR(64) PRIMARY KEY,
    watershed_id VARCHAR(64) NOT NULL REFERENCES watersheds(watershed_id),
    model_version VARCHAR(64) NOT NULL REFERENCES model_versions(model_version),
    prediction_time TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    flood_probability DOUBLE PRECISION NOT NULL,
    risk_class VARCHAR(32) NOT NULL,
    uncertainty_band JSONB NOT NULL,
    input_data_versions JSONB NOT NULL,
    data_freshness_summary JSONB NOT NULL,
    raw_feature_vector JSONB NOT NULL
);

-- 19. risk_explanations
CREATE TABLE IF NOT EXISTS risk_explanations (
    explanation_id VARCHAR(64) PRIMARY KEY,
    prediction_id VARCHAR(64) NOT NULL REFERENCES risk_predictions(prediction_id),
    watershed_id VARCHAR(64) NOT NULL REFERENCES watersheds(watershed_id),
    model_version VARCHAR(64) NOT NULL,
    method VARCHAR(64) NOT NULL DEFAULT 'SHAP',
    base_value DOUBLE PRECISION NOT NULL,
    top_positive_contributors JSONB NOT NULL,
    top_negative_contributors JSONB NOT NULL,
    feature_values JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

-- 20. alerts
CREATE TABLE IF NOT EXISTS alerts (
    alert_id VARCHAR(64) PRIMARY KEY,
    watershed_id VARCHAR(64) NOT NULL REFERENCES watersheds(watershed_id),
    area_name VARCHAR(255) NOT NULL,
    origin_type VARCHAR(64) NOT NULL, -- 'official_warning' OR 'floodguard_ai_advisory'
    severity_state VARCHAR(32) NOT NULL, -- 'advisory', 'watch', 'warning', 'critical'
    lifecycle_state VARCHAR(32) NOT NULL, -- 'triggered', 'under_review', 'issued', 'acknowledged', 'expired'
    issue_time TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    reason TEXT NOT NULL,
    recommended_action TEXT NOT NULL,
    source_or_model VARCHAR(128) NOT NULL,
    prediction_id VARCHAR(64) REFERENCES risk_predictions(prediction_id),
    evidence_json JSONB NOT NULL
);

-- 21. alert_acknowledgements
CREATE TABLE IF NOT EXISTS alert_acknowledgements (
    ack_id VARCHAR(64) PRIMARY KEY,
    alert_id VARCHAR(64) NOT NULL REFERENCES alerts(alert_id),
    acknowledged_by VARCHAR(128) NOT NULL,
    acknowledged_role VARCHAR(64) NOT NULL,
    acknowledged_at TIMESTAMPTZ NOT NULL,
    notes TEXT,
    new_lifecycle_state VARCHAR(32) NOT NULL
);

-- 22. audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id VARCHAR(64) PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    actor VARCHAR(128) NOT NULL,
    action VARCHAR(128) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    details_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_weather_obs_watershed_time ON weather_observations(watershed_id, observation_time DESC);
CREATE INDEX IF NOT EXISTS idx_soil_obs_watershed_time ON soil_moisture_observations(watershed_id, observation_time DESC);
CREATE INDEX IF NOT EXISTS idx_risk_pred_watershed_time ON risk_predictions(watershed_id, prediction_time DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_watershed_state ON alerts(watershed_id, lifecycle_state);
