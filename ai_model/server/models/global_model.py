"""
global_model.py

Global crop-rotation model. Importing this module runs nothing.

    python -m server.models.global_model build     # indicators CSV + EcoCrop -> training CSV
    python -m server.models.global_model train     # training CSV -> saved model
    python -m server.models.global_model recommend 30.6 30.47 2026-11-17 wheat

From code:
    from server.models.global_model import recommend, print_plans
    print_plans(recommend(30.6, 30.47, "2026-11-17", previous_crop="wheat"))
"""

import itertools
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupKFold

try:
    ROOT_DIR = Path(__file__).resolve().parents[2]
except NameError:
    ROOT_DIR = Path.cwd()

INDICATORS_CSV = ROOT_DIR / "data/global/global_climate_soil_data.csv"
CROPS_CSV = ROOT_DIR / "data/global/EcoCrop_DB.csv"
TRAINING_CSV = ROOT_DIR / "data/global/global_training_data.csv"
MODEL_PATH = ROOT_DIR / "saved_models/global_rotation_model.joblib"
SCORES_PATH = ROOT_DIR / "saved_models/global_model_scores.json"

# ---------------- Rotation rules (tunable heuristics) ----------------
WATER_PENALTY = 25
MIN_SUITABILITY = 30
SAME_CROP_FACTOR = 0.5
SAME_FAMILY_FACTOR = 0.7
LEGUME_BONUS = 1.10
LEGUME_FAMILIES = {"fabaceae", "leguminosae"}

TARGET = "suitability_score"
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
CROP_PARAMS = ["TOPMN", "TOPMX", "TMIN", "TMAX", "KTMP", "GMIN", "ROPMN"]
DERIVED = [
    "d_tmean_topmn",
    "d_tmean_topmx",
    "d_tmean_tmin",
    "d_tmean_tmax",
    "d_tminabs_ktmp",
    "d_tmaxabs_tmax",
    "d_tmaxmean_tmax",
    "need_month",
    "water_gap",
    "formula_suit",
    "formula_deficit",
]
# season_days / abs_lat let the model handle both hemispheres and 181-184 day windows
FEATURES = (
    ["season_is_winter", "season_days", "lat", "lon", "abs_lat"]
    + CLIMATE_FEATURES
    + CROP_PARAMS
    + DERIVED
)


# =====================================================================
# Features and labels
# =====================================================================
def _temp_score(t, topmn, topmx, tmin, tmax):
    """Trapezoid: 100 inside [TOPMN, TOPMX], linear to 0 at TMIN / TMAX."""
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.select(
            [
                (t >= topmn) & (t <= topmx),
                (t > tmin) & (t < topmn),
                (t > topmx) & (t < tmax),
            ],
            [
                100.0,
                (t - tmin) / (topmn - tmin) * 100,
                (tmax - t) / (tmax - topmx) * 100,
            ],
            default=0.0,
        )


def _moisture_modifier(
    df, w_ndvi=0.20, w_moist=0.20, ndvi_full=0.60, sm_wilt=0.10, sm_opt=0.30
):
    ndvi_s = np.clip(df["ndvi_mean"] / ndvi_full, 0, 1) * 100
    moist_s = np.clip((df["sm_mean"] - sm_wilt) / (sm_opt - sm_wilt), 0, 1) * 100
    return (1 - w_ndvi - w_moist) + w_ndvi * ndvi_s / 100 + w_moist * moist_s / 100


