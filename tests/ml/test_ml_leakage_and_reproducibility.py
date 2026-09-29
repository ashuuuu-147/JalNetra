"""ML leakage, event-aware temporal split, calibration, and reproducibility tests."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from services.ml.inference import FloodRiskEngine
from train_floodguard import FEATURES, MODEL_VERSION, load_validate, temporal_group_split

ROOT_DIR = Path(__file__).resolve().parents[2]


def test_event_aware_temporal_split_prevents_event_and_future_leakage() -> None:
    data_path = ROOT_DIR / "data" / "curated" / "training_features.parquet"
    prov_path = ROOT_DIR / "data" / "curated" / "training_provenance.json"
    df, prov = load_validate(data_path, prov_path)
    train, val, test = temporal_group_split(df)

    train_events = set(train["event_id"].unique())
    val_events = set(val["event_id"].unique())
    test_events = set(test["event_id"].unique())

    # Zero event overlap
    assert len(train_events & val_events) == 0
    assert len(train_events & test_events) == 0
    assert len(val_events & test_events) == 0

    # Strict chronological ordering across splits
    assert train["event_time"].max() < val["event_time"].min()
    assert val["event_time"].max() < test["event_time"].min()

    # Held-out replay events must not appear in any split
    replay_excluded = set(prov.get("held_out_replay_events_excluded", []))
    assert len(replay_excluded & set(df["event_id"].unique())) == 0


def test_stored_ml_artifacts_and_leakage_report_are_valid() -> None:
    metrics_path = ROOT_DIR / "artifacts" / "metrics" / "training_metrics.json"
    leakage_path = ROOT_DIR / "artifacts" / "metrics" / "leakage_report.json"
    calibrator_path = ROOT_DIR / "artifacts" / "models" / f"calibrator_{MODEL_VERSION}.joblib"
    features_path = ROOT_DIR / "artifacts" / "models" / f"features_{MODEL_VERSION}.json"
    shap_path = ROOT_DIR / "artifacts" / "explainability" / MODEL_VERSION / "global_feature_importance.json"
    prov_path = ROOT_DIR / "artifacts" / "provenance" / f"{MODEL_VERSION}.json"

    for p in [metrics_path, leakage_path, calibrator_path, features_path, shap_path, prov_path]:
        assert p.exists(), f"Missing required ML artifact: {p}"

    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    leakage = json.loads(leakage_path.read_text(encoding="utf-8"))
    assert leakage["passed_all_checks"] is True
    assert all(leakage["checks"].values())

    best_model = metrics["best_model"]
    assert best_model in metrics["models"]
    best_m = metrics["models"][best_model]
    assert 0.0 <= best_m["pr_auc"] <= 1.0
    assert 0.0 <= best_m["brier"] <= 1.0
    assert "calibration_curve" in best_m


def test_reproducible_inference_and_local_shap_explanations() -> None:
    engine = FloodRiskEngine(ROOT_DIR / "artifacts")
    assert engine.is_ready is True

    df = pd.read_parquet(ROOT_DIR / "data" / "curated" / "training_features.parquet")
    sample_row = df.iloc[-1][FEATURES].to_dict()

    pred1 = engine.predict_for_features("ws_pandoh_mandi", sample_row, "2023-07-09T18:00:00Z")
    pred2 = engine.predict_for_features("ws_pandoh_mandi", sample_row, "2023-07-09T18:00:00Z")

    # Deterministic probability and SHAP output
    assert pred1["flood_probability"] == pred2["flood_probability"]
    assert pred1["risk_class"] == pred2["risk_class"]
    assert len(pred1["explanation"]["top_positive_contributors"]) > 0
    assert (
        pred1["explanation"]["top_positive_contributors"][0]["shap_contribution"]
        == pred2["explanation"]["top_positive_contributors"][0]["shap_contribution"]
    )
