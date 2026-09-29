# Model Card — JalNetra (FloodGuard AI) Flash-Flood Risk Engine (`v1.0.0`)

## 1. Model Details
- **Model Version**: `v1.0.0`
- **Selected Production Architecture**: Calibrated `XGBoost` (`XGBClassifier` + `CalibratedClassifierCV` sigmoid calibration on temporal validation split)
- **Benchmarked Candidates**:
  1. `logistic_regression` (L2-regularized baseline with `StandardScaler`)
  2. `random_forest` (`RandomForestClassifier`, 300 trees, balanced subsample)
  3. `xgboost` (`XGBClassifier`, 300 trees, depth 5, learning rate 0.05)
  4. `lightgbm` (`LGBMClassifier`, 300 trees, depth 5, learning rate 0.05)
- **Training Script**: `train_floodguard.py`
- **Inference Engine**: `services/ml/inference.py`
- **Artifacts Directory**: `artifacts/models/`, `artifacts/metrics/`, `artifacts/explainability/v1.0.0/`, `artifacts/provenance/v1.0.0.json`

---

## 2. Intended Use & Safety Notice
- **Intended Use**: Hyperlocal flash-flood risk estimation (`0.0 – 1.0` calibrated probability and `LOW / MODERATE / HIGH / CRITICAL` classification) at the sub-catchment scale in hilly terrain, accompanied by local SHAP attributions and decision-support advisories for District Disaster Management Authorities (DDMA / SEOC).
- **Mandatory Safety Disclaimer**:
  > *FloodGuard AI estimates flood risk from multi-source observations and provides explainable, hyperlocal decision support. It does not predict floods with certainty and does not replace official warnings issued by IMD, CWC, NDMA, or SDMA.*

---

## 3. Stored Evaluation Metrics (`artifacts/metrics/training_metrics.json`)

All models were trained exclusively on `2005–2017` events, calibrated and selected on `2018–2020` events, and evaluated on held-out `2021–2022` events.

### Validation Split (`2018–2020`, `n = 368`)
| Model | PR-AUC | ROC-AUC | Precision | Recall | F1 | Brier Score | False-Alarm Rate |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **XGBoost (Selected)** | **0.9774** | **0.9963** | **0.9032** | **0.8750** | **0.8889** | **0.0252** | **0.0179** |
| LightGBM | 0.9772 | 0.9963 | 0.8788 | 0.9062 | 0.8923 | 0.0250 | 0.0238 |
| Random Forest | 0.9756 | 0.9958 | 0.8611 | 0.9688 | 0.9118 | 0.0294 | 0.0298 |
| Logistic Regression | 0.8685 | 0.9854 | 0.6522 | 0.9375 | 0.7692 | 0.0566 | 0.0952 |

### Held-Out Test Split (`2021–2022`, `n = 288`, Calibrated Selected Model)
| Evaluation Mode | PR-AUC | ROC-AUC | Precision | Recall | F1 | Brier Score | False-Alarm Rate |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Calibrated XGBoost (`v1.0.0`)** | **0.9546** | **0.9890** | **0.9259** | **0.6250** | **0.7463** | **0.0439** | **0.0081** |
| Uncalibrated XGBoost (`v1.0.0`) | 0.9546 | 0.9890 | 0.9032 | 0.7000 | 0.7887 | 0.0398 | 0.0121 |

---

## 4. Leakage Prevention & Audit (`artifacts/metrics/leakage_report.json`)
The automated leakage audit enforces four strict checks before saving model artifacts:
1. **Zero Event Overlap (`event_overlap_count == 0`)**: Every flood event ID appears in exactly one split (`train`, `val`, or `test`).
2. **Strict Temporal Ordering (`strict_temporal_order == true`)**: Max training timestamp (`2017-08-15`) < Min validation timestamp (`2018-08-11`), and Max validation timestamp (`2020-07-28`) < Min test timestamp (`2021-07-11`).
3. **Causal Feature Window (`future_feature_leakage_excluded == true`)**: All rolling precipitation and soil moisture features use only observations in $[t - W, t]$.
4. **No Post-Event Target Columns (`forbidden_columns_present == []`)**: Post-event damage, casualty, or SAR inundation extent columns are strictly excluded from the feature list.

---

## 5. Explainability (Global & Local SHAP)
- **Global Top Drivers (`artifacts/explainability/v1.0.0/global_feature_importance.json`)**:
  1. `rain_forecast_3h_mm`
  2. `rain_intensity_max_3h_mm`
  3. `effective_rain_6h_mm`
  4. `rain_6h_mm`
  5. `rain_3h_mm`
  6. `rain_24h_mm`
  7. `rain_zscore_24h`
  8. `soil_moisture_24h_change`
- **Local Explainability**: For every sub-catchment prediction, `services/ml/inference.py` computes exact local `shap.TreeExplainer` values on the region's actual feature vector so operators can inspect the top positive and negative physical contributors.
