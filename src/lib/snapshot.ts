import { fmtDate } from "./format";
import type { AnalysisResults, LL } from "../types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const C = { flood: "#0891B2", crit: "#DC2626", ok: "#16A34A", warn: "#D97706", navy: "#0F172A", bg: "#EEF2F7" };

/**
 * Schematic map snapshot (no basemap) rendered straight from the structured analysis results,
 * so it is deterministic, prints reliably and always matches the numbers in the report.
 */
export function buildSnapshotSvg(r: AnalysisResults): string {
  const pts: LL[] = [];
  for (const f of r.flood) pts.push(...f.ring);
  for (const x of r.roads) pts.push(...x.coords);
  for (const s of r.settlements) pts.push(s.pos);
  for (const d of r.debris) pts.push(...d.ring);
  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  for (const [la, lo] of pts) {
    minLat = Math.min(minLat, la);
    maxLat = Math.max(maxLat, la);
    minLon = Math.min(minLon, lo);
    maxLon = Math.max(maxLon, lo);
  }
  const padLat = (maxLat - minLat) * 0.05;
  const padLon = (maxLon - minLon) * 0.05;
  minLat -= padLat;
  maxLat += padLat;
  minLon -= padLon;
  maxLon += padLon;
  const kLat = 111.32;
  const kLon = 111.32 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const W = 900;
  const M = 14;
  const scale = (W - 2 * M) / ((maxLon - minLon) * kLon);
  const H = Math.round((maxLat - minLat) * kLat * scale + 2 * M);
  const X = (p: LL) => (M + (p[1] - minLon) * kLon * scale).toFixed(1);
  const Y = (p: LL) => (M + (maxLat - p[0]) * kLat * scale).toFixed(1);
  const ring = (c: LL[]) => "M" + c.map((p) => `${X(p)},${Y(p)}`).join("L") + "Z";
  const line = (c: LL[]) => "M" + c.map((p) => `${X(p)},${Y(p)}`).join("L");

  const o: string[] = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Arial, sans-serif">`);
  o.push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);
  for (const f of r.flood.filter((x) => x.kind === "uncertain")) {
    o.push(`<path d="${ring(f.ring)}${f.hole ? ring(f.hole) : ""}" fill-rule="evenodd" fill="${C.flood}" fill-opacity="0.16" stroke="${C.flood}" stroke-width="0.8" stroke-dasharray="4 3"/>`);
  }
  for (const f of r.flood.filter((x) => x.kind === "water")) {
    o.push(`<path d="${ring(f.ring)}" fill="${C.flood}" fill-opacity="0.55" stroke="${C.flood}" stroke-width="1"/>`);
  }
  for (const g of r.gaps) o.push(`<path d="${ring(g.ring)}" fill="#94A3B8" fill-opacity="0.2" stroke="#64748B" stroke-width="0.8" stroke-dasharray="2 5"/>`);
  for (const d of r.debris) {
    o.push(
      d.kind === "suspected"
        ? `<path d="${ring(d.ring)}" fill="${C.warn}" fill-opacity="0.6" stroke="${C.warn}" stroke-width="1.2"/>`
        : `<path d="${ring(d.ring)}" fill="${C.warn}" fill-opacity="0.18" stroke="${C.warn}" stroke-width="1" stroke-dasharray="4 3"/>`,
    );
  }
  const colorOf = (s: string) => (s === "blocked" ? C.crit : s === "suspected" ? C.warn : "#64748B");
  for (const e of r.roads) {
    const w = e.isBridge ? 5 : e.cls === "primary" ? 2.6 : e.cls === "secondary" ? 2 : 1.4;
    o.push(`<path d="${line(e.coords)}" fill="none" stroke="#FFFFFF" stroke-width="${w + 2.5}" stroke-linecap="${e.isBridge ? "butt" : "round"}"/>`);
    o.push(
      `<path d="${line(e.coords)}" fill="none" stroke="${e.isBridge && e.impact.state === "none" ? C.navy : colorOf(e.impact.state)}" stroke-width="${w}" stroke-linecap="${e.isBridge ? "butt" : "round"}"${e.impact.state === "suspected" ? ' stroke-dasharray="6 4"' : ""}/>`,
    );
  }
  for (const b of r.buildings) {
    const c = b.state === "likely" ? C.crit : b.state === "possible" ? C.warn : "#94A3B8";
    o.push(`<circle cx="${X(b.pos)}" cy="${Y(b.pos)}" r="${b.state === "likely" || b.state === "possible" ? 2.4 : 1.4}" fill="${c}"/>`);
  }
  const label = (p: LL, t: string) => `<text x="${+X(p) + 10}" y="${+Y(p) + 4}" font-size="11" font-weight="600" fill="${C.navy}" stroke="#FFFFFF" stroke-width="3" paint-order="stroke">${esc(t)}</text>`;
  for (const s of r.services) {
    o.push(`<rect x="${+X(s.pos) - 6}" y="${+Y(s.pos) - 6}" width="12" height="12" fill="#FFFFFF" stroke="${C.navy}" stroke-width="2" transform="rotate(${s.kind === "hospital" ? 0 : 45} ${X(s.pos)} ${Y(s.pos)})"/>`);
    o.push(label(s.pos, s.name));
  }
  for (const s of r.settlements) {
    const c = s.status === "disconnected" ? C.crit : s.status === "suspected" ? C.warn : C.ok;
    o.push(`<circle cx="${X(s.pos)}" cy="${Y(s.pos)}" r="6.5" fill="${c}" stroke="#FFFFFF" stroke-width="1.8"/>`);
    o.push(label(s.pos, s.name));
  }
  const km = 2;
  const bw = km * scale;
  o.push(`<g transform="translate(${W - M - bw - 10},${H - 26})"><rect x="-6" y="-14" width="${bw + 12}" height="30" fill="#FFFFFF" fill-opacity="0.85"/><rect x="0" y="0" width="${bw}" height="4" fill="${C.navy}"/><text x="0" y="-4" font-size="10" fill="${C.navy}">0</text><text x="${bw}" y="-4" font-size="10" fill="${C.navy}" text-anchor="end">${km} km</text></g>`);
  o.push(`<g transform="translate(${W - 30},34)"><path d="M0,-16L6,6L0,2L-6,6Z" fill="${C.navy}"/><text y="20" font-size="10" fill="${C.navy}" text-anchor="middle">N</text></g>`);
  const L: [string, string][] = [
    [C.flood, "Detected floodwater"],
    ["#7DD3E8", "Uncertain water"],
    [C.warn, "Suspected debris / possible disruption"],
    [C.crit, "Road / bridge likely impassable (modeled)"],
    [C.crit, "Modeled disconnected settlement"],
    [C.ok, "Access maintained (modeled)"],
  ];
  o.push(`<g transform="translate(${M + 6},${H - 22 - L.length * 15 - 18})"><rect x="-6" y="-6" width="262" height="${L.length * 15 + 36}" fill="#FFFFFF" fill-opacity="0.92" stroke="#CBD5E1"/>`);
  L.forEach(([c, t], i) => o.push(`<rect x="0" y="${i * 15}" width="12" height="9" fill="${c}" fill-opacity="0.85"/><text x="19" y="${i * 15 + 8}" font-size="10" fill="${C.navy}">${esc(t)}</text>`));
  o.push(`<text x="0" y="${L.length * 15 + 12}" font-size="9" font-weight="700" fill="#B45309">DEMO DATA · schematic, no basemap</text><text x="0" y="${L.length * 15 + 23}" font-size="9" fill="#475569">Event ${esc(fmtDate(r.params.eventDate))} · Period ${esc(fmtDate(r.params.fromDate))} – ${esc(fmtDate(r.params.toDate))} · © OpenStreetMap contributors</text></g>`);
  o.push(`</svg>`);
  return o.join("");
}
