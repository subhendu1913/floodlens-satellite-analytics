import { Fragment, memo, useMemo } from "react";
import L from "leaflet";
import { CircleMarker, Marker, Pane, Polygon, Polyline, Tooltip } from "react-leaflet";
import { hasAlternativeRoute } from "../../analysis/explain";
import type { DownstreamResult } from "../../analysis/downstream";
import type { SimResult } from "../../analysis/simulate";
import type { AltResult } from "../../analysis/altroutes";
import { ACCESS_LABEL, BUILDING_LABEL, CRITICAL_LABEL, IMPACT_LABEL, isCriticalKind } from "../../lib/format";
import type { AccessStatus, AnalysisResults, BuildingState, LayerState, LL, RoadFeature, Selection } from "../../types";

export type Phase = "before" | "after";

export interface MapOverlay {
  alt?: AltResult | null;
  sim?: SimResult | null;
  downstream?: { result: DownstreamResult | null; start: LL | null } | null;
}

interface Props {
  results: AnalysisResults;
  phase: Phase;
  layers: LayerState;
  opacity: number;
  affectedOnly: boolean;
  selected: Selection | null;
  onSelect: (s: Selection) => void;
  overlay?: MapOverlay;
}

/** Semantic map colours: floodwater cyan, red = severe, amber = uncertainty, green = maintained access. */
const COLORS = {
  crit: "#DC2626",
  warn: "#D97706",
  water: "#0891B2",
  ok: "#16A34A",
  brand: "#2563EB",
  base: "#F8FAFC",
  ink: "#0F172A",
};

const iconCache = new Map<string, L.DivIcon>();

function settlementIcon(status: AccessStatus | null, selected: boolean): L.DivIcon {
  const key = `s-${status}-${selected}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const color = status === null ? "#F8FAFC" : status === "disconnected" ? COLORS.crit : status === "suspected" ? COLORS.warn : COLORS.ok;
  const pulse = status === "disconnected" ? `<span class="fl-pulse" style="background:${color}55"></span>` : "";
  const ring = selected ? `0 0 0 3px ${COLORS.brand}` : "0 0 0 1px rgba(255,255,255,.9)";
  const icon = L.divIcon({
    className: "fl-marker",
    html: `<div style="position:relative;width:20px;height:20px">${pulse}<div style="position:absolute;inset:3px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:${ring},0 1px 3px rgba(15,23,42,.5)"></div></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
  iconCache.set(key, icon);
  return icon;
}

function serviceIcon(kind: "town" | "hospital", selected: boolean): L.DivIcon {
  const key = `v-${kind}-${selected}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const ring = selected ? `0 0 0 3px ${COLORS.brand}` : "0 1px 3px rgba(15,23,42,.55)";
  const html =
    kind === "hospital"
      ? `<div style="width:22px;height:22px;border-radius:5px;background:#fff;border:2px solid ${COLORS.ink};box-shadow:${ring};display:flex;align-items:center;justify-content:center"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M4.5 1h3v3.5H11v3H7.5V11h-3V7.5H1v-3h3.5z" fill="${COLORS.crit}"/></svg></div>`
      : `<div style="width:14px;height:14px;transform:rotate(45deg);background:#fff;border:2px solid ${COLORS.ink};box-shadow:${ring};margin:4px"></div>`;
  const icon = L.divIcon({ className: "fl-marker", html, iconSize: [22, 22], iconAnchor: [11, 11] });
  iconCache.set(key, icon);
  return icon;
}

function criticalIcon(kind: string, state: BuildingState, selected: boolean): L.DivIcon {
  const key = `c-${kind}-${state}-${selected}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const color = state === "likely" ? COLORS.crit : state === "possible" ? COLORS.warn : COLORS.ink;
  const ring = selected ? `0 0 0 3px ${COLORS.brand}` : "0 1px 3px rgba(15,23,42,.5)";
  const icon = L.divIcon({
    className: "fl-marker",
    html: `<div style="width:16px;height:16px;border-radius:3px;background:#fff;border:2px solid ${color};box-shadow:${ring};color:${color};font:700 9px/12px sans-serif;text-align:center">${kind === "school" ? "S" : "P"}</div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
  iconCache.set(key, icon);
  return icon;
}

const roadWeight = { primary: 3.4, secondary: 2.6, track: 1.9 } as const;

