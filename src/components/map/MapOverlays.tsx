import { useState, type ReactNode } from "react";
import { ChevronDown, Crosshair, Layers, ListTree, MapPinOff, MessageSquareText, Route as RouteIcon, ShieldAlert, TriangleAlert, X } from "lucide-react";
import { EVIDENCE_LABEL, type EvidenceKind, type InspectorModel } from "../../analysis/inspect";
import type { Progress } from "../../analysis/service";
import type { AnalysisResults, LayerState, ValidationItem } from "../../types";
import { cn } from "../../utils/cn";
import { PipelineProgress } from "../PipelineProgress";
import { Badge, EmptyState, Toggle } from "../ui";
import { VERIF_HELP, VERIF_LABEL, VERIF_ORDER, VERIF_TONE, type VerifStatus } from "../../state/tasks";
import type { Tone } from "../../lib/format";

function Swatch({ children }: { children: ReactNode }) {
  return <span className="flex size-3.5 shrink-0 items-center justify-center">{children}</span>;
}
const box = (bg: string, border: string, dashed = false) => <span className="block size-3 rounded-[2px] border" style={{ background: bg, borderColor: border, borderStyle: dashed ? "dashed" : "solid" }} />;
const dot = (c: string, ring = false) => <span className="block size-2.5 rounded-full" style={{ background: c, boxShadow: ring ? "0 0 0 2px #fff, 0 0 0 3px #94A3B8" : undefined }} />;

interface LayerPanelProps {
  layers: LayerState;
  setLayers: (l: LayerState) => void;
  opacity: number;
  setOpacity: (n: number) => void;
  affectedOnly: boolean;
  setAffectedOnly: (b: boolean) => void;
  results: AnalysisResults | null;
  defaultOpen?: boolean;
}

export function LayerPanel({ layers, setLayers, opacity, setOpacity, affectedOnly, setAffectedOnly, results, defaultOpen = true }: LayerPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const m = results?.metrics;
  const set = (k: keyof LayerState) => (v: boolean) => setLayers({ ...layers, [k]: v });
  const na = !results;
  return (
    <div className="absolute left-3 top-3 z-[900] w-[216px] overflow-hidden rounded-lg border border-line bg-white/95 shadow-md">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left" aria-expanded={open}>
        <Layers className="size-3.5 text-slate-400" />
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-300">Layers</span>
        <ChevronDown className={cn("size-3.5 text-slate-500 transition", open ? "" : "-rotate-90")} />
      </button>
      {open && (
        <div className="animate-fade-in border-t border-line px-1.5 pb-2 pt-1.5">
          <Toggle checked={layers.flood} onChange={set("flood")} disabled={na} label="Detected floodwater" swatch={<Swatch>{box("#0891B299", "#0891B2")}</Swatch>} count={m ? `${m.waterKm2} km²` : undefined} />
          <Toggle checked={layers.uncertain} onChange={set("uncertain")} disabled={na} label="Uncertain detections" swatch={<Swatch>{box("#0891B226", "#0891B2", true)}</Swatch>} count={m ? `${m.uncertainKm2} km²` : undefined} />
          <Toggle checked={layers.debris} onChange={set("debris")} disabled={na} label="Suspected debris" swatch={<Swatch>{box("#D9770699", "#D97706")}</Swatch>} count={results ? results.debris.length : undefined} />
          <div className="my-1 h-px bg-line" />
          <Toggle checked={layers.buildings} onChange={set("buildings")} disabled={na} label="Buildings" swatch={<Swatch>{dot("#DC2626")}</Swatch>} count={m ? `${m.buildingsLikely + m.buildingsPossible}/${m.buildingsTotal}` : undefined} />
          <Toggle checked={layers.roads} onChange={set("roads")} disabled={na} label="Roads" swatch={<Swatch><span className="block h-[3px] w-3.5 rounded bg-slate-400" /></Swatch>} count={m ? `${m.roadSegmentsBlocked + m.roadSegmentsSuspected} flagged` : undefined} />
          <Toggle checked={layers.bridges} onChange={set("bridges")} disabled={na} label="Bridges" swatch={<Swatch><span className="block h-[5px] w-3.5 rounded-[1px] border border-slate-100 bg-white" /></Swatch>} count={m ? `${m.bridgesBlocked + m.bridgesSuspected}/${m.bridgesTotal}` : undefined} />
          <Toggle checked={layers.settlements} onChange={set("settlements")} disabled={na} label="Settlements & access" swatch={<Swatch>{dot("#D97706", true)}</Swatch>} count={m ? `${m.settlementsDisconnected + m.settlementsSuspected}/${m.settlementsTotal}` : undefined} />
          <Toggle checked={layers.services} onChange={set("services")} disabled={na} label="Hospitals & critical facilities" swatch={<Swatch><span className="block size-2.5 rounded-[2px] border-2 border-slate-100 bg-white" /></Swatch>} />
          <Toggle checked={layers.rivers} onChange={set("rivers")} disabled={na} label="Rivers (pre-event)" swatch={<Swatch><span className="block h-0.5 w-3.5 bg-sky-400" /></Swatch>} />
          <div className="my-1.5 h-px bg-line" />
          <div className="px-1.5">
            <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
              <span>Overlay opacity</span>
              <span className="font-mono text-[10.5px] text-slate-500">{Math.round(opacity * 100)}%</span>
            </div>
            <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="h-1 w-full cursor-pointer" aria-label="Overlay opacity" />
          </div>
          <div className="mt-1.5">
            <Toggle checked={affectedOnly} onChange={setAffectedOnly} disabled={na} label="Affected features only" />
          </div>
        </div>
      )}
    </div>
  );
}

