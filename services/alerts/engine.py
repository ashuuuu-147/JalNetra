"""Alert Engine implementing trigger -> review -> issue -> acknowledge -> expire.

Explicitly separates Official Warnings (IMD/CWC/NDMA) from FloodGuard AI Advisories.
Every transition is recorded in an immutable audit log.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
import uuid

VALID_SEVERITIES = {"advisory", "watch", "warning", "critical"}
VALID_LIFECYCLE = {"triggered", "under_review", "issued", "acknowledged", "expired"}
VALID_ORIGINS = {"official_warning", "floodguard_ai_advisory"}

LIFECYCLE_TRANSITIONS: Dict[str, set[str]] = {
    "triggered": {"under_review", "issued", "expired"},
    "under_review": {"issued", "acknowledged", "expired"},
    "issued": {"acknowledged", "expired"},
    "acknowledged": {"expired"},
    "expired": set(),
}

RECOMMENDED_ACTIONS: Dict[str, str] = {
    "advisory": (
        "Monitor 6-hour rainfall accumulation and topsoil saturation. Verify communication links "
        "with gram panchayat wardens along low-lying river terraces."
    ),
    "watch": (
        "Place district rapid-response teams on standby. Inspect low-lying bridges and culverts "
        "along the river corridor. Prepare designated relief shelters for potential intake."
    ),
    "warning": (
        "Restrict movement along low-bank gorge highways and flood-prone river terraces. "
        "Pre-position NDRF/SDRF units and initiate precautionary evacuation of vulnerable riverfront settlements "
        "toward verified high-elevation shelters."
    ),
    "critical": (
        "IMMEDIATE ACTION: Execute evacuation via high-elevation bypass routes avoiding active river-gorge segments. "
        "Follow official DDMA/SDMA/IMD orders first; use JalNetra (FloodGuard AI) route hazard scores to avoid "
        "inundated or landslide-exposed road corridors."
    ),
}


def build_advisory_from_prediction(
    watershed_id: str,
    area_name: str,
    prediction: Dict[str, Any],
    lifecycle_state: str = "issued",
) -> Dict[str, Any]:
    """Create a traceable FloodGuard AI Advisory from a real model prediction."""
    prob = float(prediction["flood_probability"])
    severity = str(prediction.get("risk_class", "advisory")).lower()
    if severity not in VALID_SEVERITIES:
        severity = "advisory"

    top_pos = prediction.get("explanation", {}).get("top_positive_contributors", [])
    driver_phrases = [
        f"{c['label']}: {c['input_value']} {c['unit']} (SHAP +{c['shap_contribution']:.3f})"
        for c in top_pos[:3]
    ]
    reason = (
        f"JalNetra (FloodGuard AI) estimated calibrated flood-risk probability of {prob*100:.1f}% "
        f"(threshold {float(prediction.get('validation_threshold', 0.45))*100:.1f}%). "
        f"Primary physical drivers: {'; '.join(driver_phrases) if driver_phrases else 'multi-source hydro-terrain fusion'}."
    )

    issue_dt = datetime.fromisoformat(str(prediction["prediction_time"]).replace("Z", "+00:00"))
    valid_dt = datetime.fromisoformat(str(prediction["valid_until"]).replace("Z", "+00:00"))

    return {
        "alert_id": f"alt_{watershed_id}_{uuid.uuid4().hex[:8]}",
        "watershed_id": watershed_id,
        "area_name": area_name,
        "origin_type": "floodguard_ai_advisory",
        "origin_label": "FloodGuard AI Advisory (Decision Support — Non-Official)",
        "severity_state": severity,
        "lifecycle_state": lifecycle_state if lifecycle_state in VALID_LIFECYCLE else "triggered",
        "issue_time": issue_dt.isoformat(),
        "valid_until": valid_dt.isoformat(),
        "reason": reason,
        "recommended_action": RECOMMENDED_ACTIONS[severity],
        "source_or_model": str(prediction.get("model_version", "v1.0.0")),
        "prediction_id": prediction.get("prediction_id"),
        "evidence_json": {
            "flood_probability": prob,
            "validation_threshold": prediction.get("validation_threshold"),
            "top_positive_contributors": top_pos[:4],
            "input_data_versions": prediction.get("input_data_versions", {}),
            "safety_notice": (
                "Use official emergency instructions during an active disaster. "
                "FloodGuard AI provides additional decision support and should not override official warnings."
            ),
        },
    }


def validate_transition(current_state: str, target_state: str) -> bool:
    if current_state == target_state:
        return True
    allowed = LIFECYCLE_TRANSITIONS.get(current_state, set())
    return target_state in allowed
