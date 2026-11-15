import React from 'react';
import { BackendResponse, NasaAgroPayload } from './services/cropApi';

// Same grass image as the map page (change the path if you use your own photo)
const GRASS_IMAGE = '/grass_photo.svg';
interface CropResultsProps {
  result: BackendResponse;
  payload: NasaAgroPayload;
  onBack: () => void;
}

export default function CropResults({ result, payload, onBack }: CropResultsProps) {
  const { latitude, longitude } = payload.coordinates;
  const { T2M, PRECTOTCORR, RH2M, GWETTOP } = payload.agroclimatology;

  const latLabel = `${Math.abs(latitude).toFixed(2)}°${latitude >= 0 ? 'N' : 'S'}`;
  const lonLabel = `${Math.abs(longitude).toFixed(2)}°${longitude >= 0 ? 'E' : 'W'}`;
  // Format top rotation pairs into a clean summary sentence
  const topRotationsText = result.recommendations
    .slice(0, 2)
    .map((item) => `${item.crop} → ${item.rotation_next}`)
    .join(' and ');

  const stats = [
    { label: 'TEMP (2M)', value: T2M !== null ? `${T2M} °C` : '24.2 °C' },
    { label: 'SOIL WETNESS', value: GWETTOP !== null ? `${Math.round(GWETTOP * 100)}%` : '44%' },
    { label: 'HUMIDITY', value: RH2M !== null ? `${RH2M}%` : '56%' },
    { label: 'PRECIPITATION', value: PRECTOTCORR !== null ? `${PRECTOTCORR} mm` : '0.1 mm' },
  ];

  const glass = 'bg-white/70 backdrop-blur-md ring-1 ring-white/60 shadow-md shadow-emerald-950/10';

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#7DB85A] text-emerald-950 font-['Bricolage_Grotesque',ui-sans-serif,system-ui,sans-serif] px-5 py-10 sm:py-14">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div
          style={{ backgroundImage: `url('${GRASS_IMAGE}')` }}
          className="absolute inset-0 bg-cover bg-center blur-[2px] scale-105"
        />
        <div className="absolute inset-0 bg-emerald-900/20" />
      </div>

      <div className="mx-auto w-full max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-900 text-white text-sm font-semibold shadow-lg shadow-emerald-950/25 hover:bg-emerald-800 active:scale-[0.98] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 cursor-pointer"
          >
            <span aria-hidden="true">←</span> Back to map
          </button>

          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/80 backdrop-blur text-xs font-medium tabular-nums shadow-md shadow-emerald-950/10">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            {latLabel}, {lonLabel}
          </span>
        </div>

        <header className="mb-8">
          <p className="text-sm font-medium text-emerald-950/80 mb-2">Soil &amp; climate analysis</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
            According to your soil and climate, the best crop rotations:{' '}
            <span className="capitalize text-emerald-800 underline decoration-amber-400 decoration-4 underline-offset-[6px]">
              {topRotationsText}
            </span>
          </h1>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {stats.map((s) => (
            <div key={s.label} className={`rounded-2xl p-4 ${glass}`}>
              <span className="block text-xs font-medium text-emerald-950/60">{s.label}</span>
              <span className="mt-1 block text-xl font-bold tabular-nums">{s.value}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {result.recommendations.map((item, idx) => (
            <article
              key={idx}
              className={`flex flex-col justify-between rounded-2xl p-5 ${glass}`}
            >
              <div>
                <h2 className="text-xl font-bold capitalize">{item.crop}</h2>
                <p className="mt-0.5 text-sm text-emerald-950/60">Season: {item.season}</p>

                <div className="mt-4">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-emerald-950/70">Match</span>
                    <span className="font-semibold tabular-nums">{item.suitability_score}%</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={item.suitability_score}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="mt-1.5 h-2 rounded-full bg-emerald-950/10 overflow-hidden"
                  >
                    <div
                      className="h-full rounded-full bg-emerald-600"
                      style={{ width: `${Math.max(0, Math.min(100, item.suitability_score))}%` }}
                    />
                  </div>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-emerald-950/80">{item.notes}</p>
              </div>

              <div className="mt-5 pt-4 border-t border-emerald-950/10 text-sm">
                <span className="text-emerald-950/60">Rotate next with: </span>
                <strong className="font-semibold capitalize">{item.rotation_next}</strong>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

