import type { Acquisition, Pt } from "../types";

/**
 * FloodLens DEMONSTRATION scenario — Trishuli valley, Nepal.
 *
 * IMPORTANT: this is illustrative sample data. The geometry is hand-authored around the real
 * Trishuli corridor, and the per-reach evidence values are placeholders that stand in for the
 * outputs of the Sentinel-1/Sentinel-2 detection backend. Nothing here is a satellite-derived finding.
 * Coordinates are planar km (east, north) from the origin defined in lib/geo.ts.
 */

export const SCENARIO = {
  id: "trishuli-demo-v1",
  name: "Trishuli Valley, Nepal",
  region: "Rasuwa / Nuwakot, Bagmati Province",
  eventDate: "2026-08-26",
  osmSnapshotDate: "2026-08-20",
  /** Sample coverage area [south, west, north, east]. */
  coverage: { south: 27.87, west: 85.06, north: 27.995, east: 85.205 },
  defaultLat: 27.9332,
  defaultLon: 85.1358,
  /** Example analysis period around the event (not a claim that imagery exists on every date). */
  defaultFrom: "2026-08-20",
  defaultTo: "2026-08-30",
};

export interface ReachDef {
  id: string;
  label: string;
  from: number;
  to: number;
  /** Half-width of the modeled flood corridor at each vertex (metres). */
  halfWidthM: number[];
  /** Sample radar-derived water evidence (0–1). */
  s1: number;
  /** Sample optical-derived water evidence (0–1). */
  s2: number;
  /** Reach lies inside the post-event Sentinel-2 cloud mask. */
  s2Cloud?: boolean;
  note?: string;
}

export interface WaterwayDef {
  id: string;
  name: string;
  kind: "river" | "tributary" | "stream";
  pts: Pt[];
  permHalfM: number;
  reaches: ReachDef[];
}

export const WATERWAYS: WaterwayDef[] = [
  {
    id: "trishuli",
    name: "Trishuli River",
    kind: "river",
    pts: [
      [3.0, 8.0],
      [2.4, 6.5],
      [2.6, 5.0],
      [1.8, 3.6],
      [1.0, 2.4],
      [0.4, 1.2],
      [-0.6, 0.2],
      [-1.8, -0.8],
      [-3.2, -1.4],
      [-4.6, -2.6],
      [-6.0, -3.2],
    ],
    permHalfM: 32,
    reaches: [
      { id: "M-a", label: "Upper reach", from: 0, to: 2, halfWidthM: [70, 110, 120], s1: 0.93, s2: 0.9 },
      {
        id: "M-b",
        label: "Confluence reach",
        from: 2,
        to: 4,
        halfWidthM: [120, 210, 250],
        s1: 0.95,
        s2: 0.55,
        s2Cloud: true,
        note: "Optical evidence partly obscured by cloud",
      },
      { id: "M-c", label: "Trishuli Bazar reach", from: 4, to: 6, halfWidthM: [250, 300, 340], s1: 0.96, s2: 0.92 },
      { id: "M-d", label: "Lower floodplain", from: 6, to: 8, halfWidthM: [340, 260, 200], s1: 0.9, s2: 0.85 },
      {
        id: "M-e",
        label: "Gorge reach",
        from: 8,
        to: 10,
        halfWidthM: [200, 170, 130],
        s1: 0.62,
        s2: 0.6,
        note: "Steep gorge: radar shadow lowers confidence",
      },
    ],
  },
  {
    id: "w1",
    name: "Unnamed tributary W1",
    kind: "tributary",
    pts: [
      [-4.0, 4.8],
      [-3.0, 3.8],
      [-2.0, 2.6],
      [-1.2, 1.2],
      [-0.6, 0.2],
    ],
    permHalfM: 14,
    reaches: [{ id: "W-1", label: "Tributary W1", from: 0, to: 4, halfWidthM: [60, 70, 75, 100, 140], s1: 0.88, s2: 0.8 }],
  },
  {
    id: "e1",
    name: "Unnamed tributary E1",
    kind: "tributary",
    pts: [
      [5.2, 0.4],
      [4.0, 1.0],
      [2.6, 1.5],
      [1.0, 2.4],
    ],
    permHalfM: 12,
    reaches: [
      {
        id: "E-1",
        label: "Tributary E1",
        from: 0,
        to: 3,
        halfWidthM: [40, 55, 80, 130],
        s1: 0.8,
        s2: 0.5,
        s2Cloud: true,
        note: "Optical evidence partly obscured by cloud",
      },
    ],
  },
  {
    id: "s1",
    name: "Seasonal stream S1",
    kind: "stream",
    pts: [
      [4.4, 6.0],
      [3.8, 5.55],
      [3.5, 5.4],
      [3.0, 5.1],
      [2.62, 4.95],
    ],
    permHalfM: 5,
    reaches: [],
  },
];

