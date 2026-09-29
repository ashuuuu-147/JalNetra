# AGENTS.md — FloodGuard AI Implementation Contract

## Read first
1. `PRD.md`
2. `DATA_AND_MODEL_TRAINING_SPEC.md`
3. `DATA_SOURCE_REGISTRY.csv`
4. `train_floodguard.py`

## Mission
Build a working SIH prototype for PS 26192. Prioritize correctness, traceability, accessibility and end-to-end functionality over decorative UI.

## Hard rules
### 1. No dummy data
Never create fake rainfall, random sensor values, invented river levels, fabricated risk scores, fake shelter coordinates, fake road closures, fake population counts or placeholder performance metrics.

Allowed: real historical data, authorized live feeds, real IoT readings, and explicit empty/error/stale states.

### 2. No fake metrics
Do not write a result such as 95% accuracy until the training pipeline has generated and stored that result with dataset/model/split metadata.

### 3. Official sources first
Prefer IMD, ISRO/NRSC/MOSDAC, CWC/WRIS, NDEM, NASA, Copernicus and JRC where relevant. Other sources must be documented.

### 4. Never bypass security
Do not bypass login, CAPTCHA, rate limits or other access controls. Live adapters should use environment variables for authorized credentials.

### 5. Provenance
Every observation, raster layer and prediction retains source, version, observation time and retrieval/processing metadata.

## Build order
### Phase 1 — repository
```text
/apps/web
/apps/api
/services/ingestion
/services/ml
/services/routing
/services/alerts
/infrastructure
/data
/artifacts
/docs
```

### Phase 2 — PostGIS
Create migrations for the entities defined in the PRD.

### Phase 3 — data adapters
Implement IMD, GSMaP_ISRO, GPM IMERG, ERA5-Land, terrain, historical floods, landslide inventory, CWC/WRIS if authorized, then IoT. Each adapter needs schema validation, unit conversion, freshness, retry/backoff, provenance and source-health state.

### Phase 4 — real training dataset
Generate the real feature matrix and provenance file before presenting model performance.

### Phase 5 — ML
Run `train_floodguard.py`. Benchmark models. Calibrate. Save artifacts. Generate a leakage report.

### Phase 6 — risk API
Expose model predictions through FastAPI. Every prediction must include probability, risk class, model version, valid-until, explanations and data freshness.

### Phase 7 — GIS
MapLibre. Use a clear 2D map. No decorative 3D globe. Provide rainfall, soil, terrain, rivers, flood, landslide, settlement, road, shelter and sensor layers.

### Phase 8 — alerts
`trigger → review → issue → acknowledge → expire`. Clearly distinguish official warnings from FloodGuard advisories.

### Phase 9 — routing
Use real OSM road geometry and verified/traceable shelter data. Route cost should include distance + flood hazard + landslide hazard + closure penalty. Unknown road state remains unknown.

### Phase 10 — historical replay
Use a real event not present in training. Replay actual observations chronologically.

## UI/UX
### Tone
Calm emergency-operations utility. Simple, readable, reliable.

### Palette
Warm white / light grey background, charcoal text, muted forest/teal accent, amber/orange/red for hazard semantics only.

### Avoid
Neon AI gradients, purple-blue glow, glassmorphism-heavy UI, decorative 3D, particles, giant typography, excessive animation.

### Usability
- clear headings
- no dead buttons
- loading/empty/stale/error state for every external component
- >=44px touch target
- keyboard navigation
- strong contrast
- icon + text for risk status
- responsive
- reduced motion support

## Screens
Public status, Operations dashboard, Risk map, Area detail, Alert center, Evacuation planner, Sensor health, Data provenance, Historical replay, Model evaluation.

## Testing
Backend: unit + schema + contract + provenance.  
ML: leakage + split + reproducibility + artifact-load.  
Frontend: responsive + accessibility + error states + map interactions.  
E2E: real data → features → model → API → map → alert → route.

## Repository hygiene
Include `.env.example`, README, Docker Compose, migrations, API docs, data card, model card, provenance docs and tests. Never commit credentials.

## Final SIH demo acceptance
The complete sequence must work: source health → real historical event → real timeline → model prediction → hyperlocal risk → explanation → operator advisory → real route → provenance → actual validation metrics.
