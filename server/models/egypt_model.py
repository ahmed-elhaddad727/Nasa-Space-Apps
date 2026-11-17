# %%
"""
rotation_model.py

  python rotation_model.py train
  python rotation_model.py recommend --location Cairo --start 2026-11-16 --prev wheat
"""

import argparse
import itertools
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score
import sys

# ---------------- Paths ----------------
TRAINING_CSV = "data/egypt_training_data.csv"
CROPS_CSV = "data/egypt/egypt_EcoCrop_DB.csv"
INDICATORS_CSV = "data/egypt/egypt_climate_soil_data.csv"
ROOT_DIR = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT_DIR / "saved_models" / "egypt_rotation_model.joblib"
SCORES_PATH = "saved_models/egypt_model_scores.json"

# ---------------- Seasons ----------------
SEASON_OF_MONTH = {
    11: "winter",
    12: "winter",
    1: "winter",
    2: "winter",
    3: "winter",
    4: "winter",
    5: "summer",
    6: "summer",
    7: "summer",
    8: "summer",
    9: "summer",
    10: "summer",
}
SEASON_DAYS = {"winter": 181, "summer": 184}

# ---------------- Features ----------------
CLIMATE_FEATURES = [
    "t_mean",
    "t_min_mean",
    "t_max_mean",
    "t_min_abs",
    "t_max_abs",
    "ndvi_mean",
    "precip_total",
    "sm_mean",
]
CROP_PARAMS = ["TOPMN", "TOPMX", "TMIN", "TMAX", "KTMP", "GMIN", "ROPMN"]
FEATURES = ["season_is_winter", "lat", "lon"] + CLIMATE_FEATURES + CROP_PARAMS
TARGETS = ["suitability", "irrigation_deficit_mm"]

WATER_WEIGHT = 0.15
MIN_SUITABILITY = 30
SAME_CROP_FACTOR = 0.5
SAME_FAMILY_FACTOR = 0.7
LEGUME_BONUS = 1.10
LEGUME_FAMILIES = {"fabaceae", "leguminosae"}


# =====================================================================
# Data preparation
# =====================================================================
def add_season(df, date_col="date"):
    """Adds `season` and `season_year` (winter Nov-Apr belongs to the year it starts)."""
    d = df[date_col]
    df["season"] = d.dt.month.map(SEASON_OF_MONTH)
    df["season_year"] = np.where(
        (df["season"] == "winter") & (d.dt.month <= 4), d.dt.year - 1, d.dt.year
    )
    return df


def seasonal_climate():
    """One row per location x season x season_year with aggregated indicators."""
    ind = pd.read_csv(INDICATORS_CSV, parse_dates=["date"])
    if not {"Temp_Min_C", "Temp_Max_C"} <= set(ind.columns):
        ind["Temp_Min_C"] = ind["Temp_Max_C"] = ind["Temperature_C"]
    ind = add_season(ind)

    out = (
        ind.groupby(["location", "season", "season_year"])
        .agg(
            lat=("lat", "first"),
            lon=("lon", "first"),
            n_days=("Temperature_C", "count"),
            t_mean=("Temperature_C", "mean"),
            t_min_mean=("Temp_Min_C", "mean"),
            t_max_mean=("Temp_Max_C", "mean"),
            t_min_abs=("Temp_Min_C", "min"),
            t_max_abs=("Temp_Max_C", "max"),
            ndvi_mean=("NDVI", "mean"),
            precip_mean=("Precipitation_mm", "mean"),
            sm_mean=("Soil_Moisture_m3m3", "mean"),
        )
        .reset_index()
    )
    out["precip_total"] = out["precip_mean"] * out["season"].map(SEASON_DAYS)
    # keep only (almost) complete seasons
    out = out[out["n_days"] >= 0.8 * out["season"].map(SEASON_DAYS)]
    return out.drop(columns=["n_days", "precip_mean"])


def seasonal_labels(chunksize=2_000_000):
    """Aggregates the big daily training file to season-level labels, chunk by chunk."""
    keys = ["location", "season", "season_year", "COMNAME"]
    use = ["date", "location", "COMNAME", "suitability_score", "irrigation_deficit_mm"]

    parts = []
    for chunk in pd.read_csv(
        TRAINING_CSV, usecols=use, parse_dates=["date"], chunksize=chunksize
    ):
        chunk = add_season(chunk)
        chunk["COMNAME"] = chunk["COMNAME"].astype(str).str.lower()
        parts.append(
            chunk.groupby(keys)
            .agg(
                suit_sum=("suitability_score", "sum"),
                def_sum=("irrigation_deficit_mm", "sum"),
                n=("suitability_score", "count"),
            )
            .reset_index()
        )
    lab = pd.concat(parts).groupby(keys, as_index=False).sum()
    lab["suitability"] = lab["suit_sum"] / lab["n"]
    lab["irrigation_deficit_mm"] = lab["def_sum"] / lab["n"]
    return lab[keys + TARGETS]


