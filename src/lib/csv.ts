import { computeChokepoints } from "../analysis/chokepoints";
import { buildPriorities, TIER_LABEL } from "../analysis/priorities";
import type { SimResult } from "../analysis/simulate";
import { buildInfraRows } from "../analysis/tables";
import { SCENARIO } from "../data/scenario";
import { ACCESS_LABEL, HOSPITAL_LABEL, IMPACT_LABEL } from "./format";
import type { AnalysisResults } from "../types";

const q = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(header: string[], rows: unknown[][]): string {
  return "\uFEFF" + [header, ...rows].map((r) => r.map(q).join(",")).join("\r\n") + "\r\n";
}

const meta = (r: AnalysisResults) => ["DEMO_SAMPLE_DATA", r.id, SCENARIO.osmSnapshotDate];
const META_H = ["data_class", "analysis_id", "osm_snapshot"];
const pct = (c: number | null) => (c === null ? "" : Math.round(c * 100));

export type CsvKind = "infrastructure" | "settlements" | "priorities" | "layers" | "critical" | "simulation";

export const CSV_LABEL: Record<CsvKind, string> = {
  infrastructure: "Infrastructure exposure",
  settlements: "Settlement connectivity",
  critical: "Critical connections",
  priorities: "Rescue priorities",
  layers: "Flood & debris layers",
  simulation: "Hypothetical simulation result",
};

export function buildCsv(kind: CsvKind, r: AnalysisResults, sim?: SimResult | null): { name: string; text: string } {
  const stamp = r.params.eventDate;
  if (kind === "infrastructure") {
    const rows = buildInfraRows(r).map((x) => [x.id, x.name, x.typeLabel, x.loc[0].toFixed(5), x.loc[1].toFixed(5), x.exposureLabel, x.evidence, pct(x.confidence), x.area ?? "", ...meta(r)]);
    return { name: `floodlens_infrastructure_${stamp}.csv`, text: toCsv(["id", "name", "type", "lat", "lon", "potential_exposure", "evidence", "evidence_score_pct", "area", ...META_H], rows) };
  }
  if (kind === "settlements") {
    const rows = r.settlements.map((s) => [
      s.id,
      s.name,
      ACCESS_LABEL[s.status],
      s.pos[0].toFixed(5),
      s.pos[1].toFixed(5),
      s.post?.service ?? "",
      s.post?.km ?? "",
      s.baseline?.service ?? "",
      s.baseline?.km ?? "",
      HOSPITAL_LABEL[s.hospital.status],
      s.hospital.postKm ?? "",
      s.disrupted.map((d) => d.name).join("; "),
      s.buildings.likely,
      s.buildings.possible,
      s.buildings.total,
      ...meta(r),
    ]);
    return {
      name: `floodlens_settlements_${stamp}.csv`,
      text: toCsv(["id", "name", "modeled_access_status", "lat", "lon", "nearest_service_postevent", "route_km", "baseline_service", "baseline_km", "hospital_access", "hospital_km", "flagged_segments_on_route", "buildings_likely", "buildings_possible", "buildings_mapped", ...META_H], rows),
    };
  }
  if (kind === "critical") {
    const rows = computeChokepoints(r).map((c) => [
      c.id,
      c.name,
      c.kind,
      c.center[0].toFixed(5),
      c.center[1].toFixed(5),
      c.isolates.map((x) => x.name).join("; "),
      c.hospitalLost.map((x) => x.name).join("; "),
      c.detours.map((x) => `${x.name} (+${x.deltaKm} km)`).join("; "),
      IMPACT_LABEL[c.exposure],
      pct(c.confidence),
      c.why,
      ...meta(r),
    ]);
    return { name: `floodlens_critical_connections_${stamp}.csv`, text: toCsv(["id", "name", "type", "lat", "lon", "settlements_isolated_if_lost", "hospital_route_lost_if_lost", "rerouted_if_lost", "flood_exposure", "evidence_score_pct", "why_it_matters", ...META_H], rows) };
  }
  if (kind === "simulation") {
    const rows = (sim?.items ?? []).map((i) => [
      "HYPOTHETICAL",
      sim!.edgeNames.join(" + "),
      sim!.base,
      i.id,
      i.name,
      i.category,
      i.before ? `${i.before.service} ${i.before.km} km` : "",
      i.after ? `${i.after.service} ${i.after.km} km` : "",
      i.hospBeforeKm ?? "",
      i.hospAfterKm ?? "",
      i.deltaKm ?? "",
      ...meta(r),
    ]);
    return { name: `floodlens_simulation_HYPOTHETICAL_${stamp}.csv`, text: toCsv(["scenario_class", "removed_connection", "starting_network", "settlement_id", "settlement", "outcome", "route_before", "route_after", "hospital_km_before", "hospital_km_after", "delta_km", ...META_H], rows) };
  }
  if (kind === "priorities") {
    const rows = buildPriorities(r).map((p) => [TIER_LABEL[p.tier], p.kind, p.name, p.loc[0].toFixed(5), p.loc[1].toFixed(5), p.impact, p.rule, p.reason, p.evidence.join(" | "), pct(p.confidence), p.freshness, ...meta(r)]);
    return { name: `floodlens_priorities_${stamp}.csv`, text: toCsv(["tier", "type", "name", "lat", "lon", "potential_impact", "rule_id", "rule", "evidence", "evidence_score_pct", "data_freshness", ...META_H], rows) };
  }
  const rows: unknown[][] = [
    ...r.flood.map((f) => ["water", f.id, f.waterway, f.kind, f.part, pct(f.confidence), f.s1 ?? "", f.s2 ?? "", f.areaKm2.toFixed(4), ...meta(r)]),
    ...r.debris.map((d) => ["debris", d.id, d.name, d.kind, "", pct(d.confidence), d.s1 ?? "", d.s2 ?? "", d.areaKm2.toFixed(4), ...meta(r)]),
    ...r.gaps.map((g) => ["data_gap", g.id, g.name, g.active ? "not_assessable" : "radar_fills_gap", "", "", "", "", "", ...meta(r)]),
  ];
  return { name: `floodlens_layers_${stamp}.csv`, text: toCsv(["layer", "id", "name", "class", "part", "evidence_score_pct", "s1_evidence", "s2_evidence", "area_km2", ...META_H], rows) };
}
