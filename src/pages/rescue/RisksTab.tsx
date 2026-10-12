import { useMemo } from "react";
import { Cable, Crosshair, Info, Route as RouteIcon, Unplug } from "lucide-react";
import { computeChokepoints } from "../../analysis/chokepoints";
import { compareSettlements } from "../../analysis/priorities";
import { Badge, EmptyState, Notice, btnCls, toneText } from "../../components/ui";
import { ACCESS_LABEL, ACCESS_TONE, HOSPITAL_LABEL, HOSPITAL_TONE, IMPACT_LABEL, IMPACT_TONE } from "../../lib/format";
import { useApp } from "../../state/store";
import { VERIF_LABEL, VERIF_TONE, statusOf } from "../../state/tasks";
import { cn } from "../../utils/cn";

/** B. Access Risks — modeled loss of road connectivity, and the connections that keep access open. */
export function RisksTab() {
  const { results, selected, pick, go, setSimEdge, tasks } = useApp();
  const settlements = useMemo(() => (results ? results.settlements.filter((s) => s.status !== "connected").sort(compareSettlements) : []), [results]);
  const connections = useMemo(() => (results ? computeChokepoints(results).filter((c) => c.isolates.length > 0 || c.hospitalLost.length > 0) : []), [results]);

  if (!results) {
    return (
      <EmptyState icon={<Unplug className="size-5" />} title="No analysis results" className="h-full">
        Run the flood analysis to model road access.
      </EmptyState>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-5 p-3">
        <Notice tone="info" icon={<Info className="size-3.5" />}>
          Access risks come from routing on the <span className="font-medium text-slate-100">pre-event OSM road network</span>. They are modeled, not confirmed ground conditions, and no population figures are used.
        </Notice>

        <section>
          <h2 className="mb-1.5 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Settlements with modeled loss of road access <span className="font-mono text-slate-400">{settlements.length}</span>
          </h2>
          {settlements.length === 0 ? (
            <p className="rounded-lg border border-line bg-ink-850 p-3 text-[11.5px] text-slate-400">No settlement is modeled as disconnected or access-uncertain.</p>
          ) : (
            <ul className="space-y-2">
              {settlements.map((s) => {
                const on = selected?.kind === "settlement" && selected.id === s.id;
                const st = statusOf(tasks, `P-${s.id}`);
                return (
                  <li key={s.id} className={cn("rounded-lg border p-3", on ? "border-water bg-water/5" : "border-line bg-white")}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-auto text-[12.5px] font-medium text-slate-100">{s.name}</span>
                      <Badge tone={ACCESS_TONE[s.status]}>{ACCESS_LABEL[s.status]}</Badge>
                      <Badge tone={VERIF_TONE[st]}>{VERIF_LABEL[st]}</Badge>
                    </div>
                    <dl className="mt-1.5 grid grid-cols-[96px_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                      <dt className="text-slate-500">Nearest facility</dt>
                      <dd className="text-slate-300">{s.post ? `${s.post.service} · ${s.post.km} km${s.post.viaUncertain ? " (via uncertain segment)" : ""}` : <span className="text-crit">No modeled road route</span>}</dd>
                      <dt className="text-slate-500">Flagged segments</dt>
                      <dd className="text-slate-300">{s.disrupted.length ? s.disrupted.map((d) => d.name.replace(/^(Highway|Track|Road|Spur road) · /, "")).join("; ") : "None on the pre-event route"}</dd>
                      <dt className="text-slate-500">Hospital</dt>
                      <dd className={toneText[HOSPITAL_TONE[s.hospital.status]]}>{HOSPITAL_LABEL[s.hospital.status]}</dd>
                    </dl>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button onClick={() => pick({ kind: "settlement", id: s.id })} className={cn(btnCls.base, btnCls.outline, btnCls.sm)}>
                        <Crosshair className="size-3" /> Locate
                      </button>
                      <button
                        onClick={() => {
                          pick({ kind: "settlement", id: s.id });
                          go("impact", "alternatives");
                        }}
                        className={cn(btnCls.base, btnCls.soft, btnCls.sm)}
                      >
                        <RouteIcon className="size-3" /> Find alternative route
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-1.5 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Connections important for maintaining access <span className="font-mono text-slate-400">{connections.length}</span>
          </h2>
          <ul className="space-y-2">
            {connections.map((c) => {
              const on = selected?.kind === "group" && selected.id === c.id;
              const bridgeEdge = results.roads.find((e) => c.edgeIds.includes(e.id) && e.isBridge)?.id ?? c.edgeIds[0];
              return (
                <li key={c.id} className={cn("rounded-lg border p-3", on ? "border-water bg-water/5" : "border-line bg-white")}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {c.kind === "bridge" ? <Cable className="size-3.5 text-slate-500" /> : <RouteIcon className="size-3.5 text-slate-500" />}
                    <span className="mr-auto text-[12.5px] font-medium text-slate-100">{c.name}</span>
                    <Badge tone={IMPACT_TONE[c.exposure]}>Flood evidence: {c.exposure === "none" ? "none" : IMPACT_LABEL[c.exposure]}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-slate-300">{c.why}</p>
                  <p className="mt-0.5 text-[10.5px] text-slate-500">{c.alternatives} Structural importance only — not evidence of damage.</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button onClick={() => pick(c.selection)} className={cn(btnCls.base, btnCls.outline, btnCls.sm)}>
                      <Crosshair className="size-3" /> Locate
                    </button>
                    <button
                      onClick={() => {
                        setSimEdge(bridgeEdge);
                        go("impact", "simulator");
                      }}
                      className={cn(btnCls.base, btnCls.soft, btnCls.sm)}
                    >
                      Test in What-If Simulator
                    </button>
                  </div>
                </li>
              );
            })}
            {connections.length === 0 && <li className="rounded-lg border border-line bg-ink-850 p-3 text-[11.5px] text-slate-400">No connection was found whose loss would remove a settlement's mapped route.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
