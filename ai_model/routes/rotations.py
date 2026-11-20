from datetime import date, timedelta
from pathlib import Path
import re
from typing import Any

import httpx
import joblib
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from config import get_settings
from models.egypt_model import recommend, recommend_for_features, upcoming_seasons

rotations_router = APIRouter(prefix="/rotation", tags=["Crop Rotation"])
app_settings = get_settings()

# Cache both models separately
_bundles: dict[str, Any | None] = {"egypt": None, "us": None}

EXCLUDED_TERMS = ("wheatgrass", "bulbous", "buffelgrass", "wild ")


def _sanitize_bundle_crops(bundle: dict[str, Any], nation: str) -> dict[str, Any]:
    crops_df = bundle.get("crops")
    if crops_df is None or "COMNAME" not in crops_df.columns:
        return bundle

    allowed = (
        app_settings.EGYPTAIN_CROP_LIST
        if nation == "egypt"
        else app_settings.US_CROP_LIST
    )
    allowed_patterns = [
        re.compile(rf"\b{re.escape(c.strip().lower())}\b") for c in allowed
    ]

    def is_valid_crop(name: Any) -> bool:
        if not isinstance(name, str):
            return False
        lower = name.lower()
        if any(bad in lower for bad in EXCLUDED_TERMS):
            return False
        return any(pat.search(lower) for pat in allowed_patterns)

    filtered = crops_df[crops_df["COMNAME"].apply(is_valid_crop)].copy()

    # Only apply if we actually matched crops (safety fallback)
    if not filtered.empty:
        filtered["COMNAME"] = (
            filtered["COMNAME"]
            .astype(str)
            .apply(lambda s: s.split(",")[0].strip())
        )
        filtered = filtered.drop_duplicates(subset=["COMNAME"], keep="first")
        bundle["crops"] = filtered

    return bundle


def get_bundle(nation: str) -> dict[str, Any]:
    global _bundles
    if _bundles.get(nation) is None:
        if nation == "egypt":
            path = Path(app_settings.EGYPT_MODEL_PATH)
        elif nation == "us":
            path = Path(app_settings.US_MODEL_PATH)
        else:
            raise ValueError(f"Unknown nation: {nation}")

        # Automatically resolve .joblib extension or parent path if config path is slightly off
        if not path.exists() and path.with_suffix(".joblib").exists():
            path = path.with_suffix(".joblib")
        if not path.exists():
            alt_path = (
                Path(__file__).resolve().parents[1]
                / "saved_models"
                / f"{nation}_rotation_model.joblib"
            )
            if alt_path.exists():
                path = alt_path

        if not path.exists():
            raise RuntimeError(f"{nation.capitalize()} model file not found at {path}")

        loaded = joblib.load(path)
        _bundles[nation] = _sanitize_bundle_crops(loaded, nation)

    return _bundles[nation]


def get_nation_from_coords(lat: float, lon: float) -> str:
    # Egypt rough bounding box
    if 21.0 <= lat <= 32.0 and 24.0 <= lon <= 37.0:
        return "egypt"
    # US rough bounding box (Contiguous US)
    elif 24.0 <= lat <= 50.0 and -125.0 <= lon <= -66.0:
        return "us"
    else:
        return "unknown"


class LocationRequest(BaseModel):
    location: str = Field(..., example="sharqia")
    start_date: date = Field(..., example="2026-11-16")
    previous_crop: str | None = Field(default=None, example="alfalfa")
    top_k: int = Field(default=5, ge=1, le=20)


class CoordinateRequest(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0, example=31.04)
    lon: float = Field(..., ge=-180.0, le=180.0, example=30.47)
    start_date: date = Field(..., example="2026-11-16")
    previous_crop: str | None = Field(default=None, example="wheat")
    ndvi_override: float | None = Field(default=None, ge=0.0, le=1.0)
    top_k: int = Field(default=5, ge=1, le=20)


@rotations_router.get("/metadata")
def metadata():
    egypt_bundle = get_bundle("egypt")
    us_bundle = get_bundle("us")
    settings = get_settings()

    egypt_crops = set(egypt_bundle["crops"]["COMNAME"].unique().tolist())
    us_crops = set(us_bundle["crops"]["COMNAME"].unique().tolist())

    return {
        "all_crops": sorted(list(egypt_crops.union(us_crops))),
        "egypt_crops": sorted(list(egypt_crops)),
        "us_crops": sorted(list(us_crops)),
        "egypt_locations": settings.EGYPT_LOCATIONS,
        "us_locations": settings.US_LOCATIONS,
    }


