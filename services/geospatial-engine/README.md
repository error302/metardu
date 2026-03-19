# GeoNova Python Geospatial Engine

FastAPI service for computationally intensive operations:
- **TIN** (Triangulated Irregular Network) via Delaunay triangulation
- **Contour generation** from spot heights
- **Cut/fill volume** computation (grid and prismoidal methods)
- **Raster analysis** (slope, aspect, statistics)
- **Seabed / hydrographic** depth analysis
- **DXF / KML / GeoJSON** export

---

## Local development

```bash
cd services/geospatial-engine
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Or with Docker:

```bash
# From repo root:
docker-compose up python-engine
```

Set in your `.env.local`:
```
PYTHON_COMPUTE_URL=http://localhost:8000
```

---

## Deploy to Railway (recommended)

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select the `services/geospatial-engine` folder as the root
3. Railway auto-detects the `Dockerfile` and builds it
4. Copy the public URL Railway gives you
5. Add to Vercel environment variables:
   ```
   PYTHON_COMPUTE_URL=https://your-service.railway.app
   ALLOWED_ORIGINS=https://geonova-henna.vercel.app
   ```

## Deploy to Render

1. Go to [render.com](https://render.com) → New Web Service → connect repo
2. Root directory: `services/geospatial-engine`
3. Environment: Docker
4. Add env var: `ALLOWED_ORIGINS=https://geonova-henna.vercel.app`

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated list of allowed CORS origins |

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/surface/tin` | Compute TIN from XYZ points |
| POST | `/surface/volume` | Cut/fill volume |
| POST | `/terrain/contours` | Generate contour lines |
| POST | `/raster/analyze` | Raster statistics |
| POST | `/hydro/seabed` | Seabed depth analysis |
| POST | `/export/dxf` | Export to DXF |
| POST | `/export/kml` | Export to KML |
| POST | `/export/geojson` | Export to GeoJSON |

These are also accessible via the Next.js proxy at `/api/compute` (set `task` to `tin`, `contours`, etc.).
