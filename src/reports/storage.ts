import type { ReportDoc } from "./doc";

const KEY = "floodlens.reports.v1";

/** Local persistence only — there is no backend. Reports never leave this browser. */
export function loadReports(): ReportDoc[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ReportDoc[]) : [];
  } catch {
    return [];
  }
}

export function saveReports(list: ReportDoc[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