export function Legend({ defaultOpen = true }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const Row = ({ sw, label, tip }: { sw: ReactNode; label: string; tip?: string }) => (
    <div className="flex items-center gap-2 py-[2px]" title={tip ?? label}>
      <span className="flex w-5 shrink-0 items-center justify-center">{sw}</span>
      <span className="text-[10.5px] text-slate-300">{label}</span>
    </div>
  );
  return (
    <div className="absolute bottom-6 left-3 z-[900] w-[216px] overflow-hidden rounded-lg border border-line bg-white/95 shadow-md">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left" aria-expanded={open}>
        <ListTree className="size-3.5 text-slate-400" />
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-300">Legend</span>
        <ChevronDown className={cn("size-3.5 text-slate-500 transition", open ? "" : "-rotate-90")} />
      </button>
      {open && (
        <div className="max-h-[42vh] animate-fade-in space-y-1.5 overflow-y-auto border-t border-line px-3 py-2">
          <div>
            <Row sw={box("#0891B299", "#0891B2")} label="Detected floodwater (≥ 75%)" tip="Fused Sentinel evidence score of at least 0.75" />
            <Row sw={box("#0891B226", "#0891B2", true)} label="Uncertain water (40–75%)" tip="Evidence score between 0.40 and 0.75 — treat with caution" />
            <Row sw={box("#D9770699", "#D97706")} label="Suspected debris" tip="Surface-change indicator; cause is unconfirmed" />
            <Row sw={box("#F8FAFC", "#64748B", true)} label="Cloud / shadow gap" tip="No optical evidence here; features inside are not assessable" />
          </div>
          <div className="border-t border-line pt-1.5">
            <Row sw={<span className="block h-[3px] w-5 rounded bg-crit" />} label="Road likely inundated" tip="High-confidence detected water on the carriageway (modeled), not proof of destruction" />
            <Row sw={<span className="block h-0 w-5 border-t-[3px] border-dashed border-warn" />} label="Road possible disruption" />
            <Row sw={<span className="block h-[6px] w-5 rounded-[1px] border border-slate-100 bg-crit" />} label="Bridge flagged (inspect)" tip="Flood corridor or debris near the structure; structural state is unknown" />
            <Row sw={dot("#DC2626")} label="Building likely inundated" />
            <Row sw={dot("#D97706")} label="Building possibly affected" />
          </div>
          <div className="border-t border-line pt-1.5">
            <Row sw={dot("#DC2626", true)} label="Modeled disconnected" tip="No route in the modeled road network — not confirmed ground access" />
            <Row sw={dot("#D97706", true)} label="Access uncertain" />
            <Row sw={dot("#16A34A", true)} label="Access maintained (modeled)" />
            <Row sw={<span className="block h-[4px] w-5 rounded bg-brand" />} label="Best-case route (selected)" />
            <Row sw={<span className="block size-3 rounded-[3px] border-2 border-slate-100 bg-white text-center font-mono text-[7px] font-bold leading-[8px] text-slate-100">S</span>} label="School / public building" />
          </div>
          <div className="border-t border-line pt-1.5">
            <Row sw={<span className="block h-[5px] w-5 rounded-[1px] bg-slate-100" />} label="Hypothetical: removed link" tip="Simulator only — a what-if, not an observed closure" />
            <Row sw={<span className="block h-0 w-5 border-t-[3px] border-dashed border-brand" />} label="Hypothetical: alternative route" />
            <Row sw={box("#0F172A1F", "#0F172A", true)} label="Terrain-guided corridor" tip="Downstream estimate — not a flood simulation" />
          </div>
          <p className="border-t border-line pt-1.5 text-[9.5px] leading-snug text-slate-500">Indicators from imagery do not confirm structural damage. DEMO data.</p>
        </div>
      )}
    </div>
  );
}