export interface DebrisDef {
  id: string;
  name: string;
  center: Pt;
  radiusKm: number;
  s1: number; // SAR coherence-loss indicator
  s2: number; // optical change indicator
  s2Cloud?: boolean;
}

export const DEBRIS: DebrisDef[] = [
  { id: "D1", name: "Debris deposit near Trishuli Bazar bridge (BR1) west abutment", center: [-0.2, 0.85], radiusKm: 0.12, s1: 0.8, s2: 0.85 },
  { id: "D2", name: "Possible hillslope failure above highway (Junction J2–J3)", center: [3.3, 4.4], radiusKm: 0.14, s1: 0.6, s2: 0.7 },
  { id: "D3", name: "Debris fan at tributary E1 mouth", center: [1.4, 2.2], radiusKm: 0.16, s1: 0.72, s2: 0.75, s2Cloud: true },
  { id: "D4", name: "Possible hillslope failure above Bhotechaur–Thanapati track", center: [-3.1, 3.0], radiusKm: 0.16, s1: 0.75, s2: 0.8 },
  { id: "D5", name: "Possible debris-flow fan on Devighat access track", center: [-3.72, -2.5], radiusKm: 0.15, s1: 0.55, s2: 0.6 },
  { id: "D6", name: "Riverbank debris near Pipaltar", center: [-1.3, -0.2], radiusKm: 0.1, s1: 0.85, s2: 0.8 },
];

export const CLOUD_MASK = { center: [1.6, 3.0] as Pt, radiusKm: 1.5 };

/* -------------------------------- Road network -------------------------------- */

export const NODES: Record<string, Pt> = {
  BET: [3.6, 7.2],
  h1: [3.4, 6.0],
  BR5a: [3.549, 5.459],
  BR5b: [3.565, 5.401],
  h2: [3.7, 4.9],
  h3: [2.9, 3.9],
  h4: [2.2, 2.9],
  BR3a: [1.82, 1.98],
  BR3b: [1.794, 1.915],
  h5: [1.5, 1.2],
  T1: [0.9, 0.4],
  HOS: [1.35, 0.05],
  h6: [0.2, -0.6],
  h7: [-1.0, -1.4],
  h8: [-2.2, -2.2],
  h9: [-3.6, -2.8],
  h10: [-4.8, -3.4],
  ram: [4.3, 5.4],
  thu: [3.9, 2.9],
  BR4a: [2.58, 5.76],
  BR4b: [2.42, 5.74],
  m1: [1.8, 5.9],
  man: [1.2, 5.8],
  sip: [0.5, 4.8],
  phu: [2.5, 0.6],
  pip: [-1.15, -0.35],
  mai: [-2.0, -3.2],
  dev: [-3.8, -2.3],
  BR1a: [-0.036, 0.636],
  BR1b: [-0.164, 0.764],
  kal: [-0.8, 1.7],
  BR2a: [-1.567, 1.934],
  BR2b: [-1.673, 1.966],
  n3: [-2.4, 2.2],
  bho: [-2.9, 2.5],
  tha: [-3.4, 3.4],
};

export interface EdgeDef {
  id: string;
  name: string;
  from: string;
  to: string;
  cls: "primary" | "secondary" | "track";
  via?: Pt[];
  bridge?: boolean;
  group?: string;
}

