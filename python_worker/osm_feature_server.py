"""
METARDU OSM Feature Server — Pyrosm-based local PBF parsing

PROBLEM
-------
The map page currently shows only satellite imagery. Surveyors need to see
building footprints, road names, and POIs for context — "is this beacon
3m from the road edge?", "is there a building encroaching?".

Querying Overpass API on every pan/zoom depends on network availability and
provider limits. A configured local PBF can avoid those requests, but Pyrosm
materializes large layer tables and this route does not have a spatial SQL
index. It is optional and must not be treated as a low-memory indexed service.

WHAT THIS MODULE DOES
---------------------
1. Loads a configured .osm.pbf file on first request
2. Serves building footprints, road lines, and POIs by bounding box
3. Returns GeoJSON FeatureCollections ready for OpenLayers

LIBRARY: Pyrosm (https://pyrosm.readthedocs.io/)
- C++ backend (protozero) — fast PBF parsing
- Reads local files — no network dependency, no rate limits
- Outputs GeoDataFrames — easy conversion to GeoJSON

SETUP
-----
1. Download Kenya PBF:
   wget https://download.geofabrik.de/africa/kenya-latest.osm.pbf
2. Place at: data/kenya-latest.osm.pbf (or set OSM_PBF_PATH env var)
3. Restart the Python worker

USAGE
-----
GET /osm/features?minlon=36.8&minlat=-1.3&maxlon=36.85&maxlat=-1.25&types=buildings,roads,pois

Returns:
{
  "buildings": { "type": "FeatureCollection", "features": [...] },
  "roads": { "type": "FeatureCollection", "features": [...] },
  "pois": { "type": "FeatureCollection", "features": [...] }
}
"""

import os
import json
import logging
import math
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)

# ─── PBF Path Resolution ────────────────────────────────────────────────────

DEFAULT_PBF_PATHS = [
    os.environ.get("OSM_PBF_PATH", ""),
    "data/kenya-latest.osm.pbf",
    "/data/kenya-latest.osm.pbf",
    "../data/kenya-latest.osm.pbf",
]

def find_pbf_file() -> Optional[str]:
    """Find the Kenya PBF file in standard locations."""
    for path in DEFAULT_PBF_PATHS:
        if path and os.path.exists(path):
            return path
    return None

# ─── Lazy Pyrosm Import (graceful if not installed) ─────────────────────────

_pyrosm = None
_pbf_reader = None
_pbf_path = None

FEATURE_TYPES = {"buildings", "roads", "pois", "natural"}

def get_pyrosm():
    """Lazy-import Pyrosm. Returns None if not installed."""
    global _pyrosm
    if _pyrosm is None:
        try:
            import pyrosm
            _pyrosm = pyrosm
            logger.info("[osm] Pyrosm loaded successfully")
        except ImportError:
            logger.warning("[osm] Pyrosm not installed. OSM features disabled.")
            _pyrosm = False  # cache the failure
    return _pyrosm if _pyrosm is not False else None

def get_pbf_reader():
    """Get or initialize the Pyrosm PBF reader (loaded once)."""
    global _pbf_reader, _pbf_path
    if _pbf_reader is not None:
        return _pbf_reader

    pyrosm = get_pyrosm()
    if not pyrosm:
        return None

    pbf_path = find_pbf_file()
    if not pbf_path:
        logger.warning(
            "[osm] No PBF file found. Download Kenya extract from "
            "https://download.geofabrik.de/africa/kenya-latest.osm.pbf "
            "and place at data/kenya-latest.osm.pbf"
        )
        return None

    try:
        _pbf_reader = pyrosm.OSM(pbf_path)
        _pbf_path = pbf_path
        logger.info(f"[osm] Loaded PBF: {pbf_path} ({os.path.getsize(pbf_path) / 1e6:.1f} MB)")
        return _pbf_reader
    except Exception as e:
        logger.error(f"[osm] Failed to load PBF: {e}")
        return None

# ─── Bounding Box Filtering ─────────────────────────────────────────────────

