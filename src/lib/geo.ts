import type { LL, Pt } from "../types";

/** Scenario origin; chosen so that Trishuli Bazar sits near its real position. */
export const ORIGIN = { lat: 27.9134, lon: 85.1409 };
const KM_PER_DEG_LAT = 111.32;
const KM_PER_DEG_LON = 111.32 * Math.cos((ORIGIN.lat * Math.PI) / 180);

export const toLL = (p: Pt): LL => [
  ORIGIN.lat + p[1] / KM_PER_DEG_LAT,
  ORIGIN.lon + p[0] / KM_PER_DEG_LON,
];
export const toKm = (ll: LL): Pt => [
  (ll[1] - ORIGIN.lon) * KM_PER_DEG_LON,
  (ll[0] - ORIGIN.lat) * KM_PER_DEG_LAT,
];

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function lineLength(pts: Pt[]): number {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += dist(pts[i - 1], pts[i]);
  return t;
}

/** Endpoint-preserving Chaikin smoothing over n-dimensional points. */
export function chaikin(pts: number[][], iterations: number): number[][] {
  let cur = pts;
  for (let k = 0; k < iterations; k++) {
    if (cur.length < 3) break;
    const next: number[][] = [cur[0]];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i];
      const b = cur[i + 1];
      next.push(a.map((v, j) => 0.75 * v + 0.25 * b[j]));
      next.push(a.map((v, j) => 0.25 * v + 0.75 * b[j]));
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

export function bufferPolygon(center: Pt[], halfWidth: number[]): Pt[] {
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < center.length; i++) {
    const p0 = center[Math.max(0, i - 1)];
    const p1 = center[Math.min(center.length - 1, i + 1)];
    let dx = p1[0] - p0[0];
    let dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy;
    const ny = dx;
    const w = halfWidth[i];
    left.push([center[i][0] + nx * w, center[i][1] + ny * w]);
    right.push([center[i][0] - nx * w, center[i][1] - ny * w]);
  }
  return [...left, ...right.reverse()];
}

export interface PolyT {
  ring: Pt[];
  bbox: [number, number, number, number];
}

export function makePoly(ring: Pt[]): PolyT {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { ring, bbox: [minX, minY, maxX, maxY] };
}

export function inPoly(p: Pt, poly: PolyT): boolean {
  const [x, y] = p;
  const [minX, minY, maxX, maxY] = poly.bbox;
  if (x < minX || x > maxX || y < minY || y > maxY) return false;
  const r = poly.ring;
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0],
      yi = r[i][1],
      xj = r[j][0],
      yj = r[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonArea(ring: Pt[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a) / 2;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function blob(center: Pt, radiusKm: number, rng: () => number, n = 18): Pt[] {
  const radii: number[] = [];
  for (let i = 0; i < n; i++) radii.push(0.72 + 0.5 * rng());
  const ring: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const r = radiusKm * ((radii[(i + n - 1) % n] + radii[i] * 2 + radii[(i + 1) % n]) / 4);
    const ang = (i / n) * Math.PI * 2;
    ring.push([center[0] + Math.cos(ang) * r * 1.15, center[1] + Math.sin(ang) * r * 0.9]);
  }
  return ring;
}

/** Points spaced `step` km apart along a polyline (including both ends). */
export function sampleAlong(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = dist(a, b);
    let d = step - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      d += step;
    }
    carry = seg - (d - step);
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (dist(tail, last) > step * 0.4) out.push(last);
  return out;
}

export function centroid(ring: LL[]): LL {
  let la = 0,
    lo = 0;
  for (const p of ring) {
    la += p[0];
    lo += p[1];
  }
  return [la / ring.length, lo / ring.length];
}

export function haversineKm(a: LL, b: LL): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
