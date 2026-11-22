export interface NasaAgroPayload {
  timestamp: string;
  date: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  previous_crop?: string | null;
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

interface BackendPlanStep {
  season: string;
  crop: string;
  suitability: number;
  water_need_unmet_pct: number;
  avg_monthly_irrigation_deficit_mm: number;
}

interface BackendPlan {
  score: number;
  plan: BackendPlanStep[];
}

interface BackendApiResponse {
  nation?: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
  seasons?: string[];
  plans?: BackendPlan[];
}

const RAW_API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:8000/rotation/recommend/coordinates";

const BASE_API_URL = RAW_API_URL.replace(
  /\/rotation\/recommend\/coordinates\/?\$/,
  "",
).replace(/\/+\$/, "");

const BACKEND_URL = `${BASE_API_URL}/rotation/recommend/coordinates`;
const METADATA_URL = `${BASE_API_URL}/rotation/metadata`;

const FALLBACK_CROPS = [
  "Wheat",
  "Durum Wheat",
  "Barley",
  "Maize",
  "Corn",
  "Rice",
  "Cotton",
  "Onion",
  "Garlic",
  "Potato",
  "Tomato",
  "Faba Bean",
  "Egyptian Clover",
  "Berseem",
  "Sunflower",
  "Sugar Beet",
  "Sugarcane",
  "Soybean",
  "Sorghum",
  "Peanut",
  "Chickpea",
  "Lentil",
  "Common Bean",
  "Alfalfa",
  "Canola",
  "Oats",
  "Rye",
];

const STATIC_CROP_IMAGES: Record<string, string> = {
  corn: "/static/corn.jpg",
  maize: "/static/corn.jpg",
  cotton: "/static/cotton.jpg",
  "faba bean": "/static/faba_bean.jpg",
  "broad bean": "/static/faba_bean.jpg",
  garlic: "/static/garlic.jpg",
  onion: "/static/onion.jpg",
  potato: "/static/potato.jpg",
  rice: "/static/rice.jpg",
  "sugar beet": "/static/sugar_beet.jpg",
  sugarcane: "/static/sugarcane.jpg",
  sunflower: "/static/sunflower.jpg",
  tomato: "/static/tomato.jpg",
  wheat: "/static/wheat.jpg",
  "durum wheat": "/static/wheat.jpg",
};

const CROP_ALIASES: Record<string, string> = {
  maize: "corn",
  "broad bean": "faba bean",
  "durum wheat": "wheat",
};

function cleanCropName(raw: string): string {
  return raw.split(",")[0].trim();
}

function canonicalCropKey(raw: string): string {
  const base = cleanCropName(raw).toLowerCase();
  return CROP_ALIASES[base] ?? base;
}

function formatCropDisplay(raw: string): string {
  return cleanCropName(raw)
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

export function getCropImageUrl(cropName: string): string | undefined {
  const key = cleanCropName(cropName).toLowerCase();
  return STATIC_CROP_IMAGES[key] ?? STATIC_CROP_IMAGES[canonicalCropKey(key)];
}

export async function fetchAvailableCrops(): Promise<string[]> {
  try {
    const res = await fetch(METADATA_URL);
    if (!res.ok) return FALLBACK_CROPS;
    const data = await res.json();
    const list: string[] = Array.isArray(data?.all_crops) ? data.all_crops : [];
    if (list.length === 0) return FALLBACK_CROPS;

    const unique = Array.from(
      new Set(list.map((c) => formatCropDisplay(c)).filter(Boolean)),
    );
    return unique.sort((a, b) => a.localeCompare(b));
  } catch {
    return FALLBACK_CROPS;
  }
}

function buildRecommendation(
  planObj: BackendPlan,
  fallbackSeason: string,
): CropRecommendation {
  const steps = planObj.plan ?? [];
  const first = steps[0];
  const followUps = steps.slice(1);

  const rawFirstCrop = first?.crop || "wheat";
  const cropDisplay = formatCropDisplay(rawFirstCrop);

  const nextChain = followUps
    .map((s) => formatCropDisplay(s.crop))
    .filter(Boolean)
    .join(" → ");

  const followUpSummary =
    followUps.length > 0
      ? ` Next (${followUps[0].season}): ${formatCropDisplay(followUps[0].crop)} (${
          followUps[0].avg_monthly_irrigation_deficit_mm ?? 0
        } mm/mo deficit).`
      : "";

  return {
    crop: cropDisplay,
    suitability_score: Math.round(first?.suitability ?? planObj.score ?? 0),
    season: first?.season || fallbackSeason,
    rotation_next: nextChain || "None",
    notes: `Rotation score: ${planObj.score}/100. Unmet water need: ${
      first?.water_need_unmet_pct ?? 0
    }% (${first?.avg_monthly_irrigation_deficit_mm ?? 0} mm/mo deficit).${followUpSummary}`,
    image_url: getCropImageUrl(rawFirstCrop),
  };
}

export async function sendAgroDataToBackend(
  payload: NasaAgroPayload,
): Promise<BackendResponse> {
  const normalizedPrevCrop = payload.previous_crop
    ? cleanCropName(payload.previous_crop).toLowerCase()
    : null;

  const response = await fetch(BACKEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      lat: payload.coordinates.latitude,
      lon: payload.coordinates.longitude,
      start_date: payload.date,
      previous_crop: normalizedPrevCrop,
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

  const data: BackendApiResponse = await response.json();

  if (Array.isArray(data.plans) && data.plans.length > 0) {
    const validPlans = data.plans.filter(
      (p) => Array.isArray(p.plan) && p.plan.length > 0,
    );

    const selectedPlans: BackendPlan[] = [];
    const seenFirstCrops = new Set<string>();
    const seenChains = new Set<string>();

    // Pass 1: Prefer plans with distinct starting crops
    for (const planObj of validPlans) {
      const firstKey = canonicalCropKey(planObj.plan[0].crop);
      const chainKey = planObj.plan
        .map((s) => canonicalCropKey(s.crop))
        .join("->");

      if (seenFirstCrops.has(firstKey) || seenChains.has(chainKey)) continue;

      seenFirstCrops.add(firstKey);
      seenChains.add(chainKey);
      selectedPlans.push(planObj);

      if (selectedPlans.length === 3) break;
    }

    // Pass 2: If fewer than 3 unique starting crops exist,
    // fill remaining slots with the highest-scoring distinct full rotation sequences.
    if (selectedPlans.length < 3) {
      for (const planObj of validPlans) {
        const chainKey = planObj.plan
          .map((s) => canonicalCropKey(s.crop))
          .join("->");

        if (seenChains.has(chainKey)) continue;

        seenChains.add(chainKey);
        selectedPlans.push(planObj);

        if (selectedPlans.length === 3) break;
      }
    }

    const fallbackSeason = data.seasons?.[0] ?? "Winter";
    const lat = data.coordinates?.lat ?? payload.coordinates.latitude;
    const lon = data.coordinates?.lon ?? payload.coordinates.longitude;
    const nationPrefix = data.nation ? `${data.nation.toUpperCase()} — ` : "";

    return {
      status: "suitable",
      location_summary: `${nationPrefix}Lat ${lat.toFixed(2)}°, Lon ${lon.toFixed(2)}°`,
      recommendations: selectedPlans.map((p) =>
        buildRecommendation(p, fallbackSeason),
      ),
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