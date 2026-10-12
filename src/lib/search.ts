import { BRIDGE_GROUPS, EDGES, NODES, SCENARIO, SERVICES, SETTLEMENTS } from "../data/scenario";
import { toLL } from "./geo";
import type { Selection } from "../types";

export type HitKind = "settlement" | "service" | "asset" | "area" | "coords" | "online";

export interface SearchHit {
  id: string;
  kind: HitKind;
  label: string;
  sub: string;
  lat: number;
  lon: number;
  zoom: number;
  selection?: Selection;
  /** Location lies outside the sample dataset coverage. */
  outside?: boolean;
}

const cv = SCENARIO.coverage;
export const inCoverage = (lat: number, lon: number) => lat >= cv.south && lat <= cv.north && lon >= cv.west && lon <= cv.east;

const GAZETTEER = [
  { name: "Trishuli Valley (analysis area), Nepal", lat: SCENARIO.defaultLat, lon: SCENARIO.defaultLon, zoom: 12.5 },
  { name: "Devighat, Nepal", lat: 27.8927, lon: 85.1023, zoom: 14 },
  { name: "Nuwakot District, Nepal", lat: 27.915, lon: 85.168, zoom: 12.5 },
  { name: "Rasuwa District (Dhunche), Nepal", lat: 28.1, lon: 85.295, zoom: 12 },
  { name: "Kathmandu, Nepal", lat: 27.7172, lon: 85.324, zoom: 11 },
  { name: "Pokhara, Nepal", lat: 28.2096, lon: 83.9856, zoom: 11 },
];

/** Parses "27.93, 85.13", "27.93N 85.13E" or "85.13 27.93" style coordinates (decimal degrees). */
export function parseCoords(q: string): { lat: number; lon: number } | null {
  const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([NnSs])?\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EeWw])?$/);
  if (!m) return null;
  let a = Number(m[1]);
  let b = Number(m[3]);
  if (m[2] && /s/i.test(m[2])) a = -Math.abs(a);
  if (m[4] && /w/i.test(m[4])) b = -Math.abs(b);
  if (Math.abs(a) > 90 && Math.abs(b) <= 90) [a, b] = [b, a];
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return { lat: a, lon: b };
}

export function coordHit(c: { lat: number; lon: number }): SearchHit {
  const outside = !inCoverage(c.lat, c.lon);
  return {
    id: `c-${c.lat}-${c.lon}`,
    kind: "coords",
    label: `${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}`,
    sub: outside ? "Coordinates · outside sample coverage" : "Coordinates · inside sample coverage",
    lat: c.lat,
    lon: c.lon,
    zoom: 14,
    outside,
  };
}

export function localSearch(query: string, hasResults: boolean): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: { rank: number; hit: SearchHit }[] = [];
  const add = (name: string, extra: string, hit: SearchHit) => {
    const hay = `${name} ${extra}`.toLowerCase();
    const i = hay.indexOf(q);
    if (i >= 0) hits.push({ rank: (name.toLowerCase().startsWith(q) ? 0 : i === 0 ? 1 : 2) + (hit.kind === "settlement" ? 0 : 0.5), hit });
  };
  for (const s of SETTLEMENTS) {
    const p = toLL(NODES[s.node]);
    add(s.name, s.nameNe, {
      id: `s-${s.id}`,
      kind: "settlement",
      label: s.name,
      sub: `Settlement · ${s.nameNe}`,
      lat: p[0],
      lon: p[1],
      zoom: 15,
      selection: hasResults ? { kind: "settlement", id: s.id } : undefined,
    });
  }
  for (const s of SERVICES) {
    const p = toLL(NODES[s.node]);
    add(s.name, s.nameNe, {
      id: `v-${s.id}`,
      kind: "service",
      label: s.name,
      sub: s.kind === "hospital" ? "Hospital" : "Town",
      lat: p[0],
      lon: p[1],
      zoom: 15,
      selection: hasResults ? { kind: "service", id: s.id } : undefined,
    });
  }
  for (const [gid, meta] of Object.entries(BRIDGE_GROUPS)) {
    const br = EDGES.find((e) => e.group === gid && e.bridge);
    if (!br) continue;
    const a = NODES[br.from];
    const b = NODES[br.to];
    const p = toLL([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    add(`${gid} ${meta.name}`, "bridge", {
      id: `a-${gid}`,
      kind: "asset",
      label: meta.name,
      sub: `Bridge ${gid} · pre-event OSM`,
      lat: p[0],
      lon: p[1],
      zoom: 16,
      selection: hasResults ? { kind: "group", id: gid } : undefined,
    });
  }
  for (const g of GAZETTEER) {
    add(g.name, "", { id: `g-${g.name}`, kind: "area", label: g.name, sub: inCoverage(g.lat, g.lon) ? "Area · inside sample coverage" : "Area · outside sample coverage", lat: g.lat, lon: g.lon, zoom: g.zoom, outside: !inCoverage(g.lat, g.lon) });
  }
  return hits.sort((a, b) => a.rank - b.rank).slice(0, 8).map((h) => h.hit);
}

/** Optional online place search (OpenStreetMap Nominatim). Rejects when offline or blocked. */
export async function searchOnline(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { place_id: number; display_name: string; lat: string; lon: string }[];
  return data.map((d) => {
    const lat = Number(d.lat);
    const lon = Number(d.lon);
    return {
      id: `o-${d.place_id}`,
      kind: "online" as const,
      label: d.display_name.split(",").slice(0, 3).join(",").trim(),
      sub: inCoverage(lat, lon) ? "OpenStreetMap place · inside sample coverage" : "OpenStreetMap place · outside sample coverage",
      lat,
      lon,
      zoom: 13,
      outside: !inCoverage(lat, lon),
    };
  });
}
