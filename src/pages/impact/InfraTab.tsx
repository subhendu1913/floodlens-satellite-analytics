import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { buildInfraRows, EXPOSURE_TONE, type Exposure, type InfraType } from "../../analysis/tables";
import { Badge, Chip, ConfidenceBar, EmptyState, btnCls, inputCls } from "../../components/ui";
import { SCENARIO } from "../../data/scenario";
import { buildCsv } from "../../lib/csv";
import { downloadText } from "../../lib/exporters";
import { fmtLL, fmtShort } from "../../lib/format";
import { useApp } from "../../state/store";
import { cn } from "../../utils/cn";

const PAGE = 20;

export function InfraTab() {
  const { results, selected, pick, notify } = useApp();
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | InfraType>("all");
  const [exp, setExp] = useState<"affected" | "all" | Exposure>("affected");
  const [page, setPage] = useState(0);

  const rows = useMemo(() => (results ? buildInfraRows(results) : []), [results]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (type !== "all" && r.type !== type) return false;
      if (exp === "affected" ? r.exposure !== "likely" && r.exposure !== "possible" : exp !== "all" && r.exposure !== exp) return false;
      return !s || `${r.name} ${r.id} ${r.typeLabel} ${r.evidence} ${r.area ?? ""}`.toLowerCase().includes(s);
    });
  }, [rows, q, type, exp]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * PAGE, cur * PAGE + PAGE);
  const counts = useMemo(() => ({ likely: rows.filter((r) => r.exposure === "likely").length, possible: rows.filter((r) => r.exposure === "possible").length }), [rows]);

  const a = results?.acquisitions;
  const src = results
    ? `OSM ${fmtShort(SCENARIO.osmSnapshotDate)} · ${[results.effectiveSensor !== "S2" && a?.s1Post ? `S1 ${fmtShort(a.s1Post.date)}` : null, results.effectiveSensor !== "S1" && a?.s2Post ? `S2 ${fmtShort(a.s2Post.date)}` : null].filter(Boolean).join(" · ")}`
    : "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2.5 border-b border-line p-3">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-slate-500">
            Pre-event OpenStreetMap assets intersected with the detected water and debris layers. “Potentially affected” describes exposure — <span className="text-slate-300">not confirmed damage</span>.
            {results && (
              <span className="text-slate-400">
                {" "}
                {counts.likely} likely · {counts.possible} possible of {rows.length} assets.
              </span>
            )}
          </p>
          <button
            disabled={!results}
            onClick={() => {
              if (!results) return;
              const f = buildCsv("infrastructure", results);
              downloadText(f.name, f.text, "text/csv");
              notify("Infrastructure table exported as CSV.");
            }}
            className={cn(btnCls.base, btnCls.outline, btnCls.sm)}
          >
            <Download className="size-3" /> CSV
          </button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-slate-500" />
          <input className={cn(inputCls, "pl-8")} placeholder="Search name, ID, type, evidence or settlement" value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} aria-label="Search infrastructure" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "All types"],
              ["bridge", "Bridges"],
              ["road", "Roads"],
              ["building", "Buildings"],
              ["facility", "Facilities"],
            ] as const
          ).map(([v, l]) => (
            <Chip key={v} active={type === v} onClick={() => (setType(v), setPage(0))}>
              {l}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["affected", "Potentially affected"],
              ["likely", "Likely"],
              ["possible", "Possible"],
              ["unassessed", "Not assessable"],
              ["none", "No indicator"],
              ["all", "Everything"],
            ] as const
          ).map(([v, l]) => (
            <Chip key={v} active={exp === v} onClick={() => (setExp(v), setPage(0))}>
              {l}
            </Chip>
          ))}
        </div>
      </div>

      {!results ? (
        <EmptyState icon={<Search className="size-5" />} title="No analysis results" className="flex-1">
          Run the flood analysis to populate the infrastructure table.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Search className="size-5" />} title="No assets match these filters" className="flex-1">
          Widen the exposure filter or clear the search.
        </EmptyState>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-ink-850 text-[10px] uppercase tracking-wider text-slate-500">
                <tr className="border-b border-line">
                  <th className="px-3 py-1.5 font-medium">Asset</th>
                  <th className="px-2 py-1.5 font-medium">Type · location</th>
                  <th className="px-2 py-1.5 font-medium">Potential exposure</th>
                  <th className="px-2 py-1.5 font-medium">Available evidence</th>
                  <th className="px-2 py-1.5 font-medium">Source · dates</th>
                  <th className="px-2 py-1.5 font-medium">Evidence score</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((r) => {
                  const on = selected?.kind === r.selection.kind && selected.id === r.selection.id;
                  return (
                    <tr key={r.key} onClick={() => pick(r.selection)} className={cn("cursor-pointer border-b border-line/70 align-top transition hover:bg-slate-500/5", on && "bg-water/10")}>
                      <td className="px-3 py-2">
                        <button className="text-left text-[12px] font-medium text-slate-100 hover:text-water" aria-label={`Show ${r.name} on map`}>
                          {r.name}
                        </button>
                        <div className="font-mono text-[10px] text-slate-600">
                          {r.id}
                          {r.area ? ` · ${r.area}` : ""}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-[11px] text-slate-400">
                        {r.typeLabel}
                        <div className="whitespace-nowrap font-mono text-[10px] text-slate-500">{fmtLL(r.loc)}</div>
                      </td>
                      <td className="px-2 py-2">
                        <Badge tone={EXPOSURE_TONE[r.exposure]} className="whitespace-normal">
                          {r.exposureLabel}
                        </Badge>
                      </td>
                      <td className="max-w-[240px] px-2 py-2 text-[11px] leading-snug text-slate-400">{r.evidence}</td>
                      <td className="px-2 py-2 text-[10px] leading-snug text-slate-500">{src}</td>
                      <td className="px-2 py-2">{r.confidence === null ? <span className="text-[10.5px] text-slate-600">not calculated</span> : <ConfidenceBar value={r.confidence} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2 text-[11px] text-slate-500">
            <span className="mr-auto">
              {filtered.length} asset{filtered.length === 1 ? "" : "s"} · page {cur + 1} / {pages}
            </span>
            <button disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Previous page" className="rounded border border-line p-1 text-slate-300 transition hover:border-slate-500 disabled:opacity-30">
              <ChevronLeft className="size-3.5" />
            </button>
            <button disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Next page" className="rounded border border-line p-1 text-slate-300 transition hover:border-slate-500 disabled:opacity-30">
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
