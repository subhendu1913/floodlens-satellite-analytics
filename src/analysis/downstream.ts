import { bufferPolygon, chaikin, dist, sampleAlong, toKm, toLL } from "../lib/geo";
import { isCriticalKind } from "../lib/format";
import type { AnalysisResults, LL, Pt, Selection } from "../types";
import { getChannels, TERRAIN, type Channel } from "./terrain";

/**
 * Terrain-guided downstream corridor ESTIMATE — not a hydraulic or flood simulation.
 * Method: snap the chosen point to the nearest mapped channel; follow the channel in the direction of
 * decreasing elevation (hopping to the receiving channel at confluences); buffer the path by a fixed,
 * user-adjustable half-width; list assets inside the buffer. No path is drawn when no channel is near.
 */
export const MAX_SNAP_KM = 0.6;

export interface DownstreamHit {
  id: string;
  name: string;
  type: "settlement" | "road" | "bridge" | "facility";
  alongKm: number;
  offsetM: number;
  selection: Selection;
}
export interface DownstreamResult {
  status: "ok" | "no-channel" | "at-outlet";
  message: string;
  start: LL;
  snapped?: { pt: LL; channel: string; distM: number };
  path: LL[];
  corridor: LL[];
  halfWidthM: number;
  lengthKm: number;
  startElevM: number | null;
  endElevM: number | null;
  channels: string[];
  hits: DownstreamHit[];
  buildingsInCorridor: number;
  terrainSource: string;
  demLoaded: boolean;
}

function project(p: Pt, pts: Pt[]) {
  let best = { d: Infinity, seg: 0, t: 0, pt: pts[0] };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    const q: Pt = [a[0] + t * dx, a[1] + t * dy];
    const d = dist(p, q);
    if (d < best.d) best = { d, seg: i, t, pt: q };
  }
  return best;
}

/** Distance from p to a polyline and the distance along the polyline to the closest point. */
function nearestOnPath(p: Pt, path: Pt[], cum: number[]) {
  let bestD = Infinity;
  let along = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    const d = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    if (d < bestD) {
      bestD = d;
      along = cum[i] + t * Math.hypot(dx, dy);
    }
  }
  return { d: bestD, along };
}

const empty = (start: LL, halfWidthM: number, status: DownstreamResult["status"], message: string): DownstreamResult => ({
  status,
  message,
  start,
  path: [],
  corridor: [],
  halfWidthM,
  lengthKm: 0,
  startElevM: null,
  endElevM: null,
  channels: [],
  hits: [],
  buildingsInCorridor: 0,
  terrainSource: TERRAIN.source,
  demLoaded: TERRAIN.demLoaded,
});

