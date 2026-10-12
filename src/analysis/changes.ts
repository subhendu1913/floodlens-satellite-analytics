import { WATERWAYS } from "../data/scenario";
import { polygonArea, toKm } from "../lib/geo";
import type { AnalysisResults, ChangeSummary } from "../types";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Differences between the pre-event mapped state and the post-event detections, computed only from the
 * finished results. The baseline is the area of mapped (OSM-derived) permanent waterways inside the
 * reaches where floodwater was detected — it is NOT a satellite water map of the "before" date.
 */
export function computeChanges(r: Omit<AnalysisResults, "changes">): ChangeSummary {
  const detected = new Set(r.flood.filter((f) => f.kind === "water" && f.part === "core").map((f) => f.reachId));
  let baseline = 0;
  for (const ww of r.waterways) {
    const def = WATERWAYS.find((w) => w.id === ww.id);
    if (!def) continue;
    ww.permanent.forEach((ring, i) => {
      const reach = def.reaches[i];
      if (reach && detected.has(reach.id)) baseline += polygonArea(ring.map(toKm));
    });
  }
  const m = r.metrics;
  return {
    fromDate: r.params.fromDate,
    toDate: r.params.toDate,
    eventDate: r.params.eventDate,
    baselineWaterKm2: r2(baseline),
    detectedWaterKm2: m.waterKm2,
    addedWaterKm2: r2(Math.max(0, m.waterKm2 - baseline)),
    uncertainKm2: m.uncertainKm2,
    debrisKm2: m.debrisKm2,
    buildingsExposed: m.buildingsLikely + m.buildingsPossible,
    roadsFlagged: m.roadSegmentsBlocked + m.roadSegmentsSuspected,
    bridgesFlagged: m.bridgesBlocked + m.bridgesSuspected,
    settlementsChanged: r.settlements
      .filter((s) => s.baseline && s.status !== "connected")
      .map((s) => ({ id: s.id, name: s.name, nameNe: s.nameNe, from: "connected" as const, to: s.status })),
  };
}