def make_features(df, sm_wilt=0.10, root_mm=300, credit=0.5):
    """Crop-relative features + the scoring formula evaluated on seasonal means."""
    df = df.copy()
    df["abs_lat"] = df["lat"].abs()
    df["d_tmean_topmn"] = df["t_mean"] - df["TOPMN"]
    df["d_tmean_topmx"] = df["t_mean"] - df["TOPMX"]
    df["d_tmean_tmin"] = df["t_mean"] - df["TMIN"]
    df["d_tmean_tmax"] = df["t_mean"] - df["TMAX"]
    df["d_tminabs_ktmp"] = df["t_min_abs"] - df["KTMP"]  # NaN if no KTMP
    df["d_tmaxabs_tmax"] = df["t_max_abs"] - df["TMAX"]
    df["d_tmaxmean_tmax"] = df["t_max_mean"] - df["TMAX"]

    g_months = np.maximum(1.0, df["GMIN"].fillna(120) / 30.0)
    need = (df["ROPMN"] / g_months).fillna(100.0)
    precip_month = df["precip_total"] / (df["season_days"] / 30.0)
    df["need_month"] = need
    df["water_gap"] = need - precip_month

    t, tx = df["t_mean"].to_numpy(), df["t_max_mean"].to_numpy()
    temp = _temp_score(
        t,
        df["TOPMN"].to_numpy(),
        df["TOPMX"].to_numpy(),
        df["TMIN"].to_numpy(),
        df["TMAX"].to_numpy(),
    )
    tmax = df["TMAX"].to_numpy()
    temp = np.where(tx > tmax, np.maximum(0, temp - (tx - tmax) * 5), temp)
    df["formula_suit"] = temp * _moisture_modifier(df)

    soil_credit = np.clip(df["sm_mean"] - sm_wilt, 0, None) * root_mm * credit
    df["formula_deficit"] = np.maximum(0, need - precip_month - soil_credit)
    return df


def label_rows(df):
    """
    Heuristic labels. Same temperature/moisture formula as make_features, PLUS penalties from
    extreme-day indicators (frost below KTMP, heat above TMAX, hot-day fraction) that the
    seasonal-mean formula cannot see - this is what the model learns on top of the formula.
    Replace with observed data (crop calendars, yield maps, occurrence data) when you have it.
    """
    temp = _temp_score(
        df["t_mean"].to_numpy(),
        df["TOPMN"].to_numpy(),
        df["TOPMX"].to_numpy(),
        df["TMIN"].to_numpy(),
        df["TMAX"].to_numpy(),
    )
    score = temp * _moisture_modifier(df)

    frost = np.where(
        df["KTMP"].notna(), np.clip((df["KTMP"] - df["t_min_abs"]) / 10, 0, 1) * 40, 0
    )
    heat = np.clip((df["t_max_abs"] - df["TMAX"]) / 10, 0, 1) * 40
    hot_days = np.where(df["TMAX"] <= 40, df["frac_tmax_gt40"] * 30, 0)
    # sub-zero nights inside the growing window hurt crops without a stated killing temp
    cold_nights = np.where(
        df["KTMP"].isna() & (df["TMIN"] > 0), df["frac_tmin_lt0"] * 30, 0
    )

    df = df.copy()
    df[TARGET] = np.clip(score - frost - heat - hot_days - cold_nights, 0, 100)
    return df


# =====================================================================
# Data
# =====================================================================
def load_crops(path=CROPS_CSV):
    crops = pd.read_csv(path)
    crops.columns = crops.columns.str.strip().str.upper()
    crops["COMNAME"] = crops["COMNAME"].astype(str).str.lower()

    keep = ["COMNAME", "FAMNAME"] + CROP_PARAMS
    crops = crops[[c for c in keep if c in crops.columns]].copy()
    if "FAMNAME" not in crops.columns:
        crops["FAMNAME"] = crops["COMNAME"]
    crops["FAMNAME"] = crops["FAMNAME"].fillna(crops["COMNAME"]).astype(str).str.lower()

    for c in CROP_PARAMS:
        if c not in crops.columns:
            crops[c] = np.nan
        crops[c] = pd.to_numeric(crops[c], errors="coerce")

    crops = crops.dropna(subset=["TOPMN", "TOPMX", "TMIN", "TMAX"])
    return crops.drop_duplicates("COMNAME").reset_index(drop=True)


