import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { ChevronsLeftRight, Maximize2, Minimize2, Minus, Plus, Scan, WifiOff } from "lucide-react";
import { fmtShort } from "../../lib/format";
import type { AnalysisResults, LayerState, Selection } from "../../types";
import { cn } from "../../utils/cn";
import { Segmented } from "../ui";
import { FeatureLayers, type MapOverlay, type Phase } from "./FeatureLayers";

export type BasemapId = "satellite" | "light" | "terrain";
export type ViewMode = "swipe" | "before" | "after";
export interface ViewState {
  mode: ViewMode;
  split: number;
}
export interface FocusRequest {
  lat: number;
  lng: number;
  zoom: number;
  nonce: number;
}
export interface Pin {
  lat: number;
  lon: number;
  label: string;
}
export type ViewMemo = MutableRefObject<{ lat: number; lng: number; zoom: number } | null>;

export const BASEMAPS: Record<BasemapId, { label: string; url: string; attribution: string; subdomains?: string; maxNativeZoom: number }> = {
  satellite: {
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics — reference basemap, not event-date imagery",
    maxNativeZoom: 17,
  },
  light: {
    label: "Map",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "© OpenStreetMap contributors © CARTO",
    subdomains: "abcd",
    maxNativeZoom: 18,
  },
  terrain: {
    label: "Terrain",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors, SRTM · style © OpenTopoMap (CC-BY-SA)",
    subdomains: "abc",
    maxNativeZoom: 17,
  },
};

export const AOI_BOUNDS: L.LatLngBoundsExpression = [
  [27.872, 85.062],
  [27.992, 85.202],
];

