from pathlib import Path
import sys

repo_root = Path(__file__).resolve().parents[3]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

from ai_model.config import get_settings

app_settings = get_settings()
from ai_model.helpers import build
from server.models.egypt_model import SEASON_DAYS

build(
    app_settings.EGYPTAIN_SEASON_OF_MONTH,
    SEASON_DAYS,
    app_settings.EGYPTAIN_MIN_SEASON_COVERAGE,
    app_settings.CLIMATE_FEATURES,
    ["data/egypt/egypt_climate_soil_data.csv"],
    "data/egypt/egypt_EcoCrop_DB.csv",
    "/data/egypt/egypt_training_data.csv",
)
