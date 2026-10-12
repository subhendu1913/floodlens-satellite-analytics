import {
  BRIDGE_GROUPS,
  BUILDING_KINDS,
  CLOUD_MASK,
  DEBRIS,
  EDGES,
  NODES,
  SCENARIO,
  SERVICES,
  SETTLEMENTS,
  TOWN_CLUSTERS,
  WATERWAYS,
} from "../data/scenario";
import {
  blob,
  bufferPolygon,
  chaikin,
  dist,
  gaussian,
  inPoly,
  lineLength,
  makePoly,
  mulberry32,
  polygonArea,
  sampleAlong,
  toLL,
  type PolyT,
} from "../lib/geo";
import type {
  AnalysisParams,
  AnalysisResults,
  AssetGroup,
  BuildingFeature,
  BuildingState,
  DebrisZone,
  FloodPoly,
  GapZone,
  ImpactState,
  LL,
  Metrics,
  Pt,
  RoadFeature,
  RoadImpact,
  SensorMode,
  ServiceFeature,
  SettlementResult,
  WaterwayFeature,
} from "../types";
import { daysBetween, recessionFactor, validateParams } from "./acquisitions";
import { computeChanges } from "./changes";

/** Evidence thresholds (documented in the provenance panel). */
export const THRESHOLDS = { waterHigh: 0.75, uncertain: 0.4, debrisSuspected: 0.7, debrisUncertain: 0.35 };

const STEP_KM = 0.025;

interface PointClass {
  water: "water" | "uncertain" | null;
  wConf: number;
  debris: "suspected" | "uncertain" | null;
  dConf: number;
  gap: boolean;
}

const noise = (x: number, y: number) => 1 + 0.1 * Math.sin(x * 3.1 + y * 2.3) + 0.06 * Math.sin(x * 7.7 - y * 5.1);
const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

export function runDemoAnalysis(params: AnalysisParams): AnalysisResults {
  const base = buildResults(params);
  return { ...base, changes: computeChanges(base) };
}

