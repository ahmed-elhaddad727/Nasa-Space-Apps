import React from 'react';
import { BackendResponse, NasaAgroPayload } from './services/cropApi';
import {
  Lang,
  UI_TEXT,
  translateCrop,
  translateRotationChain,
  translateSeason,
  translateNotes,
  translateUnsuitableReason,
} from './i18n';

const GRASS_IMAGE = '/grass_photo.svg';

interface CropResultsProps {
  result: BackendResponse;
  payload: NasaAgroPayload;
  onBack: () => void;
  lang: Lang;
  onToggleLang: () => void;
}

export default function CropResults({
  result,
  payload,
  onBack,
  lang,
  onToggleLang,
}: CropResultsProps) {
  const { latitude, longitude } = payload.coordinates;
  const { T2M, PRECTOTCORR, RH2M, GWETTOP } = payload.agroclimatology;

  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';

  const latLabel = `${Math.abs(latitude).toFixed(2)}°${
    latitude >= 0 ? 'N' : 'S'
  }`;
  const lonLabel = `${Math.abs(longitude).toFixed(2)}°${
    longitude >= 0 ? 'E' : 'W'
  }`;

  const isSuitable =
    result.status === 'suitable' && result.recommendations.length > 0;

  const arrow = isRtl ? '←' : '→';
  const topRotationsText = result.recommendations
    .slice(0, 2)
    .map(
      (item) =>
        `${translateCrop(item.crop, lang)} ${arrow} ${translateRotationChain(
          item.rotation_next,
          lang
        )}`
    )
    .join(t.andJoin);

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="relative isolate min-h-screen overflow-hidden bg-[#7DB85A] text-emerald-950 font-['Bricolage_Grotesque',ui-sans-serif,system-ui,sans-serif] px-5 py-10 sm:py-14"
    >
      {/* Blurred grass image background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div
          style={{ backgroundImage: `url('${GRASS_IMAGE}')` }}
          className="absolute inset-0 bg-cover bg-center blur-[2px] scale-105"
        />
        <div className="absolute inset-0 bg-emerald-900/20" />
      </div>

      <div className="mx-auto w-full max-w-4xl">
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/85 backdrop-blur text-sm font-semibold text-emerald-950 ring-1 ring-white/60 shadow-sm hover:bg-emerald-900 hover:text-white transition cursor-pointer"
          >
            {t.pickAnotherSpot}
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <span
              dir="ltr"
              className="px-3.5 py-1.5 rounded-full bg-white/75 backdrop-blur text-xs font-medium tabular-nums ring-1 ring-white/60"
            >
              {latLabel}, {lonLabel}
            </span>
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/75 backdrop-blur text-xs font-medium ring-1 ring-white/60">
              <span
                className={`w-2 h-2 rounded-full ${
                  isSuitable ? 'bg-emerald-500' : 'bg-red-500'
                }`}
              />
              {isSuitable ? t.suitableBadge : t.unsuitableBadge}
            </span>

            {/* Top-Right Language Switcher */}
            <button
              onClick={onToggleLang}
              aria-label="Switch language"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/85 backdrop-blur text-xs font-semibold text-emerald-950 ring-1 ring-white/60 shadow-sm hover:bg-emerald-900 hover:text-white transition cursor-pointer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3.5 h-3.5"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
              <span>{t.langToggleLabel}</span>
            </button>
          </div>
        </div>

        {/* Headline Statement */}
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-950/75 mb-2">
            {t.nasaHeader}
          </p>
          {isSuitable ? (
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-snug">
              {t.suitableHeadlinePrefix}
              <span className="underline decoration-emerald-900/50 decoration-2 underline-offset-4 capitalize">
                {topRotationsText}
              </span>
            </h1>
          ) : (
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-snug">
              {t.unsuitableHeadline}
            </h1>
          )}
        </header>

        {/* NASA Telemetry Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="rounded-2xl bg-white/70 backdrop-blur-md p-4 ring-1 ring-white/60 shadow-md shadow-emerald-950/10">
            <span className="block text-xs font-medium text-emerald-950/65">
              {t.tempLabel}
            </span>
            <span
              dir="ltr"
              className="mt-1 inline-block text-lg font-bold tabular-nums"
            >
              {T2M !== null ? `${T2M} °C` : 'N/A'}
            </span>
          </div>
          <div className="rounded-2xl bg-white/70 backdrop-blur-md p-4 ring-1 ring-white/60 shadow-md shadow-emerald-950/10">
            <span className="block text-xs font-medium text-emerald-950/65">
              {t.soilWetnessLabel}
            </span>
            <span
              dir="ltr"
              className="mt-1 inline-block text-lg font-bold tabular-nums"
            >
              {GWETTOP !== null ? `${Math.round(GWETTOP * 100)}%` : 'N/A'}
            </span>
          </div>
          <div className="rounded-2xl bg-white/70 backdrop-blur-md p-4 ring-1 ring-white/60 shadow-md shadow-emerald-950/10">
            <span className="block text-xs font-medium text-emerald-950/65">
              {t.humidityLabel}
            </span>
            <span
              dir="ltr"
              className="mt-1 inline-block text-lg font-bold tabular-nums"
            >
              {RH2M !== null ? `${RH2M}%` : 'N/A'}
            </span>
          </div>
          <div className="rounded-2xl bg-white/70 backdrop-blur-md p-4 ring-1 ring-white/60 shadow-md shadow-emerald-950/10">
            <span className="block text-xs font-medium text-emerald-950/65">
              {t.precipLabel}
            </span>
            <span
              dir="ltr"
              className="mt-1 inline-block text-lg font-bold tabular-nums"
            >
              {PRECTOTCORR !== null ? `${PRECTOTCORR} mm` : 'N/A'}
            </span>
          </div>
        </div>

        {/* Conditional Body: Suitable Crop Cards vs. Unsuitable Diagnostic Card */}
        {isSuitable ? (
          <div
            className={`grid grid-cols-1 gap-4 ${
              result.recommendations.length === 1
                ? 'md:grid-cols-1 max-w-xl'
                : result.recommendations.length === 2
                ? 'md:grid-cols-2'
                : 'md:grid-cols-3'
            }`}
          >
            {result.recommendations.map((item, idx) => (
              <article
                key={idx}
                className="flex flex-col justify-between rounded-2xl bg-white/70 backdrop-blur-md overflow-hidden ring-1 ring-white/60 shadow-md shadow-emerald-950/10"
              >
                <div>
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt={item.crop}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display =
                          'none';
                      }}
                      className="w-full h-36 object-cover"
                    />
                  )}
                  <div className="p-5">
                    <h2 className="text-xl font-bold capitalize">
                      {translateCrop(item.crop, lang)}
                    </h2>
                    <p className="mt-0.5 text-sm text-emerald-950/60">
                      {t.seasonLabel}: {translateSeason(item.season, lang)}
                    </p>

                    {/* Suitability bar */}
                    <div className="mt-4">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-emerald-950/70">
                          {t.matchLabel}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {item.suitability_score}%
                        </span>
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
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(100, item.suitability_score)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    <p className="mt-4 text-sm leading-relaxed text-emerald-950/80">
                      {translateNotes(item.notes, lang)}
                    </p>
                  </div>
                </div>

                <div className="px-5 pb-5 pt-4 border-t border-emerald-950/10 text-sm">
                  <span className="text-emerald-950/60">
                    {t.plantNextLabel}
                  </span>
                  <strong className="font-semibold capitalize">
                    {translateRotationChain(item.rotation_next, lang)}
                  </strong>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl bg-white/75 backdrop-blur-md p-6 sm:p-8 ring-1 ring-white/60 shadow-lg shadow-emerald-950/10">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-11 h-11 rounded-2xl bg-red-600/15 text-red-800 flex items-center justify-center font-bold text-xl">
                !
              </div>
              <div className="flex-1">
                <h2 className="text-xl sm:text-2xl font-bold text-emerald-950">
                  {t.whyUnsuitableTitle}
                </h2>
                <p className="mt-3 text-base leading-relaxed text-emerald-950/85">
                  {translateUnsuitableReason(result.unsuitable_reason, lang)}
                </p>

                <div className="mt-6 pt-5 border-t border-emerald-950/10 flex flex-wrap items-center justify-between gap-4">
                  <p className="text-xs sm:text-sm text-emerald-950/70">
                    {t.supportedRegionsNote}
                  </p>
                  <button
                    onClick={onBack}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-emerald-900 text-white text-sm font-semibold shadow-md hover:bg-emerald-800 transition cursor-pointer"
                  >
                    {t.tryAnotherLocation}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}