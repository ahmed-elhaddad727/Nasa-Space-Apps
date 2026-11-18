from datetime import date, timedelta
from pathlib import Path
from typing import Any

import httpx
import joblib
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from config import get_settings
from models.egypt_model import recommend, recommend_for_features

rotations_router = APIRouter(prefix="/rotation", tags=["Crop Rotation"])
app_settings = get_settings()


_bundle: dict[str, Any] | None = None


def get_bundle() -> dict[str, Any]:
    global _bundle
    if _bundle is None:
        if not app_settings.MODEL_PATH.exists():
            raise RuntimeError(f"Model file not found at {app_settings.MODEL_PATH}")
        _bundle = joblib.load(app_settings.MODEL_PATH)
    return _bundle


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
    bundle = get_bundle()
    settings = get_settings()
    return {
        "crops": sorted(bundle["crops"]["COMNAME"].unique().tolist()),
        "egypt_locations": settings.EGYPT_LOCATIONS,
        "us_locations": settings.US_LOCATIONS,
    }


@rotations_router.post("/recommend/location")
def recommend_location(req: LocationRequest):
    try:
        plans = recommend(
            location=req.location.strip().lower(),
            start_date=req.start_date.isoformat(),
            previous_crop=(
                req.previous_crop.strip().lower() if req.previous_crop else None
            ),
            top_k=req.top_k,
        )
        return {"location": req.location, "start_date": req.start_date, "plans": plans}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@rotations_router.post("/recommend/coordinates")
async def recommend_coordinates(req: CoordinateRequest):
    bundle = get_bundle()
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

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(app_settings.NASA_POWER_URL, params=params)
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

    first_season = (
        "winter" if req.start_date.month in [11, 12, 1, 2, 3, 4] else "summer"
    )
    second_season = "summer" if first_season == "winter" else "winter"
    seasons = [first_season, second_season]

    feats_list = []
    for s in seasons:
        sub = df[df["season"] == s]
        sm_val = float(sub["sm"].mean()) if not sub.empty else 0.20
        ndvi_val = (
            req.ndvi_override
            if req.ndvi_override is not None
            else float(np.clip(0.15 + sm_val * 1.1, 0.1, 0.85))
        )
        feats_list.append(
            {
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
            "coordinates": {"lat": req.lat, "lon": req.lon},
            "seasons": seasons,
            "plans": plans,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
