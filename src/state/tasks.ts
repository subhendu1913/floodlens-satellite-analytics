import type { Tone } from "../lib/format";

/**
 * Verification workflow. These statuses are MANUAL entries describing the state of an investigation.
 * They are not automatic confirmation of any real-world condition, and are stored in this browser only.
 */
export type VerifStatus = "needs" | "review" | "verified" | "unable";
export const VERIF_ORDER: VerifStatus[] = ["needs", "review", "verified", "unable"];
export const VERIF_LABEL: Record<VerifStatus, string> = {
  needs: "Needs Verification",
  review: "Under Review",
  verified: "Verified",
  unable: "Unable to Verify",
};
export const VERIF_LABEL_NE: Record<VerifStatus, string> = {
  needs: "प्रमाणीकरण आवश्यक",
  review: "समीक्षाधीन",
  verified: "प्रमाणित",
  unable: "प्रमाणित गर्न सकिएन",
};
export const VERIF_TONE: Record<VerifStatus, Tone> = { needs: "warn", review: "water", verified: "ok", unable: "neutral" };
export const VERIF_HELP: Record<VerifStatus, string> = {
  needs: "Nobody has looked at this yet.",
  review: "Someone is checking it (field team, UAV or local contact).",
  verified: "A person recorded that they checked it. FloodLens cannot confirm this itself.",
  unable: "It could not be checked (no access, no contact or no recent imagery).",
};

export interface TaskRecord {
  status: VerifStatus;
  note: string;
  updatedAt: string;
  /** Analysis run the status was set against — statuses can go stale when the analysis changes. */
  analysisId: string;
  updatedBy: string;
}
export type TaskMap = Record<string, TaskRecord>;

const KEY = "floodlens.tasks.v1";

export function loadTasks(): TaskMap {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? JSON.parse(raw) : {};
    return p && typeof p === "object" && !Array.isArray(p) ? (p as TaskMap) : {};
  } catch {
    return {};
  }
}

export function saveTasks(m: TaskMap): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
    return true;
  } catch {
    return false;
  }
}

export const statusOf = (m: TaskMap, id: string): VerifStatus => m[id]?.status ?? "needs";

export function taskCounts(ids: string[], m: TaskMap): Record<VerifStatus, number> {
  const c: Record<VerifStatus, number> = { needs: 0, review: 0, verified: 0, unable: 0 };
  for (const id of ids) c[statusOf(m, id)]++;
  return c;
}
