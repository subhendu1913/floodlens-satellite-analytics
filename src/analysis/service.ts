import type { AnalysisParams, AnalysisResults } from "../types";
import { runDemoAnalysis } from "./engine";

export interface PipelineStep {
  id: string;
  label: string;
  detail: string;
  ms: number;
}

export const PIPELINE_STEPS: PipelineStep[] = [
  { id: "acq", label: "Imagery acquisition", detail: "Matching Sentinel-1 / Sentinel-2 scenes and checking orbit geometry", ms: 1100 },
  { id: "pre", label: "Preprocessing", detail: "Calibration, speckle filtering, cloud masking, co-registration", ms: 1200 },
  { id: "chg", label: "Change detection", detail: "Fusing pre/post backscatter and water-index change with DEM masks", ms: 1700 },
  { id: "infra", label: "Infrastructure assessment", detail: "Intersecting detections with the pre-event OSM snapshot", ms: 1200 },
  { id: "net", label: "Network connectivity", detail: "Routing settlements to nearest town / hospital under modeled closures", ms: 1300 },
  { id: "rep", label: "Report preparation", detail: "Compiling the structured results object for the AI Copilot and reports", ms: 800 },
];

export interface Progress {
  step: number;
  pct: number;
}

/**
 * Backend seam. A production implementation would POST the request to the processing service
 * (Sentinel-1/2 + Copernicus DEM + OSM snapshot) and return the same AnalysisResults shape.
 */
export interface AnalysisService {
  readonly label: string;
  run(params: AnalysisParams, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<AnalysisResults>;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

export const demoService: AnalysisService = {
  label: "Sample-data engine (no live satellite processing)",
  async run(params, onProgress, signal) {
    const total = PIPELINE_STEPS.reduce((s, p) => s + p.ms, 0);
    let elapsed = 0;
    for (let i = 0; i < PIPELINE_STEPS.length; i++) {
      const st = PIPELINE_STEPS[i];
      const ticks = Math.ceil(st.ms / 60);
      for (let k = 0; k < ticks; k++) {
        await sleep(60, signal);
        onProgress({ step: i, pct: Math.min(99, ((elapsed + ((k + 1) / ticks) * st.ms) / total) * 100) });
      }
      elapsed += st.ms;
    }
    const results = runDemoAnalysis(params);
    onProgress({ step: PIPELINE_STEPS.length, pct: 100 });
    return results;
  },
};