export const EDGES: EdgeDef[] = [
  { id: "R01", name: "Highway · Betrawati → Junction J1", from: "BET", to: "h1", cls: "primary" },
  { id: "R02", name: "Highway · J1 → BR5 north approach", from: "h1", to: "BR5a", cls: "primary", group: "BR5" },
  { id: "R03", name: "BR5 span", from: "BR5a", to: "BR5b", cls: "primary", bridge: true, group: "BR5" },
  { id: "R04", name: "Highway · BR5 south approach → J2", from: "BR5b", to: "h2", cls: "primary", group: "BR5" },
  { id: "R05", name: "Highway · Junction J2 → J3", from: "h2", to: "h3", cls: "primary" },
  { id: "R06", name: "Highway · Junction J3 → J4", from: "h3", to: "h4", cls: "primary" },
  { id: "R07", name: "Highway · J4 → BR3 north approach", from: "h4", to: "BR3a", cls: "primary", group: "BR3" },
  { id: "R08", name: "BR3 span", from: "BR3a", to: "BR3b", cls: "primary", bridge: true, group: "BR3" },
  { id: "R09", name: "Highway · BR3 south approach → J5", from: "BR3b", to: "h5", cls: "primary", group: "BR3" },
  { id: "R10", name: "Highway · Junction J5 → Trishuli Bazar", from: "h5", to: "T1", cls: "primary" },
  { id: "R11", name: "Trishuli Bazar → District Hospital", from: "T1", to: "HOS", cls: "secondary" },
  { id: "R12", name: "Highway · Trishuli Bazar → J6", from: "T1", to: "h6", cls: "primary" },
  { id: "R13", name: "Highway · J6 → J7", from: "h6", to: "h7", cls: "primary" },
  { id: "R14", name: "Highway · J7 → J8", from: "h7", to: "h8", cls: "primary" },
  { id: "R15", name: "Highway · J8 → J9", from: "h8", to: "h9", cls: "primary" },
  { id: "R16", name: "Highway · J9 → J10", from: "h9", to: "h10", cls: "primary" },
  { id: "R20", name: "Spur road · J2 → Ramche", from: "h2", to: "ram", cls: "secondary" },
  { id: "R21", name: "Spur road · J3 → Thulogaun", from: "h3", to: "thu", cls: "secondary", via: [[3.4, 3.4]] },
  { id: "R22", name: "Road · J1 → BR4 east approach", from: "h1", to: "BR4a", cls: "secondary", group: "BR4" },
  { id: "R23", name: "BR4 span", from: "BR4a", to: "BR4b", cls: "secondary", bridge: true, group: "BR4" },
  { id: "R24", name: "Track · BR4 west approach → Junction M1", from: "BR4b", to: "m1", cls: "track", group: "BR4" },
  { id: "R25", name: "Track · Junction M1 → Mankha", from: "m1", to: "man", cls: "track" },
  { id: "R26", name: "Track · Mankha → Sipapokhari", from: "man", to: "sip", cls: "track", via: [[0.8, 5.3]] },
  { id: "R27", name: "Track · J5 → Phulbari", from: "h5", to: "phu", cls: "track" },
  { id: "R28", name: "Track · J7 → Pipaltar (floodplain access)", from: "h7", to: "pip", cls: "track" },
  { id: "R29", name: "Track · J8 → Mailung", from: "h8", to: "mai", cls: "track" },
  { id: "R30", name: "Track · J9 → Devighat", from: "h9", to: "dev", cls: "track" },
  { id: "R31", name: "Road · Trishuli Bazar → BR1 east approach", from: "T1", to: "BR1a", cls: "secondary", via: [[0.4, 0.45]], group: "BR1" },
  { id: "R32", name: "BR1 span", from: "BR1a", to: "BR1b", cls: "secondary", bridge: true, group: "BR1" },
  { id: "R33", name: "Road · BR1 west approach → Kalikasthan", from: "BR1b", to: "kal", cls: "secondary", group: "BR1" },
  { id: "R34", name: "Track · Kalikasthan → BR2 east approach", from: "kal", to: "BR2a", cls: "track", group: "BR2" },
  { id: "R35", name: "BR2 span", from: "BR2a", to: "BR2b", cls: "track", bridge: true, group: "BR2" },
  { id: "R36", name: "Track · BR2 west approach → Junction W1", from: "BR2b", to: "n3", cls: "track", group: "BR2" },
  { id: "R37", name: "Track · Junction W1 → Bhotechaur", from: "n3", to: "bho", cls: "track" },
  { id: "R38", name: "Track · Bhotechaur → Thanapati", from: "bho", to: "tha", cls: "track" },
];

export interface GroupMeta {
  name: string;
  nameNe: string;
}
export const BRIDGE_GROUPS: Record<string, GroupMeta> = {
  BR1: { name: "Trishuli Bazar Bridge (BR1) + approaches", nameNe: "त्रिशूली बजार पुल (BR1) र पहुँच मार्ग" },
  BR2: { name: "Tributary W1 bridge (BR2) + approaches", nameNe: "सहायक खोला W1 पुल (BR2) र पहुँच मार्ग" },
  BR3: { name: "Tributary E1 bridge (BR3) + approaches", nameNe: "सहायक खोला E1 पुल (BR3) र पहुँच मार्ग" },
  BR4: { name: "Upper Trishuli bridge (BR4) + approaches", nameNe: "माथिल्लो त्रिशूली पुल (BR4) र पहुँच मार्ग" },
  BR5: { name: "Seasonal-stream bridge (BR5) + approaches", nameNe: "मौसमी खोल्सी पुल (BR5) र पहुँच मार्ग" },
};

