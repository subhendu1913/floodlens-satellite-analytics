/** Planar km coordinates (east, north) relative to the scenario origin. */
export type Pt = [number, number];
/** Geographic coordinates [lat, lon]. */
export type LL = [number, number];

export type SensorMode = "S1S2" | "S1" | "S2";
export type Lang = "en" | "ne";
export type Severity = "ok" | "info" | "warn" | "error";

export type PickKey = "s1Pre" | "s1Post" | "s2Pre" | "s2Post";

export interface AnalysisParams {
  locationName: string;
  lat: number;
  lon: number;
  eventDate: string;
  /** Requested analysis period (inclusive). Satellite acquisitions only exist at discrete dates inside it. */
  fromDate: string;
  toDate: string;
  sensor: SensorMode;
  /** Acquisition ids chosen by the user. Unset keys are matched automatically. */
  picks: Partial<Record<PickKey, string>>;
}

/** Differences between the pre-event mapped state and the post-event detections for the analysis period. */
export interface ChangeSummary {
  fromDate: string;
  toDate: string;
  eventDate: string;
  /** Area of pre-event mapped (OSM-derived) waterways inside the detected reaches. */
  baselineWaterKm2: number;
  detectedWaterKm2: number;
  addedWaterKm2: number;
  uncertainKm2: number;
  debrisKm2: number;
  buildingsExposed: number;
  roadsFlagged: number;
  bridgesFlagged: number;
  settlementsChanged: { id: string; name: string; nameNe: string; from: AccessStatus; to: AccessStatus }[];
}

export interface Acquisition {
  id: string;
  sensor: "S1" | "S2";
  date: string;
  product: string;
  orbit?: "ASC" | "DESC";
  relOrbit?: number;
  cloudPct?: number;
}

export interface MatchedAcquisitions {
  s1Pre?: Acquisition;
  s1Post?: Acquisition;
  s2Pre?: Acquisition;
  s2Post?: Acquisition;
  /** Nearest pre-event S1 scene that was rejected for incompatible geometry. */
  s1Rejected?: Acquisition;
  /** Selected images that lie outside the requested period (e.g. an earlier baseline scene). */
  outside: PickKey[];
  /** Images chosen manually by the user rather than matched automatically. */
  manual: PickKey[];
}

export interface ValidationItem {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
}

export type ImpactState = "none" | "suspected" | "blocked";
export type BuildingState = "none" | "possible" | "likely" | "unassessed";
export type AccessStatus = "connected" | "suspected" | "disconnected";
/** Rule-based priority tier: 1 = investigate first, 2 = next, 3 = verify when possible, 0 = none. */
export type Tier = 0 | 1 | 2 | 3;
export interface DisruptedSegment {
  edgeId: string;
  name: string;
  state: ImpactState;
}
export type HospitalStatus = "reachable" | "uncertain" | "lost";

export interface FloodPoly {
  id: string;
  reachId: string;
  waterway: string;
  part: "core" | "fringe";
  kind: "water" | "uncertain";
  confidence: number;
  s1: number | null;
  s2: number | null;
  areaKm2: number;
  ring: LL[];
  hole?: LL[];
}

export interface DebrisZone {
  id: string;
  name: string;
  kind: "suspected" | "uncertain";
  confidence: number;
  s1: number | null;
  s2: number | null;
  areaKm2: number;
  ring: LL[];
}

export interface GapZone {
  id: string;
  name: string;
  reason: string;
  active: boolean;
  ring: LL[];
}

export interface WaterwayFeature {
  id: string;
  name: string;
  kind: "river" | "tributary" | "stream";
  line: LL[];
  permanent: LL[][];
}

export interface RoadImpact {
  state: ImpactState;
  confidence: number;
  waterM: number;
  waterRunM: number;
  uncertainRunM: number;
  debrisRunM: number;
  gapRunM: number;
  floodWidthM?: number;
  widthRatio?: number;
  reasons: string[];
}

