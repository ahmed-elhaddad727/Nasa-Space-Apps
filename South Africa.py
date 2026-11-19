import csv
import os

file_path = os.path.join(
    os.path.dirname(__file__),
    "EcoCrop_DB_cleaned.csv"
)

south_africa_crops = [
    ("Maize", ["maize", "corn"]),
    ("Wheat", ["wheat"]),
    ("Barley", ["barley"]),
    ("Sorghum", ["sorghum"]),
    ("Soybean", ["soybean", "soya bean"]),
    ("Sunflower", ["sunflower"]),
    ("Sugarcane", ["sugarcane"]),
    ("Upland Cotton", ["upland cotton"]),
    ("Lucerne (Alfalfa)", ["lucerne", "alfalfa"]),
    ("Potato", ["potato"]),
    ("Sweet Potato", ["sweet potato"]),
    ("Sweet Corn", ["sweet corn"]),
    ("Onion", ["onion"]),
    ("Shallot", ["shallot"]),
    ("Spring Onion", ["spring onion"]),
    ("Potato Onion", ["potato onion"]),
    ("Egyptian Onion", ["egyptian onion"]),
    ("Garlic", ["garlic"]),
    ("Chives", ["chives"]),
    ("Wild Leek", ["wild leek"]),
    ("Tomato", ["tomato"]),
    ("Taro (Amadumbe)", ["taro", "madumbe"]),
    ("Citrus", ["citrus"]),
    ("Orange", ["sweet orange", "orange"]),
    ("Mandarin", ["mandarin"]),
    ("Grapefruit", ["grapefruit"]),
    ("Banana", ["banana"]),
    ("Mango", ["mango"]),
    ("Grape", ["grape"]),
    ("Carambola", ["carambola"]),
    ("Tree Tomato (Tamarillo)", ["tamarillo", "tree tomato"]),
    ("Date Palm", ["date palm"])
]

try:
    with open(file_path, "r", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        database = list(reader)

    all_names = [
        row["COMNAME"].lower()
        for row in database
        if row.get("COMNAME")
    ]

    print("\nSouth Africa")
    print("=" * 35)

    found = []

    for crop, keywords in south_africa_crops:
        if any(
            keyword.lower() in names
            for names in all_names
            for keyword in keywords
        ):
            found.append(crop)

    for number, crop in enumerate(found, 1):
        print(f"{number}. {crop}")

    print("\nTotal crops found:", len(found))

except FileNotFoundError:
    print("ERROR: EcoCrop_DB_cleaned.csv was not found!")

except Exception as error:
    print("ERROR:", error)