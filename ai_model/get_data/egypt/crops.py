from pathlib import Path
import sys

repo_root = Path(__file__).resolve().parents[3]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

from ai_model.helpers.get_crops import extract_crops
from ai_model.config import get_settings

app_settings = get_settings()

# common crops in Egypt
extract_crops(crops_list=app_settings.EGYPTAIN_CROP_LIST, region="egypt")
