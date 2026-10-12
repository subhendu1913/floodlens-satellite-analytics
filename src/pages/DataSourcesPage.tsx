import { useState, type ReactNode } from "react";
import { Ban, Check, CircleAlert, Copy, Database, FlaskConical, Info } from "lucide-react";
import { THRESHOLDS } from "../analysis/engine";
import { Badge, SectionTitle } from "../components/ui";
import { ATTRIBUTIONS, EMSR_STATEMENT, TRAINING_DATA_STATEMENT } from "../data/attributions";
import { SCENARIO } from "../data/scenario";
import { copyText } from "../lib/exporters";
import { fmtDate, type Tone } from "../lib/format";
import { useApp } from "../state/store";

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  );
}

export function DataSourcesPage() {
  const { results, validation, val, notify } = useApp();
  const [copied, setCopied] = useState(false);
  const a = results?.acquisitions;
  const s1 = results && results.effectiveSensor !== "S2";
  const s2 = results && results.effectiveSensor !== "S1";
  const warns = validation.items.filter((i) => i.severity === "warn" || i.severity === "error");

  const status: { part: string; cls: string; tone: Tone; note: string }[] = [
    { part: "Verification statuses", cls: "Manual · local", tone: "info", note: "Entered by people in the Rescue Action Center and stored in this browser only. They record the state of an investigation — not automatic confirmation of real-world conditions." },
    { part: "AI Copilot", cls: "Demo (rule-based)", tone: "warn", note: "Demo Copilot: answers are computed in the browser from the shared analysis results — no language model and no API key. A real model can only be added through an optional server-side proxy (see VITE_COPILOT_ENDPOINT)." },
    { part: "Critical connections, simulator & downstream explorer", cls: results ? "Derived · hypothetical" : "Unavailable", tone: results ? "warn" : "neutral", note: "Computed in the browser from the sample network. Simulator output is HYPOTHETICAL; the downstream corridor is a terrain-guided estimate using placeholder elevation attributes." },
    { part: "Flood extent, debris, uncertain areas", cls: results ? "Sample" : "Unavailable", tone: results ? "warn" : "neutral", note: "Hand-authored sample geometry with placeholder evidence values standing in for Sentinel processing." },
    { part: "Infrastructure exposure", cls: results ? "Sample" : "Unavailable", tone: results ? "warn" : "neutral", note: "Sample OSM-style assets intersected with the sample detections." },
    { part: "Road connectivity & isolated settlements", cls: results ? "Sample" : "Unavailable", tone: results ? "warn" : "neutral", note: "Dijkstra routing on the sample network with flagged segments removed." },
    { part: "Actual processed Sentinel results", cls: "Unavailable", tone: "neutral", note: "No processing backend is connected, so no verified satellite analysis exists in this build." },
    { part: "EMSR927 validation", cls: val.result ? (val.result.source === "synthetic" ? "Synthetic test" : "Loaded by user") : "Unavailable", tone: val.result ? "warn" : "neutral", note: "Reference maps are not bundled; the page accepts a GeoJSON export after analysis." },
    { part: "Basemap imagery", cls: "Reference", tone: "info", note: "Esri / CARTO / OpenTopoMap tiles for orientation — not imagery from the event date." },
  ];

  const inputs = [
    {
      name: "Sentinel-1 GRD (IW, VV+VH)",
      role: "Open-water detection from backscatter change; coherence loss as a debris indicator. Pre/post scenes must share orbit direction and relative orbit.",
      detail: s1 && a?.s1Pre && a.s1Post ? `${fmtDate(a.s1Pre.date)} → ${fmtDate(a.s1Post.date)} · ${a.s1Post.orbit} orbit ${a.s1Post.relOrbit}` : "Not used in the current run",
    },
    {
      name: "Sentinel-2 L2A (MSI)",
      role: "Water-index change, optical surface change (debris indicator) and cloud / shadow masking.",
      detail: s2 && a?.s2Pre && a.s2Post ? `${fmtDate(a.s2Pre.date)} → ${fmtDate(a.s2Post.date)} · post-event cloud ${a.s2Post.cloudPct}%` : "Not used in the current run",
    },
    { name: "Copernicus DEM (WorldDEM-30)", role: "Slope and height-above-drainage masks to suppress false water on steep terrain; radar shadow / layover mask.", detail: "Terrain context" },
    { name: "OpenStreetMap — pre-event snapshot", role: "Roads, bridges, buildings, waterways and facilities for exposure and connectivity analysis.", detail: `Snapshot ${fmtDate(SCENARIO.osmSnapshotDate)}` },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1000px] space-y-6 p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-md border border-line bg-ink-850 text-water">
            <Database className="size-4" />
          </span>
          <div>
            <h1 className="text-[15px] font-semibold text-white">Data sources &amp; integrity</h1>
            <p className="text-[11.5px] text-slate-500">What goes into every number in FloodLens, and what is only a sample.</p>
          </div>
        </div>

        <div className="flex gap-3 rounded-lg border border-warn/40 bg-warn/10 p-3.5">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-warn" />
          <p className="text-[12px] leading-relaxed text-slate-300">
            <span className="font-semibold text-warn">Demonstration dataset — not satellite-derived findings.</span> Current results come from the labelled scenario <span className="font-mono text-[11px]">{SCENARIO.id}</span>. The analysis service sits behind one interface (<span className="font-mono text-[11px]">src/analysis/service.ts</span>) so a real backend can return the same results object.
          </p>
        </div>

        <Card title="Data class of each component">
          <div className="mb-2 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
            <Badge tone="warn">Sample</Badge> illustrative data <Badge tone="ok">Actual processed</Badge> verified satellite analysis (none in this build) <Badge>Unavailable</Badge> not present
          </div>
          <div className="overflow-hidden rounded-lg border border-line">
            {status.map((s) => (
              <div key={s.part} className="grid grid-cols-[1fr_auto] items-start gap-3 border-b border-line px-3.5 py-2.5 last:border-0 sm:grid-cols-[250px_120px_1fr]">
                <div className="text-[12px] font-medium text-slate-100">{s.part}</div>
                <div>
                  <Badge tone={s.tone}>{s.cls}</Badge>
                </div>
                <div className="col-span-2 text-[11.5px] leading-snug text-slate-400 sm:col-span-1">{s.note}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Analysis inputs (intended workflow)">
          <div className="overflow-hidden rounded-lg border border-line">
            {inputs.map((r) => (
              <div key={r.name} className="grid gap-x-4 gap-y-1 border-b border-line px-3.5 py-2.5 last:border-0 sm:grid-cols-[250px_1fr]">
                <div>
                  <div className="text-[12px] font-medium text-slate-100">{r.name}</div>
                  <div className="font-mono text-[10.5px] text-slate-500">{r.detail}</div>
                </div>
                <p className="text-[11.5px] leading-snug text-slate-400">{r.role}</p>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Never used as inputs">
            <div className="rounded-lg border border-line bg-ink-850 p-3.5">
              <h3 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-slate-200">
                <Ban className="size-3.5 text-red-400" /> Excluded by design
              </h3>
              <ul className="space-y-1.5 text-[11.5px] leading-snug text-slate-400">
                <li>• Post-event OpenStreetMap edits — not used to reconstruct damage.</li>
                <li>• {EMSR_STATEMENT}</li>
              </ul>
            </div>
          </Card>
          <Card title="Training data">
            <div className="rounded-lg border border-line bg-ink-850 p-3.5 text-[11.5px] leading-snug text-slate-400">{TRAINING_DATA_STATEMENT}</div>
          </Card>
        </div>

        <Card title="Services used by the interface">
          <ul className="space-y-1.5 rounded-lg border border-line bg-ink-850 p-3.5 text-[11.5px] leading-snug text-slate-400">
            <li>• Basemap tiles: Esri World Imagery, CARTO Dark Matter, OpenTopoMap — display only; nothing is derived from them.</li>
            <li>• Place search: built-in settlement gazetteer; optional online lookup via OpenStreetMap Nominatim when you press “search online”.</li>
            <li>• AI Copilot: the Demo Copilot is rule-based and runs in the browser — it needs no API key. A real language model can only be connected through an optional server-side proxy that holds the key; none is configured here.</li>
            <li>• Reports: saved only in this browser (local storage). “Published” is a local demo state, not external publication.</li>
          </ul>
        </Card>

        <Card title="Data-quality warnings & limitations">
          {warns.length === 0 && !results ? (
            <p className="text-[12px] text-slate-500">No analysis loaded.</p>
          ) : (
            <ul className="space-y-1.5">
              {warns.map((w) => (
                <li key={w.id} className="flex gap-2 rounded-md border border-warn/25 bg-warn/5 px-3 py-2">
                  <CircleAlert className={w.severity === "error" ? "mt-0.5 size-3.5 shrink-0 text-red-400" : "mt-0.5 size-3.5 shrink-0 text-warn"} />
                  <span>
                    <span className="block text-[12px] font-medium text-slate-200">{w.title}</span>
                    <span className="block text-[11px] leading-snug text-slate-500">{w.detail}</span>
                  </span>
                </li>
              ))}
              {results?.limitations.map((l, i) => (
                <li key={i} className="flex gap-2 rounded-md border border-line bg-ink-850 px-3 py-2 text-[11.5px] leading-snug text-slate-400">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-slate-500" />
                  {l}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Method & thresholds">
          <ul className="space-y-1 rounded-lg border border-line bg-ink-850 p-3.5 text-[11.5px] leading-snug text-slate-400">
            <li>• Water: fused confidence ≥ {THRESHOLDS.waterHigh * 100}% shown as detected; {THRESHOLDS.uncertain * 100}–{THRESHOLDS.waterHigh * 100}% as uncertain; below not shown.</li>
            <li>• Debris: ≥ {THRESHOLDS.debrisSuspected * 100}% “suspected”, {THRESHOLDS.debrisUncertain * 100}–{THRESHOLDS.debrisSuspected * 100}% “uncertain”. Never reported as confirmed.</li>
            <li>• Roads: ≈ 100 m of continuous high-confidence water = likely impassable (modeled); uncertain water or debris = possible disruption.</li>
            <li>• Bridges: detected flood corridor along the span axis ÷ span length ≥ 2.0 = likely impassable approaches; ≥ 1.15 = possible. Structural condition is never inferred.</li>
            <li>• Connectivity: shortest road routes to the nearest town or hospital, recomputed with blocked segments removed (modeled disconnected) and with blocked + suspected removed (access uncertain).</li>
            <li>• Sentinel-1 pre/post scenes must share orbit direction and relative orbit; incompatible scenes are rejected automatically.</li>
          </ul>
        </Card>

        <Card title="Required attributions">
          <div className="rounded-lg border border-line bg-ink-850 p-3.5">
            <div className="space-y-2 text-[12px] leading-snug text-slate-300">
              {ATTRIBUTIONS.map((t) => (
                <p key={t}>{t}</p>
              ))}
            </div>
            <button
              onClick={async () => {
                const ok = await copyText(ATTRIBUTIONS.join("\n"));
                setCopied(ok);
                notify(ok ? "Attributions copied." : "Copy failed — clipboard unavailable.", ok ? "ok" : "warn");
                setTimeout(() => setCopied(false), 1500);
              }}
              className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-slate-400 transition hover:text-water"
            >
              {copied ? <Check className="size-3 text-ok" /> : <Copy className="size-3" />} {copied ? "Copied" : "Copy attributions"}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
