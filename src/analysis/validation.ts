import { SCENARIO } from "../data/scenario";
import { haversineKm } from "../lib/geo";
import type { AnalysisResults } from "../types";

/**
 * Case-study validation. This module is intentionally one-way: it READS completed analysis results
 * and an external reference layer, and writes nothing back. Reference data never feeds detection,
 * training or any derived result.
 */

type Ring = number[][]; // [lon, lat]
type PolyRings = Ring[]; // outer ring first, then holes

export interface Reference {
  name: string;
  source: "upload" | "synthetic";
  polys: PolyRings[];
  featureCount: number;
  areaKm2: number;
  loadedAt: string;
}

const COV = SCENARIO.coverage;
export const GRID = { w: 360, h: 300 };
const dLon = (COV.east - COV.west) / GRID.w;
const dLat = (COV.north - COV.south) / GRID.h;
const KM = 111.32;
const kLon = KM * Math.cos((((COV.north + COV.south) / 2) * Math.PI) / 180);
const cellKm2 = dLat * KM * dLon * kLon;
export const AOI_BOUNDS_LL: [[number, number], [number, number]] = [
  [COV.south, COV.west],
  [COV.north, COV.east],
];

function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] * kLon) * (ring[i][1] * KM) - (ring[i][0] * kLon) * (ring[j][1] * KM);
  }
  return Math.abs(a) / 2;
}
const polyArea = (p: PolyRings) => p.reduce((s, ring, i) => s + (i === 0 ? ringArea(ring) : -ringArea(ring)), 0);

function inRings(rings: PolyRings, x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0],
        yi = ring[i][1],
        xj = ring[j][0],
        yj = ring[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function bbox(p: PolyRings): [number, number, number, number] {
  let a = Infinity,
    b = Infinity,
    c = -Infinity,
    d = -Infinity;
  for (const ring of p)
    for (const [x, y] of ring) {
      a = Math.min(a, x);
      b = Math.min(b, y);
      c = Math.max(c, x);
      d = Math.max(d, y);
    }
  return [a, b, c, d];
}

function rasterize(polys: PolyRings[]): Uint8Array {
  const out = new Uint8Array(GRID.w * GRID.h);
  for (const p of polys) {
    const [minX, minY, maxX, maxY] = bbox(p);
    const c0 = Math.max(0, Math.floor((minX - COV.west) / dLon));
    const c1 = Math.min(GRID.w - 1, Math.floor((maxX - COV.west) / dLon));
    const r0 = Math.max(0, Math.floor((COV.north - maxY) / dLat));
    const r1 = Math.min(GRID.h - 1, Math.floor((COV.north - minY) / dLat));
    for (let row = r0; row <= r1; row++) {
      const y = COV.north - (row + 0.5) * dLat;
      for (let col = c0; col <= c1; col++) {
        const idx = row * GRID.w + col;
        if (out[idx]) continue;
        if (inRings(p, COV.west + (col + 0.5) * dLon, y)) out[idx] = 1;
      }
    }
  }
  return out;
}

/* ------------------------------ reference loading ------------------------------ */

export function parseGeoJson(text: string, name: string): Reference {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("The file is not valid JSON. Provide a GeoJSON file (WGS84, EPSG:4326).");
  }
  const polys: PolyRings[] = [];
  let count = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addGeom = (g: any) => {
    if (!g || typeof g !== "object") return;
    if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
      polys.push(g.coordinates);
      count++;
    } else if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
      for (const p of g.coordinates) polys.push(p);
      count++;
    } else if (g.type === "GeometryCollection" && Array.isArray(g.geometries)) g.geometries.forEach(addGeom);
  };
  if (json?.type === "FeatureCollection" && Array.isArray(json.features)) json.features.forEach((f: { geometry?: unknown }) => addGeom(f.geometry));
  else if (json?.type === "Feature") addGeom(json.geometry);
  else addGeom(json);

  if (!polys.length) throw new Error("No Polygon or MultiPolygon features found. The flood-extent reference must be polygon vector data in WGS84 (EPSG:4326).");
  for (const p of polys) {
    for (const ring of p) {
      if (!Array.isArray(ring) || ring.length < 4) throw new Error("A polygon ring has fewer than 4 coordinates.");
      for (const pt of ring) {
        if (!Array.isArray(pt) || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) throw new Error("A polygon contains a non-numeric coordinate.");
        if (Math.abs(pt[0]) > 180 || Math.abs(pt[1]) > 90) throw new Error("Coordinates do not look like WGS84 longitude/latitude (EPSG:4326). Reproject the file before loading it.");
      }
    }
  }
  const all = polys.map(bbox);
  const minX = Math.min(...all.map((b) => b[0]));
  const minY = Math.min(...all.map((b) => b[1]));
  const maxX = Math.max(...all.map((b) => b[2]));
  const maxY = Math.max(...all.map((b) => b[3]));
  if (maxX < COV.west || minX > COV.east || maxY < COV.south || minY > COV.north) throw new Error("The reference polygons do not overlap the Trishuli analysis area.");
  return { name, source: "upload", polys, featureCount: count, areaKm2: polys.reduce((s, p) => s + polyArea(p), 0), loadedAt: new Date().toISOString() };
}

