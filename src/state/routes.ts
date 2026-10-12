import { useCallback, useEffect, useRef, useState } from "react";

export type Route = "overview" | "analysis" | "impact" | "priorities" | "reports" | "data";

export const ROUTES: { id: Route; label: string; hasMap: boolean; desc: string }[] = [
  { id: "overview", label: "Overview", hasMap: true, desc: "Current incident, key results and next actions" },
  { id: "analysis", label: "Flood Analysis", hasMap: true, desc: "Choose location, event date and period, compare before / after imagery, run change analysis" },
  { id: "impact", label: "Impact & Access", hasMap: true, desc: "Infrastructure exposure, road access, what-if and alternative-route tools" },
  { id: "priorities", label: "Rescue Priorities", hasMap: true, desc: "Rescue Action Center: priority locations, access risks and verification tasks" },
  { id: "reports", label: "Reports", hasMap: false, desc: "Rescue Briefs: preview, edit, save, publish, export" },
  { id: "data", label: "Validation & Data", hasMap: false, desc: "Case-study validation, satellite observations, sources and limitations" },
];

/** Tools grouped inside a workspace — never separate sidebar items. */
export const TABS: Partial<Record<Route, { id: string; label: string; hint: string }[]>> = {
  impact: [
    { id: "infra", label: "Infrastructure Impact", hint: "Buildings, roads, bridges and facilities potentially exposed to detected flooding" },
    { id: "settlements", label: "Isolated Settlements", hint: "Modeled road access from each settlement to the nearest town or hospital" },
    { id: "critical", label: "Critical Connections", hint: "Roads and bridges whose hypothetical loss would disconnect several settlements" },
    { id: "simulator", label: "What-If Simulator", hint: "Hypothetical: remove one connection and recalculate access" },
    { id: "alternatives", label: "Alternative Routes", hint: "Find a mapped route that avoids selected, potentially disrupted segments" },
    { id: "downstream", label: "Downstream Explorer", hint: "Terrain-guided estimate of the corridor downstream of a chosen point" },
  ],
  priorities: [
    { id: "locations", label: "Priority Locations", hint: "Bridges, roads, settlements and facilities that require further investigation" },
    { id: "risks", label: "Access Risks", hint: "Settlements with modeled loss of road access and connections that keep access open" },
    { id: "tasks", label: "Verification Tasks", hint: "Track the investigation: needs verification, under review, verified, unable to verify" },
  ],
  data: [
    { id: "validation", label: "Case-Study Validation", hint: "Compare a completed analysis with the Copernicus EMSR927 reference" },
    { id: "satellite", label: "Satellite Data", hint: "Sentinel-1 / Sentinel-2 observations considered and used" },
    { id: "sources", label: "Sources & Limitations", hint: "Inputs, attributions, warnings and known limitations" },
  ],
};

const ALIAS: Record<string, [Route, string?]> = {
  settlements: ["impact", "settlements"],
  sources: ["data", "sources"],
  validation: ["data", "validation"],
};
const IDS = ROUTES.map((r) => r.id) as string[];

/** The public landing page lives at #/welcome. It is not an application route. */
export const isWelcomeHash = (h: string) => h.startsWith("#/welcome");

export interface Loc {
  route: Route;
  tab: string | null;
}
const defaultTab = (route: Route) => TABS[route]?.[0].id ?? null;

function parseHash(): Loc {
  const [a, b] = window.location.hash.replace(/^#\/?/, "").split("/");
  let route: Route = "overview";
  let tab: string | null = null;
  if (a in ALIAS) {
    route = ALIAS[a][0];
    tab = ALIAS[a][1] ?? null;
  } else if (IDS.includes(a)) route = a as Route;
  const tabs = TABS[route];
  if (tabs) tab = tabs.some((t) => t.id === (b ?? tab)) ? (b ?? tab) : tabs[0].id;
  else tab = null;
  return { route, tab };
}
const keyOf = (l: Loc) => `${l.route}${l.tab ? `/${l.tab}` : ""}`;

/** Tiny hash router with remembered tabs and a Back stack (no extra dependencies). Ignores the landing page hash. */
export function useHashRoute() {
  const [loc, setLoc] = useState<Loc>(parseHash);
  const stack = useRef<string[]>([keyOf(loc)]);
  const lastTab = useRef<Record<string, string>>({});

  useEffect(() => {
    const on = () => {
      if (isWelcomeHash(window.location.hash)) return; // landing page: keep the current app route
      const l = parseHash();
      const k = keyOf(l);
      const st = stack.current;
      if (st.length > 1 && st[st.length - 2] === k) st.pop();
      else if (st[st.length - 1] !== k) st.push(k);
      if (l.tab) lastTab.current[l.route] = l.tab;
      setLoc(l);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const go = useCallback((route: Route, tab?: string) => {
    const t = TABS[route] ? (tab ?? lastTab.current[route] ?? defaultTab(route)) : null;
    const next = `#/${route}${t ? `/${t}` : ""}`;
    if (window.location.hash !== next) window.location.hash = next;
  }, []);

  const back = useCallback(() => {
    if (stack.current.length > 1) window.history.back();
    else go("overview");
  }, [go]);

  return { route: loc.route, tab: loc.tab, go, back };
}
