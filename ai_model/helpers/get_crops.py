import re
from pathlib import Path

import numpy as np
import pandas as pd
from pathlib import Path
import sys

repo_root = Path(__file__).resolve().parents[3]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

DEFAULT_INPUT = Path("data/EcoCrop_DB_cleaned.csv")

from ai_model.config import get_settings
app_settings=get_settings()
def extract_crops(
    crops_list: list,
    region: str,
    input_path: str = DEFAULT_INPUT,
    output_dir: str = "data",
    exact_match: bool = True,
) -> pd.DataFrame:
    df = pd.read_csv(input_path, encoding="utf-8-sig")
    df.columns = df.columns.str.strip().str.upper()

    column_name = "COMNAME"
    existing_core = [c for c in app_settings.CROP_PARAMS if c in df.columns]

    # Ensure all parameter columns are numeric and require core temperature bounds
    for col in existing_core:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df_valid = df.dropna(subset=["TOPMN", "TOPMX", "TMIN", "TMAX"]).copy()

    raw_names = df_valid[column_name].astype(str).str.lower()
    token_lists = raw_names.str.split(",").apply(lambda lst: [t.strip() for t in lst])
    terms = [str(c).strip().lower() for c in crops_list]

    matched_rows = []
    for term in terms:
        if exact_match:
            mask = token_lists.apply(lambda tokens: term in tokens)
        else:
            mask = raw_names.str.contains(re.escape(term), na=False)

        subset = df_valid[mask].copy()
        if not subset.empty:
            # Pick the entry with the fewest missing core parameters
            subset["_completeness"] = subset[existing_core].notna().sum(axis=1)
            best_row = (
                subset.sort_values(by="_completeness", ascending=False).iloc[0].copy()
            )
            # Replace comma-separated alias string with the clean searched crop name
            best_row[column_name] = term
            matched_rows.append(best_row)

    if not matched_rows:
        print(f"Warning: 0 matching rows found for region '{region}'.")
        return pd.DataFrame(columns=df.columns)

    region_df = (
        pd.DataFrame(matched_rows)
        .drop(columns=["_completeness"], errors="ignore")
        .drop_duplicates(subset=[column_name])
        .reset_index(drop=True)
    )

    # Fill remaining minor parameter gaps safely so no NaNs enter training/inference
    if "KTMP" in region_df.columns:
        region_df["KTMP"] = region_df["KTMP"].fillna(region_df["TMIN"] - 2.0)
    if "GMIN" in region_df.columns:
        region_df["GMIN"] = region_df["GMIN"].fillna(90)
    if "GMAX" in region_df.columns:
        region_df["GMAX"] = region_df["GMAX"].fillna(region_df["GMIN"] + 60)
    if "ROPMN" in region_df.columns:
        region_df["ROPMN"] = region_df["ROPMN"].fillna(400)
    if "ROPMX" in region_df.columns:
        region_df["ROPMX"] = region_df["ROPMX"].fillna(region_df["ROPMN"] + 400)
    if "RMIN" in region_df.columns:
        region_df["RMIN"] = region_df["RMIN"].fillna(region_df["ROPMN"] * 0.5)
    if "RMAX" in region_df.columns:
        region_df["RMAX"] = region_df["RMAX"].fillna(region_df["ROPMX"] * 1.5)

    out_dir = Path(output_dir) / region
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{region}_EcoCrop_DB.csv"
    region_df.to_csv(out_path, index=False, encoding="utf-8-sig")

    print(f"{len(region_df)} clean crops saved -> {out_path}")
    return region_df
