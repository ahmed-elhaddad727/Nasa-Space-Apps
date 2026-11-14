import pandas as pd

df = pd.read_csv("data/EcoCrop_DB.csv", encoding="latin-1")

# commmon corps in Egypt
egyptian_crops_list = [
    "wheat",
    "maize",
    "corn",
    "rice",
    "cotton",
    "sugarcane",
    "sugar beet",
    "tomato",
    "potato",
    "onion",
    "garlic",
    "faba bean",
    "broad bean",
    "barley",
    "alfalfa",
    "clover",
    "berseem",
    "date palm",
    "citrus",
    "orange",
    "mango",
    "grape",
    "banana",
    "soybean",
    "sunflower",
]

# make the crop name in lower case
column_name = "COMNAME"
df[column_name] = df[column_name].astype(str).str.lower()

# search for egyption crops
egypt_df = df[df[column_name].str.contains("|".join(egyptian_crops_list), na=False)]
# remove duplicates
egypt_df = egypt_df.drop_duplicates(subset=[column_name])
# save the file
egypt_df.to_csv("Egypt_EcoCrop_DB.csv", index=False, encoding="utf-8-sig")
egypt_df.to_json("Egypt_EcoCrop_DB.json", index=False)

print('file was saved')