@rotations_router.post("/recommend/location")
def recommend_location(req: LocationRequest):
    loc = req.location.strip().lower()
    settings = get_settings()

    if loc in [l.lower() for l in settings.EGYPT_LOCATIONS]:
        nation = "egypt"
    elif loc in [l.lower() for l in settings.US_LOCATIONS]:
        nation = "us"
    else:
        raise HTTPException(
            status_code=400,
            detail="Location not supported or not found in Egypt/US lists.",
        )

    bundle = get_bundle(nation)
    clim = bundle["climatology"]
    if loc not in set(clim["location"].str.lower()):
        raise HTTPException(
            status_code=400,
            detail=f"Unknown location '{loc}'.",
        )

    try:
        seasons = upcoming_seasons(req.start_date.isoformat(), n=3)
        feats_list = []
        for season, _, _ in seasons:
            row = clim[
                (clim["location"].str.lower() == loc) & (clim["season"] == season)
            ].iloc[0]
            feats_list.append(row.to_dict())

        plans = recommend_for_features(
            bundle=bundle,
            seasons=seasons,
            feats_list=feats_list,
            previous_crop=(
                req.previous_crop.strip().lower() if req.previous_crop else None
            ),
            top_k=req.top_k,
        )
        return {
            "nation": nation,
            "location": req.location,
            "start_date": req.start_date,
            "plans": plans,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@rotations_router.post("/recommend/coordinates")
async def recommend_coordinates(req: CoordinateRequest):
    nation = get_nation_from_coords(req.lat, req.lon)
    if nation == "unknown":
        raise HTTPException(
            status_code=400,
            detail="Coordinates are outside supported regions (Egypt and US).",
        )

    bundle = get_bundle(nation)
    end_dt = date.today() - timedelta(days=3)
    start_dt = end_dt - timedelta(days=365)

    params = {
        "parameters": "T2M,T2M_MIN,T2M_MAX,PRECTOTCORR,GWETTOP",
        "community": "AG",
        "longitude": req.lon,
        "latitude": req.lat,
        "start": start_dt.strftime("%Y%m%d"),
        "end": end_dt.strftime("%Y%m%d"),
        "format": "JSON",
    }

    nasa_url = getattr(
        app_settings,
        "NASA_POWER_URL",
        "https://power.larc.nasa.gov/api/temporal/daily/point",
    )

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(nasa_url, params=params)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="NASA POWER API error")
        payload = resp.json()["properties"]["parameter"]

    df = (
        pd.DataFrame(
            {
                "t2m": pd.Series(payload["T2M"]),
                "t2m_min": pd.Series(payload["T2M_MIN"]),
                "t2m_max": pd.Series(payload["T2M_MAX"]),
                "precip": pd.Series(payload["PRECTOTCORR"]),
                "sm": pd.Series(payload["GWETTOP"]),
            }
        )
        .replace(-999.0, np.nan)
        .dropna()
    )

    if df.empty:
        raise HTTPException(
            status_code=422, detail="No valid NASA POWER data for coordinates."
        )

    df.index = pd.to_datetime(df.index, format="%Y%m%d")
    df["season"] = np.where(
        df.index.month.isin([11, 12, 1, 2, 3, 4]), "winter", "summer"
    )

    # upcoming_seasons returns list of (season, year, label) 3-tuples required by recommend_for_features
    seasons = upcoming_seasons(req.start_date.isoformat(), n=2)

    feats_list = []
    for s, _, _ in seasons:
        sub = df[df["season"] == s]
        if sub.empty:
            sub = df
        sm_val = float(sub["sm"].mean()) if not sub.empty else 0.20
        ndvi_val = (
            req.ndvi_override
            if req.ndvi_override is not None
            else float(np.clip(0.15 + sm_val * 1.1, 0.1, 0.85))
        )
        feats_list.append(
            {
                "lat": req.lat,
                "lon": req.lon,
                "t_mean": float(sub["t2m"].mean()),
                "t_min_mean": float(sub["t2m_min"].mean()),
                "t_max_mean": float(sub["t2m_max"].mean()),
                "t_min_abs": float(sub["t2m_min"].min()),
                "t_max_abs": float(sub["t2m_max"].max()),
                "ndvi_mean": ndvi_val,
                "precip_total": float(sub["precip"].sum()),
                "sm_mean": sm_val,
            }
        )

    try:
        plans = recommend_for_features(
            bundle=bundle,
            seasons=seasons,
            feats_list=feats_list,
            previous_crop=(
                req.previous_crop.strip().lower() if req.previous_crop else None
            ),
            top_k=req.top_k,
        )
        return {
            "nation": nation,
            "coordinates": {"lat": req.lat, "lon": req.lon},
            "seasons": [label for _, _, label in seasons],
            "plans": plans,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))