def sample_pairs(ind, crops, k_plausible=15, k_random=10, seed=42, chunk=2000):
    """
    Location-season rows x crops would be huge, so pair each row with ~25 crops:
    k_plausible whose [TMIN, TMAX] contains the seasonal mean temp, plus k_random
    arbitrary crops so the model also sees clear negatives.
    """
    rng = np.random.default_rng(seed)
    ind = ind.reset_index(drop=True)
    tmin, tmax = crops["TMIN"].to_numpy(), crops["TMAX"].to_numpy()
    left_idx, right_idx = [], []
    for s in range(0, len(ind), chunk):
        t = ind["t_mean"].to_numpy()[s : s + chunk, None]
        plausible = (t > tmin) & (t < tmax)
        for i in range(plausible.shape[0]):
            ids = np.flatnonzero(plausible[i])
            pick = (
                rng.choice(ids, min(k_plausible, len(ids)), replace=False)
                if len(ids)
                else ids
            )
            sel = np.unique(
                np.concatenate([pick, rng.integers(0, len(crops), k_random)])
            )
            left_idx.append(np.full(len(sel), s + i))
            right_idx.append(sel)
    li, ri = np.concatenate(left_idx), np.concatenate(right_idx)
    left = ind.iloc[li].reset_index(drop=True)
    right = crops.iloc[ri].reset_index(drop=True)
    return pd.concat([left, right], axis=1)


def build_training_table():
    ind = pd.read_csv(INDICATORS_CSV)
    crops = load_crops()
    df = sample_pairs(ind, crops)
    df = label_rows(make_features(df))
    df["irrigation_deficit_mm"] = df["formula_deficit"]
    for c in df.select_dtypes("float64").columns:
        df[c] = df[c].astype("float32")
    TRAINING_CSV.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(TRAINING_CSV, index=False)
    print(
        f"Saved {len(df):,} rows ({ind['location'].nunique()} locations, "
        f"{df['COMNAME'].nunique()} crops) -> {TRAINING_CSV}"
    )


# =====================================================================
# Training
# =====================================================================
def new_model():
    return HistGradientBoostingRegressor(
        loss="absolute_error",
        max_iter=600,
        learning_rate=0.05,
        max_leaf_nodes=63,
        l2_regularization=1.0,
        random_state=42,
    )


def _scores(y_true, y_pred):
    return {
        "MAE": float(mean_absolute_error(y_true, y_pred)),
        "R2": float(r2_score(y_true, y_pred)),
    }


