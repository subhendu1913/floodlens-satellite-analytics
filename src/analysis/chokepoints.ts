import type { AnalysisResults, ImpactState, LL, Selection } from "../types";
import { simulateLoss } from "./simulate";

/**
 * Critical Chokepoint Finder. For every road / bridge group, hypothetically remove it from the
 * PRE-EVENT road network and measure who loses access. This is a structural measure of importance,
 * independent of flooding; flood-exposure evidence is shown beside it, never mixed into a score.
 */
export interface PersonRef {
  id: string;
  name: string;
  nameNe: string;
}
export interface Chokepoint {
  id: string;
  name: string;
  nameNe: string;
  kind: "bridge" | "road";
  center: LL;
  edgeIds: string[];
  exposure: ImpactState;
  /** Fused evidence score of the flood indicator — only present when one was actually calculated. */
  confidence: number | null;
  isolates: PersonRef[];
  hospitalLost: PersonRef[];
  detours: (PersonRef & { deltaKm: number })[];
  exposureEvidence: string[];
  why: string;
  alternatives: string;
  selection: Selection;
}

const cache = new WeakMap<AnalysisResults, Chokepoint[]>();

export function computeChokepoints(r: AnalysisResults): Chokepoint[] {
  const hit = cache.get(r);
  if (hit) return hit;
  const out: Chokepoint[] = [];
  for (const g of r.groups) {
    const sim = simulateLoss(r, g.edgeIds, "pre-event");
    const ref = (i: { id: string; name: string; nameNe: string }): PersonRef => ({ id: i.id, name: i.name, nameNe: i.nameNe });
    const isolates = sim.items.filter((i) => i.category === "lost").map(ref);
    const hospitalLost = sim.items.filter((i) => i.category === "hospital-lost").map(ref);
    const detours = sim.items.filter((i) => i.category === "detour").map((i) => ({ ...ref(i), deltaKm: i.deltaKm ?? 0 }));
    if (!isolates.length && !hospitalLost.length && !detours.length) continue;

    const names = (l: PersonRef[]) => l.map((x) => x.name).join(", ");
    const parts: string[] = [];
    if (isolates.length) parts.push(`Removing it from the pre-event road network would leave ${isolates.length} settlement${isolates.length > 1 ? "s" : ""} (${names(isolates)}) with no mapped road route to any town or hospital.`);
    if (hospitalLost.length) parts.push(`${hospitalLost.length} more (${names(hospitalLost)}) would keep a town route but lose their mapped route to the hospital.`);
    if (detours.length) parts.push(`${detours.length} would be rerouted (${names(detours)}), adding up to ${Math.max(...detours.map((d) => d.deltaKm)).toFixed(1)} km.`);
    const alternatives = detours.length
      ? `Alternative mapped routes exist for ${detours.length} settlement${detours.length > 1 ? "s" : ""}.`
      : "No alternative mapped route exists for the affected settlements in this network.";

    out.push({
      id: g.id,
      name: g.name,
      nameNe: g.nameNe,
      kind: g.kind,
      center: g.center,
      edgeIds: g.edgeIds,
      exposure: g.state,
      confidence: g.state === "none" ? null : g.confidence,
      isolates,
      hospitalLost,
      detours,
      exposureEvidence: g.state === "none" ? ["No flood or debris indicator on this connection in the current results."] : g.reasons.slice(0, 3),
      why: parts.join(" "),
      alternatives,
      selection: { kind: "group", id: g.id },
    });
  }
  const rank: Record<ImpactState, number> = { blocked: 0, suspected: 1, none: 2 };
  out.sort(
    (a, b) =>
      b.isolates.length - a.isolates.length ||
      b.hospitalLost.length - a.hospitalLost.length ||
      b.detours.length - a.detours.length ||
      rank[a.exposure] - rank[b.exposure] ||
      a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  cache.set(r, out);
  return out;
}
