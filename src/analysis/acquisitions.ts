import { CATALOG, SCENARIO } from "../data/scenario";
import { fmtDate } from "../lib/format";
import type { Acquisition, AnalysisParams, MatchedAcquisitions, PickKey, SensorMode, ValidationItem } from "../types";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
}

/** Water recedes after the event; later post-event scenes under-estimate the peak extent. */
export function recessionFactor(daysAfterEvent: number): number {
  if (daysAfterEvent <= 2) return 1;
  return Math.max(0.45, 1 - 0.07 * (daysAfterEvent - 2));
}

export const PERIOD_MAX_DAYS = 90;

/** A starting suggestion only: a few days before and after the event. */
export function suggestedPeriod(eventDate: string) {
  return isIsoDate(eventDate) ? { from: addDays(eventDate, -6), to: addDays(eventDate, 4) } : { from: eventDate, to: eventDate };
}

/** Sentinel-1 scenes are only comparable when orbit direction and relative orbit (viewing geometry) match. */
export const sameGeometry = (a: Acquisition, b: Acquisition) => a.orbit === b.orbit && a.relOrbit === b.relOrbit;

type Period = Pick<AnalysisParams, "fromDate" | "toDate">;
export const inPeriod = (a: Acquisition, p: Period) => a.date >= p.fromDate && a.date <= p.toDate;

const byId = new Map(CATALOG.map((a) => [a.id, a] as const));
const PICK_KEYS: PickKey[] = ["s1Pre", "s1Post", "s2Pre", "s2Post"];
const asc = (a: Acquisition, b: Acquisition) => a.date.localeCompare(b.date);
const desc = (a: Acquisition, b: Acquisition) => b.date.localeCompare(a.date);

export function catalogueSpan() {
  const d = CATALOG.map((a) => a.date).sort();
  return { first: d[0], last: d[d.length - 1] };
}

/**
 * Pick the observations to compare. Acquisitions occur at discrete dates, so nothing is invented:
 *  - after-event scenes must lie on/after the event AND inside the requested period (earliest first);
 *  - before-event scenes must precede the event; scenes inside the period are preferred, otherwise the
 *    nearest earlier acquisition is used as a baseline (and flagged as outside the period);
 *  - Sentinel-1 pairs must share orbit direction and relative orbit.
 * Manual picks (params.picks) override the automatic choice.
 */
export function matchAcquisitions(p: AnalysisParams): MatchedAcquisitions {
  const empty: MatchedAcquisitions = { outside: [], manual: [] };
  if (![p.eventDate, p.fromDate, p.toDate].every(isIsoDate)) return empty;
  const pickOf = (k: PickKey) => {
    const id = p.picks?.[k];
    return id ? byId.get(id) : undefined;
  };
  const s1 = CATALOG.filter((a) => a.sensor === "S1");
  const s2 = CATALOG.filter((a) => a.sensor === "S2");
  const firstPost = (list: Acquisition[]) => list.filter((a) => a.date >= p.eventDate && inPeriod(a, p)).sort(asc)[0];
  const preList = (list: Acquisition[]) => {
    const before = list.filter((a) => a.date < p.eventDate).sort(desc);
    return [...before.filter((a) => inPeriod(a, p)), ...before.filter((a) => !inPeriod(a, p))];
  };

  const s1Post = pickOf("s1Post") ?? firstPost(s1);
  const s2Post = pickOf("s2Post") ?? firstPost(s2);

  let s1Pre = pickOf("s1Pre");
  let s1Rejected: Acquisition | undefined;
  if (!s1Pre) {
    const list = preList(s1);
    if (s1Post) {
      s1Pre = list.find((a) => sameGeometry(a, s1Post));
      if (list[0] && list[0] !== s1Pre) s1Rejected = list[0];
    } else s1Pre = list[0];
  }
  const l2 = preList(s2);
  const s2Pre = pickOf("s2Pre") ?? l2.find((a) => (a.cloudPct ?? 0) <= 30) ?? l2[0];

  const res: MatchedAcquisitions = { s1Pre, s1Post, s2Pre, s2Post, s1Rejected, outside: [], manual: PICK_KEYS.filter((k) => !!pickOf(k)) };
  res.outside = PICK_KEYS.filter((k) => res[k] && !inPeriod(res[k]!, p));
  return res;
}

