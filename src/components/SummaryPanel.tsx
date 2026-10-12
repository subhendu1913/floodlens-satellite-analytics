import type { ReactNode } from "react";
import { ArrowRight, Building2, FileText, Home, ListChecks, Network, Sparkles, TriangleAlert, Waves } from "lucide-react";
import { computeChokepoints } from "../analysis/chokepoints";
import { buildPriorities, TIER_LABEL } from "../analysis/priorities";
import { fmtDate, type Tone } from "../lib/format";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";
import { Badge, EmptyState, SectionTitle, btnCls, toneText } from "./ui";

function Tile({ icon, label, value, unit, sub, tone, onClick }: { icon: ReactNode; label: string; value: ReactNode; unit?: string; sub: string; tone: Tone; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex w-full items-start gap-3 rounded-lg border border-line bg-white p-3 text-left transition hover:border-slate-500">
      <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded border border-line bg-ink-850", toneText[tone])}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-medium text-slate-500">{label}</span>
        <span className={cn("block font-mono text-[20px] font-semibold leading-tight", toneText[tone])}>
          {value}
          {unit && <span className="ml-1 text-[11px] font-normal text-slate-500">{unit}</span>}
        </span>
        <span className="mt-0.5 block text-[10.5px] leading-snug text-slate-500">{sub}</span>
      </span>
      <ArrowRight className="mt-1 size-3.5 shrink-0 text-slate-500 transition group-hover:text-slate-200" />
    </button>
  );
}

/** Overview side panel — every figure is read from the shared analysis results. */
export function SummaryPanel() {
  const { results, validation, params, go, pick, generateReport, setCopilot, running, status } = useApp();
  if (!results) {
    return (
      <EmptyState icon={<TriangleAlert className="size-5" />} title="No analysis results" className="h-full">
        Open Flood Analysis and run the workflow for an area covered by the demo dataset.
        <button onClick={() => go("analysis")} className={cn(btnCls.base, btnCls.primary, "mt-3 w-full")}>
          Go to Flood Analysis
        </button>
      </EmptyState>
    );
  }
  const m = results.metrics;
  const a = results.acquisitions;
  const warns = validation.items.filter((i) => i.severity === "warn").slice(0, 3);
  const top = buildPriorities(results).slice(0, 3);
  const critical = computeChokepoints(results).filter((c) => c.isolates.length >= 2).length;

  return (
    <div className={cn("space-y-4 p-3.5", running && "opacity-60")}>
      <section className="rounded-lg border border-line bg-white p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 className="mr-auto text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Current incident</h2>
          <Badge tone="warn">DEMO DATA</Badge>
        </div>
        <p className="mt-1.5 text-[14px] font-semibold leading-snug text-slate-100">{params.locationName}</p>
        <dl className="mt-1.5 grid grid-cols-[84px_1fr] gap-x-2 gap-y-1 text-[11.5px]">
          <dt className="text-slate-500">Flood event</dt>
          <dd className="text-slate-200">{fmtDate(results.params.eventDate)}</dd>
          <dt className="text-slate-500">Period</dt>
          <dd className="text-slate-200">
            {fmtDate(results.params.fromDate)} – {fmtDate(results.params.toDate)}
          </dd>
          <dt className="text-slate-500">Imagery</dt>
          <dd className="text-slate-300">
            {results.effectiveSensor !== "S2" && a.s1Post && <span className="block">Sentinel-1: {fmtDate(a.s1Pre?.date)} → {fmtDate(a.s1Post.date)}</span>}
            {results.effectiveSensor !== "S1" && a.s2Post && <span className="block">Sentinel-2: {fmtDate(a.s2Pre?.date)} → {fmtDate(a.s2Post.date)} ({a.s2Post.cloudPct}% cloud)</span>}
          </dd>
          <dt className="text-slate-500">Processing</dt>
          <dd className="text-slate-300">{status === "complete" ? "Complete — sample-data engine (no live satellite processing)" : status}</dd>
        </dl>
        {warns.length > 0 && (
          <ul className="mt-2 space-y-1 border-t border-line pt-2">
            {warns.map((w) => (
              <li key={w.id} className="flex gap-1.5 text-[10.5px] leading-snug text-warn">
                <TriangleAlert className="mt-px size-3 shrink-0" /> {w.title}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10.5px] leading-snug text-slate-500">Results are demonstration values, not verified satellite analysis. Imagery never confirms structural damage.</p>
      </section>

      <section className="space-y-2">
        <SectionTitle>Key results</SectionTitle>
        <Tile onClick={() => go("analysis")} tone="flood" icon={<Waves className="size-3.5" />} label="Mapped floodwater" value={m.waterKm2.toFixed(2)} unit="km²" sub={`+ ${m.uncertainKm2.toFixed(2)} km² uncertain · ${m.debrisKm2.toFixed(2)} km² suspected debris`} />
        <Tile onClick={() => go("impact", "infra")} tone="crit" icon={<Building2 className="size-3.5" />} label="Buildings potentially affected" value={m.buildingsLikely} unit={`+ ${m.buildingsPossible} possible`} sub={`of ${m.buildingsTotal} mapped · ${m.roadSegmentsBlocked} roads, ${m.bridgesBlocked + m.bridgesSuspected} of ${m.bridgesTotal} bridges flagged`} />
        <Tile onClick={() => go("impact", "settlements")} tone="crit" icon={<Home className="size-3.5" />} label="Settlements: modeled disconnected" value={m.settlementsDisconnected} unit={`of ${m.settlementsTotal}`} sub={`${m.settlementsSuspected} more with uncertain access · modeled, not confirmed`} />
      </section>

      <section>
        <SectionTitle right={<button onClick={() => go("priorities")} className="text-[10.5px] normal-case tracking-normal text-water hover:underline">View all</button>}>Investigate first</SectionTitle>
        <ul className="space-y-1.5">
          {top.map((p, i) => (
            <li key={p.id}>
              <button onClick={() => pick(p.selection)} className="flex w-full items-start gap-2.5 rounded-lg border border-line bg-white px-2.5 py-2 text-left transition hover:border-slate-500">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-ink-700 font-mono text-[10.5px] text-slate-300">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-slate-100">{p.name}</span>
                  <span className="block text-[10.5px] text-slate-500">
                    {TIER_LABEL[p.tier]} · {p.impact}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-1.5">
        <SectionTitle>Next useful actions</SectionTitle>
        <button onClick={() => go("impact", "critical")} className={cn(btnCls.base, btnCls.outline, "w-full justify-start")}>
          <Network className="size-3.5 text-slate-500" /> Review critical connections ({critical} serve 2+ settlements)
        </button>
        <button onClick={() => go("impact", "simulator")} className={cn(btnCls.base, btnCls.outline, "w-full justify-start")}>
          <ListChecks className="size-3.5 text-slate-500" /> Test a what-if road loss (hypothetical)
        </button>
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={() => generateReport("en")} className={cn(btnCls.base, btnCls.primary)}>
            <FileText className="size-3.5" /> Rescue Brief
          </button>
          <button onClick={() => setCopilot("open")} className={cn(btnCls.base, btnCls.soft)}>
            <Sparkles className="size-3.5" /> Ask Copilot
          </button>
        </div>
      </section>
    </div>
  );
}