def load_crops():
    crops = pd.read_csv(CROPS_CSV)
    crops["COMNAME"] = crops["COMNAME"].astype(str).str.lower()
    keep = ["COMNAME", "FAMNAME"] + CROP_PARAMS
    crops = crops[[c for c in keep if c in crops.columns]].copy()
    if "FAMNAME" not in crops.columns:
        crops["FAMNAME"] = crops["COMNAME"]  # no family info: no family rule
    crops["FAMNAME"] = crops["FAMNAME"].fillna(crops["COMNAME"]).astype(str).str.lower()
    for c in CROP_PARAMS:
        crops[c] = pd.to_numeric(crops[c], errors="coerce")
    crops = crops.dropna(subset=["TOPMN", "TOPMX", "TMIN", "TMAX"])
    return crops.drop_duplicates("COMNAME").reset_index(drop=True)


# =====================================================================
# Training
# =====================================================================
def train():
    clim = seasonal_climate()
    lab = seasonal_labels()
    crops = load_crops()

    df = lab.merge(clim, on=["location", "season", "season_year"]).merge(
        crops, on="COMNAME"
    )
    df["season_is_winter"] = (df["season"] == "winter").astype(int)
    print(
        f"Training table: {len(df):,} rows, "
        f"{df['location'].nunique()} locations, "
        f"{df['season_year'].nunique()} season-years, {df['COMNAME'].nunique()} crops"
    )

    scores_json = {}
    # hold out the last season year
    years = sorted(df["season_year"].unique())
    scores_by_target = {}
    if len(years) >= 3:
        test_mask = df["season_year"] == years[-1]
        print(f"Validation: train on years < {years[-1]}, test on {years[-1]}")
        for target in TARGETS:
            m = HistGradientBoostingRegressor(
                max_iter=400, learning_rate=0.05, random_state=42
            )
            m.fit(df.loc[~test_mask, FEATURES], df.loc[~test_mask, target])
            pred = m.predict(df.loc[test_mask, FEATURES])
            mae = mean_absolute_error(df.loc[test_mask, target], pred)
            r2 = r2_score(df.loc[test_mask, target], pred)
            scores_by_target[target] = {"MAE": float(mae), "R2": float(r2)}
            print(f"  {target:24s} MAE={mae:7.2f}  " f"R2={r2:.3f}")
        Path(SCORES_PATH).parent.mkdir(parents=True, exist_ok=True)
        with open(SCORES_PATH, "w", encoding="utf-8") as f:
            json.dump(scores_by_target, f, indent=2)
        print(f"Saved validation scores to {SCORES_PATH}")
        print(
            "  (labels are a formula of the features, so these scores are optimistic)"
        )
    else:
        print("WARNING: fewer than 3 season-years, skipping validation.")

    # final models on all data
    models = {}
    for target in TARGETS:
        m = HistGradientBoostingRegressor(
            max_iter=400, learning_rate=0.05, random_state=42
        )
        m.fit(df[FEATURES], df[target])
        models[target] = m

    climatology = clim.groupby(["location", "season"], as_index=False)[
        ["lat", "lon"] + CLIMATE_FEATURES
    ].mean()

    Path(MODEL_PATH).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {"models": models, "crops": crops, "climatology": climatology}, MODEL_PATH
    )
    print(f"Saved {MODEL_PATH}")


# =====================================================================
# Recommendation
# =====================================================================
def upcoming_seasons(start, n=3, include_current=True):
    """List of (season, season_year, label). Winter(Y) -> Summer(Y+1) -> Winter(Y+1) ..."""
    start = pd.Timestamp(start)
    season = SEASON_OF_MONTH[start.month]
    year = start.year - 1 if (season == "winter" and start.month <= 4) else start.year

    def step(s, y):
        return ("summer", y + 1) if s == "winter" else ("winter", y)

    if not include_current:
        season, year = step(season, year)

    out = []
    for _ in range(n):
        label = (
            f"winter {year}/{str(year + 1)[-2:]}"
            if season == "winter"
            else f"summer {year}"
        )
        out.append((season, year, label))
        season, year = step(season, year)
    return out


def score_crops(bundle, feats, season):
    """Predicts suitability and irrigation deficit for every crop in one season."""
    crops = bundle["crops"].copy()
    for k in ["lat", "lon"] + CLIMATE_FEATURES:
        crops[k] = feats[k]
    crops["season_is_winter"] = int(season == "winter")
    X = crops[FEATURES]
    crops["suitability"] = np.clip(bundle["models"]["suitability"].predict(X), 0, 100)
    crops["deficit"] = np.maximum(
        0, bundle["models"]["irrigation_deficit_mm"].predict(X)
    )
    crops["fits_season"] = crops["GMIN"].isna() | (crops["GMIN"] <= SEASON_DAYS[season])
    return crops