/** Pipeline self-test only. Perturbs the system's own output; carries no information about real accuracy. */
export function makeSyntheticReference(r: AnalysisResults): Reference {
  const polys: PolyRings[] = [];
  for (const f of r.flood.filter((x) => x.kind === "water" && x.part === "core" && x.reachId !== "M-e")) {
    const ring: Ring = f.ring.map(([la, lo]) => [lo, la]);
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    polys.push([ring.map(([x, y]) => [cx + (x - cx) * 1.12 + 0.0006, cy + (y - cy) * 1.12])]);
  }
  const x0 = 85.171,
    y0 = 27.958;
  polys.push([[[x0, y0], [x0 + 0.005, y0], [x0 + 0.005, y0 + 0.004], [x0, y0 + 0.004], [x0, y0]]]);
  return { name: "Pipeline test reference (SYNTHETIC — not EMSR927)", source: "synthetic", polys, featureCount: polys.length, areaKm2: polys.reduce((s, p) => s + polyArea(p), 0), loadedAt: new Date().toISOString() };
}

export const referenceLatLngs = (ref: Reference): [number, number][][][] => ref.polys.map((p) => p.map((ring) => ring.map(([x, y]) => [y, x] as [number, number])));

/* ------------------------------ evaluation ------------------------------ */

export interface EvalResult {
  includeUncertain: boolean;
  source: Reference["source"];
  systemKm2: number;
  referenceKm2: number;
  tpKm2: number;
  fpKm2: number;
  fnKm2: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  iou: number | null;
  biasPct: number | null;
  imageUrl: string;
  differences: string[];
  buildings: { total: number; insideRef: number; insideRefFlagged: number; flaggedOutsideRef: number };
  evaluatedAt: string;
}

