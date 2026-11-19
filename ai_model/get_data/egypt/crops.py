from pathlib import Path
import sys

repo_root = Path(__file__).resolve().parents[3]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

from ai_model.helpers.get_crops import extract_crops

# common crops in Egypt

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

extract_crops(crops_list=egyptian_crops_list, region="egypt")