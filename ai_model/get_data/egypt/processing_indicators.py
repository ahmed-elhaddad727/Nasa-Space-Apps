import numpy as np
import pandas as pd
df = pd.read_csv("data/egypt/egypt_climate_soil_data.csv")
df["LST_Day_C"] = df["LST_Day_C"].interpolate(method="linear")

np.random.seed(42)  
cooling_factor = np.random.uniform(4.0, 7.0, size=len(df))
df["Temp_Max_C"] = df["LST_Day_C"] - cooling_factor

diurnal_range = np.random.uniform(10.0, 14.0, size=len(df))
df["Temp_Min_C"] = df["Temp_Max_C"] - diurnal_range

df["Temperature_C"] = (df["Temp_Max_C"] + df["Temp_Min_C"]) / 2.0
