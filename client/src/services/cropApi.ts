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

const BACKEND_URL = import.meta.env.VITE_API_URL;
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
};

export function getCropImageUrl(cropName: string): string | undefined {
  const key = cropName.trim().toLowerCase();
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
      // Fetch top 12 combos so merging duplicate starting crops still yields distinct options
      top_k: 12,
    }),
  });

  if (!response.ok) {
    let reason = `This location could not be evaluated (HTTP ${response.status}).`;
    try {
      const errJson = await response.json();
      if (errJson?.detail) {
        reason =
          typeof errJson.detail === "string"
            ? errJson.detail
            : JSON.stringify(errJson.detail);
      }
    } catch {
      const errText = await response.text();
      if (errText) reason = errText;
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
    const groupedMap = new Map<
      string,
      {
        crop: string;
        suitability_score: number;
        season: string;
        nextOptions: string[];
        notes: string;
        image_url?: string;
      }
    >();

    for (const planObj of data.plans) {
      const steps = planObj.plan || [];
      const first = steps[0] || {};
      const second = steps[1] || {};
      const third = steps[2];

      const cropName = (first.crop || "wheat").trim();
      const cropKey = cropName.toLowerCase();

      const nextChain = [second.crop, third?.crop]
        .filter(Boolean)
        .map((c: string) => c.trim())
        .join(" → ");

      if (!groupedMap.has(cropKey)) {
        groupedMap.set(cropKey, {
          crop: cropName,
          suitability_score: Math.round(
            first.suitability ?? planObj.score ?? 90,
          ),
          season: first.season || (data.seasons?.[0] ?? "Winter"),
          nextOptions: nextChain ? [nextChain] : [],
          notes: `Top rotation score: ${planObj.score}/100. Unmet water need: ${
            first.water_need_unmet_pct ?? 0
          }% (irrigation deficit: ${
            first.avg_monthly_irrigation_deficit_mm ?? 0
          } mm/mo).`,
          image_url: getCropImageUrl(cropName),
        });
      } else {
        const existing = groupedMap.get(cropKey)!;
        // Merge distinct follow-up rotation crops with a comma (up to 3 options per card)
        if (
          nextChain &&
          !existing.nextOptions.some(
            (opt) => opt.toLowerCase() === nextChain.toLowerCase(),
          ) &&
          existing.nextOptions.length < 3
        ) {
          existing.nextOptions.push(nextChain);
        }
      }
    }

    // Take up to 3 distinct starting crop cards
    const recommendations: CropRecommendation[] = Array.from(
      groupedMap.values(),
    )
      .slice(0, 3)
      .map((group) => ({
        crop: group.crop,
        suitability_score: group.suitability_score,
        season: group.season,
        rotation_next:
          group.nextOptions.length > 0 ? group.nextOptions.join(", ") : "maize",
        notes: group.notes,
        image_url: group.image_url,
      }));

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