function FeatureLayersImpl({ results, phase, layers, opacity, affectedOnly, selected, onSelect, overlay, onPick }: Props & { onPick?: (lat: number, lng: number) => void }) {
  const after = phase === "after";

  // In point-picking mode (Downstream Explorer) every click picks a location, even on top of a feature.
  const clickers = useMemo(
    () => (kind: Selection["kind"], id: string) => ({
      click: (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e.originalEvent);
        if (onPick) onPick(e.latlng.lat, e.latlng.lng);
        else onSelect({ kind, id });
      },
    }),
    [onSelect, onPick],
  );

  const selectedEdgeIds = useMemo(() => {
    if (!selected) return new Set<string>();
    if (selected.kind === "edge") return new Set([selected.id]);
    if (selected.kind === "group") return new Set(results.groups.find((g) => g.id === selected.id)?.edgeIds ?? []);
    if (selected.kind === "settlement") return new Set(results.settlements.find((s) => s.id === selected.id)?.disrupted.map((d) => d.edgeId) ?? []);
    return new Set<string>();
  }, [selected, results.groups, results.settlements]);

  // Best-case post-event route of the selected settlement — drawn only when the road network supports one.
  const routeEdges = useMemo(() => {
    if (!after || selected?.kind !== "settlement") return [] as RoadFeature[];
    const s = results.settlements.find((x) => x.id === selected.id);
    if (!s || !hasAlternativeRoute(s)) return [] as RoadFeature[];
    return s.postEdges.map((id) => results.roads.find((x) => x.id === id)).filter(Boolean) as RoadFeature[];
  }, [after, selected, results.settlements, results.roads]);

  const isSel = (kind: Selection["kind"], id: string) => !!selected && selected.kind === kind && selected.id === id;
  const roadById = useMemo(() => new Map(results.roads.map((e) => [e.id, e])), [results.roads]);

  const renderRoad = (r: RoadFeature) => {
    const state = after ? r.impact.state : "none";
    const sel = selectedEdgeIds.has(r.id);
    const color = state === "blocked" ? COLORS.crit : state === "suspected" ? COLORS.warn : r.isBridge ? "#FFFFFF" : COLORS.base;
    const w = (r.isBridge ? 6 : roadWeight[r.cls]) + (state === "blocked" ? 1 : 0);
    const dash = state === "suspected" ? "7 5" : !r.isBridge && r.cls === "track" && state === "none" ? "1 4" : undefined;
    const tip = `${r.isBridge ? "Bridge · " : ""}${r.name}${after ? ` — ${IMPACT_LABEL[r.impact.state]}` : ""}`;
    return (
      <Fragment key={r.id}>
        {sel && <Polyline positions={r.coords} pathOptions={{ color: COLORS.brand, weight: w + 8, opacity: 0.9, lineCap: "round" }} interactive={false} />}
        <Polyline positions={r.coords} pathOptions={{ color: COLORS.ink, weight: w + (r.isBridge ? 5 : 2.5), opacity: 0.75, lineCap: r.isBridge ? "butt" : "round" }} interactive={false} />
        <Polyline positions={r.coords} pathOptions={{ color, weight: w, opacity: r.cls === "track" && state === "none" ? 0.8 : 1, dashArray: dash, lineCap: r.isBridge ? "butt" : "round" }} interactive={false} />
        <Polyline positions={r.coords} pathOptions={{ color: "#000", weight: 16, opacity: 0, bubblingMouseEvents: false }} eventHandlers={clickers("edge", r.id)}>
          <Tooltip sticky className="fl-tip">
            {tip}
          </Tooltip>
        </Polyline>
      </Fragment>
    );
  };

  const keep = (r: RoadFeature) => !(after && affectedOnly && r.impact.state === "none");
  const roads = layers.roads ? results.roads.filter((r) => !r.isBridge && keep(r)) : [];
  const bridges = layers.bridges ? results.roads.filter((r) => r.isBridge && keep(r)) : [];

  const sim = after ? overlay?.sim : null;
  const ds = after ? overlay?.downstream : null;
  const simAlt = useMemo(() => {
    if (!sim) return [] as RoadFeature[];
    const ids = new Set(sim.items.flatMap((i) => i.altEdges));
    return [...ids].map((id) => roadById.get(id)).filter(Boolean) as RoadFeature[];
  }, [sim, roadById]);
  const dsEdges = useMemo(() => (ds?.result ? ds.result.hits.filter((h) => h.type === "road" || h.type === "bridge").map((h) => roadById.get(h.id)).filter(Boolean) as RoadFeature[] : []), [ds, roadById]);
  const dsRings = useMemo(() => {
    if (!ds?.result) return [] as { id: string; pos: LL; name: string }[];
    const out: { id: string; pos: LL; name: string }[] = [];
    for (const h of ds.result.hits) {
      const pos = h.type === "settlement" ? results.settlements.find((s) => s.id === h.id)?.pos : h.type === "facility" ? (results.services.find((s) => s.id === h.id)?.pos ?? results.buildings.find((b) => b.id === h.id)?.pos) : undefined;
      if (pos) out.push({ id: h.id, pos, name: h.name });
    }
    return out;
  }, [ds, results.settlements, results.services, results.buildings]);

  const simRingColor = { lost: COLORS.crit, "hospital-lost": COLORS.warn, detour: COLORS.brand, unchanged: "", already: "" } as const;
  const simRingLabel = { lost: "loses every modeled route", "hospital-lost": "loses its hospital route", detour: "rerouted", unchanged: "", already: "" } as const;

  return (
    <>
      <Pane name="fl-water" style={{ zIndex: 405 }}>
        {after &&
          results.flood
            .filter((f) => (f.kind === "water" ? layers.flood : layers.uncertain))
            .map((f) => (
              <Polygon
                key={f.id}
                positions={f.hole ? [f.ring, f.hole] : f.ring}
                pathOptions={
                  f.kind === "water"
                    ? { color: COLORS.water, weight: isSel("flood", f.id) ? 3 : 1, fillColor: COLORS.water, fillOpacity: opacity * 0.62, opacity: Math.min(1, opacity + 0.2), bubblingMouseEvents: false }
                    : { color: COLORS.water, weight: isSel("flood", f.id) ? 3 : 1, dashArray: "5 4", fillColor: COLORS.water, fillOpacity: opacity * 0.2, opacity: Math.min(1, opacity + 0.2), bubblingMouseEvents: false }
                }
                eventHandlers={clickers("flood", f.id)}
              >
                <Tooltip sticky className="fl-tip">
                  {f.kind === "water" ? "Detected floodwater" : "Uncertain water signal"} · evidence {Math.round(f.confidence * 100)}%
                </Tooltip>
              </Polygon>
            ))}
        {after &&
          layers.uncertain &&
          results.gaps.map((g) => (
            <Polygon
              key={g.id}
              positions={g.ring}
              pathOptions={{ color: "#F8FAFC", weight: isSel("gap", g.id) ? 3 : 1, dashArray: "2 6", fillColor: "#F8FAFC", fillOpacity: opacity * (g.active ? 0.3 : 0.12), opacity: 0.8, bubblingMouseEvents: false }}
              eventHandlers={clickers("gap", g.id)}
            >
              <Tooltip sticky className="fl-tip">
                {g.active ? "Cloud / shadow — not assessable" : "Cloud / shadow — radar fills gap"}
              </Tooltip>
            </Polygon>
          ))}
      </Pane>

      <Pane name="fl-debris" style={{ zIndex: 408 }}>
        {after &&
          layers.debris &&
          results.debris.map((d) => (
            <Polygon
              key={d.id}
              positions={d.ring}
              pathOptions={
                d.kind === "suspected"
                  ? { color: COLORS.warn, weight: isSel("debris", d.id) ? 3 : 1.5, fillColor: COLORS.warn, fillOpacity: opacity * 0.6, bubblingMouseEvents: false }
                  : { color: COLORS.warn, weight: isSel("debris", d.id) ? 3 : 1.2, dashArray: "4 3", fillColor: COLORS.warn, fillOpacity: opacity * 0.2, bubblingMouseEvents: false }
              }
              eventHandlers={clickers("debris", d.id)}
            >
              <Tooltip sticky className="fl-tip">
                {d.kind === "suspected" ? "Suspected debris" : "Uncertain debris indicator"} · evidence {Math.round(d.confidence * 100)}%
              </Tooltip>
            </Polygon>
          ))}
      </Pane>

      <Pane name="fl-rivers" style={{ zIndex: 412 }}>
        {layers.rivers &&
          results.waterways.map((w) => <Polygon key={`p-${w.id}`} positions={w.permanent} pathOptions={{ color: "#38BDF8", weight: 0.5, fillColor: "#0EA5E9", fillOpacity: 0.5, opacity: 0.6 }} interactive={false} />)}
        {layers.rivers &&
          results.waterways.map((w) => (
            <Polyline key={`l-${w.id}`} positions={w.line} pathOptions={{ color: "#7DD3FC", weight: w.kind === "river" ? 1.6 : 1.1, opacity: 0.9, dashArray: w.kind === "stream" ? "2 4" : undefined }} interactive={false} />
          ))}
      </Pane>

      <Pane name="fl-roads" style={{ zIndex: 420 }}>
        {roads.map(renderRoad)}
      </Pane>
      <Pane name="fl-bridges" style={{ zIndex: 428 }}>
        {bridges.map(renderRoad)}
      </Pane>

      <Pane name="fl-route" style={{ zIndex: 430 }}>
        {routeEdges.map((e) => (
          <Fragment key={e.id}>
            <Polyline positions={e.coords} pathOptions={{ color: "#FFFFFF", weight: 10, opacity: 0.9, lineCap: "round" }} interactive={false} />
            <Polyline positions={e.coords} pathOptions={{ color: COLORS.brand, weight: 5, opacity: 0.95, lineCap: "round" }} interactive={false}>
              <Tooltip sticky className="fl-tip">
                Best-case modeled route
              </Tooltip>
            </Polyline>
          </Fragment>
        ))}
      </Pane>

      <Pane name="fl-buildings" style={{ zIndex: 432 }}>
        {layers.buildings &&
          results.buildings
            .filter((b) => !isCriticalKind(b.kind) && !(after && affectedOnly && b.state === "none"))
            .map((b) => {
              const st = after ? b.state : "none";
              const sel = isSel("building", b.id);
              const fill = st === "likely" ? COLORS.crit : st === "possible" ? COLORS.warn : st === "unassessed" ? "#64748B" : "#E2E8F0";
              return (
                <CircleMarker
                  key={b.id}
                  center={b.pos}
                  radius={sel ? 6 : st === "likely" || st === "possible" ? 3.6 : 3}
                  pathOptions={{ color: sel ? COLORS.brand : COLORS.ink, weight: sel ? 2.5 : 0.8, fillColor: fill, fillOpacity: st === "none" ? 0.8 : 0.95, dashArray: st === "unassessed" ? "2 2" : undefined, bubblingMouseEvents: false }}
                  eventHandlers={clickers("building", b.id)}
                >
                  <Tooltip className="fl-tip" direction="top">
                    Building {b.id} · {after ? BUILDING_LABEL[b.state] : "pre-event footprint"}
                  </Tooltip>
                </CircleMarker>
              );
            })}
      </Pane>

      {/* Hypothetical simulation overlay (clearly not an observed event) */}
      {sim && (
        <Pane name="fl-sim" style={{ zIndex: 436 }}>
          {simAlt.map((e) => (
            <Fragment key={e.id}>
              <Polyline positions={e.coords} pathOptions={{ color: "#FFFFFF", weight: 9, opacity: 0.85, lineCap: "round" }} interactive={false} />
              <Polyline positions={e.coords} pathOptions={{ color: COLORS.brand, weight: 5, dashArray: "9 6", opacity: 1, lineCap: "butt" }} interactive={false}>
                <Tooltip sticky className="fl-tip">
                  HYPOTHETICAL alternative mapped route
                </Tooltip>
              </Polyline>
            </Fragment>
          ))}
          {sim.removedGeometry.map((g, i) => (
            <Fragment key={`rm-${i}`}>
              <Polyline positions={g} pathOptions={{ color: COLORS.ink, weight: 11, opacity: 0.95, lineCap: "butt" }} interactive={false} />
              <Polyline positions={g} pathOptions={{ color: "#FFFFFF", weight: 3, dashArray: "4 8", opacity: 1 }} interactive={false}>
                <Tooltip sticky className="fl-tip">
                  HYPOTHETICAL — connection removed
                </Tooltip>
              </Polyline>
            </Fragment>
          ))}
          {sim.items
            .filter((i) => i.category === "lost" || i.category === "hospital-lost" || i.category === "detour")
            .map((i) => {
              const s = results.settlements.find((x) => x.id === i.id);
              if (!s) return null;
              return (
                <CircleMarker key={`ring-${i.id}`} center={s.pos} radius={16} pathOptions={{ color: simRingColor[i.category], weight: 2.5, dashArray: "3 4", fill: false, bubblingMouseEvents: false }} eventHandlers={clickers("settlement", i.id)}>
                  <Tooltip className="fl-tip" direction="top" offset={[0, -14]}>
                    HYPOTHETICAL · {i.name} {simRingLabel[i.category]}
                  </Tooltip>
                </CircleMarker>
              );
            })}
        </Pane>
      )}

      {/* Alternative-route overlay (hypothetical — a modeled path, never verified) */}
      {after && overlay?.alt && (
        <Pane name="fl-alt" style={{ zIndex: 438 }}>
          {overlay.alt.excluded.map((x) => {
            const e = roadById.get(x.id);
            return e ? (
              <Fragment key={`ax-${x.id}`}>
                <Polyline positions={e.coords} pathOptions={{ color: COLORS.ink, weight: 11, opacity: 0.95, lineCap: "butt" }} interactive={false} />
                <Polyline positions={e.coords} pathOptions={{ color: "#FFFFFF", weight: 3, dashArray: "4 8", opacity: 1 }} interactive={false} />
              </Fragment>
            ) : null;
          })}
          {overlay.alt.routeSegments.map((x) => {
            const e = roadById.get(x.id);
            return e ? (
              <Fragment key={`ar-${x.id}`}>
                <Polyline positions={e.coords} pathOptions={{ color: "#FFFFFF", weight: 11, opacity: 0.95, lineCap: "round" }} interactive={false} />
                <Polyline positions={e.coords} pathOptions={{ color: COLORS.brand, weight: 6, opacity: 1, lineCap: "round" }} interactive={false} />
              </Fragment>
            ) : null;
          })}
          {(() => {
            const s = results.settlements.find((x) => x.id === overlay.alt!.settlementId);
            return s ? <CircleMarker center={s.pos} radius={17} pathOptions={{ color: COLORS.brand, weight: 3, dashArray: "3 4", fill: false, interactive: false }} /> : null;
          })()}
        </Pane>
      )}

      {/* Terrain-guided downstream estimate */}
      {ds?.result && ds.result.status === "ok" && (
        <Pane name="fl-downstream" style={{ zIndex: 410 }}>
          <Polygon positions={ds.result.corridor} pathOptions={{ color: COLORS.ink, weight: 1.5, dashArray: "6 4", fillColor: COLORS.ink, fillOpacity: 0.12, interactive: false }}>
            <Tooltip sticky className="fl-tip">
              Terrain-guided corridor ESTIMATE (±{ds.result.halfWidthM} m) — not a flood simulation
            </Tooltip>
          </Polygon>
          <Polyline positions={ds.result.path} pathOptions={{ color: COLORS.ink, weight: 2.5, dashArray: "1 6", lineCap: "round", interactive: false }} />
          {dsEdges.map((e) => (
            <Polyline key={`dse-${e.id}`} positions={e.coords} pathOptions={{ color: COLORS.ink, weight: 13, opacity: 0.3, lineCap: "round", interactive: false }} />
          ))}
          {dsRings.map((x) => (
            <CircleMarker key={`dsr-${x.id}`} center={x.pos} radius={14} pathOptions={{ color: COLORS.ink, weight: 2, dashArray: "3 3", fill: false, interactive: false }} />
          ))}
        </Pane>
      )}
      {ds?.start && (
        <Pane name="fl-dsstart" style={{ zIndex: 437 }}>
          <CircleMarker center={ds.start} radius={7} pathOptions={{ color: "#FFFFFF", weight: 2.5, fillColor: COLORS.brand, fillOpacity: 1, interactive: false }}>
            <Tooltip permanent direction="top" offset={[0, -8]} className="fl-label">
              Starting point
            </Tooltip>
          </CircleMarker>
          {ds.result?.snapped && <CircleMarker center={ds.result.snapped.pt} radius={4} pathOptions={{ color: COLORS.ink, weight: 1.5, fillColor: "#FFFFFF", fillOpacity: 1, interactive: false }} />}
        </Pane>
      )}

      {layers.services &&
        results.buildings
          .filter((b) => isCriticalKind(b.kind) && !(after && affectedOnly && b.state === "none"))
          .map((b) => (
            <Marker key={b.id} position={b.pos} icon={criticalIcon(b.kind, after ? b.state : "none", isSel("building", b.id))} eventHandlers={clickers("building", b.id)} zIndexOffset={150}>
              <Tooltip className="fl-tip" direction="top">
                {CRITICAL_LABEL[b.kind]} {b.id} · {after ? BUILDING_LABEL[b.state] : "pre-event footprint"}
              </Tooltip>
            </Marker>
          ))}

      {layers.services &&
        results.services.map((s) => (
          <Marker key={s.id} position={s.pos} icon={serviceIcon(s.kind, isSel("service", s.id))} eventHandlers={clickers("service", s.id)} zIndexOffset={200}>
            <Tooltip permanent direction="right" offset={[12, 0]} className="fl-label">
              {s.name}
            </Tooltip>
          </Marker>
        ))}

      {layers.settlements &&
        results.settlements.map((s) => (
          <Marker key={s.id} position={s.pos} icon={settlementIcon(after ? s.status : null, isSel("settlement", s.id))} eventHandlers={clickers("settlement", s.id)} zIndexOffset={400}>
            <Tooltip permanent direction="right" offset={[10, 0]} className="fl-label">
              {s.name}
              {after && s.status !== "connected" ? ` · ${ACCESS_LABEL[s.status]}` : ""}
            </Tooltip>
          </Marker>
        ))}
    </>
  );
}

export const FeatureLayers = memo(FeatureLayersImpl);
