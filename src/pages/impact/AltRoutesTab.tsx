import { useEffect, useMemo, useState } from "react";
import { Info, Route as RouteIcon, RotateCcw, TriangleAlert } from "lucide-react";
import { findAlternative, type AltTarget } from "../../analysis/altroutes";
import { routeFor } from "../../analysis/graph";
import { compareSettlements } from "../../analysis/priorities";
import { Badge, EmptyState, Field, Notice, Segmented, btnCls } from "../../components/ui";
import { IMPACT_LABEL, IMPACT_TONE } from "../../lib/format";
import { useApp } from "../../state/store";
import { cn } from "../../utils/cn";

export function AltRoutesTab() {
  const { results, selected, alt, setAlt, pick } = useApp();
  const [sid, setSid] = useState("");
  const [target, setTarget] = useState<AltTarget>("any");
  const [checked, setChecked] = useState<string[]>([]);
  const [alsoBlocked, setAlsoBlocked] = useState(true);
  const [extra, setExtra] = useState("");

  const settlements = useMemo(() => (results ? [...results.settlements].sort(compareSettlements) : []), [results]);

  // Follow a settlement selected on the map; otherwise start with the first flagged one.
  useEffect(() => {
    if (!results) return;
    if (selected?.kind === "settlement") setSid(selected.id);
    else if (!sid) setSid((settlements.find((s) => s.status !== "connected") ?? settlements[0])?.id ?? "");
  }, [selected, results, settlements, sid]);

  const baseRoute = useMemo(() => (results && sid ? routeFor(results, new Set(), sid, target) : null), [results, sid, target]);
  const routeSegs = useMemo(() => (results && baseRoute ? [...baseRoute.edges].reverse().map((id) => results.roads.find((e) => e.id === id)!) : []), [results, baseRoute]);

  // Potentially disrupted segments on the original route are excluded by default.
  useEffect(() => {
    setChecked(routeSegs.filter((e) => e.impact.state !== "none").map((e) => e.id));
    setExtra("");
  }, [routeSegs]);

  if (!results) {
    return (
      <EmptyState icon={<RouteIcon className="size-5" />} title="No analysis results" className="h-full">
        Run the flood analysis first.
      </EmptyState>
    );
  }

  const svc = (id: string) => results.services.find((s) => s.id === id)?.name ?? id;
  const blockedCount = results.roads.filter((e) => e.impact.state === "blocked").length;
  const others = results.roads.filter((e) => !routeSegs.some((x) => x.id === e.id));

  const run = () => {
    if (!sid) return;
    const ids = new Set(checked);
    if (alsoBlocked) results.roads.forEach((e) => e.impact.state === "blocked" && ids.add(e.id));
    if (extra) ids.add(extra);
    setAlt(findAlternative(results, sid, [...ids], target));
  };
  const toggle = (id: string) => setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-3 p-3">
        <Notice tone="neutral" icon={<Info className="size-3.5" />} title="Alternative mapped routes — HYPOTHETICAL">
          Calculates a route on a <span className="font-medium text-slate-100">copy</span> of the pre-event OpenStreetMap road network that avoids the segments you exclude. A calculated route is <span className="font-medium text-slate-100">not guaranteed to be passable or safe</span>; unmapped tracks are not modeled and real conditions are unverified.
        </Notice>

        <section className="space-y-2.5 rounded-lg border border-line bg-white p-3">
          <Field label="1 · Settlement to route from">
            <select
              value={sid}
              onChange={(e) => {
                setSid(e.target.value);
                if (e.target.value) pick({ kind: "settlement", id: e.target.value }); // keep the map selection in step with the dropdown
              }}
              className="h-8 w-full rounded-md border border-line bg-white px-2 text-[12px] text-slate-100 outline-none focus:border-water focus:ring-2 focus:ring-water/20"
            >
              {settlements.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.status === "disconnected" ? "modeled disconnected" : s.status === "suspected" ? "access uncertain" : "access maintained"}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <div className="mb-1 text-[11px] font-medium text-slate-300">2 · Destination</div>
            <Segmented
              className="w-full [&>button]:flex-1"
              value={target}
              onChange={setTarget}
              options={[
                { value: "any", label: "Nearest town or hospital" },
                { value: "hospital", label: "Hospital only" },
              ]}
            />
          </div>
          <div>
            <div className="mb-1 text-[11px] font-medium text-slate-300">3 · Segments to exclude</div>
            {!baseRoute ? (
              <p className="rounded border border-line bg-ink-850 px-2.5 py-2 text-[11.5px] text-slate-500">No route exists even in the pre-event network, so there is nothing to avoid.</p>
            ) : (
              <>
                <p className="mb-1 text-[10.5px] text-slate-500">
                  Original route: {svc(baseRoute.service)}, {baseRoute.km.toFixed(1)} km. Segments with a flood or debris indicator are pre-selected.
                </p>
                <ul className="space-y-1">
                  {routeSegs.map((e) => (
                    <li key={e.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded border border-line bg-white px-2 py-1 text-[11px] hover:border-slate-500">
                        <input type="checkbox" checked={checked.includes(e.id)} onChange={() => toggle(e.id)} />
                        <span className="min-w-0 flex-1 truncate text-slate-200">{e.name}</span>
                        <Badge tone={IMPACT_TONE[e.impact.state]}>{e.impact.state === "none" ? "no indicator" : e.impact.state === "blocked" ? "likely inundated" : "possible"}</Badge>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <label className="mt-2 flex items-start gap-2 text-[11px] leading-snug text-slate-300">
              <input type="checkbox" checked={alsoBlocked} onChange={(e) => setAlsoBlocked(e.target.checked)} className="mt-0.5" />
              <span>Also exclude every segment classed likely inundated anywhere in the current analysis ({blockedCount}).</span>
            </label>
            <label className="mt-2 grid grid-cols-[1fr] gap-1 text-[11px] text-slate-400">
              Exclude one more segment (optional)
              <select value={extra} onChange={(e) => setExtra(e.target.value)} className="h-8 w-full rounded-md border border-line bg-white px-2 text-[11.5px] text-slate-100 outline-none focus:border-water">
                <option value="">— none —</option>
                {others.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.id} · {e.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-1.5">
            <button onClick={run} disabled={!sid} className={cn(btnCls.base, btnCls.primary, "flex-1")}>
              <RouteIcon className="size-3.5" /> Find alternative route
            </button>
            <button onClick={() => setAlt(null)} disabled={!alt} className={cn(btnCls.base, btnCls.outline)}>
              <RotateCcw className="size-3.5" /> Reset
            </button>
          </div>
        </section>

        {!alt ? (
          <EmptyState icon={<RouteIcon className="size-5" />} title="No route calculated yet">
            Choose a settlement and the segments to avoid, then press “Find alternative route”. The result is drawn on the map.
          </EmptyState>
        ) : (
          <section className="space-y-2.5 rounded-lg border-2 border-dashed border-slate-400 bg-white p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="neutral" className="font-bold tracking-wide">
                HYPOTHETICAL
              </Badge>
              <span className="text-[11px] text-slate-500">modeled route · not verified on the ground</span>
            </div>
            <p className="text-[12.5px] font-medium text-slate-100">
              {alt.settlementName} → {alt.target === "hospital" ? "hospital" : "nearest town or hospital"}
            </p>

            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Segments excluded ({alt.excluded.length})</div>
              {alt.excluded.length === 0 ? (
                <p className="text-[11px] text-slate-500">None — this is simply the shortest mapped route.</p>
              ) : (
                <ul className="space-y-0.5">
                  {alt.excluded.map((x) => (
                    <li key={x.id} className="flex items-center gap-2 text-[11px] text-slate-300">
                      <Badge tone={IMPACT_TONE[x.state]}>{x.state === "none" ? "no indicator" : IMPACT_LABEL[x.state]}</Badge>
                      <span className="min-w-0 flex-1 truncate">{x.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {alt.found && alt.alternative ? (
              <>
                <div className="rounded-md border border-line bg-ink-850 p-2.5 text-[11.5px] text-slate-300">
                  <span className="font-semibold text-ok">An alternative mapped path was found.</span>{" "}
                  {alt.unchanged ? "It is the same as the original route — none of the excluded segments were needed." : `${svc(alt.alternative.service)}, ${alt.alternative.km.toFixed(1)} km${alt.extraKm !== null && alt.baseline ? ` (original ${alt.baseline.km.toFixed(1)} km, ${alt.extraKm >= 0 ? "+" : ""}${alt.extraKm} km)` : " (no route existed originally)"}.`}
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Route segments in order</div>
                  <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-slate-300">
                    {alt.routeSegments.map((x) => (
                      <li key={x.id}>
                        {x.name}
                        {x.state !== "none" && <span className="ml-1 text-warn">· {x.state === "blocked" ? "likely inundated" : "possible disruption"}</span>}
                      </li>
                    ))}
                  </ol>
                </div>
                {alt.flaggedOnRoute.length > 0 && (
                  <Notice tone="warn" icon={<TriangleAlert className="size-3.5" />}>
                    {alt.flaggedOnRoute.length} segment{alt.flaggedOnRoute.length > 1 ? "s" : ""} on this route still carry a flood or debris indicator (not excluded). Treat the route as uncertain.
                  </Notice>
                )}
              </>
            ) : (
              <Notice tone="crit" icon={<TriangleAlert className="size-3.5" />} title="No alternative mapped path found">
                After excluding the segments above, no road in the mapped network connects {alt.settlementName} to {alt.target === "hospital" ? "the hospital" : "a town or the hospital"}. Unmapped tracks, footpaths and ferries are not modeled, so other access may exist.
              </Notice>
            )}
            <p className="text-[10.5px] leading-snug text-slate-500">A calculated route is not guaranteed passable or safe. Verify with local contacts, UAV or field teams before use.</p>
            <button onClick={() => pick({ kind: "settlement", id: alt.settlementId })} className={cn(btnCls.base, btnCls.outline, btnCls.sm)}>
              Locate settlement on map
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