/** Acquisitions to show on the timeline: the period, 14 days of earlier baseline, and anything in use. */
export function observationWindow(p: AnalysisParams, matched: MatchedAcquisitions): Acquisition[] {
  if (![p.fromDate, p.toDate].every(isIsoDate)) return [];
  const lo = addDays(p.fromDate, -14);
  const used = new Set([matched.s1Pre, matched.s1Post, matched.s2Pre, matched.s2Post, matched.s1Rejected].filter(Boolean).map((a) => a!.id));
  return CATALOG.filter((a) => (a.date >= lo && a.date <= p.toDate) || used.has(a.id)).sort(asc);
}

export interface ValidationOutcome {
  items: ValidationItem[];
  matched: MatchedAcquisitions;
  effectiveSensor: SensorMode | null;
  canRun: boolean;
  periodOk: boolean;
  /** Acquisitions that actually exist inside the requested period. */
  found: { s1: number; s2: number };
}

const PICK_LABEL: Record<PickKey, string> = {
  s1Pre: "Sentinel-1 before-event image",
  s1Post: "Sentinel-1 after-event image",
  s2Pre: "Sentinel-2 before-event image",
  s2Post: "Sentinel-2 after-event image",
};

export function validateParams(p: AnalysisParams): ValidationOutcome {
  const items: ValidationItem[] = [];
  const matched = matchAcquisitions(p);
  const add = (id: string, severity: ValidationItem["severity"], title: string, detail: string) => items.push({ id, severity, title, detail });

  // --- area of interest
  const cv = SCENARIO.coverage;
  const finite = Number.isFinite(p.lat) && Number.isFinite(p.lon);
  if (!finite || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) {
    add("aoi", "error", "Invalid coordinates", "Enter a latitude between −90 and 90 and a longitude between −180 and 180.");
  } else if (p.lat < cv.south || p.lat > cv.north || p.lon < cv.west || p.lon > cv.east) {
    add("aoi", "error", "Outside sample coverage", "The demonstration dataset only covers the Trishuli valley. Live Sentinel processing is not connected in this build, so no analysis can be produced for this location.");
  } else {
    add("aoi-ok", "ok", "Area of interest covered", `${SCENARIO.name} — sample dataset available.`);
  }

  // --- event date and analysis period
  const datesOk = [p.eventDate, p.fromDate, p.toDate].every(isIsoDate);
  const found = { s1: 0, s2: 0 };
  let periodOk = false;
  if (!datesOk) {
    add("dates", "error", "Dates are missing or invalid", "Set the flood event date and both the From and To dates of the analysis period.");
  } else if (p.fromDate > p.toDate) {
    add("period", "error", "From date is after the To date", "Choose a From date on or before the To date.");
  } else {
    const span = daysBetween(p.fromDate, p.toDate) + 1;
    if (span > PERIOD_MAX_DAYS) {
      add("period", "error", `Period is too long (${span} days)`, `Choose a period of at most ${PERIOD_MAX_DAYS} days so that the compared observations stay relevant.`);
    } else if (p.eventDate < p.fromDate || p.eventDate > p.toDate) {
      const sg = suggestedPeriod(p.eventDate);
      add("period-event", "error", "The flood event date is outside the period", `${fmtDate(p.fromDate)} – ${fmtDate(p.toDate)} does not include the event on ${fmtDate(p.eventDate)}. Use the suggested period (${fmtDate(sg.from)} – ${fmtDate(sg.to)}) or widen yours.`);
    } else {
      periodOk = true;
      add("period-ok", "ok", `Analysis period: ${span} day${span === 1 ? "" : "s"}`, `${fmtDate(p.fromDate)} – ${fmtDate(p.toDate)}, including the flood event on ${fmtDate(p.eventDate)}.`);
    }
    if (p.eventDate !== SCENARIO.eventDate) add("event", "warn", "Event date differs from the sample event", `The sample dataset represents the ${fmtDate(SCENARIO.eventDate)} event. Other dates are matched against the same sample catalogue only.`);

    found.s1 = CATALOG.filter((a) => a.sensor === "S1" && inPeriod(a, p)).length;
    found.s2 = CATALOG.filter((a) => a.sensor === "S2" && inPeriod(a, p)).length;
    const span2 = catalogueSpan();
    if (found.s1 + found.s2 === 0) {
      add(
        "no-imagery",
        "error",
        "No Sentinel observations in this period",
        `The sample catalogue holds no Sentinel-1 or Sentinel-2 acquisition between ${fmtDate(p.fromDate)} and ${fmtDate(p.toDate)} (it covers ${fmtDate(span2.first)} – ${fmtDate(span2.last)}). Satellites image an area only at discrete times, and FloodLens does not invent acquisition dates — widen the period.`,
      );
    } else {
      add("found", "info", `${found.s1} Sentinel-1 and ${found.s2} Sentinel-2 acquisition${found.s1 + found.s2 === 1 ? "" : "s"} in the period`, "Only these dates exist inside the period. See the timeline below for the exact acquisition dates.");
    }
  }

  // --- manual picks must have the right role relative to the event
  if (datesOk) {
    for (const k of matched.manual) {
      const a = matched[k];
      if (!a) continue;
      const pre = k.endsWith("Pre");
      if (pre && a.date >= p.eventDate) add(`pick-${k}`, "error", `${PICK_LABEL[k]} is not before the event`, `${fmtDate(a.date)} is on or after the flood event (${fmtDate(p.eventDate)}). A before-event image must be acquired earlier.`);
      if (!pre && a.date < p.eventDate) add(`pick-${k}`, "error", `${PICK_LABEL[k]} is before the event`, `${fmtDate(a.date)} precedes the flood event (${fmtDate(p.eventDate)}). An after-event image must be acquired on or after it.`);
    }
  }

  const { s1Pre, s1Post, s2Pre, s2Post, s1Rejected } = matched;
  const wantS1 = p.sensor !== "S2";
  const wantS2 = p.sensor !== "S1";
  const s1Pair = !!(s1Pre && s1Post);
  const s1ok = s1Pair && sameGeometry(s1Pre!, s1Post!);
  const s2ok = !!(s2Pre && s2Post);

  if (periodOk) {
    if (wantS1) {
      if (s1Rejected && s1Post) {
        add(
          "s1-orbit",
          "warn",
          "Sentinel-1 orbit mismatch avoided",
          `The nearest pre-event scene (${fmtDate(s1Rejected.date)}, ${s1Rejected.orbit} orbit ${s1Rejected.relOrbit}) has different viewing geometry from the post-event scene (${s1Post.orbit} orbit ${s1Post.relOrbit}) and is NOT compared pixel by pixel. ${s1Pre ? `Using ${fmtDate(s1Pre.date)} instead.` : "No compatible pre-event scene exists."}`,
        );
      }
      if (!s1Post) add("s1-nopost", p.sensor === "S1" ? "error" : "warn", "No Sentinel-1 observation after the event in this period", `No radar acquisition exists between ${fmtDate(p.eventDate)} and ${fmtDate(p.toDate)}. Extend the To date to look for later scenes.`);
      else if (!s1Pre) add("s1-nopre", p.sensor === "S1" ? "error" : "warn", "No compatible pre-event Sentinel-1 scene", "No earlier acquisition with the same orbit track and viewing geometry exists in the catalogue.");
      else if (!s1ok) add("s1-geom-bad", p.sensor === "S1" ? "error" : "warn", "Selected Sentinel-1 scenes use different orbit tracks", `${s1Pre.orbit} orbit ${s1Pre.relOrbit} vs ${s1Post.orbit} orbit ${s1Post.relOrbit}. These scenes will not be compared pixel by pixel; choose scenes from the same track.${p.sensor === "S1S2" ? " The analysis would fall back to optical imagery." : ""}`);
      else add("s1-geom", "ok", "Sentinel-1 geometry compatible", `${fmtDate(s1Pre.date)} → ${fmtDate(s1Post.date)} · ${s1Post.orbit} · relative orbit ${s1Post.relOrbit} · same mode/polarisation.`);
    }
    if (wantS2) {
      if (!s2Post) add("s2-nopost", p.sensor === "S2" ? "error" : "warn", "No Sentinel-2 observation after the event in this period", `No optical acquisition exists between ${fmtDate(p.eventDate)} and ${fmtDate(p.toDate)}.`);
      else if (!s2Pre) add("s2-nopre", p.sensor === "S2" ? "error" : "warn", "No pre-event Sentinel-2 scene available", "No earlier optical acquisition exists in the catalogue.");
      else if ((s2Post.cloudPct ?? 0) >= 25) {
        add("s2-cloud", "warn", `Post-event Sentinel-2 cloud cover ${s2Post.cloudPct}%`, p.sensor === "S2" ? "Optical-only analysis: cloud-obscured areas cannot be assessed and are marked as data gaps." : "Cloud-obscured areas rely on Sentinel-1 radar only; optical corroboration is unavailable there.");
      } else add("s2-ok", "ok", "Sentinel-2 scenes usable", `Post-event cloud cover ${s2Post.cloudPct}%.`);
    }
    if (p.sensor === "S1S2" && !s1ok && s2ok) add("fallback", "warn", "Falling back to Sentinel-2 only", "Radar evidence unavailable; confidence reduced.");
    if (p.sensor === "S1S2" && s1ok && !s2ok) add("fallback", "warn", "Falling back to Sentinel-1 only", "Optical evidence unavailable; debris indicators are less reliable.");
    if (wantS1 && s1ok) add("shadow", "warn", "Steep-terrain radar shadow", "Gorge reach in the south-west has reduced radar confidence (DEM-derived shadow/layover mask).");

    for (const k of matched.outside) {
      if ((k.startsWith("s1") && !wantS1) || (k.startsWith("s2") && !wantS2)) continue;
      const a = matched[k]!;
      add(`outside-${k}`, "warn", `${PICK_LABEL[k]} (${fmtDate(a.date)}) is outside the requested period`, k.endsWith("Pre") ? "It is used as the baseline because no suitable scene exists inside the period (or it was chosen manually)." : "This after-event image was chosen outside the requested period.");
    }

    const posts = [wantS1 ? s1Post?.date : undefined, wantS2 ? s2Post?.date : undefined].filter(Boolean) as string[];
    if (posts.length) {
      const d = daysBetween(p.eventDate, [...posts].sort()[0]);
      if (d > 3) add("recession", "warn", `Post-event scene ${d} days after the event`, "Flood water may have receded; the detected extent can under-estimate the peak.");
    }
    const pres = [wantS1 ? s1Pre?.date : undefined, wantS2 ? s2Pre?.date : undefined].filter(Boolean) as string[];
    if (pres.length) {
      const gap = daysBetween([...pres].sort().reverse()[0], p.eventDate);
      if (gap > 14) add("stale", "warn", "Baseline imagery is more than 14 days old", "Seasonal vegetation and water change may be mistaken for flood effects.");
    }
  }

  add("osm", "info", "Pre-event OSM snapshot", `Snapshot dated ${SCENARIO.osmSnapshotDate}. Post-event OSM edits are excluded from all derived results.`);
  add("dem", "info", "Copernicus DEM used for terrain context", "Slope / height-above-nearest-drainage masks reduce false water detections on steep terrain.");

  let effectiveSensor: SensorMode | null = null;
  if (p.sensor === "S1S2") effectiveSensor = s1ok && s2ok ? "S1S2" : s1ok ? "S1" : s2ok ? "S2" : null;
  if (p.sensor === "S1") effectiveSensor = s1ok ? "S1" : null;
  if (p.sensor === "S2") effectiveSensor = s2ok ? "S2" : null;
  if (periodOk && !effectiveSensor && !items.some((i) => i.severity === "error")) {
    add("no-data", "error", "No usable imagery pair", "Neither sensor has a compatible before / after pair for this period. Widen the period or choose different observations.");
  }

  const canRun = !items.some((i) => i.severity === "error") && !!effectiveSensor;
  return { items, matched, effectiveSensor, canRun, periodOk, found };
}
