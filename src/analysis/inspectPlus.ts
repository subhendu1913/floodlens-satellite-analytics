import type { AnalysisResults, Selection } from "../types";
import { describeFeature, type InspectorModel } from "./inspect";
import { findPriorityFor } from "./priorities";
import type { SimResult } from "./simulate";

/** Evidence Inspector model plus "why it was flagged" and the matching verification task id. */
export interface FullInspectorModel extends InspectorModel {
  why: string[];
  /** Verification task id when the feature is on the verification list, otherwise null. */
  taskId: string | null;
}

export function describeFull(sel: Selection, r: AnalysisResults, sim?: SimResult | null): FullInspectorModel | null {
  const m = describeFeature(sel, r, sim);
  if (!m) return null;
  const p = findPriorityFor(r, sel);
  const why = p
    ? [`Rule ${p.rule}: ${p.reason}`, `Potential impact: ${p.impact}.`, "Flagged because of the evidence listed above — a flag means “requires further inspection”, not confirmed damage."]
    : ["Not flagged by any prioritisation rule in the current results, so it is not on the verification list.", "A missing flag is not proof that the feature is unaffected, especially under cloud or radar shadow."];
  return { ...m, why, taskId: p ? p.id : null };
}
