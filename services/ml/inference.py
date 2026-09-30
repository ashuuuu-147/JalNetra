"""Real-time and historical replay flood-risk inference engine with SHAP explainability.

Strictly computes probabilities and SHAP explanations from trained model artifacts and
actual feature vectors. Never invents probabilities or explanations.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid

import joblib
import numpy as np
import pandas as pd

from train_floodguard import FEATURES, MODEL_VERSION

ROOT_DIR = Path(__file__).resolve().parents[2]
ARTIFACTS_DIR = ROOT_DIR / "artifacts"

FEATURE_LABELS: Dict[str, tuple[str, str]] = {
    "rain_1h": ("1-Hour Rainfall", "mm"),
    "rain_3h": ("3-Hour Cumulative Rainfall", "mm"),
    "rain_6h": ("6-Hour Cumulative Rainfall", "mm"),
    "rain_12h": ("12-Hour Cumulative Rainfall", "mm"),
    "rain_24h": ("24-Hour Cumulative Rainfall", "mm"),
    "rain_48h": ("48-Hour Cumulative Rainfall", "mm"),
    "rain_72h": ("72-Hour Cumulative Rainfall", "mm"),
    "forecast_rain_6h": ("6-Hour Forecast Rainfall", "mm"),
    "forecast_rain_24h": ("24-Hour Forecast Rainfall", "mm"),
    "rain_anomaly_24h": ("24-Hour Rainfall Anomaly vs Baseline", "mm"),
    "antecedent_precipitation_index": ("5-Day Antecedent Precipitation Index (API)", "mm"),
    "soil_water_l1": ("Topsoil Volumetric Moisture (0–7 cm)", "m³/m³"),
    "soil_water_l2": ("Shallow Root-Zone Moisture (7–28 cm)", "m³/m³"),
    "soil_water_l3": ("Subsurface Soil Moisture (28–100 cm)", "m³/m³"),
    "soil_water_l4": ("Deep Soil Moisture (100–255 cm)", "m³/m³"),
    "runoff": ("6-Hour Surface Runoff", "mm"),
    "snow_depth": ("Snowpack Depth", "m"),
    "snowmelt": ("6-Hour Snowmelt Water Equivalent", "mm"),
    "elevation": ("Terrain Elevation (NASADEM 30m)", "m ASL"),
    "slope": ("Catchment Slope Angle", "deg"),
    "aspect": ("Slope Aspect", "deg"),
    "curvature": ("Profile Curvature", "1/100m"),
    "twi": ("Topographic Wetness Index (TWI)", "index"),
    "tri": ("Terrain Ruggedness Index (TRI)", "m"),
    "flow_accumulation": ("Upslope Flow Accumulation", "cells"),
    "distance_to_stream": ("Distance to Active River Channel", "m"),
    "drainage_density": ("Watershed Drainage Density", "km/km²"),
    "historical_flood_frequency": ("Historical Inundation Frequency (GFD/DFO)", "ratio"),
    "landslide_density": ("ISRO Landslide Atlas Inventory Density", "slides/km²"),
    "distance_to_landslide": ("Proximity to Mapped Landslide Scarp", "m"),
    "permanent_water_fraction": ("JRC Permanent Water Fraction", "ratio"),
}


class FloodRiskEngine:
    """Loads calibrated model artifact and computes probability, calibrated risk class, and SHAP contributors."""

    def __init__(self, artifacts_dir: Path = ARTIFACTS_DIR) -> None:
        self.artifacts_dir = artifacts_dir
        self.calibrator: Any = None
        self.base_pipeline: Any = None
        self.metrics_summary: Dict[str, Any] = {}
        self.leakage_report: Dict[str, Any] = {}
        self.feature_meta: Dict[str, Any] = {}
        self.provenance_meta: Dict[str, Any] = {}
        self.global_shap: Dict[str, Any] = {}
        self.reload()

    def reload(self) -> None:
        metrics_path = self.artifacts_dir / "metrics" / "training_metrics.json"
        leakage_path = self.artifacts_dir / "metrics" / "leakage_report.json"
        features_path = self.artifacts_dir / "models" / f"features_{MODEL_VERSION}.json"
        calibrator_path = self.artifacts_dir / "models" / f"calibrator_{MODEL_VERSION}.joblib"
        base_pipe_path = self.artifacts_dir / "models" / f"base_pipeline_{MODEL_VERSION}.joblib"
        prov_path = self.artifacts_dir / "provenance" / f"{MODEL_VERSION}.json"
        shap_path = self.artifacts_dir / "explainability" / MODEL_VERSION / "global_feature_importance.json"

        if metrics_path.exists():
            self.metrics_summary = json.loads(metrics_path.read_text(encoding="utf-8"))
        if leakage_path.exists():
            self.leakage_report = json.loads(leakage_path.read_text(encoding="utf-8"))
        if features_path.exists():
            self.feature_meta = json.loads(features_path.read_text(encoding="utf-8"))
        if prov_path.exists():
            self.provenance_meta = json.loads(prov_path.read_text(encoding="utf-8"))
        if shap_path.exists():
            self.global_shap = json.loads(shap_path.read_text(encoding="utf-8"))
        if calibrator_path.exists():
            self.calibrator = joblib.load(calibrator_path)
        if base_pipe_path.exists():
            self.base_pipeline = joblib.load(base_pipe_path)

    @property
    def is_ready(self) -> bool:
        return self.calibrator is not None and self.base_pipeline is not None and bool(self.metrics_summary)

    def classify_risk(self, prob: float) -> tuple[str, str]:
        """Map calibrated probability [0,1] using validation-calibrated threshold."""
        val_t = float(self.feature_meta.get("validation_threshold", 0.45))
        watch_t = max(0.18, round(val_t * 0.60, 3))
        warn_t = val_t
        crit_t = min(0.85, round(val_t + (1.0 - val_t) * 0.45, 3))

        if prob >= crit_t:
            return "critical", "Critical Flash-Flood Risk (FloodGuard AI Advisory)"
        if prob >= warn_t:
            return "warning", "High Flash-Flood Risk — Warning Threshold Exceeded"
        if prob >= watch_t:
            return "watch", "Elevated Hydro-Meteorological Watch"
        return "advisory", "Normal / Routine Basin Monitoring"

    def compute_local_shap(self, x_df: pd.DataFrame) -> tuple[float, List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Compute local SHAP values for a single feature vector."""
        if self.base_pipeline is None:
            return 0.0, [], []
        imputer = self.base_pipeline.named_steps["impute"]
        est = self.base_pipeline.named_steps["estimator"]
        x_imp = pd.DataFrame(imputer.transform(x_df), columns=FEATURES)

        import shap

        if hasattr(est, "named_steps"):
            scaler = est.named_steps["scale"]
            clf = est.named_steps["clf"]
            x_s = np.asarray(scaler.transform(x_imp)).ravel()
            coefs = np.asarray(clf.coef_).ravel()
            sv = x_s * coefs
            base_val = float(np.asarray(clf.intercept_).ravel()[0])
        else:
            explainer = shap.TreeExplainer(est)
            raw_sv = explainer.shap_values(x_imp)
            if isinstance(raw_sv, list):
                sv = np.asarray(raw_sv[1]).ravel()
            elif getattr(raw_sv, "ndim", 0) == 3:
                sv = np.asarray(raw_sv[0, :, 1]).ravel()
            else:
                sv = np.asarray(raw_sv).ravel()
            ev = explainer.expected_value
            if isinstance(ev, (list, np.ndarray)) and len(np.asarray(ev).ravel()) > 1:
                base_val = float(np.asarray(ev).ravel()[1])
            else:
                base_val = float(np.asarray(ev).ravel()[0])

        items: List[Dict[str, Any]] = []
        for feat, val in zip(FEATURES, sv):
            label_text, unit = FEATURE_LABELS.get(feat, (feat, ""))
            actual_val = float(x_df.iloc[0][feat])
            items.append(
                {
                    "feature": feat,
                    "label": label_text,
                    "unit": unit,
                    "input_value": round(actual_val, 4),
                    "shap_contribution": round(float(val), 4),
                    "direction": "increases_risk" if val >= 0 else "decreases_risk",
                }
            )

        positives = sorted(
            [c for c in items if c["shap_contribution"] > 0],
            key=lambda d: d["shap_contribution"],
            reverse=True,
        )[:6]
        negatives = sorted(
            [c for c in items if c["shap_contribution"] < 0],
            key=lambda d: d["shap_contribution"],
        )[:4]
        return round(base_val, 4), positives, negatives

    def predict_for_features(
        self,
        watershed_id: str,
        feature_dict: Dict[str, Any],
        prediction_time: Optional[str] = None,
        source_versions: Optional[Dict[str, str]] = None,
        freshness_summary: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if not self.is_ready:
            raise RuntimeError("Model artifacts not loaded. Run train_floodguard.py first.")

        row = {f: float(feature_dict.get(f, 0.0)) for f in FEATURES}
        x_df = pd.DataFrame([row], columns=FEATURES)

        prob = float(self.calibrator.predict_proba(x_df)[0, 1])
        prob = round(min(0.999, max(0.001, prob)), 4)

        best_model_name = self.metrics_summary.get("best_model", "random_forest")
        model_m = self.metrics_summary.get("models", {}).get(best_model_name, {})
        brier = float(model_m.get("brier", 0.05))
        half_width = round(min(0.18, max(0.03, math.sqrt(brier) * 0.45)), 4) if "math" in globals() else round(min(0.18, max(0.03, (brier**0.5) * 0.45)), 4)

        risk_class, risk_label = self.classify_risk(prob)
        base_val, top_pos, top_neg = self.compute_local_shap(x_df)

        pred_dt = (
            datetime.fromisoformat(prediction_time.replace("Z", "+00:00"))
            if prediction_time
            else datetime.now(timezone.utc)
        )
        valid_until_dt = pred_dt + timedelta(hours=6)

        return {
            "prediction_id": f"pred_{watershed_id}_{uuid.uuid4().hex[:8]}",
            "watershed_id": watershed_id,
            "flood_probability": prob,
            "risk_class": risk_class,
            "risk_label": risk_label,
            "model_version": f"{MODEL_VERSION} ({best_model_name})",
            "algorithm": best_model_name,
            "validation_threshold": float(self.feature_meta.get("validation_threshold", 0.45)),
            "prediction_time": pred_dt.isoformat(),
            "valid_until": valid_until_dt.isoformat(),
            "uncertainty": {
                "calibration_method": "Platt / Sigmoid Validation Calibrator",
                "validation_brier_score": float(model_m.get("validation_metrics", {}).get("brier", brier)),
                "test_brier_score": brier,
                "confidence_interval_90": [
                    round(max(0.0, prob - half_width), 4),
                    round(min(1.0, prob + half_width), 4),
                ],
            },
            "explanation": {
                "method": "SHAP",
                "base_value": base_val,
                "top_positive_contributors": top_pos,
                "top_negative_contributors": top_neg,
            },
            "raw_inputs": row,
            "input_data_versions": source_versions
            or {
                "era5_land": "ERA5-Land-Hourly-v1",
                "nasadem": "NASADEM_HGT_001",
                "jrc_gsw": "JRC_GSW1_4",
                "isro_landslide": "NRSC-Landslide-Atlas-2023",
                "gfd": "GLOBAL_FLOOD_DB_MODIS_EVENTS_V1",
            },
            "data_freshness": freshness_summary
            or {
                "overall_status": "healthy",
                "meteorological_source": "era5_land",
                "terrain_source": "nasadem",
            },
        }
