"""Backend unit, data ingestion, quality validation, and provenance tests for JalNetra."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path

import pytest

from services.ingestion.adapters import (
    AUTH_ENV_MAP,
    check_authorized_source,
    compute_dynamic_features_from_hourly,
    load_source_registry,
)
from services.ingestion.quality import (
    evaluate_freshness,
    validate_coordinates,
    validate_observation_record,
    validate_sensor_reading,
)

ROOT_DIR = Path(__file__).resolve().parents[2]


def test_source_registry_loads_all_13_official_sources() -> None:
    rows = load_source_registry()
    source_ids = {r["source_id"] for r in rows}
    expected = {
        "imd_api",
        "imd_ffg",
        "gsmap_isro",
        "gpm_imerg",
        "era5_land",
        "nasadem",
        "srtm",
        "jrc_gsw",
        "gfd",
        "isro_landslide",
        "cwc_hmo",
        "ndem",
        "osm",
    }
    assert expected.issubset(source_ids)
    for sid in AUTH_ENV_MAP:
        matching = next(r for r in rows if r["source_id"] == sid)
        assert matching["auth_required"] is True


def test_authorized_sources_report_authentication_required_without_bypass(monkeypatch: pytest.MonkeyPatch) -> None:
    for sid, (env_var, _) in AUTH_ENV_MAP.items():
        monkeypatch.delenv(env_var, raising=False)
        res = check_authorized_source(sid)
        assert res.status == "authentication_required"
        assert res.http_status == 401
        assert res.records_fetched == 0
        assert res.metadata.get("bypass_attempted") is False


def test_quality_validator_rejects_impossible_physical_values() -> None:
    now_iso = datetime.now(timezone.utc).isoformat()
    bad_obs = {
        "lat": 31.708,
        "lon": 76.932,
        "observation_time": now_iso,
        "rain_1h": -12.5,  # Impossible negative rainfall
        "soil_water_l1": 1.45,  # Impossible volumetric soil moisture > 1.0
    }
    report = validate_observation_record(bad_obs, required_fields=["rain_1h", "soil_water_l1"])
    assert report.is_valid is False
    assert report.quality_flag == "IMPOSSIBLE_VALUE"
    assert len(report.issues) >= 2


def test_quality_validator_flags_stale_observations() -> None:
    ref_dt = datetime(2026, 9, 30, 0, 0, tzinfo=timezone.utc)
    old_dt = ref_dt - timedelta(hours=12)
    status, age = evaluate_freshness(old_dt, reference_time=ref_dt, stale_after_seconds=3600)
    assert status == "stale"
    assert age == 43200.0


def test_sensor_reading_validator_accepts_valid_and_rejects_invalid() -> None:
    now_iso = datetime.now(timezone.utc).isoformat()
    valid_pkt = {
        "device_id": "esp32-beas-pandoh-01",
        "sensor_type": "rain_gauge",
        "value": 18.4,
        "unit": "mm",
        "timestamp": now_iso,
        "latitude": 31.671,
        "longitude": 77.052,
    }
    rep_ok = validate_sensor_reading(valid_pkt)
    assert rep_ok.is_valid is True
    assert rep_ok.quality_flag == "VALID"

    invalid_pkt = dict(valid_pkt, value=-5.0)
    rep_bad = validate_sensor_reading(invalid_pkt)
    assert rep_bad.is_valid is False
    assert rep_bad.quality_flag == "IMPOSSIBLE_VALUE"


def test_causal_dynamic_feature_computation_has_no_future_leakage() -> None:
    times = [f"2023-07-08T{h:02d}:00" for h in range(24)]
    precip = [2.0] * 12 + [50.0] * 12  # Spike happens AFTER index 11
    sw = [0.35] * 24
    runoff = [None] * 24
    snow = [0.0] * 24

    # Feature computation at idx=10 must NOT see the 50.0 mm/h spike at idx=12..23
    feats_before = compute_dynamic_features_from_hourly(
        times, precip, sw, sw, sw, sw, runoff, snow, snow, idx=10
    )
    assert feats_before["rain_1h"] == 2.0
    assert feats_before["rain_6h"] == 12.0
    assert feats_before["forecast_rain_6h"] < 20.0


def test_training_provenance_contract_zero_synthetic_and_mock_rows() -> None:
    prov_path = ROOT_DIR / "data" / "curated" / "training_provenance.json"
    assert prov_path.exists(), "training_provenance.json must exist"
    prov = json.loads(prov_path.read_text(encoding="utf-8"))
    assert prov["synthetic_rows"] == 0
    assert prov["mock_rows"] == 0
    assert prov["total_rows"] >= 1000
    assert prov["unique_events"] >= 12
    assert len(prov["sources"]) >= 5
    assert "REPLAY_2023_HP_BEAS_JULY" in prov["held_out_replay_events_excluded"]
