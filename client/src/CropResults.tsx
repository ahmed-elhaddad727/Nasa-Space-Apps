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

const BG_IMAGE = '/bg-image.jpg';

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

  const glassBtn =
    'bg-white/[0.12] backdrop-blur-xl text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_8px_24px_rgba(0,0,0,0.3)] hover:bg-white/20 active:scale-[0.99] transition cursor-pointer';

  const glassCard =
    'bg-white/[0.08] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_16px_40px_rgba(0,0,0,0.45)]';

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="relative isolate min-h-screen flex flex-col justify-between overflow-hidden bg-[#08150e] text-white font-['Bricolage_Grotesque',ui-sans-serif,system-ui,sans-serif]"
    >
      {/* Full-bleed background + deep editorial gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-20"
      >
        <div
          style={{ backgroundImage: `url('${BG_IMAGE}')` }}
          className="absolute inset-0 bg-cover bg-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#05100a]/92 via-[#07180f]/78 to-[#06140c]/65" />
      </div>

      {/* Full-Width Top Bar */}
      <nav className="relative z-10 w-full px-6 sm:px-10 lg:px-14 pt-6 flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => {
            stopSpeaking();
            onBack();
          }}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold ${glassBtn}`}
        >
          {t.pickAnotherSpot}
        </button>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Listen / Stop TTS Button */}
          <button
            type="button"
            onClick={handleToggleSpeech}
            aria-pressed={isSpeaking}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition cursor-pointer ${
              isSpeaking
                ? 'bg-[#0b5d3b] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_8px_24px_rgba(0,0,0,0.35)]'
                : glassBtn
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
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold ${glassBtn}`}
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
      </nav>

      {/* Main Content */}
      <main className="relative z-10 w-full px-6 sm:px-10 lg:px-14 pt-8 pb-24 flex-1">
        {/* Editorial Headline */}
        <header className="mb-8 max-w-4xl">
          <p className="text-xs font-bold uppercase tracking-widest text-[#6AB04C] mb-2.5">
            {t.nasaHeader}
          </p>
          <h1
            className={`text-4xl sm:text-5xl lg:text-6xl font-black uppercase tracking-tighter leading-[0.96] text-white drop-shadow-md ${
              isRtl ? '' : 'italic'
            }`}
          >
            {isSuitable ? t.suitableHeadline : t.unsuitableHeadline}
          </h1>
          <div className="mt-4 h-1.5 w-16 rounded-full bg-[#6AB04C]" />
        </header>

        {/* NASA Telemetry Strip (Borderless Glass) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-8">
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
            <div key={i} className={`rounded-2xl p-4 sm:p-5 ${glassCard}`}>
              <span className="block text-xs font-medium text-white/70">
                {stat.label}
              </span>
              <span
                dir="ltr"
                className="mt-1 inline-block text-xl sm:text-2xl font-extrabold tabular-nums text-white"
              >
                {stat.val}
              </span>
            </div>
          ))}
        </div>

        {/* 3 Distinct Crop Cards vs. Unsuitable Card */}
        {isSuitable ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {result.recommendations.slice(0, 3).map((item, idx) => (
              <article
                key={idx}
                className={`flex flex-col justify-between rounded-3xl overflow-hidden ${glassCard}`}
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
                      className="w-full h-40 object-cover"
                    />
                  )}
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-2xl font-extrabold capitalize tracking-tight text-white">
                        {translateCrop(item.crop, lang)}
                      </h2>
                      <span className="px-3 py-0.5 rounded-full bg-[#0b5d3b] text-xs font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
                        #{idx + 1}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-white/70">
                      {t.seasonLabel}: {translateSeason(item.season, lang)}
                    </p>

                    {/* Suitability bar */}
                    <div className="mt-5">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-white/75">{t.matchLabel}</span>
                        <span className="font-bold tabular-nums text-[#6AB04C]">
                          {item.suitability_score}%
                        </span>
                      </div>
                      <div
                        role="progressbar"
                        aria-valuenow={item.suitability_score}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="mt-2 h-2 rounded-full bg-white/15 overflow-hidden"
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

                    <p className="mt-5 text-sm leading-relaxed text-white/80">
                      {translateNotes(item.notes, lang)}
                    </p>
                  </div>
                </div>

                <div className="px-6 pb-6 pt-4 border-t border-white/10 text-sm">
                  <span className="text-white/65">{t.plantNextLabel}</span>{' '}
                  <strong className="font-bold capitalize text-white">
                    {translateRotationChain(item.rotation_next, lang)}
                  </strong>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={`rounded-3xl p-6 sm:p-8 max-w-3xl ${glassCard}`}>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-11 h-11 rounded-2xl bg-red-500/20 text-red-300 flex items-center justify-center font-bold text-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
                !
              </div>
              <div className="flex-1">
                <h2 className="text-xl sm:text-2xl font-bold text-white">
                  {t.whyUnsuitableTitle}
                </h2>
                <p className="mt-3 text-base leading-relaxed text-white/85">
                  {translateUnsuitableReason(result.unsuitable_reason, lang)}
                </p>

                <div className="mt-6 pt-5 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
                  <p className="text-xs sm:text-sm text-white/70">
                    {t.supportedRegionsNote}
                  </p>
                  <button
                    onClick={() => {
                      stopSpeaking();
                      onBack();
                    }}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#0b5d3b] text-white text-sm font-bold shadow-lg hover:bg-[#0e7047] transition cursor-pointer"
                  >
                    {t.tryAnotherLocation}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Layered Green Wave Footer + Sprout */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed bottom-0 inset-x-0 z-0 h-16 overflow-hidden"
      >
        <svg
          viewBox="0 0 1440 120"
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          <path
            d="M0,55 C360,110 920,15 1440,35 L1440,120 L0,120 Z"
            fill="#6AB04C"
          />
          <path
            d="M0,72 C420,120 960,30 1440,50 L1440,120 L0,120 Z"
            fill="#0b3d26"
          />
        </svg>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#6AB04C"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute bottom-2 right-5 w-5 h-5 opacity-90"
        >
          <path d="M7 20h10" />
          <path d="M10 20c5.5-2.5.8-6.4 3-10" />
          <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
          <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
        </svg>
      </div>
    </div>
  );
}