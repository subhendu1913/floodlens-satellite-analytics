import { SCENARIO } from "../data/scenario";
import { centroid } from "../lib/geo";
import { ACCESS_LABEL, ACCESS_TONE, BUILDING_LABEL, HOSPITAL_LABEL, IMPACT_LABEL, IMPACT_TONE, confLabel, fmtDate, fmtLL, type Tone } from "../lib/format";
import type { AnalysisResults, LL, Selection } from "../types";
import { computeChokepoints } from "./chokepoints";
import { explainSettlement } from "./explain";
import type { SimResult } from "./simulate";
import { exposureLabel, serviceExposure } from "./tables";

export type EvidenceKind = "observation" | "derived" | "hypothetical" | "unverified";
export interface EvidenceItem {
  kind: EvidenceKind;
  text: string;
}
export interface InspectorModel {
  title: string;
  subtitle: string;
  badge: { label: string; tone: Tone };
  rows: [string, string][];
  evidence: EvidenceItem[];
  warnings: string[];
  verify: string;
  ask?: string;
  center: LL;
  zoom: number;
  /** Edge id that can be handed to the Access Simulator. */
  simulateEdgeId?: string;
}

export const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  observation: "Satellite observation",
  derived: "Derived estimate",
  hypothetical: "Hypothetical scenario",
  unverified: "Unverified on the ground",
};

const score = (c: number) => `${confLabel(c)} · ${Math.round(c * 100)}%`;
const NOT_CALC = "Not calculated";

function sourceDates(r: AnalysisResults): string {
  const a = r.acquisitions;
  const p: string[] = [];
  if (r.effectiveSensor !== "S2" && a.s1Pre && a.s1Post) p.push(`S1 ${fmtDate(a.s1Pre.date)} → ${fmtDate(a.s1Post.date)}`);
  if (r.effectiveSensor !== "S1" && a.s2Pre && a.s2Post) p.push(`S2 ${fmtDate(a.s2Pre.date)} → ${fmtDate(a.s2Post.date)}`);
  p.push(`OSM ${fmtDate(SCENARIO.osmSnapshotDate)}`);
  return p.join(" · ");
}
const baseWarnings = (r: AnalysisResults) => r.validation.filter((v) => v.severity === "warn").map((v) => v.title).slice(0, 3);
const DEMO = "Values come from the labelled DEMO sample dataset, not verified satellite processing.";

