import { computeChokepoints } from "../analysis/chokepoints";
import { SCENARIO } from "../data/scenario";
import type { AnalysisResults, LL } from "../types";

export type GeoKind = "flood" | "assets" | "settlements" | "critical";
export const GEO_LABEL: Record<GeoKind, string> = {
  flood: "Floodwater, debris & uncertain areas (polygons)",
  assets: "Roads, bridges, buildings & facilities",
  settlements: "Settlements with modeled access status",
  critical: "Critical connections (lines)",
};

type Pos = [number, number];
const lonlat = (p: LL): Pos => [p[1], p[0]];
const closed = (ring: LL[]): Pos[] => {
  const c = ring.map(lonlat);
  return c.length && (c[0][0] !== c[c.length - 1][0] || c[0][1] !== c[c.length - 1][1]) ? [...c, c[0]] : c;
};

interface Feature {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}

export function buildGeoJson(kind: GeoKind, r: AnalysisResults): { name: string; text: string } {
  const common = { data_class: "DEMO_SAMPLE_DATA", analysis_id: r.id, osm_snapshot: SCENARIO.osmSnapshotDate };
  const features: Feature[] = [];
  const f = (geometry: Feature["geometry"], properties: Record<string, unknown>) => features.push({ type: "Feature", geometry, properties: { ...properties, ...common } });

  if (kind === "flood") {
    for (const w of r.flood) f({ type: "Polygon", coordinates: w.hole ? [closed(w.ring), closed(w.hole)] : [closed(w.ring)] }, { layer: "water", class: w.kind, part: w.part, evidence_score: w.confidence, area_km2: +w.areaKm2.toFixed(4), waterway: w.waterway });
    for (const d of r.debris) f({ type: "Polygon", coordinates: [closed(d.ring)] }, { layer: "debris", class: d.kind, evidence_score: d.confidence, name: d.name, area_km2: +d.areaKm2.toFixed(4) });
    for (const g of r.gaps) f({ type: "Polygon", coordinates: [closed(g.ring)] }, { layer: "data_gap", name: g.name, assessable: !g.active });
  } else if (kind === "assets") {
    for (const e of r.roads) f({ type: "LineString", coordinates: e.coords.map(lonlat) }, { id: e.id, name: e.name, type: e.isBridge ? "bridge" : "road", osm: e.osmTag, potential_exposure: e.impact.state, evidence_score: e.impact.state === "none" ? null : e.impact.confidence });
    for (const b of r.buildings) f({ type: "Point", coordinates: lonlat(b.pos) }, { id: b.id, type: "building", kind: b.kind, potential_exposure: b.state, evidence_score: b.state === "likely" || b.state === "possible" ? b.confidence : null });
    for (const s of r.services) f({ type: "Point", coordinates: lonlat(s.pos) }, { id: s.id, name: s.name, type: s.kind });
  } else if (kind === "settlements") {
    for (const s of r.settlements) f({ type: "Point", coordinates: lonlat(s.pos) }, { id: s.id, name: s.name, modeled_access_status: s.status, hospital_access: s.hospital.status, nearest_service: s.post?.service ?? null, flagged_segments: s.disrupted.map((d) => d.name) });
  } else {
    for (const c of computeChokepoints(r))
      for (const id of c.edgeIds) {
        const e = r.roads.find((x) => x.id === id);
        if (e) f({ type: "LineString", coordinates: e.coords.map(lonlat) }, { connection: c.id, name: c.name, segment: id, isolates_if_lost: c.isolates.map((x) => x.name), hospital_lost_if_lost: c.hospitalLost.map((x) => x.name), flood_exposure: c.exposure, scenario: "HYPOTHETICAL_structural" });
      }
  }
  return { name: `floodlens_${kind}_${r.params.eventDate}.geojson`, text: JSON.stringify({ type: "FeatureCollection", name: `FloodLens ${kind} (DEMO SAMPLE DATA)`, features }, null, 1) };
}
