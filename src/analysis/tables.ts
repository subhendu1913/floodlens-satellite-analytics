import { inPoly, makePoly, toKm } from "../lib/geo";
import { BUILDING_LABEL, CRITICAL_LABEL, IMPACT_LABEL, isCriticalKind, type Tone } from "../lib/format";
import type { AnalysisResults, BuildingState, ImpactState, LL, Pt, Selection } from "../types";

export type InfraType = "building" | "road" | "bridge" | "facility";
export type Exposure = "likely" | "possible" | "unassessed" | "none";

export interface InfraRow {
  key: string;
  id: string;
  name: string;
  type: InfraType;
  typeLabel: string;
  loc: LL;
  exposure: Exposure;
  exposureLabel: string;
  evidence: string;
  confidence: number | null;
  selection: Selection;
  area?: string;
}

export const EXPOSURE_RANK: Record<Exposure, number> = { likely: 0, possible: 1, unassessed: 2, none: 3 };
export const EXPOSURE_TONE: Record<Exposure, Tone> = { likely: "crit", possible: "warn", unassessed: "neutral", none: "neutral" };

const fromImpact = (s: ImpactState): Exposure => (s === "blocked" ? "likely" : s === "suspected" ? "possible" : "none");
const fromBuilding = (s: BuildingState): Exposure => (s === "none" ? "none" : s);

export function exposureLabel(type: InfraType, e: Exposure): string {
  if (type === "road" || type === "bridge") return e === "likely" ? IMPACT_LABEL.blocked : e === "possible" ? IMPACT_LABEL.suspected : e === "unassessed" ? "Not assessable (cloud)" : IMPACT_LABEL.none;
  return e === "likely" ? BUILDING_LABEL.likely : e === "possible" ? BUILDING_LABEL.possible : e === "unassessed" ? BUILDING_LABEL.unassessed : BUILDING_LABEL.none;
}

/* ------------------------- facility (town / hospital) exposure ------------------------- */

export interface ServiceExposure {
  state: Exposure;
  confidence: number | null;
  evidence: string;
}

function distPtSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

const svcCache = new WeakMap<AnalysisResults, Map<string, ServiceExposure>>();

/** Exposure of the routing destinations (towns, hospital) to mapped water, derived from the flood polygons. */
export function serviceExposure(r: AnalysisResults): Map<string, ServiceExposure> {
  const hit = svcCache.get(r);
  if (hit) return hit;
  const polys = r.flood.filter((f) => f.part === "core").map((f) => {
    const ring = f.ring.map(toKm);
    return { f, ring, poly: makePoly(ring) };
  });
  const out = new Map<string, ServiceExposure>();
  for (const s of r.services) {
    const p = toKm(s.pos);
    let best: ServiceExposure | null = null;
    let minD = Infinity;
    let nearest: (typeof polys)[number] | null = null;
    for (const q of polys) {
      if (inPoly(p, q.poly)) {
        best = {
          state: q.f.kind === "water" ? "likely" : "possible",
          confidence: q.f.confidence,
          evidence: q.f.kind === "water" ? "Location lies inside high-confidence detected water." : "Location lies inside an uncertain water signal.",
        };
        break;
      }
      for (let i = 0; i < q.ring.length; i++) {
        const d = distPtSeg(p, q.ring[i], q.ring[(i + 1) % q.ring.length]);
        if (d < minD) {
          minD = d;
          nearest = q;
        }
      }
    }
    if (!best) {
      best =
        nearest && minD <= 0.3
          ? { state: "possible", confidence: nearest.f.confidence, evidence: `≈${Math.round(minD * 1000)} m from ${nearest.f.kind === "water" ? "detected" : "uncertain"} water — access roads may be affected.` }
          : { state: "none", confidence: null, evidence: nearest ? `Nearest mapped water is ≈${Math.round(minD * 1000)} m away.` : "No mapped water in the analysis area." };
    }
    out.set(s.id, best);
  }
  svcCache.set(r, out);
  return out;
}

/* ------------------------- unified infrastructure rows ------------------------- */

const rowsCache = new WeakMap<AnalysisResults, InfraRow[]>();

export function buildInfraRows(r: AnalysisResults): InfraRow[] {
  const hit = rowsCache.get(r);
  if (hit) return hit;
  const rows: InfraRow[] = [];
  const area = (id: string) => r.settlements.find((s) => s.id === id)?.name ?? r.services.find((s) => s.id === id)?.name;

  for (const e of r.roads) {
    const exp = fromImpact(e.impact.state);
    const type: InfraType = e.isBridge ? "bridge" : "road";
    rows.push({
      key: `e-${e.id}`,
      id: e.id,
      name: e.name,
      type,
      typeLabel: e.isBridge ? "Bridge" : `Road (${e.cls})`,
      loc: e.mid,
      exposure: exp,
      exposureLabel: exposureLabel(type, exp),
      evidence: e.impact.reasons[0] ?? "No flood or debris indicator along the segment.",
      confidence: exp === "none" ? null : e.impact.confidence,
      selection: { kind: "edge", id: e.id },
    });
  }

  const svc = serviceExposure(r);
  for (const s of r.services) {
    const x = svc.get(s.id)!;
    rows.push({
      key: `v-${s.id}`,
      id: s.id,
      name: s.name,
      type: "facility",
      typeLabel: s.kind === "hospital" ? "Hospital" : "Town (routing destination)",
      loc: s.pos,
      exposure: x.state,
      exposureLabel: exposureLabel("facility", x.state),
      evidence: x.evidence,
      confidence: x.state === "none" ? null : x.confidence,
      selection: { kind: "service", id: s.id },
    });
  }

  for (const b of r.buildings) {
    const exp = fromBuilding(b.state);
    const critical = isCriticalKind(b.kind);
    rows.push({
      key: `b-${b.id}`,
      id: b.id,
      name: critical ? `${CRITICAL_LABEL[b.kind]} ${b.id}` : `Building ${b.id}`,
      type: critical ? "facility" : "building",
      typeLabel: critical ? `${CRITICAL_LABEL[b.kind]} (building=${b.kind})` : `Building (${b.kind})`,
      loc: b.pos,
      exposure: exp,
      exposureLabel: exposureLabel(critical ? "facility" : "building", exp),
      evidence: b.reason,
      confidence: exp === "likely" || exp === "possible" ? b.confidence : null,
      selection: { kind: "building", id: b.id },
      area: area(b.settlementId),
    });
  }

  rows.sort(
    (a, b) =>
      EXPOSURE_RANK[a.exposure] - EXPOSURE_RANK[b.exposure] ||
      (b.confidence ?? -1) - (a.confidence ?? -1) ||
      a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  rowsCache.set(r, rows);
  return rows;
}