def filter_by_bbox(gdf, minlon, minlat, maxlon, maxlat):
    """Filter a GeoDataFrame to a WGS84 bounding box, failing closed on errors."""
    if gdf is None or len(gdf) == 0:
        return gdf
    try:
        from shapely.geometry import box

        if getattr(gdf, "crs", None) is None:
            raise ValueError("OSM feature data has no declared CRS")
        if str(gdf.crs).upper() not in {"EPSG:4326", "OGC:CRS84"}:
            gdf = gdf.to_crs("EPSG:4326")
        if "geometry" not in gdf.columns:
            raise ValueError("OSM feature data has no geometry column")
        bbox = box(minlon, minlat, maxlon, maxlat)
        return gdf[gdf.geometry.intersects(bbox)]
    except Exception as e:
        logger.warning(f"[osm] BBox filter failed: {e}")
        raise RuntimeError("Could not safely filter OSM features to the requested WGS84 bounds") from e

def gdf_to_geojson(gdf):
    """Convert a GeoDataFrame to WGS84 GeoJSON, failing instead of faking empty data."""
    if gdf is None or len(gdf) == 0:
        return {"type": "FeatureCollection", "features": []}
    try:
        if getattr(gdf, "crs", None) is None:
            raise ValueError("OSM feature data has no declared CRS")
        # Work on a copy so serialization never mutates the Pyrosm cache.
        gdf = gdf.copy()
        if str(gdf.crs).upper() not in {"EPSG:4326", "OGC:CRS84"}:
            gdf = gdf.to_crs("EPSG:4326")
        # Drop non-serializable columns
        for col in list(gdf.columns):
            if col != "geometry" and gdf[col].dtype == "object":
                # Convert lists/dicts to strings
                gdf[col] = gdf[col].astype(str)
        features = json.loads(gdf.to_json())
        return features
    except Exception as e:
        logger.error(f"[osm] GeoJSON conversion failed: {e}")
        raise RuntimeError("Could not serialize OSM features as WGS84 GeoJSON") from e


def _extract_feature_collection(feature_type, extractor, minlon, minlat, maxlon, maxlat):
    """Run one Pyrosm extraction with explicit unavailable/error semantics."""
    reader = get_pbf_reader()
    if reader is None:
        raise HTTPException(
            status_code=503,
            detail="Local OSM PBF service is not ready. Check Pyrosm and OSM_PBF_PATH, or use the online OSM context service.",
        )
    try:
        gdf = extractor(reader)
        filtered = filter_by_bbox(gdf, minlon, minlat, maxlon, maxlat)
        return gdf_to_geojson(filtered)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[osm] %s extraction failed", feature_type)
        raise HTTPException(
            status_code=500,
            detail=f"Local OSM {feature_type} extraction failed; no feature data was returned.",
        ) from e

# ─── Feature Extractors ─────────────────────────────────────────────────────

def get_buildings(minlon, minlat, maxlon, maxlat):
    """Extract building footprints within the bounding box."""
    return _extract_feature_collection(
        "buildings", lambda reader: reader.get_buildings(), minlon, minlat, maxlon, maxlat,
    )

def get_roads(minlon, minlat, maxlon, maxlat):
    """Extract road lines within the bounding box."""
    def extract(reader):
        # get_network() returns roads; filter to highway tags
        roads = reader.get_network(network_type="driving")
        if roads is not None and len(roads) > 0:
            # Keep only meaningful road types
            if "highway" in roads.columns:
                road_types = ["motorway", "trunk", "primary", "secondary",
                              "tertiary", "residential", "unclassified",
                              "motorway_link", "trunk_link", "primary_link",
                              "secondary_link", "tertiary_link"]
                roads = roads[roads["highway"].isin(road_types)]
        return roads

    return _extract_feature_collection("roads", extract, minlon, minlat, maxlon, maxlat)

