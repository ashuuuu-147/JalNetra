import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { Compass, Layers, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

export interface LayerVisibilityState {
  flood_risk: boolean;
  rainfall: boolean;
  forecast_rainfall: boolean;
  soil_moisture: boolean;
  elevation: boolean;
  slope: boolean;
  drainage: boolean;
  river: boolean;
  historical_flood_footprints: boolean;
  landslide_inventory: boolean;
  settlements: boolean;
  roads: boolean;
  shelters: boolean;
  sensors: boolean;
}

interface RiskMapViewProps {
  mapData: any;
  selectedWatershedId: string;
  onSelectWatershed: (watershedId: string) => void;
  routePlan?: any;
  stepIndex: number;
  totalSteps: number;
  onStepChange: (idx: number) => void;
  compact?: boolean;
}

const DEFAULT_VISIBILITY: LayerVisibilityState = {
  flood_risk: true,
  rainfall: true,
  forecast_rainfall: false,
  soil_moisture: false,
  elevation: false,
  slope: false,
  drainage: false,
  river: true,
  historical_flood_footprints: false,
  landslide_inventory: true,
  settlements: true,
  roads: true,
  shelters: true,
  sensors: true,
};

const LAYER_LABELS: Array<{ key: keyof LayerVisibilityState; label: string; sourceTag: string }> = [
  { key: 'flood_risk', label: 'Calibrated Flood Risk Polygons', sourceTag: 'JalNetra XGBoost v1.0.0' },
  { key: 'rainfall', label: 'Observed 24h Rainfall (mm)', sourceTag: 'ERA5-Land Hourly' },
  { key: 'forecast_rainfall', label: 'Forecast 24h Rainfall (mm)', sourceTag: 'NWP / ERA5 Guidance' },
  { key: 'soil_moisture', label: 'Soil Moisture L1 (0–7 cm)', sourceTag: 'ERA5-Land' },
  { key: 'elevation', label: 'Terrain Elevation (m ASL)', sourceTag: 'NASADEM 30m' },
  { key: 'slope', label: 'Catchment Slope (deg)', sourceTag: 'NASADEM 30m' },
  { key: 'drainage', label: 'Drainage Density (km/km²)', sourceTag: 'HydroSHEDS / DEM' },
  { key: 'river', label: 'Active River Channels', sourceTag: 'OSM + JRC GSW' },
  { key: 'historical_flood_footprints', label: 'Historical Flood Footprints', sourceTag: 'Global Flood DB v1' },
  { key: 'landslide_inventory', label: 'Landslide Atlas Clusters', sourceTag: 'ISRO/NRSC Atlas' },
  { key: 'settlements', label: 'Settlements (Towns/Villages)', sourceTag: 'OpenStreetMap' },
  { key: 'roads', label: 'Road Corridors & Hazard State', sourceTag: 'OSM + OSRM' },
  { key: 'shelters', label: 'Relief Shelters (Verified/Unverified)', sourceTag: 'OSM + DDMA Ref' },
  { key: 'sensors', label: 'ESP32 Field Telemetry Nodes', sourceTag: 'MQTT / HTTP Gateway' },
];

export const RiskMapView: React.FC<RiskMapViewProps> = ({
  mapData,
  selectedWatershedId,
  onSelectWatershed,
  routePlan,
  stepIndex,
  totalSteps,
  onStepChange,
  compact = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [visibility, setVisibility] = useState<LayerVisibilityState>(DEFAULT_VISIBILITY);
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectedFeature, setInspectedFeature] = useState<Record<string, any> | null>(null);

  // Initialize 2D MapLibre GL JS Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          osm_raster: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors (ODbL) | Source: EC JRC/Google | Copernicus ERA5-Land',
          },
        },
        layers: [
          {
            id: 'osm_base',
            type: 'raster',
            source: 'osm_raster',
            paint: {
              'raster-saturation': -0.35,
              'raster-contrast': 0.05,
            },
          },
        ],
      },
      center: [77.12, 31.86],
      zoom: compact ? 8.2 : 8.8,
      maxPitch: 0, // Strictly 2D operational GIS map (no decorative 3D globe/tilt)
    });

    map.on('load', () => {
      setMapReady(true);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [compact]);

  // Populate & update GeoJSON sources and layers when mapData or visibility changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !mapData?.layers) return;

    const upsertGeoJsonSource = (id: string, data: any) => {
      const existing = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(data);
      } else {
        map.addSource(id, { type: 'geojson', data });
      }
    };

    upsertGeoJsonSource('src_flood_risk', mapData.layers.flood_risk);
    upsertGeoJsonSource('src_centroids', mapData.layers.terrain_centroids);
    upsertGeoJsonSource('src_footprints', mapData.layers.historical_flood_footprints);
    upsertGeoJsonSource('src_landslides', mapData.layers.landslide_inventory);
    upsertGeoJsonSource('src_rivers', mapData.layers.rivers);
    upsertGeoJsonSource('src_roads', mapData.layers.roads);
    upsertGeoJsonSource('src_settlements', mapData.layers.settlements);
    upsertGeoJsonSource('src_shelters', mapData.layers.shelters);
    upsertGeoJsonSource('src_sensors', mapData.layers.sensors);

    const routeGeoJson = routePlan?.route_geojson
      ? { type: 'FeatureCollection', features: [routePlan.route_geojson] }
      : { type: 'FeatureCollection', features: [] };
    upsertGeoJsonSource('src_active_route', routeGeoJson);

    // 1. Historical Flood Footprints
    if (!map.getLayer('lyr_footprints')) {
      map.addLayer({
        id: 'lyr_footprints',
        type: 'fill',
        source: 'src_footprints',
        paint: {
          'fill-color': '#1d4ed8',
          'fill-opacity': 0.22,
          'fill-outline-color': '#1e3a8a',
        },
      });
    }
    map.setLayoutProperty(
      'lyr_footprints',
      'visibility',
      visibility.historical_flood_footprints ? 'visible' : 'none',
    );

    // 2. Flood Risk Watershed Polygons
    if (!map.getLayer('lyr_flood_risk_fill')) {
      map.addLayer({
        id: 'lyr_flood_risk_fill',
        type: 'fill',
        source: 'src_flood_risk',
        paint: {
          'fill-color': [
            'match',
            ['get', 'risk_class'],
            'critical',
            '#dc2626',
            'warning',
            '#ea580c',
            'watch',
            '#d97706',
            '#15803d',
          ],
          'fill-opacity': 0.34,
        },
      });
      map.addLayer({
        id: 'lyr_flood_risk_outline',
        type: 'line',
        source: 'src_flood_risk',
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'watershed_id'], selectedWatershedId],
            '#0f172a',
            '#334155',
          ],
          'line-width': [
            'case',
            ['==', ['get', 'watershed_id'], selectedWatershedId],
            3.5,
            1.5,
          ],
        },
      });

      map.on('click', 'lyr_flood_risk_fill', (e) => {
        const feat = e.features?.[0];
        if (feat?.properties) {
          setInspectedFeature({ layerType: 'Watershed Risk Zone', ...feat.properties });
          if (feat.properties.watershed_id) {
            onSelectWatershed(String(feat.properties.watershed_id));
          }
        }
      });
    } else {
      map.setPaintProperty('lyr_flood_risk_outline', 'line-width', [
        'case',
        ['==', ['get', 'watershed_id'], selectedWatershedId],
        3.5,
        1.5,
      ]);
    }
    map.setLayoutProperty('lyr_flood_risk_fill', 'visibility', visibility.flood_risk ? 'visible' : 'none');
    map.setLayoutProperty('lyr_flood_risk_outline', 'visibility', visibility.flood_risk ? 'visible' : 'none');

    // 3. Rivers
    if (!map.getLayer('lyr_rivers')) {
      map.addLayer({
        id: 'lyr_rivers',
        type: 'line',
        source: 'src_rivers',
        paint: {
          'line-color': '#0284c7',
          'line-width': 3.2,
        },
      });
    }
    map.setLayoutProperty('lyr_rivers', 'visibility', visibility.river ? 'visible' : 'none');

    // 4. Roads
    if (!map.getLayer('lyr_roads')) {
      map.addLayer({
        id: 'lyr_roads',
        type: 'line',
        source: 'src_roads',
        paint: {
          'line-color': [
            'match',
            ['get', 'hazard_status_label'],
            'High Flood Hazard',
            '#b91c1c',
            'Hazard status unknown',
            '#64748b',
            '#155648',
          ],
          'line-width': 3.5,
        },
      });
      map.on('click', 'lyr_roads', (e) => {
        const feat = e.features?.[0];
        if (feat?.properties) {
          setInspectedFeature({ layerType: 'OpenStreetMap Road Corridor', ...feat.properties });
        }
      });
    }
    map.setLayoutProperty('lyr_roads', 'visibility', visibility.roads ? 'visible' : 'none');

    // 5. Active Evacuation Route Highlight
    if (!map.getLayer('lyr_active_route')) {
      map.addLayer({
        id: 'lyr_active_route',
        type: 'line',
        source: 'src_active_route',
        paint: {
          'line-color': '#0d9488',
          'line-width': 6,
        },
      });
    }

    // 6. Landslide Inventory Points
    if (!map.getLayer('lyr_landslides')) {
      map.addLayer({
        id: 'lyr_landslides',
        type: 'circle',
        source: 'src_landslides',
        paint: {
          'circle-radius': 7,
          'circle-color': '#9a3412',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
      map.on('click', 'lyr_landslides', (e) => {
        const feat = e.features?.[0];
        if (feat?.properties) {
          setInspectedFeature({ layerType: 'ISRO Landslide Atlas Cluster', ...feat.properties });
        }
      });
    }
    map.setLayoutProperty(
      'lyr_landslides',
      'visibility',
      visibility.landslide_inventory ? 'visible' : 'none',
    );

    // 7. Hydromet & Terrain Centroid Circles (Rainfall / Forecast / Soil Moisture / Elevation / Slope / Drainage)
    const anyCentroidMetric =
      visibility.rainfall ||
      visibility.forecast_rainfall ||
      visibility.soil_moisture ||
      visibility.elevation ||
      visibility.slope ||
      visibility.drainage;

    if (!map.getLayer('lyr_centroid_metrics')) {
      map.addLayer({
        id: 'lyr_centroid_metrics',
        type: 'circle',
        source: 'src_centroids',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'rain_24h_mm'],
            0,
            8,
            150,
            20,
          ],
          'circle-color': '#0369a1',
          'circle-opacity': 0.75,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
    }
    map.setLayoutProperty('lyr_centroid_metrics', 'visibility', anyCentroidMetric ? 'visible' : 'none');

    // 8. Settlements
    if (!map.getLayer('lyr_settlements')) {
      map.addLayer({
        id: 'lyr_settlements',
        type: 'circle',
        source: 'src_settlements',
        paint: {
          'circle-radius': 6,
          'circle-color': '#1e293b',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#f8fafc',
        },
      });
      map.on('click', 'lyr_settlements', (e) => {
        const feat = e.features?.[0];
        if (feat?.properties) {
          setInspectedFeature({ layerType: 'OSM Settlement', ...feat.properties });
        }
      });
    }
    map.setLayoutProperty('lyr_settlements', 'visibility', visibility.settlements ? 'visible' : 'none');

    // 9. Shelters (Verified vs Verification Required)
    if (!map.getLayer('lyr_shelters')) {
      map.addLayer({
        id: 'lyr_shelters',
        type: 'circle',
        source: 'src_shelters',
        paint: {
          'circle-radius': 8,
          'circle-color': [
            'match',
            ['get', 'verification_status'],
            'verified',
            '#15803d',
            '#d97706',
          ],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      });
      map.on('click', 'lyr_shelters', (e) => {
        const feat = e.features?.[0];
        if (feat?.properties) {
          setInspectedFeature({ layerType: 'Relief Shelter', ...feat.properties });
        }
      });
    }
    map.setLayoutProperty('lyr_shelters', 'visibility', visibility.shelters ? 'visible' : 'none');

    // 10. ESP32 Sensors
    if (!map.getLayer('lyr_sensors')) {
      map.addLayer({
        id: 'lyr_sensors',
        type: 'circle',
        source: 'src_sensors',
        paint: {
          'circle-radius': 7,
          'circle-color': [
            'match',
            ['get', 'status'],
            'online_receiving',
            '#0d9488',
            '#64748b',
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
      map.on('click', 'lyr_sensors', (e) => {
        const feat = e.features?.[0];
        if (feat?.properties) {
          setInspectedFeature({ layerType: 'ESP32 Sensor Gateway Node', ...feat.properties });
        }
      });
    }
    map.setLayoutProperty('lyr_sensors', 'visibility', visibility.sensors ? 'visible' : 'none');
  }, [mapData, mapReady, visibility, selectedWatershedId, routePlan, onSelectWatershed]);

  const handleZoom = (delta: number) => {
    if (!mapRef.current) return;
    mapRef.current.zoomTo(mapRef.current.getZoom() + delta, { duration: 200 });
  };

  const handleResetView = () => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({ center: [77.12, 31.86], zoom: 8.8, duration: 300 });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim().toLowerCase();
    if (!q || !mapData?.layers) return;

    const wsFeatures = mapData.layers.flood_risk?.features || [];
    const matchedWs = wsFeatures.find((f: any) =>
      String(f.properties?.name || '').toLowerCase().includes(q) ||
      String(f.properties?.district || '').toLowerCase().includes(q),
    );
    if (matchedWs) {
      const wid = matchedWs.properties.watershed_id;
      onSelectWatershed(wid);
      setInspectedFeature({ layerType: 'Watershed Risk Zone', ...matchedWs.properties });
      const ring = matchedWs.geometry?.coordinates?.[0]?.[0];
      if (ring && mapRef.current) {
        mapRef.current.flyTo({ center: [ring[0], ring[1]], zoom: 10.2, duration: 300 });
      }
      return;
    }

    const stlFeatures = mapData.layers.settlements?.features || [];
    const matchedStl = stlFeatures.find((f: any) =>
      String(f.properties?.name || '').toLowerCase().includes(q),
    );
    if (matchedStl && mapRef.current) {
      setInspectedFeature({ layerType: 'OSM Settlement', ...matchedStl.properties });
      mapRef.current.flyTo({
        center: matchedStl.geometry.coordinates,
        zoom: 11.2,
        duration: 300,
      });
    }
  };

  const toggleLayer = (key: keyof LayerVisibilityState) => {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (compact) {
    return (
      <div>
        <div className="map-canvas-wrapper" style={{ height: '380px' }}>
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
          <div className="map-legend" aria-label="Map hazard legend">
            <strong>Risk Semantics (Icon + Text + Color)</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.35rem' }}>
              <StatusBadge status="advisory" labelOverride="Advisory" />
              <StatusBadge status="watch" labelOverride="Watch" />
              <StatusBadge status="warning" labelOverride="Warning" />
              <StatusBadge status="critical" labelOverride="Critical" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="map-layout">
      {/* Left Column: Search & 14 GIS Layer Toggles */}
      <aside className="card" aria-label="GIS Map Controls and Layer Toggles">
        <div className="card-header">
          <h2 className="card-title">
            <Layers size={18} aria-hidden="true" />
            <span>GIS Layers (14)</span>
          </h2>
        </div>

        <search style={{ marginBottom: '0.85rem' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.4rem' }}>
            <label htmlFor="gis-search-input" className="visually-hidden">
              Search village, town, or catchment
            </label>
            <input
              id="gis-search-input"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Kullu, Mandi, Pandoh..."
              style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1px solid var(--border-strong)', borderRadius: '4px' }}
            />
            <button type="submit" className="btn-primary" aria-label="Search map location">
              <Search size={16} aria-hidden="true" />
              <span>Find</span>
            </button>
          </form>
        </search>

        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.85rem' }}>
          <button type="button" onClick={() => handleZoom(1)} aria-label="Zoom in map">
            <ZoomIn size={16} aria-hidden="true" />
            <span>Zoom In</span>
          </button>
          <button type="button" onClick={() => handleZoom(-1)} aria-label="Zoom out map">
            <ZoomOut size={16} aria-hidden="true" />
            <span>Zoom Out</span>
          </button>
          <button type="button" onClick={handleResetView} aria-label="Reset Beas Basin view">
            <Compass size={16} aria-hidden="true" />
            <span>Reset</span>
          </button>
        </div>

        <ul className="layer-toggle-list" role="list">
          {LAYER_LABELS.map((item) => (
            <li key={item.key} className="layer-toggle-item">
              <label htmlFor={`chk-layer-${item.key}`}>
                <input
                  id={`chk-layer-${item.key}`}
                  type="checkbox"
                  checked={visibility[item.key]}
                  onChange={() => toggleLayer(item.key)}
                />
                <span>
                  <span style={{ display: 'block', fontWeight: 600 }}>{item.label}</span>
                  <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Source: {item.sourceTag}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </aside>

      {/* Center Column: 2D MapLibre Canvas + Time Slider */}
      <section aria-label="Interactive 2D Risk Map">
        <div className="map-canvas-wrapper">
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
          <div className="map-legend">
            <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>
              Map Legend — Click any polygon, road, or shelter
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem' }}>
              <span>■ Red: Critical Risk</span>
              <span>■ Orange: Warning Risk</span>
              <span>■ Amber: Watch Risk</span>
              <span>■ Green: Routine Advisory</span>
              <span>● Green Circle: Verified Shelter</span>
              <span>● Amber Circle: Unverified OSM Shelter</span>
              <span>━ Teal Line: Safe Route</span>
              <span>━ Grey Line: Road Status Unknown</span>
            </div>
          </div>
        </div>

        {/* Chronological Observation Time Slider */}
        <div className="card" style={{ marginTop: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <label htmlFor="map-time-slider" style={{ fontWeight: 700 }}>
              Chronological Observation Time Step ({stepIndex + 1} / {Math.max(1, totalSteps)})
            </label>
            <span className="mono-chip">
              UTC Observation: {mapData?.observation_time || 'Loading...'}
            </span>
          </div>
          <input
            id="map-time-slider"
            type="range"
            min={0}
            max={Math.max(0, totalSteps - 1)}
            value={stepIndex}
            onChange={(e) => onStepChange(Number(e.target.value))}
            style={{ width: '100%', marginTop: '0.5rem', accentColor: 'var(--accent-forest)' }}
          />
        </div>
      </section>

      {/* Right Column: Click Inspection Drawer */}
      <aside className="card" aria-label="Inspected Feature Details">
        <div className="card-header">
          <h2 className="card-title">Click Inspection</h2>
        </div>
        {!inspectedFeature ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Click any watershed polygon, OpenStreetMap road corridor, relief shelter, settlement, or
            ESP32 sensor node on the map (or use the Search box) to inspect its real measurements,
            verification status, and source provenance.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.875rem' }}>
            <div>
              <span className="mono-chip">{inspectedFeature.layerType}</span>
              <h3 style={{ margin: '0.35rem 0 0.2rem 0', fontSize: '1.05rem' }}>
                {inspectedFeature.name || inspectedFeature.device_id || inspectedFeature.watershed_id}
              </h3>
            </div>

            {inspectedFeature.risk_class && (
              <div>
                <StatusBadge status={String(inspectedFeature.risk_class)} />
              </div>
            )}

            {inspectedFeature.verification_status && (
              <div>
                <StatusBadge status={String(inspectedFeature.verification_status)} />
              </div>
            )}

            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
              {Object.entries(inspectedFeature)
                .filter(([k]) => !['layerType', 'name', 'coordinates_geojson'].includes(k))
                .slice(0, 14)
                .map(([k, v]) => (
                  <div key={k} style={{ background: 'var(--bg-canvas)', padding: '0.4rem 0.55rem', borderRadius: '4px' }}>
                    <dt style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{k}</dt>
                    <dd style={{ margin: 0, fontWeight: 700, wordBreak: 'break-word' }}>{String(v ?? 'N/A')}</dd>
                  </div>
                ))}
            </dl>
          </div>
        )}
      </aside>
    </div>
  );
};
