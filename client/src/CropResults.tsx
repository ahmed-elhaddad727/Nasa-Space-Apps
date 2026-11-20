import React, { useState, useEffect } from 'react';
import { BackendResponse, NasaAgroPayload } from './services/cropApi';
import {
  Lang,
  UI_TEXT,
  translateCrop,
  translateRotationChain,
  translateSeason,
  translateNotes,
  translateUnsuitableReason,
  buildResultsSpeech,
} from './i18n';
import { speak, stopSpeaking } from './utils/speech';

const BG_IMAGE = '/IMG-20261120-WA0139.jpg';

interface CropResultsProps {
  result: BackendResponse;
  payload: NasaAgroPayload;
  autoSpeak?: boolean;
  onBack: () => void;
  lang: Lang;
  onToggleLang: () => void;
}

export default function CropResults({
  result,
  payload,
  autoSpeak = false,
  onBack,
  lang,
  onToggleLang,
}: CropResultsProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const { T2M, PRECTOTCORR, RH2M, GWETTOP } = payload.agroclimatology;

  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';

  useEffect(() => {
    stopSpeaking();
    setIsSpeaking(false);

    if (autoSpeak) {
      const script = buildResultsSpeech(result, lang);
      const started = speak(script, lang, () => setIsSpeaking(false));
      if (started) {
        setIsSpeaking(true);
      }
    }

    return () => stopSpeaking();
  }, [result, lang, autoSpeak]);

  const handleToggleSpeech = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }

    const script = buildResultsSpeech(result, lang);
    const started = speak(script, lang, () => setIsSpeaking(false));
    if (started) {
      setIsSpeaking(true);
    }
  };

  const isSuitable =
    result.status === 'suitable' && result.recommendations.length > 0;

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="relative isolate min-h-screen overflow-hidden bg-[#0b1f14] text-white font-['Bricolage_Grotesque',ui-sans-serif,system-ui,sans-serif] px-5 pt-7 pb-28"
    >
      {/* Full-bleed background + dark overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-20"
      >
        <div
          style={{ backgroundImage: `url('${BG_IMAGE}')` }}
          className="absolute inset-0 bg-cover bg-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b1f2e]/85 via-black/65 to-[#06140c]/95" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-4xl">
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <button
            onClick={() => {
              stopSpeaking();
              onBack();
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/15 backdrop-blur-md text-sm font-semibold text-white border border-white/40 hover:bg-white/25 transition cursor-pointer"
          >
            {t.pickAnotherSpot}
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {/* Listen / Stop TTS Button */}
            <button
              type="button"
              onClick={handleToggleSpeech}
              aria-pressed={isSpeaking}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold border transition cursor-pointer ${
                isSpeaking
                  ? 'bg-[#0b5d3b] text-white border-[#6AB04C]'
                  : 'bg-white/15 backdrop-blur-md text-white border-white/40 hover:bg-white/25'
              }`}
            >
              {isSpeaking ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-3.5 h-3.5"
                  aria-hidden="true"
                >
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-3.5 h-3.5"
                  aria-hidden="true"
                >
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              )}
              <span>{isSpeaking ? t.stopListening : t.listen}</span>
            </button>

            {/* Language Switcher */}
            <button
              onClick={onToggleLang}
              aria-label="Switch language"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/15 backdrop-blur-md text-xs sm:text-sm font-semibold text-white border border-white/40 hover:bg-white/25 transition cursor-pointer"
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

        {/* Headline */}
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#6AB04C] mb-2">
            {t.nasaHeader}
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-snug text-white">
            {isSuitable ? t.suitableHeadline : t.unsuitableHeadline}
          </h1>
          <div className="mt-3.5 h-1 w-12 rounded-full bg-[#6AB04C]" />
        </header>

        {/* NASA Telemetry Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            {
              label: t.tempLabel,
              val: T2M !== null ? `${T2M} °C` : 'N/A',
            },
            {
              label: t.soilWetnessLabel,
              val: GWETTOP !== null ? `${Math.round(GWETTOP * 100)}%` : 'N/A',
            },
            {
              label: t.humidityLabel,
              val: RH2M !== null ? `${RH2M}%` : 'N/A',
            },
            {
              label: t.precipLabel,
              val: PRECTOTCORR !== null ? `${PRECTOTCORR} mm` : 'N/A',
            },
          ].map((stat, i) => (
            <div
              key={i}
              className="rounded-2xl bg-black/45 backdrop-blur-md p-4 border border-white/20 shadow-lg"
            >
              <span className="block text-xs font-medium text-white/70">
                {stat.label}
              </span>
              <span
                dir="ltr"
                className="mt-1 inline-block text-lg font-bold tabular-nums text-white"
              >
                {stat.val}
              </span>
            </div>
          ))}
        </div>

        {/* 3 Distinct Crop Cards vs. Unsuitable Card */}
        {isSuitable ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {result.recommendations.slice(0, 3).map((item, idx) => (
              <article
                key={idx}
                className="flex flex-col justify-between rounded-2xl bg-black/50 backdrop-blur-md overflow-hidden border border-white/20 shadow-xl"
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
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-xl font-bold capitalize text-white">
                        {translateCrop(item.crop, lang)}
                      </h2>
                      <span className="px-2.5 py-0.5 rounded-full bg-[#0b5d3b] text-xs font-bold text-white border border-[#6AB04C]/50">
                        #{idx + 1}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-white/70">
                      {t.seasonLabel}: {translateSeason(item.season, lang)}
                    </p>

                    {/* Suitability bar */}
                    <div className="mt-4">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-white/75">{t.matchLabel}</span>
                        <span className="font-semibold tabular-nums text-[#6AB04C]">
                          {item.suitability_score}%
                        </span>
                      </div>
                      <div
                        role="progressbar"
                        aria-valuenow={item.suitability_score}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="mt-1.5 h-2 rounded-full bg-white/15 overflow-hidden"
                      >
                        <div
                          className="h-full rounded-full bg-[#6AB04C]"
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(100, item.suitability_score)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    <p className="mt-4 text-sm leading-relaxed text-white/80">
                      {translateNotes(item.notes, lang)}
                    </p>
                  </div>
                </div>

                <div className="px-5 pb-5 pt-4 border-t border-white/15 text-sm">
                  <span className="text-white/65">{t.plantNextLabel}</span>
                  <strong className="font-semibold capitalize text-white">
                    {translateRotationChain(item.rotation_next, lang)}
                  </strong>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl bg-black/55 backdrop-blur-md p-6 sm:p-8 border border-white/25 shadow-xl">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-11 h-11 rounded-2xl bg-red-500/20 text-red-300 border border-red-400/30 flex items-center justify-center font-bold text-xl">
                !
              </div>
              <div className="flex-1">
                <h2 className="text-xl sm:text-2xl font-bold text-white">
                  {t.whyUnsuitableTitle}
                </h2>
                <p className="mt-3 text-base leading-relaxed text-white/85">
                  {translateUnsuitableReason(result.unsuitable_reason, lang)}
                </p>

                <div className="mt-6 pt-5 border-t border-white/15 flex flex-wrap items-center justify-between gap-4">
                  <p className="text-xs sm:text-sm text-white/70">
                    {t.supportedRegionsNote}
                  </p>
                  <button
                    onClick={() => {
                      stopSpeaking();
                      onBack();
                    }}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#0b5d3b] text-white text-sm font-semibold shadow-md hover:bg-[#0e7047] transition cursor-pointer"
                  >
                    {t.tryAnotherLocation}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Layered Green Wave Footer */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed bottom-0 inset-x-0 z-0 h-20 overflow-hidden"
      >
        <svg
          viewBox="0 0 1440 120"
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          <path
            d="M0,45 C360,115 880,5 1440,55 L1440,120 L0,120 Z"
            fill="#6AB04C"
          />
          <path
            d="M0,65 C420,125 940,15 1440,70 L1440,120 L0,120 Z"
            fill="#0b3d26"
          />
        </svg>
      </div>
    </div>
  );
}