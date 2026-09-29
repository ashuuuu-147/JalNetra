export type ScreenId =
  | 'dashboard'
  | 'map'
  | 'area_detail'
  | 'replay'
  | 'alerts'
  | 'evacuation'
  | 'sensors'
  | 'provenance'
  | 'evaluation'
  | 'public';

export interface AreaSummary {
  watershed_id: string;
  name: string;
  basin: string;
  district: string;
  state: string;
  centroid_lat: number;
  centroid_lon: number;
  area_sq_km: number;
  mean_elevation_m: number;
  mean_slope_deg: number;
  flood_probability: number;
  risk_class: 'advisory' | 'watch' | 'warning' | 'critical';
  risk_label: string;
  rain_24h_mm: number;
  rain_6h_mm: number;
  soil_water_l1: number;
  observation_time: string;
  event_id: string;
  step_index: number;
  total_steps: number;
}

export interface ShapContributor {
  feature: string;
  label: string;
  unit: string;
  input_value: number;
  shap_contribution: number;
  direction: 'increases_risk' | 'decreases_risk';
}

export interface AreaRiskDetail {
  watershed: {
    watershed_id: string;
    name: string;
    basin: string;
    district: string;
    state: string;
    centroid_lat: number;
    centroid_lon: number;
    area_sq_km: number;
  };
  replay_context: {
    event_id: string;
    step_index: number;
    total_steps: number;
    observation_time: string;
  };
  official_warning_status: {
    origin_type: string;
    status: string;
    bulletin_label: string;
    note: string;
  };
  floodguard_advisory: {
    origin_type: string;
    label: string;
    risk_class: string;
    risk_label: string;
    recommended_action: string;
    statement: string;
  };
  prediction: {
    prediction_id: string;
    watershed_id: string;
    flood_probability: number;
    risk_class: string;
    risk_label: string;
    model_version: string;
    algorithm: string;
    validation_threshold: number;
    prediction_time: string;
    valid_until: string;
    uncertainty: {
      calibration_method: string;
      validation_brier_score: number;
      test_brier_score: number;
      confidence_interval_90: [number, number];
    };
    explanation: {
      method: string;
      base_value: number;
      top_positive_contributors: ShapContributor[];
      top_negative_contributors: ShapContributor[];
    };
    raw_inputs: Record<string, number>;
    input_data_versions: Record<string, string>;
    data_freshness: Record<string, any>;
  };
  rainfall_windows: Record<string, any>;
  soil_and_runoff: Record<string, any>;
  terrain_and_hazard_context: Record<string, any>;
  river_and_sensor_state: {
    cwc_station_name: string;
    cwc_live_status: string;
    cwc_status_message: string;
    cwc_warning_level_m: number;
    cwc_danger_level_m: number;
    river_level_m: number | null;
    iot_devices_registered: number;
    iot_readings_count: number;
    latest_iot_readings: Array<{
      reading_id: string;
      device_id: string;
      sensor_type: string;
      value: number;
      unit: string;
      timestamp: string;
      quality_flag: string;
    }>;
  };
}

export interface AlertItem {
  alert_id: string;
  watershed_id: string;
  area_name: string;
  origin_type: 'official_warning' | 'floodguard_ai_advisory';
  origin_badge: string;
  severity_state: 'advisory' | 'watch' | 'warning' | 'critical';
  lifecycle_state: 'triggered' | 'under_review' | 'issued' | 'acknowledged' | 'expired';
  issue_time: string;
  valid_until: string;
  reason: string;
  recommended_action: string;
  source_or_model: string;
  evidence: Record<string, any>;
  acknowledgements: Array<{
    ack_id: string;
    acknowledged_by: string;
    acknowledged_role: string;
    acknowledged_at: string;
    notes?: string;
    new_lifecycle_state: string;
  }>;
}
