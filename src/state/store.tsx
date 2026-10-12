import { createContext, useCallback, useContext, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { validateParams, type ValidationOutcome } from "../analysis/acquisitions";
import { estimateDownstream, type DownstreamResult } from "../analysis/downstream";
import { runDemoAnalysis } from "../analysis/engine";
import { describeFeature } from "../analysis/inspect";
import { demoService, type Progress } from "../analysis/service";
import { simulateLoss, type SimBase, type SimResult } from "../analysis/simulate";
import type { EvalResult, Reference } from "../analysis/validation";
import type { BasemapId, FocusRequest, Pin, ViewMode, ViewState } from "../components/map/DualMap";
import { SCENARIO } from "../data/scenario";
import type { AltResult } from "../analysis/altroutes";
import { loadTasks, saveTasks, type TaskMap, type TaskRecord } from "./tasks";
import type { SearchHit } from "../lib/search";
import { createReportDoc, statusLineOf, type ReportDoc } from "../reports/doc";
import { loadReports, saveReports } from "../reports/storage";
import type { AnalysisParams, AnalysisResults, Lang, LayerState, LL, RunStatus, Selection, ValidationItem } from "../types";
import { ROUTES, useHashRoute, type Route } from "./routes";
import type { Session } from "./session";

export interface UploadedImage {
  name: string;
  url: string;
  size: number;
  width: number;
  height: number;
}
export type CopilotState = "closed" | "open" | "min";
export interface Toast {
  id: number;
  msg: string;
  tone: "ok" | "warn" | "error";
}
export interface ValidationState {
  reference: Reference | null;
  includeUncertain: boolean;
  result: EvalResult | null;
  error: string | null;
}
export interface DownstreamState {
  start: LL | null;
  halfWidthM: number;
  result: DownstreamResult | null;
}
export interface MapView {
  lat: number;
  lng: number;
  zoom: number;
}

export const DEFAULT_PARAMS: AnalysisParams = {
  locationName: SCENARIO.name,
  lat: SCENARIO.defaultLat,
  lon: SCENARIO.defaultLon,
  eventDate: SCENARIO.eventDate,
  fromDate: SCENARIO.defaultFrom,
  toDate: SCENARIO.defaultTo,
  sensor: "S1S2",
  picks: {},
};

const DEFAULT_LAYERS: LayerState = { flood: true, uncertain: true, debris: true, buildings: true, roads: true, bridges: true, settlements: true, rivers: true, services: true };

const paramKey = (p: AnalysisParams) => [p.eventDate, p.fromDate, p.toDate, p.sensor, JSON.stringify(p.picks)].join("|");
const newId = () => `RPT-${Date.now().toString(36).toUpperCase()}`;
const upsert = (list: ReportDoc[], d: ReportDoc) => (list.some((x) => x.id === d.id) ? list.map((x) => (x.id === d.id ? d : x)) : [d, ...list]);

interface AppCtx {
  session: Session;
  signOut: () => void;
  /** Go to the public landing page. The session, analysis and open report are kept. */
  goHome: () => void;
  /** Manual verification statuses and notes (local to this browser), keyed by priority-entry id. */
  tasks: TaskMap;
  updateTask: (id: string, patch: Partial<Pick<TaskRecord, "status" | "note">>) => void;
  /** Result of the Alternative Routes tool (hypothetical). */
  alt: AltResult | null;
  setAlt: (a: AltResult | null) => void;
  route: Route;
  tab: string | null;
  go: (r: Route, tab?: string) => void;
  back: () => void;

  params: AnalysisParams;
  setParams: (p: AnalysisParams) => void;
  validation: ValidationOutcome;
  results: AnalysisResults | null;
  status: RunStatus;
  progress: Progress;
  runErrors: ValidationItem[];
  clearRunErrors: () => void;
  stale: boolean;
  running: boolean;
  run: () => void;
  cancel: () => void;

  layers: LayerState;
  setLayers: (l: LayerState) => void;
  opacity: number;
  setOpacity: (n: number) => void;
  affectedOnly: boolean;
  setAffectedOnly: (b: boolean) => void;
  view: ViewState;
  onMode: (m: ViewMode) => void;
  onSplit: (n: number) => void;
  basemap: BasemapId;
  setBasemap: (b: BasemapId) => void;

  selected: Selection | null;
  select: (s: Selection | null) => void;
  pick: (s: Selection) => void;
  focus: FocusRequest | null;
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  fitNonce: number;
  pin: Pin | null;
  clearPin: () => void;
  goToHit: (h: SearchHit) => void;
  mapViewRef: MutableRefObject<MapView | null>;

  uploads: { before: UploadedImage | null; after: UploadedImage | null };
  setUpload: (slot: "before" | "after", img: UploadedImage | null) => void;

  /** HYPOTHETICAL what-if simulation (never modifies the analysis results). */
  simEdgeId: string | null;
  setSimEdge: (id: string | null) => void;
  simBase: SimBase;
  setSimBase: (b: SimBase) => void;
  sim: SimResult | null;
  runSim: () => void;
  resetSim: () => void;

  /** Terrain-guided downstream estimate. */
  downstream: DownstreamState;
  mapPick: boolean;
  onMapPoint: (lat: number, lng: number) => void;
  setDownstreamWidth: (m: number) => void;
  clearDownstream: () => void;

  copilot: CopilotState;
  setCopilot: (s: CopilotState) => void;
  copilotSeed: { q: string; nonce: number } | null;
  ask: (q: string) => void;

  reports: ReportDoc[];
  working: ReportDoc | null;
  dirty: boolean;
  storageOk: boolean;
  generateReport: (lang: Lang, opts?: { includeSim?: boolean }) => void;
  updateWorking: (fn: (d: ReportDoc) => ReportDoc) => void;
  saveDraft: () => void;
  publish: (reviewer: string) => void;
  duplicateAsDraft: () => void;
  openReport: (id: string) => void;
  deleteReport: (id: string) => void;

  val: ValidationState;
  setVal: (fn: (v: ValidationState) => ValidationState) => void;

  toast: Toast | null;
  notify: (msg: string, tone?: Toast["tone"]) => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp must be used inside AppProvider");
  return c;
}

function initialResults(): AnalysisResults | null {
  try {
    return runDemoAnalysis(DEFAULT_PARAMS);
  } catch {
    return null;
  }
}

export function AppProvider({ session, onSignOut, onHome, children }: { session: Session; onSignOut: () => void; onHome: () => void; children: ReactNode }) {
  const { route, tab, go, back } = useHashRoute();
  const routeRef = useRef(route);
  routeRef.current = route;

  const [params, setParamsRaw] = useState<AnalysisParams>(DEFAULT_PARAMS);
  const [results, setResults] = useState<AnalysisResults | null>(initialResults);
  const [analysedParams, setAnalysedParams] = useState<AnalysisParams>(DEFAULT_PARAMS);
  const [status, setStatus] = useState<RunStatus>("complete");
  const [progress, setProgress] = useState<Progress>({ step: 0, pct: 0 });
  const [runErrors, setRunErrors] = useState<ValidationItem[]>([]);

  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);
  const [opacity, setOpacity] = useState(0.7);
  const [affectedOnly, setAffectedOnly] = useState(false);
  const [view, setView] = useState<ViewState>({ mode: "swipe", split: 50 });
  const [basemap, setBasemap] = useState<BasemapId>("satellite");
  const [selected, setSelected] = useState<Selection | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [fitNonce, setFitNonce] = useState(0);
  const [pin, setPin] = useState<Pin | null>(null);
  const [uploads, setUploads] = useState<{ before: UploadedImage | null; after: UploadedImage | null }>({ before: null, after: null });
  const mapViewRef = useRef<MapView | null>(null);

  const [simEdgeId, setSimEdgeId] = useState<string | null>(null);
  const [simBase, setSimBaseRaw] = useState<SimBase>("modeled");
  const [sim, setSim] = useState<SimResult | null>(null);
  const [downstream, setDownstream] = useState<DownstreamState>({ start: null, halfWidthM: 200, result: null });

  const [copilot, setCopilot] = useState<CopilotState>("closed");
  const [copilotSeed, setCopilotSeed] = useState<{ q: string; nonce: number } | null>(null);

  const [reports, setReports] = useState<ReportDoc[]>(loadReports);
  const [working, setWorking] = useState<ReportDoc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [storageOk, setStorageOk] = useState(true);

  const [val, setValRaw] = useState<ValidationState>({ reference: null, includeUncertain: false, result: null, error: null });
  const [toast, setToast] = useState<Toast | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const simRef = useRef(sim);
  simRef.current = sim;
  const workingRef = useRef(working);
  workingRef.current = working;
  const reportsRef = useRef(reports);
  reportsRef.current = reports;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const downstreamRef = useRef(downstream);
  downstreamRef.current = downstream;
  const nonce = useRef(1);
  const toastTimer = useRef<number | undefined>(undefined);

  const validation = validateParams(params);
  const stale = !!results && paramKey(analysedParams) !== paramKey(params);
  const running = status === "running";
  const mapPick = route === "impact" && tab === "downstream";

  useEffect(() => {
    setStorageOk(saveReports(reports));
  }, [reports]);

  useEffect(() => {
    const label = ROUTES.find((r) => r.id === route)?.label ?? "";
    document.title = `${label} · FloodLens (Demo)`;
  }, [route]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const notify = useCallback((msg: string, tone: Toast["tone"] = "ok") => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: nonce.current++, msg, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  const setParams = useCallback((p: AnalysisParams) => {
    setParamsRaw(p);
    setRunErrors([]);
  }, []);

  /* ---------------- verification tasks (manual, local) · alternative route · leaving the app ---------------- */
  const [tasks, setTasks] = useState<TaskMap>(loadTasks);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const [alt, setAlt] = useState<AltResult | null>(null);

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);
  // A new analysis invalidates a previously calculated alternative route.
  useEffect(() => {
    setAlt(null);
  }, [results?.id]);

  const updateTask = useCallback(
    (id: string, patch: Partial<Pick<TaskRecord, "status" | "note">>) => {
      setTasks((t) => {
        const prev = t[id];
        const rec: TaskRecord = { status: prev?.status ?? "needs", note: prev?.note ?? "", ...patch, updatedAt: new Date().toISOString(), analysisId: resultsRef.current?.id ?? "", updatedBy: session.name };
        return { ...t, [id]: rec };
      });
    },
    [session.name],
  );

  // Unsaved report edits: warn on tab close, and before going Home or ending the session.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  const confirmLeave = useCallback((action: "home" | "end") => {
    if (!dirtyRef.current) return true;
    return window.confirm(
      action === "home"
        ? "You have unsaved changes to the report you are editing. They are not saved as a draft. Go to the home page anyway? (The edits stay open in this tab until you end the session or close it.)"
        : "You have unsaved changes to the report you are editing. Ending the session will discard them. Continue?",
    );
  }, []);
  const goHome = useCallback(() => {
    if (confirmLeave("home")) onHome();
  }, [confirmLeave, onHome]);
  const signOutGuarded = useCallback(() => {
    if (confirmLeave("end")) onSignOut();
  }, [confirmLeave, onSignOut]);

  const flyTo = useCallback((lat: number, lng: number, zoom = 13) => {
    setFocus({ lat, lng, zoom, nonce: nonce.current++ });
  }, []);

  const run = useCallback(async () => {
    const v = validateParams(params);
    if (!v.canRun) {
      const errs = v.items.filter((i) => i.severity === "error");
      setRunErrors(errs);
      if (errs.some((e) => e.id === "aoi")) {
        setResults(null);
        setSelected(null);
        setSim(null);
        setDownstream((d) => ({ ...d, result: null }));
        setStatus("error");
      } else setStatus(resultsRef.current ? "complete" : "error");
      return;
    }
    setRunErrors([]);
    const ctl = new AbortController();
    abortRef.current = ctl;
    setStatus("running");
    setProgress({ step: 0, pct: 0 });
    setSelected(null);
    try {
      const r = await demoService.run(params, setProgress, ctl.signal);
      setResults(r);
      setAnalysedParams(params);
      setStatus("complete");
      setFitNonce((n) => n + 1);
      setSim(null);
      setSimEdgeId(null);
      setDownstream((d) => ({ ...d, start: null, result: null }));
      setValRaw((x) => ({ ...x, result: null, error: null }));
      notify("Analysis complete — DEMO sample results loaded.");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") setStatus(resultsRef.current ? "complete" : "idle");
      else {
        setRunErrors([{ id: "run", severity: "error", title: "Processing failed", detail: e instanceof Error ? e.message : "Unknown error" }]);
        setStatus(resultsRef.current ? "complete" : "error");
      }
    }
  }, [params, notify]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const pick = useCallback(
    (sel: Selection) => {
      setSelected(sel);
      const r = resultsRef.current;
      if (!r) return;
      const model = describeFeature(sel, r, simRef.current);
      if (model) flyTo(model.center[0], model.center[1], model.zoom);
    },
    [flyTo],
  );

  const goToHit = useCallback(
    (hit: SearchHit) => {
      setSelected(hit.selection && resultsRef.current ? hit.selection : null);
      setPin(hit.kind === "coords" || hit.kind === "online" || hit.kind === "area" ? { lat: hit.lat, lon: hit.lon, label: hit.label } : null);
      flyTo(hit.lat, hit.lon, hit.zoom);
      if (!ROUTES.find((r) => r.id === routeRef.current)?.hasMap) go("analysis");
      if (hit.outside) notify("That location is outside the demo dataset coverage — the map is centred there, but no analysis exists for it.", "warn");
    },
    [flyTo, go, notify],
  );

  const ask = useCallback((q: string) => {
    setCopilotSeed({ q, nonce: nonce.current++ });
    setCopilot("open");
  }, []);

  /* ---------------- hypothetical simulation ---------------- */
  const runSim = useCallback(() => {
    const r = resultsRef.current;
    if (!r || !simEdgeId) return;
    setSim(simulateLoss(r, [simEdgeId], simBase));
  }, [simEdgeId, simBase]);

  const resetSim = useCallback(() => {
    if (simRef.current && !window.confirm("Reset the simulation? The hypothetical overlay and results will be cleared. The analysis itself is unchanged.")) return;
    setSim(null);
    setSimEdgeId(null);
    notify("Simulation reset. The original network and analysis were never modified.");
  }, [notify]);

  const setSimEdge = useCallback((id: string | null) => {
    setSimEdgeId(id);
    setSim(null);
  }, []);
  const setSimBase = useCallback((b: SimBase) => {
    setSimBaseRaw(b);
    setSim(null);
  }, []);

  /* ---------------- downstream explorer ---------------- */
  const onMapPoint = useCallback((lat: number, lng: number) => {
    const r = resultsRef.current;
    if (!r) return;
    const w = downstreamRef.current.halfWidthM;
    setDownstream({ start: [lat, lng], halfWidthM: w, result: estimateDownstream(r, [lat, lng], w) });
  }, []);
  const setDownstreamWidth = useCallback((m: number) => {
    const r = resultsRef.current;
    const d = downstreamRef.current;
    setDownstream({ ...d, halfWidthM: m, result: r && d.start ? estimateDownstream(r, d.start, m) : null });
  }, []);
  const clearDownstream = useCallback(() => setDownstream((d) => ({ ...d, start: null, result: null })), []);

  /* ---------------- reports ---------------- */
  const generateReport = useCallback(
    (lang: Lang, opts: { includeSim?: boolean } = {}) => {
      const r = resultsRef.current;
      if (!r) {
        notify("Run an analysis first — briefs are generated from analysis results.", "warn");
        return;
      }
      if (opts.includeSim && !simRef.current) {
        notify("No simulation has been run, so no hypothetical section was added.", "warn");
      }
      if (dirtyRef.current && !window.confirm("Replace the report currently open in the editor? Unsaved edits will be lost.")) return;
      setWorking(createReportDoc(r, lang, session.name, { sim: opts.includeSim ? simRef.current : null, tasks: tasksRef.current }));
      setDirty(false);
      go("reports");
    },
    [go, notify, session.name],
  );

  const updateWorking = useCallback((fn: (d: ReportDoc) => ReportDoc) => {
    setWorking((w) => (w ? { ...fn(w), updatedAt: new Date().toISOString(), edited: true } : w));
    setDirty(true);
  }, []);

  const saveDraft = useCallback(() => {
    const d = workingRef.current;
    if (!d || d.status === "published") return;
    const saved: ReportDoc = { ...d, updatedAt: new Date().toISOString() };
    saved.statusLine = statusLineOf(saved);
    setWorking(saved);
    setReports((l) => upsert(l, saved));
    setDirty(false);
    notify("Draft saved locally in this browser.");
  }, [notify]);

  const publish = useCallback(
    (reviewer: string) => {
      const d = workingRef.current;
      if (!d) return;
      const now = new Date().toISOString();
      const pub: ReportDoc = { ...d, status: "published", publishedAt: now, publishedBy: reviewer, updatedAt: now };
      pub.statusLine = statusLineOf(pub);
      setWorking(pub);
      setReports((l) => upsert(l, pub));
      setDirty(false);
      notify("Published to the local Published Reports list (demo — not sent to any authority).");
    },
    [notify],
  );

  const duplicateAsDraft = useCallback(() => {
    const d = workingRef.current;
    if (!d) return;
    const now = new Date().toISOString();
    const copy: ReportDoc = { ...d, id: newId(), status: "draft", publishedAt: undefined, publishedBy: undefined, createdAt: now, updatedAt: now, title: `${d.title} (copy)` };
    copy.statusLine = statusLineOf(copy);
    setWorking(copy);
    setDirty(true);
    notify("Editable copy created. Save it to keep it as a draft.");
  }, [notify]);

  const openReport = useCallback((id: string) => {
    if (dirtyRef.current && !window.confirm("Discard unsaved edits to the report currently open?")) return;
    const d = reportsRef.current.find((x) => x.id === id);
    if (d) {
      setWorking(d);
      setDirty(false);
    }
  }, []);

  const deleteReport = useCallback(
    (id: string) => {
      setReports((l) => l.filter((x) => x.id !== id));
      if (workingRef.current?.id === id) {
        setWorking(null);
        setDirty(false);
      }
      notify("Report removed from this browser.");
    },
    [notify],
  );

  const setVal = useCallback((fn: (v: ValidationState) => ValidationState) => setValRaw(fn), []);

  const value: AppCtx = {
    session,
    signOut: signOutGuarded,
    goHome,
    tasks,
    updateTask,
    alt,
    setAlt,
    route,
    tab,
    go,
    back,
    params,
    setParams,
    validation,
    results,
    status,
    progress,
    runErrors,
    clearRunErrors: () => setRunErrors([]),
    stale,
    running,
    run,
    cancel,
    layers,
    setLayers,
    opacity,
    setOpacity,
    affectedOnly,
    setAffectedOnly,
    view,
    onMode: (mode) => setView((v) => ({ ...v, mode })),
    onSplit: (split) => setView((v) => ({ ...v, split })),
    basemap,
    setBasemap,
    selected,
    select: setSelected,
    pick,
    focus,
    flyTo,
    fitNonce,
    pin,
    clearPin: () => setPin(null),
    goToHit,
    mapViewRef,
    uploads,
    setUpload: (slot, img) => setUploads((u) => ({ ...u, [slot]: img })),
    simEdgeId,
    setSimEdge,
    simBase,
    setSimBase,
    sim,
    runSim,
    resetSim,
    downstream,
    mapPick,
    onMapPoint,
    setDownstreamWidth,
    clearDownstream,
    copilot,
    setCopilot,
    copilotSeed,
    ask,
    reports,
    working,
    dirty,
    storageOk,
    generateReport,
    updateWorking,
    saveDraft,
    publish,
    duplicateAsDraft,
    openReport,
    deleteReport,
    val,
    setVal,
    toast,
    notify,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
