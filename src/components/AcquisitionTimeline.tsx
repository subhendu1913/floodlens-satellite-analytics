import { useState } from "react";
import { X } from "lucide-react";
import { inPeriod, isIsoDate, observationWindow, sameGeometry } from "../analysis/acquisitions";
import { fmtDate, fmtShort } from "../lib/format";
import { useApp } from "../state/store";
import type { Acquisition, MatchedAcquisitions, PickKey } from "../types";
import { cn } from "../utils/cn";
import { Badge, btnCls } from "./ui";

type Role = "before" | "after" | "rejected" | "available" | "unused";
const day = (iso: string) => Date.parse(iso + "T00:00:00Z") / 86400000;

const ROLE_TEXT: Record<Role, string> = {
  before: "Used as the before-event image.",
  after: "Used as the after-event image.",
  rejected: "Rejected: different orbit track from the after-event image, so it is not compared.",
  available: "Available — not selected for this analysis.",
  unused: "Not used (this sensor is not selected).",
};
const MARK: Record<Role, string> = {
  before: "border-navy bg-navy",
  after: "border-water bg-water",
  rejected: "border-warn bg-white",
  available: "border-slate-400 bg-white",
  unused: "border-line bg-ink-850",
};

function roleOf(a: Acquisition, m: MatchedAcquisitions, wanted: boolean): Role {
  if (!wanted) return "unused";
  if (m.s1Pre?.id === a.id || m.s2Pre?.id === a.id) return "before";
  if (m.s1Post?.id === a.id || m.s2Post?.id === a.id) return "after";
  if (m.s1Rejected?.id === a.id) return "rejected";
  return "available";
}

/**
 * Timeline of the satellite acquisitions that ACTUALLY exist around the requested period.
 * Acquisitions are discrete: nothing is drawn between them and no date is ever invented.
 * Click a marker to inspect it; use it as the before- or after-event image.
 */
