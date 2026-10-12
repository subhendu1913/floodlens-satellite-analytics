import { SCENARIO } from "../data/scenario";
import { ACCESS_LABEL, CRITICAL_LABEL, HOSPITAL_LABEL, IMPACT_LABEL, fmtDate, isCriticalKind } from "../lib/format";
import type { AnalysisResults, LL, Selection, SettlementResult } from "../types";
import { daysBetween } from "./acquisitions";
import { computeChokepoints } from "./chokepoints";
import { serviceExposure } from "./tables";

export type PriorityKind = "settlement" | "bridge" | "road" | "facility";
export type PriorityTier = 1 | 2 | 3;

export const TIER_LABEL: Record<PriorityTier, string> = {
  1: "Investigate first",
  2: "Investigate next",
  3: "Verify when possible",
};

/** The complete, transparent rule set. No numeric severity score is used anywhere. */
export const RULES: { id: string; tier: PriorityTier; applies: string; text: string }[] = [
  { id: "S1", tier: 1, applies: "Settlement", text: "Modeled disconnected — no mapped road route to a town or hospital remains after removing segments with high-confidence detected water." },
  { id: "A1", tier: 1, applies: "Road / bridge", text: "Likely impassable (modeled) and at least one non-connected settlement's route depends on it." },
  { id: "F1", tier: 1, applies: "Facility", text: "Hospital location lies inside high-confidence detected water." },
  { id: "S2", tier: 2, applies: "Settlement", text: "Access uncertain — the only modeled route passes through segments flagged as possible disruption." },
  { id: "A2", tier: 2, applies: "Road / bridge", text: "Possible disruption on the modeled route of at least one non-connected settlement." },
  { id: "A3", tier: 2, applies: "Road / bridge", text: "Likely impassable (modeled), but no settlement's nearest-service route depends on it." },
  { id: "C2", tier: 2, applies: "Road / bridge", text: "Possible flood disruption on a critical connection: its hypothetical loss would leave two or more settlements without a mapped town / hospital route." },
  { id: "F2", tier: 2, applies: "Facility", text: "Hospital within 300 m of mapped water, a town inside detected water, or a school / public building likely inundated." },
  { id: "S3", tier: 3, applies: "Settlement", text: "Reaches a town, but the route to the hospital is missing or only possible via uncertain segments." },
  { id: "A4", tier: 3, applies: "Road / bridge", text: "Possible disruption; no dependent settlement identified." },
  { id: "C1", tier: 3, applies: "Road / bridge", text: "Critical connection (hypothetical loss would isolate two or more settlements) with no flood indicator. Listed for preventive checking only — not flagged as affected." },
  { id: "F3", tier: 3, applies: "Facility", text: "Town within 300 m of mapped water, or school / public building possibly affected." },
];
const RULE = (id: string) => RULES.find((r) => r.id === id)!.text;

export interface PriorityEntry {
  id: string;
  kind: PriorityKind;
  name: string;
  loc: LL;
  tier: PriorityTier;
  impact: string;
  rule: string;
  reason: string;
  evidence: string[];
  confidence: number | null;
  confidenceNote: string;
  freshness: string;
  selection: Selection;
  affectedCount: number;
}

export function freshnessOf(r: AnalysisResults): string {
  const a = r.acquisitions;
  const parts: string[] = [];
  const dates: string[] = [];
  if (r.effectiveSensor !== "S2" && a.s1Post) {
    parts.push(`S1 ${fmtDate(a.s1Post.date)}`);
    dates.push(a.s1Post.date);
  }
  if (r.effectiveSensor !== "S1" && a.s2Post) {
    parts.push(`S2 ${fmtDate(a.s2Post.date)}`);
    dates.push(a.s2Post.date);
  }
  const days = dates.length ? daysBetween(r.params.eventDate, dates.sort()[0]) : null;
  return `Post-event ${parts.join(" · ") || "imagery unavailable"}${days !== null ? ` (${days} d after event)` : ""} · OSM snapshot ${fmtDate(SCENARIO.osmSnapshotDate)}`;
}

