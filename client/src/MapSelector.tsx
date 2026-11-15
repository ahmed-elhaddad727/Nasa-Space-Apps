import React, { useState, useRef, useEffect } from 'react';
import {
  sendAgroDataToBackend,
  NasaAgroPayload,
  BackendResponse,
} from './services/cropApi';

export default function MapSelector() {
  const [coords, setCoords] = useState<{ lat: number; lon: number }>({ lat: 30.0444, lon: 31.2357 });
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showCoords, setShowCoords] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [backendResult, setBackendResult] = useState<BackendResponse | null>(null);
  const [lastPayload, setLastPayload] = useState<NasaAgroPayload | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingPointerRef = useRef<boolean>(false);
  const isPanningMapRef = useRef<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Prevent browser right-click context menu globally
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  const updatePointerFromMouse = (clientX: number, clientY: number) => {
    if (!mapContainerRef.current) return;
    const rect = mapContainerRef.current.getBoundingClientRect();

    // Clamp cursor inside map bounds
    const relX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const relY = Math.max(0, Math.min(rect.height, clientY - rect.top));

    // Invert pan & zoom transform to get exact normalized map coordinate (0 to 1)
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
      // Left-Click: Teleport pointer & start continuous dragging
      isDraggingPointerRef.current = true;
      updatePointerFromMouse(e.clientX, e.clientY);
    } else if (e.button === 2) {
      // Right-Click: Pan zoomed map
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

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.25 : 0.8;
    const nextZoom = Math.max(1, Math.min(12, Number((zoom * factor).toFixed(2))));
    if (nextZoom === 1) setPan({ x: 0, y: 0 });
    setZoom(nextZoom);
  };

  // Fetch NASA POWER data -> Send JSON to Python Backend -> Receive Crops
  const handleSelect = async () => {
    setIsLoading(true);
    try {
      const now = new Date();
      // NASA POWER has a ~3-day processing lag, so query a recent valid date window
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

      setLastPayload(payload);

      // Send JSON payload to Backend and wait for crop recommendations
      const result = await sendAgroDataToBackend(payload);
      setBackendResult(result);
    } catch (err) {
      console.error('Error fetching agro data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Convert lat/lon to percentage inside base map plane
  const pointerLeftPct = ((coords.lon + 180) / 360) * 100;
  const pointerTopPct = ((90 - coords.lat) / 180) * 100;

  const gibsBaseUrl =
    'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=BlueMarble_NextGeneration&STYLES=&FORMAT=image/jpeg&CRS=EPSG:4326&WIDTH=2048&HEIGHT=1024&BBOX=-90,-180,90,180';

  return (
    <div className="min-h-screen bg-white text-black flex flex-col items-center justify-center p-6 select-none">
      {/* 2:1 Map Plane */}
      <div
        ref={mapContainerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className="relative w-full max-w-4xl aspect-[2/1] border-2 border-black overflow-hidden cursor-crosshair bg-neutral-100"
      >
        {/* Hardware-Accelerated Viewport */}
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

          {/* Crosshair Pointer */}
          <div
            style={{
              left: `${pointerLeftPct}%`,
              top: `${pointerTopPct}%`,
              transform: `translate(-50%, -50%) scale(${1 / zoom})`,
            }}
            className="absolute w-5 h-5 rounded-full border-2 border-white bg-black/80 shadow-md pointer-events-none"
          />
        </div>

        {/* Bottom-Left Coords Toggle Pill */}
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute bottom-2.5 left-2.5 flex items-center gap-2 bg-white/95 border-2 border-black rounded-full px-3 py-1 text-xs font-medium shadow-sm"
        >
          <button
            onClick={() => setShowCoords(!showCoords)}
            className="cursor-pointer font-semibold"
          >
            {showCoords ? 'Hide Coords' : 'Show Coords'}
          </button>
          {showCoords && (
            <span className="font-mono text-[11px] pl-1 border-l border-black/30">
              {coords.lat.toFixed(4)}°, {coords.lon.toFixed(4)}°
            </span>
          )}
        </div>

        {/* Bottom-Right Zoom Pill */}
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 bg-white/95 border-2 border-black rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm"
        >
          <button
            onClick={() => setZoom((z) => Math.min(12, Number((z * 1.25).toFixed(2))))}
            className="px-1.5 cursor-pointer"
          >
            +
          </button>
          <span className="font-mono text-[11px]">{zoom.toFixed(1)}x</span>
          <button
            onClick={() => {
              const next = Math.max(1, Number((zoom * 0.8).toFixed(2)));
              if (next === 1) setPan({ x: 0, y: 0 });
              setZoom(next);
            }}
            className="px-1.5 cursor-pointer"
          >
            -
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="pl-1.5 border-l border-black/30 cursor-pointer"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Select Button */}
      <button
        onClick={handleSelect}
        disabled={isLoading}
        className="mt-5 px-10 py-2.5 border-2 border-black rounded-full text-sm font-semibold tracking-wide bg-white hover:bg-black hover:text-white transition-colors cursor-pointer disabled:opacity-50"
      >
        {isLoading ? 'analyzing...' : 'select'}
      </button>

      {/* Returned Crops Display */}
      {backendResult && (
        <div className="mt-6 w-full max-w-4xl border-2 border-black p-5 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b-2 border-black">
            <div>
              <h2 className="text-base font-bold uppercase tracking-wider">
                Recommended Crops & Rotation
              </h2>
              <p className="text-xs font-mono text-neutral-600">
                {backendResult.location_summary}
              </p>
            </div>
            <span className="text-[11px] font-mono px-2.5 py-0.5 border border-black rounded-full">
              {backendResult.status === 'live'
                ? '● Connected to Backend'
                : '○ Demo Fallback (Backend Offline)'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {backendResult.recommendations.map((item, idx) => (
              <div
                key={idx}
                className="border-2 border-black p-3.5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold capitalize text-sm">
                      {item.crop}
                    </span>
                    <span className="font-mono text-xs font-semibold border border-black px-2 py-0.5 rounded-full">
                      {item.suitability_score}% match
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600 font-mono mb-2">
                    Season: {item.season}
                  </p>
                  <p className="text-xs leading-relaxed mb-3">{item.notes}</p>
                </div>
                <div className="pt-2 border-t border-black/20 text-[11px] font-mono">
                  Next in rotation: <strong>{item.rotation_next}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}