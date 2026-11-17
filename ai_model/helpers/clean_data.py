"""
Clean the FAO EcoCrop database (EcoCrop_DB.csv).
"""

from pathlib import Path

import numpy as np
import pandas as pd

INPUT_PATH = Path("data/EcoCrop_DB.csv")
OUTPUT_PATH = Path("data/EcoCrop_DB_cleaned.csv")

NA_TOKENS = {"", "na", "n/a", "?", "-", "none", "null", "nan"}

NUMERIC_COLS = [
    "TOPMN",
    "TOPMX",
    "TMIN",
    "TMAX",
    "ROPMN",
    "ROPMX",
    "RMIN",
    "RMAX",
    "PHOPMN",
    "PHOPMX",
    "PHMIN",
    "PHMAX",
    "LATOPMN",
    "LATOPMX",
    "LATMN",
    "LATMX",
    "ALTMX",
    "GMIN",
    "GMAX",
]
# check the pairs (min, max) min < max
RANGE_PAIRS = [
    ("TOPMN", "TOPMX"),
    ("TMIN", "TMAX"),
    ("ROPMN", "ROPMX"),
    ("RMIN", "RMAX"),
    ("PHOPMN", "PHOPMX"),
    ("PHMIN", "PHMAX"),
    ("LATOPMN", "LATOPMX"),
    ("LATMN", "LATMX"),
    ("GMIN", "GMAX"),
]

LIGHT_SCALE = {
    "heavy shade": 1,
    "light shade": 2,
    "cloudy skies": 3,
    "clear skies": 4,
    "very bright": 5,
}
LIGHT_COLS = ["LIOPMN", "LIOPMX", "LIMN", "LIMX"]

# Label typos found in the raw file
LABEL_FIXES = {
    "SAL": {"high (>10 dS/m))": "high (>10 dS/m)"},
    "TOX": {"medium (16-25% of CEC": "medium (16-25% of CEC)"},
}

DROP_COLS = ["TOX", "TOXR"]  # >97% missing values in the raw data


def fix_mojibake(text: str) -> str:
    """Repair latin-1/cp1252 mojibake (e.g. 'd\\x82ibisco' -> \"d'ibisco\")."""
    if not isinstance(text, str):
        return text
    try:
        return text.encode("latin-1", errors="ignore").decode("cp1252", errors="ignore")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text


def clean(input_path=INPUT_PATH, output_path=OUTPUT_PATH) -> pd.DataFrame:
    df = pd.read_csv(input_path, encoding="latin-1", dtype=str)
    df.columns = df.columns.str.strip()

    obj_cols = df.select_dtypes(include="object").columns
    for col in obj_cols:
        df[col] = df[col].str.strip()

    # normalize missing-value tokens (case-insensitive) to NaN
    df = df.replace(
        {
            c: {
                t: np.nan for t in df[c].unique() if str(t).strip().lower() in NA_TOKENS
            }
            for c in obj_cols
        }
    )

    # fix label typos
    for col, fixes in LABEL_FIXES.items():
        if col in df.columns:
            df[col] = df[col].replace(fixes)

    for col in ["COMNAME", "SYNO", "ScientificName", "AUTH"]:
        if col in df.columns:
            df[col] = df[col].map(fix_mojibake)

    # drop near-empty columns
    df = df.drop(columns=[c for c in DROP_COLS if c in df.columns])

    # --- numerics -----------------------------------------------------------
    for col in NUMERIC_COLS:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    swapped = 0
    for mn, mx in RANGE_PAIRS:
        mask = df[mn].notna() & df[mx].notna() & (df[mn] > df[mx])
        swapped += int(mask.sum())
        df.loc[mask, [mn, mx]] = df.loc[mask, [mx, mn]].to_numpy()

    df = df.dropna(subset=["GMIN", "GMAX"], how="all")

    core = ["TMIN", "TMAX", "RMIN", "RMAX", "PHMIN", "PHMAX"]
    df = df.dropna(subset=core, how="all")

    for col in LIGHT_COLS:
        df[col + "_SCALE"] = df[col].str.lower().map(LIGHT_SCALE)

    df["EcoPortCode"] = pd.to_numeric(df["EcoPortCode"], errors="coerce").astype(
        "Int64"
    )
    df["ScientificName"] = df["ScientificName"].str.strip()
    df["COMNAME"] = df["COMNAME"].str.lower()
    df = df.drop_duplicates(subset=["ScientificName"]).reset_index(drop=True)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False, encoding="utf-8-sig")

    print(f"rows: {len(df)}, cols: {len(df.columns)}")
    print(f"min/max pairs swapped back into order: {swapped}")
    print(f"saved -> {output_path}")
    return df


if __name__ == "__main__":
    clean()