const KIND_TONE: Record<EvidenceKind, Tone> = { observation: "flood", derived: "water", hypothetical: "neutral", unverified: "warn" };

export function Inspector({
  model,
  why,
  verification,
  onVerify,
  onClose,
  onZoom,
  onAsk,
  onSimulate,
}: {
  model: InspectorModel;
  /** Why the feature was flagged (or why it was not). */
  why?: string[];
  /** undefined = hide; null = feature is not on the verification list. */
  verification?: { status: VerifStatus; manual: boolean; stale: boolean } | null;
  onVerify?: (s: VerifStatus) => void;
  onClose: () => void;
  onZoom: () => void;
  onAsk: (q: string) => void;
  onSimulate?: (edgeId: string) => void;
}) {
  return (
    <div role="dialog" aria-label="Evidence Inspector" className="absolute right-3 top-[148px] z-[950] flex max-h-[calc(100%-176px)] w-[min(330px,calc(100%-24px))] animate-fade-in flex-col overflow-hidden rounded-lg border border-line bg-white shadow-lg">
      <div className="flex items-start gap-2 border-b border-line px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-water">Evidence Inspector</div>
          <div className="mt-0.5 text-[13px] font-semibold leading-tight text-slate-100">{model.title}</div>
          <div className="mt-0.5 text-[10.5px] text-slate-500">{model.subtitle}</div>
          <Badge tone={model.badge.tone} className="mt-1.5">
            {model.badge.label}
          </Badge>
        </div>
        <button onClick={onClose} aria-label="Close inspector" className="rounded p-1 text-slate-500 transition hover:bg-slate-500/10 hover:text-slate-100">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2.5">
        <dl className="space-y-1.5">
          {model.rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[96px_1fr] gap-2 text-[11.5px]">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-slate-200">{v}</dd>
            </div>
          ))}
        </dl>

        <section>
          <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Evidence</h4>
          <ul className="space-y-1.5">
            {model.evidence.map((e, i) => (
              <li key={i} className={cn("rounded-md border bg-ink-850 p-2", e.kind === "hypothetical" ? "border-dashed border-slate-400" : "border-line")}>
                <Badge tone={KIND_TONE[e.kind]} className="mb-1">
                  {EVIDENCE_LABEL[e.kind]}
                </Badge>
                <p className="text-[11px] leading-snug text-slate-300">{e.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {model.warnings.length > 0 && (
          <section>
            <h4 className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-warn">
              <TriangleAlert className="size-3" /> Data-quality warnings
            </h4>
            <ul className="space-y-1">
              {model.warnings.map((w, i) => (
                <li key={i} className="flex gap-1.5 text-[10.5px] leading-snug text-slate-400">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-warn" />
                  {w}
                </li>
              ))}
            </ul>
          </section>
        )}

        {why && why.length > 0 && (
          <section>
            <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Why it was flagged</h4>
            <ul className="space-y-1">
              {why.map((w, i) => (
                <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-slate-300">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-slate-500" />
                  {w}
                </li>
              ))}
            </ul>
          </section>
        )}

        {verification !== undefined && (
          <section className="rounded-md border border-line bg-ink-850 p-2">
            <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Verification status</h4>
            {verification ? (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={VERIF_TONE[verification.status]}>{VERIF_LABEL[verification.status]}</Badge>
                  {verification.manual ? <Badge tone="info">Manual</Badge> : <span className="text-[10.5px] text-slate-500">default</span>}
                  {onVerify && (
                    <select value={verification.status} onChange={(e) => onVerify(e.target.value as VerifStatus)} aria-label="Update verification status" className="ml-auto h-7 rounded border border-line bg-white px-1.5 text-[11px] text-slate-200 outline-none focus:border-water">
                      {VERIF_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {VERIF_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <p className="mt-1 text-[10.5px] leading-snug text-slate-500">
                  {VERIF_HELP[verification.status]} Statuses are entered by people and do not confirm real-world conditions.
                  {verification.stale ? " Recorded against an earlier analysis run — re-check." : ""}
                </p>
              </>
            ) : (
              <p className="text-[11px] leading-snug text-slate-500">Not on the verification list: nothing flagged this feature in the current results.</p>
            )}
          </section>
        )}

        <section className="rounded-md border border-water/25 bg-water/5 p-2">
          <h4 className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-water">
            <ShieldAlert className="size-3" /> Recommended verification
          </h4>
          <p className="text-[11px] leading-snug text-slate-300">{model.verify}</p>
        </section>
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-line p-2">
        <button onClick={onZoom} className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-line bg-white text-[11px] font-medium text-slate-200 transition hover:border-slate-500">
          <Crosshair className="size-3" /> Zoom to
        </button>
        {model.ask && (
          <button onClick={() => onAsk(model.ask!)} className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-water/30 bg-water/10 text-[11px] font-medium text-water transition hover:bg-water/15">
            <MessageSquareText className="size-3" /> Ask Copilot
          </button>
        )}
        {model.simulateEdgeId && onSimulate && (
          <button onClick={() => onSimulate(model.simulateEdgeId!)} className="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-line bg-white text-[11px] font-medium text-slate-200 transition hover:border-slate-500">
            <RouteIcon className="size-3" /> Test loss in What-If Simulator (hypothetical)
          </button>
        )}
      </div>
    </div>
  );
}

interface StatusProps {
  running: boolean;
  progress: Progress;
  results: AnalysisResults | null;
  errors: ValidationItem[];
  onCancel: () => void;
}

export function MapStatusOverlay({ running, progress, results, errors, onCancel }: StatusProps) {
  if (running) {
    return (
      <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-ink-950/70">
        <div className="w-[330px] animate-fade-in rounded-xl border border-line bg-white p-4 shadow-lg">
          <PipelineProgress progress={progress} />
          <button onClick={onCancel} className="mt-3 h-8 w-full rounded-md border border-line text-[12px] text-slate-300 transition hover:border-slate-500 hover:text-slate-100">
            Cancel
          </button>
        </div>
      </div>
    );
  }
  if (!results) {
    const first = errors[0];
    return (
      <div className="absolute inset-0 z-[1050] flex items-center justify-center p-6">
        <div className="max-w-sm animate-fade-in rounded-xl border border-line bg-white shadow-lg">
          {errors.length ? (
            <EmptyState icon={first.id === "aoi" ? <MapPinOff className="size-5" /> : <TriangleAlert className="size-5 text-warn" />} title={first.title}>
              {first.detail}
              {errors.length > 1 && ` (+${errors.length - 1} more issue${errors.length > 2 ? "s" : ""} in Flood Analysis.)`}
            </EmptyState>
          ) : (
            <EmptyState icon={<Layers className="size-5" />} title="No analysis loaded">
              Open Flood Analysis, choose an area and dates, then run the analysis.
            </EmptyState>
          )}
        </div>
      </div>
    );
  }
  return null;
}
