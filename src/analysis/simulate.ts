import type { AnalysisResults, LL } from "../types";
import { accessFor, blockedSet } from "./graph";

/**
 * HYPOTHETICAL what-if analysis. Removes edges from a COPY of the road graph and recomputes
 * settlement access. Nothing here mutates the analysis results; outputs are scenarios, not events.
 */
export type SimBase = "modeled" | "pre-event";
export type SimCategory = "lost" | "hospital-lost" | "detour" | "unchanged" | "already";

export interface SimItem {
  id: string;
  name: string;
  nameNe: string;
  category: SimCategory;
  before: { service: string; km: number } | null;
  after: { service: string; km: number } | null;
  hospBeforeKm: number | null;
  hospAfterKm: number | null;
  /** Extra distance of the rerouted connection (km), when one exists. */
  deltaKm: number | null;
  /** Edge ids of the alternative mapped route(s) used after the loss. */
  altEdges: string[];
}
export interface SimLink {
  settlementId: string;
  settlement: string;
  service: string;
  kind: "town" | "hospital";
  outcome: "no route" | "rerouted";
  deltaKm: number | null;
}
export interface SimResult {
  edgeIds: string[];
  edgeNames: string[];
  base: SimBase;
  alreadyUnavailable: boolean;
  items: SimItem[];
  links: SimLink[];
  counts: Record<SimCategory, number>;
  removedGeometry: LL[][];
  ranAt: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function simulateLoss(r: AnalysisResults, edgeIds: string[], base: SimBase): SimResult {
  const baseRemoved = base === "modeled" ? blockedSet(r) : new Set<string>();
  const extra = new Set(edgeIds);
  const before = accessFor(r, baseRemoved);
  const after = accessFor(r, new Set([...baseRemoved, ...extra]));
  const kindOf = (id: string) => r.services.find((s) => s.id === id)?.kind ?? "town";

  const items: SimItem[] = [];
  const links: SimLink[] = [];
  const counts: Record<SimCategory, number> = { lost: 0, "hospital-lost": 0, detour: 0, unchanged: 0, already: 0 };

  for (const s of r.settlements) {
    const b = before.get(s.id)!;
    const a = after.get(s.id)!;
    const usesAny = !!b.any && b.any.edges.some((e) => extra.has(e));
    const usesHosp = !!b.hospital && b.hospital.edges.some((e) => extra.has(e));
    let category: SimCategory = "unchanged";
    if (!b.any) category = "already";
    else if (!a.any) category = "lost";
    else if (b.hospital && !a.hospital) category = "hospital-lost";
    else if (usesAny || usesHosp) category = "detour";
    counts[category]++;

    const altEdges: string[] = [];
    if (a.any && usesAny) altEdges.push(...a.any.edges);
    if (a.hospital && usesHosp) altEdges.push(...a.hospital.edges.filter((e) => !altEdges.includes(e)));

    let deltaKm: number | null = null;
    if (a.any && b.any && usesAny) deltaKm = r2(a.any.km - b.any.km);
    else if (a.hospital && b.hospital && usesHosp) deltaKm = r2(a.hospital.km - b.hospital.km);

    if (usesAny && b.any) links.push({ settlementId: s.id, settlement: s.name, service: b.any.service, kind: kindOf(b.any.service), outcome: a.any ? "rerouted" : "no route", deltaKm: a.any ? r2(a.any.km - b.any.km) : null });
    if (usesHosp && b.hospital && !(usesAny && b.any?.service === b.hospital.service)) {
      links.push({ settlementId: s.id, settlement: s.name, service: b.hospital.service, kind: "hospital", outcome: a.hospital ? "rerouted" : "no route", deltaKm: a.hospital ? r2(a.hospital.km - b.hospital.km) : null });
    }

    items.push({
      id: s.id,
      name: s.name,
      nameNe: s.nameNe,
      category,
      before: b.any ? { service: b.any.service, km: r2(b.any.km) } : null,
      after: a.any ? { service: a.any.service, km: r2(a.any.km) } : null,
      hospBeforeKm: b.hospital ? r2(b.hospital.km) : null,
      hospAfterKm: a.hospital ? r2(a.hospital.km) : null,
      deltaKm,
      altEdges,
    });
  }

  const edges = r.roads.filter((e) => extra.has(e.id));
  return {
    edgeIds,
    edgeNames: edges.map((e) => e.name),
    base,
    alreadyUnavailable: base === "modeled" && edgeIds.length > 0 && edgeIds.every((e) => baseRemoved.has(e)),
    items,
    links,
    counts,
    removedGeometry: edges.map((e) => e.coords),
    ranAt: new Date().toISOString(),
  };
}
