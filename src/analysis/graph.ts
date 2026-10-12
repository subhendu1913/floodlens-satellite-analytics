import type { AnalysisResults } from "../types";

/**
 * Road-network helpers shared by the simulator and the chokepoint finder.
 * Every function builds a fresh adjacency structure from the (immutable) results object,
 * so removing edges never modifies the original network.
 */
export interface Hop {
  to: string;
  id: string;
  w: number;
}
export type Adj = Map<string, Hop[]>;

export function buildAdj(r: AnalysisResults, removed: ReadonlySet<string>): Adj {
  const adj: Adj = new Map();
  for (const e of r.roads) {
    if (removed.has(e.id)) continue;
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from)!.push({ to: e.to, id: e.id, w: e.lengthKm });
    adj.get(e.to)!.push({ to: e.from, id: e.id, w: e.lengthKm });
  }
  return adj;
}

interface ShortestPaths {
  dist: Map<string, number>;
  prev: Map<string, { node: string; edge: string }>;
}

function shortest(adj: Adj, src: string): ShortestPaths {
  const dist = new Map<string, number>([[src, 0]]);
  const prev = new Map<string, { node: string; edge: string }>();
  const done = new Set<string>();
  for (;;) {
    let u: string | null = null;
    let best = Infinity;
    for (const [k, v] of dist) {
      if (!done.has(k) && v < best) {
        u = k;
        best = v;
      }
    }
    if (u === null) break;
    done.add(u);
    for (const h of adj.get(u) ?? []) {
      const nd = best + h.w;
      if (nd < (dist.get(h.to) ?? Infinity)) {
        dist.set(h.to, nd);
        prev.set(h.to, { node: u, edge: h.id });
      }
    }
  }
  return { dist, prev };
}

function trace(sp: ShortestPaths, from: string, to: string): string[] {
  const edges: string[] = [];
  let cur = to;
  let guard = 0;
  while (cur !== from && guard++ < 500) {
    const p = sp.prev.get(cur);
    if (!p) break;
    edges.push(p.edge);
    cur = p.node;
  }
  return edges;
}

export interface RouteTo {
  /** Service id (town or hospital). */
  service: string;
  km: number;
  edges: string[];
}
export interface Access {
  /** Nearest town or hospital. */
  any: RouteTo | null;
  /** Nearest hospital. */
  hospital: RouteTo | null;
}

/** Shortest modeled route from every settlement to its nearest town/hospital, with `removed` edges deleted. */
export function accessFor(r: AnalysisResults, removed: ReadonlySet<string>): Map<string, Access> {
  const adj = buildAdj(r, removed);
  const out = new Map<string, Access>();
  for (const s of r.settlements) {
    const node = r.network.settlementNodes[s.id];
    const sp = shortest(adj, node);
    let any: RouteTo | null = null;
    let hospital: RouteTo | null = null;
    for (const v of r.services) {
      const sn = r.network.serviceNodes[v.id];
      const d = sp.dist.get(sn);
      if (d === undefined) continue;
      const route: RouteTo = { service: v.id, km: d, edges: trace(sp, node, sn) };
      if (!any || d < any.km) any = route;
      if (v.kind === "hospital" && (!hospital || d < hospital.km)) hospital = route;
    }
    out.set(s.id, { any, hospital });
  }
  return out;
}

/** Edges the analysis classes as likely impassable (high-confidence detected water). */
export const blockedSet = (r: AnalysisResults): Set<string> => new Set(r.roads.filter((e) => e.impact.state === "blocked").map((e) => e.id));

/** Shortest modeled route from ONE settlement with `removed` edges deleted from a copy of the graph. */
export function routeFor(r: AnalysisResults, removed: ReadonlySet<string>, settlementId: string, target: "any" | "hospital"): RouteTo | null {
  const node = r.network.settlementNodes[settlementId];
  if (!node) return null;
  const sp = shortest(buildAdj(r, removed), node);
  let best: RouteTo | null = null;
  for (const v of r.services) {
    if (target === "hospital" && v.kind !== "hospital") continue;
    const sn = r.network.serviceNodes[v.id];
    const d = sp.dist.get(sn);
    if (d === undefined) continue;
    if (!best || d < best.km) best = { service: v.id, km: d, edges: trace(sp, node, sn) };
  }
  return best;
}
