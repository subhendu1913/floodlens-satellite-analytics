import { computeChokepoints } from "../analysis/chokepoints";
import { buildPriorities } from "../analysis/priorities";
import type { AnalysisResults, Lang } from "../types";

/**
 * Optional connection to a REAL language model, through a server-side proxy.
 *
 * FloodLens is a static front end: it cannot keep a secret. An AI provider key must therefore live in
 * the environment of a small server that you run (read from process.env there). The browser only knows the
 * proxy URL, supplied as VITE_COPILOT_ENDPOINT (a URL, not a secret). When it is not set, the Demo Copilot
 * (rule-based, runs entirely in the browser, needs no key) answers instead.
 *
 * Proxy contract:  POST { question, lang, history, context }  →  200 { answer: string }
 */
export const COPILOT_ENDPOINT: string | undefined = (import.meta.env.VITE_COPILOT_ENDPOINT ?? "").trim() || undefined;
export const copilotConnected = !!COPILOT_ENDPOINT;

export class CopilotError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

/** Structured facts the model may use — the same results object the map and reports use. */
export function buildContext(r: AnalysisResults) {
  return {
    dataClass: "DEMO_SAMPLE_DATA",
    analysisId: r.id,
    location: r.params.locationName,
    period: { from: r.params.fromDate, to: r.params.toDate, event: r.params.eventDate },
    acquisitions: {
      s1: r.acquisitions.s1Pre && r.acquisitions.s1Post ? [r.acquisitions.s1Pre.date, r.acquisitions.s1Post.date] : null,
      s2: r.acquisitions.s2Pre && r.acquisitions.s2Post ? [r.acquisitions.s2Pre.date, r.acquisitions.s2Post.date] : null,
    },
    metrics: r.metrics,
    changes: r.changes,
    settlements: r.settlements.map((s) => ({ name: s.name, status: s.status, hospital: s.hospital.status, flagged: s.disrupted.map((d) => d.name) })),
    topPriorities: buildPriorities(r)
      .slice(0, 10)
      .map((p) => ({ name: p.name, type: p.kind, tier: p.tier, impact: p.impact, rule: p.rule })),
    criticalConnections: computeChokepoints(r)
      .slice(0, 5)
      .map((c) => ({ name: c.name, isolates: c.isolates.map((x) => x.name), hospitalLost: c.hospitalLost.map((x) => x.name) })),
    limitations: r.limitations,
  };
}

export async function askBackend(payload: { question: string; lang: Lang; history: { role: string; text: string }[]; context: unknown }, signal: AbortSignal): Promise<string> {
  if (!COPILOT_ENDPOINT) throw new CopilotError("NOT_CONFIGURED");
  let res: Response;
  try {
    res = await fetch(COPILOT_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal });
  } catch {
    throw new CopilotError(signal.aborted ? "TIMEOUT" : "NETWORK");
  }
  if (!res.ok) throw new CopilotError(`HTTP_${res.status}`);
  const data: unknown = await res.json().catch(() => null);
  const answer = data && typeof data === "object" && "answer" in data ? (data as { answer: unknown }).answer : null;
  if (typeof answer !== "string" || !answer.trim()) throw new CopilotError("EMPTY");
  return answer.trim();
}