export function AcquisitionTimeline({ compact = false }: { compact?: boolean }) {
  const { params, setParams, validation, onMode } = useApp();
  const [selId, setSelId] = useState<string | null>(null);
  const m = validation.matched;
  const ok = [params.fromDate, params.toDate, params.eventDate].every(isIsoDate) && params.fromDate <= params.toDate;

  if (!ok) return <p className="rounded-md border border-dashed border-line px-3 py-3 text-[11.5px] text-slate-500">Enter a valid From and To date to see the satellite acquisitions available for the period.</p>;

  const acqs = observationWindow(params, m);
  const days = acqs.map((a) => day(a.date));
  const lo = Math.min(day(params.fromDate) - 14, ...days) - 0.5;
  const hi = Math.max(day(params.toDate), day(params.eventDate), ...days) + 0.5;
  const pos = (iso: string) => ((day(iso) - lo) / (hi - lo)) * 100;
  const wantedOf = (a: Acquisition) => params.sensor === "S1S2" || params.sensor === a.sensor;
  const sel = acqs.find((a) => a.id === selId) ?? null;
  const selRole = sel ? roleOf(sel, m, wantedOf(sel)) : "available";

  const select = (a: Acquisition, role: Role) => {
    setSelId(a.id === selId ? null : a.id);
    if (role === "before") onMode("before");
    else if (role === "after") onMode("after");
  };
  const choose = (a: Acquisition, pre: boolean) => {
    const k = (a.sensor === "S1" ? (pre ? "s1Pre" : "s1Post") : pre ? "s2Pre" : "s2Post") as PickKey;
    setParams({ ...params, picks: { ...params.picks, [k]: a.id } });
  };

  const rows: { sensor: "S1" | "S2"; label: string }[] = [
    { sensor: "S1", label: "Sentinel-1 radar" },
    { sensor: "S2", label: "Sentinel-2 optical" },
  ];
  const canBefore = !!sel && sel.date < params.eventDate;
  const other = sel && sel.sensor === "S1" ? (canBefore ? m.s1Post : m.s1Pre) : undefined;
  const mismatch = !!sel && !!other && !sameGeometry(sel, other);
  const noneInPeriod = !acqs.some((a) => inPeriod(a, params));

  return (
    <div className={cn("relative", !compact && "h-full")}>
      <div className="relative mx-3 pt-4">
        <div className="absolute bottom-3 top-4 border-x border-water/30 bg-water/10" style={{ left: `${pos(params.fromDate)}%`, width: `${pos(params.toDate) - pos(params.fromDate)}%` }} aria-hidden title="Requested analysis period" />
        <div className="absolute bottom-3 top-3 w-px bg-navy" style={{ left: `${pos(params.eventDate)}%` }} aria-hidden />
        <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold text-slate-200" style={{ left: `${pos(params.eventDate)}%` }}>
          Flood {fmtShort(params.eventDate)}
        </span>

        {rows.map((row) => (
          <div key={row.sensor} className="relative h-[38px]">
            <span className="absolute left-0 top-0 text-[9px] uppercase tracking-wide text-slate-500">{row.label}</span>
            <div className="absolute inset-x-0 top-[22px] h-px bg-line" />
            {acqs
              .filter((a) => a.sensor === row.sensor)
              .map((a) => {
                const role = roleOf(a, m, wantedOf(a));
                const cloudy = (a.cloudPct ?? 0) >= 25;
                return (
                  <span key={a.id}>
                    <button
                      onClick={() => select(a, role)}
                      aria-pressed={selId === a.id}
                      aria-label={`${row.label} acquisition ${fmtDate(a.date)}. ${ROLE_TEXT[role]}`}
                      title={`${fmtDate(a.date)} · ${ROLE_TEXT[role]}`}
                      className="absolute top-[16px] -translate-x-1/2 rounded-sm p-0.5"
                      style={{ left: `${pos(a.date)}%` }}
                    >
                      <span className={cn("relative block size-3 rotate-45 border-2 transition", MARK[role], !inPeriod(a, params) && "border-dashed", selId === a.id && "ring-2 ring-water/50")}>
                        {cloudy && <span className="absolute -right-1 -top-1 size-1.5 rounded-full bg-warn" />}
                      </span>
                    </button>
                    <span className="pointer-events-none absolute top-[30px] -translate-x-1/2 whitespace-nowrap text-[9.5px] text-slate-500" style={{ left: `${pos(a.date)}%` }}>
                      {fmtShort(a.date)}
                    </span>
                  </span>
                );
              })}
          </div>
        ))}

        <div className="relative h-3 text-[9px] text-slate-500">
          <span className="absolute -translate-x-1/2" style={{ left: `${pos(params.fromDate)}%` }}>
            ▏From {fmtShort(params.fromDate)}
          </span>
          <span className="absolute -translate-x-full" style={{ left: `${pos(params.toDate)}%` }}>
            To {fmtShort(params.toDate)} ▕
          </span>
        </div>
      </div>

      {noneInPeriod && <p className="mx-3 mt-1 text-[10.5px] text-warn">No acquisition exists inside the requested period — only earlier baseline scenes are shown.</p>}
      {compact && (
        <div className="mx-3 mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[9.5px] text-slate-500">
          <span>
            <i className="mr-1 inline-block size-2 rotate-45 border border-navy bg-navy" />
            before
          </span>
          <span>
            <i className="mr-1 inline-block size-2 rotate-45 border border-water bg-water" />
            after
          </span>
          <span>
            <i className="mr-1 inline-block size-2 rotate-45 border border-slate-400 bg-white" />
            available
          </span>
          <span>
            <i className="mr-1 inline-block size-2 rotate-45 border border-warn bg-white" />
            rejected
          </span>
          <span>
            <i className="mr-1 inline-block size-1.5 rounded-full bg-warn" />
            cloud ≥ 25%
          </span>
          <span>shaded = period</span>
        </div>
      )}

      {sel && (
        <div role="dialog" aria-label="Observation details" className={cn("rounded-lg border border-line bg-white p-2.5 shadow-md", compact ? "mt-2" : "absolute bottom-full left-1/2 z-[1200] mb-2 w-[340px] -translate-x-1/2")}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-slate-100">
                Sentinel-{sel.sensor === "S1" ? "1 radar" : "2 optical"} · {fmtDate(sel.date)}
              </div>
              <div className="font-mono text-[10px] text-slate-500">
                {sel.product}
                {sel.orbit ? ` · ${sel.orbit} orbit ${sel.relOrbit}` : ""}
              </div>
            </div>
            <button onClick={() => setSelId(null)} aria-label="Close observation details" className="rounded p-1 text-slate-500 hover:bg-slate-500/10 hover:text-slate-100">
              <X className="size-3.5" />
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Badge tone={inPeriod(sel, params) ? "ok" : "warn"}>{inPeriod(sel, params) ? "Inside period" : "Outside period"}</Badge>
            <Badge tone="neutral">{sel.date < params.eventDate ? "Before event" : "After event"}</Badge>
            {sel.cloudPct !== undefined && <Badge tone={sel.cloudPct >= 25 ? "warn" : "ok"}>{sel.cloudPct}% cloud</Badge>}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-slate-300">{ROLE_TEXT[selRole]}</p>
          {mismatch && <p className="mt-1 text-[11px] leading-snug text-warn">Different orbit track from the selected {canBefore ? "after" : "before"}-event Sentinel-1 image — that pair would not be compared.</p>}
          {!wantedOf(sel) && <p className="mt-1 text-[10.5px] text-slate-500">Select this sensor in the satellite choice to use the image.</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button disabled={!wantedOf(sel) || sel.date >= params.eventDate} onClick={() => choose(sel, true)} className={cn(btnCls.base, btnCls.soft, btnCls.sm)}>
              Use as before-event image
            </button>
            <button disabled={!wantedOf(sel) || sel.date < params.eventDate} onClick={() => choose(sel, false)} className={cn(btnCls.base, btnCls.soft, btnCls.sm)}>
              Use as after-event image
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
