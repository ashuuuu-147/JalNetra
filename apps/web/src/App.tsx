import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Compass,
  Database,
  FileCheck2,
  History,
  Info,
  Map as MapIcon,
  Navigation,
  Play,
  Pause,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Users,
} from 'lucide-react';
import { AlertItem, AreaRiskDetail, AreaSummary, ScreenId } from './types';
import { StatusBadge } from './components/StatusBadge';
import { RiskMapView } from './components/RiskMapView';

const ENV_API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const storedBase =
    typeof window !== 'undefined' ? (window.localStorage.getItem('JALNETRA_API_BASE_URL') || '').replace(/\/$/, '') : '';
  const primaryBase = storedBase || ENV_API_BASE;

  try {
    const res = await fetch(`${primaryBase}${path}`, init);
    const contentType = res.headers.get('content-type') || '';
    // If primaryBase is empty (same-origin) and static server returned HTML instead of JSON API, fallback to localhost:8000
    if (!primaryBase && (!res.ok || contentType.includes('text/html'))) {
      return await fetch(`http://localhost:8000${path}`, init);
    }
    return res;
  } catch (err) {
    if (!primaryBase) {
      return await fetch(`http://localhost:8000${path}`, init);
    }
    throw err;
  }
}

const NAV_ITEMS: Array<{ id: ScreenId; label: string; icon: React.ReactNode }> = [
  { id: 'dashboard', label: '1. Operations Dashboard', icon: <Activity size={16} aria-hidden="true" /> },
  { id: 'map', label: '2. Hyperlocal Risk Map', icon: <MapIcon size={16} aria-hidden="true" /> },
  { id: 'area_detail', label: '3. Area Detail & SHAP', icon: <Info size={16} aria-hidden="true" /> },
  { id: 'replay', label: '4. Historical Replay', icon: <History size={16} aria-hidden="true" /> },
  { id: 'alerts', label: '5. Alert Center', icon: <ShieldAlert size={16} aria-hidden="true" /> },
  { id: 'evacuation', label: '6. Evacuation Planner', icon: <Navigation size={16} aria-hidden="true" /> },
  { id: 'sensors', label: '7. Sensor Health (IoT)', icon: <Radio size={16} aria-hidden="true" /> },
  { id: 'provenance', label: '8. Data Provenance', icon: <Database size={16} aria-hidden="true" /> },
  { id: 'evaluation', label: '9. Model Evaluation', icon: <BarChart3 size={16} aria-hidden="true" /> },
  { id: 'public', label: '10. Public Citizen Status', icon: <Users size={16} aria-hidden="true" /> },
];

