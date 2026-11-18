"""
us_model.py

Importing this module runs nothing. Use it like this:

    from server.models.us_model import train, recommend, print_plans
    train()
    print_plans(recommend("beheira_damanhur", "2026-11-17", previous_crop="wheat"))
"""

import itertools
import json
from pathlib import Path
import sys

import joblib
import numpy as np
import pandas as pd
from scipy.stats import uniform, randint
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupKFold, RandomizedSearchCV

repo_root = Path(__file__).resolve().parents[1]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))
from config import get_settings

app_settings = get_settings()
# ---------------- Paths ----------------
ROOT_DIR = Path(__file__).resolve().parents[1]

TRAINING_CSV = "data/us/us_training_data.csv"
CROPS_CSV = "data/us/us_EcoCrop_DB.csv"
INDICATORS_CSV = "data/us/us_climate_soil_data.csv"
MODEL_PATH = "saved_models/us_rotation_model.joblib"
SCORES_PATH = "saved_models/us_model_scores.json"

# ---------------- Rotation rules (tunable heuristics) ----------------
WATER_PENALTY = 25
MIN_SUITABILITY = 30
SAME_CROP_FACTOR = 0.5
SAME_FAMILY_FACTOR = 0.7
LEGUME_BONUS = 1.10
LEGUME_FAMILIES = {"fabaceae", "leguminosae"}

TARGET = "suitability_score"

BASE_CLIMATE = [
    "t_mean",
    "t_min_mean",
    "t_max_mean",
    "t_min_abs",
    "t_max_abs",
    "ndvi_mean",
    "precip_total",
    "sm_mean",
]
EXTRA_CLIMATE = [
    "t_std",
    "t_min_p05",
    "t_max_p95",
    "frac_tmin_lt0",
    "frac_tmin_lt5",
    "frac_tmax_gt35",
    "frac_tmax_gt40",
]
CLIMATE_FEATURES = BASE_CLIMATE + EXTRA_CLIMATE
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
]
FEATURES = ["season_is_winter", "lat", "lon"] + CLIMATE_FEATURES + CROP_PARAMS + DERIVED


