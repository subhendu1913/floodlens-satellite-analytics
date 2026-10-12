import { useState, type ReactNode } from "react";
import { ArrowRight, Building2, ChevronDown, FileText, ListChecks, Unplug, Waves } from "lucide-react";
import { GlobalSearch } from "../components/GlobalSearch";
import { LogoMark } from "../components/Logo";
import { MapWorkspace } from "../components/MapWorkspace";
import { SummaryPanel } from "../components/SummaryPanel";
import { buildPriorities } from "../analysis/priorities";
import type { Route } from "../state/routes";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";

const STEPS: { text: string; to: Route; tab?: string }[] = [
  { text: "Select a location and flood event date.", to: "analysis" },
  { text: "Compare available satellite imagery before and after the event.", to: "analysis" },
  { text: "Inspect potentially affected infrastructure and settlement connectivity.", to: "impact", tab: "infra" },
  { text: "Review rescue priorities and generate a situation report.", to: "priorities" },
];

const HOWTO_KEY = "floodlens.howto";

function HowTo() {
  const { go } = useApp();
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(HOWTO_KEY) !== "hidden";
    } catch {
      return true;
    }
  });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(HOWTO_KEY, next ? "shown" : "hidden");
    } catch {
      /* storage unavailable */
    }
  };
  return (
    <section aria-labelledby="howto-h" className="rounded-lg border border-line bg-ink-850">
      <button onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <h2 id="howto-h" className="flex-1 text-[12px] font-semibold text-slate-100">
          How to Use FloodLens
        </h2>
        <ChevronDown className={cn("size-4 text-slate-500 transition", !open && "-rotate-90")} />
      </button>
      {open && (
        <ol className="grid gap-2 border-t border-line p-3 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.text}>
              <button onClick={() => go(s.to, s.tab)} className="group flex h-full w-full items-start gap-2.5 rounded-md border border-line bg-white p-2.5 text-left transition hover:border-water">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-water font-mono text-[10.5px] font-semibold text-on-navy">{i + 1}</span>
                <span className="text-[12px] leading-snug text-slate-200 group-hover:text-water">{s.text}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Shortcut({ icon, title, desc, metric, onClick }: { icon: ReactNode; title: string; desc: string; metric?: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} title={desc} className="group flex items-center gap-3 rounded-lg border border-line bg-white p-2.5 text-left transition hover:border-water hover:shadow-sm">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-water/10 text-water">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-[12.5px] font-semibold text-slate-100">
          {title}
          <ArrowRight className="size-3 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-water" />
        </span>
        <span className="block truncate text-[10.5px] text-slate-500">{metric ?? desc}</span>
      </span>
    </button>
  );
}

function Shortcuts() {
  const { go, results, reports } = useApp();
  const m = results?.metrics;
  const tier1 = results ? buildPriorities(results).filter((p) => p.tier === 1).length : null;
  return (
    <nav aria-label="Workspace shortcuts" className="border-y border-line bg-ink-850 px-4 py-3 sm:px-5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Shortcut icon={<Waves className="size-4" />} title="Flood Analysis" desc="Select area and date, compare before / after imagery, run the analysis" metric={m ? `${m.waterKm2.toFixed(2)} km² detected water (demo)` : undefined} onClick={() => go("analysis")} />
        <Shortcut icon={<Building2 className="size-4" />} title="Impact Assessment" desc="Buildings, roads, bridges and facilities potentially exposed" metric={m ? `${m.buildingsLikely + m.buildingsPossible} buildings · ${m.bridgesBlocked + m.bridgesSuspected} bridges flagged` : undefined} onClick={() => go("impact", "infra")} />
        <Shortcut
          icon={<Unplug className="size-4" />}
          title="Isolated Settlements"
          desc="Modeled road access to the nearest town or hospital"
          metric={m ? <><span className={m.settlementsDisconnected ? "font-medium text-crit" : ""}>{m.settlementsDisconnected} modeled disconnected</span> · {m.settlementsSuspected} uncertain</> : undefined}
          onClick={() => go("impact", "settlements")}
        />
        <Shortcut icon={<ListChecks className="size-4" />} title="Rescue Priorities" desc="Where to investigate next, by transparent rules" metric={tier1 !== null ? `${tier1} in the first investigation tier` : undefined} onClick={() => go("priorities")} />
        <Shortcut icon={<FileText className="size-4" />} title="Reports" desc="Generate, edit, publish and export Rescue Briefs" metric={`${reports.length} saved report${reports.length === 1 ? "" : "s"}`} onClick={() => go("reports")} />
      </div>
    </nav>
  );
}

/** Dashboard: welcome + how-to + shortcuts on top, the satellite map and incident summary below. */
export function OverviewPage() {
  return (
    <div className="h-full overflow-y-auto bg-white">
      <section className="grid gap-4 px-4 py-4 sm:px-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] xl:items-start">
        <div>
          <div className="flex items-center gap-2.5">
            <LogoMark size={34} />
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-slate-100">Welcome to FloodLens</h1>
          </div>
          <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-slate-300">Satellite-powered flood intelligence to identify potential flood impacts, assess infrastructure, and locate settlements with disrupted road access.</p>
          <div className="mt-3">
            <GlobalSearch variant="light" shortcut={false} />
          </div>
          <p className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="rounded border border-warn bg-warn px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wider text-navy">Demo mode</span>
            Results are labelled sample data — not verified satellite analysis.
          </p>
        </div>
        <HowTo />
      </section>

      <Shortcuts />

      <section className="flex flex-col lg:h-[calc(100vh-9rem)] lg:min-h-[480px] lg:flex-row">
        <div className="relative h-[60vh] min-h-[340px] lg:h-auto lg:min-w-0 lg:flex-1">
          <div className="absolute inset-0">
            <MapWorkspace variant="compact" />
          </div>
        </div>
        <aside className="border-t border-line bg-white lg:w-[364px] lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <SummaryPanel />
        </aside>
      </section>
    </div>
  );
}