export function estimateDownstream(r: AnalysisResults, start: LL, halfWidthM: number): DownstreamResult {
  const channels = getChannels();
  if (!channels.length) return empty(start, halfWidthM, "no-channel", "No channel / elevation data is available, so no corridor can be estimated.");
  const p = toKm(start);

  let pick: { ch: Channel; d: number; seg: number; t: number; pt: Pt } | null = null;
  for (const ch of channels) {
    const q = project(p, ch.km);
    if (!pick || q.d < pick.d) pick = { ch, ...q };
  }
  if (!pick || pick.d > MAX_SNAP_KM) {
    return empty(start, halfWidthM, "no-channel", `No mapped channel lies within ${MAX_SNAP_KM * 1000} m of the chosen point (nearest is ${pick ? Math.round(pick.d * 1000) : "—"} m away), so no downstream corridor is drawn. Choose a point closer to a river or stream.`);
  }

  const lerp = (ch: Channel, seg: number, t: number) => ch.elevM[seg] + (ch.elevM[seg + 1] - ch.elevM[seg]) * t;
  const startElev = lerp(pick.ch, pick.seg, pick.t);
  const path: Pt[] = [pick.pt];
  const used: string[] = [];
  const visited = new Set<string>();
  let ch = pick.ch;
  let seg = pick.seg;
  for (let hop = 0; hop < 5; hop++) {
    visited.add(ch.id);
    used.push(ch.name);
    const fwd = ch.elevM[0] >= ch.elevM[ch.elevM.length - 1];
    if (fwd) for (let i = seg + 1; i < ch.km.length; i++) path.push(ch.km[i]);
    else for (let i = seg; i >= 0; i--) path.push(ch.km[i]);
    const outlet = path[path.length - 1];
    const outletElev = fwd ? ch.elevM[ch.elevM.length - 1] : ch.elevM[0];
    let next: { ch: Channel; j: number; d: number } | null = null;
    for (const o of channels) {
      if (visited.has(o.id)) continue;
      o.km.forEach((v, j) => {
        const d = dist(v, outlet);
        if (d <= 0.15 && o.elevM[j] <= outletElev + 1 && (!next || d < next.d)) next = { ch: o, j, d };
      });
    }
    if (!next) break;
    const n = next as { ch: Channel; j: number; d: number };
    path.push(n.ch.km[n.j]);
    const nf = n.ch.elevM[0] >= n.ch.elevM[n.ch.elevM.length - 1];
    ch = n.ch;
    seg = nf ? n.j : n.j - 1;
  }

  const dedup = path.filter((q, i) => i === 0 || dist(q, path[i - 1]) > 1e-6);
  if (dedup.length < 2 || lineLen(dedup) < 0.05) {
    return { ...empty(start, halfWidthM, "at-outlet", "The chosen point is at the downstream end of the mapped channel network; there is no further downstream path to estimate."), snapped: { pt: toLL(pick.pt), channel: pick.ch.name, distM: Math.round(pick.d * 1000) } };
  }
  const smooth = chaikin(dedup, 2) as Pt[];
  const hw = halfWidthM / 1000;
  const ring = bufferPolygon(smooth, smooth.map(() => hw));
  const cum: number[] = [0];
  for (let i = 1; i < smooth.length; i++) cum.push(cum[i - 1] + dist(smooth[i], smooth[i - 1]));
  const total = cum[cum.length - 1];
  const endElev = used.length ? lastElev(channels, dedup[dedup.length - 1]) : null;

  const hits: DownstreamHit[] = [];
  const within = (q: Pt) => nearestOnPath(q, smooth, cum);
  for (const s of r.settlements) {
    const { d, along } = within(toKm(s.pos));
    if (d <= hw) hits.push({ id: s.id, name: s.name, type: "settlement", alongKm: along, offsetM: Math.round(d * 1000), selection: { kind: "settlement", id: s.id } });
  }
  for (const e of r.roads) {
    let best: { d: number; along: number } | null = null;
    for (const q of sampleAlong(e.coords.map(toKm), 0.03)) {
      const m = within(q);
      if (m.d <= hw && (!best || m.d < best.d)) best = m;
    }
    if (best) hits.push({ id: e.id, name: e.name, type: e.isBridge ? "bridge" : "road", alongKm: best.along, offsetM: Math.round(best.d * 1000), selection: { kind: "edge", id: e.id } });
  }
  for (const s of r.services) {
    const { d, along } = within(toKm(s.pos));
    if (d <= hw) hits.push({ id: s.id, name: s.name, type: "facility", alongKm: along, offsetM: Math.round(d * 1000), selection: { kind: "service", id: s.id } });
  }
  let buildingsInCorridor = 0;
  for (const b of r.buildings) {
    const q = toKm(b.pos);
    const { d, along } = within(q);
    if (d > hw) continue;
    if (isCriticalKind(b.kind)) hits.push({ id: b.id, name: `${b.kind === "school" ? "School" : "Public building"} ${b.id}`, type: "facility", alongKm: along, offsetM: Math.round(d * 1000), selection: { kind: "building", id: b.id } });
    else buildingsInCorridor++;
  }
  hits.sort((a, b) => a.alongKm - b.alongKm);

  return {
    status: "ok",
    message: `Estimated corridor follows ${used.join(" → ")} for ${total.toFixed(1)} km downstream of the chosen point.`,
    start,
    snapped: { pt: toLL(pick.pt), channel: pick.ch.name, distM: Math.round(pick.d * 1000) },
    path: smooth.map(toLL),
    corridor: ring.map(toLL),
    halfWidthM,
    lengthKm: Math.round(total * 100) / 100,
    startElevM: Math.round(startElev),
    endElevM: endElev,
    channels: used,
    hits,
    buildingsInCorridor,
    terrainSource: TERRAIN.source,
    demLoaded: TERRAIN.demLoaded,
  };
}

const lineLen = (pts: Pt[]) => pts.slice(1).reduce((s, q, i) => s + dist(q, pts[i]), 0);

function lastElev(channels: Channel[], pt: Pt): number | null {
  let best: { d: number; e: number } | null = null;
  for (const c of channels)
    c.km.forEach((v, i) => {
      const d = dist(v, pt);
      if (!best || d < best.d) best = { d, e: c.elevM[i] };
    });
  const b = best as { d: number; e: number } | null;
  return b && b.d < 0.2 ? b.e : null;
}
