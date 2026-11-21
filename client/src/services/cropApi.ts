export interface NasaAgroPayload {
  timestamp: string;
  date: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  agroclimatology: {
    T2M: number | null;
    PRECTOTCORR: number | null;
    RH2M: number | null;
    ALLSKY_SFC_SW_DWN: number | null;
    GWETTOP: number | null;
  };
}

export interface CropRecommendation {
  crop: string;
  suitability_score: number;
  season: string;
  rotation_next: string;
  notes: string;
  image_url?: string;
}

export interface BackendResponse {
  status: "suitable" | "unsuitable";
  location_summary: string;
  recommendations: CropRecommendation[];
  unsuitable_reason?: string;
}

const RAW_API_URL =
  import.meta.env.VITE_API_URL || "https://agrishift-server.vercel.app";

const BACKEND_URL = RAW_API_URL.includes("/rotation/recommend/coordinates")
  ? RAW_API_URL
  : `${RAW_API_URL.replace(/\/+$/, "")}/rotation/recommend/coordinates`;

const STATIC_CROP_IMAGES: Record<string, string> = {
  corn: "/static/corn.jpg",
  cotton: "/static/cotton.jpg",
  "faba bean": "/static/faba_bean.jpg",
  "broad bean": "/static/faba_bean.jpg",
  garlic: "/static/garlic.jpg",
  maize: "/static/maize.jpg",
  onion: "/static/onion.jpg",
  potato: "/static/potato.jpg",
  rice: "/static/rice.jpg",
  "sugar beet": "/static/sugar_beet.jpg",
  sugarcane: "/static/sugarcane.jpg",
  tomato: "/static/tomato.jpg",
  wheat: "/static/wheat.jpg",
  "durum wheat": "/static/wheat.jpg",
};

function cleanCropName(raw: string): string {
  return raw.split(",")[0].trim();
}

export function getCropImageUrl(cropName: string): string | undefined {
  const key = cleanCropName(cropName).toLowerCase();
  return STATIC_CROP_IMAGES[key];
}

export async function sendAgroDataToBackend(
  payload: NasaAgroPayload,
): Promise<BackendResponse> {
  const response = await fetch(BACKEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      lat: payload.coordinates.latitude,
      lon: payload.coordinates.longitude,
      start_date: payload.date,
      previous_crop: null,
      top_k: 20,
    }),
  });

  if (!response.ok) {
    let reason = `This location could not be evaluated (HTTP ${response.status}).`;
    const rawText = await response.text();
    try {
      const errJson = JSON.parse(rawText);
      if (errJson?.detail) {
        reason =
          typeof errJson.detail === "string"
            ? errJson.detail
            : JSON.stringify(errJson.detail);
      }
    } catch {
      if (rawText && !rawText.trim().startsWith("<")) {
        reason = rawText;
      }
    }

    return {
      status: "unsuitable",
      location_summary: `Lat ${payload.coordinates.latitude.toFixed(
        2,
      )}°, Lon ${payload.coordinates.longitude.toFixed(2)}°`,
      recommendations: [],
      unsuitable_reason: reason,
    };
  }

  const data = await response.json();

  if (Array.isArray(data.plans) && data.plans.length > 0) {
    const seenCrops = new Set<string>();
    const recommendations: CropRecommendation[] = [];

    for (const planObj of data.plans) {
      const steps = planObj.plan || [];
      const first = steps[0] || {};
      const second = steps[1] || {};
      const third = steps[2];

      const cropName = cleanCropName(first.crop || "wheat");
      const cropKey = cropName.toLowerCase();

      if (seenCrops.has(cropKey)) continue;
      seenCrops.add(cropKey);

      const nextChain = [second.crop, third?.crop]
        .filter(Boolean)
        .map((c: string) => cleanCropName(c))
        .join(" → ");

      recommendations.push({
        crop: cropName,
        suitability_score: Math.round(first.suitability ?? planObj.score ?? 90),
        season: first.season || (data.seasons?.[0] ?? "Winter"),
        rotation_next: nextChain || "Maize",
        notes: `Top rotation score: ${planObj.score}/100. Unmet water need: ${
          first.water_need_unmet_pct ?? 0
        }% (irrigation deficit: ${
          first.avg_monthly_irrigation_deficit_mm ?? 0
        } mm/mo).`,
        image_url: getCropImageUrl(cropName),
      });

      if (recommendations.length === 3) break;
    }

    return {
      status: "suitable",
      location_summary: `${(data.nation || "Egypt").toUpperCase()} — Lat ${payload.coordinates.latitude.toFixed(
        2,
      )}°, Lon ${payload.coordinates.longitude.toFixed(2)}°`,
      recommendations,
    };
  }

  return {
    status: "unsuitable",
    location_summary: `Lat ${payload.coordinates.latitude.toFixed(
      2,
    )}°, Lon ${payload.coordinates.longitude.toFixed(2)}°`,
    recommendations: [],
    unsuitable_reason:
      "No viable multi-season crop rotation plan met the suitability threshold for these coordinates.",
  };
}