export function describeFeature(sel: Selection, r: AnalysisResults, sim?: SimResult | null): InspectorModel | null {
  const settlementName = (id: string) => r.settlements.find((s) => s.id === id)?.name ?? r.services.find((s) => s.id === id)?.name ?? id;
  const cks = computeChokepoints(r);
  const dates = sourceDates(r);

  switch (sel.kind) {
    case "edge":
    case "group": {
      const g = sel.kind === "group" ? r.groups.find((x) => x.id === sel.id) : null;
      const e = sel.kind === "edge" ? r.roads.find((x) => x.id === sel.id) : null;
      if (!g && !e) return null;
      const edges = g ? r.roads.filter((x) => g.edgeIds.includes(x.id)) : [e!];
      const isBridge = g ? g.kind === "bridge" : e!.isBridge;
      const state = g ? g.state : e!.impact.state;
      const conf = g ? g.confidence : e!.impact.confidence;
      const gid = g ? g.id : e!.groupId;
      const ck = cks.find((c) => c.id === gid);
      const first = edges.find((x) => x.isBridge) ?? edges[0];
      const reasons = g ? g.reasons : e!.impact.reasons;
      const evidence: EvidenceItem[] = [];
      if (edges.some((x) => x.impact.waterRunM > 0)) evidence.push({ kind: "observation", text: `Detected-water mask intersects ≈${Math.max(...edges.map((x) => x.impact.waterRunM))} m of the ${isBridge ? "structure axis / approaches" : "carriageway"}.` });
      if (edges.some((x) => x.impact.uncertainRunM > 0)) evidence.push({ kind: "observation", text: `Uncertain water signal over ≈${Math.max(...edges.map((x) => x.impact.uncertainRunM))} m.` });
      if (edges.some((x) => x.impact.debrisRunM > 0)) evidence.push({ kind: "observation", text: "A debris indicator lies on or within ≈60 m of the feature." });
      if (edges.some((x) => x.impact.gapRunM > 0)) evidence.push({ kind: "observation", text: "Part of the feature lies in a cloud-obscured gap: no optical evidence there." });
      if (!evidence.length) evidence.push({ kind: "observation", text: "No water or debris indicator intersects this feature in the current results." });
      for (const t of reasons) evidence.push({ kind: "derived", text: t });
      evidence.push({ kind: "derived", text: `Classified “${IMPACT_LABEL[state]}” by rule-based overlay of the pre-event OSM geometry on the detection masks.` });
      if (ck) evidence.push({ kind: "derived", text: `Structural role: ${ck.why} ${ck.alternatives}` });
      if (sim && edges.some((x) => sim.edgeIds.includes(x.id))) evidence.push({ kind: "hypothetical", text: "This connection is the one removed in the current simulation. Outcomes are hypothetical, not observed." });
      evidence.push({ kind: "unverified", text: `Actual ${isBridge ? "bridge structure, approaches" : "road surface"} and passability are not verified.` });
      const rows: [string, string][] = [
        ["Type", `${isBridge ? "Bridge" : "Road"} · ${first.osmTag}`],
        ["Location", fmtLL(g ? g.center : first.mid)],
        ["Potential exposure", IMPACT_LABEL[state]],
        ["Evidence score", state === "none" ? `${NOT_CALC} (no indicator)` : `${score(conf)} (fused Sentinel indicators)`],
        ["Source dates", dates],
      ];
      if (g && g.edgeIds.length > 1) rows.splice(1, 0, ["Includes", `${g.edgeIds.length} network segments (approaches + span)`]);
      if (!g && e!.isBridge && e!.impact.floodWidthM) rows.push(["Flood corridor / span", `${e!.impact.floodWidthM} m / ${(e!.lengthKm * 1000).toFixed(0)} m (${e!.impact.widthRatio}×)`]);
      if (ck?.isolates.length) rows.push(["Loss would isolate", ck.isolates.map((x) => x.name).join(", ")]);
      return {
        title: g ? g.name : e!.name,
        subtitle: `${isBridge ? "Bridge" : "Road"} · pre-event OSM snapshot`,
        badge: { label: IMPACT_LABEL[state], tone: IMPACT_TONE[state] },
        rows,
        evidence,
        warnings: [...baseWarnings(r), ...(isBridge ? ["Bridge condition cannot be assessed from satellite imagery."] : []), DEMO],
        verify: isBridge ? "Inspect the structure and both approaches on site or by UAV before closing or reopening it." : "Confirm passability with local field contacts or recent UAV / ground imagery.",
        ask: isBridge ? `What should we know about ${gid}?` : "Which roads may be disrupted?",
        center: g ? g.center : first.mid,
        zoom: isBridge ? 16 : 15,
        simulateEdgeId: (edges.find((x) => x.isBridge) ?? edges[0]).id,
      };
    }
    case "building": {
      const b = r.buildings.find((x) => x.id === sel.id);
      if (!b) return null;
      const flagged = b.state === "likely" || b.state === "possible";
      const evidence: EvidenceItem[] = [
        { kind: "observation", text: flagged ? b.reason : b.state === "unassessed" ? b.reason : "No water or debris indicator overlaps this footprint." },
        { kind: "derived", text: `Exposure class “${BUILDING_LABEL[b.state]}” assigned by overlaying the footprint on the detection masks. This is exposure, not a damage assessment.` },
        { kind: "unverified", text: "Building condition, occupancy and any structural damage are unknown." },
      ];
      return {
        title: `Building ${b.id}`,
        subtitle: `building=${b.kind} · pre-event OSM-style footprint`,
        badge: { label: BUILDING_LABEL[b.state], tone: b.state === "likely" ? "crit" : b.state === "possible" ? "warn" : "neutral" },
        rows: [
          ["Area", settlementName(b.settlementId)],
          ["Location", fmtLL(b.pos)],
          ["Potential exposure", BUILDING_LABEL[b.state]],
          ["Evidence score", flagged ? score(b.confidence) : NOT_CALC],
          ["Source dates", dates],
        ],
        evidence,
        warnings: [...(b.state === "unassessed" ? ["Cloud-obscured: cannot be assessed from optical data alone."] : []), ...baseWarnings(r), DEMO],
        verify: "Verify by field visit or UAV imagery. Exposure to floodwater is not structural damage.",
        center: b.pos,
        zoom: 17.5,
      };
    }
    case "settlement": {
      const s = r.settlements.find((x) => x.id === sel.id);
      if (!s) return null;
      const evidence: EvidenceItem[] = explainSettlement(s, r, "en").slice(0, -1).map((t) => ({ kind: "derived", text: t }));
      const si = sim?.items.find((i) => i.id === s.id);
      if (si && si.category !== "unchanged") evidence.push({ kind: "hypothetical", text: `In the current simulation (${sim!.edgeNames.join(" + ")} removed) this settlement ${si.category === "lost" ? "loses every modeled route" : si.category === "hospital-lost" ? "loses its hospital route" : si.category === "detour" ? `is rerouted${si.deltaKm !== null ? ` (+${si.deltaKm} km)` : ""}` : "was already without a route"}. Hypothetical only.` });
      evidence.push({ kind: "unverified", text: "Real-world road accessibility, unmapped tracks, ferries and footpaths are unverified. Modeled connectivity is not confirmed ground access." });
      return {
        title: s.name,
        subtitle: "Settlement · modeled road-network access",
        badge: { label: ACCESS_LABEL[s.status], tone: ACCESS_TONE[s.status] },
        rows: [
          ["Location", fmtLL(s.pos)],
          ["Baseline nearest service", s.baseline ? `${s.baseline.service} · ${s.baseline.km} km` : "Unavailable"],
          ["Best-case route now", s.post ? `${s.post.service} · ${s.post.km} km${s.post.viaUncertain ? " · via uncertain segment" : ""}` : "No modeled road route"],
          ["Hospital access", `${HOSPITAL_LABEL[s.hospital.status]}${s.hospital.postKm ? ` · ${s.hospital.postKm} km` : ""}`],
          ["Flagged segments", s.disrupted.length ? s.disrupted.map((d) => d.name).join("; ") : "None on the pre-event route"],
          ["Buildings exposed", `${s.buildings.likely} likely / ${s.buildings.possible} possible of ${s.buildings.total}`],
          ["Evidence score", `${NOT_CALC} (network-routing result)`],
          ["Source dates", dates],
        ],
        evidence,
        warnings: [...(s.status === "suspected" ? ["The only modeled route uses segments flagged as possible disruption."] : []), ...baseWarnings(r), DEMO],
        verify: "Contact the settlement or a field team to confirm access. Do not treat the model as confirmation of cut-off or open roads.",
        ask: `Why is ${s.name} ${s.status === "connected" ? "still connected" : "flagged"}?`,
        center: s.pos,
        zoom: 15,
      };
    }
    case "service": {
      const s = r.services.find((x) => x.id === sel.id);
      if (!s) return null;
      const x = serviceExposure(r).get(s.id);
      return {
        title: s.name,
        subtitle: s.kind === "hospital" ? "Hospital · routing destination" : "Town · routing destination",
        badge: { label: s.kind === "hospital" ? "Hospital" : "Town", tone: "info" },
        rows: [
          ["Location", fmtLL(s.pos)],
          ["Potential exposure", exposureLabel("facility", x?.state ?? "none")],
          ["Evidence score", x && x.state !== "none" && x.confidence !== null ? score(x.confidence) : NOT_CALC],
          ["Source dates", dates],
        ],
        evidence: [
          { kind: "observation", text: x?.evidence ?? "No exposure information." },
          { kind: "derived", text: "Used as a destination in the road-network connectivity analysis." },
          { kind: "unverified", text: "Operational status, capacity and staffing are unknown." },
        ],
        warnings: [...baseWarnings(r), DEMO],
        verify: "Confirm operational status directly with the facility.",
        center: s.pos,
        zoom: 15,
      };
    }
    case "flood": {
      const f = r.flood.find((x) => x.id === sel.id);
      if (!f) return null;
      return {
        title: f.kind === "water" ? "Detected floodwater" : "Uncertain water signal",
        subtitle: `${f.waterway} · ${f.part === "core" ? "core extent" : "outer margin"}`,
        badge: { label: f.kind === "water" ? "Detected" : "Uncertain", tone: f.kind === "water" ? "flood" : "warn" },
        rows: [
          ["Area", `${f.areaKm2.toFixed(2)} km² (from polygon geometry)`],
          ["Evidence score", score(f.confidence)],
          ["Sentinel-1 indicator", f.s1 == null ? "Not used" : f.s1.toFixed(2)],
          ["Sentinel-2 indicator", f.s2 == null ? "Unavailable (not used or cloud)" : f.s2.toFixed(2)],
          ["Source dates", dates],
        ],
        evidence: [
          { kind: "observation", text: `Radar / optical water indicators fused into this polygon (S1 ${f.s1 ?? "—"}, S2 ${f.s2 ?? "—"}).` },
          { kind: "derived", text: "≥ 0.75 fused score is shown as detected, 0.40–0.75 as uncertain; below 0.40 is not shown." },
          { kind: "unverified", text: "Water depth, duration and exact extent on the ground are not verified." },
        ],
        warnings: [...baseWarnings(r), DEMO],
        verify: "Compare with the latest cloud-free imagery or aerial photos.",
        center: centroid(f.ring),
        zoom: 14,
      };
    }
    case "debris": {
      const d = r.debris.find((x) => x.id === sel.id);
      if (!d) return null;
      return {
        title: d.kind === "suspected" ? "Suspected debris zone" : "Uncertain debris indicator",
        subtitle: d.name,
        badge: { label: d.kind === "suspected" ? "Suspected" : "Uncertain", tone: "warn" },
        rows: [
          ["Area", `${(d.areaKm2 * 100).toFixed(1)} ha`],
          ["Evidence score", score(d.confidence)],
          ["SAR coherence loss", d.s1 == null ? "Not used" : d.s1.toFixed(2)],
          ["Optical change", d.s2 == null ? "Unavailable (not used or cloud)" : d.s2.toFixed(2)],
          ["Source dates", dates],
        ],
        evidence: [
          { kind: "observation", text: "Surface change detected between the pre- and post-event scenes." },
          { kind: "derived", text: "Classed as a debris indicator from fused coherence-loss and optical-change values." },
          { kind: "unverified", text: "The cause of the surface change (debris, landslide, erosion, vegetation) is unconfirmed." },
        ],
        warnings: [...baseWarnings(r), DEMO],
        verify: "Verify with UAV imagery or a field report before acting on it.",
        center: centroid(d.ring),
        zoom: 15,
      };
    }
    case "gap": {
      const g = r.gaps.find((x) => x.id === sel.id);
      if (!g) return null;
      return {
        title: "Data gap — cloud / shadow",
        subtitle: g.name,
        badge: { label: g.active ? "Not assessable" : "Radar fills gap", tone: "neutral" },
        rows: [["Reason", g.reason], ["Source dates", dates]],
        evidence: [
          { kind: "observation", text: g.active ? "No usable optical observation inside this mask." : "Optical data are missing here, but Sentinel-1 radar provides water evidence." },
          { kind: "unverified", text: "Conditions inside the gap are unknown — features there are never treated as unaffected." },
        ],
        warnings: [g.reason],
        verify: "Use radar-only evidence or the next cloud-free acquisition.",
        center: centroid(g.ring),
        zoom: 13.5,
      };
    }
  }
}