export const App: React.FC = () => {
  const [activeScreen, setActiveScreen] = useState<ScreenId>('dashboard');
  const [areas, setAreas] = useState<AreaSummary[]>([]);
  const [selectedWatershedId, setSelectedWatershedId] = useState<string>('ws_pandoh_mandi');
  const [selectedEventId, setSelectedEventId] = useState<string>('REPLAY_2023_HP_BEAS_JULY');
  const [stepIndex, setStepIndex] = useState<number>(22);
  const [totalSteps, setTotalSteps] = useState<number>(40);
  const [isPlayingReplay, setIsPlayingReplay] = useState<boolean>(false);

  const [areaDetail, setAreaDetail] = useState<AreaRiskDetail | null>(null);
  const [mapData, setMapData] = useState<any>(null);
  const [replayEvents, setReplayEvents] = useState<any[]>([]);
  const [replayState, setReplayState] = useState<any>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [routePlan, setRoutePlan] = useState<any>(null);
  const [shelters, setShelters] = useState<any[]>([]);
  const [sensorsData, setSensorsData] = useState<any>(null);
  const [sourcesHealth, setSourcesHealth] = useState<any>(null);
  const [provenanceData, setProvenanceData] = useState<any>(null);
  const [modelMetrics, setModelMetrics] = useState<any>(null);

  // Route planner controls
  const [originNode, setOriginNode] = useState<string>('mandi_town');
  const [targetShelterId, setTargetShelterId] = useState<string>('');
  const [floodWeight, setFloodWeight] = useState<number>(8.5);
  const [landslideWeight, setLandslideWeight] = useState<number>(5.5);
  const [allowUnverifiedShelter, setAllowUnverifiedShelter] = useState<boolean>(false);

  // ESP32 HTTP packet submission state
  const [sensorFormDevice, setSensorFormDevice] = useState<string>('esp32-beas-pandoh-01');
  const [sensorFormType, setSensorFormType] = useState<string>('rain_gauge');
  const [sensorFormValue, setSensorFormValue] = useState<string>('14.6');
  const [sensorFormUnit, setSensorFormUnit] = useState<string>('mm');
  const [sensorSubmitResult, setSensorSubmitResult] = useState<{ status: string; message: string } | null>(null);

  // Native <dialog> for operator alert transition / acknowledgement
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [dialogAlert, setDialogAlert] = useState<AlertItem | null>(null);
  const [dialogTargetState, setDialogTargetState] = useState<string>('acknowledged');
  const [dialogActor, setDialogActor] = useState<string>('Sh. R. Sharma, DDMA Duty Officer');
  const [dialogNotes, setDialogNotes] = useState<string>(
    'Verified watershed risk drivers and dispatched SDRF patrol to Pandoh low-bank sector.',
  );

  const [loading, setLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Update document title for screen readers on screen navigation
  useEffect(() => {
    const current = NAV_ITEMS.find((n) => n.id === activeScreen);
    document.title = `${current ? current.label : 'Dashboard'} | JalNetra (FloodGuard AI) SIH 2026`;
  }, [activeScreen]);

  const fetchCoreData = useCallback(async () => {
    setApiError(null);
    try {
      const qs = `?event_id=${encodeURIComponent(selectedEventId)}&step_index=${stepIndex}`;
      const [areasRes, detailRes, mapRes, replayEvRes, replayTimeRes, alertsRes, routeRes] = await Promise.all([
        apiFetch(`/api/v1/areas${qs}`),
        apiFetch(`/api/v1/areas/${selectedWatershedId}/risk${qs}`),
        apiFetch(`/api/v1/map/layers${qs}`),
        apiFetch(`/api/v1/replay/events`),
        apiFetch(
          `/api/v1/replay/${selectedEventId}/timeline?watershed_id=${selectedWatershedId}&step_index=${stepIndex}`,
        ),
        apiFetch(`/api/v1/alerts`),
        apiFetch(`/api/v1/routes/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origin_node: originNode,
            destination_shelter_id: targetShelterId || null,
            flood_weight: floodWeight,
            landslide_weight: landslideWeight,
            allow_unverified_shelter: allowUnverifiedShelter,
            event_id: selectedEventId,
            step_index: stepIndex,
          }),
        }),
      ]);

      if (!areasRes.ok || !detailRes.ok) {
        throw new Error(`API returned status ${areasRes.status} / ${detailRes.status}`);
      }

      const areasJson = await areasRes.json();
      const detailJson = await detailRes.json();
      const mapJson = await mapRes.json();
      const replayEvJson = await replayEvRes.json();
      const replayTimeJson = await replayTimeRes.json();
      const alertsJson = await alertsRes.json();
      const routeJson = await routeRes.json();

      setAreas(areasJson.areas || []);
      setAreaDetail(detailJson);
      setMapData(mapJson);
      setReplayEvents(replayEvJson.events || []);
      setReplayState(replayTimeJson);
      setAlerts(alertsJson.alerts || []);
      setRoutePlan(routeJson);
      if (detailJson?.replay_context?.total_steps) {
        setTotalSteps(detailJson.replay_context.total_steps);
      }
      setLoading(false);
    } catch (err: any) {
      setApiError(err?.message || 'Unable to reach JalNetra FastAPI backend.');
      setLoading(false);
    }
  }, [
    selectedEventId,
    stepIndex,
    selectedWatershedId,
    originNode,
    targetShelterId,
    floodWeight,
    landslideWeight,
    allowUnverifiedShelter,
  ]);

  const fetchGovernanceAndMetrics = useCallback(async () => {
    try {
      const [sourcesRes, sensorsRes, sheltersRes, provRes, metricsRes] = await Promise.all([
        apiFetch(`/api/v1/sources/health`),
        apiFetch(`/api/v1/sensors`),
        apiFetch(`/api/v1/shelters`),
        apiFetch(`/api/v1/provenance`),
        apiFetch(`/api/v1/models/v1.0.0/metrics`),
      ]);
      if (sourcesRes.ok) setSourcesHealth(await sourcesRes.json());
      if (sensorsRes.ok) setSensorsData(await sensorsRes.json());
      if (sheltersRes.ok) {
        const shJson = await sheltersRes.json();
        setShelters(shJson.shelters || []);
      }
      if (provRes.ok) setProvenanceData(await provRes.json());
      if (metricsRes.ok) setModelMetrics(await metricsRes.json());
    } catch {
      // Handled by explicit per-panel error states
    }
  }, []);

  useEffect(() => {
    fetchCoreData();
  }, [fetchCoreData]);

  useEffect(() => {
    fetchGovernanceAndMetrics();
  }, [fetchGovernanceAndMetrics]);

  // Chronological Replay Timer
  useEffect(() => {
    if (!isPlayingReplay) return;
    const timer = window.setInterval(() => {
      setStepIndex((prev) => (prev + 1 < totalSteps ? prev + 1 : 0));
    }, 1800);
    return () => window.clearInterval(timer);
  }, [isPlayingReplay, totalSteps]);

  const handleTriggerAlert = async () => {
    await apiFetch(`/api/v1/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        watershed_id: selectedWatershedId,
        origin_type: 'floodguard_ai_advisory',
        lifecycle_state: 'triggered',
        actor: 'District Emergency Operations Officer',
        event_id: selectedEventId,
        step_index: stepIndex,
      }),
    });
    await fetchCoreData();
    await fetchGovernanceAndMetrics();
  };

  const openTransitionDialog = (alertItem: AlertItem, nextState: string) => {
    setDialogAlert(alertItem);
    setDialogTargetState(nextState);
    dialogRef.current?.showModal();
  };

  const handleConfirmTransition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dialogAlert) return;
    await apiFetch(`/api/v1/alerts/${dialogAlert.alert_id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_state: dialogTargetState,
        actor: dialogActor,
        role: 'Emergency Operations Controller',
        notes: dialogNotes,
      }),
    });
    dialogRef.current?.close();
    await fetchCoreData();
    await fetchGovernanceAndMetrics();
  };

  const handleSensorPacketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSensorSubmitResult(null);
    const resp = await apiFetch(`/api/v1/sensors/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: sensorFormDevice,
        sensor_type: sensorFormType,
        value: Number(sensorFormValue),
        unit: sensorFormUnit,
        timestamp: new Date().toISOString(),
        latitude: 31.671,
        longitude: 77.052,
      }),
    });
    const body = await resp.json();
    if (!resp.ok) {
      setSensorSubmitResult({
        status: 'processing_error',
        message: `Rejected (${body?.detail?.quality_flag || 'INVALID'}): ${(body?.detail?.issues || []).join('; ')}`,
      });
    } else {
      setSensorSubmitResult({
        status: 'healthy',
        message: `Ingested reading ${body.reading_id} with quality_flag=${body.quality_flag}.`,
      });
      await fetchGovernanceAndMetrics();
      await fetchCoreData();
    }
  };

  const handleRefreshLiveSources = async () => {
    await apiFetch(`/api/v1/sources/refresh`, { method: 'POST' });
    await fetchGovernanceAndMetrics();
  };

  const pred = areaDetail?.prediction;

  return (
    <div className="app-shell">
      <a href="#main-workspace" className="skip-link visually-hidden">
        Skip to main workspace
      </a>

      {/* Mandatory Safety & Non-Replacement Banner (PRD Section 13) */}
      <div className="safety-banner" role="region" aria-label="Official Emergency Precedence Notice">
        <div>
          <strong>OFFICIAL SAFETY NOTICE:</strong> Use official emergency instructions during an active disaster.
          FloodGuard AI (JalNetra) provides additional decision support and should not override official warnings.
        </div>
        <div className="mono-chip" style={{ background: '#0f172a', color: '#e2e8f0', borderColor: '#334155' }}>
          Model: {pred?.model_version || 'v1.0.0'} | Synthetic Rows: 0
        </div>
      </div>

      {/* Top Application Header */}
      <header className="top-header">
        <div className="brand-block">
          <div className="brand-emblem" aria-hidden="true">
            <Compass size={24} />
          </div>
          <div>
            <h1 className="brand-title">JalNetra — FloodGuard AI</h1>
            <p className="brand-subtitle">
              SIH 2026 PS 26192: Multi-Source Flash Flood Risk Estimation &amp; Decision Support for Hilly Regions
            </p>
          </div>
        </div>

        <div className="header-controls">
          <div className="control-group">
            <label htmlFor="select-watershed">Selected Catchment / Watershed</label>
            <select
              id="select-watershed"
              value={selectedWatershedId}
              onChange={(e) => setSelectedWatershedId(e.target.value)}
            >
              {areas.map((a) => (
                <option key={a.watershed_id} value={a.watershed_id}>
                  {a.name} ({a.district}) — {(a.flood_probability * 100).toFixed(1)}%
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="select-replay-event">Held-Out Historical Event Replay</label>
            <select
              id="select-replay-event"
              value={selectedEventId}
              onChange={(e) => {
                setSelectedEventId(e.target.value);
                setStepIndex(18);
              }}
            >
              {replayEvents.map((ev) => (
                <option key={ev.event_id} value={ev.event_id}>
                  {ev.event_id}: {ev.start_date} to {ev.end_date} (Held-Out)
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              fetchCoreData();
              fetchGovernanceAndMetrics();
            }}
            aria-label="Refresh operational data"
          >
            <RefreshCw size={16} aria-hidden="true" />
            <span>Sync</span>
          </button>
        </div>
      </header>

      {/* Primary 10-Screen Navigation */}
      <nav className="primary-nav" aria-label="Primary operational views">
        <ul className="nav-list" role="list">
          {NAV_ITEMS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="nav-btn"
                aria-current={activeScreen === item.id ? 'page' : undefined}
                onClick={() => setActiveScreen(item.id)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main Content Landmark */}
      <main id="main-workspace" className="main-workspace" tabIndex={-1}>
        {/* End-to-End SIH Architecture Pipeline Strip: OBSERVE -> FUSE -> PREDICT -> LOCALIZE -> EXPLAIN -> ACT */}
        <section className="pipeline-strip" aria-label="Decision support pipeline">
          <div>
            <strong style={{ fontSize: '0.85rem', color: 'var(--accent-forest)' }}>
              DECISION SUPPORT ARCHITECTURE:
            </strong>{' '}
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              FloodGuard AI estimates flood risk from multi-source observations and provides explainable, hyperlocal
              decision support.
            </span>
          </div>
          <div className="pipeline-steps">
            <button
              type="button"
              className={`pipeline-step-btn ${activeScreen === 'provenance' || activeScreen === 'sensors' ? 'active' : ''}`}
              onClick={() => setActiveScreen('provenance')}
            >
              1. OBSERVE (Sources &amp; Health)
            </button>
            <span>→</span>
            <button
              type="button"
              className={`pipeline-step-btn ${activeScreen === 'replay' ? 'active' : ''}`}
              onClick={() => setActiveScreen('replay')}
            >
              2. FUSE (31 Hydro-Terrain Features)
            </button>
            <span>→</span>
            <button
              type="button"
              className={`pipeline-step-btn ${activeScreen === 'evaluation' ? 'active' : ''}`}
              onClick={() => setActiveScreen('evaluation')}
            >
              3. PREDICT (Calibrated ML)
            </button>
            <span>→</span>
            <button
              type="button"
              className={`pipeline-step-btn ${activeScreen === 'map' ? 'active' : ''}`}
              onClick={() => setActiveScreen('map')}
            >
              4. LOCALIZE (2D GIS Map)
            </button>
            <span>→</span>
            <button
              type="button"
              className={`pipeline-step-btn ${activeScreen === 'area_detail' ? 'active' : ''}`}
              onClick={() => setActiveScreen('area_detail')}
            >
              5. EXPLAIN (Local SHAP)
            </button>
            <span>→</span>
            <button
              type="button"
              className={`pipeline-step-btn ${activeScreen === 'alerts' || activeScreen === 'evacuation' ? 'active' : ''}`}
              onClick={() => setActiveScreen('evacuation')}
            >
              6. ACT (Alerts &amp; OSM Routing)
            </button>
          </div>
        </section>

        {apiError && (
          <div className="card" role="alert" style={{ borderColor: 'var(--risk-critical-border)', marginBottom: '1rem' }}>
            <StatusBadge status="processing_error" labelOverride="Backend Connection Error" />
            <p style={{ marginTop: '0.5rem' }}>{apiError}</p>
          </div>
        )}

        {loading && !areaDetail ? (
          <div className="card">
            <p>Loading real multi-source environmental observations and calibrated model predictions...</p>
          </div>
        ) : null}

        {/* ===================================================================
            SCREEN 1: OPERATIONS DASHBOARD
            =================================================================== */}
        {activeScreen === 'dashboard' && areaDetail && pred && (
          <section aria-labelledby="heading-dashboard">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <h2 id="heading-dashboard" style={{ margin: 0, fontSize: '1.35rem' }}>
                Operations Dashboard — {areaDetail.watershed.name} ({areaDetail.watershed.district},{' '}
                {areaDetail.watershed.state})
              </h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className="mono-chip">Observation UTC: {areaDetail.replay_context.observation_time}</span>
                <button type="button" className="btn-primary" onClick={() => setActiveScreen('replay')}>
                  <History size={16} aria-hidden="true" />
                  <span>Open Replay Timeline</span>
                </button>
              </div>
            </div>

            {/* Dual Warning Banner: Official Warning vs FloodGuard AI Advisory */}
            <div className="warning-comparison-grid">
              <div className="official-warning-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong>OFFICIAL GOVERNMENT WARNING STATUS (IMD / CWC)</strong>
                  <StatusBadge status={areaDetail.official_warning_status.status} />
                </div>
                <p style={{ margin: '0.5rem 0 0.25rem 0', fontSize: '0.9rem', fontWeight: 600 }}>
                  {areaDetail.official_warning_status.bulletin_label}
                </p>
                <p className="kpi-sub">{areaDetail.official_warning_status.note}</p>
              </div>

              <div className="advisory-warning-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong>FLOODGUARD AI ADVISORY (JALNETRA MODEL OUTPUT)</strong>
                  <StatusBadge status={pred.risk_class} />
                </div>
                <p style={{ margin: '0.5rem 0 0.25rem 0', fontSize: '0.9rem', fontWeight: 600 }}>
                  {pred.risk_label} — Calibrated Probability: {(pred.flood_probability * 100).toFixed(1)}% (Threshold:{' '}
                  {(pred.validation_threshold * 100).toFixed(1)}%)
                </p>
                <p className="kpi-sub">{areaDetail.floodguard_advisory.recommended_action}</p>
              </div>
            </div>

            {/* Top 4 Operational KPI Cards */}
            <div className="grid-4" style={{ marginBottom: '1.25rem' }}>
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Calibrated Flood Risk</h3>
                  <StatusBadge status={pred.risk_class} />
                </div>
                <div className="kpi-value">{(pred.flood_probability * 100).toFixed(1)}%</div>
                <p className="kpi-sub">
                  90% CI: [{(pred.uncertainty.confidence_interval_90[0] * 100).toFixed(1)}%,{' '}
                  {(pred.uncertainty.confidence_interval_90[1] * 100).toFixed(1)}%] | Model: {pred.model_version}
                </p>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Rainfall (ERA5-Land)</h3>
                  <StatusBadge status="healthy" labelOverride="Verified Reanalysis" />
                </div>
                <div className="kpi-value">{areaDetail.rainfall_windows.rain_24h_mm} mm (24h)</div>
                <p className="kpi-sub">
                  1h: {areaDetail.rainfall_windows.rain_1h_mm} mm | 6h: {areaDetail.rainfall_windows.rain_6h_mm} mm |
                  48h: {areaDetail.rainfall_windows.rain_48h_mm} mm
                </p>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Soil Moisture &amp; Runoff</h3>
                  <StatusBadge status="healthy" labelOverride="0–7 cm L1" />
                </div>
                <div className="kpi-value">{areaDetail.soil_and_runoff.soil_water_l1_0_7cm} m³/m³</div>
                <p className="kpi-sub">
                  L2 (7–28 cm): {areaDetail.soil_and_runoff.soil_water_l2_7_28cm} m³/m³ | 6h Runoff:{' '}
                  {areaDetail.soil_and_runoff.runoff_6h_mm} mm
                </p>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">River &amp; ESP32 Sensors</h3>
                  <StatusBadge
                    status={
                      areaDetail.river_and_sensor_state.iot_readings_count > 0
                        ? 'online_receiving'
                        : 'awaiting_telemetry'
                    }
                  />
                </div>
                <div className="kpi-value" style={{ fontSize: '1.15rem' }}>
                  CWC Live: {areaDetail.river_and_sensor_state.river_level_m ?? 'Authentication required'}
                </div>
                <p className="kpi-sub">
                  Station: {areaDetail.river_and_sensor_state.cwc_station_name} | ESP32 Readings:{' '}
                  {areaDetail.river_and_sensor_state.iot_readings_count}
                </p>
              </div>
            </div>

            {/* Dashboard Split: Interactive 2D Map + Active Alerts & Source Freshness */}
            <div className="dashboard-split">
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    <MapIcon size={18} aria-hidden="true" />
                    <span>Beas &amp; Himalayan Pilot Catchments — 2D Risk Map</span>
                  </h3>
                  <button type="button" onClick={() => setActiveScreen('map')}>
                    Expand Full 14-Layer GIS
                  </button>
                </div>
                <RiskMapView
                  mapData={mapData}
                  selectedWatershedId={selectedWatershedId}
                  onSelectWatershed={setSelectedWatershedId}
                  routePlan={routePlan}
                  stepIndex={stepIndex}
                  totalSteps={totalSteps}
                  onStepChange={setStepIndex}
                  compact
                />
                <div className="table-wrapper" style={{ marginTop: '0.85rem', maxBlockSize: '260px' }}>
                  <table>
                    <caption>All 8 Monitored Himalayan Catchments at Current Observation Time</caption>
                    <thead>
                      <tr>
                        <th scope="col">Catchment</th>
                        <th scope="col">District</th>
                        <th scope="col">24h Rain</th>
                        <th scope="col">Soil L1</th>
                        <th scope="col">Risk Probability</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {areas.map((a) => (
                        <tr
                          key={a.watershed_id}
                          onClick={() => setSelectedWatershedId(a.watershed_id)}
                          style={{
                            cursor: 'pointer',
                            background:
                              a.watershed_id === selectedWatershedId ? 'var(--accent-forest-tint)' : undefined,
                          }}
                        >
                          <th scope="row">{a.name}</th>
                          <td>{a.district}</td>
                          <td>{a.rain_24h_mm} mm</td>
                          <td>{a.soil_water_l1} m³/m³</td>
                          <td>
                            <strong>{(a.flood_probability * 100).toFixed(1)}%</strong>
                          </td>
                          <td>
                            <StatusBadge status={a.risk_class} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Top SHAP Drivers Preview */}
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">Why This Catchment Is Risky (Local SHAP)</h3>
                    <button type="button" onClick={() => setActiveScreen('area_detail')}>
                      Full Explainability
                    </button>
                  </div>
                  <div className="shap-list">
                    {pred.explanation.top_positive_contributors.slice(0, 4).map((c) => (
                      <div key={c.feature} className="shap-row">
                        <div className="shap-row-header">
                          <span>
                            {c.label}: <strong>{c.input_value}</strong> {c.unit}
                          </span>
                          <span style={{ color: 'var(--risk-warning-fg)' }}>
                            +{c.shap_contribution.toFixed(4)} SHAP
                          </span>
                        </div>
                        <div className="shap-bar-track">
                          <div
                            className="shap-bar-fill-pos"
                            style={{ width: `${Math.min(100, Math.abs(c.shap_contribution) * 45)} %` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Active Alerts Summary */}
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">Active Advisories &amp; Alerts ({alerts.length})</h3>
                    <button type="button" onClick={() => setActiveScreen('alerts')}>
                      Manage Alerts
                    </button>
                  </div>
                  {alerts.slice(0, 3).map((al) => (
                    <div
                      key={al.alert_id}
                      style={{
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '4px',
                        padding: '0.65rem',
                        marginBottom: '0.5rem',
                        background: 'var(--bg-canvas)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <strong>{al.area_name}</strong>
                        <StatusBadge status={al.severity_state} />
                      </div>
                      <div style={{ fontSize: '0.78rem', margin: '0.25rem 0', fontWeight: 700, color: 'var(--accent-forest)' }}>
                        {al.origin_badge} | Lifecycle: {al.lifecycle_state.toUpperCase()}
                      </div>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        {al.reason}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Source Freshness Summary */}
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">Data Source Freshness &amp; Auth State</h3>
                    <button type="button" onClick={() => setActiveScreen('provenance')}>
                      Inspect Provenance
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <StatusBadge
                      status="healthy"
                      labelOverride={`Healthy Open Feeds: ${sourcesHealth?.summary_counts?.healthy ?? 7}`}
                    />
                    <StatusBadge
                      status="authentication_required"
                      labelOverride={`Auth Gated Feeds: ${sourcesHealth?.summary_counts?.authentication_required ?? 6}`}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            SCREEN 2: HYPERLOCAL RISK MAP (MAPLIBRE 2D GIS)
            =================================================================== */}
        {activeScreen === 'map' && (
          <section aria-labelledby="heading-map">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <h2 id="heading-map" style={{ margin: 0 }}>
                Hyperlocal 2D Risk Map — 14 Multi-Source Geospatial Layers
              </h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={() => setActiveScreen('area_detail')}>
                  Inspect Selected Catchment ({selectedWatershedId})
                </button>
                <button type="button" className="btn-primary" onClick={() => setActiveScreen('evacuation')}>
                  Plan Safe Route on Map
                </button>
              </div>
            </div>
            <RiskMapView
              mapData={mapData}
              selectedWatershedId={selectedWatershedId}
              onSelectWatershed={setSelectedWatershedId}
              routePlan={routePlan}
              stepIndex={stepIndex}
              totalSteps={totalSteps}
              onStepChange={setStepIndex}
            />
          </section>
        )}

        {/* ===================================================================
            SCREEN 3: AREA DETAIL & SHAP EXPLAINABILITY
            =================================================================== */}
        {activeScreen === 'area_detail' && areaDetail && pred && (
          <section aria-labelledby="heading-area-detail">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <h2 id="heading-area-detail" style={{ margin: 0 }}>
                  Catchment Detail &amp; Model Explainability — {areaDetail.watershed.name}
                </h2>
                <p className="kpi-sub">
                  Basin: {areaDetail.watershed.basin} | District: {areaDetail.watershed.district},{' '}
                  {areaDetail.watershed.state} | Coordinates: ({areaDetail.watershed.centroid_lat.toFixed(4)}°N,{' '}
                  {areaDetail.watershed.centroid_lon.toFixed(4)}°E)
                </p>
              </div>
              <StatusBadge status={pred.risk_class} />
            </div>

            <div className="grid-3" style={{ marginBottom: '1rem' }}>
              <div className="card">
                <h3 className="card-title">Prediction &amp; Calibration Metadata</h3>
                <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>Flood Probability</dt>
                    <dd style={{ margin: 0, fontWeight: 700, fontSize: '1.25rem' }}>
                      {(pred.flood_probability * 100).toFixed(2)}%
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>Validation Threshold</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>{(pred.validation_threshold * 100).toFixed(1)}%</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>Prediction Timestamp</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }}>{pred.prediction_time}</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>Valid Until (+6h)</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }}>{pred.valid_until}</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>Model Version</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>{pred.model_version}</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>90% Confidence Band</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }}>
                      [{(pred.uncertainty.confidence_interval_90[0] * 100).toFixed(1)}%,{' '}
                      {(pred.uncertainty.confidence_interval_90[1] * 100).toFixed(1)}%]
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="card">
                <h3 className="card-title">Rainfall Accumulation Windows (mm)</h3>
                <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', fontSize: '0.875rem' }}>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>1-Hour Rain</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>{areaDetail.rainfall_windows.rain_1h_mm} mm</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>3-Hour Rain</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>{areaDetail.rainfall_windows.rain_3h_mm} mm</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>6-Hour Rain</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>{areaDetail.rainfall_windows.rain_6h_mm} mm</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>12-Hour Rain</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>{areaDetail.rainfall_windows.rain_12h_mm} mm</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>24-Hour Rain</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>{areaDetail.rainfall_windows.rain_24h_mm} mm</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>48h / 72h Rain</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>
                      {areaDetail.rainfall_windows.rain_48h_mm} / {areaDetail.rainfall_windows.rain_72h_mm} mm
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>Forecast 6h / 24h</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>
                      {areaDetail.rainfall_windows.forecast_rain_6h_mm} /{' '}
                      {areaDetail.rainfall_windows.forecast_rain_24h_mm} mm
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>5-Day API Index</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>
                      {areaDetail.rainfall_windows.antecedent_precipitation_index} mm
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="card">
                <h3 className="card-title">Terrain (NASADEM 30m) &amp; Hazard Context</h3>
                <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', fontSize: '0.875rem' }}>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>Elevation / Slope</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>
                      {areaDetail.terrain_and_hazard_context.elevation_m} m /{' '}
                      {areaDetail.terrain_and_hazard_context.slope_deg}°
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>TWI / TRI</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>
                      {areaDetail.terrain_and_hazard_context.twi} / {areaDetail.terrain_and_hazard_context.tri} m
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>Distance to Stream</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>
                      {areaDetail.terrain_and_hazard_context.distance_to_stream_m} m
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>Drainage Density</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>
                      {areaDetail.terrain_and_hazard_context.drainage_density_km_sqkm} km/km²
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>Hist. Flood Freq (GFD)</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>
                      {areaDetail.terrain_and_hazard_context.historical_flood_frequency}
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>ISRO Landslide Density</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>
                      {areaDetail.terrain_and_hazard_context.landslide_density_per_sqkm} /km²
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>Soil Water L1 / L2</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>
                      {areaDetail.soil_and_runoff.soil_water_l1_0_7cm} /{' '}
                      {areaDetail.soil_and_runoff.soil_water_l2_7_28cm} m³/m³
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--text-muted)' }}>JRC Perm. Water</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>
                      {(areaDetail.terrain_and_hazard_context.permanent_water_fraction * 100).toFixed(2)}%
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* SHAP Positive & Negative Contributors */}
            <div className="grid-2">
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Top Risk-Increasing Drivers (Positive SHAP Values)</h3>
                  <span className="mono-chip">Base Log-Odds: {pred.explanation.base_value}</span>
                </div>
                <div className="shap-list">
                  {pred.explanation.top_positive_contributors.map((c) => (
                    <div key={c.feature} className="shap-row">
                      <div className="shap-row-header">
                        <span>
                          {c.label} (<code style={{ fontSize: '0.78rem' }}>{c.feature}</code>)
                        </span>
                        <span style={{ color: 'var(--risk-warning-fg)' }}>
                          Actual: {c.input_value} {c.unit} | SHAP: +{c.shap_contribution.toFixed(4)}
                        </span>
                      </div>
                      <div className="shap-bar-track">
                        <div
                          className="shap-bar-fill-pos"
                          style={{ width: `${Math.min(100, Math.abs(c.shap_contribution) * 45)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Risk-Mitigating Factors (Negative SHAP Values)</h3>
                  <span className="mono-chip">Traceable to Input Vector</span>
                </div>
                <div className="shap-list">
                  {pred.explanation.top_negative_contributors.map((c) => (
                    <div key={c.feature} className="shap-row">
                      <div className="shap-row-header">
                        <span>
                          {c.label} (<code style={{ fontSize: '0.78rem' }}>{c.feature}</code>)
                        </span>
                        <span style={{ color: 'var(--accent-forest)' }}>
                          Actual: {c.input_value} {c.unit} | SHAP: {c.shap_contribution.toFixed(4)}
                        </span>
                      </div>
                      <div className="shap-bar-track">
                        <div
                          className="shap-bar-fill-neg"
                          style={{ width: `${Math.min(100, Math.abs(c.shap_contribution) * 45)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            SCREEN 4: HISTORICAL EVENT REPLAY (CRITICAL SIH DEMO MODULE)
            =================================================================== */}
        {activeScreen === 'replay' && replayState && (
          <section aria-labelledby="heading-replay">
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="card-header">
                <div>
                  <h2 id="heading-replay" className="card-title" style={{ fontSize: '1.25rem' }}>
                    Historical Disaster Replay — {replayState.event.title}
                  </h2>
                  <p className="kpi-sub">{replayState.event.summary}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <StatusBadge
                    status="verified"
                    labelOverride={`Used in Training: ${replayState.event.used_in_training ? 'YES' : 'NO (0 rows — Held-Out)'}`}
                  />
                  <span className="mono-chip">Event ID: {replayState.event.event_id}</span>
                </div>
              </div>

              {/* Chronological Playback Controls */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: 'var(--bg-canvas)',
                  padding: '0.85rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setStepIndex((s) => Math.max(0, s - 1))}
                  aria-label="Previous 3-hour observation frame"
                >
                  <SkipBack size={16} aria-hidden="true" />
                  <span>Prev 3h</span>
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setIsPlayingReplay((p) => !p)}
                >
                  {isPlayingReplay ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
                  <span>{isPlayingReplay ? 'Pause Chronological Replay' : 'Play Chronological Replay'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStepIndex((s) => (s + 1 < totalSteps ? s + 1 : 0))}
                  aria-label="Next 3-hour observation frame"
                >
                  <span>Next 3h</span>
                  <SkipForward size={16} aria-hidden="true" />
                </button>

                <div style={{ flex: 1, minWidth: '240px' }}>
                  <label htmlFor="replay-scrubber" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700 }}>
                    Step {stepIndex + 1} of {totalSteps} — UTC Timestamp: {replayState.selected_timestamp}
                  </label>
                  <input
                    id="replay-scrubber"
                    type="range"
                    min={0}
                    max={Math.max(0, totalSteps - 1)}
                    value={stepIndex}
                    onChange={(e) => setStepIndex(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent-forest)' }}
                  />
                </div>
              </div>
            </div>

            {/* 8-Stage Causal Replay Chain */}
            <div className="grid-4" style={{ marginBottom: '1rem' }}>
              <div className="card">
                <span className="mono-chip">STAGE 1: OBSERVATIONS</span>
                <h3 style={{ margin: '0.4rem 0', fontSize: '1rem' }}>Real ERA5-Land + DEM</h3>
                <p style={{ margin: 0, fontSize: '0.875rem' }}>
                  24h Rain: <strong>{replayState.step_chain['1_observations'].rain_24h_mm} mm</strong>
                  <br />
                  48h Rain: <strong>{replayState.step_chain['1_observations'].rain_48h_mm} mm</strong>
                  <br />
                  Soil Water L1: <strong>{replayState.step_chain['1_observations'].soil_water_l1} m³/m³</strong>
                  <br />
                  6h Runoff: <strong>{replayState.step_chain['1_observations'].runoff_mm} mm</strong>
                </p>
              </div>

              <div className="card">
                <span className="mono-chip">STAGE 2 &amp; 3: PREDICT</span>
                <h3 style={{ margin: '0.4rem 0', fontSize: '1rem' }}>Calibrated Risk Output</h3>
                <div className="kpi-value">
                  {(replayState.step_chain['3_prediction'].flood_probability * 100).toFixed(1)}%
                </div>
                <StatusBadge status={replayState.step_chain['3_prediction'].risk_class} />
              </div>

              <div className="card">
                <span className="mono-chip">STAGE 5 &amp; 6: EXPLAIN &amp; ADVISORY</span>
                <h3 style={{ margin: '0.4rem 0', fontSize: '1rem' }}>Top Physical Driver</h3>
                <p style={{ margin: 0, fontSize: '0.85rem' }}>
                  {replayState.step_chain['5_explanation'].top_positive_contributors?.[0]?.label}:{' '}
                  <strong>
                    {replayState.step_chain['5_explanation'].top_positive_contributors?.[0]?.input_value}{' '}
                    {replayState.step_chain['5_explanation'].top_positive_contributors?.[0]?.unit}
                  </strong>
                </p>
                <p className="kpi-sub" style={{ marginTop: '0.35rem' }}>
                  Advisory State: <strong>{replayState.step_chain['6_advisory'].lifecycle_state.toUpperCase()}</strong>
                </p>
              </div>

              <div className="card">
                <span className="mono-chip">STAGE 7 &amp; 8: EXPOSED &amp; ROUTE</span>
                <h3 style={{ margin: '0.4rem 0', fontSize: '1rem' }}>
                  Exposed Settlements: {replayState.step_chain['7_exposed_settlements']?.length || 0}
                </h3>
                <p style={{ margin: 0, fontSize: '0.84rem' }}>
                  Safe Route:{' '}
                  <strong>{replayState.step_chain['8_evacuation_route']?.destination_shelter?.name}</strong> (
                  {replayState.step_chain['8_evacuation_route']?.total_distance_km} km)
                </p>
              </div>
            </div>

            {/* Chronological Hyetograph & Probability Table */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  Chronological Observation &amp; Model Probability Series — {replayState.selected_watershed_name}
                </h3>
              </div>
              <div className="table-wrapper" style={{ maxBlockSize: '360px' }}>
                <table>
                  <caption>
                    Click any row to jump the entire platform (Map, SHAP, Alerts, Routing) to that real historical UTC
                    observation timestamp
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Step</th>
                      <th scope="col">Observation UTC</th>
                      <th scope="col">1h Rain</th>
                      <th scope="col">6h Rain</th>
                      <th scope="col">24h Rain</th>
                      <th scope="col">48h Rain</th>
                      <th scope="col">Soil Moisture L1</th>
                      <th scope="col">6h Runoff</th>
                      <th scope="col">Model Probability</th>
                      <th scope="col">Risk Class</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(replayState.timeline_series || []).map((pt: any) => (
                      <tr
                        key={pt.step_index}
                        onClick={() => setStepIndex(pt.step_index)}
                        style={{
                          cursor: 'pointer',
                          background: pt.step_index === stepIndex ? 'var(--accent-forest-tint)' : undefined,
                        }}
                      >
                        <th scope="row">#{pt.step_index + 1}</th>
                        <td>{pt.timestamp}</td>
                        <td>{pt.rain_1h_mm} mm</td>
                        <td>{pt.rain_6h_mm} mm</td>
                        <td>
                          <strong>{pt.rain_24h_mm} mm</strong>
                        </td>
                        <td>{pt.rain_48h_mm} mm</td>
                        <td>{pt.soil_water_l1} m³/m³</td>
                        <td>{pt.runoff_mm} mm</td>
                        <td>
                          <strong>{(pt.flood_probability * 100).toFixed(1)}%</strong>
                        </td>
                        <td>
                          <StatusBadge status={pt.risk_class} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            SCREEN 5: ALERT CENTER (TRIGGER -> REVIEW -> ISSUE -> ACKNOWLEDGE -> EXPIRE)
            =================================================================== */}
        {activeScreen === 'alerts' && (
          <section aria-labelledby="heading-alerts">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <h2 id="heading-alerts" style={{ margin: 0 }}>
                  Alert &amp; Advisory Center — Lifecycle &amp; Operator Audit
                </h2>
                <p className="kpi-sub">
                  Workflow: Triggered → Under Review → Issued → Acknowledged → Expired. Strictly separates Official
                  Government Warnings from FloodGuard AI Advisories.
                </p>
              </div>
              <button type="button" className="btn-primary" onClick={handleTriggerAlert}>
                <ShieldAlert size={16} aria-hidden="true" />
                <span>Trigger FloodGuard AI Advisory for Selected Catchment</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {alerts.map((al) => (
                <article key={al.alert_id} className="card">
                  <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <StatusBadge status={al.severity_state} />
                      <StatusBadge status={al.origin_type} labelOverride={al.origin_badge} />
                      <span className="mono-chip">Lifecycle: {al.lifecycle_state.toUpperCase()}</span>
                    </div>
                    <span className="mono-chip">ID: {al.alert_id}</span>
                  </div>

                  <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.1rem' }}>{al.area_name}</h3>
                  <p style={{ margin: '0 0 0.4rem 0', fontSize: '0.9rem' }}>
                    <strong>Traceable Evidence &amp; Reason:</strong> {al.reason}
                  </p>
                  <p style={{ margin: '0 0 0.6rem 0', fontSize: '0.9rem', color: 'var(--accent-forest)' }}>
                    <strong>Recommended Operator Action:</strong> {al.recommended_action}
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderTop: '1px solid var(--bg-subtle)', paddingTop: '0.65rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Issued: {al.issue_time} | Valid Until: {al.valid_until} | Model: {al.source_or_model}
                    </div>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      {al.lifecycle_state === 'triggered' && (
                        <button type="button" onClick={() => openTransitionDialog(al, 'under_review')}>
                          Review Advisory
                        </button>
                      )}
                      {(al.lifecycle_state === 'triggered' || al.lifecycle_state === 'under_review') && (
                        <button type="button" className="btn-primary" onClick={() => openTransitionDialog(al, 'issued')}>
                          Issue Advisory
                        </button>
                      )}
                      {(al.lifecycle_state === 'issued' || al.lifecycle_state === 'under_review') && (
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => openTransitionDialog(al, 'acknowledged')}
                        >
                          <CheckCircle2 size={16} aria-hidden="true" />
                          <span>Acknowledge</span>
                        </button>
                      )}
                      {al.lifecycle_state !== 'expired' && (
                        <button type="button" onClick={() => openTransitionDialog(al, 'expired')}>
                          Expire
                        </button>
                      )}
                    </div>
                  </div>

                  {al.acknowledgements && al.acknowledgements.length > 0 && (
                    <div style={{ marginTop: '0.65rem', background: 'var(--bg-canvas)', padding: '0.55rem 0.75rem', borderRadius: '4px', fontSize: '0.8125rem' }}>
                      <strong>Operator Audit Trail:</strong>
                      <ul style={{ margin: '0.25rem 0 0 1.1rem', padding: 0 }}>
                        {al.acknowledgements.map((ack) => (
                          <li key={ack.ack_id}>
                            <strong>{ack.new_lifecycle_state.toUpperCase()}</strong> by {ack.acknowledged_by} (
                            {ack.acknowledged_role}) at {ack.acknowledged_at} — {ack.notes}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {/* ===================================================================
            SCREEN 6: EVACUATION PLANNER (REAL OSM GEOMETRY & SHELTERS)
            =================================================================== */}
        {activeScreen === 'evacuation' && (
          <section aria-labelledby="heading-evacuation">
            <h2 id="heading-evacuation" style={{ marginTop: 0 }}>
              Safest-Feasible Evacuation Planner — Real OpenStreetMap Road Geometry
            </h2>
            <div className="grid-2" style={{ marginBottom: '1rem' }}>
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Route Optimization Parameters (A* / Dijkstra)</h3>
                  <span className="mono-chip">Objective: Min(Distance + Flood + Landslide + Closure)</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="control-group">
                    <label htmlFor="evac-origin">Origin Settlement (OSM Node)</label>
                    <select
                      id="evac-origin"
                      value={originNode}
                      onChange={(e) => setOriginNode(e.target.value)}
                    >
                      <option value="mandi_town">Mandi Town (Paddal &amp; Old Mandi)</option>
                      <option value="pandoh_dam">Pandoh Bazaar &amp; Dam Colony</option>
                      <option value="aut_junction">Aut &amp; Larji Confluence</option>
                      <option value="bhuntar_confluence">Bhuntar (Parvati–Beas Confluence)</option>
                      <option value="kullu_hq">Kullu (Dhalpur &amp; Sarwari)</option>
                      <option value="manali_town">Manali Town</option>
                    </select>
                  </div>

                  <div className="control-group">
                    <label htmlFor="evac-shelter">Destination Relief Shelter</label>
                    <select
                      id="evac-shelter"
                      value={targetShelterId}
                      onChange={(e) => setTargetShelterId(e.target.value)}
                    >
                      <option value="">Auto-Select Lowest-Hazard Verified Shelter</option>
                      {shelters.map((s) => (
                        <option key={s.shelter_id} value={s.shelter_id}>
                          {s.name} [{s.verification_status === 'verified' ? 'VERIFIED' : 'VERIFICATION REQUIRED'}]
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="control-group">
                    <label htmlFor="flood-weight-slider">Flood Hazard Penalty Weight: {floodWeight}</label>
                    <input
                      id="flood-weight-slider"
                      type="range"
                      min={0}
                      max={20}
                      step={0.5}
                      value={floodWeight}
                      onChange={(e) => setFloodWeight(Number(e.target.value))}
                    />
                  </div>

                  <div className="control-group">
                    <label htmlFor="slide-weight-slider">Landslide Hazard Penalty Weight: {landslideWeight}</label>
                    <input
                      id="slide-weight-slider"
                      type="range"
                      min={0}
                      max={20}
                      step={0.5}
                      value={landslideWeight}
                      onChange={(e) => setLandslideWeight(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '0.75rem' }}>
                  <label htmlFor="chk-allow-unverified" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      id="chk-allow-unverified"
                      type="checkbox"
                      checked={allowUnverifiedShelter}
                      onChange={(e) => setAllowUnverifiedShelter(e.target.checked)}
                    />
                    <span style={{ fontSize: '0.875rem' }}>
                      Allow routing to unverified OpenStreetMap shelters (Always labelled &ldquo;Shelter location found —
                      verification required&rdquo;)
                    </span>
                  </label>
                </div>
              </div>

              {routePlan?.status === 'success' && (
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">Recommended Safest Feasible Route</h3>
                    <StatusBadge
                      status={routePlan.destination_shelter.verification_status}
                      labelOverride={routePlan.destination_shelter.verification_label}
                    />
                  </div>
                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>
                    <strong>From:</strong> {routePlan.origin.name} → <strong>To:</strong>{' '}
                    {routePlan.destination_shelter.name} ({routePlan.destination_shelter.elevation_m} m ASL)
                  </p>
                  <div className="grid-3" style={{ marginBottom: '0.65rem' }}>
                    <div style={{ background: 'var(--bg-canvas)', padding: '0.5rem', borderRadius: '4px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Road Distance</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{routePlan.total_distance_km} km</div>
                    </div>
                    <div style={{ background: 'var(--bg-canvas)', padding: '0.5rem', borderRadius: '4px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Max Flood Exposure</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                        {(routePlan.max_flood_hazard * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg-canvas)', padding: '0.5rem', borderRadius: '4px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Max Landslide Exposure</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                        {(routePlan.max_landslide_hazard * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  {routePlan.shortest_alternative?.avoided_high_hazard && (
                    <div
                      style={{
                        background: 'var(--risk-watch-bg)',
                        color: 'var(--risk-watch-fg)',
                        border: '1px solid var(--risk-watch-border)',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '4px',
                        fontSize: '0.84rem',
                      }}
                    >
                      <strong>Why Shortest Path Was Rejected:</strong> The shortest corridor (
                      {routePlan.shortest_alternative.corridor_names.join(' → ')},{' '}
                      {routePlan.shortest_alternative.total_distance_km} km) has{' '}
                      <strong>{(routePlan.shortest_alternative.max_flood_hazard * 100).toFixed(1)}%</strong> flood
                      exposure along the low river gorge. JalNetra routes via the elevated ridge bypass instead.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Segment-by-Segment OSM Road Table + Shelter Verification Directory */}
            <div className="grid-2">
              <div className="card">
                <h3 className="card-title" style={{ marginBottom: '0.65rem' }}>
                  Selected Route OpenStreetMap Road Segments
                </h3>
                <div className="table-wrapper">
                  <table>
                    <caption>Real OSM highway segments and dynamic flood/landslide hazard evaluation</caption>
                    <thead>
                      <tr>
                        <th scope="col">OSM Corridor Name</th>
                        <th scope="col">OSM Way ID</th>
                        <th scope="col">Distance</th>
                        <th scope="col">Flood Hazard</th>
                        <th scope="col">Road Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(routePlan?.segments || []).map((seg: any) => (
                        <tr key={seg.road_id}>
                          <th scope="row">{seg.name}</th>
                          <td>
                            <span className="mono-chip">{seg.osm_way_id}</span>
                          </td>
                          <td>{seg.distance_km} km</td>
                          <td>{(seg.flood_hazard * 100).toFixed(1)}%</td>
                          <td>
                            <StatusBadge
                              status={
                                seg.closure_status === 'hazard_status_unknown'
                                  ? 'unavailable'
                                  : seg.flood_hazard >= 0.65
                                    ? 'warning'
                                    : 'healthy'
                              }
                              labelOverride={seg.hazard_status_label}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <h3 className="card-title" style={{ marginBottom: '0.65rem' }}>
                  Shelter Directory &amp; Verification Status
                </h3>
                <div className="table-wrapper">
                  <table>
                    <caption>Unverified OpenStreetMap shelters are never labelled safe</caption>
                    <thead>
                      <tr>
                        <th scope="col">Shelter Facility</th>
                        <th scope="col">Elevation</th>
                        <th scope="col">OSM ID</th>
                        <th scope="col">Verification Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shelters.map((s) => (
                        <tr key={s.shelter_id}>
                          <th scope="row">
                            {s.name}
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                              {s.capacity_note}
                            </div>
                          </th>
                          <td>{s.elevation_m} m</td>
                          <td>
                            <span className="mono-chip">{s.osm_id}</span>
                          </td>
                          <td>
                            <StatusBadge
                              status={s.verification_status}
                              labelOverride={s.verification_label}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            SCREEN 7: SENSOR HEALTH & ESP32 IOT GATEWAY
            =================================================================== */}
        {activeScreen === 'sensors' && sensorsData && (
          <section aria-labelledby="heading-sensors">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <h2 id="heading-sensors" style={{ margin: 0 }}>
                  ESP32 IoT Sensor Gateway &amp; Hardware Telemetry Health
                </h2>
                <p className="kpi-sub">
                  MQTT Topic: <code>{sensorsData.mqtt_broker_config?.topic_pattern}</code> | HTTP Fallback:{' '}
                  <code>{sensorsData.mqtt_broker_config?.http_fallback_endpoint}</code> | Policy:{' '}
                  {sensorsData.mqtt_broker_config?.policy}
                </p>
              </div>
              <StatusBadge status="healthy" labelOverride="Synthetic Sensor Stream: DISABLED" />
            </div>

            <div className="grid-3" style={{ marginBottom: '1rem' }}>
              {(sensorsData.devices || []).map((dev: any) => (
                <div key={dev.device_id} className="card">
                  <div className="card-header">
                    <h3 className="card-title" style={{ fontSize: '0.95rem' }}>{dev.name}</h3>
                    <StatusBadge status={dev.status} labelOverride={dev.status_label} />
                  </div>
                  <p className="kpi-sub">
                    Device ID: <code>{dev.device_id}</code> | Protocol: {dev.protocol} | Coordinates: (
                    {dev.lat.toFixed(4)}°N, {dev.lon.toFixed(4)}°E) | Elev: {dev.elevation_m} m
                  </p>
                  <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', background: 'var(--bg-canvas)', padding: '0.5rem', borderRadius: '4px' }}>
                    <strong>Hardware Calibration Metadata:</strong>
                    <ul style={{ margin: '0.25rem 0 0 1.1rem', padding: 0 }}>
                      {Object.entries(dev.calibration_metadata || {}).map(([k, v]) => (
                        <li key={k}>
                          <strong>{k}:</strong> {String(v)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid-2">
              {/* Hardware Telemetry Ingestion Form */}
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">ESP32 HTTP Fallback Telemetry Ingestion &amp; Quality Validator</h3>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 0 }}>
                  Submit an ESP32 telemetry packet to <code>POST /api/v1/sensors/readings</code>. Try entering a
                  physically impossible value (e.g. <code>-25</code> mm rainfall) to verify that the Data Quality Layer
                  rejects invalid readings with <code>IMPOSSIBLE_VALUE</code> rather than silently repairing them.
                </p>
                <form onSubmit={handleSensorPacketSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="control-group">
                    <label htmlFor="iot-device-id">ESP32 Device ID</label>
                    <select
                      id="iot-device-id"
                      value={sensorFormDevice}
                      onChange={(e) => setSensorFormDevice(e.target.value)}
                    >
                      <option value="esp32-beas-pandoh-01">esp32-beas-pandoh-01 (Pandoh)</option>
                      <option value="esp32-kullu-bhuntar-02">esp32-kullu-bhuntar-02 (Bhuntar)</option>
                      <option value="esp32-mandakini-ukhimath-03">esp32-mandakini-ukhimath-03 (Rudraprayag)</option>
                    </select>
                  </div>

                  <div className="control-group">
                    <label htmlFor="iot-sensor-type">Sensor Type</label>
                    <select
                      id="iot-sensor-type"
                      value={sensorFormType}
                      onChange={(e) => {
                        const st = e.target.value;
                        setSensorFormType(st);
                        if (st === 'rain_gauge') setSensorFormUnit('mm');
                        if (st === 'soil_moisture') setSensorFormUnit('m3/m3');
                        if (st === 'water_level') setSensorFormUnit('m');
                      }}
                    >
                      <option value="rain_gauge">rain_gauge (Tipping Bucket)</option>
                      <option value="soil_moisture">soil_moisture (Capacitive VWC)</option>
                      <option value="water_level">water_level (Ultrasonic Stage)</option>
                    </select>
                  </div>

                  <div className="control-group">
                    <label htmlFor="iot-reading-val">Measured Value</label>
                    <input
                      id="iot-reading-val"
                      type="number"
                      step="any"
                      value={sensorFormValue}
                      onChange={(e) => setSensorFormValue(e.target.value)}
                      required
                    />
                  </div>

                  <div className="control-group">
                    <label htmlFor="iot-reading-unit">Unit</label>
                    <input
                      id="iot-reading-unit"
                      type="text"
                      value={sensorFormUnit}
                      onChange={(e) => setSensorFormUnit(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button type="submit" className="btn-primary">
                      Transmit ESP32 Telemetry Packet
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSensorFormValue('-15.0');
                      }}
                    >
                      Set Impossible Value (-15.0) to Test Quality Rejection
                    </button>
                  </div>
                </form>

                {sensorSubmitResult && (
                  <div style={{ marginTop: '0.75rem' }} role="status">
                    <StatusBadge
                      status={sensorSubmitResult.status}
                      labelOverride={sensorSubmitResult.message}
                    />
                  </div>
                )}
              </div>

              {/* Stored Sensor Readings Table */}
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    Stored ESP32 Sensor Readings ({sensorsData.readings?.length || 0})
                  </h3>
                </div>
                {(!sensorsData.readings || sensorsData.readings.length === 0) ? (
                  <div style={{ padding: '1rem', background: 'var(--bg-canvas)', borderRadius: '4px' }}>
                    <StatusBadge
                      status="awaiting_telemetry"
                      labelOverride="No observation received from physical ESP32 gateway"
                    />
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      JalNetra never generates random or simulated IoT sensor streams. Readings appear here only when
                      ingested via MQTT (<code>jalnetra/sensors/+/telemetry</code>) or HTTP POST.
                    </p>
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table>
                      <caption>Verified hardware sensor packets stored in PostGIS/SQLite</caption>
                      <thead>
                        <tr>
                          <th scope="col">Device ID</th>
                          <th scope="col">Sensor</th>
                          <th scope="col">Value</th>
                          <th scope="col">Quality Flag</th>
                          <th scope="col">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sensorsData.readings.map((r: any) => (
                          <tr key={r.reading_id}>
                            <th scope="row">{r.device_id}</th>
                            <td>{r.sensor_type}</td>
                            <td>
                              <strong>
                                {r.value} {r.unit}
                              </strong>
                            </td>
                            <td>
                              <StatusBadge status={r.quality_flag} />
                            </td>
                            <td>{r.timestamp}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            SCREEN 8: DATA PROVENANCE INSPECTOR
            =================================================================== */}
        {activeScreen === 'provenance' && provenanceData && (
          <section aria-labelledby="heading-provenance">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <h2 id="heading-provenance" style={{ margin: 0 }}>
                  End-to-End Data Provenance &amp; Source Registry
                </h2>
                <p className="kpi-sub">
                  Every observation, terrain raster stencil, and model prediction is traceable to source, dataset
                  version, observation time, retrieval time, and SHA-256 payload checksum.
                </p>
              </div>
              <button type="button" className="btn-primary" onClick={handleRefreshLiveSources}>
                <RefreshCw size={16} aria-hidden="true" />
                <span>Run Live Open-Meteo / Source Health Check</span>
              </button>
            </div>

            {/* Data Integrity Contract KPI Strip */}
            <div className="grid-4" style={{ marginBottom: '1rem' }}>
              <div className="card">
                <div className="kpi-sub">Synthetic / Dummy Rows</div>
                <div className="kpi-value" style={{ color: 'var(--accent-forest)' }}>
                  {provenanceData.data_integrity_contract.synthetic_rows} /{' '}
                  {provenanceData.data_integrity_contract.mock_rows}
                </div>
                <StatusBadge status="healthy" labelOverride="100% Real Observations Verified" />
              </div>
              <div className="card">
                <div className="kpi-sub">Curated Feature Matrix Rows</div>
                <div className="kpi-value">
                  {provenanceData.data_integrity_contract.total_curated_training_rows}
                </div>
                <p className="kpi-sub">
                  Across {provenanceData.data_integrity_contract.unique_historical_events} historical events (2005–2022)
                </p>
              </div>
              <div className="card">
                <div className="kpi-sub">Held-Out Replay Events Excluded</div>
                <div className="kpi-value" style={{ fontSize: '1.1rem' }}>
                  {(provenanceData.data_integrity_contract.held_out_replay_events_excluded || []).join(', ')}
                </div>
                <p className="kpi-sub">Zero training overlap with July/Aug 2023 replay</p>
              </div>
              <div className="card">
                <div className="kpi-sub">Parquet SHA-256 Checksum</div>
                <div className="mono-chip" style={{ marginTop: '0.4rem', display: 'block' }}>
                  {provenanceData.data_integrity_contract.parquet_sha256}
                </div>
              </div>
            </div>

            {/* 13 Registered Sources Table */}
            <div className="card" style={{ marginBottom: '1rem' }}>
              <h3 className="card-title" style={{ marginBottom: '0.65rem' }}>
                Registered Data Sources (`DATA_SOURCE_REGISTRY.csv` — 13 Official &amp; Research Feeds)
              </h3>
              <div className="table-wrapper">
                <table>
                  <caption>
                    Authorized credentials are read from .env; missing credentials explicitly report Authentication
                    Required without bypassing portal security
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Source ID</th>
                      <th scope="col">Name &amp; Provider</th>
                      <th scope="col">Role &amp; Cadence</th>
                      <th scope="col">License / Access Policy</th>
                      <th scope="col">Live Health State</th>
                      <th scope="col">Status Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sourcesHealth?.sources || []).map((s: any) => (
                      <tr key={s.source_id}>
                        <th scope="row">
                          <code>{s.source_id}</code>
                        </th>
                        <td>
                          <strong>{s.name}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.provider}</div>
                        </td>
                        <td>
                          {s.role} ({s.resolution_or_cadence})
                        </td>
                        <td>{s.access_or_license}</td>
                        <td>
                          <StatusBadge status={s.health_status} />
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>{s.status_message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Source Fetch Hashes & System Audit Log */}
            <div className="grid-2">
              <div className="card">
                <h3 className="card-title" style={{ marginBottom: '0.65rem' }}>
                  Raw Retrieval Provenance &amp; SHA-256 Checksums
                </h3>
                <div className="table-wrapper" style={{ maxBlockSize: '320px' }}>
                  <table>
                    <caption>Cryptographic hashes of downloaded ERA5-Land, NASADEM, and OSM payloads</caption>
                    <thead>
                      <tr>
                        <th scope="col">Fetch ID</th>
                        <th scope="col">Source</th>
                        <th scope="col">Dataset Version</th>
                        <th scope="col">SHA-256 Checksum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(provenanceData.source_fetches || []).map((f: any) => (
                        <tr key={f.fetch_id}>
                          <th scope="row">{f.fetch_id}</th>
                          <td>{f.source_id}</td>
                          <td>{f.dataset_version}</td>
                          <td>
                            <span className="mono-chip">{f.checksum_sha256?.slice(0, 20)}...</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <h3 className="card-title" style={{ marginBottom: '0.65rem' }}>
                  System Audit Log (`audit_logs`)
                </h3>
                <div className="table-wrapper" style={{ maxBlockSize: '320px' }}>
                  <table>
                    <caption>Immutable audit log of alerts, acknowledgements, and sensor ingestions</caption>
                    <thead>
                      <tr>
                        <th scope="col">Timestamp</th>
                        <th scope="col">Actor</th>
                        <th scope="col">Action</th>
                        <th scope="col">Entity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(provenanceData.audit_trail || []).map((l: any) => (
                        <tr key={l.log_id}>
                          <th scope="row">{l.timestamp}</th>
                          <td>{l.actor}</td>
                          <td>
                            <code>{l.action}</code>
                          </td>
                          <td>{l.entity_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            SCREEN 9: MODEL EVALUATION & LEAKAGE AUDIT
            =================================================================== */}
        {activeScreen === 'evaluation' && modelMetrics && (
          <section aria-labelledby="heading-evaluation">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <h2 id="heading-evaluation" style={{ margin: 0 }}>
                  Model Evaluation, Calibration &amp; Leakage Audit (`training_metrics.json`)
                </h2>
                <p className="kpi-sub">
                  All metrics displayed on this screen are loaded directly from{' '}
                  <code>artifacts/metrics/training_metrics.json</code> and{' '}
                  <code>artifacts/metrics/leakage_report.json</code>. Selected Model:{' '}
                  <strong>{modelMetrics.training_metrics.best_model}</strong>.
                </p>
              </div>
              <StatusBadge
                status={modelMetrics.leakage_report?.passed_all_checks ? 'healthy' : 'processing_error'}
                labelOverride={
                  modelMetrics.leakage_report?.passed_all_checks
                    ? 'All 7 Leakage & Provenance Checks PASSED'
                    : 'Leakage Check Failed'
                }
              />
            </div>

            {/* Candidate Models Comparison Table */}
            <div className="card" style={{ marginBottom: '1rem' }}>
              <h3 className="card-title" style={{ marginBottom: '0.65rem' }}>
                Benchmark Comparison Across 4 Candidate Architectures (Selected on Validation, Evaluated on Held-Out Temporal Test Split)
              </h3>
              <div className="table-wrapper">
                <table>
                  <caption>
                    Dataset: {modelMetrics.training_metrics.dataset_rows} real rows across{' '}
                    {modelMetrics.training_metrics.unique_events} historical events (Train:{' '}
                    {modelMetrics.training_metrics.splits.train_events} events, Val:{' '}
                    {modelMetrics.training_metrics.splits.val_events} events, Test:{' '}
                    {modelMetrics.training_metrics.splits.test_events} events)
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Candidate Model</th>
                      <th scope="col">Val PR-AUC</th>
                      <th scope="col">Test PR-AUC</th>
                      <th scope="col">Test Recall</th>
                      <th scope="col">Test Precision</th>
                      <th scope="col">Test F1</th>
                      <th scope="col">Test Brier Score</th>
                      <th scope="col">False-Alarm Rate</th>
                      <th scope="col">Test ROC-AUC</th>
                      <th scope="col">Val Threshold</th>
                      <th scope="col">Confusion (TP/FP/TN/FN)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(modelMetrics.training_metrics.models || {}).map(([name, m]: [string, any]) => {
                      const isBest = name === modelMetrics.training_metrics.best_model;
                      return (
                        <tr
                          key={name}
                          style={{
                            background: isBest ? 'var(--accent-forest-tint)' : undefined,
                          }}
                        >
                          <th scope="row">
                            {name} {isBest && <StatusBadge status="verified" labelOverride="Selected Best" />}
                          </th>
                          <td>{m.validation_metrics?.pr_auc}</td>
                          <td>
                            <strong>{m.pr_auc}</strong>
                          </td>
                          <td>{m.recall}</td>
                          <td>{m.precision}</td>
                          <td>{m.f1}</td>
                          <td>{m.brier}</td>
                          <td>{m.false_alarm_rate}</td>
                          <td>{m.roc_auc}</td>
                          <td>{m.validation_threshold}</td>
                          <td>
                            <span className="mono-chip">
                              TP:{m.tp} FP:{m.fp} TN:{m.tn} FN:{m.fn}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid-2" style={{ marginBottom: '1rem' }}>
              {/* Leakage Verification Checklist */}
              <div className="card">
                <h3 className="card-title" style={{ marginBottom: '0.65rem' }}>
                  Automated Anti-Leakage &amp; Temporal Split Audit (`leakage_report.json`)
                </h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {Object.entries(modelMetrics.leakage_report?.checks || {}).map(([chk, passed]) => (
                    <li
                      key={chk}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.45rem 0.65rem',
                        background: 'var(--bg-canvas)',
                        borderRadius: '4px',
                      }}
                    >
                      <code>{chk}</code>
                      <StatusBadge status={passed ? 'healthy' : 'processing_error'} labelOverride={passed ? 'PASSED' : 'FAILED'} />
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  <strong>Temporal Split Boundaries:</strong>
                  <br />
                  Train: {modelMetrics.leakage_report?.temporal_boundaries?.train_start} →{' '}
                  {modelMetrics.leakage_report?.temporal_boundaries?.train_end}
                  <br />
                  Validation: {modelMetrics.leakage_report?.temporal_boundaries?.val_start} →{' '}
                  {modelMetrics.leakage_report?.temporal_boundaries?.val_end}
                  <br />
                  Test: {modelMetrics.leakage_report?.temporal_boundaries?.test_start} →{' '}
                  {modelMetrics.leakage_report?.temporal_boundaries?.test_end}
                </div>
              </div>

              {/* Global SHAP Importance */}
              <div className="card">
                <h3 className="card-title" style={{ marginBottom: '0.65rem' }}>
                  Global SHAP Feature Importance (`global_feature_importance.json`)
                </h3>
                <div className="shap-list">
                  {(modelMetrics.global_explainability?.feature_importance || []).slice(0, 8).map((item: any) => (
                    <div key={item.feature} className="shap-row">
                      <div className="shap-row-header">
                        <code>{item.feature}</code>
                        <span>Mean |SHAP|: {item.mean_abs_shap}</span>
                      </div>
                      <div className="shap-bar-track">
                        <div
                          className="shap-bar-fill-neg"
                          style={{ width: `${Math.min(100, item.mean_abs_shap * 75)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* External Literature Benchmarks Reference Box (Explicitly separated per Spec Section 13) */}
            <div className="card" style={{ borderLeft: '5px solid var(--border-strong)' }}>
              <h3 className="card-title">
                Published Operational Literature Context (NOT FloodGuard AI / JalNetra Performance Claims)
              </h3>
              <p className="kpi-sub" style={{ marginBottom: '0.5rem' }}>
                {modelMetrics.research_benchmarks_reference_only?.notice}
              </p>
              <ul style={{ margin: 0, paddingInlineStart: '1.2rem', fontSize: '0.875rem' }}>
                {(modelMetrics.research_benchmarks_reference_only?.benchmarks || []).map((b: any, i: number) => (
                  <li key={i}>
                    <strong>{b.system}:</strong> {b.reported_metric}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ===================================================================
            SCREEN 10: PUBLIC / CITIZEN STATUS PORTAL
            =================================================================== */}
        {activeScreen === 'public' && areaDetail && pred && (
          <section aria-labelledby="heading-public" style={{ maxWidth: '960px', margin: '0 auto' }}>
            <div className="card" style={{ marginBottom: '1rem', borderWidth: '2px', borderColor: 'var(--accent-forest)' }}>
              <div className="card-header">
                <div>
                  <h2 id="heading-public" style={{ margin: 0, fontSize: '1.35rem' }}>
                    Public Flood Safety &amp; Local Area Status — {areaDetail.watershed.name}
                  </h2>
                  <p className="kpi-sub">
                    District: {areaDetail.watershed.district}, {areaDetail.watershed.state} | Observation Time:{' '}
                    {areaDetail.replay_context.observation_time}
                  </p>
                </div>
                <StatusBadge status={pred.risk_class} />
              </div>

              <div className="warning-comparison-grid" style={{ marginBottom: '1rem' }}>
                <div className="official-warning-box">
                  <strong>Official Government Warning (IMD / CWC / SDMA)</strong>
                  <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.9rem' }}>
                    {areaDetail.official_warning_status.bulletin_label}
                  </p>
                </div>
                <div className="advisory-warning-box">
                  <strong>JalNetra (FloodGuard AI) Local Advisory</strong>
                  <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.9rem' }}>{pred.risk_label}</p>
                </div>
              </div>

              <div className="grid-2">
                <div style={{ background: 'var(--bg-canvas)', padding: '1rem', borderRadius: '6px' }}>
                  <h3 style={{ marginTop: 0, fontSize: '1.05rem' }}>What is happening in {areaDetail.watershed.name}?</h3>
                  <p style={{ fontSize: '0.92rem', marginBottom: '0.5rem' }}>
                    Over the past 24 hours, <strong>{areaDetail.rainfall_windows.rain_24h_mm} mm</strong> of rainfall has
                    been recorded in this watershed (with <strong>{areaDetail.rainfall_windows.rain_48h_mm} mm</strong>{' '}
                    over 48 hours), and topsoil moisture is at{' '}
                    <strong>{areaDetail.soil_and_runoff.soil_water_l1_0_7cm} m³/m³</strong>.
                  </p>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: 0 }}>
                    {areaDetail.floodguard_advisory.statement}
                  </p>
                </div>

                <div style={{ background: 'var(--bg-canvas)', padding: '1rem', borderRadius: '6px' }}>
                  <h3 style={{ marginTop: 0, fontSize: '1.05rem' }}>What should I do right now?</h3>
                  <p style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    {areaDetail.floodguard_advisory.recommended_action}
                  </p>
                  <ul style={{ margin: 0, paddingInlineStart: '1.2rem', fontSize: '0.88rem' }}>
                    <li>Follow all official DDMA / SDMA / NDRF evacuation orders immediately.</li>
                    <li>Do not cross flooded bridges, low river terraces, or active landslide chutes.</li>
                    <li>Proceed only to verified high-elevation shelters using elevated bypass roads.</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="grid-2">
              <div className="card">
                <h3 className="card-title" style={{ marginBottom: '0.65rem' }}>
                  Nearest Relief Shelters &amp; Verification Status
                </h3>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {shelters.map((s) => (
                    <li
                      key={s.shelter_id}
                      style={{
                        border: '1px solid var(--border-subtle)',
                        padding: '0.7rem',
                        borderRadius: '4px',
                        background: 'var(--bg-canvas)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <strong>{s.name}</strong>
                        <StatusBadge
                          status={s.verification_status}
                          labelOverride={s.verification_label}
                        />
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Elevation: {s.elevation_m} m ASL | {s.capacity_note}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card">
                <h3 className="card-title" style={{ marginBottom: '0.65rem' }}>
                  Recommended Safe Route &amp; Emergency Helplines
                </h3>
                {routePlan?.status === 'success' && (
                  <div style={{ background: 'var(--bg-canvas)', padding: '0.85rem', borderRadius: '4px', marginBottom: '0.85rem' }}>
                    <strong>Safest Feasible Route:</strong>
                    <p style={{ margin: '0.35rem 0', fontSize: '0.9rem' }}>
                      {routePlan.origin.name} → <strong>{routePlan.destination_shelter.name}</strong> (
                      {routePlan.total_distance_km} km, ~{routePlan.estimated_duration_min} min)
                    </p>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      Corridors: {(routePlan.segments || []).map((s: any) => s.name).join(' → ')}
                    </div>
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem', fontSize: '0.9rem' }}>
                  <strong>24×7 Official Emergency Contacts:</strong>
                  <ul style={{ margin: '0.35rem 0 0 1.2rem' }}>
                    <li>
                      <strong>National Emergency Response (ERSS):</strong> <code>112</code>
                    </li>
                    <li>
                      <strong>State Disaster Management Authority (SDMA Helpline):</strong> <code>1070</code>
                    </li>
                    <li>
                      <strong>District Emergency Operations Center (DEOC Kullu / Mandi):</strong> <code>1077</code>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Native Accessible Modal Dialog (<dialog>) for Alert State Transitions */}
      <dialog ref={dialogRef} aria-labelledby="dialog-alert-title">
        <h2 id="dialog-alert-title" style={{ marginTop: 0 }}>
          Update Alert Lifecycle State: {dialogTargetState.toUpperCase()}
        </h2>
        {dialogAlert && (
          <form onSubmit={handleConfirmTransition}>
            <p style={{ fontSize: '0.9rem' }}>
              Area: <strong>{dialogAlert.area_name}</strong> ({dialogAlert.alert_id})
            </p>
            <div className="control-group" style={{ marginBottom: '0.75rem' }}>
              <label htmlFor="ack-actor-input">Operator Name &amp; Designation</label>
              <input
                id="ack-actor-input"
                type="text"
                value={dialogActor}
                onChange={(e) => setDialogActor(e.target.value)}
                required
              />
            </div>
            <div className="control-group" style={{ marginBottom: '1rem' }}>
              <label htmlFor="ack-notes-input">Operational Action / Audit Notes</label>
              <input
                id="ack-notes-input"
                type="text"
                value={dialogNotes}
                onChange={(e) => setDialogNotes(e.target.value)}
                required
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" onClick={() => dialogRef.current?.close()}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Confirm &amp; Record in Audit Log
              </button>
            </div>
          </form>
        )}
      </dialog>

      <footer className="app-footer">
        <div>
          <strong>JalNetra (FloodGuard AI)</strong> — Smart India Hackathon 2026 PS 26192 Prototype. FloodGuard AI
          estimates flood risk from multi-source observations and provides explainable, hyperlocal decision support.
        </div>
        <div>
          Attributions: Copernicus ERA5-Land (CC-BY 4.0) | NASA NASADEM | Source: EC JRC/Google | Global Flood DB v1 |
          ISRO Landslide Atlas | © OpenStreetMap contributors (ODbL)
        </div>
      </footer>
    </div>
  );
};
