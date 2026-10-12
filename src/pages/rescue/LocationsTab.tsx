import { useMemo, useState } from "react";
import { Clock, Crosshair, Download, ListChecks, Search } from "lucide-react";
import { buildPriorities, comparePriority, RULES, TIER_LABEL, type PriorityEntry, type PriorityKind, type PriorityTier } from "../../analysis/priorities";
import { Badge, Chip, ConfidenceBar, EmptyState, btnCls, inputCls } from "../../components/ui";
import { buildCsv } from "../../lib/csv";
import { downloadText } from "../../lib/exporters";
import { fmtLL, type Tone } from "../../lib/format";
import { useApp } from "../../state/store";
import { VERIF_LABEL, VERIF_TONE, statusOf } from "../../state/tasks";
import { cn } from "../../utils/cn";

const TIER_TONE: Record<PriorityTier, Tone> = { 1: "crit", 2: "warn", 3: "info" };
const KIND_LABEL: Record<PriorityKind, string> = { settlement: "Settlement", bridge: "Bridge", road: "Road", facility: "Facility" };
type Sort = "rule" | "name" | "confidence" | "type";

/** A. Priority Locations — bridges, road segments, settlements and facilities that require further investigation. */
export function LocationsTab() {
  const { results, selected, pick, notify, tasks, go } = useApp();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | PriorityKind>("all");
  const [tier, setTier] = useState<"all" | PriorityTier>("all");
  const [sort, setSort] = useState<Sort>("rule");

  const all = useMemo(() => (results ? buildPriorities(results) : []), [results]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const out = all.filter((p) => (kind === "all" || p.kind === kind) && (tier === "all" || p.tier === tier) && (!s || `${p.name} ${p.impact} ${p.reason} ${p.evidence.join(" ")}`.toLowerCase().includes(s)));
    const cmp: Record<Sort, (a: PriorityEntry, b: PriorityEntry) => number> = {
      rule: comparePriority,
      name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
      confidence: (a, b) => (b.confidence ?? -1) - (a.confidence ?? -1) || comparePriority(a, b),
      type: (a, b) => a.kind.localeCompare(b.kind) || comparePriority(a, b),
    };
    return [...out].sort(cmp[sort]);
  }, [all, q, kind, tier, sort]);

  const tierCount = (t: PriorityTier) => all.filter((p) => p.tier === t).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2.5 border-b border-line p-3">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-slate-500">Places that warrant further investigation, ordered by the transparent rules below. A priority is not a confirmed emergency — it says where the evidence suggests looking next.</p>
          <button
            disabled={!results}
            onClick={() => {
              if (!results) return;
              const f = buildCsv("priorities", results);
              downloadText(f.name, f.text, "text/csv");
              notify("Priorities exported as CSV.");
            }}
            className={cn(btnCls.base, btnCls.outline, btnCls.sm)}
          >
            <Download className="size-3" /> CSV
          </button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-slate-500" />
          <input className={cn(inputCls, "pl-8")} placeholder="Search location, impact or evidence" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search priorities" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["all", "settlement", "bridge", "road", "facility"] as const).map((k) => (
            <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
              {k === "all" ? "All types" : `${KIND_LABEL[k]}s`}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={tier === "all"} onClick={() => setTier("all")}>
            Any tier
          </Chip>
          {([1, 2, 3] as const).map((t) => (
            <Chip key={t} active={tier === t} onClick={() => setTier(t)}>
              {TIER_LABEL[t]} · {tierCount(t)}
            </Chip>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-500">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-6 rounded border border-line bg-white px-1.5 text-[11px] text-slate-200 outline-none focus:border-water">
              <option value="rule">Priority rule</option>
              <option value="name">Name</option>
              <option value="confidence">Evidence score</option>
              <option value="type">Type</option>
            </select>
          </label>
        </div>
      </div>

      {!results ? (
        <EmptyState icon={<ListChecks className="size-5" />} title="No analysis results" className="flex-1">
          Run the flood analysis to derive rescue priorities.
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState icon={<Search className="size-5" />} title="No locations match these filters" className="flex-1">
          Clear the search or choose another type or tier.
        </EmptyState>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {list.map((p, i) => {
            const on = selected?.kind === p.selection.kind && selected.id === p.selection.id;
            const st = statusOf(tasks, p.id);
            return (
              <li key={p.id} className={cn("rounded-lg border p-3 transition", on ? "border-water bg-water/5" : "border-line bg-white")}>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-ink-700 font-mono text-[10.5px] text-slate-300">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[12.5px] font-medium text-slate-100">{p.name}</span>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone={TIER_TONE[p.tier]}>{TIER_LABEL[p.tier]}</Badge>
                      <Badge>{KIND_LABEL[p.kind]}</Badge>
                      <Badge tone={VERIF_TONE[st]}>{VERIF_LABEL[st]}</Badge>
                      <span className="font-mono text-[10px] text-slate-500">{fmtLL(p.loc)}</span>
                    </div>
                  </div>
                </div>
                <dl className="mt-2.5 space-y-1.5 text-[11.5px] leading-snug">
                  <div className="grid grid-cols-[84px_1fr] gap-2">
                    <dt className="text-slate-500">Potential impact</dt>
                    <dd className="text-slate-200">{p.impact}</dd>
                  </div>
                  <div className="grid grid-cols-[84px_1fr] gap-2">
                    <dt className="text-slate-500">Why flagged</dt>
                    <dd className="text-slate-300">
                      <span className="mr-1 rounded bg-ink-700 px-1 font-mono text-[10px] text-slate-300">Rule {p.rule}</span>
                      {p.reason}
                    </dd>
                  </div>
                  <div className="grid grid-cols-[84px_1fr] gap-2">
                    <dt className="text-slate-500">Evidence</dt>
                    <dd>
                      <ul className="space-y-0.5">
                        {p.evidence.map((e, k) => (
                          <li key={k} className="flex gap-1.5 text-slate-400">
                            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-slate-500" />
                            {e}
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                  <div className="grid grid-cols-[84px_1fr] gap-2">
                    <dt className="text-slate-500">Confidence</dt>
                    <dd className="text-slate-400">
                      {p.confidence === null ? <span className="text-slate-300">Not calculated</span> : <ConfidenceBar value={p.confidence} />}
                      <span className="mt-0.5 block text-[10.5px] text-slate-500">{p.confidenceNote}</span>
                    </dd>
                  </div>
                  <div className="grid grid-cols-[84px_1fr] gap-2">
                    <dt className="flex items-center gap-1 text-slate-500">
                      <Clock className="size-3" /> Data date
                    </dt>
                    <dd className="text-[10.5px] text-slate-500">{p.freshness}</dd>
                  </div>
                </dl>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <button onClick={() => pick(p.selection)} className={cn(btnCls.base, btnCls.outline, btnCls.sm)}>
                    <Crosshair className="size-3" /> Inspect on map
                  </button>
                  <button
                    onClick={() => {
                      pick(p.selection);
                      go("priorities", "tasks");
                    }}
                    className={cn(btnCls.base, btnCls.soft, btnCls.sm)}
                  >
                    Update verification status
                  </button>
                </div>
              </li>
            );
          })}
          <li>
            <details className="rounded-lg border border-line bg-ink-850 px-3 py-2 text-[11px] text-slate-400">
              <summary className="cursor-pointer text-[11.5px] font-medium text-slate-300">How priorities are assigned (all rules)</summary>
              <ul className="mt-2 space-y-1.5">
                {RULES.map((r) => (
                  <li key={r.id} className="flex gap-2 leading-snug">
                    <Badge tone={TIER_TONE[r.tier]} className="h-fit">
                      {r.id} · tier {r.tier}
                    </Badge>
                    <span>
                      <span className="text-slate-300">{r.applies}.</span> {r.text}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-slate-500">Within a tier: settlements, bridges, roads, facilities; then by dependent settlements or exposed buildings; then evidence score. No numeric urgency score is used.</p>
            </details>
          </li>
        </ul>
      )}
    </div>
  );
}
