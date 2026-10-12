import { useEffect, useState } from "react";
import { Download, FileText, FlaskConical, MousePointerClick, Play, RotateCcw } from "lucide-react";
import type { SimCategory } from "../../analysis/simulate";
import { Badge, EmptyState, Field, Notice, Segmented, btnCls } from "../../components/ui";
import { buildCsv } from "../../lib/csv";
import { downloadText } from "../../lib/exporters";
import type { Tone } from "../../lib/format";
import { useApp } from "../../state/store";
import { cn } from "../../utils/cn";

const CAT: Record<SimCategory, { label: string; tone: Tone }> = {
  lost: { label: "Loses every modeled route", tone: "crit" },
  "hospital-lost": { label: "Loses hospital route", tone: "warn" },
  detour: { label: "Rerouted", tone: "water" },
  unchanged: { label: "Unchanged", tone: "neutral" },
  already: { label: "Already without a route", tone: "neutral" },
};

export function SimulatorTab() {
  const { results, selected, simEdgeId, setSimEdge, simBase, setSimBase, sim, runSim, resetSim, pick, generateReport, notify } = useApp();
  const [showSame, setShowSame] = useState(false);

  // A road / bridge picked on the map becomes the simulator's selected connection.
  useEffect(() => {
    if (!results || !selected) return;
    let id: string | null = null;
    if (selected.kind === "edge") id = selected.id;
    else if (selected.kind === "group") {
      const g = results.groups.find((x) => x.id === selected.id);
      id = g ? (results.roads.find((e) => g.edgeIds.includes(e.id) && e.isBridge)?.id ?? g.edgeIds[0]) : null;
    }
    if (id && id !== simEdgeId) setSimEdge(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, results]);

  const edge = results?.roads.find((e) => e.id === simEdgeId);
  const bridges = results?.roads.filter((e) => e.isBridge) ?? [];
  const roads = results?.roads.filter((e) => !e.isBridge) ?? [];
  const svc = (id: string) => results?.services.find((s) => s.id === id)?.name ?? id;
  const roadName = (id: string) => results?.roads.find((e) => e.id === id)?.name.replace(/^(Highway|Track|Road|Spur road) · /, "") ?? id;

  const changed = sim?.items.filter((i) => i.category !== "unchanged") ?? [];
  const same = sim?.items.filter((i) => i.category === "unchanged") ?? [];
  const noRouteBefore = sim ? sim.counts.already : 0;
  const noRouteAfter = sim ? sim.counts.already + sim.counts.lost : 0;
  const noHospBefore = sim ? sim.items.filter((i) => i.hospBeforeKm === null).length : 0;
  const noHospAfter = sim ? sim.items.filter((i) => i.hospAfterKm === null).length : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2.5 border-b border-line p-3">
        <Notice tone="neutral" icon={<FlaskConical className="size-3.5" />} title="What-if rescue access simulator — HYPOTHETICAL SCENARIOS">
          Removes one road or bridge from a <span className="font-medium text-slate-100">copy</span> of the road network and recalculates which settlements keep a mapped route to a town or the hospital. The analysis and original network are never modified. Results are scenarios, not confirmed closures.
        </Notice>

        <Field label="1 · Choose a connection" hint={edge ? undefined : "Pick from the list or click a road / bridge on the map."}>
          <select
            value={simEdgeId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setSimEdge(v || null);
              if (v) pick({ kind: "edge", id: v });
            }}
            disabled={!results}
            className="h-8 w-full rounded-md border border-line bg-white px-2 text-[12px] text-slate-100 outline-none focus:border-water focus:ring-2 focus:ring-water/20"
          >
            <option value="">— select a road or bridge —</option>
            <optgroup label="Bridges">
              {bridges.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.id} · {e.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Roads">
              {roads.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.id} · {e.name}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
        {edge && (
          <div className="flex items-start gap-2 rounded-md border border-water/30 bg-water/5 px-2.5 py-1.5 text-[11.5px]">
            <MousePointerClick className="mt-0.5 size-3.5 shrink-0 text-water" />
            <span className="min-w-0 text-slate-300">
              <span className="font-medium text-slate-100">{edge.name}</span>
              <span className="block text-[10.5px] text-slate-500">
                {edge.isBridge ? "Bridge" : "Road"} · {(edge.lengthKm * 1000).toFixed(0)} m · flood evidence: {edge.impact.state === "none" ? "none" : edge.impact.state === "blocked" ? "likely inundated" : "possible disruption"}
              </span>
            </span>
          </div>
        )}

        <div>
          <div className="mb-1 text-[11px] font-medium text-slate-300">2 · Starting network</div>
          <Segmented
            className="w-full [&>button]:flex-1"
            value={simBase}
            onChange={setSimBase}
            options={[
              { value: "modeled", label: "Current modeled", title: "Segments with high-confidence detected water are already removed" },
              { value: "pre-event", label: "Pre-event", title: "All mapped OSM roads present" },
            ]}
          />
          <p className="mt-1 text-[10.5px] leading-snug text-slate-500">{simBase === "modeled" ? "Starts from the network after removing segments classed likely inundated." : "Starts from the full pre-event OSM network, ignoring the flood analysis."}</p>
        </div>

        <div className="flex gap-1.5">
          <button onClick={runSim} disabled={!results || !simEdgeId} className={cn(btnCls.base, btnCls.primary, "flex-1")}>
            <Play className="size-3.5 fill-current" /> Simulate Connection Loss
          </button>
          <button onClick={resetSim} disabled={!sim && !simEdgeId} className={cn(btnCls.base, btnCls.outline)} title="Clear the simulation and the hypothetical overlay">
            <RotateCcw className="size-3.5" /> Reset Simulation
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {!results ? (
          <EmptyState icon={<FlaskConical className="size-5" />} title="No analysis results">
            Run the flood analysis first.
          </EmptyState>
        ) : !sim ? (
          <EmptyState icon={<FlaskConical className="size-5" />} title="No simulation run yet">
            Choose a connection and press “Simulate Connection Loss”. The result appears here and as a clearly marked hypothetical overlay on the map.
          </EmptyState>
        ) : (
          <>
            <div className="rounded-md border-2 border-dashed border-slate-400 bg-ink-850 px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral" className="font-bold tracking-wide">
                  HYPOTHETICAL SCENARIO
                </Badge>
                <span className="text-[11px] text-slate-500">not a confirmed event</span>
              </div>
              <p className="mt-1 text-[12px] font-medium text-slate-100">If {sim.edgeNames.join(" + ")} became unavailable…</p>
              <p className="text-[10.5px] text-slate-500">Starting network: {sim.base === "modeled" ? "current modeled network" : "pre-event network"} · simulated {sim.ranAt.slice(11, 16)} UTC</p>
              {sim.alreadyUnavailable && <p className="mt-1 text-[11px] font-medium text-warn">This connection is already modeled as impassable, so nothing changes. Try the pre-event network to see its structural role.</p>}
            </div>

            <div className="grid grid-cols-4 gap-1.5 text-center">
              {(["lost", "hospital-lost", "detour", "unchanged"] as const).map((k) => (
                <div key={k} className="rounded-md border border-line bg-white px-1 py-1.5" title={CAT[k].label}>
                  <div className={cn("font-mono text-[18px] font-semibold leading-none", k === "lost" ? "text-crit" : k === "hospital-lost" ? "text-warn" : k === "detour" ? "text-water" : "text-slate-400")}>{sim.counts[k]}</div>
                  <div className="mt-1 text-[9.5px] leading-tight text-slate-500">{k === "lost" ? "lose all routes" : k === "hospital-lost" ? "lose hospital" : k === "detour" ? "rerouted" : "unchanged"}</div>
                </div>
              ))}
            </div>

            <section>
              <h3 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">Settlement outcomes</h3>
              {changed.length === 0 ? (
                <p className="rounded-md border border-line bg-ink-850 px-3 py-2 text-[11.5px] text-slate-400">No settlement is affected by losing this connection in the chosen network.</p>
              ) : (
                <div className="overflow-hidden rounded-md border border-line">
                  <table className="w-full border-collapse text-left text-[11px]">
                    <thead className="bg-ink-850 text-[10px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-2 py-1.5 font-medium">Settlement</th>
                        <th className="px-2 py-1.5 font-medium">Original</th>
                        <th className="px-2 py-1.5 font-medium">Scenario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changed.map((i) => (
                        <tr key={i.id} onClick={() => pick({ kind: "settlement", id: i.id })} className="cursor-pointer border-t border-line align-top hover:bg-slate-500/5">
                          <td className="px-2 py-1.5 font-medium text-slate-100">{i.name}</td>
                          <td className="px-2 py-1.5 text-slate-400">{i.before ? `${svc(i.before.service)} · ${i.before.km} km` : "No route"}</td>
                          <td className="px-2 py-1.5">
                            <Badge tone={CAT[i.category].tone} className="whitespace-normal">
                              {CAT[i.category].label}
                            </Badge>
                            {i.after && i.category !== "already" && (
                              <div className="mt-0.5 text-[10.5px] text-slate-400">
                                {svc(i.after.service)} · {i.after.km} km{i.deltaKm ? ` (${i.deltaKm > 0 ? "+" : ""}${i.deltaKm} km)` : ""}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {same.length > 0 && (
                <div className="mt-1.5">
                  <button onClick={() => setShowSame(!showSame)} className="text-[11px] text-water hover:underline">
                    {showSame ? "Hide" : "Show"} {same.length} unaffected (connections remain available)
                  </button>
                  {showSame && <p className="mt-1 text-[11px] leading-snug text-slate-400">{same.map((i) => `${i.name} (${i.before ? `${i.before.km} km` : "—"})`).join(" · ")}</p>}
                </div>
              )}
            </section>

            <section>
              <h3 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">Affected town / hospital connections</h3>
              {sim.links.length ? (
                <ul className="space-y-1">
                  {sim.links.map((l, k) => (
                    <li key={k} className="flex items-center gap-2 rounded border border-line bg-white px-2 py-1 text-[11px]">
                      <span className="min-w-0 flex-1 truncate text-slate-300">
                        {l.settlement} → {svc(l.service)} <span className="text-slate-500">({l.kind})</span>
                      </span>
                      <Badge tone={l.outcome === "no route" ? "crit" : "water"}>{l.outcome === "no route" ? "no mapped route" : `rerouted${l.deltaKm ? ` +${l.deltaKm} km` : ""}`}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11.5px] text-slate-500">No town or hospital connection uses this segment.</p>
              )}
            </section>

            <section>
              <h3 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">Alternative mapped routes</h3>
              {sim.items.some((i) => i.altEdges.length) ? (
                <ul className="space-y-1">
                  {sim.items
                    .filter((i) => i.altEdges.length)
                    .map((i) => (
                      <li key={i.id} className="rounded border border-line bg-white px-2 py-1 text-[11px] text-slate-300">
                        <span className="font-medium text-slate-100">{i.name}</span>: via {i.altEdges.slice(0, 4).map(roadName).join(" → ")}
                        {i.altEdges.length > 4 ? ` … (+${i.altEdges.length - 4})` : ""}
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-[11.5px] text-slate-500">No alternative mapped route exists for the affected settlements. Unmapped tracks are not modeled.</p>
              )}
            </section>

            <section className="rounded-md border border-line bg-ink-850 p-2.5 text-[11.5px]">
              <h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">Difference from the original network</h3>
              <ul className="space-y-0.5 text-slate-300">
                <li>
                  Settlements with no mapped route to any town/hospital: <span className="font-mono">{noRouteBefore}</span> → <span className="font-mono font-semibold">{noRouteAfter}</span>
                </li>
                <li>
                  Settlements with no mapped hospital route: <span className="font-mono">{noHospBefore}</span> → <span className="font-mono font-semibold">{noHospAfter}</span>
                </li>
                <li>
                  Rerouted settlements: <span className="font-mono font-semibold">{sim.counts.detour}</span>
                </li>
              </ul>
            </section>

            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => generateReport("en", { includeSim: true })} className={cn(btnCls.base, btnCls.soft, btnCls.sm)}>
                <FileText className="size-3" /> Include in Rescue Brief
              </button>
              <button
                onClick={() => {
                  if (!results) return;
                  const f = buildCsv("simulation", results, sim);
                  downloadText(f.name, f.text, "text/csv");
                  notify("Hypothetical simulation exported as CSV.");
                }}
                className={cn(btnCls.base, btnCls.outline, btnCls.sm)}
              >
                <Download className="size-3" /> CSV
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