export function evaluate(r: AnalysisResults, ref: Reference, includeUncertain: boolean): EvalResult {
  const sysPolys: PolyRings[] = r.flood
    .filter((f) => f.kind === "water" || includeUncertain)
    .map((f) => {
      const rings: PolyRings = [f.ring.map(([la, lo]) => [lo, la])];
      if (f.hole) rings.push(f.hole.map(([la, lo]) => [lo, la]));
      return rings;
    });
  const S = rasterize(sysPolys);
  const R = rasterize(ref.polys);

  let tp = 0,
    fp = 0,
    fn = 0;
  const BS = 30;
  const bw = Math.ceil(GRID.w / BS);
  const bh = Math.ceil(GRID.h / BS);
  const bFn = new Float64Array(bw * bh);
  const bFp = new Float64Array(bw * bh);
  const canvas = document.createElement("canvas");
  canvas.width = GRID.w;
  canvas.height = GRID.h;
  const ctx = canvas.getContext("2d");
  const img = ctx ? ctx.createImageData(GRID.w, GRID.h) : null;
  for (let row = 0; row < GRID.h; row++) {
    for (let col = 0; col < GRID.w; col++) {
      const i = row * GRID.w + col;
      const s = S[i];
      const q = R[i];
      if (!s && !q) continue;
      const b = Math.floor(row / BS) * bw + Math.floor(col / BS);
      let rgba: [number, number, number, number];
      if (s && q) {
        tp++;
        rgba = [22, 163, 74, 190];
      } else if (s) {
        fp++;
        bFp[b]++;
        rgba = [217, 119, 6, 210];
      } else {
        fn++;
        bFn[b]++;
        rgba = [220, 38, 38, 210];
      }
      if (img) {
        const o = i * 4;
        img.data[o] = rgba[0];
        img.data[o + 1] = rgba[1];
        img.data[o + 2] = rgba[2];
        img.data[o + 3] = rgba[3];
      }
    }
  }
  if (ctx && img) ctx.putImageData(img, 0, 0);
  const km = (n: number) => +(n * cellKm2).toFixed(3);
  const div = (a: number, b: number) => (b > 0 ? a / b : null);
  const precision = div(tp, tp + fp);
  const recall = div(tp, tp + fn);
  const f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;
  const iou = div(tp, tp + fp + fn);
  const systemKm2 = km(tp + fp);
  const referenceKm2 = km(tp + fn);
  const biasPct = referenceKm2 > 0 ? +(((systemKm2 - referenceKm2) / referenceKm2) * 100).toFixed(1) : null;

  const places = [...r.settlements.map((s) => ({ name: s.name, pos: s.pos })), ...r.services.map((s) => ({ name: s.name, pos: s.pos }))];
  const near = (b: number) => {
    const row = Math.floor(b / bw) * BS + BS / 2;
    const col = (b % bw) * BS + BS / 2;
    const pos: [number, number] = [COV.north - row * dLat, COV.west + col * dLon];
    const best = places.map((p) => ({ n: p.name, d: haversineKm(pos, p.pos) })).sort((a, b2) => a.d - b2.d)[0];
    return best ? ` — largest cluster near ${best.n} (≈${best.d.toFixed(1)} km)` : "";
  };
  const top = (arr: Float64Array) => arr.reduce((bi, v, i) => (v > arr[bi] ? i : bi), 0);

  const differences: string[] = [];
  if (biasPct !== null) differences.push(`System detected water ${systemKm2} km² vs reference ${referenceKm2} km² (${biasPct >= 0 ? "+" : ""}${biasPct}%).`);
  if (fn > 0) differences.push(`Omission — reference water not detected: ${km(fn)} km²${km(bFn[top(bFn)]) >= 0.02 ? near(top(bFn)) : ""}.`);
  if (fp > 0) differences.push(`Commission — detected water absent from the reference: ${km(fp)} km²${km(bFp[top(bFp)]) >= 0.02 ? near(top(bFp)) : ""}.`);
  if (fn === 0 && fp === 0) differences.push("No disagreement between the system extent and the reference within the analysis area.");

  let inside = 0,
    insideFlagged = 0,
    flaggedOutside = 0;
  for (const b of r.buildings) {
    const hit = ref.polys.some((p) => inRings(p, b.pos[1], b.pos[0]));
    const flagged = b.state === "likely" || b.state === "possible";
    if (hit) {
      inside++;
      if (flagged) insideFlagged++;
    } else if (flagged) flaggedOutside++;
  }
  differences.push(`Buildings: ${inside} of ${r.buildings.length} mapped footprints lie inside the reference extent; ${insideFlagged} of those were flagged by the system, and ${flaggedOutside} flagged buildings lie outside it.`);
  differences.push("Differences can reflect acquisition timing (peak vs. receding water), spatial resolution, SAR limits in urban areas and steep terrain, and the labelled sample nature of this dataset.");

  return {
    includeUncertain,
    source: ref.source,
    systemKm2,
    referenceKm2,
    tpKm2: km(tp),
    fpKm2: km(fp),
    fnKm2: km(fn),
    precision,
    recall,
    f1,
    iou,
    biasPct,
    imageUrl: canvas.toDataURL("image/png"),
    differences,
    buildings: { total: r.buildings.length, insideRef: inside, insideRefFlagged: insideFlagged, flaggedOutsideRef: flaggedOutside },
    evaluatedAt: new Date().toISOString(),
  };
}
