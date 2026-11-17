import os
import time
from pathlib import Path

import ee
import pandas as pd
from pathlib import Path
import sys

repo_root = Path(__file__).resolve().parents[3]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

from ai_model.config import get_settings

app_settings = get_settings()
try:
    ee.Initialize(project=app_settings.GOOGLE_PROJECT_ID)
except Exception:
    print(
        "Earth Engine is not initialized. Run ee.Authenticate() once in a browser, "
        "then rerun this cell."
    )


def get_indicators(LOCATIONS, region):
    OUT_PATH = Path(f"data/{region}/{region}_climate_soil_data")
    full_days = pd.DatetimeIndex(app_settings.FULL_DAYS)
    start = full_days.min().normalize()
    end = full_days.max().normalize()
    end_excl = end + pd.Timedelta(days=1)

    cache_dir = app_settings.CACHE_DIR
    out_path = OUT_PATH
    cache_dir.mkdir(parents=True, exist_ok=True)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    def get_series(asset, bands, point, scale, months, retries=3):
        if isinstance(bands, str):
            bands = [bands]

        col_all = ee.ImageCollection(asset).select(bands)
        frames = []

        s = start
        while s < end_excl:
            e = min(s + pd.DateOffset(months=months), end_excl)
            data = None

            for attempt in range(retries):
                try:
                    data = (
                        col_all.filterDate(
                            s.strftime("%Y-%m-%d"), e.strftime("%Y-%m-%d")
                        )
                        .getRegion(point, scale)
                        .getInfo()
                    )
                    break
                except Exception as ex:
                    if attempt == retries - 1:
                        print(f"   ! skipped {s:%Y-%m} ({bands}): {ex}")
                    else:
                        time.sleep(3)

            s = e
            if not data or len(data) < 2:
                continue

            df = pd.DataFrame(data[1:], columns=data[0])
            frames.append(df[["time", *bands]])

        if not frames:
            return pd.DataFrame(columns=bands, index=pd.DatetimeIndex([]), dtype=float)

        df = pd.concat(frames)
        out = df[bands].apply(pd.to_numeric, errors="coerce")
        out.index = pd.to_datetime(df["time"], unit="ms")
        return out.sort_index()

    def daily(series, how="mean", interp_limit=None):
        if series.empty:
            return pd.Series(index=full_days, dtype=float)

        d = (
            series.resample("D").sum(min_count=1)
            if how == "sum"
            else series.resample("D").mean()
        )
        d = d.reindex(full_days)
        if interp_limit:
            d = d.interpolate(method="time", limit=interp_limit)
        return d

    all_frames = []

    for name, (lon, lat) in LOCATIONS.items():
        cache_file = cache_dir / f"{region}_{name}.csv"

        if cache_file.exists():
            print(f"\n=== {name}: loaded from cache ===")
            all_frames.append(
                pd.read_csv(cache_file, index_col="date", parse_dates=True)
            )
            continue

        print(f"\n=== {name} ({lon}, {lat}) ===")
        point = ee.Geometry.Point([lon, lat])

        print(" air temperature (ERA5-Land)...")
        era = (
            get_series(
                app_settings.ERA5,
                ["temperature_2m", "temperature_2m_min", "temperature_2m_max"],
                point,
                11132,
                months=12,
            )
            - 273.15
        )

        print(" land surface temperature (MODIS LST)...")
        lst = (
            get_series(app_settings.LST, "LST_Day_1km", point, 1000, months=12) * 0.02
            - 273.15
        )

        print(" NDVI...")
        ndvi = get_series(app_settings.NDVI, "NDVI", point, 250, months=12) * 0.0001

        print(" precipitation (half-hourly, slowest)...")
        precip = get_series(app_settings.IMERG, "precipitation", point, 10000, months=1)
        precip = precip * 0.5
        precip = precip.where(precip >= 0)

        print(" soil moisture...")
        smap = get_series(app_settings.SMAP, "sm_surface", point, 9000, months=1)

        df = pd.DataFrame(
            {
                "Temperature_C": daily(era["temperature_2m"], "mean"),
                "Temp_Min_C": daily(era["temperature_2m_min"], "mean"),
                "Temp_Max_C": daily(era["temperature_2m_max"], "mean"),
                "LST_Day_C": daily(lst["LST_Day_1km"], "mean", interp_limit=16),
                "NDVI": daily(ndvi["NDVI"], "mean", interp_limit=32),
                "Precipitation_mm": daily(precip["precipitation"], "sum"),
                "Soil_Moisture_m3m3": daily(smap["sm_surface"], "mean", interp_limit=3),
            }
        )
        df.index.name = "date"
        df["location"] = name
        df["lon"] = lon
        df["lat"] = lat
        df["month"] = df.index.month
        df["day_of_year"] = df.index.dayofyear

        sm_max = df["Soil_Moisture_m3m3"].max()
        if pd.notna(sm_max) and sm_max > 1:
            print(
                f"   ! WARNING: soil moisture max = {sm_max:.2f}, this is not m3/m3 "
                f"(probably mm). Check the SMAP asset/band in your config."
            )

        df.to_csv(cache_file)
        print(f" saved {cache_file} ({len(df)} rows)")
        all_frames.append(df)

    dataset = pd.concat(all_frames)
    dataset.to_csv(out_path)

    print("\nSample:")
    print(dataset.head())
    print("\nMissing values per column:")
    print(dataset.isna().sum())
    print(f"\nTotal rows: {len(dataset)}")
