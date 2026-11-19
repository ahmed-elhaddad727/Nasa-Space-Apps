# %%
import pandas as pd

# %%
df = pd.read_csv("../../data/US/US_climate_soil_data.csv")

# %%
df.isna().sum()

# %%
df["LST_Day_C"] = df["LST_Day_C"].interpolate(method="linear")

# %%
df.isna().sum()

# %%
df.duplicated().sum()

# %%
df.to_csv("../../data/US/US_climate_soil_data_cleaned.csv", index=False)
print("file saved")
