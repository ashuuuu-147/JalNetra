"""API contract, frontend build/accessibility smoke, and full E2E workflow tests."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from apps.api.main import app

ROOT_DIR = Path(__file__).resolve().parents[2]


def test_full_end_to_end_sih_workflow() -> None:
    """Verify: real data -> features -> model -> API -> GIS -> explanation -> alert -> routing -> provenance -> metrics."""
    with TestClient(app) as client:
        # 1. Source Health
        r_health = client.get("/api/v1/sources/health")
        assert r_health.status_code == 200
        health_data = r_health.json()
        assert len(health_data["sources"]) == 13
        assert health_data["summary_counts"]["healthy"] >= 7
        assert health_data["summary_counts"]["authentication_required"] >= 5

        # 2. Held-Out Replay Events & Chronological Timeline
        r_events = client.get("/api/v1/replay/events")
        assert r_events.status_code == 200
        events = r_events.json()["events"]
        assert len(events) >= 2
        beas_ev = next(e for e in events if e["event_id"] == "REPLAY_2023_HP_BEAS_JULY")
        assert beas_ev["used_in_training"] is False

        r_replay = client.get(
            "/api/v1/replay/REPLAY_2023_HP_BEAS_JULY/timeline?watershed_id=ws_pandoh_mandi&step_index=20"
        )
        assert r_replay.status_code == 200
        replay_body = r_replay.json()
        chain = replay_body["step_chain"]
        assert "1_observations" in chain
        assert "2_features" in chain
        assert "3_prediction" in chain
        assert "4_watershed_risk_map" in chain
        assert "5_explanation" in chain
        assert "6_advisory" in chain
        assert "7_exposed_settlements" in chain
        assert "8_evacuation_route" in chain

        # 3. Hyperlocal Catchment Risk + SHAP Explanation
        r_risk = client.get(
            "/api/v1/areas/ws_pandoh_mandi/risk?event_id=REPLAY_2023_HP_BEAS_JULY&step_index=22"
        )
        assert r_risk.status_code == 200
        risk_body = r_risk.json()
        assert 0.0 <= risk_body["prediction"]["flood_probability"] <= 1.0
        assert risk_body["official_warning_status"]["origin_type"] == "official_warning"
        assert risk_body["floodguard_advisory"]["origin_type"] == "floodguard_ai_advisory"
        assert len(risk_body["prediction"]["explanation"]["top_positive_contributors"]) >= 1

        # 4. 2D GIS Map Layers
        r_map = client.get("/api/v1/map/layers?event_id=REPLAY_2023_HP_BEAS_JULY&step_index=22")
        assert r_map.status_code == 200
        layers = r_map.json()["layers"]
        for req_layer in [
            "flood_risk",
            "terrain_centroids",
            "historical_flood_footprints",
            "landslide_inventory",
            "rivers",
            "roads",
            "settlements",
            "shelters",
            "sensors",
        ]:
            assert req_layer in layers
            assert layers[req_layer]["type"] == "FeatureCollection"

        # 5. Alert Lifecycle: Trigger -> Review -> Issue -> Acknowledge -> Expire
        r_create_alert = client.post(
            "/api/v1/alerts",
            json={
                "watershed_id": "ws_pandoh_mandi",
                "origin_type": "floodguard_ai_advisory",
                "lifecycle_state": "triggered",
                "actor": "E2E Test Operator",
                "event_id": "REPLAY_2023_HP_BEAS_JULY",
                "step_index": 22,
            },
        )
        assert r_create_alert.status_code == 200
        alert_id = r_create_alert.json()["alert_id"]

        for next_state in ["under_review", "issued", "acknowledged", "expired"]:
            r_tr = client.post(
                f"/api/v1/alerts/{alert_id}/transition",
                json={
                    "target_state": next_state,
                    "actor": "DDMA Controller",
                    "role": "Incident Commander",
                    "notes": f"Transition to {next_state}",
                },
            )
            assert r_tr.status_code == 200
            assert r_tr.json()["lifecycle_state"] == next_state

        # 6. Evacuation Routing on Real OSM Geometry + Shelter Verification Status
        r_shelters = client.get("/api/v1/shelters")
        assert r_shelters.status_code == 200
        shelters = r_shelters.json()["shelters"]
        unverified = [s for s in shelters if s["verification_status"] == "verification_required"]
        assert len(unverified) >= 1
        assert unverified[0]["verification_label"] == "Shelter location found — verification required"

        r_route = client.post(
            "/api/v1/routes/plan",
            json={
                "origin_node": "mandi_town",
                "flood_weight": 8.5,
                "landslide_weight": 5.5,
                "allow_unverified_shelter": False,
                "event_id": "REPLAY_2023_HP_BEAS_JULY",
                "step_index": 22,
            },
        )
        assert r_route.status_code == 200
        route_data = r_route.json()
        assert route_data["status"] == "success"
        assert route_data["destination_shelter"]["verification_status"] == "verified"
        assert route_data["total_distance_km"] > 0
        assert len(route_data["route_geojson"]["geometry"]["coordinates"]) >= 10

        # 7. ESP32 Sensor Gateway Quality Enforcement
        r_bad_sensor = client.post(
            "/api/v1/sensors/readings",
            json={
                "device_id": "esp32-beas-pandoh-01",
                "sensor_type": "rain_gauge",
                "value": -42.0,
                "unit": "mm",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "latitude": 31.671,
                "longitude": 77.052,
            },
        )
        assert r_bad_sensor.status_code == 422

        r_ok_sensor = client.post(
            "/api/v1/sensors/readings",
            json={
                "device_id": "esp32-beas-pandoh-01",
                "sensor_type": "rain_gauge",
                "value": 12.4,
                "unit": "mm",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "latitude": 31.671,
                "longitude": 77.052,
            },
        )
        assert r_ok_sensor.status_code == 200
        assert r_ok_sensor.json()["quality_flag"] == "VALID"

        # 8. Provenance & Model Metrics Endpoints
        r_prov = client.get("/api/v1/provenance")
        assert r_prov.status_code == 200
        assert r_prov.json()["data_integrity_contract"]["synthetic_rows"] == 0
        assert r_prov.json()["data_integrity_contract"]["mock_rows"] == 0

        r_metrics = client.get("/api/v1/models/v1.0.0/metrics")
        assert r_metrics.status_code == 200
        assert r_metrics.json()["leakage_report"]["passed_all_checks"] is True


def test_frontend_accessibility_and_production_bundle_smoke() -> None:
    """Verify semantic HTML landmarks, skip link, native dialog, and built bundle existence."""
    app_tsx = (ROOT_DIR / "apps" / "web" / "src" / "App.tsx").read_text(encoding="utf-8")
    styles_css = (ROOT_DIR / "apps" / "web" / "src" / "styles.css").read_text(encoding="utf-8")
    dist_index = ROOT_DIR / "apps" / "web" / "dist" / "index.html"

    assert dist_index.exists(), "Production frontend bundle must be built"
    assert 'className="skip-link visually-hidden"' in app_tsx
    assert '<main id="main-workspace"' in app_tsx
    assert "<dialog" in app_tsx
    assert "Use official emergency instructions during an active disaster." in app_tsx
    assert "FloodGuard AI estimates flood risk from multi-source observations" in app_tsx
    assert "min-height: 44px" in styles_css
    assert "prefers-reduced-motion: reduce" in styles_css
