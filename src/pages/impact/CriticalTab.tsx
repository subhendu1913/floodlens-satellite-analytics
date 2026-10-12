import { useMemo, useState } from "react";
import { Cable, Crosshair, Download, Info, Network, Route as RouteIcon, Search } from "lucide-react";
import { computeChokepoints } from "../../analysis/chokepoints";
import { Badge, Chip, EmptyState, Notice, btnCls, inputCls } from "../../components/ui";
import { SCENARIO } from "../../data/scenario";
import { buildCsv } from "../../lib/csv";
import { downloadText } from "../../lib/exporters";
import { IMPACT_LABEL, IMPACT_TONE, confLabel, fmtDate, fmtLL } from "../../lib/format";
import { useApp } from "../../state/store";
import { cn } from "../../utils/cn";

export function CriticalTab() {
  const { results, selected, pick, notify, setSimEdge, go } = useApp();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "bridge" | "road">("all");
  const [exposed, setExposed] = useState(false);

  const all = useMemo(() => (results ? computeChokepoints(results) : []), [results]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((c) => (kind === "all" || c.kind === kind) && (!exposed || c.exposure !== "none") && (!s || `${c.name} ${c.id} ${c.isolates.map((x) => x.name).join(" ")}`.toLowerCase().includes(s)));
  }, [all, q, kind, exposed]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2.5 border-b border-line p-3">
        <Notice tone="info" icon={<Info className="size-3.5" />} title="Critical Chokepoint Finder">
          Each road and bridge is hypothetically removed from the <span className="font-medium text-slate-100">pre-event road network</span> (OSM {fmtDate(SCENARIO.osmSnapshotDate)}) to see which settlements would lose their mapped route to a town or the hospital. This shows <span className="font-medium text-slate-100">structural importance</span> — it is not evidence of damage, closure or flooding. No population figures are used.
        </Notice>
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ["all", "All"],
              ["bridge", "Bridges"],
              ["road", "Roads"],
            ] as const
          ).map(([v, l]) => (
            <Chip key={v} active={kind === v} onClick={() => setKind(v)}>
              {l}
            </Chip>
          ))}
          <Chip active={exposed} onClick={() => setExposed(!exposed)} title="Show only connections with a flood or debris indicator">
            With flood evidence
          </Chip>
          <button
            disabled={!results}
            onClick={() => {
              if (!results) return;
              const f = buildCsv("critical", results);
              downloadText(f.name, f.text, "text/csv");
              notify("Critical connections exported as CSV.");
            }}
            className={cn(btnCls.base, btnCls.outline, btnCls.sm, "ml-auto")}
          >
            <Download className="size-3" /> CSV
          </button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-slate-500" />
          <input className={cn(inputCls, "pl-8")} placeholder="Search connection or settlement" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search critical connections" />
        </div>
      </div>

      {!results ? (
        <EmptyState icon={<Network className="size-5" />} title="No analysis results" className="flex-1">
          Run the flood analysis to examine the road network.
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState icon={<Search className="size-5" />} title="No connections match" className="flex-1">
          Clear the search or filters.
        </EmptyState>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {list.map((c, i) => {
            const on = selected?.kind === "group" && selected.id === c.id;
            const bridgeEdge = results.roads.find((e) => c.edgeIds.includes(e.id) && e.isBridge)?.id ?? c.edgeIds[0];
            return (
              <li key={c.id} className={cn("rounded-lg border p-3 transition", on ? "border-water bg-water/5" : "border-line bg-white")}>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-ink-700 font-mono text-[10.5px] text-slate-300">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {c.kind === "bridge" ? <Cable className="size-3.5 text-slate-500" /> : <RouteIcon className="size-3.5 text-slate-500" />}
                      <span className="text-[12.5px] font-medium text-slate-100">{c.name}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge>{c.id}</Badge>
                      <Badge tone={IMPACT_TONE[c.exposure]}>Flood evidence: {c.exposure === "none" ? "none" : IMPACT_LABEL[c.exposure]}</Badge>
                      <span className="font-mono text-[10px] text-slate-500">{fmtLL(c.center)}</span>
                    </div>
                  </div>
                </div>

                <dl className="mt-2.5 space-y-1.5 text-[11.5px] leading-snug">
                  <div className="grid grid-cols-[92px_1fr] gap-2">
                    <dt className="text-slate-500">Why it matters</dt>
                    <dd className="text-slate-300">{c.why}</dd>
                  </div>
                  <div className="grid grid-cols-[92px_1fr] gap-2">
                    <dt className="text-slate-500">Depend on it</dt>
                    <dd className="flex flex-wrap gap-1">
                      {[...c.isolates.map((x) => ({ ...x, t: "crit" as const })), ...c.hospitalLost.map((x) => ({ ...x, t: "warn" as const })), ...c.detours.map((x) => ({ ...x, t: "water" as const }))].map((x) => (
                        <button key={`${x.t}-${x.id}`} onClick={() => pick({ kind: "settlement", id: x.id })} className="rounded transition hover:opacity-80" title={x.t === "crit" ? "Would lose every mapped route" : x.t === "warn" ? "Would lose the hospital route" : "Would be rerouted"}>
                          <Badge tone={x.t}>{x.name}</Badge>
                        </button>
                      ))}
                    </dd>
                  </div>
                  <div className="grid grid-cols-[92px_1fr] gap-2">
                    <dt className="text-slate-500">Alternatives</dt>
                    <dd className="text-slate-300">
                      {c.alternatives}
                      {c.detours.length > 0 && <span className="text-slate-500"> ({c.detours.map((d) => `${d.name} +${d.deltaKm} km`).join(", ")})</span>}
                    </dd>
                  </div>
                  <div className="grid grid-cols-[92px_1fr] gap-2">
                    <dt className="text-slate-500">Flood evidence</dt>
                    <dd>
                      <ul className="space-y-0.5 text-slate-400">
                        {c.exposureEvidence.map((e, k) => (
                          <li key={k} className="flex gap-1.5">
                            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-slate-500" />
                            {e}
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                  <div className="grid grid-cols-[92px_1fr] gap-2">
                    <dt className="text-slate-500">Data · uncertainty</dt>
                    <dd className="text-[10.5px] text-slate-500">
                      Structural result of the network model on pre-event OSM; {c.confidence !== null ? `flood-evidence score ${confLabel(c.confidence)} (${Math.round(c.confidence * 100)}%) — a fused Sentinel indicator score, not a probability of damage` : "no flood-evidence score applies"}. Unmapped tracks are not modeled, so real alternatives may exist.
                    </dd>
                  </div>
                </dl>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <button onClick={() => pick(c.selection)} className={cn(btnCls.base, btnCls.outline, btnCls.sm)}>
                    <Crosshair className="size-3" /> Inspect on map
                  </button>
                  <button
                    onClick={() => {
                      setSimEdge(bridgeEdge);
                      go("impact", "simulator");
                    }}
                    className={cn(btnCls.base, btnCls.soft, btnCls.sm)}
                  >
                    <RouteIcon className="size-3" /> Test in What-If Simulator
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
