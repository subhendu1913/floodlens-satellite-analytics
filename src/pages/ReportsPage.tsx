import { useMemo, useState } from "react";
import { Archive, Copy, Download, FileSpreadsheet, FilePlus2, FileText, FlaskConical, Info, Printer, Save, Send, ShieldCheck, Trash2, TriangleAlert, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Badge, EmptyState, Notice, Segmented, btnCls, inputCls } from "../components/ui";
import { reportToHtml, reportToText } from "../copilot/report";
import { CSV_LABEL, buildCsv, type CsvKind } from "../lib/csv";
import { copyText, downloadText, printHtml } from "../lib/exporters";
import { GEO_LABEL, buildGeoJson, type GeoKind } from "../lib/geojson";
import { createReportDoc, type ReportDoc } from "../reports/doc";
import { buildOfflineHtml, stalenessOf } from "../reports/offline";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";

const stamp = (iso: string) => iso.slice(0, 16).replace("T", " ") + " UTC";
const rowsFor = (text: string) => Math.min(30, Math.max(3, text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 88)), 0)));

function PublishDialog({ doc, onClose }: { doc: ReportDoc; onClose: () => void }) {
  const { publish, session } = useApp();
  const [reviewer, setReviewer] = useState(session.name);
  const [ack, setAck] = useState(false);
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Publish report" onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-[470px] rounded-xl border border-line bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Send className="size-4 text-water" />
          <h2 className="mr-auto text-[14px] font-semibold text-slate-100">Publish report</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-500/10 hover:text-slate-100">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3 p-4 text-[12px] text-slate-300">
          <p className="font-medium text-slate-100">{doc.title}</p>
          <Notice tone="warn" icon={<Info className="size-3.5" />}>
            Publishing adds this reviewed brief to the <span className="font-medium text-slate-100">Published Reports list in this browser</span>. Nothing is sent to a server, to any authority or to anyone else. The DEMO-data banner stays in the report.
          </Notice>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-slate-300">Reviewed by</span>
            <input className={inputCls} value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
          </label>
          <label className="flex items-start gap-2 text-[11.5px] leading-snug">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />I have reviewed the text, understand that the figures come from labelled DEMO data, and that exposure indicators are not confirmed damage.
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button onClick={onClose} className={cn(btnCls.base, btnCls.outline)}>
            Cancel
          </button>
          <button
            disabled={!ack || reviewer.trim().length < 2}
            onClick={() => {
              publish(reviewer.trim());
              onClose();
            }}
            className={cn(btnCls.base, btnCls.primary)}
          >
            <ShieldCheck className="size-3.5" /> Publish (demo)
          </button>
        </div>
      </div>
    </div>
  );
}

