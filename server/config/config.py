from pathlib import Path
from typing import ClassVar
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ROOT_DIR: Path = Path(__file__).resolve().parents[2]
    MODEL_PATH: Path = ROOT_DIR / "saved_models" / "rotation_model.joblib"


def get_settings():
    return Settings()
