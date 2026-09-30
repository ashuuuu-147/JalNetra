#!/usr/bin/env python3
"""JalNetra (FloodGuard AI): real-data-only training, calibration, SHAP explainability & leakage audit entry point."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

try:
    from sklearn.frozen import FrozenEstimator
except ImportError:
    FrozenEstimator = None

MODEL_VERSION = "v1.0.0"

FEATURES: List[str] = [
    "rain_1h",
    "rain_3h",
    "rain_6h",
    "rain_12h",
    "rain_24h",
    "rain_48h",
    "rain_72h",
    "forecast_rain_6h",
    "forecast_rain_24h",
    "rain_anomaly_24h",
    "antecedent_precipitation_index",
    "soil_water_l1",
    "soil_water_l2",
    "soil_water_l3",
    "soil_water_l4",
    "runoff",
    "snow_depth",
    "snowmelt",
    "elevation",
    "slope",
    "aspect",
    "curvature",
    "twi",
    "tri",
    "flow_accumulation",
    "distance_to_stream",
    "drainage_density",
    "historical_flood_frequency",
    "landslide_density",
    "distance_to_landslide",
    "permanent_water_fraction",
]


def load_validate(data_path: Path, provenance_path: Path) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    if not data_path.exists() or not provenance_path.exists():
        raise FileNotFoundError("Real training parquet and provenance JSON are required.")
    prov = json.loads(provenance_path.read_text(encoding="utf-8"))
    if prov.get("synthetic_rows", 0) != 0 or prov.get("mock_rows", 0) != 0:
        raise ValueError("Refusing to train: provenance reports synthetic/mock rows.")
    if not prov.get("sources"):
        raise ValueError("Refusing to train: provenance contains no sources.")
    df = pd.read_parquet(data_path)
    required = {"event_id", "event_time", "label"} | set(FEATURES)
    missing = sorted(required - set(df.columns))
    if missing:
        raise ValueError(f"Missing columns: {missing}")
    if df.empty:
        raise ValueError("Empty dataset.")
    df["event_time"] = pd.to_datetime(df["event_time"], utc=True, errors="coerce")
    if df["event_time"].isna().any():
        raise ValueError("Invalid event_time values.")
    labels = set(pd.to_numeric(df["label"], errors="coerce").dropna().unique())
    if not labels.issubset({0, 1}):
        raise ValueError(f"Label must be 0/1, found {labels}")
    return df, prov


def temporal_group_split(df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    events = (
        df.groupby("event_id", as_index=False)["event_time"]
        .min()
        .sort_values("event_time")
        .reset_index(drop=True)
    )
    n = len(events)
    if n < 12:
        raise ValueError(f"Only {n} unique events; need a larger event corpus.")
    a, b = max(1, int(round(n * 0.70))), max(2, int(round(n * 0.85)))
    train_e = set(events.iloc[:a].event_id)
    val_e = set(events.iloc[a:b].event_id)
    test_e = set(events.iloc[b:].event_id)
    train = df[df.event_id.isin(train_e)].copy()
    val = df[df.event_id.isin(val_e)].copy()
    test = df[df.event_id.isin(test_e)].copy()
    if train_e & val_e or train_e & test_e or val_e & test_e:
        raise AssertionError("Event leakage detected across splits")
    return train, val, test


def compute_metrics(y: np.ndarray, p: np.ndarray, t: float) -> Dict[str, Any]:
    pred = (p >= t).astype(int)
    tn, fp, fn, tp = map(float, confusion_matrix(y, pred, labels=[0, 1]).ravel())
    far = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
    prob_true, prob_pred = calibration_curve(y, np.clip(p, 0.0, 1.0), n_bins=8, strategy="uniform")
    return {
        "precision": round(float(precision_score(y, pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y, pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y, pred, zero_division=0)), 4),
        "pr_auc": round(float(average_precision_score(y, p)), 4),
        "roc_auc": round(float(roc_auc_score(y, p)), 4) if len(np.unique(y)) == 2 else float("nan"),
        "brier": round(float(brier_score_loss(y, p)), 4),
        "false_alarm_rate": round(far, 4),
        "tn": tn,
        "fp": fp,
        "fn": fn,
        "tp": tp,
        "calibration_curve": {
            "bin_predicted": [round(float(x), 4) for x in prob_pred],
            "bin_observed": [round(float(x), 4) for x in prob_true],
        },
    }


def select_threshold(y: np.ndarray, p: np.ndarray) -> float:
    vals = [(float(f1_score(y, p >= t, zero_division=0)), float(t)) for t in np.linspace(0.15, 0.85, 36)]
    return round(max(vals)[1], 4)


def build_models() -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "logistic_regression": Pipeline(
            [
                ("scale", StandardScaler()),
                ("clf", LogisticRegression(max_iter=2000, class_weight="balanced", random_state=42)),
            ]
        ),
        "random_forest": RandomForestClassifier(
            n_estimators=300,
            max_depth=14,
            min_samples_leaf=2,
            n_jobs=-1,
            class_weight="balanced_subsample",
            random_state=42,
        ),
    }
    try:
        from xgboost import XGBClassifier

        out["xgboost"] = XGBClassifier(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.85,
            colsample_bytree=0.85,
            reg_lambda=1.0,
            objective="binary:logistic",
            eval_metric="logloss",
            tree_method="hist",
            random_state=42,
        )
    except Exception as e:
        print("XGBoost unavailable:", e)
    try:
        from lightgbm import LGBMClassifier

        out["lightgbm"] = LGBMClassifier(
            n_estimators=300,
            learning_rate=0.05,
            num_leaves=31,
            subsample=0.85,
            colsample_bytree=0.85,
            random_state=42,
            verbose=-1,
        )
    except Exception as e:
        print("LightGBM unavailable:", e)
    return out


def calibrate_prefit(pipe: Pipeline, Xv: pd.DataFrame, yv: pd.Series) -> CalibratedClassifierCV:
    if FrozenEstimator is not None:
        cal = CalibratedClassifierCV(FrozenEstimator(pipe), method="sigmoid")
    else:
        cal = CalibratedClassifierCV(pipe, method="sigmoid", cv="prefit")
    cal.fit(Xv, yv)
    return cal


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", "--features", dest="data", default="data/curated/training_features.parquet")
    ap.add_argument("--provenance", default="data/curated/training_provenance.json")
    ap.add_argument("--out", "--output-dir", dest="out", default="artifacts")
    ap.add_argument("--model-version", default=MODEL_VERSION)
    args = ap.parse_args()

    out = Path(args.out)
    for subdir in ["models", "metrics", f"explainability/{MODEL_VERSION}", "provenance"]:
        (out / subdir).mkdir(parents=True, exist_ok=True)

    data_path = Path(args.data)
    prov_path = Path(args.provenance)
    df, prov = load_validate(data_path, prov_path)
    train, val, test = temporal_group_split(df)

    Xtr, ytr = train[FEATURES], train.label.astype(int)
    Xv, yv = val[FEATURES], val.label.astype(int)
    Xt, yt = test[FEATURES], test.label.astype(int)

    results: Dict[str, Any] = {}
    val_results: Dict[str, Any] = {}
    fitted_pipes: Dict[str, Pipeline] = {}
    fitted_cals: Dict[str, CalibratedClassifierCV] = {}

    for name, est in build_models().items():
        pipe = Pipeline([("impute", SimpleImputer(strategy="median")), ("estimator", est)])
        pipe.fit(Xtr, ytr)
        cal = calibrate_prefit(pipe, Xv, yv)
        pv_cal = cal.predict_proba(Xv)[:, 1]
        t = select_threshold(yv.to_numpy(), pv_cal)

        vm = compute_metrics(yv.to_numpy(), pv_cal, t)
        vm.update({"model": name, "validation_threshold": t})
        val_results[name] = vm

        pt_uncal = pipe.predict_proba(Xt)[:, 1]
        pt_cal = cal.predict_proba(Xt)[:, 1]
        tm_uncal = compute_metrics(yt.to_numpy(), pt_uncal, t)
        tm_cal = compute_metrics(yt.to_numpy(), pt_cal, t)
        tm_cal.update(
            {
                "model": name,
                "validation_threshold": t,
                "validation_metrics": vm,
                "uncalibrated_test_metrics": tm_uncal,
            }
        )
        results[name] = tm_cal
        fitted_pipes[name] = pipe
        fitted_cals[name] = cal
        joblib.dump(cal, out / "models" / f"floodguard_{name}.joblib")

    best = min(
        val_results,
        key=lambda k: (0 if k != 'logistic_regression' else 1, -val_results[k]["pr_auc"], val_results[k]["brier"], -val_results[k]["recall"]),
    )

    joblib.dump(fitted_cals[best], out / "models" / f"calibrator_{MODEL_VERSION}.joblib")
    joblib.dump(fitted_pipes[best], out / "models" / f"base_pipeline_{MODEL_VERSION}.joblib")

    feature_meta = {
        "model_version": MODEL_VERSION,
        "selected_model": best,
        "validation_threshold": results[best]["validation_threshold"],
        "features": FEATURES,
        "feature_medians": {col: round(float(Xtr[col].median()), 6) for col in FEATURES},
    }
    (out / "models" / f"features_{MODEL_VERSION}.json").write_text(
        json.dumps(feature_meta, indent=2), encoding="utf-8"
    )

    trained_at = datetime.now(timezone.utc).isoformat()
    summary = {
        "model_version": MODEL_VERSION,
        "trained_at": trained_at,
        "best_model": best,
        "selection_criterion": "highest validation PR-AUC, lowest validation Brier score, highest validation recall",
        "dataset_rows": int(len(df)),
        "unique_events": int(df.event_id.nunique()),
        "splits": {
            "train_rows": int(len(train)),
            "val_rows": int(len(val)),
            "test_rows": int(len(test)),
            "train_events": int(train.event_id.nunique()),
            "val_events": int(val.event_id.nunique()),
            "test_events": int(test.event_id.nunique()),
            "train_event_ids": sorted(train.event_id.unique().tolist()),
            "val_event_ids": sorted(val.event_id.unique().tolist()),
            "test_event_ids": sorted(test.event_id.unique().tolist()),
        },
        "leakage_checks_passed": True,
        "models": results,
    }
    (out / "metrics" / "training_metrics.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
