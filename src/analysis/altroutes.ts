import type { AnalysisResults, ImpactState } from "../types";
import { routeFor, type RouteTo } from "./graph";

/**
 * Alternative mapped route that avoids selected (potentially disrupted) segments.
 * HYPOTHETICAL: it is a path on the pre-event OpenStreetMap network, computed on a COPY of the graph.
 * It is never evidence that the path is passable or safe in the real world.
 */
export type AltTarget = "any" | "hospital";
export interface AltSegment {
  id: string;
  name: string;
  state: ImpactState;
}
export interface AltResult {
  settlementId: string;
  settlementName: string;
  target: AltTarget;
  excluded: AltSegment[];
  baseline: RouteTo | null;
  alternative: RouteTo | null;
  found: boolean;
  /** Segments of the calculated route, in travel order. */
  routeSegments: AltSegment[];
  /** Route segments that still carry a flood / debris indicator (were not excluded). */
  flaggedOnRoute: AltSegment[];
  extraKm: number | null;
  /** The best route did not need to change. */
  unchanged: boolean;
  ranAt: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function findAlternative(r: AnalysisResults, settlementId: string, excludedIds: string[], target: AltTarget): AltResult {
  const s = r.settlements.find((x) => x.id === settlementId);
  const seg = (id: string): AltSegment => {
    const e = r.roads.find((x) => x.id === id);
    return { id, name: e?.name ?? id, state: e?.impact.state ?? "none" };
  };
  const baseline = routeFor(r, new Set(), settlementId, target);
  const alternative = routeFor(r, new Set(excludedIds), settlementId, target);
  const routeSegments = alternative ? [...alternative.edges].reverse().map(seg) : [];
  return {
    settlementId,
    settlementName: s?.name ?? settlementId,
    target,
    excluded: excludedIds.map(seg),
    baseline,
    alternative,
    found: !!alternative,
    routeSegments,
    flaggedOnRoute: routeSegments.filter((x) => x.state !== "none"),
    extraKm: alternative && baseline ? r2(alternative.km - baseline.km) : null,
    unchanged: !!alternative && !!baseline && alternative.edges.join() === baseline.edges.join(),
    ranAt: new Date().toISOString(),
  };
}
