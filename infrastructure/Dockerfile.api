# Stage 1: Build React + TypeScript + MapLibre 2D GIS Frontend
FROM node:20-slim AS web-builder
WORKDIR /app/apps/web
COPY apps/web/package*.json ./
RUN npm install
COPY apps/web/ ./
RUN npm run build

# Stage 2: FastAPI + Calibrated ML + PostGIS Backend serving API & Web UI
FROM python:3.12-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app
COPY --from=web-builder /app/apps/web/dist /app/apps/web/dist

# Ensure joblib model artifacts match the container's exact Python & scikit-learn version
RUN python3 train_floodguard.py \
    --data data/curated/training_features.parquet \
    --provenance data/curated/training_provenance.json \
    --out artifacts

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn apps.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
