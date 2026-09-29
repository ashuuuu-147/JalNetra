"""SQLAlchemy ORM models for all 22 PRD entities in JalNetra (FloodGuard AI)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class DataSource(Base):
    __tablename__ = "data_sources"

    source_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    resolution_or_cadence: Mapped[Optional[str]] = mapped_column(String(128))
    coverage: Mapped[Optional[str]] = mapped_column(String(128))
    access_or_license: Mapped[Optional[str]] = mapped_column(String(255))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    auth_required: Mapped[bool] = mapped_column(Boolean, default=False)
    health_status: Mapped[str] = mapped_column(String(64), default="unknown")
    last_checked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_success_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    status_message: Mapped[Optional[str]] = mapped_column(Text)


class SourceFetch(Base):
    __tablename__ = "source_fetches"

    fetch_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_id: Mapped[str] = mapped_column(String(64), ForeignKey("data_sources.source_id"), nullable=False)
    dataset_version: Mapped[str] = mapped_column(String(128), nullable=False)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(64), nullable=False)
    http_status: Mapped[Optional[int]] = mapped_column(Integer)
    records_fetched: Mapped[int] = mapped_column(Integer, default=0)
    checksum_sha256: Mapped[Optional[str]] = mapped_column(String(128))
    processing_version: Mapped[str] = mapped_column(String(64), nullable=False)
    error_detail: Mapped[Optional[str]] = mapped_column(Text)


class Watershed(Base):
    __tablename__ = "watersheds"

    watershed_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    basin: Mapped[str] = mapped_column(String(128), nullable=False)
    district: Mapped[str] = mapped_column(String(128), nullable=False)
    state: Mapped[str] = mapped_column(String(128), nullable=False)
    centroid_lat: Mapped[float] = mapped_column(Float, nullable=False)
    centroid_lon: Mapped[float] = mapped_column(Float, nullable=False)
    area_sq_km: Mapped[float] = mapped_column(Float, nullable=False)
    mean_elevation_m: Mapped[float] = mapped_column(Float, nullable=False)
    mean_slope_deg: Mapped[float] = mapped_column(Float, nullable=False)
    drainage_density_km_per_sqkm: Mapped[float] = mapped_column(Float, nullable=False)
    boundary_geojson: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)


class TerrainCell(Base):
    __tablename__ = "terrain_cells"

    cell_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    watershed_id: Mapped[str] = mapped_column(String(64), ForeignKey("watersheds.watershed_id"), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    elevation: Mapped[float] = mapped_column(Float, nullable=False)
    slope: Mapped[float] = mapped_column(Float, nullable=False)
    aspect: Mapped[float] = mapped_column(Float, nullable=False)
    curvature: Mapped[float] = mapped_column(Float, nullable=False)
    twi: Mapped[float] = mapped_column(Float, nullable=False)
    tri: Mapped[float] = mapped_column(Float, nullable=False)
    flow_accumulation: Mapped[float] = mapped_column(Float, nullable=False)
    distance_to_stream: Mapped[float] = mapped_column(Float, nullable=False)
    drainage_density: Mapped[float] = mapped_column(Float, nullable=False)
    historical_flood_frequency: Mapped[float] = mapped_column(Float, nullable=False)
    landslide_density: Mapped[float] = mapped_column(Float, nullable=False)
    distance_to_landslide: Mapped[float] = mapped_column(Float, nullable=False)
    permanent_water_fraction: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    dataset_version: Mapped[str] = mapped_column(String(128), nullable=False)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class WeatherObservation(Base):
    __tablename__ = "weather_observations"

    obs_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    watershed_id: Mapped[Optional[str]] = mapped_column(String(64), ForeignKey("watersheds.watershed_id"))
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    dataset_version: Mapped[str] = mapped_column(String(128), nullable=False)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    observation_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    rain_1h_mm: Mapped[Optional[float]] = mapped_column(Float)
    rain_3h_mm: Mapped[Optional[float]] = mapped_column(Float)
    rain_6h_mm: Mapped[Optional[float]] = mapped_column(Float)
    rain_12h_mm: Mapped[Optional[float]] = mapped_column(Float)
    rain_24h_mm: Mapped[Optional[float]] = mapped_column(Float)
    rain_48h_mm: Mapped[Optional[float]] = mapped_column(Float)
    rain_72h_mm: Mapped[Optional[float]] = mapped_column(Float)
    rain_anomaly_24h: Mapped[Optional[float]] = mapped_column(Float)
    antecedent_precipitation_index: Mapped[Optional[float]] = mapped_column(Float)
    runoff_mm: Mapped[Optional[float]] = mapped_column(Float)
    snow_depth_m: Mapped[Optional[float]] = mapped_column(Float)
    snowmelt_mm: Mapped[Optional[float]] = mapped_column(Float)
    units: Mapped[str] = mapped_column(String(32), default="mm")
    quality_flag: Mapped[str] = mapped_column(String(32), default="VALID")
    raw_record_id: Mapped[str] = mapped_column(String(128), nullable=False)


class WeatherForecast(Base):
    __tablename__ = "weather_forecasts"

    forecast_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    watershed_id: Mapped[Optional[str]] = mapped_column(String(64), ForeignKey("watersheds.watershed_id"))
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    dataset_version: Mapped[str] = mapped_column(String(128), nullable=False)
    issue_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    forecast_rain_6h_mm: Mapped[Optional[float]] = mapped_column(Float)
    forecast_rain_24h_mm: Mapped[Optional[float]] = mapped_column(Float)
    units: Mapped[str] = mapped_column(String(32), default="mm")
    quality_flag: Mapped[str] = mapped_column(String(32), default="VALID")
    raw_record_id: Mapped[str] = mapped_column(String(128), nullable=False)


class SoilMoistureObservation(Base):
    __tablename__ = "soil_moisture_observations"

    soil_obs_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    watershed_id: Mapped[Optional[str]] = mapped_column(String(64), ForeignKey("watersheds.watershed_id"))
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    dataset_version: Mapped[str] = mapped_column(String(128), nullable=False)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    observation_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    soil_water_l1: Mapped[Optional[float]] = mapped_column(Float)
    soil_water_l2: Mapped[Optional[float]] = mapped_column(Float)
    soil_water_l3: Mapped[Optional[float]] = mapped_column(Float)
    soil_water_l4: Mapped[Optional[float]] = mapped_column(Float)
    units: Mapped[str] = mapped_column(String(32), default="m3/m3")
    quality_flag: Mapped[str] = mapped_column(String(32), default="VALID")
    raw_record_id: Mapped[str] = mapped_column(String(128), nullable=False)


class RiverObservation(Base):
    __tablename__ = "river_observations"

    river_obs_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    watershed_id: Mapped[Optional[str]] = mapped_column(String(64), ForeignKey("watersheds.watershed_id"))
    station_name: Mapped[str] = mapped_column(String(255), nullable=False)
    river_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    dataset_version: Mapped[str] = mapped_column(String(128), nullable=False)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    observation_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    river_level_m: Mapped[Optional[float]] = mapped_column(Float)
    river_level_change_1h_m: Mapped[Optional[float]] = mapped_column(Float)
    discharge_cms: Mapped[Optional[float]] = mapped_column(Float)
    warning_level_m: Mapped[Optional[float]] = mapped_column(Float)
    danger_level_m: Mapped[Optional[float]] = mapped_column(Float)
    units: Mapped[str] = mapped_column(String(32), default="m")
    quality_flag: Mapped[str] = mapped_column(String(64), nullable=False)
    raw_record_id: Mapped[str] = mapped_column(String(128), nullable=False)


class SensorDevice(Base):
    __tablename__ = "sensor_devices"

    device_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    watershed_id: Mapped[Optional[str]] = mapped_column(String(64), ForeignKey("watersheds.watershed_id"))
    sensor_types: Mapped[List[str]] = mapped_column(JSON, nullable=False)
    protocol: Mapped[str] = mapped_column(String(32), default="MQTT")
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    elevation_m: Mapped[Optional[float]] = mapped_column(Float)
    calibration_metadata: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(64), default="awaiting_telemetry")
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    installed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    reading_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    device_id: Mapped[str] = mapped_column(String(64), ForeignKey("sensor_devices.device_id"), nullable=False)
    sensor_type: Mapped[str] = mapped_column(String(64), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(32), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    quality_flag: Mapped[str] = mapped_column(String(64), nullable=False)
    calibration_metadata: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    raw_payload: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON)


class Settlement(Base):
    __tablename__ = "settlements"

    settlement_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    watershed_id: Mapped[str] = mapped_column(String(64), ForeignKey("watersheds.watershed_id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    place_type: Mapped[str] = mapped_column(String(64), nullable=False)
    district: Mapped[str] = mapped_column(String(128), nullable=False)
    state: Mapped[str] = mapped_column(String(128), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    elevation_m: Mapped[Optional[float]] = mapped_column(Float)
    osm_id: Mapped[str] = mapped_column(String(64), nullable=False)
    source: Mapped[str] = mapped_column(String(64), default="osm")
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Road(Base):
    __tablename__ = "roads"

    road_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    watershed_id: Mapped[Optional[str]] = mapped_column(String(64), ForeignKey("watersheds.watershed_id"))
    osm_way_id: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(255))
    highway_type: Mapped[str] = mapped_column(String(64), nullable=False)
    surface: Mapped[Optional[str]] = mapped_column(String(64))
    length_m: Mapped[float] = mapped_column(Float, nullable=False)
    flood_hazard_score: Mapped[Optional[float]] = mapped_column(Float)
    landslide_hazard_score: Mapped[Optional[float]] = mapped_column(Float)
    closure_status: Mapped[str] = mapped_column(String(64), default="hazard_status_unknown")
    coordinates_geojson: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    source: Mapped[str] = mapped_column(String(64), default="osm")
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Shelter(Base):
    __tablename__ = "shelters"

    shelter_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    watershed_id: Mapped[Optional[str]] = mapped_column(String(64), ForeignKey("watersheds.watershed_id"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    facility_type: Mapped[str] = mapped_column(String(64), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    elevation_m: Mapped[Optional[float]] = mapped_column(Float)
    verification_status: Mapped[str] = mapped_column(String(64), default="verification_required")
    verified_by: Mapped[Optional[str]] = mapped_column(String(255))
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    capacity_note: Mapped[Optional[str]] = mapped_column(String(255))
    osm_id: Mapped[Optional[str]] = mapped_column(String(64))
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class HistoricalEvent(Base):
    __tablename__ = "historical_events"

    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    basin: Mapped[str] = mapped_column(String(128), nullable=False)
    state: Mapped[str] = mapped_column(String(128), nullable=False)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    peak_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    dfo_id: Mapped[Optional[str]] = mapped_column(String(64))
    source: Mapped[str] = mapped_column(String(128), nullable=False)
    dataset_version: Mapped[str] = mapped_column(String(128), nullable=False)
    used_in_training: Mapped[bool] = mapped_column(Boolean, default=False)
    split_role: Mapped[str] = mapped_column(String(32), nullable=False)
    severity_class: Mapped[Optional[str]] = mapped_column(String(64))
    summary: Mapped[str] = mapped_column(Text, nullable=False)


class EventFootprint(Base):
    __tablename__ = "event_footprints"

    footprint_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(64), ForeignKey("historical_events.event_id"), nullable=False)
    watershed_id: Mapped[Optional[str]] = mapped_column(String(64), ForeignKey("watersheds.watershed_id"))
    observed_inundation: Mapped[bool] = mapped_column(Boolean, nullable=False)
    inundated_fraction: Mapped[Optional[float]] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(128), nullable=False)
    dataset_version: Mapped[str] = mapped_column(String(128), nullable=False)
    footprint_geojson: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)


class ModelVersion(Base):
    __tablename__ = "model_versions"

    model_version: Mapped[str] = mapped_column(String(64), primary_key=True)
    algorithm: Mapped[str] = mapped_column(String(64), nullable=False)
    trained_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    artifact_path: Mapped[str] = mapped_column(Text, nullable=False)
    calibrator_path: Mapped[str] = mapped_column(Text, nullable=False)
    features_path: Mapped[str] = mapped_column(Text, nullable=False)
    provenance_path: Mapped[str] = mapped_column(Text, nullable=False)
    validation_threshold: Mapped[float] = mapped_column(Float, nullable=False)
    dataset_rows: Mapped[int] = mapped_column(Integer, nullable=False)
    unique_events: Mapped[int] = mapped_column(Integer, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)


class ModelMetric(Base):
    __tablename__ = "model_metrics"

    metric_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    model_version: Mapped[str] = mapped_column(String(64), ForeignKey("model_versions.model_version"), nullable=False)
    candidate_model: Mapped[str] = mapped_column(String(64), nullable=False)
    split_name: Mapped[str] = mapped_column(String(32), nullable=False)
    pr_auc: Mapped[float] = mapped_column(Float, nullable=False)
    roc_auc: Mapped[float] = mapped_column(Float, nullable=False)
    precision: Mapped[float] = mapped_column(Float, nullable=False)
    recall: Mapped[float] = mapped_column(Float, nullable=False)
    f1: Mapped[float] = mapped_column(Float, nullable=False)
    brier_score: Mapped[float] = mapped_column(Float, nullable=False)
    false_alarm_rate: Mapped[float] = mapped_column(Float, nullable=False)
    validation_threshold: Mapped[float] = mapped_column(Float, nullable=False)
    confusion_matrix_json: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    calibration_curve_json: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)


class RiskPrediction(Base):
    __tablename__ = "risk_predictions"

    prediction_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    watershed_id: Mapped[str] = mapped_column(String(64), ForeignKey("watersheds.watershed_id"), nullable=False)
    model_version: Mapped[str] = mapped_column(String(64), ForeignKey("model_versions.model_version"), nullable=False)
    prediction_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    flood_probability: Mapped[float] = mapped_column(Float, nullable=False)
    risk_class: Mapped[str] = mapped_column(String(32), nullable=False)
    uncertainty_band: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    input_data_versions: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    data_freshness_summary: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    raw_feature_vector: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)


class RiskExplanation(Base):
    __tablename__ = "risk_explanations"

    explanation_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    prediction_id: Mapped[str] = mapped_column(String(64), ForeignKey("risk_predictions.prediction_id"), nullable=False)
    watershed_id: Mapped[str] = mapped_column(String(64), ForeignKey("watersheds.watershed_id"), nullable=False)
    model_version: Mapped[str] = mapped_column(String(64), nullable=False)
    method: Mapped[str] = mapped_column(String(64), default="SHAP")
    base_value: Mapped[float] = mapped_column(Float, nullable=False)
    top_positive_contributors: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, nullable=False)
    top_negative_contributors: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, nullable=False)
    feature_values: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Alert(Base):
    __tablename__ = "alerts"

    alert_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    watershed_id: Mapped[str] = mapped_column(String(64), ForeignKey("watersheds.watershed_id"), nullable=False)
    area_name: Mapped[str] = mapped_column(String(255), nullable=False)
    origin_type: Mapped[str] = mapped_column(String(64), nullable=False)  # official_warning | floodguard_ai_advisory
    severity_state: Mapped[str] = mapped_column(String(32), nullable=False)  # advisory | watch | warning | critical
    lifecycle_state: Mapped[str] = mapped_column(String(32), nullable=False)  # triggered | under_review | issued | acknowledged | expired
    issue_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    recommended_action: Mapped[str] = mapped_column(Text, nullable=False)
    source_or_model: Mapped[str] = mapped_column(String(128), nullable=False)
    prediction_id: Mapped[Optional[str]] = mapped_column(String(64), ForeignKey("risk_predictions.prediction_id"))
    evidence_json: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)


class AlertAcknowledgement(Base):
    __tablename__ = "alert_acknowledgements"

    ack_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    alert_id: Mapped[str] = mapped_column(String(64), ForeignKey("alerts.alert_id"), nullable=False)
    acknowledged_by: Mapped[str] = mapped_column(String(128), nullable=False)
    acknowledged_role: Mapped[str] = mapped_column(String(64), nullable=False)
    acknowledged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    new_lifecycle_state: Mapped[str] = mapped_column(String(32), nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    log_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    actor: Mapped[str] = mapped_column(String(128), nullable=False)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)
    details_json: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