export interface ServiceDef {
  id: string;
  node: string;
  name: string;
  nameNe: string;
  kind: "town" | "hospital";
}
export const SERVICES: ServiceDef[] = [
  { id: "T1", node: "T1", name: "Trishuli Bazar (town)", nameNe: "त्रिशूली बजार (सहर)", kind: "town" },
  { id: "BET", node: "BET", name: "Betrawati (town)", nameNe: "बेत्रावती (सहर)", kind: "town" },
  { id: "HOS", node: "HOS", name: "Trishuli District Hospital", nameNe: "त्रिशूली जिल्ला अस्पताल", kind: "hospital" },
];

export interface SettlementDef {
  id: string;
  node: string;
  name: string;
  nameNe: string;
  buildings: number;
  spread: number;
}
export const SETTLEMENTS: SettlementDef[] = [
  { id: "ram", node: "ram", name: "Ramche", nameNe: "रामचे", buildings: 22, spread: 0.16 },
  { id: "thu", node: "thu", name: "Thulogaun", nameNe: "ठूलोगाउँ", buildings: 28, spread: 0.18 },
  { id: "man", node: "man", name: "Mankha", nameNe: "मानखा", buildings: 24, spread: 0.17 },
  { id: "sip", node: "sip", name: "Sipapokhari", nameNe: "सिपापोखरी", buildings: 16, spread: 0.14 },
  { id: "kal", node: "kal", name: "Kalikasthan", nameNe: "कालिकास्थान", buildings: 30, spread: 0.2 },
  { id: "bho", node: "bho", name: "Bhotechaur", nameNe: "भोटेचौर", buildings: 20, spread: 0.15 },
  { id: "tha", node: "tha", name: "Thanapati", nameNe: "थानापति", buildings: 14, spread: 0.13 },
  { id: "pip", node: "pip", name: "Pipaltar", nameNe: "पिपलतार", buildings: 26, spread: 0.12 },
  { id: "dev", node: "dev", name: "Devighat", nameNe: "देविघाट", buildings: 18, spread: 0.14 },
  { id: "phu", node: "phu", name: "Phulbari", nameNe: "फुलबारी", buildings: 24, spread: 0.17 },
  { id: "mai", node: "mai", name: "Mailung", nameNe: "मैलुङ", buildings: 18, spread: 0.15 },
];

/** Extra building clusters around the service towns (settlementId refers to the town). */
export const TOWN_CLUSTERS: { settlementId: string; center: Pt; count: number; spread: number }[] = [
  { settlementId: "T1", center: [0.9, 0.4], count: 90, spread: 0.28 },
  { settlementId: "T1", center: [0.45, 0.55], count: 45, spread: 0.15 },
  { settlementId: "BET", center: [3.6, 7.2], count: 55, spread: 0.25 },
];

/* ------------------------------ Sample acquisitions ------------------------------ */

export const CATALOG: Acquisition[] = [
  { id: "S1_20260802", sensor: "S1", date: "2026-08-02", product: "IW GRDH · VV+VH", orbit: "DESC", relOrbit: 85 },
  { id: "S1_20260814", sensor: "S1", date: "2026-08-14", product: "IW GRDH · VV+VH", orbit: "DESC", relOrbit: 85 },
  { id: "S1_20260820", sensor: "S1", date: "2026-08-20", product: "IW GRDH · VV+VH", orbit: "ASC", relOrbit: 12 },
  { id: "S1_20260827", sensor: "S1", date: "2026-08-27", product: "IW GRDH · VV+VH", orbit: "DESC", relOrbit: 85 },
  { id: "S1_20260908", sensor: "S1", date: "2026-09-08", product: "IW GRDH · VV+VH", orbit: "DESC", relOrbit: 85 },
  { id: "S2_20260806", sensor: "S2", date: "2026-08-06", product: "MSI L2A", cloudPct: 9 },
  { id: "S2_20260816", sensor: "S2", date: "2026-08-16", product: "MSI L2A", cloudPct: 8 },
  { id: "S2_20260821", sensor: "S2", date: "2026-08-21", product: "MSI L2A", cloudPct: 14 },
  { id: "S2_20260828", sensor: "S2", date: "2026-08-28", product: "MSI L2A", cloudPct: 38 },
  { id: "S2_20260902", sensor: "S2", date: "2026-09-02", product: "MSI L2A", cloudPct: 12 },
];

/** Buildings: OSM-style `building=*` mix used when generating sample footprints. */
export const BUILDING_KINDS: [string, number][] = [
  ["house", 0.7],
  ["residential", 0.1],
  ["retail", 0.06],
  ["school", 0.04],
  ["religious", 0.04],
  ["public", 0.03],
  ["farm_auxiliary", 0.03],
];
