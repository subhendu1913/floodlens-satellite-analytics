import { WATERWAYS } from "../data/scenario";
import { toLL } from "../lib/geo";
import type { LL, Pt } from "../types";

/**
 * Terrain service seam. A production build would sample the Copernicus WorldDEM-30 here.
 * This build ships NO DEM: it exposes per-vertex elevation ATTRIBUTES of the sample channel network,
 * which are placeholders that encode flow direction. They are not Copernicus DEM values.
 */
export const TERRAIN = {
  demLoaded: false,
  source: "Sample channel-elevation attributes (placeholder; Copernicus WorldDEM-30 is not loaded in this build)",
};

const ELEV: Record<string, number[]> = {
  trishuli: [640, 625, 610, 595, 580, 568, 556, 540, 525, 505, 490],
  w1: [700, 660, 620, 590, 560],
  e1: [680, 640, 610, 585],
  s1: [700, 670, 650, 630, 612],
};

export interface Channel {
  id: string;
  name: string;
  km: Pt[];
  ll: LL[];
  elevM: number[];
}

export function getChannels(): Channel[] {
  return WATERWAYS.filter((w) => ELEV[w.id]?.length === w.pts.length).map((w) => ({ id: w.id, name: w.name, km: w.pts, ll: w.pts.map(toLL), elevM: ELEV[w.id] }));
}
