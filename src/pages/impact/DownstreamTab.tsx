import { Droplets, Info, MapPin, MousePointerClick, TriangleAlert, X } from "lucide-react";
import { MAX_SNAP_KM, type DownstreamHit } from "../../analysis/downstream";
import { TERRAIN } from "../../analysis/terrain";
import { Badge, EmptyState, Notice } from "../../components/ui";
import { useApp } from "../../state/store";
import { cn } from "../../utils/cn";

const TYPE_LABEL: Record<DownstreamHit["type"], string> = { settlement: "Settlement", road: "Road", bridge: "Bridge", facility: "Facility" };

export function DownstreamTab() {
  const { results, downstream, setDownstreamWidth, clearDownstream, pick } = useApp();
  const res = downstream.result;

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-3 p-3">
        <Notice tone="warn" icon={<TriangleAlert className="size-3.5" />} title="Terrain-guided estimate — not a flood simulation">
          This explorer sketches a possible corridor downstream of a chosen point. It is <span className="font-medium text-slate-100">not a physically validated model</span>: it does not simulate water volume, depth, timing or breaches, and must not be used to predict flooding.
        </Notice>

        <section className="space-y-2 rounded-lg border border-line bg-white p-3">
          <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">1 · Choose an upstream point</h3>
          <div className="flex items-start gap-2 text-[11.5px] text-slate-300">
            <MousePointerClick className="mt-0.5 size-3.5 shrink-0 text-water" />
            <span>
              Click the map near a river or stream. The point snaps to the nearest mapped channel if it is within {MAX_SNAP_KM * 1000} m.
            </span>
          </div>
          {downstream.start ? (
            <div className="flex items-center gap-2 rounded border border-line bg-ink-850 px-2 py-1.5 text-[11.5px]">
              <MapPin className="size-3.5 text-water" />
              <span className="min-w-0 flex-1 font-mono text-[11px] text-slate-300">
                {downstream.start[0].toFixed(4)}°N, {downstream.start[1].toFixed(4)}°E
              </span>
              <button onClick={clearDownstream} className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-100" aria-label="Clear starting point">
                <X className="size-3" /> Clear
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">No starting point selected yet.</p>
          )}
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-300">
              2 · Corridor half-width <span className="font-mono text-slate-500">±{downstream.halfWidthM} m</span>
            </span>
            <input type="range" min={100} max={600} step={50} value={downstream.halfWidthM} onChange={(e) => setDownstreamWidth(Number(e.target.value))} className="h-1 w-full cursor-pointer" aria-label="Corridor half-width in metres" />
            <span className="mt-1 block text-[10.5px] leading-snug text-slate-500">A fixed, user-chosen buffer around the channel — not computed from hydraulics.</span>
          </label>
        </section>

        {!results ? (
          <EmptyState icon={<Droplets className="size-5" />} title="No analysis results">
            Run the flood analysis first so exposed assets can be listed.
          </EmptyState>
        ) : !res ? (
          <EmptyState icon={<Droplets className="size-5" />} title="No corridor yet">
            Click the map to choose a starting point.
          </EmptyState>
        ) : res.status !== "ok" ? (
          <Notice tone="warn" icon={<Info className="size-3.5" />} title="No corridor drawn">
            {res.message}
          </Notice>
        ) : (
          <>
            <section className="space-y-2 rounded-lg border border-line bg-white p-3">
              <div className="flex items-center gap-1.5">
                <h3 className="mr-auto text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">Estimated downstream corridor</h3>
                <Badge tone="neutral">ESTIMATE</Badge>
              </div>
              <p className="text-[11.5px] leading-snug text-slate-300">{res.message}</p>
              <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1 text-[11.5px]">
                <dt className="text-slate-500">Snapped to</dt>
                <dd className="text-slate-300">
                  {res.snapped?.channel} ({res.snapped?.distM} m from the point)
                </dd>
                <dt className="text-slate-500">Path length</dt>
                <dd className="font-mono text-slate-300">{res.lengthKm} km</dd>
                <dt className="text-slate-500">Elevation</dt>
                <dd className="font-mono text-slate-300">
                  {res.startElevM} m → {res.endElevM ?? "—"} m <span className="font-sans text-[10px] text-slate-500">(sample attribute)</span>
                </dd>
                <dt className="text-slate-500">Corridor width</dt>
                <dd className="font-mono text-slate-300">±{res.halfWidthM} m</dd>
              </dl>
            </section>

            <section className="space-y-1.5 rounded-lg border border-line bg-white p-3">
              <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">Potentially exposed within the corridor</h3>
              {res.hits.length === 0 ? (
                <p className="text-[11.5px] text-slate-500">No mapped settlement, road, bridge or facility lies inside the estimated corridor.</p>
              ) : (
                <ul className="space-y-1">
                  {res.hits.map((h) => (
                    <li key={`${h.type}-${h.id}`}>
                      <button onClick={() => pick(h.selection)} className="flex w-full items-center gap-2 rounded border border-line bg-white px-2 py-1 text-left transition hover:border-slate-500">
                        <Badge>{TYPE_LABEL[h.type]}</Badge>
                        <span className="min-w-0 flex-1 truncate text-[11.5px] text-slate-200">{h.name}</span>
                        <span className="font-mono text-[10px] text-slate-500">{h.alongKm.toFixed(1)} km · {h.offsetM} m off</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[10.5px] text-slate-500">
                Also inside the corridor: {res.buildingsInCorridor} mapped building{res.buildingsInCorridor === 1 ? "" : "s"}. “Along” = distance from the starting point; “off” = offset from the channel. Being inside the corridor is exposure to a <em>possible</em> path, not a prediction of flooding.
              </p>
            </section>
          </>
        )}

        <section className="space-y-1.5 rounded-lg border border-line bg-ink-850 p-3 text-[11px] leading-snug text-slate-400">
          <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">Terrain data &amp; method</h3>
          <p>
            <span className="font-medium text-slate-300">Terrain source:</span> {TERRAIN.source}.{" "}
            {!TERRAIN.demLoaded && <Badge tone="warn">DEM not loaded</Badge>}
          </p>
          <ol className="list-decimal space-y-0.5 pl-4">
            <li>Snap the chosen point to the nearest mapped (pre-event OSM) channel.</li>
            <li>Follow the channel in the direction of decreasing elevation, continuing into the receiving channel at confluences.</li>
            <li>Buffer the path by the chosen half-width and list mapped assets inside it.</li>
          </ol>
          <p className={cn("text-slate-500")}>Limitations: no flow accumulation, no depth or timing, no culverts or breaches, uniform buffer width, and elevation attributes are placeholders in this build. No path is drawn when no channel is nearby.</p>
        </section>
      </div>
    </div>
  );
}
