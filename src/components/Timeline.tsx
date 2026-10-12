import { useState, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, Info, ShieldAlert } from "lucide-react";
import { fmtPeriod } from "../lib/format";
import type { AnalysisResults, RunStatus, Severity } from "../types";
import { cn } from "../utils/cn";
import { AcquisitionTimeline } from "./AcquisitionTimeline";
import type { ViewMode, ViewState } from "./map/DualMap";
import { Segmented } from "./ui";

interface Props {
  results: AnalysisResults | null;
  view: ViewState;
  onMode: (m: ViewMode) => void;
  onSplit: (n: number) => void;
  status: RunStatus;
}

const sevIcon: Record<Severity, ReactNode> = {
  ok: <CheckCircle2 className="size-3.5 text-ok" />,
  info: <Info className="size-3.5 text-water" />,
  warn: <CircleAlert className="size-3.5 text-warn" />,
  error: <ShieldAlert className="size-3.5 text-crit" />,
};

/** Bottom bar of Flood Analysis: before / after control, acquisition timeline, processing status. */
export function Timeline({ results, view, onMode, onSplit, status }: Props) {
  const [qOpen, setQOpen] = useState(false);
  const warns = results?.validation.filter((v) => v.severity === "warn") ?? [];
  const proc = status === "running" ? "Processing…" : results ? "Complete · demo data" : status === "error" ? "Unavailable" : "Idle";

  return (
    <div className="relative flex h-[118px] shrink-0 items-stretch border-t border-line bg-white">
      <div className="flex w-[200px] shrink-0 flex-col justify-center gap-2 border-r border-line px-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Imagery comparison</div>
        <Segmented
          value={view.mode}
          onChange={onMode}
          options={[
            { value: "before", label: "Before" },
            { value: "swipe", label: "Swipe" },
            { value: "after", label: "After" },
          ]}
        />
        <input type="range" min={3} max={97} value={view.split} disabled={view.mode !== "swipe"} onChange={(e) => onSplit(Number(e.target.value))} className="h-1 w-full cursor-pointer disabled:opacity-30" aria-label="Swipe position" />
      </div>

      <div className="relative hidden min-w-0 flex-1 px-2 pt-1 min-[1100px]:block">
        <AcquisitionTimeline />
      </div>

      <div className="relative ml-auto flex w-[230px] shrink-0 flex-col justify-center gap-1 border-l border-line px-3">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-500">Processing</span>
          <span className={cn("font-medium", status === "running" ? "text-water" : results ? "text-ok" : "text-slate-400")}>{proc}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-slate-500">Period</span>
          <span className="truncate text-slate-300" title={results ? fmtPeriod(results.params.fromDate, results.params.toDate) : undefined}>
            {results ? fmtPeriod(results.params.fromDate, results.params.toDate).replace(/ 2026/g, "") : "—"}
          </span>
        </div>
        <button
          disabled={!results}
          onClick={() => setQOpen(!qOpen)}
          className={cn("mt-0.5 flex h-7 items-center justify-center gap-1.5 rounded-md border text-[11px] font-medium transition disabled:opacity-40", warns.length ? "border-warn/50 bg-warn/10 text-warn hover:bg-warn/20" : "border-line bg-white text-slate-300 hover:border-slate-500")}
        >
          <CircleAlert className="size-3.5" />
          Data quality · {warns.length} warning{warns.length === 1 ? "" : "s"}
        </button>
        {qOpen && results && (
          <div className="absolute bottom-full right-2 z-[1200] mb-2 w-[360px] animate-fade-in overflow-hidden rounded-lg border border-line bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-300">Data quality &amp; validation</span>
              <button onClick={() => setQOpen(false)} className="text-[11px] text-slate-500 hover:text-slate-100">
                Close
              </button>
            </div>
            <ul className="max-h-[300px] space-y-1.5 overflow-y-auto p-2.5">
              {results.validation.map((v) => (
                <li key={v.id} className="flex gap-2 rounded-md bg-ink-850 px-2 py-1.5">
                  <span className="mt-0.5">{sevIcon[v.severity]}</span>
                  <span>
                    <span className="block text-[11.5px] font-medium text-slate-200">{v.title}</span>
                    <span className="block text-[10.5px] leading-snug text-slate-500">{v.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