def candidates(scored, top_n):
    ok = scored[
        scored["fits_season"] & (scored["suitability"] >= MIN_SUITABILITY)
    ].copy()
    ok["base"] = np.maximum(0, ok["suitability"] - WATER_WEIGHT * ok["deficit"])
    ok = ok.sort_values("base", ascending=False).head(top_n)
    return [
        dict(
            crop=r.COMNAME,
            family=r.FAMNAME,
            base=r.base,
            suitability=r.suitability,
            deficit=r.deficit,
        )
        for r in ok.itertuples()
    ]


def best_rotations(season_tables, prev_crop=None, prev_family=None, top_k=5):
    results = []
    for combo in itertools.product(*season_tables):
        total, p_crop, p_fam = 0.0, prev_crop, prev_family
        for c in combo:
            u = c["base"]
            if p_crop is not None:
                if c["crop"] == p_crop:
                    u *= SAME_CROP_FACTOR
                elif c["family"] == p_fam:
                    u *= SAME_FAMILY_FACTOR
                if p_fam in LEGUME_FAMILIES and c["family"] not in LEGUME_FAMILIES:
                    u *= LEGUME_BONUS
            total += u
            p_crop, p_fam = c["crop"], c["family"]
        results.append((total / len(combo), combo))
    results.sort(key=lambda x: -x[0])
    return results[:top_k]


def recommend_for_features(
    bundle, seasons, feats_list, previous_crop=None, top_n=12, top_k=5
):
    """
    seasons:    output of upcoming_seasons()
    feats_list: one dict per season with lat, lon and CLIMATE_FEATURES
                (use this entry point from your web backend for any map point)
    """
    prev_family = None
    if previous_crop:
        previous_crop = previous_crop.lower()
        fam = bundle["crops"].set_index("COMNAME")["FAMNAME"]
        if previous_crop not in fam.index:
            raise ValueError(
                f"Unknown previous crop '{previous_crop}'. "
                f"Known crops: {sorted(fam.index)}"
            )
        prev_family = fam[previous_crop]

    tables = []
    for (season, _, label), feats in zip(seasons, feats_list):
        cand = candidates(score_crops(bundle, feats, season), top_n)
        if not cand:
            raise ValueError(f"No crop is suitable for {label} at this location.")
        tables.append(cand)

    ranked = best_rotations(tables, previous_crop, prev_family, top_k)

    out = []
    for score, combo in ranked:
        out.append(
            {
                "score": round(score, 1),
                "plan": [
                    {
                        "season": seasons[i][2],
                        "crop": c["crop"],
                        "suitability": round(c["suitability"], 1),
                        "avg_monthly_irrigation_deficit_mm": round(c["deficit"], 1),
                    }
                    for i, c in enumerate(combo)
                ],
            }
        )
    return out


def recommend(location, start_date, previous_crop=None, n_seasons=3, top_n=12, top_k=5):
    bundle = joblib.load(MODEL_PATH)
    clim = bundle["climatology"]
    if location not in set(clim["location"]):
        raise ValueError(
            f"Unknown location '{location}'. Available: {sorted(clim['location'].unique())}"
        )

    seasons = upcoming_seasons(start_date, n_seasons)
    feats_list = []
    for season, _, _ in seasons:
        row = clim[(clim["location"] == location) & (clim["season"] == season)].iloc[0]
        feats_list.append(row[["lat", "lon"] + CLIMATE_FEATURES].to_dict())

    return recommend_for_features(
        bundle, seasons, feats_list, previous_crop, top_n, top_k
    )


# =====================================================================
# CLI
# =====================================================================
def print_plans(plans):
    print("Based on average (historical) climate for each season, not a forecast.\n")
    for i, p in enumerate(plans, 1):
        print(f"#{i}  score {p['score']}")
        for s in p["plan"]:
            print(
                f"    {s['season']:<14} {s['crop']:<22} "
                f"suitability {s['suitability']:>5}  "
                f"deficit {s['avg_monthly_irrigation_deficit_mm']:>6} mm/month"
            )
        print()


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd")  # no longer required
    sub.add_parser("train")
    r = sub.add_parser("recommend")
    r.add_argument("--location", default="Cairo")
    r.add_argument("--start", default=str(pd.Timestamp.today().date()))
    r.add_argument("--prev", default=None, help="crop grown last season (optional)")
    r.add_argument("--top-k", type=int, default=5)
    args = ap.parse_args()

    if args.cmd in (None, "train"):  # plain `python egypt_model.py` trains
        train()
    else:
        print_plans(recommend(args.location, args.start, args.prev, top_k=args.top_k))


# runs from a terminal only, never when imported or run inside Jupyter
if __name__ == "__main__" and "ipykernel" not in sys.modules:
    main()
