# %%
import pandas as pd

# %%
df = pd.read_csv("../../data/egypt/egypt_climate_soil_data.csv")

# %%
df.isna().sum()

# %%
df["LST_Day_C"] = df["LST_Day_C"].interpolate(method="linear")

# %%
df.isna().sum()

# %%
df["Temperature_C"] = df["LST_Day_C"] - 3.0

# %%
df["Temp_Max_C"] = df["LST_Day_C"]
df["Temp_Min_C"] = df["LST_Day_C"] - 12.0

# %%
df.isna().sum()

# %%
df.duplicated().sum()

# %%
df.to_csv("../../data/egypt/egypt_climate_soil_data_cleaned.csv", index=False)
print("file saved")
