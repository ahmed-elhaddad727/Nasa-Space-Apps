"""
global_indicators.py

Extracts seasonal climate / soil / vegetation indicators for ANY land point on Earth
from Google Earth Engine (ERA5-Land daily + MODIS NDVI).

Seasons are 6-month windows, hemisphere-aware (so "winter" is always the cool half):
    Northern hemisphere : winter = Nov-Apr   (season_year = year it starts), summer = May-Oct
    Southern hemisphere : winter = May-Oct,                                   summer = Nov-Apr

Usage:
    python -m server.models.global_indicators --n-points 2000 --years 2015 2024 --project YOUR_GEE_PROJECT
    python -m server.models.global_indicators --points-csv my_points.csv      # columns: lat, lon[, location]

Output: data/global/global_climate_soil_data.csv  (one row per location x season x season_year)

From code (e.g. your web backend):
    from server.models.global_indicators import point_climatology
    feats = point_climatology(30.6, 30.47)   # {"winter": {...}, "summer": {...}}
"""

import argparse
import time
from pathlib import Path

import ee
import numpy as np
import pandas as pd
from pathlib import Path
import sys

repo_root = Path(__file__).resolve().parents[3]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))
import ee

from ai_model.config import get_settings

app_settings = get_settings()
print(app_settings.GOOGLE_PROJECT_ID)
ee.Authenticate()
ee.Initialize(project="nasa-project-514716")
try:
    ROOT_DIR = Path(__file__).resolve().parents[2]
except NameError:
    ROOT_DIR = Path.cwd()

OUT_CSV = ROOT_DIR / "data/global/global_climate_soil_data.csv"

ERA5 = "ECMWF/ERA5_LAND/DAILY_AGGR"  # ~11 km, global, daily, 1950-present
MODIS_NDVI = "MODIS/061/MOD13A2"  # 1 km, 16-day, 2000-present
LANDCOVER = "MODIS/061/MCD12Q1"
ERA5_SCALE = 11132  # metres

CLIMATE_FEATURES = [
    "t_mean",
    "t_min_mean",
    "t_max_mean",
    "t_min_abs",
    "t_max_abs",
    "ndvi_mean",
    "precip_total",
    "sm_mean",
    "t_std",
    "t_min_p05",
    "t_max_p95",
    "frac_tmin_lt0",
    "frac_tmin_lt5",
    "frac_tmax_gt35",
    "frac_tmax_gt40",
]


# ---------------- Seasons ----------------
def hemisphere(lat):
    return "N" if lat >= 0 else "S"


def season_window(season, year, hemi):
    """(start, end_exclusive) of a 6-month season. `year` is the year the season starts."""
    north = hemi == "N"
    start_month = {"winter": 11 if north else 5, "summer": 5 if north else 11}[season]
    start = pd.Timestamp(year=year, month=start_month, day=1)
    return start, start + pd.DateOffset(months=6)


def season_of_date(date, hemi):
    """Season and season_year that contain `date`."""
    d = pd.Timestamp(date)
    m = d.month
    if hemi == "N":
        if m >= 11:
            return "winter", d.year
        if m <= 4:
            return "winter", d.year - 1
        return "summer", d.year
    if 5 <= m <= 10:
        return "winter", d.year
    return "summer", (d.year if m >= 11 else d.year - 1)


# ---------------- Earth Engine ----------------
def init_ee(project=None):
    try:
        ee.Initialize(project=project)
    except Exception:
        ee.Authenticate()
        ee.Initialize(project=project)


def season_image(start, end):
    """One multi-band image holding every seasonal indicator for [start, end)."""
    s, e = start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")
    d = ee.ImageCollection(ERA5).filterDate(s, e)

    def k2c(img):
        return img.subtract(273.15)

    tm = d.select("temperature_2m").map(k2c)
    tn = d.select("temperature_2m_min").map(k2c)
    tx = d.select("temperature_2m_max").map(k2c)

    def frac(col, fn):
        return col.map(fn).mean()

    bands = [
        tm.mean().rename("t_mean"),
        tn.mean().rename("t_min_mean"),
        tx.mean().rename("t_max_mean"),
        tn.min().rename("t_min_abs"),
        tx.max().rename("t_max_abs"),
        tm.reduce(ee.Reducer.stdDev()).rename("t_std"),
        tn.reduce(ee.Reducer.percentile([5])).rename("t_min_p05"),
        tx.reduce(ee.Reducer.percentile([95])).rename("t_max_p95"),
        frac(tn, lambda i: i.lt(0)).rename("frac_tmin_lt0"),
        frac(tn, lambda i: i.lt(5)).rename("frac_tmin_lt5"),
        frac(tx, lambda i: i.gt(35)).rename("frac_tmax_gt35"),
        frac(tx, lambda i: i.gt(40)).rename("frac_tmax_gt40"),
        d.select("total_precipitation_sum")
        .sum()
        .multiply(1000)
        .rename("precip_total"),  # mm
        d.select("volumetric_soil_water_layer_1").mean().rename("sm_mean"),
    ]

    proj = ee.Image(d.first()).select(0).projection()
    ndvi = (
        ee.ImageCollection(MODIS_NDVI)
        .filterDate(s, e)
        .select("NDVI")
        .mean()
        .multiply(0.0001)
        .reduceResolution(ee.Reducer.mean(), maxPixels=1024)
        .reproject(proj)
        .rename("ndvi_mean")
    )
    return ee.Image.cat(bands + [ndvi]).select(CLIMATE_FEATURES)


def _get_info(fc, tries=4):
    for k in range(tries):
        try:
            return fc.getInfo()
        except Exception as ex:  # quota / transient errors
            if k == tries - 1:
                raise
            wait = 5 * 2**k
            print(f"  EE error ({ex}); retrying in {wait}s")
            time.sleep(wait)


