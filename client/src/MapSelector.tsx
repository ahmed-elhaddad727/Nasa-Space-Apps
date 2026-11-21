import React, { useState, useRef, useEffect } from 'react';
import {
  sendAgroDataToBackend,
  NasaAgroPayload,
  BackendResponse,
} from './services/cropApi';
import { Lang, UI_TEXT } from './i18n';

const BG_IMAGE = '/IMG-20261120-WA0139.jpg';

const MIN_ZOOM = 1;
const MAX_ZOOM = 12;

interface MapSelectorProps {
  onComplete: (
    result: BackendResponse,
    payload: NasaAgroPayload,
    autoSpeak?: boolean
  ) => void;
  lang: Lang;
  onToggleLang: () => void;
}

export default function MapSelector({
  onComplete,
  lang,
  onToggleLang,
}: MapSelectorProps) {
  const [coords, setCoords] = useState<{ lat: number; lon: number }>({
    lat: 30.47,
    lon: 31.04,
  });
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>('');

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingPointerRef = useRef<boolean>(false);
  const isPanningMapRef = useRef<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.25 : 0.8;
      setZoom((z) =>
        Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number((z * factor).toFixed(2))))
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    if (zoom === MIN_ZOOM) setPan({ x: 0, y: 0 });
  }, [zoom]);

  const updatePointerFromMouse = (clientX: number, clientY: number) => {
    if (!mapContainerRef.current) return;
    const rect = mapContainerRef.current.getBoundingClientRect();

    const relX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const relY = Math.max(0, Math.min(rect.height, clientY - rect.top));

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const mapX = (relX - centerX - pan.x) / zoom + centerX;
    const mapY = (relY - centerY - pan.y) / zoom + centerY;

    const normX = Math.max(0, Math.min(1, mapX / rect.width));
    const normY = Math.max(0, Math.min(1, mapY / rect.height));

    const lon = Number((normX * 360 - 180).toFixed(4));
    const lat = Number((90 - normY * 180).toFixed(4));
    setCoords({ lat, lon });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 0) {
      isDraggingPointerRef.current = true;
      updatePointerFromMouse(e.clientX, e.clientY);
    } else if (e.button === 2) {
      isPanningMapRef.current = true;
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDraggingPointerRef.current) {
      updatePointerFromMouse(e.clientX, e.clientY);
    } else if (isPanningMapRef.current) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    isDraggingPointerRef.current = false;
    isPanningMapRef.current = false;
  };

  const analyzeCoords = async (
    targetCoords: { lat: number; lon: number },
    autoSpeak = false
  ) => {
    setIsLoading(true);
    setError(null);
    setLiveAnnouncement(t.readingLand);
    try {
      const now = new Date();
      const targetDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      const yyyymmdd = targetDate.toISOString().slice(0, 10).replace(/-/g, '');

      const nasaUrl = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,PRECTOTCORR,RH2M,ALLSKY_SFC_SW_DWN,GWETTOP&community=AG&longitude=${targetCoords.lon}&latitude=${targetCoords.lat}&start=${yyyymmdd}&end=${yyyymmdd}&format=JSON`;

      const nasaRes = await fetch(nasaUrl);
      const nasaJson = await nasaRes.json();
      const params = nasaJson?.properties?.parameter || {};

      const cleanVal = (val: number | undefined) =>
        val === undefined || val === -999 ? null : val;

      const payload: NasaAgroPayload = {
        timestamp: now.toISOString(),
        date: targetDate.toISOString().slice(0, 10),
        coordinates: {
          latitude: targetCoords.lat,
          longitude: targetCoords.lon,
        },
        agroclimatology: {
          T2M: cleanVal(params.T2M?.[yyyymmdd]),
          PRECTOTCORR: cleanVal(params.PRECTOTCORR?.[yyyymmdd]),
          RH2M: cleanVal(params.RH2M?.[yyyymmdd]),
          ALLSKY_SFC_SW_DWN: cleanVal(params.ALLSKY_SFC_SW_DWN?.[yyyymmdd]),
          GWETTOP: cleanVal(params.GWETTOP?.[yyyymmdd]),
        },
      };

      const result = await sendAgroDataToBackend(payload);
      onComplete(result, payload, autoSpeak);
    } catch (err) {
      console.error('Error fetching agro data:', err);
      setError(t.fetchError);
      setLiveAnnouncement(t.fetchError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = () => {
    analyzeCoords(coords, false);
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError(t.geoNotSupported);
      setLiveAnnouncement(t.geoNotSupported);
      return;
    }

    setIsLocating(true);
    setError(null);
    setLiveAnnouncement(t.locating);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(4));
        const lon = Number(position.coords.longitude.toFixed(4));
        const newCoords = { lat, lon };

        setCoords(newCoords);
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setIsLocating(false);
        setLiveAnnouncement(t.locationFound);

        analyzeCoords(newCoords, true);
      },
      (geoErr) => {
        setIsLocating(false);
        const msg =
          geoErr.code === geoErr.PERMISSION_DENIED
            ? t.geoDenied
            : t.geoUnavailable;
        setError(msg);
        setLiveAnnouncement(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const pointerLeftPct = ((coords.lon + 180) / 360) * 100;
  const pointerTopPct = ((90 - coords.lat) / 180) * 100;

  const gibsBaseUrl =
    'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=BlueMarble_NextGeneration&STYLES=&FORMAT=image/jpeg&CRS=EPSG:4326&WIDTH=2048&HEIGHT=1024&BBOX=-90,-180,90,180';

  const latLabel = `${Math.abs(coords.lat).toFixed(2)}°${
    coords.lat >= 0 ? 'N' : 'S'
  }`;
  const lonLabel = `${Math.abs(coords.lon).toFixed(2)}°${
    coords.lon >= 0 ? 'E' : 'W'
  }`;

  const glassBtn =
    'bg-white/[0.12] backdrop-blur-xl text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_8px_24px_rgba(0,0,0,0.3)] hover:bg-white/20 active:scale-[0.99] transition cursor-pointer';

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="relative isolate min-h-screen flex flex-col justify-between overflow-hidden bg-[#08150e] text-white font-['Bricolage_Grotesque',ui-sans-serif,system-ui,sans-serif] select-none"
    >
      {/* Screen-reader live region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      {/* Full-bleed background image + deep editorial gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-20"
      >
        <div
          style={{ backgroundImage: `url('${BG_IMAGE}')` }}
          className="absolute inset-0 bg-cover bg-center"
        />
        <div className="absolute inset-0 bg-linear-to-r from-[#05100a]/92 via-[#07180f]/75 to-[#06140c]/60" />
      </div>

      {/* Minimal Top Bar */}
      <nav className="relative z-10 w-full px-6 sm:px-10 lg:px-14 pt-6 flex items-center justify-between gap-4">
        <button
          onClick={onToggleLang}
          aria-label="Switch language"
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold ${glassBtn}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
            <path d="M2 12h20" />
          </svg>
          <span>{t.langToggleLabel}</span>
        </button>
      </nav>

      {/* Main High-Impact Split Hero */}
      <main className="relative z-10 w-full px-6 sm:px-10 lg:px-14 pt-6 pb-24 flex-1 flex flex-col justify-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          {/* Left Column: Oversized Editorial Headline + Tight CTAs */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            <header className="mb-6">
              <h1
                className={`text-5xl sm:text-6xl xl:text-[4.35rem] font-black uppercase tracking-tighter leading-[0.94] text-white drop-shadow-md ${
                  isRtl ? '' : 'italic'
                }`}
              >
                {t.mapTitle}
              </h1>
              <div className="mt-4 mb-4 h-1.5 w-16 rounded-full bg-[#6AB04C]" />
              <p className="text-sm sm:text-base lg:text-lg leading-snug text-white/85 max-w-md font-medium">
                {t.mapSubtitle}
              </p>
            </header>

            <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row gap-3 max-w-lg">
              <button
                onClick={handleSelect}
                disabled={isLoading || isLocating}
                className="flex-1 inline-flex items-center justify-center gap-2.5 px-6 py-4 rounded-full bg-[#0b5d3b] text-white text-sm sm:text-base font-bold shadow-xl shadow-black/40 hover:bg-[#0e7047] active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-wait cursor-pointer"
              >
                {isLoading ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin motion-reduce:animate-none" />
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-5 h-5"
                    aria-hidden="true"
                  >
                    <path d="M7 20h10" />
                    <path d="M10 20c5.5-2.5.8-6.4 3-10" />
                    <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
                    <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
                  </svg>
                )}
                <span>{isLoading ? t.readingLand : t.getRecommendations}</span>
              </button>

              <button
                type="button"
                onClick={handleUseMyLocation}
                disabled={isLocating || isLoading}
                className={`inline-flex items-center justify-center gap-2 px-6 py-4 rounded-full text-sm sm:text-base font-semibold disabled:opacity-60 disabled:cursor-wait ${glassBtn}`}
              >
                {isLocating ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin motion-reduce:animate-none" />
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3" />
                    <path d="M12 19v3" />
                    <path d="M2 12h3" />
                    <path d="M19 12h3" />
                  </svg>
                )}
                <span>{isLocating ? t.locating : t.useMyLocation}</span>
              </button>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-3 max-w-lg rounded-xl bg-red-950/80 border border-red-400/40 px-4 py-2.5 text-sm font-medium text-red-100"
              >
                {error}
              </p>
            )}
          </div>

          {/* Right Column: Oversized Dominant Map Visual */}
          <div className="lg:col-span-7">
            <div
              dir="ltr"
              ref={mapContainerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="relative w-full aspect-16/10 lg:aspect-16/9.5 rounded-3xl overflow-hidden cursor-crosshair bg-[#040d18] border border-white/35 shadow-[0_25px_70px_-15px_rgba(0,0,0,0.85)]"
            >
              <div
                style={{
                  transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: 'none',
                }}
                className="relative w-full h-full"
              >
                <img
                  src={gibsBaseUrl}
                  alt="NASA Blue Marble"
                  draggable={false}
                  className="w-full h-full object-cover pointer-events-none"
                />

                {/* Glowing Pin */}
                <div
                  style={{
                    left: `${pointerLeftPct}%`,
                    top: `${pointerTopPct}%`,
                    transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                  }}
                  className="absolute w-7 h-7 pointer-events-none"
                >
                  <span className="absolute inset-0 rounded-full bg-amber-300/75 animate-ping motion-reduce:animate-none" />
                  <span className="absolute inset-1 rounded-full bg-amber-400 border-2 border-white shadow-lg" />
                </div>
              </div>

              {/* Floating Coordinates Pill */}
              <div
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute bottom-3.5 left-3.5 px-4 py-1.5 rounded-full bg-white text-[#0f291e] text-xs font-bold shadow-lg"
              >
                <span className="tabular-nums">
                  {latLabel}, {lonLabel}
                </span>
              </div>

              {/* Floating Zoom Toolbar */}
              <div
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute bottom-3.5 right-3.5 flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-[#0f291e] text-xs font-bold shadow-lg"
              >
                <button
                  aria-label="Zoom in"
                  onClick={() =>
                    setZoom((z) =>
                      Math.min(MAX_ZOOM, Number((z * 1.25).toFixed(2)))
                    )
                  }
                  className="w-6 h-6 rounded-full text-sm leading-none hover:bg-black/10 cursor-pointer"
                >
                  +
                </button>
                <span className="w-9 text-center tabular-nums">
                  {zoom.toFixed(1)}x
                </span>
                <button
                  aria-label="Zoom out"
                  onClick={() =>
                    setZoom((z) =>
                      Math.max(MIN_ZOOM, Number((z * 0.8).toFixed(2)))
                    )
                  }
                  className="w-6 h-6 rounded-full text-sm leading-none hover:bg-black/10 cursor-pointer"
                >
                  −
                </button>
                <button
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="ml-0.5 pl-2 pr-1.5 h-6 border-l border-black/15 hover:text-[#0b5d3b] cursor-pointer"
                >
                  {t.reset}
                </button>
              </div>
            </div>

            {/* Compact Helper Hint */}
            <div className="mt-3 flex items-center gap-2 text-xs text-white/75">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4 shrink-0 text-[#6AB04C]"
                aria-hidden="true"
              >
                <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
                <path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2" />
                <path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8" />
                <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
              </svg>
              <p>{t.mapHint}</p>
            </div>
          </div>
        </div>
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