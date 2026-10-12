import { useEffect, useRef, useState } from "react";
import { FileText, MousePointerClick, RefreshCw, TriangleAlert, X } from "lucide-react";
import { describeFull } from "../analysis/inspectPlus";
import { useApp } from "../state/store";
import type { FeatureKind } from "../types";
import { cn } from "../utils/cn";
import { DualMap } from "./map/DualMap";
import { Inspector, LayerPanel, Legend, MapStatusOverlay } from "./map/MapOverlays";
import { Timeline } from "./Timeline";
import { btnCls } from "./ui";

interface Props {
  /** full = before/after comparison + acquisition timeline. compact = single post-event map for list/detail pages. */
  variant: "full" | "compact";
  hideInspectorFor?: FeatureKind[];
}

/** The satellite map with its overlays. One component, shared by every page that shows the map. */
export function MapWorkspace({ variant, hideInspectorFor = [] }: Props) {
  const a = useApp();
  const full = variant === "full";
  const rootRef = useRef<HTMLDivElement>(null);
  const [nativeFs, setNativeFs] = useState(false);
  const [cssFs, setCssFs] = useState(false);
  const isFs = nativeFs || cssFs;

  useEffect(() => {
    const on = () => setNativeFs(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  useEffect(() => {
    if (!cssFs) return;
    const on = (e: KeyboardEvent) => e.key === "Escape" && setCssFs(false);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [cssFs]);

  const toggleFs = async () => {
    if (cssFs) return setCssFs(false);
    if (document.fullscreenElement) return void (await document.exitFullscreen());
    const el = rootRef.current;
    try {
      if (el?.requestFullscreen) await el.requestFullscreen();
      else setCssFs(true);
    } catch {
      setCssFs(true); // embedded frames may block the Fullscreen API — fall back to a CSS full-window mode
    }
  };

  const inImpact = a.route === "impact";
  const inSim = inImpact && a.tab === "simulator";
  const inDown = inImpact && a.tab === "downstream";
  const inAlt = inImpact && a.tab === "alternatives";
  const inspector = a.selected && a.results && !hideInspectorFor.includes(a.selected.kind) ? describeFull(a.selected, a.results, inSim ? a.sim : null) : null;
  const rec = inspector?.taskId ? a.tasks[inspector.taskId] : undefined;
  const verification = !inspector ? undefined : inspector.taskId ? { status: rec?.status ?? ("needs" as const), manual: !!rec, stale: !!rec && !!a.results && rec.analysisId !== a.results.id } : null;
  const mapErrors = a.runErrors.length ? a.runErrors : a.validation.items.filter((i) => i.severity === "error");
  const bannerError = a.results ? a.runErrors[0] : undefined;
  const wide = typeof window !== "undefined" && window.innerWidth >= 1280;

  const hint = inDown && !a.downstream.start ? "Click the map to choose an upstream starting point" : inSim && !a.simEdgeId ? "Click a road or bridge to select it for the simulator" : null;

  return (
    <div ref={rootRef} className={cn("flex h-full w-full flex-col bg-white", cssFs && "fixed inset-0 z-[1700]")}>
      <div className="relative min-h-0 flex-1">
        <DualMap
          results={a.results}
          layers={a.layers}
          opacity={a.opacity}
          affectedOnly={a.affectedOnly}
          view={a.view}
          onSplit={a.onSplit}
          basemap={a.basemap}
          onBasemap={a.setBasemap}
          selected={a.selected}
          onSelect={a.select}
          focus={a.focus}
          fitNonce={a.fitNonce}
          compare={full}
          pin={a.pin}
          isFullscreen={isFs}
          onFullscreen={toggleFs}
          viewMemo={a.mapViewRef}
          overlay={{ sim: inSim ? a.sim : null, downstream: inDown ? { result: a.downstream.result, start: a.downstream.start } : null, alt: inAlt ? a.alt : null }}
          onPickPoint={a.mapPick ? a.onMapPoint : undefined}
        />
        <LayerPanel layers={a.layers} setLayers={a.setLayers} opacity={a.opacity} setOpacity={a.setOpacity} affectedOnly={a.affectedOnly} setAffectedOnly={a.setAffectedOnly} results={a.results} defaultOpen={full && wide} />
        <Legend defaultOpen={full && wide} />

        {a.results && (
          <div className="pointer-events-none absolute bottom-6 left-1/2 z-[900] hidden -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-warn/40 bg-white px-3 py-1 text-[10.5px] font-medium text-warn shadow-sm xl:flex">
            <TriangleAlert className="size-3" /> DEMO DATA · not satellite-derived findings
          </div>
        )}
        <button
          onClick={() => a.generateReport("en")}
          disabled={!a.results}
          title="Generate a Rescue Brief from the current analysis"
          className={cn(btnCls.base, btnCls.primary, "absolute bottom-6 right-3 z-[900] shadow-md")}
        >
          <FileText className="size-3.5" />
          <span>
            <span className="hidden sm:inline">Generate </span>Rescue Brief
          </span>
        </button>
        {hint && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-[940] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-water/30 bg-white px-3 py-1 text-[11.5px] font-medium text-water shadow-md">
            <MousePointerClick className="size-3.5" /> {hint}
          </div>
        )}
        {a.pin && (
          <div className="absolute left-1/2 top-[46px] z-[940] flex -translate-x-1/2 items-center gap-2 rounded-md border border-line bg-white py-1 pl-3 pr-1 text-[11px] text-slate-300 shadow-md">
            Searched location: <span className="font-medium text-slate-100">{a.pin.label}</span>
            <button onClick={a.clearPin} aria-label="Clear searched location" className="rounded p-1 text-slate-500 hover:bg-slate-500/10 hover:text-slate-100">
              <X className="size-3" />
            </button>
          </div>
        )}
        {full && a.stale && !a.running && (
          <div className="absolute left-1/2 top-[80px] z-[950] flex -translate-x-1/2 animate-fade-in items-center gap-2 rounded-md border border-warn/40 bg-white py-1 pl-3 pr-1 text-[11.5px] text-warn shadow-md">
            Period or images changed — showing the previous analysis.
            <button onClick={a.run} className="inline-flex h-6 items-center gap-1 rounded bg-warn/15 px-2 font-medium text-warn transition hover:bg-warn/25">
              <RefreshCw className="size-3" /> Re-run
            </button>
          </div>
        )}
        {bannerError && (
          <div className="absolute left-1/2 top-[112px] z-[960] flex max-w-[460px] -translate-x-1/2 animate-fade-in items-start gap-2 rounded-md border border-crit/40 bg-white px-3 py-2 text-[11.5px] shadow-md">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-crit" />
            <span>
              <span className="block font-medium text-crit">{bannerError.title}</span>
              <span className="text-slate-400">{bannerError.detail}</span>
            </span>
            <button onClick={a.clearRunErrors} aria-label="Dismiss" className="text-slate-500 hover:text-slate-100">
              <X className="size-3.5" />
            </button>
          </div>
        )}
        {inspector && (
          <Inspector
            model={inspector}
            why={inspector.why}
            verification={verification}
            onVerify={inspector.taskId ? (s) => a.updateTask(inspector.taskId!, { status: s }) : undefined}
            onClose={() => a.select(null)}
            onZoom={() => a.flyTo(inspector.center[0], inspector.center[1], inspector.zoom)}
            onAsk={a.ask}
            onSimulate={(id) => {
              a.setSimEdge(id);
              a.go("impact", "simulator");
            }}
          />
        )}
        <MapStatusOverlay running={a.running} progress={a.progress} results={a.results} errors={mapErrors} onCancel={a.cancel} />
      </div>
      {full && <Timeline results={a.results} view={a.view} onMode={a.onMode} onSplit={a.onSplit} status={a.status} />}
    </div>
  );
}