def get_pois(minlon, minlat, maxlon, maxlat):
    """Extract points of interest (schools, hospitals, etc.) within bbox."""
    return _extract_feature_collection(
        "points of interest", lambda reader: reader.get_pois(), minlon, minlat, maxlon, maxlat,
    )

def get_natural(minlon, minlat, maxlon, maxlat):
    """Extract natural features (water bodies, parks, forests)."""
    def extract(reader):
        # get_natural() returns water, forests, parks
        return reader.get_natural()

    return _extract_feature_collection("natural features", extract, minlon, minlat, maxlon, maxlat)

# ─── API Router ─────────────────────────────────────────────────────────────

router = APIRouter(prefix="/osm", tags=["osm"])

@router.get("/features")
async def get_features(
    minlon: float = Query(..., description="Minimum longitude (WGS84)"),
    minlat: float = Query(..., description="Minimum latitude (WGS84)"),
    maxlon: float = Query(..., description="Maximum longitude (WGS84)"),
    maxlat: float = Query(..., description="Maximum latitude (WGS84)"),
    types: str = Query("buildings,roads,pois", description="Comma-separated: buildings,roads,pois,natural"),
):
    """
    Get OSM features within a bounding box from the local PBF extract.

    Returns GeoJSON FeatureCollections for each requested type.
    """
    bbox = (minlon, minlat, maxlon, maxlat)
    if any(not math.isfinite(value) for value in bbox):
        raise HTTPException(status_code=400, detail="Bounding box coordinates must be finite numbers")
    if not (-180 <= minlon <= 180 and -180 <= maxlon <= 180):
        raise HTTPException(status_code=400, detail="Longitude coordinates must be within -180..180")
    if not (-90 <= minlat <= 90 and -90 <= maxlat <= 90):
        raise HTTPException(status_code=400, detail="Latitude coordinates must be within -90..90")
    if minlon >= maxlon or minlat >= maxlat:
        raise HTTPException(status_code=400, detail="Bounding box minimums must be below maximums")

    requested = list(dict.fromkeys(t.strip() for t in types.split(",") if t.strip()))
    unknown = set(requested) - FEATURE_TYPES
    if not requested or unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported or empty feature types: {', '.join(sorted(unknown)) if requested else 'none'}",
        )

    if get_pbf_reader() is None:
        raise HTTPException(
            status_code=503,
            detail="Local OSM PBF service is not ready. Check Pyrosm and OSM_PBF_PATH, or use the online OSM context service.",
        )

    result = {}

    for feature_type in requested:
        if feature_type == "buildings":
            result["buildings"] = get_buildings(minlon, minlat, maxlon, maxlat)
        elif feature_type == "roads":
            result["roads"] = get_roads(minlon, minlat, maxlon, maxlat)
        elif feature_type == "pois":
            result["pois"] = get_pois(minlon, minlat, maxlon, maxlat)
        elif feature_type == "natural":
            result["natural"] = get_natural(minlon, minlat, maxlon, maxlat)

    return {
        "success": True,
        "bbox": {"minlon": minlon, "minlat": minlat, "maxlon": maxlon, "maxlat": maxlat},
        "counts": {k: len(v.get("features", [])) for k, v in result.items()},
        "features": result,
        "pbf_loaded": _pbf_path is not None,
    }

@router.get("/status")
async def get_status():
    """Check if the OSM PBF is loaded and ready."""
    pbf_path = find_pbf_file()
    pyrosm_available = get_pyrosm() is not None
    return {
        "ready": pyrosm_available and pbf_path is not None and _pbf_reader is not None,
        "pyrosm_installed": pyrosm_available,
        "pbf_file_found": pbf_path is not None,
        "pbf_path": pbf_path,
        "pbf_loaded": _pbf_path is not None,
        "pbf_size_mb": (os.path.getsize(pbf_path) / 1e6) if pbf_path else None,
        "setup_instructions": (
            "Download Kenya PBF from https://download.geofabrik.de/africa/kenya-latest.osm.pbf "
            "and place at data/kenya-latest.osm.pbf"
        ) if not pbf_path else None,
    }
