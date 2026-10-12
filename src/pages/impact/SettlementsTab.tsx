import { useEffect, useMemo, useState } from "react";
import { Crosshair, Download, Info, MessageSquareText, Search } from "lucide-react";
import { explainSettlement } from "../../analysis/explain";
import { compareSettlements } from "../../analysis/priorities";
import { Badge, Chip, EmptyState, Notice, btnCls, inputCls, toneText } from "../../components/ui";
import { buildCsv } from "../../lib/csv";
import { downloadText } from "../../lib/exporters";
import { ACCESS_LABEL, ACCESS_TONE, HOSPITAL_LABEL, HOSPITAL_TONE, fmtLL } from "../../lib/format";
import { useApp } from "../../state/store";
import type { AccessStatus } from "../../types";
import { cn } from "../../utils/cn";

export function SettlementsTab() {
  const { results, selected, pick, ask, notify, go } = useApp();
  const [filter, setFilter] = useState<AccessStatus | "all">("all");
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    if (!results) return [];
    const s = q.trim().toLowerCase();
    return [...results.settlements]
      .filter((x) => (filter === "all" ? true : x.status === filter))
      .filter((x) => !s || `${x.name} ${x.nameNe}`.toLowerCase().includes(s))
      .sort(compareSettlements);
  }, [results, filter, q]);

  useEffect(() => {
    if (selected?.kind === "settlement") document.getElementById(`st-${selected.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  const m = results?.metrics;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2.5 border-b border-line p-3">
        <div className="flex items-start gap-2">
          <Notice tone="info" icon={<Info className="size-3.5" />}>
            Statuses come from routing on the <span className="font-medium text-slate-100">pre-event OpenStreetMap road network</span> with flagged segments removed. Modeled connectivity is <span className="font-medium text-slate-100">not confirmed ground access</span>; unmapped tracks, ferries and footpaths are not modeled, and missing data is never treated as a destroyed road.
          </Notice>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {m &&
            (
              [
                ["all", `All ${m.settlementsTotal}`],
                ["disconnected", `Modeled disconnected ${m.settlementsDisconnected}`],
                ["suspected", `Access uncertain ${m.settlementsSuspected}`],
                ["connected", `Access maintained ${m.settlementsConnected}`],
              ] as const
            ).map(([v, l]) => (
              <Chip key={v} active={filter === v} onClick={() => setFilter(v)}>
                {l}
              </Chip>
            ))}
          <button
            disabled={!results}
            onClick={() => {
              if (!results) return;
              const f = buildCsv("settlements", results);
              downloadText(f.name, f.text, "text/csv");
              notify("Settlement connectivity exported as CSV.");
            }}
            className={cn(btnCls.base, btnCls.outline, btnCls.sm, "ml-auto")}
          >
            <Download className="size-3" /> CSV
          </button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-slate-500" />
          <input className={cn(inputCls, "pl-8")} placeholder="Search settlements" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search settlements" />
        </div>
      </div>

      {!results ? (
        <EmptyState icon={<Search className="size-5" />} title="No analysis results" className="flex-1">
          Run the flood analysis to model settlement connectivity.
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState icon={<Search className="size-5" />} title="No settlements match" className="flex-1">
          Clear the search or choose another access status.
        </EmptyState>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {list.map((s) => {
            const on = selected?.kind === "settlement" && selected.id === s.id;
            return (
              <li key={s.id} id={`st-${s.id}`}>
                <div className={cn("overflow-hidden rounded-lg border transition", on ? "border-water bg-water/5" : "border-line bg-white hover:border-slate-500")}>
                  <button onClick={() => pick({ kind: "settlement", id: s.id })} className="block w-full p-3 text-left" aria-expanded={on}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-medium text-slate-100">
                        {s.name} <span className="font-normal text-slate-500">· {s.nameNe}</span>
                      </span>
                      <Badge tone={ACCESS_TONE[s.status]}>{ACCESS_LABEL[s.status]}</Badge>
                    </span>
                    <span className="mt-1.5 grid grid-cols-[100px_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                      <span className="text-slate-500">Nearest facility</span>
                      <span className="text-slate-300">
                        {s.post ? `${s.post.service} · ${s.post.km} km${s.post.viaUncertain ? " (via uncertain segment)" : ""}` : <span className="text-crit">No modeled road route</span>}
                        {s.baseline && <span className="text-slate-500"> — before: {s.baseline.km} km</span>}
                      </span>
                      <span className="text-slate-500">Flagged segments</span>
                      <span className="text-slate-300">{s.disrupted.length ? s.disrupted.map((d) => d.name.replace(/^(Highway|Track|Road|Spur road) · /, "")).join("; ") : "None on the pre-event route"}</span>
                      <span className="text-slate-500">Hospital</span>
                      <span className={toneText[HOSPITAL_TONE[s.hospital.status]]}>{HOSPITAL_LABEL[s.hospital.status]}</span>
                    </span>
                  </button>
                  {on && (
                    <div className="animate-fade-in space-y-2 border-t border-line bg-ink-850 px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Reason for this classification</div>
                      <ul className="space-y-1.5">
                        {explainSettlement(s, results, "en").map((t, i, arr) => (
                          <li key={i} className={cn("flex gap-1.5 text-[11.5px] leading-snug", i === arr.length - 1 ? "text-slate-500" : "text-slate-300")}>
                            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-slate-500" />
                            {t}
                          </li>
                        ))}
                      </ul>
                      {s.disrupted.length > 0 && (
                        <div>
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Suspected disrupted segments on the pre-event route</div>
                          <ul className="space-y-1">
                            {s.disrupted.map((d) => (
                              <li key={d.edgeId}>
                                <button onClick={() => pick({ kind: "edge", id: d.edgeId })} className="flex w-full items-center gap-2 rounded border border-line bg-white px-2 py-1 text-left transition hover:border-slate-500">
                                  <Badge tone={d.state === "blocked" ? "crit" : "warn"}>{d.state === "blocked" ? "Likely inundated" : "Possible"}</Badge>
                                  <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">{d.name}</span>
                                  <span className="font-mono text-[9.5px] text-slate-600">{d.edgeId}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="font-mono text-[10px] text-slate-600">{fmtLL(s.pos)}</div>
                      <div className="flex gap-1.5">
                        <button onClick={() => pick({ kind: "settlement", id: s.id })} className={cn(btnCls.base, btnCls.outline, btnCls.sm, "flex-1")}>
                          <Crosshair className="size-3" /> Locate on map
                        </button>
                        <button onClick={() => ask(`Why is ${s.name} ${s.status === "connected" ? "still connected" : "flagged"}?`)} className={cn(btnCls.base, btnCls.soft, btnCls.sm, "flex-1")}>
                          <MessageSquareText className="size-3" /> Ask Copilot
                        </button>
                        <button onClick={() => go("impact", "alternatives")} className={cn(btnCls.base, btnCls.outline, btnCls.sm, "flex-1")}>
                          Alternative route
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