const pinIcon = L.divIcon({
  className: "fl-marker",
  html: `<div style="position:relative;width:26px;height:26px"><div style="position:absolute;inset:0;border:2px solid #2563EB;border-radius:50%;background:rgba(37,99,235,.15)"></div><div style="position:absolute;left:12px;top:-4px;width:2px;height:34px;background:#2563EB"></div><div style="position:absolute;top:12px;left:-4px;height:2px;width:34px;background:#2563EB"></div></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

interface Props {
  results: AnalysisResults | null;
  layers: LayerState;
  opacity: number;
  affectedOnly: boolean;
  view: ViewState;
  onSplit: (n: number) => void;
  basemap: BasemapId;
  onBasemap: (b: BasemapId) => void;
  selected: Selection | null;
  onSelect: (s: Selection | null) => void;
  focus: FocusRequest | null;
  fitNonce: number;
  /** Before/after comparison (two linked maps). When false a single post-event map is rendered. */
  compare: boolean;
  pin: Pin | null;
  isFullscreen: boolean;
  onFullscreen: () => void;
  viewMemo: ViewMemo;
  overlay: MapOverlay;
  /** When set, a map click picks a point instead of clearing the selection. */
  onPickPoint?: (lat: number, lng: number) => void;
}

function Register({ which, onReady, initial, memo }: { which: Phase; onReady: (w: Phase, m: L.Map) => void; initial: FocusRequest | null; memo: ViewMemo }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    onReady(which, map);
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      const el = map.getContainer();
      if (!fitted.current && el.clientWidth > 0 && el.clientHeight > 0) {
        fitted.current = true;
        if (memo.current) map.setView([memo.current.lat, memo.current.lng], memo.current.zoom, { animate: false });
        else if (initial) map.setView([initial.lat, initial.lng], initial.zoom, { animate: false });
        else map.fitBounds(AOI_BOUNDS, { padding: [24, 24], animate: false });
      }
    });
    ro.observe(map.getContainer());
    const save = () => {
      if (which === "after" && fitted.current) {
        const c = map.getCenter();
        memo.current = { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
      }
    };
    map.on("moveend", save);
    return () => {
      ro.disconnect();
      map.off("moveend", save);
    };
  }, [map, which, onReady, initial, memo]);
  return null;
}

function BackgroundClick({ onClear, onPoint }: { onClear: () => void; onPoint?: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => (onPoint ? onPoint(e.latlng.lat, e.latlng.lng) : onClear()) });
  return null;
}

interface PaneProps {
  which: Phase;
  results: AnalysisResults | null;
  layers: LayerState;
  opacity: number;
  affectedOnly: boolean;
  basemap: BasemapId;
  selected: Selection | null;
  onSelect: (s: Selection | null) => void;
  onReady: (w: Phase, m: L.Map) => void;
  onTile: (ok: boolean) => void;
  pin: Pin | null;
  initial: FocusRequest | null;
  memo: ViewMemo;
  overlay: MapOverlay;
  onPickPoint?: (lat: number, lng: number) => void;
}

function MapPane({ which, results, layers, opacity, affectedOnly, basemap, selected, onSelect, onReady, onTile, pin, initial, memo, overlay, onPickPoint }: PaneProps) {
  const bm = BASEMAPS[basemap];
  const select = useCallback((s: Selection) => onSelect(s), [onSelect]);
  return (
    <MapContainer
      bounds={AOI_BOUNDS}
      boundsOptions={{ padding: [24, 24] }}
      zoomControl={false}
      attributionControl={false}
      zoomSnap={0.25}
      zoomDelta={0.5}
      wheelPxPerZoomLevel={100}
      zoomAnimation={false}
      markerZoomAnimation={false}
      fadeAnimation={false}
      minZoom={9}
      maxZoom={19}
      className="absolute inset-0 h-full w-full"
    >
      <TileLayer
        key={basemap}
        url={bm.url}
        subdomains={bm.subdomains ?? "abc"}
        maxNativeZoom={bm.maxNativeZoom}
        maxZoom={19}
        eventHandlers={which === "after" ? { tileerror: () => onTile(false), tileload: () => onTile(true) } : undefined}
      />
      <Register which={which} onReady={onReady} initial={initial} memo={memo} />
      <BackgroundClick onClear={() => onSelect(null)} onPoint={onPickPoint} />
      {results && <FeatureLayers results={results} phase={which} layers={layers} opacity={opacity} affectedOnly={affectedOnly} selected={selected} onSelect={select} overlay={overlay} onPick={onPickPoint} />}
      {pin && (
        <Marker position={[pin.lat, pin.lon]} icon={pinIcon} interactive={false} zIndexOffset={900}>
          <Tooltip permanent direction="bottom" offset={[0, 14]} className="fl-label">
            {pin.label}
          </Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}

export function DualMap({ results, layers, opacity, affectedOnly, view, onSplit, basemap, onBasemap, selected, onSelect, focus, fitNonce, compare, pin, isFullscreen, onFullscreen, viewMemo, overlay, onPickPoint }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapsRef = useRef<{ before?: L.Map; after?: L.Map }>({});
  const initialFocus = useRef(focus);
  const [ready, setReady] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [tiles, setTiles] = useState({ ok: 0, err: 0 });

  const onReady = useCallback((w: Phase, m: L.Map) => {
    mapsRef.current[w] = m;
    setReady((r) => r + 1);
  }, []);

  // Keep both maps in lock-step (compare mode only).
  useEffect(() => {
    const { before, after } = mapsRef.current;
    if (!compare || !before || !after) return;
    let lock = false;
    const link = (src: L.Map, dst: L.Map) => () => {
      if (lock) return;
      lock = true;
      dst.setView(src.getCenter(), src.getZoom(), { animate: false });
      lock = false;
    };
    const a2b = link(after, before);
    const b2a = link(before, after);
    after.on("move", a2b);
    before.on("move", b2a);
    a2b();
    return () => {
      after.off("move", a2b);
      before.off("move", b2a);
    };
  }, [ready, compare]);

  useEffect(() => {
    if (!focus || focus === initialFocus.current) return;
    mapsRef.current.after?.flyTo([focus.lat, focus.lng], focus.zoom, { duration: 0.9 });
  }, [focus]);

  useEffect(() => {
    if (fitNonce === 0) return;
    mapsRef.current.after?.fitBounds(AOI_BOUNDS, { padding: [24, 24] });
  }, [fitNonce]);

  useEffect(() => {
    setTiles({ ok: 0, err: 0 });
  }, [basemap]);

  const onTile = useCallback((ok: boolean) => {
    setTiles((t) => (ok ? { ...t, ok: t.ok + 1 } : { ...t, err: t.err + 1 }));
  }, []);

  const eff = !compare ? 0 : view.mode === "before" ? 100 : view.mode === "after" ? 0 : view.split;

  const moveTo = (clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    onSplit(Math.max(3, Math.min(97, ((clientX - r.left) / r.width) * 100)));
  };

  const acq = results?.acquisitions;
  const hasS1 = results ? results.effectiveSensor !== "S2" : false;
  const hasS2 = results ? results.effectiveSensor !== "S1" : false;
  const beforeLabel = [hasS2 && acq?.s2Pre ? `S2 ${fmtShort(acq.s2Pre.date)}` : null, hasS1 && acq?.s1Pre ? `S1 ${fmtShort(acq.s1Pre.date)}` : null].filter(Boolean).join(" · ");
  const afterLabel = [hasS2 && acq?.s2Post ? `S2 ${fmtShort(acq.s2Post.date)}` : null, hasS1 && acq?.s1Post ? `S1 ${fmtShort(acq.s1Post.date)}` : null].filter(Boolean).join(" · ");

  const zoom = (d: number) => mapsRef.current.after?.setZoom((mapsRef.current.after?.getZoom() ?? 12) + d);
  const tilesDown = tiles.err > 6 && tiles.ok === 0;

  const common = { results, layers, opacity, affectedOnly, basemap, selected, onSelect, onReady, onTile, pin, initial: initialFocus.current, memo: viewMemo, overlay, onPickPoint };
  const ctrl = "flex size-7 items-center justify-center text-slate-300 transition hover:bg-slate-500/10 hover:text-slate-100";

  return (
    <div ref={wrapRef} className={cn("relative h-full w-full overflow-hidden bg-ink-700", onPickPoint && "[&_.leaflet-container]:cursor-crosshair")}>
      {compare && <MapPane which="before" {...common} />}
      <div className="absolute inset-0" style={compare ? { clipPath: `inset(0 0 0 ${eff}%)`, transition: dragging ? "none" : "clip-path 0.3s ease" } : undefined}>
        <MapPane which="after" {...common} />
      </div>

      {compare && view.mode === "swipe" && (
        <div
          role="slider"
          tabIndex={0}
          aria-label="Before / after comparison"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(view.split)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") onSplit(Math.max(3, view.split - 3));
            if (e.key === "ArrowRight") onSplit(Math.min(97, view.split + 3));
          }}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setDragging(true);
            moveTo(e.clientX);
          }}
          onPointerMove={(e) => dragging && moveTo(e.clientX)}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          className="swipe-handle group absolute inset-y-0 z-[1000] w-6 -translate-x-1/2 outline-none"
          style={{ left: `${view.split}%` }}
        >
          <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-[#ffffff] shadow-[0_0_0_1px_rgba(15,23,42,0.45)]" />
          <div className="absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-[#ffffff] text-slate-100 shadow-md transition group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-water">
            <ChevronsLeftRight className="size-4" />
          </div>
        </div>
      )}

      {compare && results && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[900] hidden -translate-x-1/2 items-center overflow-hidden rounded-md border border-line bg-white/95 text-[11px] shadow-md md:flex">
          <div className={cn("flex items-center gap-1.5 px-2.5 py-1 transition", view.mode === "after" ? "opacity-30" : "")}>
            <span className="font-bold tracking-wider text-slate-200">BEFORE</span>
            <span className="font-mono text-slate-500">{beforeLabel || "—"}</span>
          </div>
          <div className="h-5 w-px bg-line" />
          <div className={cn("flex items-center gap-1.5 px-2.5 py-1 transition", view.mode === "before" ? "opacity-30" : "")}>
            <span className="font-bold tracking-wider text-water">AFTER</span>
            <span className="font-mono text-slate-500">{afterLabel || "—"}</span>
          </div>
        </div>
      )}

      <div className="absolute right-3 top-3 z-[900] flex flex-col items-end gap-2">
        <Segmented size="sm" value={basemap} onChange={onBasemap} className="shadow-md" options={(Object.keys(BASEMAPS) as BasemapId[]).map((k) => ({ value: k, label: BASEMAPS[k].label }))} />
        <div className="flex flex-col overflow-hidden rounded-md border border-line bg-white shadow-md">
          <button onClick={() => zoom(1)} title="Zoom in" aria-label="Zoom in" className={ctrl}>
            <Plus className="size-3.5" />
          </button>
          <button onClick={() => zoom(-1)} title="Zoom out" aria-label="Zoom out" className={cn(ctrl, "border-t border-line")}>
            <Minus className="size-3.5" />
          </button>
          <button onClick={() => mapsRef.current.after?.fitBounds(AOI_BOUNDS, { padding: [24, 24] })} title="Fit to analysis area" aria-label="Fit to analysis area" className={cn(ctrl, "border-t border-line")}>
            <Scan className="size-3.5" />
          </button>
          <button onClick={onFullscreen} title={isFullscreen ? "Exit full screen" : "Full screen"} aria-label={isFullscreen ? "Exit full screen" : "Full screen"} className={cn(ctrl, "border-t border-line")}>
            {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
        </div>
      </div>

      {tilesDown && (
        <div className="absolute bottom-14 left-1/2 z-[900] flex -translate-x-1/2 animate-fade-in items-center gap-2 rounded-md border border-warn/40 bg-white px-3 py-1.5 text-[11.5px] text-warn shadow-md">
          <WifiOff className="size-3.5" /> Basemap tiles unavailable (offline?) — analysis overlays are still shown.
        </div>
      )}

      <div className="pointer-events-none absolute bottom-0 right-0 z-[900] max-w-[70%] truncate bg-white/80 px-2 py-0.5 text-[9.5px] text-slate-400">{BASEMAPS[basemap].attribution} · Leaflet</div>
    </div>
  );
}