const KIND_ORDER: Record<PriorityKind, number> = { settlement: 0, bridge: 1, road: 2, facility: 3 };

export function comparePriority(a: PriorityEntry, b: PriorityEntry): number {
  return a.tier - b.tier || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.affectedCount - a.affectedCount || (b.confidence ?? -1) - (a.confidence ?? -1) || a.name.localeCompare(b.name, undefined, { numeric: true });
}

/** Order settlements by rule tier (flagged first), then exposed buildings, then name. */
export function compareSettlements(a: SettlementResult, b: SettlementResult): number {
  const ta = a.tier || 9;
  const tb = b.tier || 9;
  return ta - tb || b.buildings.likely + b.buildings.possible - (a.buildings.likely + a.buildings.possible) || a.name.localeCompare(b.name);
}

const cache = new WeakMap<AnalysisResults, PriorityEntry[]>();

export function buildPriorities(r: AnalysisResults): PriorityEntry[] {
  const hit = cache.get(r);
  if (hit) return hit;
  const fresh = freshnessOf(r);
  const out: PriorityEntry[] = [];
  const nameOf = (id: string) => r.settlements.find((s) => s.id === id)?.name ?? r.services.find((s) => s.id === id)?.name ?? id;
  const ck = new Map(computeChokepoints(r).map((c) => [c.id, c]));

  // --- settlements
  for (const s of r.settlements) {
    if (s.tier === 0) continue;
    const rule = s.tier === 1 ? "S1" : s.tier === 2 ? "S2" : "S3";
    const blocked = s.disrupted.filter((d) => d.state === "blocked");
    const evidence: string[] = [];
    if (s.baseline) evidence.push(`Pre-event route: ${s.baseline.service}, ${s.baseline.km} km.`);
    if (s.disrupted.length) evidence.push(`${s.disrupted.length} flagged segment(s) on that route: ${s.disrupted.map((d) => d.name).join("; ")}.`);
    if (s.post) evidence.push(`Best-case modeled route: ${s.post.service}, ${s.post.km} km${s.post.viaUncertain ? " via uncertain segments" : ""}.`);
    else evidence.push("No alternative mapped route in the OSM network.");
    evidence.push(`Hospital: ${HOSPITAL_LABEL[s.hospital.status].toLowerCase()}.`);
    if (s.buildings.likely + s.buildings.possible > 0) evidence.push(`${s.buildings.likely} likely / ${s.buildings.possible} possible of ${s.buildings.total} mapped buildings exposed to water or debris.`);
    const conf = s.tier === 1 && blocked.length ? Math.max(...blocked.map((d) => r.roads.find((x) => x.id === d.edgeId)!.impact.confidence)) : null;
    out.push({
      id: `P-${s.id}`,
      kind: "settlement",
      name: s.name,
      loc: s.pos,
      tier: s.tier as PriorityTier,
      impact: s.tier === 3 ? "Hospital route not firmly confirmed" : ACCESS_LABEL[s.status],
      rule,
      reason: RULE(rule),
      evidence,
      confidence: conf,
      confidenceNote: conf !== null ? "Evidence score of the strongest segment severing the route. The network model itself is unverified." : "Not a detection confidence — derived from the network model on uncertain segments.",
      freshness: fresh,
      selection: { kind: "settlement", id: s.id },
      affectedCount: s.buildings.likely + s.buildings.possible,
    });
  }

  // --- roads & bridges (flagged by flood evidence)
  for (const g of r.groups) {
    if (g.tier === 0) continue;
    const c = ck.get(g.id);
    let tier = g.tier as PriorityTier;
    let rule = g.tier === 1 ? "A1" : g.state === "suspected" ? "A2" : g.tier === 2 ? "A3" : "A4";
    if (tier === 3 && c && c.isolates.length >= 2) {
      tier = 2;
      rule = "C2";
    }
    const evidence = g.reasons.slice(0, 3);
    if (g.dependents.length) evidence.push(`Non-connected settlements relying on it: ${g.dependents.map(nameOf).join(", ")}.`);
    if (g.hospitalDependents.length) evidence.push(`Hospital route depends on it for: ${g.hospitalDependents.map(nameOf).join(", ")}.`);
    if (c) evidence.push(`Structural role (hypothetical): ${c.why}`);
    out.push({
      id: `P-${g.id}`,
      kind: g.kind,
      name: g.name,
      loc: g.center,
      tier,
      impact: `${IMPACT_LABEL[g.state]} — requires inspection`,
      rule,
      reason: RULE(rule),
      evidence,
      confidence: g.confidence,
      confidenceNote: "Fused Sentinel evidence score for the flagged segment(s). Structural condition cannot be inferred from imagery.",
      freshness: fresh,
      selection: { kind: "group", id: g.id },
      affectedCount: g.dependents.length,
    });
  }

  // --- critical connections without a flood indicator (preventive)
  for (const c of ck.values()) {
    const g = r.groups.find((x) => x.id === c.id);
    if (!g || g.state !== "none" || c.isolates.length < 2) continue;
    out.push({
      id: `P-${c.id}`,
      kind: c.kind,
      name: c.name,
      loc: c.center,
      tier: 3,
      impact: "Critical connection — no flood indicator detected",
      rule: "C1",
      reason: RULE("C1"),
      evidence: [c.why, c.alternatives, ...c.exposureEvidence],
      confidence: null,
      confidenceNote: "Structural result of the network model; no flood detection applies to this connection.",
      freshness: fresh,
      selection: c.selection,
      affectedCount: c.isolates.length,
    });
  }

  // --- facilities
  const svc = serviceExposure(r);
  for (const s of r.services) {
    const x = svc.get(s.id)!;
    if (x.state === "none") continue;
    const inside = x.state === "likely";
    const hospital = s.kind === "hospital";
    const rule = hospital ? (inside ? "F1" : "F2") : inside ? "F2" : "F3";
    out.push({
      id: `P-${s.id}`,
      kind: "facility",
      name: s.name,
      loc: s.pos,
      tier: rule === "F1" ? 1 : rule === "F2" ? 2 : 3,
      impact: inside ? "Potentially inundated — requires inspection" : "Near mapped water — verify access",
      rule,
      reason: RULE(rule),
      evidence: [x.evidence],
      confidence: x.confidence,
      confidenceNote: "Evidence score of the nearest water polygon.",
      freshness: fresh,
      selection: { kind: "service", id: s.id },
      affectedCount: 0,
    });
  }
  for (const b of r.buildings) {
    if (!isCriticalKind(b.kind) || (b.state !== "likely" && b.state !== "possible")) continue;
    const rule = b.state === "likely" ? "F2" : "F3";
    out.push({
      id: `P-${b.id}`,
      kind: "facility",
      name: `${CRITICAL_LABEL[b.kind]} ${b.id} (${nameOf(b.settlementId)})`,
      loc: b.pos,
      tier: b.state === "likely" ? 2 : 3,
      impact: b.state === "likely" ? "Potentially inundated — requires inspection" : "Possibly affected — verify",
      rule,
      reason: RULE(rule),
      evidence: [b.reason, "Exposure to water or debris is not structural damage."],
      confidence: b.confidence,
      confidenceNote: "Evidence score of the overlapping water / debris detection.",
      freshness: fresh,
      selection: { kind: "building", id: b.id },
      affectedCount: 0,
    });
  }

  out.sort(comparePriority);
  cache.set(r, out);
  return out;
}

/** The priority / verification entry that corresponds to a map selection, if the feature was flagged. */
export function findPriorityFor(r: AnalysisResults, sel: Selection): PriorityEntry | null {
  let s = sel;
  if (sel.kind === "edge") {
    const e = r.roads.find((x) => x.id === sel.id);
    if (e) s = { kind: "group", id: e.groupId };
  }
  return buildPriorities(r).find((p) => p.selection.kind === s.kind && p.selection.id === s.id) ?? null;
}
