import React, { useState, useRef, useEffect } from 'react';
import {
  sendAgroDataToBackend,
  NasaAgroPayload,
  BackendResponse,
} from './services/cropApi';
import { Lang, UI_TEXT } from './i18n';

const GRASS_IMAGE = '/grass_photo.svg';

const MIN_ZOOM = 1;
const MAX_ZOOM = 12;

interface MapSelectorProps {
  onComplete: (result: BackendResponse, payload: NasaAgroPayload) => void;
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
  const [error, setError] = useState<string | null>(null);

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

  const handleSelect = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const now = new Date();
      const targetDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      const yyyymmdd = targetDate.toISOString().slice(0, 10).replace(/-/g, '');

      const nasaUrl = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,PRECTOTCORR,RH2M,ALLSKY_SFC_SW_DWN,GWETTOP&community=AG&longitude=${coords.lon}&latitude=${coords.lat}&start=${yyyymmdd}&end=${yyyymmdd}&format=JSON`;

      const nasaRes = await fetch(nasaUrl);
      const nasaJson = await nasaRes.json();
      const params = nasaJson?.properties?.parameter || {};

      const cleanVal = (val: number | undefined) =>
        val === undefined || val === -999 ? null : val;

      const payload: NasaAgroPayload = {
        timestamp: now.toISOString(),
        date: targetDate.toISOString().slice(0, 10),
        coordinates: {
          latitude: coords.lat,
          longitude: coords.lon,
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
      onComplete(result, payload);
    } catch (err) {
      console.error('Error fetching agro data:', err);
      setError(t.fetchError);
    } finally {
      setIsLoading(false);
    }
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

  const pill =
    'bg-white/90 backdrop-blur rounded-full shadow-md shadow-emerald-950/10 text-xs font-medium text-emerald-950';

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="relative isolate min-h-screen overflow-hidden bg-[#7DB85A] text-emerald-950 font-['Bricolage_Grotesque',ui-sans-serif,system-ui,sans-serif] px-5 py-10 sm:py-14 select-none"
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
        {/* Top-Right Language Switcher */}
        <div className="flex justify-end mb-4">
          <button
            onClick={onToggleLang}
            aria-label="Switch language"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/85 backdrop-blur text-xs sm:text-sm font-semibold text-emerald-950 ring-1 ring-white/60 shadow-sm hover:bg-emerald-900 hover:text-white transition cursor-pointer"
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

        {/* Header */}
        <header className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            {t.mapTitle}
          </h1>
          <p className="mt-3 text-base sm:text-lg text-emerald-950/80 max-w-xl">
            {t.mapSubtitle}
          </p>
        </header>

        {/* Map (keep LTR internally so X/Y coordinate math stays identical) */}
        <div
          dir="ltr"
          ref={mapContainerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="relative w-full aspect-[2/1] rounded-3xl overflow-hidden cursor-crosshair bg-emerald-950/10 ring-1 ring-emerald-950/15 shadow-xl shadow-emerald-950/15"
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

            {/* Pin */}
            <div
              style={{
                left: `${pointerLeftPct}%`,
                top: `${pointerTopPct}%`,
                transform: `translate(-50%, -50%) scale(${1 / zoom})`,
              }}
              className="absolute w-6 h-6 pointer-events-none"
            >
              <span className="absolute inset-0 rounded-full bg-amber-300/70 animate-ping motion-reduce:animate-none" />
              <span className="absolute inset-1 rounded-full bg-amber-400 border-2 border-white shadow-lg" />
            </div>
          </div>

          {/* Coordinates */}
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className={`absolute bottom-3 left-3 px-3.5 py-1.5 ${pill}`}
          >
            <span className="tabular-nums">
              {latLabel}, {lonLabel}
            </span>
          </div>

          {/* Zoom controls */}
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className={`absolute bottom-3 right-3 flex items-center gap-1 px-1.5 py-1 ${pill}`}
          >
            <button
              aria-label="Zoom in"
              onClick={() =>
                setZoom((z) =>
                  Math.min(MAX_ZOOM, Number((z * 1.25).toFixed(2)))
                )
              }
              className="w-7 h-7 rounded-full text-base leading-none hover:bg-emerald-950/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 cursor-pointer"
            >
              +
            </button>
            <span className="w-10 text-center tabular-nums">
              {zoom.toFixed(1)}x
            </span>
            <button
              aria-label="Zoom out"
              onClick={() =>
                setZoom((z) => Math.max(MIN_ZOOM, Number((z * 0.8).toFixed(2))))
              }
              className="w-7 h-7 rounded-full text-base leading-none hover:bg-emerald-950/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 cursor-pointer"
            >
              −
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="ml-1 px-2.5 h-7 rounded-full border-l border-emerald-950/15 hover:bg-emerald-950/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 cursor-pointer"
            >
              {t.reset}
            </button>
          </div>
        </div>

        <p className="mt-3 text-sm text-emerald-950/75">{t.mapHint}</p>

        {/* Action */}
        <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            onClick={handleSelect}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-full bg-emerald-900 text-white text-base font-semibold shadow-lg shadow-emerald-950/25 hover:bg-emerald-800 active:scale-[0.98] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-60 disabled:cursor-wait cursor-pointer"
          >
            {isLoading && (
              <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin motion-reduce:animate-none" />
            )}
            {isLoading ? t.readingLand : t.getRecommendations}
          </button>
          {error && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}