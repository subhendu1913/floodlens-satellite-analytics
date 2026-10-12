import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Clock, Crosshair, Download, Search, TriangleAlert } from "lucide-react";
import { buildPriorities, TIER_LABEL, type PriorityEntry, type PriorityKind } from "../../analysis/priorities";
import { Badge, Chip, ConfidenceBar, EmptyState, Notice, btnCls, inputCls } from "../../components/ui";
import { SCENARIO } from "../../data/scenario";
import { toCsv } from "../../lib/csv";
import { downloadText } from "../../lib/exporters";
import { fmtLL } from "../../lib/format";
import { useApp } from "../../state/store";
import { VERIF_HELP, VERIF_LABEL, VERIF_ORDER, VERIF_TONE, statusOf, taskCounts, type VerifStatus } from "../../state/tasks";
import { cn } from "../../utils/cn";

const KIND_LABEL: Record<PriorityKind, string> = { settlement: "Settlement", bridge: "Bridge", road: "Road", facility: "Facility" };

function TaskCard({ p, active }: { p: PriorityEntry; active: boolean }) {
  const { tasks, updateTask, pick, results } = useApp();
  const rec = tasks[p.id];
  const status = statusOf(tasks, p.id);
  const [note, setNote] = useState(rec?.note ?? "");
  const [saved, setSaved] = useState(false);
  const stale = !!rec && !!results && rec.analysisId !== results.id;

  return (
    <li id={`task-${p.id}`} className={cn("rounded-lg border p-3 transition", active ? "border-water bg-water/5" : "border-line bg-white")}>
      <div className="flex flex-wrap items-start gap-1.5">
        <button onClick={() => pick(p.selection)} title="Locate on the map" className="mr-auto flex min-w-0 items-center gap-1.5 text-left text-[12.5px] font-medium text-slate-100 hover:text-water">
          <Crosshair className="size-3.5 shrink-0 text-slate-500" /> <span className="truncate">{p.name}</span>
        </button>
        <Badge tone={VERIF_TONE[status]}>{VERIF_LABEL[status]}</Badge>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Badge>{KIND_LABEL[p.kind]}</Badge>
        <Badge tone={p.tier === 1 ? "crit" : p.tier === 2 ? "warn" : "info"}>{TIER_LABEL[p.tier]}</Badge>
        <span className="font-mono text-[10px] text-slate-500">{fmtLL(p.loc)}</span>
      </div>

      <dl className="mt-2 space-y-1 text-[11.5px] leading-snug">
        <div className="grid grid-cols-[84px_1fr] gap-2">
          <dt className="text-slate-500">Potential impact</dt>
          <dd className="text-slate-200">{p.impact}</dd>
        </div>
        <div className="grid grid-cols-[84px_1fr] gap-2">
          <dt className="text-slate-500">Why flagged</dt>
          <dd className="text-slate-300">
            <span className="mr-1 rounded bg-ink-700 px-1 font-mono text-[10px]">Rule {p.rule}</span>
            {p.reason}
          </dd>
        </div>
        <div className="grid grid-cols-[84px_1fr] gap-2">
          <dt className="text-slate-500">Evidence</dt>
          <dd>
            <ul className="space-y-0.5 text-slate-400">
              {p.evidence.slice(0, 3).map((e, k) => (
                <li key={k} className="flex gap-1.5">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-slate-500" />
                  {e}
                </li>
              ))}
              {p.evidence.length > 3 && <li className="text-[10.5px] text-slate-500">+ {p.evidence.length - 3} more in the Evidence Inspector</li>}
            </ul>
          </dd>
        </div>
        <div className="grid grid-cols-[84px_1fr] gap-2">
          <dt className="text-slate-500">Confidence</dt>
          <dd>{p.confidence === null ? <span className="text-slate-300">Not calculated</span> : <ConfidenceBar value={p.confidence} />}</dd>
        </div>
        <div className="grid grid-cols-[84px_1fr] gap-2">
          <dt className="flex items-center gap-1 text-slate-500">
            <Clock className="size-3" /> Data date
          </dt>
          <dd className="text-[10.5px] text-slate-500">{p.freshness}</dd>
        </div>
      </dl>

      <div className="mt-2.5 space-y-1.5 border-t border-line pt-2.5">
        <label className="grid grid-cols-[84px_1fr] items-center gap-2 text-[11px] font-medium text-slate-300">
          Status
          <select value={status} onChange={(e) => updateTask(p.id, { status: e.target.value as VerifStatus })} aria-label={`Verification status for ${p.name}`} className={cn(inputCls, "h-8 text-[12px]")}>
            {VERIF_ORDER.map((s) => (
              <option key={s} value={s}>
                {VERIF_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <p className="pl-[92px] text-[10.5px] leading-snug text-slate-500">{VERIF_HELP[status]}</p>
        <label className="grid grid-cols-[84px_1fr] items-start gap-2 text-[11px] font-medium text-slate-300">
          <span className="pt-1.5">Note</span>
          <textarea
            value={note}
            maxLength={280}
            rows={2}
            onChange={(e) => {
              setNote(e.target.value);
              setSaved(false);
            }}
            placeholder="Short note — e.g. who was contacted, what was seen"
            className="w-full resize-none rounded-md border border-line bg-white px-2.5 py-1.5 text-[12px] font-normal text-slate-100 outline-none placeholder:text-slate-600 focus:border-water focus:ring-2 focus:ring-water/20"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 pl-[92px]">
          <button
            disabled={note === (rec?.note ?? "")}
            onClick={() => {
              updateTask(p.id, { note: note.trim() });
              setSaved(true);
            }}
            className={cn(btnCls.base, btnCls.outline, btnCls.sm)}
          >
            Save note
          </button>
          <span className="text-[10.5px] text-slate-500">{note.length}/280</span>
          {saved && <span className="text-[10.5px] font-medium text-ok">Saved</span>}
        </div>
        {rec ? (
          <p className="pl-[92px] text-[10px] leading-snug text-slate-500">
            <Badge tone="info" className="mr-1">
              Manual
            </Badge>
            Set by {rec.updatedBy} · {rec.updatedAt.slice(0, 16).replace("T", " ")} UTC · stored in this browser
            {stale && <span className="ml-1 font-medium text-warn">· recorded against an earlier analysis run — re-check</span>}
          </p>
        ) : (
          <p className="pl-[92px] text-[10px] text-slate-500">Default status — no one has updated this task yet.</p>
        )}
      </div>
    </li>
  );
}

/** C. Verification Tasks — the investigation workflow for flagged findings. Statuses are manual, never automatic. */
export function TasksTab() {
  const { results, tasks, selected, notify } = useApp();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | VerifStatus>("all");
  const [kind, setKind] = useState<"all" | PriorityKind>("all");

  const entries = useMemo(() => (results ? buildPriorities(results) : []), [results]);
  const counts = useMemo(() => taskCounts(entries.map((e) => e.id), tasks), [entries, tasks]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return entries.filter((e) => (status === "all" || statusOf(tasks, e.id) === status) && (kind === "all" || e.kind === kind) && (!s || `${e.name} ${e.impact} ${tasks[e.id]?.note ?? ""}`.toLowerCase().includes(s)));
  }, [entries, tasks, status, kind, q]);

  const selTask = results && selected ? entries.find((e) => e.selection.kind === selected.kind && e.selection.id === selected.id) : null;
  useEffect(() => {
    if (selTask) document.getElementById(`task-${selTask.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selTask]);

  const exportCsv = () => {
    if (!results) return;
    const rows = entries.map((e) => {
      const r = tasks[e.id];
      return [VERIF_LABEL[statusOf(tasks, e.id)], r?.note ?? "", r?.updatedAt ?? "", r?.updatedBy ?? "", e.name, KIND_LABEL[e.kind], e.loc[0].toFixed(5), e.loc[1].toFixed(5), e.impact, e.rule, e.reason, e.evidence.join(" | "), e.confidence === null ? "" : Math.round(e.confidence * 100), e.freshness, "DEMO_SAMPLE_DATA", results.id, SCENARIO.osmSnapshotDate];
    });
    downloadText(`floodlens_verification_tasks_${results.params.eventDate}.csv`, toCsv(["verification_status_manual", "note", "updated_at", "updated_by", "name", "type", "lat", "lon", "potential_impact", "rule_id", "rule", "evidence", "evidence_score_pct", "data_freshness", "data_class", "analysis_id", "osm_snapshot"], rows), "text/csv");
    notify("Verification tasks exported as CSV.");
  };

  if (!results) {
    return (
      <EmptyState icon={<ClipboardCheck className="size-5" />} title="No analysis results" className="h-full">
        Run the flood analysis to create verification tasks.
      </EmptyState>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2.5 border-b border-line p-3">
        <Notice tone="info" icon={<TriangleAlert className="size-3.5" />}>
          Statuses are <span className="font-medium text-slate-100">manual entries</span> that track an investigation. “Verified” means a person recorded a check — FloodLens cannot confirm real-world conditions itself. Stored in this browser only.
        </Notice>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={status === "all"} onClick={() => setStatus("all")}>
            All {entries.length}
          </Chip>
          {VERIF_ORDER.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
              {VERIF_LABEL[s]} · {counts[s]}
            </Chip>
          ))}
          <button onClick={exportCsv} className={cn(btnCls.base, btnCls.outline, btnCls.sm, "ml-auto")}>
            <Download className="size-3" /> CSV
          </button>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-slate-500" />
            <input className={cn(inputCls, "pl-8")} placeholder="Search tasks and notes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search verification tasks" />
          </div>
          <select value={kind} onChange={(e) => setKind(e.target.value as "all" | PriorityKind)} aria-label="Filter by type" className="h-8 rounded-md border border-line bg-white px-2 text-[12px] text-slate-200 outline-none focus:border-water">
            <option value="all">All types</option>
            {(Object.keys(KIND_LABEL) as PriorityKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<Search className="size-5" />} title="No tasks match" className="flex-1">
          Clear the search or choose another status.
        </EmptyState>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {list.map((p) => (
            <TaskCard key={p.id} p={p} active={selTask?.id === p.id} />
          ))}
        </ul>
      )}
    </div>
  );
}
