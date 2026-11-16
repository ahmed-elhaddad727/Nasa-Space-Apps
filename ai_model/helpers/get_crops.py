import pandas as pd
import numpy as np

df = pd.read_csv("data/EcoCrop_DB_cleaned.csv", encoding="latin-1")

def extract_crops(
    crops_list: list,
    region: str,
    input_path: str = "data/EcoCrop_DB.csv",
    output_dir: str = "data",
    ) -> pd.DataFrame:
    # make the crop name in lower case
    column_name = "COMNAME"
    df[column_name] = df[column_name].astype(str).str.lower()

    # search for regionion crops
    region_df = df[df[column_name].str.contains("|".join(crops_list), na=False)]
    # remove duplicates
    region_df = region_df.drop_duplicates(subset=[column_name])
    # save the file
    region_df.to_csv(f"data/{region}/{region}_EcoCrop_DB.csv", index=False, encoding="utf-8-sig")

    print("file was saved")