def make_features(
    df,
    w_ndvi=0.20,
    w_moist=0.20,
    ndvi_full=0.60,
    sm_wilt=0.10,
    sm_opt=0.30,
    root_mm=300,
    credit=0.5,
):
    """Adds crop-relative features + the scoring formula evaluated on seasonal means."""
    df = df.copy()
    df["d_tmean_topmn"] = df["t_mean"] - df["TOPMN"]
    df["d_tmean_topmx"] = df["t_mean"] - df["TOPMX"]
    df["d_tmean_tmin"] = df["t_mean"] - df["TMIN"]
    df["d_tmean_tmax"] = df["t_mean"] - df["TMAX"]
    df["d_tminabs_ktmp"] = (
        df["t_min_abs"] - df["KTMP"]
    )  # NaN if no KTMP (trees handle it)
    df["d_tmaxabs_tmax"] = df["t_max_abs"] - df["TMAX"]
    df["d_tmaxmean_tmax"] = df["t_max_mean"] - df["TMAX"]

    season_days = np.where(df["season_is_winter"] == 1, 181, 184)
    g_months = np.maximum(1.0, df["GMIN"].fillna(120) / 30.0)
    need = (df["ROPMN"] / g_months).fillna(100.0)
    precip_month = df["precip_total"] / (season_days / 30.0)
    df["need_month"] = need
    df["water_gap"] = need - precip_month

    t, tx = df["t_mean"].to_numpy(), df["t_max_mean"].to_numpy()
    topmn, topmx = df["TOPMN"].to_numpy(), df["TOPMX"].to_numpy()
    tmin, tmax = df["TMIN"].to_numpy(), df["TMAX"].to_numpy()
    with np.errstate(divide="ignore", invalid="ignore"):
        temp = np.select(
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
    temp = np.where(tx > tmax, np.maximum(0, temp - (tx - tmax) * 5), temp)
    ndvi_s = np.clip(df["ndvi_mean"] / ndvi_full, 0, 1) * 100
    moist_s = np.clip((df["sm_mean"] - sm_wilt) / (sm_opt - sm_wilt), 0, 1) * 100
    mod = (1 - w_ndvi - w_moist) + w_ndvi * ndvi_s / 100 + w_moist * moist_s / 100
    df["formula_suit"] = temp * mod
    soil_credit = np.clip(df["sm_mean"] - sm_wilt, 0, None) * root_mm * credit
    df["formula_deficit"] = np.maximum(0, need - precip_month - soil_credit)
    return df


# =====================================================================
# Data
# =====================================================================
def load_crops():
    crops = pd.read_csv(CROPS_CSV)
    crops.columns = crops.columns.str.strip().str.upper()
    crops["COMNAME"] = crops["COMNAME"].astype(str).str.lower()

    keep = ["COMNAME", "FAMNAME"] + CROP_PARAMS
    crops = crops[[c for c in keep if c in crops.columns]].copy()
    if "FAMNAME" not in crops.columns:
        crops["FAMNAME"] = crops["COMNAME"]  # no family info: no family rule
    crops["FAMNAME"] = crops["FAMNAME"].fillna(crops["COMNAME"]).astype(str).str.lower()

    for c in CROP_PARAMS:
        if c not in crops.columns:
            crops[c] = np.nan
        crops[c] = pd.to_numeric(crops[c], errors="coerce")

    crops = crops.dropna(subset=["TOPMN", "TOPMX", "TMIN", "TMAX"])
    return crops.drop_duplicates("COMNAME").reset_index(drop=True)


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


def train_tuned_model(X_train, y_train):
    print("\nTuning hyperparameters (this may take a minute)...")
    base_model = HistGradientBoostingRegressor(loss="absolute_error", random_state=42)

    param_dist = {
        "learning_rate": uniform(0.01, 0.2),
        "max_iter": randint(200, 1000),
        "max_leaf_nodes": randint(31, 127),
        "min_samples_leaf": randint(10, 50),
        "l2_regularization": uniform(0.0, 5.0),
    }

    # Searches 20 random combinations using 3-fold cross validation
    search = RandomizedSearchCV(
        base_model,
        param_distributions=param_dist,
        n_iter=20,
        cv=3,
        scoring="neg_mean_absolute_error",
        n_jobs=-1,
        random_state=42,
    )

    search.fit(X_train, y_train)
    clean_params = {
        k: (v.item() if hasattr(v, "item") else v)
        for k, v in search.best_params_.items()
    }
    print(f"Best params: {clean_params}")

    # Calculate MAE & R2 on the entire training set using the best estimator
    y_pred = np.clip(search.predict(X_train), 0, 100)
    mae = float(mean_absolute_error(y_train, y_pred))
    r2 = float(r2_score(y_train, y_pred))
    print(f"MAE after training (Full Dataset): {mae:.2f}\n")

    tuning_metrics = {
        "best_params": clean_params,
        "cv_MAE": float(-search.best_score_),
        "train_MAE": mae,
        "train_R2": r2,
    }
    return search.best_estimator_, tuning_metrics


def _scores(y_true, y_pred):
    return {
        "MAE": float(mean_absolute_error(y_true, y_pred)),
        "R2": float(r2_score(y_true, y_pred)),
    }


def train():
    df = make_features(pd.read_csv(TRAINING_CSV))
    crops = load_crops()
    y = df[TARGET]

    available_features = [feature for feature in FEATURES if feature in df.columns]
    missing_features = [feature for feature in FEATURES if feature not in df.columns]
    if missing_features:
        print(
            f"Warning: Missing features in dataset, skipping: {set(missing_features)}"
        )

    print(
        f"Training table: {len(df):,} rows | {df['location'].nunique()} locations | "
        f"{df['COMNAME'].nunique()} crops | {df['season_year'].nunique()} season-years"
    )

    scores = {}

    df["period"] = df["season_year"] * 2 + df["season_is_winter"]
    periods = sorted(df["period"].unique())
    if len(periods) >= 6:
        test = df["period"] >= periods[-2]

        m = new_model().fit(df.loc[~test, available_features], y[~test])
        pred = np.clip(m.predict(df.loc[test, available_features]), 0, 100)
        scores["suitability_time_split"] = _scores(y[test], pred)
        scores["suitability_formula_on_seasonal_means"] = _scores(
            y[test], df.loc[test, "formula_suit"]
        )
        print(
            f"time split  ({test.sum()} test rows)  MAE={scores['suitability_time_split']['MAE']:.2f}  "
            f"R2={scores['suitability_time_split']['R2']:.3f}  "
            f"(formula alone: {scores['suitability_formula_on_seasonal_means']['MAE']:.2f})"
        )
    else:
        print("WARNING: fewer than 6 season periods, skipping the time split.")

    n_groups = min(5, df["location"].nunique())
    if n_groups >= 2:
        oof = np.zeros(len(df))
        for tr, te in GroupKFold(n_splits=n_groups).split(df, groups=df["location"]):
            mm = new_model().fit(df.iloc[tr][available_features], y.iloc[tr])
            oof[te] = np.clip(mm.predict(df.iloc[te][available_features]), 0, 100)
        scores["suitability_location_split"] = _scores(y, oof)
        print(
            f"location split  MAE={scores['suitability_location_split']['MAE']:.2f}  "
            f"R2={scores['suitability_location_split']['R2']:.3f}"
        )

    scores["deficit_formula_vs_label"] = _scores(
        df["irrigation_deficit_mm"], df["formula_deficit"]
    )
    print(
        f"deficit formula vs label  MAE={scores['deficit_formula_vs_label']['MAE']:.2f}"
    )

    # Train the final tuned model on the entire dataset
    model, tuning_metrics = train_tuned_model(df[available_features], y)
    scores["tuned_model"] = tuning_metrics

    # Save scores to JSON
    scores_file = Path(SCORES_PATH)
    scores_file.parent.mkdir(parents=True, exist_ok=True)
    scores_file.write_text(json.dumps(scores, indent=2), encoding="utf-8")
    print(f"Saved model scores to {scores_file}")

    available_climate = [
        feature for feature in CLIMATE_FEATURES if feature in df.columns
    ]
    clim_columns = [
        "location",
        "season",
        "season_year",
        "lat",
        "lon",
    ] + available_climate
    clim = df.drop_duplicates(["location", "season", "season_year"])[clim_columns]
    climatology = clim.groupby(["location", "season"], as_index=False)[
        ["lat", "lon"] + available_climate
    ].mean()

    # Save the best model
    model_file = Path(MODEL_PATH)
    model_file.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": model,
            "model_features": available_features,
            "crops": crops,
            "climatology": climatology,
        },
        model_file,
    )
    print(f"Saved best tuned model to {model_file}")


