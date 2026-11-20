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

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="relative isolate min-h-screen flex flex-col justify-between overflow-hidden bg-[#0b1f14] text-white font-['Bricolage_Grotesque',ui-sans-serif,system-ui,sans-serif] select-none"
    >
      {/* Screen-reader live region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      {/* Full-bleed background image + readability gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-20"
      >
        <div
          style={{ backgroundImage: `url('${BG_IMAGE}')` }}
          className="absolute inset-0 bg-cover bg-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b1f2e]/75 via-black/45 to-[#06140c]/90" />
      </div>

      {/* Main Content Column */}
      <main className="relative z-10 mx-auto w-full max-w-lg sm:max-w-xl px-5 pt-7 pb-28">
        {/* Top Bar: NASA Space Apps + Language Pill */}
        <div className="flex items-center justify-between gap-4 mb-10">
          <div className="flex items-center gap-3">
            {/* Inline NASA Meatball Badge */}
            <svg
              viewBox="0 0 110 92"
              className="w-11 h-9 flex-shrink-0 drop-shadow"
              aria-label="NASA"
            >
              <circle cx="52" cy="46" r="38" fill="#0B3D91" />
              <path
                d="M15 62 C 35 45, 72 22, 99 17 C 80 34, 48 56, 26 70 Z"
                fill="#FC3D21"
              />
              <text
                x="52"
                y="54"
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize="21"
                fontWeight="800"
                fontFamily="system-ui, sans-serif"
                letterSpacing="1"
              >
                NASA
              </text>
            </svg>
            <div className="h-8 w-px bg-white/40" />
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-wide text-white">
                NASA
              </div>
              <div className="text-xs font-medium text-white/80">
                Space Apps
              </div>
            </div>
          </div>

          <button
            onClick={onToggleLang}
            aria-label="Switch language"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 backdrop-blur-md text-xs sm:text-sm font-semibold text-white border border-white/45 shadow-sm hover:bg-white/25 transition cursor-pointer"
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
        </div>

        {/* Hero Headline */}
        <header className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] text-white drop-shadow-sm">
            {t.mapTitle}
          </h1>
          <div className="mt-4 mb-4 h-1 w-12 rounded-full bg-[#6AB04C]" />
          <p className="text-sm sm:text-base leading-relaxed text-white/90 max-w-md">
            {t.mapSubtitle}
          </p>
        </header>

        {/* Interactive Map Card */}
        <div
          dir="ltr"
          ref={mapContainerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="relative w-full aspect-[16/9] rounded-2xl overflow-hidden cursor-crosshair bg-[#040d18] border border-white/40 shadow-2xl shadow-black/50"
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
              className="absolute w-6 h-6 pointer-events-none"
            >
              <span className="absolute inset-0 rounded-full bg-amber-300/75 animate-ping motion-reduce:animate-none" />
              <span className="absolute inset-1 rounded-full bg-amber-400 border-2 border-white shadow-lg" />
            </div>
          </div>

          {/* Floating Coordinates Pill */}
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute bottom-2.5 left-2.5 px-3.5 py-1.5 rounded-full bg-white text-[#0f291e] text-xs font-semibold shadow-md"
          >
            <span className="tabular-nums">
              {latLabel}, {lonLabel}
            </span>
          </div>

          {/* Floating Zoom Toolbar */}
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute bottom-2.5 right-2.5 flex items-center gap-1 px-2 py-1 rounded-full bg-white text-[#0f291e] text-xs font-semibold shadow-md"
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
                setZoom((z) => Math.max(MIN_ZOOM, Number((z * 0.8).toFixed(2))))
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

        {/* Helper Hint with Hand Icon */}
        <div className="mt-3.5 flex items-start gap-2.5 text-xs sm:text-sm text-white/85">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5 flex-shrink-0 mt-0.5 text-white/90"
            aria-hidden="true"
          >
            <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
            <path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2" />
            <path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8" />
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
          </svg>
          <p className="leading-snug">{t.mapHint}</p>
        </div>

        {/* Stacked Full-Width Action Buttons */}
        <div className="mt-7 flex flex-col gap-3.5">
          <button
            onClick={handleSelect}
            disabled={isLoading || isLocating}
            className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-4 rounded-full bg-[#0b5d3b] text-white text-base font-semibold shadow-lg shadow-black/35 hover:bg-[#0e7047] active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-wait cursor-pointer"
          >
            {isLoading ? (
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
            className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-4 rounded-full bg-black/35 backdrop-blur-md text-white text-base font-semibold border border-white/45 shadow-md hover:bg-black/50 active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-wait cursor-pointer"
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
                className="w-5 h-5"
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

          {error && (
            <p
              role="alert"
              className="mt-1 rounded-xl bg-red-950/75 border border-red-400/40 px-4 py-2.5 text-sm font-medium text-red-100"
            >
              {error}
            </p>
          )}
        </div>
      </main>

      {/* Bottom Layered Green Wave Footer + Sprout */}
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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#6AB04C"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute bottom-3 right-5 w-7 h-7 opacity-80"
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