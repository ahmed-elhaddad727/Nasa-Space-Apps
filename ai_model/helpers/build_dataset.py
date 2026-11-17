"""
this file is responsible for building the training dataset
"""

from pathlib import Path
import sys

repo_root = Path(__file__).resolve().parents[3]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

from ai_model.config import get_settings

app_settings = get_settings()

import numpy as np
import pandas as pd
from server.models.egypt_model import CROPS_CSV, INDICATORS_CSV, SEASON_OF_MONTH


def add_season(df, SEASON_OF_MONTH, date_col="date"):
    d = df[date_col]
    df["season"] = d.dt.month.map(SEASON_OF_MONTH)
    df["season_year"] = np.where(
        (df["season"] == "winter") & (d.dt.month <= 4), d.dt.year - 1, d.dt.year
    )
    return df


def load_indicators(SEASON_OF_MONTH, INDICATOR_FILES):
    ind = pd.concat(
        [pd.read_csv(f, parse_dates=["date"]) for f in INDICATOR_FILES],
        ignore_index=True,
    )
    ind = ind.sort_values(["location", "date"]).reset_index(drop=True)

    if not {"Temp_Min_C", "Temp_Max_C"} <= set(ind.columns):
        print("WARNING: no min/max temperature, using the daily mean for both.")
        ind["Temp_Min_C"] = ind["Temp_Max_C"] = ind["Temperature_C"]

    g = ind.groupby("location")
    ind["precip_30d"] = g["Precipitation_mm"].transform(
        lambda s: s.rolling(30, min_periods=30).sum()
    )
    ind["ndvi_14d"] = g["NDVI"].transform(lambda s: s.rolling(14, min_periods=1).mean())
    ind["sm_7d"] = g["Soil_Moisture_m3m3"].transform(
        lambda s: s.rolling(7, min_periods=1).mean()
    )

    print("Non-empty values per column:")
    print(
        ind[
            [
                "Temperature_C",
                "Temp_Min_C",
                "Temp_Max_C",
                "NDVI",
                "Precipitation_mm",
                "Soil_Moisture_m3m3",
            ]
        ]
        .notna()
        .sum()
        .to_string()
    )
    return add_season(ind, SEASON_OF_MONTH)


def load_crops(CROPS_CSV):
    crops = pd.read_csv(CROPS_CSV)
    crops.columns = crops.columns.str.strip().str.upper()

    crops["COMNAME"] = crops["COMNAME"].astype(str).str.lower()
    keep = ["COMNAME", "FAMNAME"] + app_settings.CROP_PARAMS
    crops = crops[[c for c in keep if c in crops.columns]].copy()

    if "FAMNAME" not in crops.columns:
        crops["FAMNAME"] = crops["COMNAME"]
    crops["FAMNAME"] = crops["FAMNAME"].fillna(crops["COMNAME"]).astype(str).str.lower()

    for c in app_settings.CROP_PARAMS:
        if c not in crops.columns:
            crops[c] = np.nan
        crops[c] = pd.to_numeric(crops[c], errors="coerce")

    crops = crops.dropna(subset=["TOPMN", "TOPMX", "TMIN", "TMAX"])
    return crops.drop_duplicates("COMNAME").reset_index(drop=True)


def seasonal_climate(SEASON_DAYS, MIN_SEASON_COVERAGE, ind):
    ind = ind.copy()
    ind["tmin_lt0"] = (ind["Temp_Min_C"] < 0).astype(float)
    ind["tmin_lt5"] = (ind["Temp_Min_C"] < 5).astype(float)
    ind["tmax_gt35"] = (ind["Temp_Max_C"] > 35).astype(float)
    ind["tmax_gt40"] = (ind["Temp_Max_C"] > 40).astype(float)

    out = (
        ind.groupby(["location", "season", "season_year"])
        .agg(
            lat=("lat", "first"),
            lon=("lon", "first"),
            n_days=("Temperature_C", "count"),
            t_mean=("Temperature_C", "mean"),
            t_std=("Temperature_C", "std"),
            t_min_mean=("Temp_Min_C", "mean"),
            t_max_mean=("Temp_Max_C", "mean"),
            t_min_abs=("Temp_Min_C", "min"),
            t_max_abs=("Temp_Max_C", "max"),
            t_min_p05=("Temp_Min_C", lambda s: s.quantile(0.05)),
            t_max_p95=("Temp_Max_C", lambda s: s.quantile(0.95)),
            frac_tmin_lt0=("tmin_lt0", "mean"),
            frac_tmin_lt5=("tmin_lt5", "mean"),
            frac_tmax_gt35=("tmax_gt35", "mean"),
            frac_tmax_gt40=("tmax_gt40", "mean"),
            ndvi_mean=("NDVI", "mean"),
            precip_mean=("Precipitation_mm", "mean"),
            sm_mean=("Soil_Moisture_m3m3", "mean"),
        )
        .reset_index()
    )
    out["precip_total"] = out["precip_mean"] * out["season"].map(SEASON_DAYS)
    out = out[out["n_days"] >= MIN_SEASON_COVERAGE * out["season"].map(SEASON_DAYS)]
    return out.drop(columns=["n_days", "precip_mean"])


