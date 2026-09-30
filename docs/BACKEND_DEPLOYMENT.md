# JalNetra (FloodGuard AI) — Backend Deployment Guide

This guide covers all 4 ways to deploy the **JalNetra FastAPI + ML + PostGIS Backend** ([apps/api/main.py](file:///Users/shubhamchandra/Desktop/JalNetra/apps/api/main.py)):

1. **Option 1: Docker Compose (Recommended for Full Stack: PostGIS + MQTT + FastAPI + Web)**
2. **Option 2: Standalone Docker Container (`infrastructure/Dockerfile.api`)**
3. **Option 3: Cloud PaaS (Render / Railway / Google Cloud Run)**
4. **Option 4: Linux VPS / Bare-Metal Server (Ubuntu + Systemd + Nginx)**

---

## Important Note Before Deploying
The backend requires the curated dataset (`data/curated/`) and trained ML artifacts (`artifacts/models/`, `artifacts/metrics/`, `artifacts/explainability/`, `artifacts/provenance/`) to be present in the image or mounted volume.
- Because those files are already generated in this repository (`~10 MB` total), copying the repository into the Docker image ([infrastructure/Dockerfile.api](file:///Users/shubhamchandra/Desktop/JalNetra/infrastructure/Dockerfile.api)) bundles the trained model (`v1.0.0`), calibrator, SHAP explainability, and 2023 Himachal Pradesh replay datasets automatically.
- On startup, [apps/api/main.py](file:///Users/shubhamchandra/Desktop/JalNetra/apps/api/main.py) automatically creates all 22 tables and seeds the watersheds, data sources, shelters, roads, and historical events into `DATABASE_URL` (PostgreSQL/PostGIS in production, or local SQLite `data/jalnetra.db` if `DATABASE_URL` is not set).

---

## Option 1: Deploy with Docker Compose (PostGIS + Mosquitto MQTT + API)

Use [docker-compose.yml](file:///Users/shubhamchandra/Desktop/JalNetra/docker-compose.yml) to spin up PostgreSQL 16 + PostGIS 3.4, Eclipse Mosquitto MQTT Broker, the FastAPI backend, and the web frontend together:

```bash
# 1. Copy environment variables template
cp .env.example .env

# 2. Build and start the backend + PostGIS + MQTT in detached mode
docker compose up -d --build postgis mosquitto api

# 3. Verify health check
curl http://localhost:8000/api/v1/health
```

- **Backend URL:** `http://localhost:8000`
- **Swagger / OpenAPI Docs:** `http://localhost:8000/docs`
- **PostGIS Port:** `5432`
- **MQTT Broker Port:** `1883`

---

## Option 2: Deploy as a Standalone Docker Container

You can build and run [infrastructure/Dockerfile.api](file:///Users/shubhamchandra/Desktop/JalNetra/infrastructure/Dockerfile.api) directly on any server or container platform:

```bash
# 1. Build the backend image from the repository root
docker build -f infrastructure/Dockerfile.api -t jalnetra-api:latest .

# 2. Run the container (uses built-in SQLite if DATABASE_URL is omitted, or pass your Postgres URL)
docker run -d \
  --name jalnetra-api \
  -p 8000:8000 \
  -e PORT=8000 \
  jalnetra-api:latest

# 3. Verify health
curl http://localhost:8000/api/v1/health
```

---

## Option 3: Cloud Deployment (Render / Railway / Google Cloud Run)

### 3A. Deploy to Render (Using [render.yaml](file:///Users/shubhamchandra/Desktop/JalNetra/render.yaml))
1. Push this repository to GitHub/GitLab.
2. In the **Render Dashboard**, click **New +** $\rightarrow$ **Blueprint** and select your repository, **or** click **New +** $\rightarrow$ **Web Service**:
   - **Runtime:** `Docker`
   - **Dockerfile Path:** `./infrastructure/Dockerfile.api`
   - **Docker Build Context Directory:** `.`
   - **Health Check Path:** `/api/v1/health`
3. *(Optional)* Add environment variables in Render (`DATABASE_URL`, `IMD_API_KEY`, `MOSDAC_USERNAME`, `NASA_EARTHDATA_TOKEN`). If you don't attach a PostgreSQL database, the container automatically uses its persistent SQLite fallback.

### 3B. Deploy to Railway
1. Install Railway CLI (`npm i -g @railway/cli`) or connect your GitHub repo in the Railway dashboard.
2. Set the Dockerfile path in Railway Settings $\rightarrow$ Deploy:
   - **Dockerfile Path:** `infrastructure/Dockerfile.api`
3. Railway automatically injects `$PORT`, which [infrastructure/Dockerfile.api](file:///Users/shubhamchandra/Desktop/JalNetra/infrastructure/Dockerfile.api) binds to automatically:
   ```dockerfile
   CMD ["sh", "-c", "uvicorn apps.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
   ```

### 3C. Deploy to Google Cloud Run
```bash
# Build and deploy directly from source to Cloud Run
gcloud run deploy jalnetra-api \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --port 8000 \
  --memory 1Gi
```
*(If Cloud Build asks for a root `Dockerfile`, copy `cp infrastructure/Dockerfile.api Dockerfile` before running `gcloud run deploy`.)*

---

## Option 4: Deploy on a Linux VPS (Ubuntu 22.04 / 24.04 + Systemd)

```bash
# 1. Install system dependencies
sudo apt-get update && sudo apt-get install -y python3-pip python3-venv build-essential libpq-dev libgomp1

# 2. Clone repo and create virtual environment
git clone <your-repo-url> /opt/jalnetra
cd /opt/jalnetra
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 3. Verify dataset & model artifacts exist (or regenerate them)
python3 -m services.ingestion.build_real_dataset
python3 train_floodguard.py --data data/curated/training_features.parquet --provenance data/curated/training_provenance.json --out artifacts

# 4. Run production Uvicorn server (with 2 workers)
uvicorn apps.api.main:app --host 0.0.0.0 --port 8000 --workers 2
```

---

## Connecting the Frontend to Your Deployed Backend

Once your backend is deployed (for example at `https://jalnetra-api.onrender.com`), set `VITE_API_BASE_URL` when building or deploying the React frontend (`apps/web`):

```bash
cd apps/web
VITE_API_BASE_URL=https://jalnetra-api.onrender.com npm run build
```
The compiled static frontend in `apps/web/dist/` can then be hosted on Vercel, Netlify, Cloudflare Pages, Firebase Hosting, or Nginx.