function buildResults(params: AnalysisParams): Omit<AnalysisResults, "changes"> {
  const v = validateParams(params);
  if (!v.canRun || !v.effectiveSensor) {
    throw new Error(v.items.find((i) => i.severity === "error")?.title ?? "Analysis cannot run");
  }
  const sensor: SensorMode = v.effectiveSensor;
  const m = v.matched;
  const hasS1 = sensor !== "S2";
  const hasS2 = sensor !== "S1";
  const postCloud = hasS2 ? (m.s2Post?.cloudPct ?? 0) : 0;
  const cloudActive = hasS2 && postCloud >= 25;
  const gapActive = cloudActive && !hasS1;

  const postDates = [hasS1 ? m.s1Post?.date : undefined, hasS2 ? m.s2Post?.date : undefined].filter(Boolean) as string[];
  const daysAfter = daysBetween(params.eventDate, postDates.sort()[0]);
  const recession = recessionFactor(daysAfter);

  /* ------------------------- evidence fusion ------------------------- */
  const optical = (cloudy?: boolean, val?: number) => (hasS2 && !(cloudy && cloudActive) ? (val ?? null) : null);
  const fuseWater = (s1: number, s2: number, cloudy?: boolean) => {
    const a = hasS1 ? s1 : null;
    const b = optical(cloudy, s2);
    if (a != null && b != null) return Math.min(0.99, a + (b > 0.7 ? 0.04 : 0));
    if (a != null) return a * 0.97;
    if (b != null) return b * 0.95;
    return 0;
  };
  const fuseDebris = (s1: number, s2: number, cloudy?: boolean) => {
    const a = hasS1 ? s1 : null;
    const b = optical(cloudy, s2);
    if (a != null && b != null) return 0.5 * a + 0.5 * b;
    if (a != null) return 0.7 * a;
    if (b != null) return 0.95 * b;
    return 0;
  };

  /* ------------------------- waterways & flood ------------------------- */
  const flood: FloodPoly[] = [];
  const waterways: WaterwayFeature[] = [];
  const cores: { poly: PolyT; kind: "water" | "uncertain"; conf: number }[] = [];
  const fringes: { poly: PolyT; kind: "water" | "uncertain"; conf: number }[] = [];

  for (const w of WATERWAYS) {
    if (w.reaches.length === 0) {
      const line = chaikin(w.pts, 3) as Pt[];
      waterways.push({ id: w.id, name: w.name, kind: w.kind, line: line.map(toLL), permanent: [] });
      continue;
    }
    const line: Pt[] = [];
    const permanent: LL[][] = [];
    w.reaches.forEach((reach, ri) => {
      const sub = w.pts.slice(reach.from, reach.to + 1);
      const tri = sub.map((p, i) => [p[0], p[1], (reach.halfWidthM[i] / 1000) * recession]);
      const sm = chaikin(tri, 3);
      const center: Pt[] = sm.map((t) => [t[0], t[1]]);
      const hw = sm.map((t) => t[2] * noise(t[0], t[1]));
      const coreRing = bufferPolygon(center, hw);
      const fringeRing = bufferPolygon(center, hw.map((x) => x * 1.55 + 0.02));
      permanent.push(bufferPolygon(center, center.map(() => w.permHalfM / 1000)).map(toLL));
      line.push(...(ri === 0 ? center : center.slice(1)));

      const conf = fuseWater(reach.s1, reach.s2, reach.s2Cloud);
      const s1 = hasS1 ? reach.s1 : null;
      const s2 = optical(reach.s2Cloud, reach.s2);
      const coreArea = polygonArea(coreRing);
      if (conf >= THRESHOLDS.uncertain) {
        const kind = conf >= THRESHOLDS.waterHigh ? "water" : "uncertain";
        cores.push({ poly: makePoly(coreRing), kind, conf });
        flood.push({
          id: `${reach.id}-core`,
          reachId: reach.id,
          waterway: w.name,
          part: "core",
          kind,
          confidence: r2(conf),
          s1,
          s2,
          areaKm2: coreArea,
          ring: coreRing.map(toLL),
        });
      }
      const fConf = conf * 0.6;
      if (fConf >= THRESHOLDS.uncertain) {
        fringes.push({ poly: makePoly(fringeRing), kind: "uncertain", conf: fConf });
        flood.push({
          id: `${reach.id}-fringe`,
          reachId: reach.id,
          waterway: w.name,
          part: "fringe",
          kind: "uncertain",
          confidence: r2(fConf),
          s1,
          s2,
          areaKm2: Math.max(0, polygonArea(fringeRing) - coreArea),
          ring: fringeRing.map(toLL),
          hole: coreRing.map(toLL),
        });
      }
    });
    waterways.push({ id: w.id, name: w.name, kind: w.kind, line: line.map(toLL), permanent });
  }

  /* ------------------------- debris & data gaps ------------------------- */
  const rng = mulberry32(11);
  const debrisRings = DEBRIS.map((d) => blob(d.center, d.radiusKm, rng, 16));
  const cloudRing = blob(CLOUD_MASK.center, CLOUD_MASK.radiusKm, rng, 22);
  const cloudPoly = makePoly(cloudRing);

  const debris: DebrisZone[] = [];
  const debrisPolys: { poly: PolyT; kind: "suspected" | "uncertain"; conf: number }[] = [];
  DEBRIS.forEach((d, i) => {
    const conf = fuseDebris(d.s1, d.s2, d.s2Cloud);
    if (conf < THRESHOLDS.debrisUncertain) return;
    const kind = conf >= THRESHOLDS.debrisSuspected ? "suspected" : "uncertain";
    debrisPolys.push({ poly: makePoly(debrisRings[i]), kind, conf });
    debris.push({
      id: d.id,
      name: d.name,
      kind,
      confidence: r2(conf),
      s1: hasS1 ? d.s1 : null,
      s2: optical(d.s2Cloud, d.s2),
      areaKm2: polygonArea(debrisRings[i]),
      ring: debrisRings[i].map(toLL),
    });
  });

  const gaps: GapZone[] = cloudActive
    ? [
        {
          id: "G1",
          name: "Sentinel-2 cloud / shadow mask (post-event scene)",
          reason: `Post-event optical scene has ${postCloud}% cloud cover; optical evidence is unavailable inside this mask.`,
          active: gapActive,
          ring: cloudRing.map(toLL),
        },
      ]
    : [];

  /* ------------------------- point classifier ------------------------- */
  const classify = (p: Pt): PointClass => {
    let water: PointClass["water"] = null;
    let wConf = 0;
    for (const c of cores) {
      if (inPoly(p, c.poly)) {
        water = c.kind;
        wConf = c.conf;
        break;
      }
    }
    if (!water) {
      for (const f of fringes) {
        if (inPoly(p, f.poly)) {
          water = f.kind;
          wConf = f.conf;
          break;
        }
      }
    }
    let debrisK: PointClass["debris"] = null;
    let dConf = 0;
    for (const d of debrisPolys) {
      if (!inPoly(p, d.poly)) continue;
      if (debrisK === "suspected" && d.kind !== "suspected") continue;
      if (debrisK === null || d.conf > dConf || (debrisK === "uncertain" && d.kind === "suspected")) {
        debrisK = d.kind;
        dConf = d.conf;
      }
    }
    const gap = gapActive && !water && inPoly(p, cloudPoly);
    return { water, wConf, debris: debrisK, dConf, gap };
  };

  /* ------------------------- roads & bridges ------------------------- */
  const analyzeEdge = (poly: Pt[]): RoadImpact => {
    const samples = sampleAlong(poly, STEP_KM);
    let w = 0,
      u = 0,
      ds = 0,
      du = 0,
      g = 0;
    let mw = 0,
      mu = 0,
      mds = 0,
      mdu = 0,
      mg = 0,
      waterN = 0;
    let wC = 0,
      uC = 0,
      dsC = 0,
      duC = 0;
    for (const p of samples) {
      const c = classify(p);
      if (c.water === "water") {
        w++;
        waterN++;
        wC = Math.max(wC, c.wConf);
      } else w = 0;
      if (c.water === "uncertain") {
        u++;
        uC = Math.max(uC, c.wConf);
      } else u = 0;
      if (c.debris === "suspected") {
        ds++;
        dsC = Math.max(dsC, c.dConf);
      } else ds = 0;
      if (c.debris === "uncertain") {
        du++;
        duC = Math.max(duC, c.dConf);
      } else du = 0;
      if (c.gap) g++;
      else g = 0;
      mw = Math.max(mw, w);
      mu = Math.max(mu, u);
      mds = Math.max(mds, ds);
      mdu = Math.max(mdu, du);
      mg = Math.max(mg, g);
    }
    const m25 = (n: number) => Math.round(n * STEP_KM * 1000);
    const reasons: string[] = [];
    let state: ImpactState = "none";
    let confidence = 0;
    if (mw >= 4) {
      state = "blocked";
      confidence = wC;
      reasons.push(`High-confidence detected water over ≈${m25(mw)} m of the carriageway — likely impassable while inundated (modeled; not proof of destruction).`);
    }
    if (mu >= 4) {
      if (state === "none") state = "suspected";
      confidence = Math.max(confidence, uC);
      reasons.push(`Uncertain water signal over ≈${m25(mu)} m — passability unknown.`);
    }
    if (mds >= 2 || mdu >= 2) {
      if (state === "none") state = "suspected";
      const c = Math.max(dsC, duC);
      confidence = Math.max(confidence, c);
      reasons.push(`Crosses a ${mds >= 2 ? "suspected" : "uncertain"} debris indicator for ≈${m25(Math.max(mds, mdu))} m — possible obstruction (not confirmed).`);
    }
    if (mg >= 4) {
      if (state === "none") state = "suspected";
      confidence = Math.max(confidence, 0.3);
      reasons.push(`≈${m25(mg)} m lies in a cloud-obscured gap with no radar to compensate — not assessable, treated as uncertain.`);
    }
    return {
      state,
      confidence: r2(confidence),
      waterM: waterN * STEP_KM * 1000,
      waterRunM: m25(mw),
      uncertainRunM: m25(mu),
      debrisRunM: m25(Math.max(mds, mdu)),
      gapRunM: m25(mg),
      reasons,
    };
  };

  const analyzeBridge = (a: Pt, b: Pt): RoadImpact => {
    const lenM = dist(a, b) * 1000;
    const dx = (b[0] - a[0]) / (dist(a, b) || 1);
    const dy = (b[1] - a[1]) / (dist(a, b) || 1);
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const step = 0.01;
    const n = 50;
    const cls: PointClass[] = [];
    for (let i = -n; i <= n; i++) cls.push(classify([mid[0] + dx * i * step, mid[1] + dy * i * step]));
    const c0 = cls[n];
    const runLen = (pred: (c: PointClass) => boolean) => {
      let l = n;
      while (l > 0 && pred(cls[l - 1])) l--;
      let r = n;
      while (r < 2 * n && pred(cls[r + 1])) r++;
      return (r - l + 1) * step * 1000;
    };
    const waterWidth = c0.water === "water" ? runLen((c) => c.water === "water") : 0;
    const totalWidth = c0.water ? runLen((c) => c.water !== null) : 0;
    const near = cls.slice(n - 6, n + 7);
    const debrisNear = near.some((c) => c.debris !== null);
    const debrisConf = Math.max(0, ...near.map((c) => c.dConf));
    const gapCenter = c0.gap;
    const rw = waterWidth / lenM;
    const rt = totalWidth / lenM;

    const reasons: string[] = [];
    let state: ImpactState = "none";
    let confidence = 0;
    if (rw >= 2.0) {
      state = "blocked";
      confidence = c0.wConf;
      reasons.push(`Detected flood corridor along the span axis ≈${Math.round(waterWidth)} m vs. structure ≈${Math.round(lenM)} m (${rw.toFixed(1)}×): approaches very likely inundated, crossing likely impassable. Structural condition unknown.`);
    } else if (rw >= 1.15 || (c0.water === "uncertain" && rt >= 1.15)) {
      state = "suspected";
      confidence = c0.wConf;
      reasons.push(`Flood corridor ≈${Math.round(totalWidth || waterWidth)} m wide vs. structure ≈${Math.round(lenM)} m (${(rw || rt).toFixed(1)}×): approaches may be overtopped or scoured — inspection recommended.`);
    }
    if (debrisNear) {
      if (state === "none") state = "suspected";
      confidence = Math.max(confidence, debrisConf);
      reasons.push("Debris indicator within ≈60 m of the structure (suspected, not confirmed).");
    }
    if (gapCenter) {
      if (state === "none") state = "suspected";
      confidence = Math.max(confidence, 0.3);
      reasons.push("Structure lies in a cloud-obscured gap; not assessable from optical data.");
    }
    return {
      state,
      confidence: r2(confidence),
      waterM: 0,
      waterRunM: Math.round(waterWidth),
      uncertainRunM: Math.round(Math.max(0, totalWidth - waterWidth)),
      debrisRunM: debrisNear ? 60 : 0,
      gapRunM: gapCenter ? 100 : 0,
      floodWidthM: Math.round(totalWidth || waterWidth),
      widthRatio: r1(rw || rt),
      reasons,
    };
  };

  const roads: RoadFeature[] = EDGES.map((e) => {
    const a = NODES[e.from];
    const b = NODES[e.to];
    const poly: Pt[] = [a, ...(e.via ?? []), b];
    const impact = e.bridge ? analyzeBridge(a, b) : analyzeEdge(poly);
    const samples = sampleAlong(poly, 0.05);
    const mid: Pt = e.bridge ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : samples[Math.floor(samples.length / 2)];
    const tag = `highway=${e.cls}${e.bridge ? " · bridge=yes" : ""}`;
    return {
      id: e.id,
      name: e.name,
      cls: e.cls,
      isBridge: !!e.bridge,
      groupId: e.group ?? e.id,
      from: e.from,
      to: e.to,
      coords: poly.map(toLL),
      lengthKm: lineLength(poly),
      mid: toLL(mid),
      osmTag: tag,
      impact,
    };
  });

  /* ------------------------- buildings ------------------------- */
  const brng = mulberry32(7);
  const pickKind = () => {
    let t = brng();
    for (const [k, p] of BUILDING_KINDS) {
      if ((t -= p) <= 0) return k;
    }
    return "house";
  };
  const rawBuildings: { sid: string; p: Pt; kind: string }[] = [];
  for (const s of SETTLEMENTS) {
    const c = NODES[s.node];
    for (let i = 0; i < s.buildings; i++) {
      rawBuildings.push({ sid: s.id, p: [c[0] + gaussian(brng) * s.spread, c[1] + gaussian(brng) * s.spread], kind: pickKind() });
    }
  }
  for (const t of TOWN_CLUSTERS) {
    for (let i = 0; i < t.count; i++) {
      rawBuildings.push({ sid: t.settlementId, p: [t.center[0] + gaussian(brng) * t.spread, t.center[1] + gaussian(brng) * t.spread], kind: pickKind() });
    }
  }
  const buildings: BuildingFeature[] = rawBuildings.map((b, i) => {
    const c = classify(b.p);
    let state: BuildingState = "none";
    let confidence = 0;
    let reason = "No flood or debris indicator at this location.";
    if (c.water === "water") {
      state = "likely";
      confidence = c.wConf;
      reason = "Footprint lies inside high-confidence detected water (likely inundated).";
    } else if (c.water === "uncertain") {
      state = "possible";
      confidence = c.wConf;
      reason = "Footprint lies inside an uncertain water mask (possibly inundated).";
    } else if (c.debris) {
      state = "possible";
      confidence = c.dConf;
      reason = `Footprint lies inside a ${c.debris} debris indicator (possible debris exposure).`;
    } else if (c.gap) {
      state = "unassessed";
      reason = "Cloud-obscured: cannot be assessed from optical data alone.";
    }
    return { id: `B${String(i + 1).padStart(3, "0")}`, settlementId: b.sid, kind: b.kind, pos: toLL(b.p), state, confidence: r2(confidence), reason };
  });

  /* ------------------------- network connectivity ------------------------- */
  interface GE {
    id: string;
    a: string;
    b: string;
    w: number;
  }
  const gEdges: GE[] = roads.map((r) => ({ id: r.id, a: r.from, b: r.to, w: r.lengthKm }));
  const adj = new Map<string, { to: string; id: string; w: number }[]>();
  for (const e of gEdges) {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a)!.push({ to: e.b, id: e.id, w: e.w });
    adj.get(e.b)!.push({ to: e.a, id: e.id, w: e.w });
  }
  interface DRes {
    d: Map<string, number>;
    prev: Map<string, { node: string; edge: string }>;
  }
  const dijkstra = (src: string, removed: Set<string>): DRes => {
    const d = new Map<string, number>([[src, 0]]);
    const prev = new Map<string, { node: string; edge: string }>();
    const done = new Set<string>();
    for (;;) {
      let u: string | null = null;
      let best = Infinity;
      for (const [k, val] of d) if (!done.has(k) && val < best) ((u = k), (best = val));
      if (u === null) break;
      done.add(u);
      for (const nb of adj.get(u) ?? []) {
        if (removed.has(nb.id)) continue;
        const nd = best + nb.w;
        if (nd < (d.get(nb.to) ?? Infinity)) {
          d.set(nb.to, nd);
          prev.set(nb.to, { node: u, edge: nb.id });
        }
      }
    }
    return { d, prev };
  };

  const blockedSet = new Set(roads.filter((r) => r.impact.state === "blocked").map((r) => r.id));
  const lenientSet = new Set(roads.filter((r) => r.impact.state !== "none").map((r) => r.id));
  const runsFor = (removed: Set<string>) => new Map(SERVICES.map((s) => [s.id, dijkstra(s.node, removed)]));
  const baseRuns = runsFor(new Set());
  const strictRuns = runsFor(blockedSet);
  const lenRuns = runsFor(lenientSet);

  const best = (runs: Map<string, DRes>, node: string, onlyHospital = false) => {
    let out: { service: string; km: number } | null = null;
    for (const s of SERVICES) {
      if (onlyHospital && s.kind !== "hospital") continue;
      const km = runs.get(s.id)!.d.get(node);
      if (km !== undefined && (!out || km < out.km)) out = { service: s.id, km };
    }
    return out;
  };
  const trace = (runs: Map<string, DRes>, serviceId: string, node: string): string[] => {
    const svc = SERVICES.find((s) => s.id === serviceId)!;
    const res = runs.get(serviceId)!;
    const groups: string[] = [];
    let cur = node;
    let guard = 0;
    while (cur !== svc.node && guard++ < 200) {
      const p = res.prev.get(cur);
      if (!p) break;
      const road = roads.find((r) => r.id === p.edge)!;
      if (!groups.includes(road.groupId)) groups.push(road.groupId);
      cur = p.node;
    }
    return groups;
  };
  const traceEdges = (runs: Map<string, DRes>, serviceId: string, node: string): string[] => {
    const svc = SERVICES.find((s) => s.id === serviceId)!;
    const res = runs.get(serviceId)!;
    const out: string[] = [];
    let cur = node;
    let guard = 0;
    while (cur !== svc.node && guard++ < 200) {
      const p = res.prev.get(cur);
      if (!p) break;
      out.push(p.edge);
      cur = p.node;
    }
    return out;
  };
  const svcName = (id: string) => SERVICES.find((s) => s.id === id)!.name;

  const settlements: SettlementResult[] = SETTLEMENTS.map((s) => {
    const baseAny = best(baseRuns, s.node);
    const baseHosp = best(baseRuns, s.node, true);
    const strictAny = best(strictRuns, s.node);
    const strictHosp = best(strictRuns, s.node, true);
    const lenAny = best(lenRuns, s.node);
    const lenHosp = best(lenRuns, s.node, true);
    const status = !strictAny ? "disconnected" : !lenAny ? "suspected" : "connected";
    const post =
      status === "disconnected"
        ? null
        : status === "suspected"
          ? { service: svcName(strictAny!.service), km: r1(strictAny!.km), viaUncertain: true }
          : { service: svcName(lenAny!.service), km: r1(lenAny!.km), viaUncertain: false };
    const hStatus = !strictHosp ? "lost" : !lenHosp ? "uncertain" : "reachable";
    const own = buildings.filter((b) => b.settlementId === s.id);
    const likely = own.filter((b) => b.state === "likely").length;
    const possible = own.filter((b) => b.state === "possible").length;
    // Transparent, rule-based tier (no numeric severity score).
    const tier: 0 | 1 | 2 | 3 = status === "disconnected" ? 1 : status === "suspected" ? 2 : hStatus !== "reachable" ? 3 : 0;
    const baseEdges = baseAny ? traceEdges(baseRuns, baseAny.service, s.node) : [];
    const hospEdges = baseHosp ? traceEdges(baseRuns, baseHosp.service, s.node) : [];
    const postEdges =
      status === "disconnected"
        ? []
        : status === "suspected"
          ? traceEdges(strictRuns, strictAny!.service, s.node)
          : traceEdges(lenRuns, lenAny!.service, s.node);
    const flaggedOf = (ids: string[]) =>
      ids
        .map((id) => roads.find((x) => x.id === id)!)
        .filter((x) => x.impact.state !== "none")
        .map((x) => ({ edgeId: x.id, name: x.name, state: x.impact.state }));
    return {
      id: s.id,
      name: s.name,
      nameNe: s.nameNe,
      pos: toLL(NODES[s.node]),
      status,
      baseline: baseAny ? { service: svcName(baseAny.service), km: r1(baseAny.km) } : null,
      post,
      hospital: {
        status: hStatus,
        baselineKm: baseHosp ? r1(baseHosp.km) : null,
        postKm: hStatus === "reachable" ? r1(lenHosp!.km) : hStatus === "uncertain" ? r1(strictHosp!.km) : null,
      },
      buildings: { total: own.length, likely, possible },
      reliesOn: baseAny ? trace(baseRuns, baseAny.service, s.node) : [],
      hospitalReliesOn: baseHosp ? trace(baseRuns, baseHosp.service, s.node) : [],
      tier,
      baselineEdges: baseEdges,
      postEdges,
      disrupted: flaggedOf(baseEdges),
      hospitalDisrupted: flaggedOf(hospEdges),
    };
  });

  const services: ServiceFeature[] = SERVICES.map((s) => ({ id: s.id, name: s.name, nameNe: s.nameNe, kind: s.kind, pos: toLL(NODES[s.node]) }));

  /* ------------------------- asset groups & priorities ------------------------- */
  const rank: Record<ImpactState, number> = { none: 0, suspected: 1, blocked: 2 };
  const byGroup = new Map<string, RoadFeature[]>();
  for (const r of roads) {
    if (!byGroup.has(r.groupId)) byGroup.set(r.groupId, []);
    byGroup.get(r.groupId)!.push(r);
  }
  const groups: AssetGroup[] = [];
  for (const [gid, list] of byGroup) {
    const state = list.reduce<ImpactState>((s, r) => (rank[r.impact.state] > rank[s] ? r.impact.state : s), "none");
    const bridge = list.find((r) => r.isBridge);
    const meta = BRIDGE_GROUPS[gid];
    const conf = Math.max(0, ...list.filter((r) => r.impact.state === state).map((r) => r.impact.confidence));
    const dependents = settlements.filter((s) => s.reliesOn.includes(gid) && s.status !== "connected").map((s) => s.id);
    const hospitalDependents = settlements
      .filter((s) => s.hospitalReliesOn.includes(gid) && s.hospital.status !== "reachable" && !dependents.includes(s.id))
      .map((s) => s.id);
    const reasons: string[] = [];
    for (const r of list) {
      if (r.impact.state === "none") continue;
      const label = r.isBridge ? "Span" : meta ? "Approach" : "Segment";
      for (const t of r.impact.reasons) reasons.push(`${label}: ${t}`);
    }
    groups.push({
      id: gid,
      name: meta?.name ?? list[0].name,
      nameNe: meta?.nameNe ?? `सडक खण्ड ${gid} (${list[0].name})`,
      kind: bridge ? "bridge" : "road",
      edgeIds: list.map((r) => r.id),
      state,
      confidence: conf,
      center: (bridge ?? list[0]).mid,
      dependents,
      hospitalDependents,
      tier: state === "none" ? 0 : state === "blocked" ? (dependents.length > 0 ? 1 : 2) : dependents.length > 0 ? 2 : 3,
      reasons,
    });
  }
  groups.sort((a, b) => (a.tier || 9) - (b.tier || 9) || b.dependents.length - a.dependents.length || b.confidence - a.confidence || a.name.localeCompare(b.name));

  /* ------------------------- metrics ------------------------- */
  const sumArea = (f: (p: FloodPoly) => boolean) => flood.filter(f).reduce((s, p) => s + p.areaKm2, 0);
  const nonBridge = roads.filter((r) => !r.isBridge);
  const bridges = roads.filter((r) => r.isBridge);
  const metrics: Metrics = {
    waterKm2: r2(sumArea((p) => p.kind === "water")),
    uncertainKm2: r2(sumArea((p) => p.kind === "uncertain")),
    debrisKm2: r2(debris.filter((d) => d.kind === "suspected").reduce((s, d) => s + d.areaKm2, 0)),
    buildingsTotal: buildings.length,
    buildingsLikely: buildings.filter((b) => b.state === "likely").length,
    buildingsPossible: buildings.filter((b) => b.state === "possible").length,
    buildingsUnassessed: buildings.filter((b) => b.state === "unassessed").length,
    roadKmTotal: r1(nonBridge.reduce((s, r) => s + r.lengthKm, 0)),
    roadKmInundated: r1(nonBridge.reduce((s, r) => s + r.impact.waterM, 0) / 1000),
    roadSegmentsBlocked: nonBridge.filter((r) => r.impact.state === "blocked").length,
    roadSegmentsSuspected: nonBridge.filter((r) => r.impact.state === "suspected").length,
    bridgesTotal: bridges.length,
    bridgesBlocked: bridges.filter((r) => r.impact.state === "blocked").length,
    bridgesSuspected: bridges.filter((r) => r.impact.state === "suspected").length,
    settlementsTotal: settlements.length,
    settlementsDisconnected: settlements.filter((s) => s.status === "disconnected").length,
    settlementsSuspected: settlements.filter((s) => s.status === "suspected").length,
    settlementsConnected: settlements.filter((s) => s.status === "connected").length,
    hospitalLost: settlements.filter((s) => s.hospital.status === "lost").length,
    hospitalUncertain: settlements.filter((s) => s.hospital.status === "uncertain").length,
  };

  /* ------------------------- limitations ------------------------- */
  const limitations = [
    "SAMPLE DATA: geometry and evidence values are illustrative placeholders for the live Sentinel-1/Sentinel-2 pipeline. They are not satellite-derived findings.",
    "Satellite imagery alone cannot confirm structural damage. “Likely impassable” means a modeled inundation of the carriageway or approaches, not destruction.",
    `Road connectivity uses the pre-event OpenStreetMap snapshot (${SCENARIO.osmSnapshotDate}); unmapped tracks, footpaths and ferries are not modeled and may provide alternative access.`,
    "“Modeled disconnected” = no remaining road route in the graph when high-confidence inundated segments are removed. “Access uncertain” = a route exists only through segments flagged as suspected.",
    "Population, casualty and needs data are not part of the computed results and are therefore unavailable.",
  ];
  if (!hasS1) limitations.push("Sentinel-1 radar was not used: water detection depends on optical imagery and cloud-obscured areas cannot be assessed.");
  if (!hasS2) limitations.push("Sentinel-2 optical imagery was not used: debris indicators rely on radar coherence only and carry lower confidence.");
  if (cloudActive) limitations.push(`Post-event Sentinel-2 cloud cover is ${postCloud}%; optical evidence is missing inside the cloud mask.`);
  if (recession < 1) limitations.push(`Post-event scene is ${daysAfter} days after the event; flood water has likely receded, so the modeled extent is reduced to ${Math.round(recession * 100)}% of the sample peak.`);
  if (hasS1) limitations.push("Steep gorge reach (south-west) has radar shadow / layover; water confidence there is reduced.");

  return {
    id: `sample-${params.eventDate}-${sensor}-${params.fromDate}_${params.toDate}-${[m.s1Pre, m.s1Post, m.s2Pre, m.s2Post].map((a) => a?.date ?? "x").join("+")}`,
    dataClass: "sample",
    params,
    effectiveSensor: sensor,
    acquisitions: m,
    validation: v.items,
    recession,
    s2Cloud: cloudActive,
    flood,
    debris,
    gaps,
    waterways,
    roads,
    buildings,
    services,
    settlements,
    groups,
    metrics,
    limitations,
    network: {
      nodes: Object.fromEntries(Object.entries(NODES).map(([k, v]) => [k, toLL(v)])),
      settlementNodes: Object.fromEntries(SETTLEMENTS.map((s) => [s.id, s.node])),
      serviceNodes: Object.fromEntries(SERVICES.map((s) => [s.id, s.node])),
    },
  };
}
