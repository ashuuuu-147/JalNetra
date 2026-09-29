"""Data-quality validation layer for JalNetra (FloodGuard AI).

Validates schema, units, timestamps, geographic bounds, freshness, missingness,
and physical plausibility. Never silently repairs an invalid reading.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import math
from typing import Any, Dict, List, Optional


PHYSICAL_BOUNDS: Dict[str, tuple[float, float]] = {
    "rain_1h": (0.0, 500.0),
    "rain_3h": (0.0, 900.0),
    "rain_6h": (0.0, 1200.0),
    "rain_12h": (0.0, 1800.0),
    "rain_24h": (0.0, 2500.0),
    "rain_48h": (0.0, 3500.0),
    "rain_72h": (0.0, 4500.0),
    "forecast_rain_6h": (0.0, 1200.0),
    "forecast_rain_24h": (0.0, 2500.0),
    "soil_water_l1": (0.0, 1.0),
    "soil_water_l2": (0.0, 1.0),
    "soil_water_l3": (0.0, 1.0),
    "soil_water_l4": (0.0, 1.0),
    "runoff": (0.0, 2000.0),
    "snow_depth": (0.0, 50.0),
    "snowmelt": (0.0, 1000.0),
    "elevation": (-50.0, 8850.0),
    "slope": (0.0, 90.0),
    "aspect": (0.0, 360.0),
    "permanent_water_fraction": (0.0, 1.0),
    "latitude": (-90.0, 90.0),
    "longitude": (-180.0, 180.0),
}

SENSOR_BOUNDS: Dict[str, tuple[float, float, List[str]]] = {
    "rain_gauge": (0.0, 500.0, ["mm", "mm/h"]),
    "soil_moisture": (0.0, 100.0, ["m3/m3", "%", "vwc"]),
    "water_level": (0.0, 5000.0, ["m", "cm"]),
}


@dataclass
class QualityReport:
    is_valid: bool
    quality_flag: str
    issues: List[str] = field(default_factory=list)
    missing_fields: List[str] = field(default_factory=list)
    freshness_status: str = "healthy"
    age_seconds: Optional[float] = None


def validate_coordinates(lat: Any, lon: Any) -> List[str]:
    issues: List[str] = []
    if lat is None or lon is None:
        return ["Missing latitude or longitude"]
    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except (TypeError, ValueError):
        return ["Non-numeric latitude or longitude"]
    if math.isnan(lat_f) or math.isnan(lon_f):
        return ["NaN latitude or longitude"]
    if not (-90.0 <= lat_f <= 90.0):
        issues.append(f"Latitude {lat_f} out of bounds [-90, 90]")
    if not (-180.0 <= lon_f <= 180.0):
        issues.append(f"Longitude {lon_f} out of bounds [-180, 180]")
    return issues


def evaluate_freshness(
    observation_time: Optional[datetime],
    reference_time: Optional[datetime] = None,
    stale_after_seconds: int = 21600,
) -> tuple[str, Optional[float]]:
    if observation_time is None:
        return "empty", None
    ref = reference_time or datetime.now(timezone.utc)
    obs_utc = (
        observation_time.replace(tzinfo=timezone.utc)
        if observation_time.tzinfo is None
        else observation_time.astimezone(timezone.utc)
    )
    ref_utc = (
        ref.replace(tzinfo=timezone.utc)
        if ref.tzinfo is None
        else ref.astimezone(timezone.utc)
    )
    age = (ref_utc - obs_utc).total_seconds()
    if age < -300:
        return "processing_error", age
    if age > stale_after_seconds:
        return "stale", age
    return "healthy", age


def validate_observation_record(
    record: Dict[str, Any],
    required_fields: List[str],
    reference_time: Optional[datetime] = None,
    stale_after_seconds: int = 21600,
) -> QualityReport:
    """Validate an observation dictionary without silently altering invalid values."""
    issues: List[str] = []
    missing: List[str] = []

    for req in required_fields:
        val = record.get(req)
        if val is None or (isinstance(val, float) and math.isnan(val)):
            missing.append(req)

    coord_issues = validate_coordinates(
        record.get("lat", record.get("latitude")),
        record.get("lon", record.get("longitude")),
    )
    issues.extend(coord_issues)

    for key, (low, high) in PHYSICAL_BOUNDS.items():
        if key in record and record[key] is not None:
            try:
                val_f = float(record[key])
                if math.isnan(val_f) or math.isinf(val_f):
                    issues.append(f"{key} is NaN/Inf")
                elif not (low <= val_f <= high):
                    issues.append(f"Impossible value for {key}: {val_f} not in [{low}, {high}]")
            except (TypeError, ValueError):
                issues.append(f"Non-numeric value for {key}: {record[key]!r}")

    obs_time = record.get("observation_time") or record.get("timestamp")
    parsed_time: Optional[datetime] = None
    if isinstance(obs_time, datetime):
        parsed_time = obs_time
    elif isinstance(obs_time, str):
        try:
            parsed_time = datetime.fromisoformat(obs_time.replace("Z", "+00:00"))
        except ValueError:
            issues.append(f"Invalid ISO timestamp: {obs_time!r}")
    else:
        issues.append("Missing observation_time/timestamp")

    freshness, age_s = evaluate_freshness(parsed_time, reference_time, stale_after_seconds)
    if freshness == "processing_error":
        issues.append("Observation timestamp is in the future relative to reference_time")

    if issues:
        flag = "IMPOSSIBLE_VALUE" if any("Impossible" in i or "bounds" in i for i in issues) else "INVALID_SCHEMA"
        return QualityReport(
            is_valid=False,
            quality_flag=flag,
            issues=issues,
            missing_fields=missing,
            freshness_status="processing_error",
            age_seconds=age_s,
        )

    if missing:
        return QualityReport(
            is_valid=True,
            quality_flag="PARTIAL_MISSING",
            issues=[],
            missing_fields=missing,
            freshness_status=freshness,
            age_seconds=age_s,
        )

    return QualityReport(
        is_valid=True,
        quality_flag="VALID" if freshness == "healthy" else "STALE_OBSERVATION",
        issues=[],
        missing_fields=[],
        freshness_status=freshness,
        age_seconds=age_s,
    )


def validate_sensor_reading(payload: Dict[str, Any]) -> QualityReport:
    """Validate an incoming ESP32 MQTT/HTTP sensor telemetry payload."""
    issues: List[str] = []
    missing: List[str] = []
    required = ["device_id", "sensor_type", "value", "unit", "timestamp", "latitude", "longitude"]
    for req in required:
        if payload.get(req) is None or payload.get(req) == "":
            missing.append(req)
    if missing:
        return QualityReport(
            is_valid=False,
            quality_flag="INVALID_SCHEMA",
            issues=[f"Missing required fields: {missing}"],
            missing_fields=missing,
            freshness_status="processing_error",
        )

    issues.extend(validate_coordinates(payload.get("latitude"), payload.get("longitude")))

    sensor_type = str(payload.get("sensor_type"))
    unit = str(payload.get("unit"))
    if sensor_type not in SENSOR_BOUNDS:
        issues.append(f"Unsupported sensor_type '{sensor_type}'. Expected one of {list(SENSOR_BOUNDS)}")
    else:
        low, high, allowed_units = SENSOR_BOUNDS[sensor_type]
        if unit not in allowed_units:
            issues.append(f"Invalid unit '{unit}' for {sensor_type}; allowed={allowed_units}")
        try:
            val_f = float(payload["value"])
            if math.isnan(val_f) or math.isinf(val_f):
                issues.append("Sensor value is NaN or Inf")
            elif not (low <= val_f <= high):
                issues.append(f"Impossible sensor reading {val_f} {unit} outside [{low}, {high}]")
        except (TypeError, ValueError):
            issues.append(f"Non-numeric sensor value: {payload['value']!r}")

    try:
        ts = datetime.fromisoformat(str(payload["timestamp"]).replace("Z", "+00:00"))
    except ValueError:
        ts = None
        issues.append(f"Invalid sensor timestamp: {payload.get('timestamp')!r}")

    freshness, age_s = evaluate_freshness(ts, stale_after_seconds=3600)
    if issues:
        flag = "IMPOSSIBLE_VALUE" if any("Impossible" in i or "bounds" in i for i in issues) else "INVALID_SCHEMA"
        return QualityReport(
            is_valid=False,
            quality_flag=flag,
            issues=issues,
            missing_fields=missing,
            freshness_status="processing_error",
            age_seconds=age_s,
        )

    return QualityReport(
        is_valid=True,
        quality_flag="VALID" if freshness == "healthy" else "STALE_OBSERVATION",
        issues=[],
        missing_fields=[],
        freshness_status=freshness,
        age_seconds=age_s,
    )