export interface RoadFeature {
  id: string;
  name: string;
  cls: "primary" | "secondary" | "track";
  isBridge: boolean;
  groupId: string;
  from: string;
  to: string;
  coords: LL[];
  lengthKm: number;
  mid: LL;
  osmTag: string;
  impact: RoadImpact;
}

export interface BuildingFeature {
  id: string;
  settlementId: string;
  kind: string;
  pos: LL;
  state: BuildingState;
  confidence: number;
  reason: string;
}

export interface ServiceFeature {
  id: string;
  name: string;
  nameNe: string;
  kind: "town" | "hospital";
  pos: LL;
}

export interface RouteInfo {
  service: string;
  km: number;
}

export interface SettlementResult {
  id: string;
  name: string;
  nameNe: string;
  pos: LL;
  status: AccessStatus;
  baseline: RouteInfo | null;
  post: (RouteInfo & { viaUncertain: boolean }) | null;
  hospital: { status: HospitalStatus; baselineKm: number | null; postKm: number | null };
  buildings: { total: number; likely: number; possible: number };
  reliesOn: string[];
  hospitalReliesOn: string[];
  tier: Tier;
  /** Edge ids (settlement → service) of the pre-event shortest route. */
  baselineEdges: string[];
  /** Edge ids of the best-case post-event route (empty when modeled disconnected). */
  postEdges: string[];
  /** Flagged segments on the pre-event route to the nearest service. */
  disrupted: DisruptedSegment[];
  /** Flagged segments on the pre-event route to the nearest hospital. */
  hospitalDisrupted: DisruptedSegment[];
}

export interface AssetGroup {
  id: string;
  name: string;
  nameNe: string;
  kind: "bridge" | "road";
  edgeIds: string[];
  state: ImpactState;
  confidence: number;
  center: LL;
  dependents: string[];
  hospitalDependents: string[];
  tier: Tier;
  reasons: string[];
}

export interface Metrics {
  waterKm2: number;
  uncertainKm2: number;
  debrisKm2: number;
  buildingsTotal: number;
  buildingsLikely: number;
  buildingsPossible: number;
  buildingsUnassessed: number;
  roadKmTotal: number;
  roadKmInundated: number;
  roadSegmentsBlocked: number;
  roadSegmentsSuspected: number;
  bridgesTotal: number;
  bridgesBlocked: number;
  bridgesSuspected: number;
  settlementsTotal: number;
  settlementsDisconnected: number;
  settlementsSuspected: number;
  settlementsConnected: number;
  hospitalLost: number;
  hospitalUncertain: number;
}

export interface AnalysisResults {
  id: string;
  dataClass: "sample";
  params: AnalysisParams;
  effectiveSensor: SensorMode;
  acquisitions: MatchedAcquisitions;
  validation: ValidationItem[];
  recession: number;
  s2Cloud: boolean;
  flood: FloodPoly[];
  debris: DebrisZone[];
  gaps: GapZone[];
  waterways: WaterwayFeature[];
  roads: RoadFeature[];
  buildings: BuildingFeature[];
  services: ServiceFeature[];
  settlements: SettlementResult[];
  groups: AssetGroup[];
  metrics: Metrics;
  limitations: string[];
  /** Differences between the pre-event mapped state and the post-event detections for the analysis period. */
  changes: ChangeSummary;
  /** Road-network model shared by connectivity, chokepoint and simulator analyses. */
  network: {
    nodes: Record<string, LL>;
    settlementNodes: Record<string, string>;
    serviceNodes: Record<string, string>;
  };
}

export type FeatureKind =
  | "edge"
  | "building"
  | "settlement"
  | "service"
  | "flood"
  | "debris"
  | "gap"
  | "group";

export interface Selection {
  kind: FeatureKind;
  id: string;
}

export interface LayerState {
  flood: boolean;
  uncertain: boolean;
  debris: boolean;
  buildings: boolean;
  roads: boolean;
  bridges: boolean;
  settlements: boolean;
  rivers: boolean;
  services: boolean;
}

export type RunStatus = "idle" | "running" | "complete" | "error";