def train():
    df = pd.read_csv(TRAINING_CSV)
    crops = load_crops()
    y = df[TARGET]
    print(
        f"Training table: {len(df):,} rows | {df['location'].nunique()} locations | "
        f"{df['COMNAME'].nunique()} crops | {df['season_year'].nunique()} season-years"
    )
    scores = {}

    # --- time split: hold out the last two seasons ---
    df["period"] = df["season_year"] * 2 + df["season_is_winter"]
    periods = sorted(df["period"].unique())
    if len(periods) >= 6:
        test = df["period"] >= periods[-2]
        m = new_model().fit(df.loc[~test, FEATURES], y[~test])
        pred = np.clip(m.predict(df.loc[test, FEATURES]), 0, 100)
        scores["time_split"] = _scores(y[test], pred)
        scores["formula_on_seasonal_means"] = _scores(
            y[test], df.loc[test, "formula_suit"]
        )
        print(
            f"time split  MAE={scores['time_split']['MAE']:.2f}  R2={scores['time_split']['R2']:.3f}"
            f"  (formula alone: {scores['formula_on_seasonal_means']['MAE']:.2f})"
        )

    # --- spatial block CV: 10x10 degree blocks, so a test point has no near neighbours in train ---
    blocks = (np.floor(df["lat"] / 10) * 100 + np.floor(df["lon"] / 10)).astype(int)
    n_groups = min(5, blocks.nunique())
    if n_groups >= 2:
        oof = np.zeros(len(df))
        for tr, te in GroupKFold(n_splits=n_groups).split(df, groups=blocks):
            mm = new_model().fit(df.iloc[tr][FEATURES], y.iloc[tr])
            oof[te] = np.clip(mm.predict(df.iloc[te][FEATURES]), 0, 100)
        scores["spatial_block_split"] = _scores(y, oof)
        print(
            f"spatial block split  MAE={scores['spatial_block_split']['MAE']:.2f}  "
            f"R2={scores['spatial_block_split']['R2']:.3f}"
        )

    scores["deficit_formula_vs_label"] = _scores(
        df["irrigation_deficit_mm"], df["formula_deficit"]
    )
    print(
        "(labels are heuristic functions of the indicators: these scores show the model learned "
        "the rules, not that the rules are agronomically right)"
    )

    SCORES_PATH.parent.mkdir(parents=True, exist_ok=True)
    SCORES_PATH.write_text(json.dumps(scores, indent=2), encoding="utf-8")

    # --- final model on all data ---
    model = new_model().fit(df[FEATURES], y)
    keys = [
        "location",
        "season",
        "season_year",
        "lat",
        "lon",
        "season_days",
    ] + CLIMATE_FEATURES
    clim = df.drop_duplicates(["location", "season", "season_year"])[keys]
    climatology = clim.groupby(["location", "season"], as_index=False)[
        ["lat", "lon", "season_days"] + CLIMATE_FEATURES
    ].mean()

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {"model": model, "crops": crops, "climatology": climatology}, MODEL_PATH
    )
    print(f"Saved {MODEL_PATH}")


# =====================================================================
# Recommendation
# =====================================================================
def upcoming_seasons(start, lat, n=3, include_current=True):
    """List of (season, season_year, label), hemisphere-aware.
    North: winter(Y) -> summer(Y+1) -> winter(Y+1).  South: winter(Y) -> summer(Y) -> winter(Y+1).
    """
    from ai_model.get_data.globally.indicators import (
        hemisphere,
        season_of_date,
        season_window,
    )

    hemi = hemisphere(lat)
    season, year = season_of_date(start, hemi)

    def step(s, y):
        if hemi == "N":
            return ("summer", y + 1) if s == "winter" else ("winter", y)
        return ("summer", y) if s == "winter" else ("winter", y + 1)

    if not include_current:
        season, year = step(season, year)
    out = []
    for _ in range(n):
        a, b = season_window(season, year, hemi)
        label = (
            f"{season} {a.year}"
            if a.year == (b - pd.Timedelta(days=1)).year
            else f"{season} {a.year}/{str(b.year)[-2:]}"
        )
        out.append((season, year, label))
        season, year = step(season, year)
    return out


def score_crops(bundle, feats, season):
    crops = bundle["crops"].copy()
    for k in ["lat", "lon", "season_days"] + CLIMATE_FEATURES:
        crops[k] = feats[k]
    crops["season_is_winter"] = int(season == "winter")
    crops = make_features(crops)

    crops["suitability"] = np.clip(bundle["model"].predict(crops[FEATURES]), 0, 100)
    crops["deficit"] = crops["formula_deficit"]
    crops["water_stress"] = np.clip(
        crops["deficit"] / np.maximum(crops["need_month"], 1.0), 0, 1
    )
    crops["fits_season"] = crops["GMIN"].isna() | (
        crops["GMIN"] <= feats["season_days"]
    )
    return crops


