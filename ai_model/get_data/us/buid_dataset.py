from pathlib import Path
import sys

repo_root = Path(__file__).resolve().parents[3]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

from ai_model.config import get_settings

app_settings = get_settings()
from ai_model.helpers import build

build(
    app_settings.US_SEASON_OF_MONTH,
    app_settings.US_SEASON_DAYS,
    app_settings.US_MIN_SEASON_COVERAGE,
    app_settings.CLIMATE_FEATURES,
    ["data/Us/US_climate_soil_data_cleaned.csv"],
    "data/US/US_EcoCrop_DB.csv",

    "data/US/US_training_data.csv",
)
