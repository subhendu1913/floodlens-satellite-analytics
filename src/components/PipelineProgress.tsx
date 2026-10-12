import { Check, Loader2 } from "lucide-react";
import { PIPELINE_STEPS, type Progress } from "../analysis/service";
import { cn } from "../utils/cn";

export function PipelineProgress({ progress, className }: { progress: Progress; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      <div>
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="font-medium text-slate-300">Running sample-data workflow</span>
          <span className="font-mono text-water">{Math.round(progress.pct)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
          <div className="h-full rounded-full bg-water transition-[width] duration-100 ease-linear" style={{ width: `${progress.pct}%` }} />
        </div>
      </div>
      <ol className="space-y-1.5">
        {PIPELINE_STEPS.map((s, i) => {
          const done = progress.step > i;
          const active = progress.step === i;
          return (
            <li key={s.id} className={cn("flex items-start gap-2 transition-opacity", !done && !active && "opacity-40")}>
              <span
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px]",
                  done ? "border-ok/50 bg-ok/15 text-ok" : active ? "border-water/60 bg-water/10 text-water" : "border-line text-slate-600",
                )}
              >
                {done ? <Check className="size-2.5" strokeWidth={3} /> : active ? <Loader2 className="size-2.5 animate-spin" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-[12px] leading-4", active ? "font-medium text-white" : "text-slate-300")}>{s.label}</span>
                {active && <span className="block animate-fade-in text-[10.5px] leading-snug text-slate-500">{s.detail}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="border-t border-line pt-2 text-[10.5px] leading-snug text-slate-500">
        Demo mode: this runs on labelled sample data. No live satellite processing is performed.
      </p>
    </div>
  );
}