# =====================================================================
# Recommendation
# =====================================================================
def upcoming_seasons(start, n=3, include_current=True):
    """List of (season, season_year, label). Winter(Y) -> Summer(Y+1) -> Winter(Y+1) ..."""
    start = pd.Timestamp(start)
    season = app_settings.US_SEASON_OF_MONTH[start.month]
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
    """Suitability (ML) and irrigation deficit (formula) for every crop in one season."""
    crops = bundle["crops"].copy()
    for k in ["lat", "lon"] + CLIMATE_FEATURES:
        crops[k] = feats.get(k, np.nan)
    crops["season_is_winter"] = int(season == "winter")
    crops = make_features(crops)

    model_features = bundle.get("model_features", FEATURES)
    crops["suitability"] = np.clip(
        bundle["model"].predict(crops[model_features]), 0, 100
    )
    crops["deficit"] = crops["formula_deficit"]
    crops["water_stress"] = np.clip(
        crops["deficit"] / np.maximum(crops["need_month"], 1.0), 0, 1
    )
    crops["fits_season"] = crops["GMIN"].isna() | (
        crops["GMIN"] <= app_settings.US_SEASON_DAYS[season]
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
    """feats_list: one dict per season with lat, lon and all CLIMATE_FEATURES
    (use this from your web backend for any map point)."""
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
        scored = score_crops(bundle, feats, season)
        cand = candidates(scored, top_n)
        if not cand:
            top_row = scored.sort_values("suitability", ascending=False).iloc[0]
            top_crop = top_row["COMNAME"]
            top_score = round(float(top_row["suitability"]), 1)

            t_mean = feats.get("t_mean", 0.0)
            t_min_abs = feats.get("t_min_abs", 0.0)
            t_max_mean = feats.get("t_max_mean", 0.0)
            t_max_abs = feats.get("t_max_abs", 0.0)
            sm_mean = feats.get("sm_mean", 0.0)
            precip = feats.get("precip_total", 0.0)

            reasons = []
            if t_mean < 10.0 or t_min_abs < -5.0:
                reasons.append(
                    f"severe cold stress during {label} (seasonal mean temperature is {t_mean:.1f}°C "
                    f"with an absolute minimum of {t_min_abs:.1f}°C)"
                )
            if t_max_mean > 38.0 or t_max_abs > 45.0:
                reasons.append(
                    f"extreme heat stress during {label} (average daily high is {t_max_mean:.1f}°C "
                    f"with peaks reaching {t_max_abs:.1f}°C)"
                )
            if sm_mean < 0.12:
                reasons.append(
                    f"critically low root-zone soil wetness ({sm_mean * 100:.0f}%) and low seasonal "
                    f"precipitation ({precip:.1f} mm)"
                )

            if not reasons:
                reasons.append(
                    f"unfavorable agroclimatic balance during {label} (mean temp {t_mean:.1f}°C, "
                    f"soil moisture {sm_mean * 100:.0f}%, seasonal rainfall {precip:.1f} mm)"
                )

            reason_str = " and ".join(reasons)
            raise ValueError(
                f"No crop met the minimum {MIN_SUITABILITY}% suitability threshold for {label} due to "
                f"{reason_str}. Even the most resilient candidate ({top_crop.title()}) only reached "
                f"{top_score}% suitability."
            )
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


def recommend(location, start_date, previous_crop=None, n_seasons=3, top_n=12, top_k=5):
    bundle = joblib.load(MODEL_PATH)
    clim = bundle["climatology"]
    if location not in set(clim["location"]):
        raise ValueError(
            f"Unknown location '{location}'. "
            f"Available: {sorted(clim['location'].unique())}"
        )

    seasons = upcoming_seasons(start_date, n_seasons)
    feats_list = []
    for season, _, _ in seasons:
        row = clim[(clim["location"] == location) & (clim["season"] == season)].iloc[0]
        feats_list.append(row[["lat", "lon"] + CLIMATE_FEATURES].to_dict())

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
    train()
