import type { AccessStatus, BuildingState, HospitalStatus, ImpactState, Lang } from "../types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(iso: string | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function fmtShort(iso: string | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

const DEV = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];
/** Convert digits to Devanagari for Nepali output. */
export function digits(s: string | number, lang: Lang): string {
  const str = String(s);
  return lang === "ne" ? str.replace(/\d/g, (d) => DEV[Number(d)]) : str;
}

export type ConfLabel = "High" | "Medium" | "Low";
export function confLabel(c: number): ConfLabel {
  return c >= 0.75 ? "High" : c >= 0.5 ? "Medium" : "Low";
}
export const CONF_NE: Record<ConfLabel, string> = { High: "उच्च", Medium: "मध्यम", Low: "न्यून" };

export const fmtLL = (ll: [number, number]) => `${ll[0].toFixed(4)}°N, ${ll[1].toFixed(4)}°E`;

export const ACCESS_LABEL: Record<AccessStatus, string> = {
  connected: "Access maintained",
  suspected: "Access uncertain",
  disconnected: "Modeled disconnected",
};
export const ACCESS_NE: Record<AccessStatus, string> = {
  connected: "पहुँच कायम",
  suspected: "पहुँच अनिश्चित",
  disconnected: "मोडेल अनुसार विच्छेद",
};
export const HOSPITAL_LABEL: Record<HospitalStatus, string> = {
  reachable: "Reachable",
  uncertain: "Uncertain",
  lost: "No modeled route",
};
export const HOSPITAL_NE: Record<HospitalStatus, string> = {
  reachable: "पुग्न सकिने",
  uncertain: "अनिश्चित",
  lost: "मोडेल अनुसार मार्ग छैन",
};
export const IMPACT_LABEL: Record<ImpactState, string> = {
  none: "No indicator",
  suspected: "Possible disruption",
  blocked: "Likely impassable (inundated)",
};
export const BUILDING_LABEL: Record<BuildingState, string> = {
  none: "No indicator",
  possible: "Possibly affected",
  likely: "Likely inundated",
  unassessed: "Not assessable (cloud)",
};

export type Tone = "water" | "flood" | "warn" | "crit" | "ok" | "neutral" | "info";
export const ACCESS_TONE: Record<AccessStatus, Tone> = { connected: "ok", suspected: "warn", disconnected: "crit" };
export const IMPACT_TONE: Record<ImpactState, Tone> = { none: "neutral", suspected: "warn", blocked: "crit" };
export const HOSPITAL_TONE: Record<HospitalStatus, Tone> = { reachable: "ok", uncertain: "warn", lost: "crit" };

/** OSM building kinds treated as critical facilities in the map and tables. */
export const CRITICAL_LABEL: Record<string, string> = { school: "School", public: "Public building" };
export const isCriticalKind = (kind: string) => kind in CRITICAL_LABEL;

/** "20 Aug 2026 – 30 Aug 2026" */
export function fmtPeriod(from: string, to: string): string {
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}
