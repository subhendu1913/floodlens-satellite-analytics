import { computeChokepoints } from "../analysis/chokepoints";
import { buildInfraRows } from "../analysis/tables";
import { reportToHtml } from "../copilot/report";
import { ATTRIBUTIONS, EMSR_STATEMENT, TRAINING_DATA_STATEMENT } from "../data/attributions";
import { SCENARIO } from "../data/scenario";
import { ACCESS_LABEL, HOSPITAL_LABEL, IMPACT_LABEL, fmtDate } from "../lib/format";
import type { AnalysisResults } from "../types";
import type { ReportDoc } from "./doc";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface Staleness {
  exportedAt: string;
  lastObservation: string | null;
  daysOld: number | null;
  stale: boolean;
  text: string;
}

/** Whether the data in an export may be stale. Sample scenario dates can sit after the device clock — handled explicitly. */
export function stalenessOf(r: AnalysisResults, now = new Date()): Staleness {
  const a = r.acquisitions;
  const dates = [r.effectiveSensor !== "S2" ? a.s1Post?.date : undefined, r.effectiveSensor !== "S1" ? a.s2Post?.date : undefined].filter(Boolean) as string[];
  const last = dates.sort().reverse()[0] ?? null;
  const days = last ? Math.floor((now.getTime() - Date.parse(`${last}T00:00:00Z`)) / 86400000) : null;
  const exportedAt = now.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  let text: string;
  let stale = false;
  if (days === null) text = "No post-event observation date is available; data freshness cannot be assessed.";
  else if (days < 0) text = `Latest post-event observation: ${fmtDate(last!)} — this date is after this device's clock, which is expected for the demonstration scenario. Freshness cannot be judged from the clock.`;
  else {
    stale = days > 3;
    text = `Latest post-event observation: ${fmtDate(last!)} (${days} day${days === 1 ? "" : "s"} before export).${stale ? " This briefing MAY BE STALE — newer imagery or road information may exist." : ""}`;
  }
  return { exportedAt, lastObservation: last, daysOld: days, stale, text };
}

const table = (head: string[], rows: string[][]) =>
  `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

/** Self-contained HTML (works without the app; print to PDF from any browser). */
export function buildOfflineHtml(doc: ReportDoc, r: AnalysisResults, now = new Date()): string {
  const st = stalenessOf(r, now);
  const head = `<div class="banner" style="background:#EFF6FF;border-color:#2563EB;color:#1E3A8A">OFFLINE BRIEFING — exported ${esc(st.exportedAt)}<br><span style="font-weight:400">${esc(st.text)} This is a static snapshot: it does not receive new satellite observations or road-network updates, and it is not a connection to the live application.</span></div>`;
  const settlements = table(
    ["Settlement", "Modeled access", "Nearest facility (best case)", "Flagged segments on route", "Hospital"],
    r.settlements.map((s) => [s.name, ACCESS_LABEL[s.status], s.post ? `${s.post.service}, ${s.post.km} km` : "No modeled route", s.disrupted.map((d) => d.name).join("; ") || "—", HOSPITAL_LABEL[s.hospital.status]]),
  );
  const critical = table(
    ["Connection", "Isolates if lost (hypothetical)", "Hospital route lost", "Alternatives", "Flood exposure"],
    computeChokepoints(r).map((c) => [c.name, c.isolates.map((x) => x.name).join(", ") || "—", c.hospitalLost.map((x) => x.name).join(", ") || "—", c.alternatives, IMPACT_LABEL[c.exposure]]),
  );
  const infra = buildInfraRows(r)
    .filter((x) => x.exposure === "likely" || x.exposure === "possible")
    .slice(0, 120);
  const infraT = table(["Asset", "Type", "Potential exposure", "Evidence"], infra.map((x) => [x.name, x.typeLabel, x.exposureLabel, x.evidence]));
  const extra = `<style>table{border-collapse:collapse;width:100%;font-size:11px;margin:6px 0}th,td{border:1px solid #cbd5e1;padding:3px 6px;text-align:left;vertical-align:top}th{background:#f1f5f9}</style>
<h2>Appendix A — Settlement connectivity (modeled, not confirmed ground access)</h2>${settlements}
<h2>Appendix B — Critical connections (structural, hypothetical)</h2>${critical}
<h2>Appendix C — Potentially affected infrastructure (${infra.length}${infra.length === 120 ? "+, truncated" : ""})</h2>${infraT}
<h2>Appendix D — Data sources and limitations</h2>
<p>Sentinel-1 / Sentinel-2 (processing backend not connected — values are DEMO SAMPLE DATA), Copernicus DEM, pre-event OpenStreetMap snapshot ${esc(fmtDate(SCENARIO.osmSnapshotDate))}.</p>
<p>${esc(EMSR_STATEMENT)}</p><p>${esc(TRAINING_DATA_STATEMENT)}</p>
<ul>${r.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
<div class="attr">${ATTRIBUTIONS.map((a) => `<p>${esc(a)}</p>`).join("")}</div>`;
  return reportToHtml(doc).replace("<body>", `<body>${head}`).replace("</body>", `${extra}</body>`);
}
