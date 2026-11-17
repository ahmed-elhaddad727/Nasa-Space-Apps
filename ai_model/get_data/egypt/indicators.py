from pathlib import Path
import sys

repo_root = Path(__file__).resolve().parents[3]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))
import ee

from ai_model.config import get_settings
from ai_model.helpers.get_indicators import get_indicators

app_settings = get_settings()
# ee.Authenticate() just for the first attemp
ee.Initialize(project=app_settings.GOOGLE_PROJECT_ID)
get_indicators(app_settings.EGYPT_LOCATIONS, "egypt")