def score_location(d, crops):
    """Daily suitability / irrigation deficit for every crop at one location,
    averaged per season. Same logic as file 3, without the giant cross join."""
    col = lambda name: d[name].to_numpy()[:, None]  # days x 1
    row = lambda name: crops[name].to_numpy()[None, :]  # 1 x crops

    t, tn, tx = col("Temperature_C"), col("Temp_Min_C"), col("Temp_Max_C")
    topmn, topmx, tmin, tmax, ktmp = (
        row(c) for c in ["TOPMN", "TOPMX", "TMIN", "TMAX", "KTMP"]
    )

    with np.errstate(divide="ignore", invalid="ignore"):
        temp_score = np.select(
            [
                (t >= topmn) & (t <= topmx),
                (t > tmin) & (t < topmn),
                (t > topmx) & (t < tmax),
            ],
            [
                100.0,
                (t - tmin) / (topmn - tmin) * 100.0,
                (tmax - t) / (tmax - topmx) * 100.0,
            ],
            default=0.0,
        )
        temp_score = np.where(
            tx > tmax, np.maximum(0.0, temp_score - (tx - tmax) * 5.0), temp_score
        )

        ndvi_s = np.clip(col("ndvi_14d") / app_settings.NDVI_FULL, 0, 1) * 100
        moist_s = (
            np.clip(
                (col("sm_7d") - app_settings.SM_WILT)
                / (app_settings.SM_OPT - app_settings.SM_WILT),
                0,
                1,
            )
            * 100
        )
        modulator = (
            (1 - app_settings.W_NDVI - app_settings.W_MOIST)
            + app_settings.W_NDVI * ndvi_s / 100
            + app_settings.W_MOIST * moist_s / 100
        )
        suit = temp_score * modulator

        g_months = np.maximum(1.0, crops["GMIN"].fillna(120).to_numpy() / 30.0)
        need = crops["ROPMN"].to_numpy() / g_months
        need = np.where(np.isnan(need), 100.0, need)[None, :]
        credit = (
            np.clip(col("sm_7d") - app_settings.SM_WILT, 0, None)
            * app_settings.ROOT_DEPTH_MM
            * app_settings.SOIL_CREDIT
        )
        deficit = np.maximum(0.0, need - col("precip_30d") - credit)

        frost = ~np.isnan(ktmp) & (tn <= ktmp)
    suit = np.where(frost, 0.0, suit)
    deficit = np.where(frost, 0.0, deficit)

    names = crops["COMNAME"].tolist()
    keys = [d["season"].to_numpy(), d["season_year"].to_numpy()]
    key_names = ["season", "season_year"]

    def season_mean(arr, value_name):
        wide = pd.DataFrame(arr, columns=names)
        wide.index = pd.MultiIndex.from_arrays(keys, names=key_names)
        m = wide.groupby(level=key_names).mean()
        return m.reset_index().melt(
            id_vars=key_names, var_name="COMNAME", value_name=value_name
        )

    out = season_mean(suit, "suitability").merge(
        season_mean(deficit, "irrigation_deficit_mm"), on=key_names + ["COMNAME"]
    )
    sizes = (
        pd.DataFrame({"season": keys[0], "season_year": keys[1]})
        .groupby(key_names)
        .size()
        .rename("n_days")
        .reset_index()
    )
    return out.merge(sizes, on=key_names)


def build(
    SEASON_OF_MONTH,
    SEASON_DAYS,
    MIN_SEASON_COVERAGE,
    CLIMATE_FEATURES,
    INDICATORS_CSV,
    CROPS_CSV,
    OUT_CSV,
):
    ind = load_indicators(SEASON_OF_MONTH, INDICATORS_CSV)
    crops = load_crops(CROPS_CSV)
    print(f"\n{ind['location'].nunique()} locations, {len(crops)} crops")

    valid = ind.dropna(subset=app_settings.REQUIRED_DAILY)
    if valid.empty:
        raise ValueError(
            "No complete daily rows. Check which indicator column is empty "
            "(see the non-empty counts above)."
        )

    parts = []
    for loc, d in valid.groupby("location"):
        res = score_location(d.reset_index(drop=True), crops)
        res["location"] = loc
        parts.append(res)
    labels = pd.concat(parts, ignore_index=True)
    labels = labels[
        labels["n_days"] >= MIN_SEASON_COVERAGE * labels["season"].map(SEASON_DAYS)
    ]

    clim = seasonal_climate(SEASON_DAYS, MIN_SEASON_COVERAGE, valid)
    df = (
        labels.drop(columns="n_days")
        .merge(clim, on=["location", "season", "season_year"])
        .merge(crops, on="COMNAME")
    )
    df["season_is_winter"] = (df["season"] == "winter").astype(int)
    df["suitability"] = df["suitability"].round(2)
    df["irrigation_deficit_mm"] = df["irrigation_deficit_mm"].round(2)
    df = df.dropna(subset=["suitability", "irrigation_deficit_mm"] + CLIMATE_FEATURES)

    Path(OUT_CSV).parent.mkdir(parents=True, exist_ok=True)
    df = df.rename(columns={"suitability": "suitability_score"})
    start_month = np.where(df["season"] == "winter", "11-01", "05-01")
    df["date"] = pd.to_datetime(df["season_year"].astype(str) + "-" + start_month)
    df.to_csv(OUT_CSV, index=False)

    print(f"\nSaved {OUT_CSV}: {len(df):,} rows")
    print(
        df.groupby(["location", "season"])["season_year"]
        .nunique()
        .rename("season-years")
        .to_string()
    )
    print("\nLabel summary:")
    print(
        df[["suitability_score", "irrigation_deficit_mm"]]
        .describe()
        .round(2)
        .to_string()
    )
    return df