function OfflineDialog({ doc, onClose }: { doc: ReportDoc | null; onClose: () => void }) {
  const { results, sim, session, notify, tasks } = useApp();
  const exportDoc = useMemo(() => doc ?? (results ? createReportDoc(results, "en", session.name, { sim: null, tasks }) : null), [doc, results, session.name, tasks]);
  if (!results || !exportDoc) return null;
  const st = stalenessOf(results);
  const html = () => buildOfflineHtml(exportDoc, results);
  const csv = (k: CsvKind) => {
    const f = buildCsv(k, results, sim);
    downloadText(f.name, f.text, "text/csv");
    notify(`${CSV_LABEL[k]} exported as CSV.`);
  };
  const geo = (k: GeoKind) => {
    const f = buildGeoJson(k, results);
    downloadText(f.name, f.text, "application/geo+json");
    notify("GeoJSON exported.");
  };
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Prepare offline briefing" onMouseDown={(e) => e.stopPropagation()} className="flex max-h-[90vh] w-full max-w-[600px] flex-col rounded-xl border border-line bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Archive className="size-4 text-water" />
          <h2 className="mr-auto text-[14px] font-semibold text-slate-100">Prepare Offline Briefing</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-500/10 hover:text-slate-100">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto p-4 text-[12px] text-slate-300">
          <Notice tone={st.stale ? "warn" : "info"} icon={<Info className="size-3.5" />} title={`Export timestamp: ${st.exportedAt}`}>
            {st.text}
            <span className="mt-1 block text-slate-400">
              Exports are <span className="font-medium text-slate-100">static snapshots</span>: they do not receive new satellite observations or road-network updates. The FloodLens web app itself does not work offline — only the files you export can be read without it.
            </span>
          </Notice>
          <div>
            <h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">The briefing contains</h3>
            <ul className="grid gap-x-4 gap-y-0.5 text-[11.5px] text-slate-300 sm:grid-cols-2">
              {["Rescue Brief (situation report)", "Map snapshot (schematic)", "Settlement connectivity table", "Critical connections table", "Potentially affected infrastructure", "Data sources, attribution & limitations"].map((x) => (
                <li key={x} className="flex gap-1.5">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-water" />
                  {x}
                </li>
              ))}
            </ul>
            {!doc && <p className="mt-1.5 text-[10.5px] text-slate-500">No brief is open, so an English brief is generated from the current results for this export (it is not saved).</p>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => printHtml(html())} className={cn(btnCls.base, btnCls.primary)}>
              <Printer className="size-3.5" /> Print / Save as PDF
            </button>
            <button
              onClick={() => {
                downloadText(`FloodLens_offline_briefing_${results.params.eventDate}.html`, html(), "text/html");
                notify("Offline briefing downloaded (self-contained HTML).");
              }}
              className={cn(btnCls.base, btnCls.outline)}
            >
              <Download className="size-3.5" /> Download briefing (HTML)
            </button>
          </div>
          <div>
            <h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">Tables (CSV)</h3>
            <div className="flex flex-wrap gap-1.5">
              {(["settlements", "critical", "infrastructure", "priorities", "layers"] as CsvKind[]).map((k) => (
                <button key={k} onClick={() => csv(k)} className={cn(btnCls.base, btnCls.outline, btnCls.sm)}>
                  <FileSpreadsheet className="size-3" /> {CSV_LABEL[k]}
                </button>
              ))}
              {sim && (
                <button onClick={() => csv("simulation")} className={cn(btnCls.base, btnCls.outline, btnCls.sm)}>
                  <FlaskConical className="size-3" /> Simulation (hypothetical)
                </button>
              )}
            </div>
          </div>
          <div>
            <h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">Spatial data (GeoJSON, WGS84)</h3>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(GEO_LABEL) as GeoKind[]).map((k) => (
                <button key={k} onClick={() => geo(k)} className={cn(btnCls.base, btnCls.outline, btnCls.sm)} title={GEO_LABEL[k]}>
                  <Download className="size-3" /> {k}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[10.5px] leading-snug text-slate-500">All exported rows are labelled DEMO_SAMPLE_DATA and include the required attributions.</p>
        </div>
      </div>
    </div>
  );
}

