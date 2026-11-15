export interface NasaAgroPayload {
  timestamp: string;
  date: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  agroclimatology: {
    T2M: number | null;             // Temperature at 2 Meters (°C)
    PRECTOTCORR: number | null;     // Precipitation (mm/day)
    RH2M: number | null;            // Relative Humidity (%)
    ALLSKY_SFC_SW_DWN: number | null; // Solar Radiation (MJ/m^2/day)
    GWETTOP: number | null;         // Surface Soil Wetness (0-1)
  };
}

export interface CropRecommendation {
  crop: string;
  suitability_score: number; // 0 to 100
  season: string;
  rotation_next: string;
  notes: string;
}

export interface BackendResponse {
  status: 'live' | 'mock_fallback';
  location_summary: string;
  recommendations: CropRecommendation[];
}

// Defaults to localhost:8000 (FastAPI) or localhost:5000 (Flask), configurable via .env
const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/recommend';

export async function sendAgroDataToBackend(payload: NasaAgroPayload): Promise<BackendResponse> {
  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Backend returned status ${response.status}`);
    }

    const data = await response.json();
    return {
      status: 'live',
      location_summary: data.location_summary || `Lat ${payload.coordinates.latitude}, Lon ${payload.coordinates.longitude}`,
      recommendations: data.recommendations || data.crops || [],
    };
  } catch (error) {
    console.warn('Backend offline or unreachable — using local mock response so UI works:', error);

    // Smart mock fallback using the exact crops from ai_model/get_data/egypt/crops.py
    const temp = payload.agroclimatology.T2M ?? 24;
    const isWarm = temp >= 22;

    return {
      status: 'mock_fallback',
      location_summary: `Lat ${payload.coordinates.latitude}°, Lon ${payload.coordinates.longitude}° (${temp}°C)`,
      recommendations: isWarm
        ? [
            {
              crop: 'maize',
              suitability_score: 94,
              season: 'Summer (Nili)',
              rotation_next: 'berseem / wheat',
              notes: 'Optimal thermal window and solar irradiance for high grain yield.',
            },
            {
              crop: 'cotton',
              suitability_score: 89,
              season: 'Summer',
              rotation_next: 'faba bean',
              notes: 'Matches EcoCrop temperature thresholds; follow with legume to restore nitrogen.',
            },
            {
              crop: 'sunflower',
              suitability_score: 82,
              season: 'Summer',
              rotation_next: 'wheat',
              notes: 'High drought tolerance and strong oilseed yield under current surface wetness.',
            },
          ]
        : [
            {
              crop: 'wheat',
              suitability_score: 96,
              season: 'Winter (Shitwi)',
              rotation_next: 'maize / rice',
              notes: 'Ideal cool-season temperature profile for Egyptian staple grain production.',
            },
            {
              crop: 'faba bean',
              suitability_score: 91,
              season: 'Winter (Shitwi)',
              rotation_next: 'cotton / maize',
              notes: 'Fixes atmospheric nitrogen into soil; reduces fertilizer need for summer crop.',
            },
            {
              crop: 'berseem (Egyptian clover)',
              suitability_score: 88,
              season: 'Winter',
              rotation_next: 'rice / tomato',
              notes: 'Improves soil organic structure and suppresses winter weeds.',
            },
          ],
    };
  }
}