def extract_season(points, season, year, batch=400):
    """points: DataFrame[location, lat, lon], all in the same hemisphere."""
    hemi = hemisphere(points["lat"].iloc[0])
    start, end = season_window(season, year, hemi)
    img = season_image(start, end)
    rows = []
    for i in range(0, len(points), batch):
        chunk = points.iloc[i : i + batch]
        fc = ee.FeatureCollection(
            [
                ee.Feature(ee.Geometry.Point([r.lon, r.lat]), {"location": r.location})
                for r in chunk.itertuples()
            ]
        )
        out = img.reduceRegions(fc, ee.Reducer.first(), scale=ERA5_SCALE)
        rows += [f["properties"] for f in _get_info(out)["features"]]
    df = pd.DataFrame(rows).merge(points, on="location")
    df["season"] = season
    df["season_year"] = year
    df["season_is_winter"] = int(season == "winter")
    df["season_days"] = (end - start).days
    return df


# ---------------- Locations ----------------
def sample_land_points(n, seed=42, lat_range=(-55, 65), cropland_share=0.5):
    """Random land points, half on cropland, snapped to the ERA5 0.1 degree grid."""
    region = ee.Geometry.Rectangle(
        [-180, lat_range[0], 180, lat_range[1]], geodesic=False
    )
    lc = (
        ee.ImageCollection(LANDCOVER)
        .filterDate("2020-01-01", "2021-01-01")
        .first()
        .select("LC_Type1")
    )
    land = lc.neq(17).And(lc.neq(15))  # not water, not permanent snow/ice
    crop = lc.eq(12).Or(lc.eq(14))  # cropland, cropland/natural mosaic

    def draw(mask, k, sd):
        fc = lc.updateMask(mask).sample(
            region=region, scale=10000, numPixels=k, seed=sd, geometries=True
        )
        return [f["geometry"]["coordinates"] for f in _get_info(fc)["features"]]

    n_crop = int(n * cropland_share)
    coords = draw(crop, n_crop, seed) + draw(land, n - n_crop, seed + 1)
    df = pd.DataFrame(coords, columns=["lon", "lat"])
    df["lat"] = (df["lat"] / 0.1).round() * 0.1
    df["lon"] = (df["lon"] / 0.1).round() * 0.1
    return finalize_points(df.drop_duplicates(["lat", "lon"]))


def finalize_points(df):
    df = df.copy()
    df["lat"] = df["lat"].round(2)
    df["lon"] = df["lon"].round(2)
    if "location" not in df.columns:
        df["location"] = [f"p{a:+.2f}_{o:+.2f}" for a, o in zip(df["lat"], df["lon"])]
    return df[["location", "lat", "lon"]].reset_index(drop=True)


# ---------------- Batch extraction ----------------
def build_indicators(points, years, out_csv=OUT_CSV):
    """Resumable: skips (hemisphere, season, season_year) blocks already in out_csv."""
    out_csv = Path(out_csv)
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    done = set()
    if out_csv.exists():
        old = pd.read_csv(out_csv, usecols=["lat", "season", "season_year"])
        done = {
            (hemisphere(la), s, y)
            for la, s, y in old.drop_duplicates().itertuples(index=False)
        }

    for hemi, grp in points.groupby(points["lat"].map(hemisphere)):
        for year in years:
            for season in ("winter", "summer"):
                if (hemi, season, year) in done:
                    continue
                start, end = season_window(season, year, hemi)
                if end > pd.Timestamp.now() - pd.Timedelta(days=10):
                    continue  # season not finished yet
                print(f"{hemi} {season} {year}: {len(grp)} points")
                df = extract_season(grp.reset_index(drop=True), season, year)
                df.to_csv(out_csv, mode="a", header=not out_csv.exists(), index=False)
    return pd.read_csv(out_csv)


def clean_indicators(df):
    """Drop points with missing core indicators (e.g. ocean cells, no NDVI)."""
    core = ["t_mean", "t_min_abs", "t_max_abs", "precip_total", "sm_mean", "ndvi_mean"]
    df = df.dropna(subset=core).copy()
    df["ndvi_mean"] = df["ndvi_mean"].clip(0, 1)
    return df


# ---------------- Single point (for the web backend) ----------------
def point_climatology(lat, lon, years=range(2015, 2025)):
    """Mean seasonal indicators over `years` for one point -> {"winter": {...}, "summer": {...}}."""
    pts = finalize_points(pd.DataFrame({"lat": [lat], "lon": [lon]}))
    hemi = hemisphere(lat)
    out = {}
    for season in ("winter", "summer"):
        frames = [extract_season(pts, season, y) for y in years]
        d = pd.concat(frames)
        feats = d[CLIMATE_FEATURES].mean().to_dict()
        feats.update(
            lat=float(lat), lon=float(lon), season_days=float(d["season_days"].mean())
        )
        out[season] = feats
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default=None, help="Earth Engine cloud project")
    ap.add_argument("--n-points", type=int, default=2000)
    ap.add_argument(
        "--years", type=int, nargs=2, default=[2015, 2024], metavar=("FROM", "TO")
    )
    ap.add_argument("--points-csv", default=None)
    ap.add_argument("--out", default=str(OUT_CSV))
    a = ap.parse_args()

    init_ee(a.project)
    pts = (
        finalize_points(pd.read_csv(a.points_csv))
        if a.points_csv
        else sample_land_points(a.n_points)
    )
    print(f"{len(pts)} locations")
    df = build_indicators(pts, range(a.years[0], a.years[1] + 1), a.out)
    df = clean_indicators(df)
    df.to_csv(a.out, index=False)
    print(f"Saved {len(df):,} rows -> {a.out}")