function ListItem({ r, active }: { r: ReportDoc; active: boolean }) {
  const { openReport, deleteReport } = useApp();
  return (
    <li className={cn("group flex items-start gap-2 rounded-lg border p-2.5 transition", active ? "border-water bg-water/5" : "border-line bg-white hover:border-slate-500")}>
      <button onClick={() => openReport(r.id)} className="min-w-0 flex-1 text-left">
        <span className="line-clamp-2 text-[12px] font-medium leading-snug text-slate-100">{r.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
          <Badge tone={r.status === "published" ? "ok" : "neutral"}>{r.status === "published" ? "Published (demo)" : "Draft"}</Badge>
          <span>{r.lang === "en" ? "English" : "नेपाली"}</span>
          {r.includesSimulation && <Badge tone="neutral">+ hypothetical</Badge>}
          <span className="font-mono">{stamp(r.publishedAt ?? r.updatedAt).slice(0, 16)}</span>
        </span>
      </button>
      <button onClick={() => window.confirm(`Remove "${r.title}" from this browser?`) && deleteReport(r.id)} aria-label={`Delete ${r.title}`} className="rounded p-1 text-slate-500 transition hover:bg-slate-500/10 hover:text-crit">
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

export function ReportsPage() {
  const { results, working: doc, reports, dirty, storageOk, sim, generateReport, updateWorking, saveDraft, duplicateAsDraft, notify } = useApp();
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [pubOpen, setPubOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [includeSim, setIncludeSim] = useState(false);

  const published = doc?.status === "published";
  const eff = published ? "preview" : mode;
  const drafts = reports.filter((r) => r.status === "draft");
  const pubs = reports.filter((r) => r.status === "published");
  const staleDoc = !!(doc && results && doc.analysisId !== results.id);

  const doExport = (kind: CsvKind) => {
    if (!results) return;
    const f = buildCsv(kind, results, sim);
    downloadText(f.name, f.text, "text/csv");
    setCsvOpen(false);
    notify(`${CSV_LABEL[kind]} exported as CSV.`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Reports" desc="Generate, review, edit, save and publish evidence-based Rescue Briefs" />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <aside className="shrink-0 space-y-4 border-b border-line bg-white p-3 lg:w-[290px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="space-y-2 rounded-lg border border-line bg-ink-850 p-2.5">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">Generate Rescue Brief</div>
            <div className="grid grid-cols-2 gap-1.5">
              <button disabled={!results} onClick={() => generateReport("en", { includeSim })} className={cn(btnCls.base, btnCls.primary)}>
                <FilePlus2 className="size-3.5" /> English
              </button>
              <button disabled={!results} onClick={() => generateReport("ne", { includeSim })} className={cn(btnCls.base, btnCls.primary)}>
                <FilePlus2 className="size-3.5" /> नेपाली
              </button>
            </div>
            <label className={cn("flex items-start gap-2 text-[11px] leading-snug", sim ? "text-slate-300" : "text-slate-500")}>
              <input type="checkbox" checked={includeSim && !!sim} disabled={!sim} onChange={(e) => setIncludeSim(e.target.checked)} className="mt-0.5" />
              <span>
                Include the hypothetical simulation result{sim ? ` (${sim.edgeNames.join(" + ")})` : " — run one in Impact & Access first"}. It is labelled HYPOTHETICAL in the brief.
              </span>
            </label>
            {!results && <p className="text-[10.5px] text-warn">No analysis results — run the analysis first.</p>}
          </div>
          <button disabled={!results} onClick={() => setOfflineOpen(true)} className={cn(btnCls.base, btnCls.outline, "w-full")}>
            <Archive className="size-3.5" /> Prepare Offline Briefing
          </button>

          {doc && !reports.some((r) => r.id === doc.id) && (
            <div>
              <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">Unsaved working draft</div>
              <div className="rounded-lg border border-water bg-water/5 p-2.5 text-[12px] text-slate-100">
                <span className="line-clamp-2">{doc.title}</span>
                <Badge tone="warn" className="mt-1.5">
                  Not saved
                </Badge>
              </div>
            </div>
          )}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
              Drafts <span className="font-mono text-slate-600">{drafts.length}</span>
            </div>
            {drafts.length ? (
              <ul className="space-y-1.5">
                {drafts.map((r) => (
                  <ListItem key={r.id} r={r} active={doc?.id === r.id} />
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-line px-3 py-2 text-[11px] text-slate-500">No saved drafts yet.</p>
            )}
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
              Published reports <span className="font-mono text-slate-600">{pubs.length}</span>
            </div>
            {pubs.length ? (
              <ul className="space-y-1.5">
                {pubs.map((r) => (
                  <ListItem key={r.id} r={r} active={doc?.id === r.id} />
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-line px-3 py-2 text-[11px] text-slate-500">Nothing published yet. Review a draft and choose Publish.</p>
            )}
            <p className="mt-2 text-[10px] leading-snug text-slate-500">“Published” means added to this list in this browser (demo, local storage). It is not sent to any authority or shared externally.</p>
            {!storageOk && <p className="mt-1.5 text-[10.5px] text-warn">Browser storage is unavailable — reports are kept in memory for this tab only.</p>}
          </div>
        </aside>

        <section className="min-w-0 flex-1 bg-paper lg:overflow-y-auto">
          {!doc ? (
            <EmptyState icon={<FileText className="size-5" />} title="No report open" className="h-full min-h-[320px]">
              Generate an English or Nepali Rescue Brief from the current analysis, or open a saved report from the list.
            </EmptyState>
          ) : (
            <div className="mx-auto max-w-[860px] pb-10">
              <div className="sticky top-0 z-10 space-y-2 border-b border-line bg-paper/95 px-4 py-2.5 backdrop-blur">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={published ? "ok" : "neutral"}>{published ? "Published (demo, local)" : "Draft"}</Badge>
                  <Badge tone="warn">DEMO DATA</Badge>
                  {doc.includesSimulation && <Badge tone="neutral">Includes hypothetical scenario</Badge>}
                  {doc.edited && <Badge tone="info">Edited</Badge>}
                  {dirty && <Badge tone="warn">Unsaved changes</Badge>}
                  <span className="font-mono text-[10px] text-slate-500">{doc.id}</span>
                  <div className="ml-auto">
                    {!published && (
                      <Segmented
                        size="sm"
                        value={mode}
                        onChange={setMode}
                        options={[
                          { value: "edit", label: "Edit" },
                          { value: "preview", label: "Preview" },
                        ]}
                      />
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {published ? (
                    <button onClick={duplicateAsDraft} className={cn(btnCls.base, btnCls.outline)}>
                      <FilePlus2 className="size-3.5" /> Duplicate as editable draft
                    </button>
                  ) : (
                    <>
                      <button onClick={saveDraft} className={cn(btnCls.base, btnCls.outline)}>
                        <Save className="size-3.5" /> Save as draft
                      </button>
                      <button onClick={() => setPubOpen(true)} className={cn(btnCls.base, btnCls.primary)}>
                        <Send className="size-3.5" /> Publish report
                      </button>
                    </>
                  )}
                  <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
                  <button onClick={() => printHtml(reportToHtml(doc))} className={cn(btnCls.base, btnCls.outline)} title="Opens the print dialog — choose “Save as PDF”">
                    <Printer className="size-3.5" /> Print / PDF
                  </button>
                  <button onClick={() => (downloadText(`FloodLens_brief_${doc.lang}_${doc.id}.md`, reportToText(doc), "text/markdown"), notify("Brief downloaded as Markdown."))} className={cn(btnCls.base, btnCls.outline)}>
                    <Download className="size-3.5" /> Download
                  </button>
                  <button onClick={async () => notify((await copyText(reportToText(doc))) ? "Brief text copied." : "Copy failed — clipboard unavailable.", "ok")} className={cn(btnCls.base, btnCls.outline)}>
                    <Copy className="size-3.5" /> Copy
                  </button>
                  <div className="relative">
                    <button disabled={!results} onClick={() => setCsvOpen(!csvOpen)} aria-expanded={csvOpen} className={cn(btnCls.base, btnCls.outline)}>
                      <FileSpreadsheet className="size-3.5" /> Export CSV
                    </button>
                    {csvOpen && (
                      <div className="absolute left-0 top-full z-20 mt-1 w-[230px] animate-fade-in overflow-hidden rounded-md border border-line bg-white shadow-lg">
                        {(Object.keys(CSV_LABEL) as CsvKind[])
                          .filter((k) => k !== "simulation" || sim)
                          .map((k) => (
                            <button key={k} onClick={() => doExport(k)} className="block w-full px-3 py-2 text-left text-[12px] text-slate-200 hover:bg-slate-500/10">
                              {CSV_LABEL[k]}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4 px-4 pt-4">
                {staleDoc && (
                  <Notice tone="warn" icon={<TriangleAlert className="size-3.5" />}>
                    This brief was generated from a previous analysis run ({doc.analysisId}). The current results differ ({results!.id}); regenerate to reflect them.
                  </Notice>
                )}
                <article className="space-y-4 rounded-lg border border-line bg-white p-5 shadow-sm">
                  {eff === "edit" ? (
                    <input value={doc.title} onChange={(e) => updateWorking((d) => ({ ...d, title: e.target.value }))} aria-label="Report title" className="h-10 w-full rounded-md border border-line bg-white px-3 text-[16px] font-semibold text-slate-100 outline-none focus:border-water focus:ring-2 focus:ring-water/20" />
                  ) : (
                    <h2 className="text-[18px] font-semibold leading-snug text-slate-100">{doc.title}</h2>
                  )}
                  <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] font-medium text-warn">{doc.banner}</div>
                  <div className="space-y-0.5 text-[11px] text-slate-500">
                    <p>{doc.meta}</p>
                    {doc.statusLine && <p className={published ? "font-medium text-ok" : ""}>{doc.statusLine}</p>}
                  </div>

                  {doc.snapshotSvg && (
                    <figure className="overflow-hidden rounded-lg border border-line bg-white">
                      <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(doc.snapshotSvg)}`} alt="Schematic map snapshot of the analysis results" className="mx-auto max-h-[480px] w-full object-contain" />
                      <figcaption className="border-t border-line px-3 py-1.5 text-[10.5px] text-slate-500">Map snapshot rendered from the structured analysis results (schematic, no basemap). DEMO data.</figcaption>
                    </figure>
                  )}

                  {doc.sections.map((s, si) => (
                    <section key={si}>
                      {eff === "edit" ? (
                        <>
                          <input
                            value={s.heading}
                            onChange={(e) => updateWorking((d) => ({ ...d, sections: d.sections.map((x, i) => (i === si ? { ...x, heading: e.target.value } : x)) }))}
                            aria-label={`Section ${si + 1} heading`}
                            className="mb-1.5 h-7 w-full rounded border border-transparent bg-transparent px-1 text-[13px] font-semibold text-slate-100 outline-none hover:border-line focus:border-water"
                          />
                          <textarea
                            value={s.lines.join("\n")}
                            rows={rowsFor(s.lines.join("\n"))}
                            onChange={(e) => updateWorking((d) => ({ ...d, sections: d.sections.map((x, i) => (i === si ? { ...x, lines: e.target.value.split("\n") } : x)) }))}
                            aria-label={`Section ${si + 1} text`}
                            className="w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-[12px] leading-relaxed text-slate-300 outline-none focus:border-water focus:ring-2 focus:ring-water/20"
                          />
                        </>
                      ) : (
                        <>
                          <h3 className="mb-1.5 border-b border-line pb-1 text-[13px] font-semibold text-slate-100">{s.heading}</h3>
                          <div className="space-y-1 text-[12px] leading-relaxed text-slate-300">
                            {s.lines.map((l, i) => (
                              <p key={i} className={cn(/^(•|\d+\.|[०-९]+\.)/.test(l) ? "pl-3 -indent-3" : "", (l.endsWith(":") || l.endsWith("ः")) && "pt-1 font-medium text-slate-200")}>
                                {l}
                              </p>
                            ))}
                          </div>
                        </>
                      )}
                    </section>
                  ))}

                  <div className="space-y-1 border-t border-line pt-3 text-[10.5px] leading-snug text-slate-500">
                    {doc.attributions.map((a) => (
                      <p key={a}>{a}</p>
                    ))}
                  </div>
                </article>
              </div>
            </div>
          )}
        </section>
      </div>
      {pubOpen && doc && <PublishDialog doc={doc} onClose={() => setPubOpen(false)} />}
      {offlineOpen && <OfflineDialog doc={doc} onClose={() => setOfflineOpen(false)} />}
    </div>
  );
}
