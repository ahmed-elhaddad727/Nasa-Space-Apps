import pathlib
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import ClassVar
import datetime
import pandas as pd
from pathlib import Path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parents[2] / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    APP_NAME: str
    APP_VERSION: str

    GOOGLE_PROJECT_NUMBER: str
    GOOGLE_PROJECT_ID: str

    START: str = "2016-01-01"
    END: str = "2025-12-31"
    ROOT_DIR: Path = Path(__file__).resolve().parents[2]

    # Egypt:

    EGYPT_MODEL_PATH: Path = ROOT_DIR / "saved_models" / "egypt_rotation_model"
    EGYPTAIN_CROP_LIST: ClassVar[list[str]] = [
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
    EGYPT_LOCATIONS: ClassVar[dict[str, list[float]]] = {
        # --- Nile Delta (Lower Egypt) ---
        "beheira_damanhur": [30.47, 31.04],
        "nubaria_reclamation": [30.07, 30.67],
        "kafr_el_sheikh": [30.94, 31.11],
        "dakahlia_mansoura": [31.38, 31.04],
        "gharbia_tanta": [31.00, 30.79],
        "menoufia": [31.00, 30.50],
        "sharqia": [31.50, 30.60],
        "qalyubia_banha": [31.18, 30.46],
        "damietta": [31.81, 31.42],
        "ismailia": [32.27, 30.60],
        # --- North Coast & Sinai ---
        "alexandria_burg_el_arab": [29.55, 30.88],
        "matrouh_siwa": [25.52, 29.20],
        "north_sinai_arish": [33.80, 31.13],
        # --- Middle Egypt ---
        "giza_badrashin": [31.27, 29.85],
        "fayoum": [30.84, 29.31],
        "beni_suef": [31.10, 29.07],
        "minya": [30.75, 28.10],
        "asyut": [31.18, 27.18],
        # --- Upper Egypt ---
        "sohag": [31.70, 26.56],
        "qena": [32.72, 26.16],
        "luxor": [32.64, 25.69],
        "aswan_kom_ombo": [32.95, 24.47],
        # --- Western Desert & Mega-Reclamation Projects ---
        "new_valley_kharga": [30.55, 25.45],
        "new_valley_dakhla": [28.98, 25.50],
        "new_valley_farafra": [27.97, 27.06],
        "toshka": [31.53, 22.60],
        "east_owainat": [28.72, 22.58],
    }
    EGYPTAIN_SEASON_DAYS: ClassVar[dict[str, int]] = {"winter": 181, "summer": 184}
    EGYPTAIN_SEASON_OF_MONTH: ClassVar[dict[int, str]] = {
        11: "winter",
        12: "winter",
        1: "winter",
        2: "winter",
        3: "winter",
        4: "winter",
        5: "summer",
        6: "summer",
        7: "summer",
        8: "summer",
        9: "summer",
        10: "summer",
    }
    EGYPTAIN_MIN_SEASON_COVERAGE: ClassVar[float] = 0.8

    # US
    US_MODEL_PATH: Path = ROOT_DIR / "saved_models" / "us_rotation_model"
    US_CROP_LIST: ClassVar[list[str]] = [
        # --- Major Row Crops & Grains ---
        "corn",
        "maize",
        "soybean",
        "wheat",
        "barley",
        "oats",
        "rye",
        "sorghum",
        "rice",
        "cotton",
        "peanut",
        "sunflower",
        "rapeseed",
        "canola",
        # --- Sugar, Forage & Pulses (Rotation Crops) ---
        "sugar beet",
        "sugarcane",
        "alfalfa",
        "clover",
        "lentil",
        "chickpea",
        "common bean",
        "dry bean",
        "pea",
        # --- Vegetables & Root Crops ---
        "potato",
        "sweet potato",
        "tomato",
        "onion",
        "garlic",
        "lettuce",
        "broccoli",
        "carrot",
        "spinach",
        "cabbage",
        # --- Fruits & Tree Nuts ---
        "apple",
        "grape",
        "orange",
        "citrus",
        "strawberry",
        "blueberry",
        "peach",
        "cherry",
        "watermelon",
        "almond",
        "walnut",
        "pistachio",
        "pecan",
    ]
    US_LOCATIONS: ClassVar[dict[str, list[float]]] = {
        # --- Midwest / Corn & Soybean Belt ---
        "Iowa_CornBelt": [-93.10, 41.88],
        "Illinois_CentralCornBelt": [-88.24, 40.12],
        "Indiana_EasternCornBelt": [-86.87, 40.42],
        "Wisconsin_DairyForage": [-89.40, 43.07],
        "Minnesota_RedRiverValley": [-96.79, 46.88],
        # --- Great Plains (Winter & Spring Wheat Belts) ---
        "Kansas_GreatPlains": [-98.32, 38.50],
        "NorthDakota_NorthernPlains": [-97.03, 47.92],
        "Nebraska_PlatteValley": [-98.34, 40.82],
        "Texas_HighPlains": [-101.85, 33.58],
        # --- Mississippi Delta & Southeast ---
        "Arkansas_MississippiDelta": [-91.55, 34.75],
        "Mississippi_YazooDelta": [-90.91, 33.41],
        "Louisiana_SugarcaneBayou": [-90.82, 29.95],
        "Georgia_CoastalPlain": [-84.16, 31.58],
        "NorthCarolina_PiedmontCoast": [-77.91, 35.78],
        "Florida_CentralCitrus": [-81.72, 27.95],
        "Florida_EvergladesAg": [-80.67, 26.68],
        # --- California & Desert Southwest ---
        "Fresno_CentralValley": [-119.79, 36.74],
        "Sacramento_NorthValley": [-121.62, 39.14],
        "Salinas_CoastalProduce": [-121.66, 36.68],
        "Yuma_DesertSW": [-114.63, 32.69],
        "Texas_RioGrandeValley": [-98.23, 26.20],
        # --- Pacific Northwest & Intermountain West ---
        "Yakima_PacificNW": [-120.51, 46.60],
        "Washington_Palouse": [-117.18, 46.73],
        "Idaho_SnakeRiverPlain": [-112.03, 43.49],
        "Oregon_WillametteValley": [-123.04, 44.94],
        "Colorado_SanLuisValley": [-105.87, 37.47],
        # --- Northeast & Mid-Atlantic ---
        "Pennsylvania_Lancaster": [-76.31, 40.04],
        "NewYork_FingerLakes": [-76.98, 42.87],
        "Maine_AroostookCounty": [-68.01, 46.68],
    }
    US_SEASON_DAYS: ClassVar[dict[str, int]] = {
        "winter": 90,
        "spring": 92,
        "summer": 92,
        "fall": 91,
    }
    US_SEASON_OF_MONTH: ClassVar[dict[int, str]] = {
        12: "winter",
        1: "winter",
        2: "winter",
        3: "spring",
        4: "spring",
        5: "spring",
        6: "summer",
        7: "summer",
        8: "summer",
        9: "fall",
        10: "fall",
        11: "fall",
    }
    US_MIN_SEASON_COVERAGE: ClassVar[float] = 0.8
    CLIMATE_FEATURES: ClassVar[list[str]] = [
        "t_mean",
        "t_min_mean",
        "t_max_mean",
        "t_min_abs",
        "t_max_abs",
        "ndvi_mean",
        "precip_total",
        "sm_mean",
    ]

    CROP_PARAMS: ClassVar[list[str]] = [
        "TOPMN",
        "TOPMX",
        "TMIN",
        "TMAX",
        "KTMP",
        "GMIN",
        "ROPMN",
    ]

    REQUIRED_DAILY: ClassVar[list[str]] = [
        "Temperature_C",
        "Temp_Min_C",
        "Temp_Max_C",
        "precip_30d",
        "ndvi_14d",
        "sm_7d",
    ]
    W_NDVI: ClassVar[float] = 0.20
    W_MOIST: ClassVar[float] = 0.20
    NDVI_FULL: ClassVar[float] = 0.60
    SM_WILT: ClassVar[float] = 0.10
    SM_OPT: ClassVar[float] = 0.30
    ROOT_DEPTH_MM: ClassVar[int] = 300
    SOIL_CREDIT: ClassVar[float] = 0.5
    LST: str = "MODIS/061/MOD11A2"
    NDVI: str = "MODIS/061/MOD13Q1"
    IMERG: str = "NASA/GPM_L3/IMERG_V07"
    SMAP: str = "NASA/SMAP/SPL4SMGP/008"

    ERA5: ClassVar[str] = "ECMWF/ERA5_LAND/DAILY_AGGR"  # daily air temperature (Kelvin)
    CACHE_DIR: ClassVar[Path] = Path("cache")

    END_EXCL: ClassVar[datetime.datetime] = pd.Timestamp(END) + pd.Timedelta(days=1)
    FULL_DAYS: ClassVar[pd.DatetimeIndex] = pd.date_range(START, END, freq="D")


def get_settings():
    return Settings()