def candidates(scored, top_n):
    ok = scored[
        scored["fits_season"] & (scored["suitability"] >= MIN_SUITABILITY)
    ].copy()
    ok["base"] = np.maximum(0, ok["suitability"] - WATER_PENALTY * ok["water_stress"])
    ok = ok.sort_values("base", ascending=False).head(top_n)
    return [
        dict(
            crop=r.COMNAME,
            family=r.FAMNAME,
            base=r.base,
            suitability=r.suitability,
            deficit=r.deficit,
            water_stress=r.water_stress,
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
    """feats_list: one dict per season with lat, lon, season_days and all CLIMATE_FEATURES."""
    prev_family = None
    if previous_crop:
        previous_crop = previous_crop.lower()
        fam = bundle["crops"].set_index("COMNAME")["FAMNAME"]
        if previous_crop not in fam.index:
            raise ValueError(f"Unknown previous crop '{previous_crop}'.")
        prev_family = fam[previous_crop]

    tables = []
    for (season, _, label), feats in zip(seasons, feats_list):
        cand = candidates(score_crops(bundle, feats, season), top_n)
        if not cand:
            raise ValueError(f"No crop is suitable for {label} at this location.")
        tables.append(cand)

    out = []
    for score, combo in best_rotations(tables, previous_crop, prev_family, top_k):
        out.append(
            {
                "score": round(score, 1),
                "plan": [
                    {
                        "season": seasons[i][2],
                        "crop": c["crop"],
                        "suitability": round(c["suitability"], 1),
                        "water_need_unmet_pct": round(100 * c["water_stress"]),
                        "avg_monthly_irrigation_deficit_mm": round(c["deficit"], 1),
                    }
                    for i, c in enumerate(combo)
                ],
            }
        )
    return out


def _nearest_climatology(clim, lat, lon, max_km=200):
    u = clim.drop_duplicates("location")
    la1, lo1, la2, lo2 = map(
        np.radians, [lat, lon, u["lat"].to_numpy(), u["lon"].to_numpy()]
    )
    a = (
        np.sin((la2 - la1) / 2) ** 2
        + np.cos(la1) * np.cos(la2) * np.sin((lo2 - lo1) / 2) ** 2
    )
    km = 6371 * 2 * np.arcsin(np.sqrt(a))
    i = int(np.argmin(km))
    if km[i] > max_km:
        print(
            f"WARNING: nearest training location is {km[i]:.0f} km away; use live=True."
        )
    return u.iloc[i]["location"]


def recommend(
    lat, lon, start_date, previous_crop=None, n_seasons=3, top_n=12, top_k=5, live=False
):
    """live=False: use the nearest training location's climatology (fast, offline).
    live=True: pull this exact point's climatology from Earth Engine."""
    bundle = joblib.load(MODEL_PATH)
    seasons = upcoming_seasons(start_date, lat, n_seasons)

    if live:
        from ai_model.get_data.globally.indicators import init_ee, point_climatology

        init_ee()
        by_season = point_climatology(lat, lon)
        feats_list = [by_season[s] for s, _, _ in seasons]
    else:
        clim = bundle["climatology"]
        loc = _nearest_climatology(clim, lat, lon)
        cols = ["lat", "lon", "season_days"] + CLIMATE_FEATURES
        feats_list = [
            clim[(clim["location"] == loc) & (clim["season"] == s)]
            .iloc[0][cols]
            .to_dict()
            for s, _, _ in seasons
        ]
    return recommend_for_features(
        bundle, seasons, feats_list, previous_crop, top_n, top_k
    )


def print_plans(plans):
    print("Based on average (historical) climate for each season, not a forecast.\n")
    for i, p in enumerate(plans, 1):
        print(f"#{i}  score {p['score']}")
        for s in p["plan"]:
            print(
                f"    {s['season']:<14} {s['crop']:<18} suitability {s['suitability']:>5}  "
                f"water need unmet {s['water_need_unmet_pct']:>3}%  "
                f"deficit {s['avg_monthly_irrigation_deficit_mm']:>7} mm/month"
            )
        print()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "build":
        build_training_table()
    elif cmd == "train":
        train()
    elif cmd == "recommend":
        lat, lon, date = float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
        prev = sys.argv[5] if len(sys.argv) > 5 else None
        print_plans(recommend(lat, lon, date, prev))
    else:
        print(__doc__)
