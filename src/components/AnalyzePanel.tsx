import { useRef, useState, type ReactNode } from "react";
import { AlertCircle, ArrowRight, CalendarRange, CheckCircle2, CircleAlert, FileText, Images, Info, Layers, Loader2, MapPin, Play, Radar, Satellite, Search, Square } from "lucide-react";
import { inPeriod, observationWindow, sameGeometry, suggestedPeriod } from "../analysis/acquisitions";
import { SCENARIO } from "../data/scenario";
import { fmtDate, fmtPeriod, fmtShort } from "../lib/format";
import { coordHit, localSearch, parseCoords, searchOnline, type SearchHit } from "../lib/search";
import { useApp, type UploadedImage } from "../state/store";
import type { Acquisition, PickKey, SensorMode, Severity, ValidationItem } from "../types";
import { cn } from "../utils/cn";
import { AcquisitionTimeline } from "./AcquisitionTimeline";
import { PipelineProgress } from "./PipelineProgress";
import { UploadCompareDialog, UploadSlot } from "./UploadCompare";
import { Badge, Field, Segmented, btnCls, inputCls } from "./ui";

const SENSORS: { value: SensorMode; title: string; sub: string; icon: ReactNode }[] = [
  { value: "S1S2", title: "Sentinel-1 + Sentinel-2", sub: "Radar + optical fusion (recommended)", icon: <Layers className="size-4" /> },
  { value: "S1", title: "Sentinel-1 SAR", sub: "Cloud-independent water detection", icon: <Radar className="size-4" /> },
  { value: "S2", title: "Sentinel-2 optical", sub: "Water index + debris change; cloud-limited", icon: <Satellite className="size-4" /> },
];

const sevIcon: Record<Severity, ReactNode> = {
  ok: <CheckCircle2 className="size-3.5 text-ok" />,
  info: <Info className="size-3.5 text-water" />,
  warn: <CircleAlert className="size-3.5 text-warn" />,
  error: <AlertCircle className="size-3.5 text-crit" />,
};

const STEP2_IDS = ["dates", "period", "period-event", "period-ok", "event"];
const STEP3_IDS = ["found", "no-imagery"];

function Step({ n, title, children, right }: { n: number; title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full border border-water/50 bg-water/10 font-mono text-[10px] font-semibold text-water">{n}</span>
        <h3 className="flex-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function ItemList({ list }: { list: ValidationItem[] }) {
  if (!list.length) return null;
  return (
    <ul className="mt-2 space-y-1.5">
      {list.map((i) => (
        <li key={i.id} className={cn("flex gap-2 rounded-md border px-2 py-1.5", i.severity === "error" ? "border-crit/40 bg-crit/5" : i.severity === "warn" ? "border-warn/30 bg-warn/5" : "border-line bg-ink-850")}>
          <span className="mt-0.5">{sevIcon[i.severity]}</span>
          <span className="min-w-0">
            <span className="block text-[11.5px] font-medium leading-4 text-slate-200">{i.title}</span>
            <span className="block text-[10.5px] leading-snug text-slate-500">{i.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function SceneRow({ label, a, wanted }: { label: string; a?: Acquisition; wanted: boolean }) {
  if (!wanted) return null;
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="w-[58px] shrink-0 pt-px font-mono text-[10px] text-slate-500">{label}</span>
      {a ? (
        <span className="min-w-0 flex-1 text-[11px] leading-snug text-slate-300">
          {fmtDate(a.date)}
          <span className="block font-mono text-[10px] text-slate-500">
            {a.product}
            {a.orbit ? ` · ${a.orbit} orbit ${a.relOrbit}` : ""}
          </span>
        </span>
      ) : (
        <Badge tone="crit">Missing</Badge>
      )}
      {a?.cloudPct !== undefined && <Badge tone={a.cloudPct >= 25 ? "warn" : "ok"}>{a.cloudPct}% cloud</Badge>}
    </div>
  );
}

function PickRow({ label, value, onChange, options, auto, disabled }: { label: string; value: string; onChange: (id: string) => void; options: { id: string; label: string }[]; auto: string; disabled: boolean }) {
  return (
    <label className="grid grid-cols-[74px_1fr] items-center gap-2 text-[11px] text-slate-400">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled || !options.length} className={cn(inputCls, "h-7 px-1.5 text-[11px]")}>
        <option value="">{options.length ? `Auto · ${auto}` : "None available"}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AnalyzePanel() {
  const { params, setParams, validation, running, progress, run, cancel, flyTo, results, uploads, setUpload, view, onMode, onSplit, go, generateReport } = useApp();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [latStr, setLatStr] = useState(String(params.lat));
  const [lonStr, setLonStr] = useState(String(params.lon));
  const [compareOpen, setCompareOpen] = useState(false);
  const lastCoords = useRef({ lat: params.lat, lon: params.lon });
  if (lastCoords.current.lat !== params.lat || lastCoords.current.lon !== params.lon) {
    lastCoords.current = { lat: params.lat, lon: params.lon };
    if (Number(latStr) !== params.lat) setLatStr(String(params.lat));
    if (Number(lonStr) !== params.lon) setLonStr(String(params.lon));
  }

  const choose = (h: SearchHit) => {
    setParams({ ...params, locationName: h.kind === "area" || h.kind === "online" || h.kind === "coords" ? h.label : `${h.label}, Trishuli Valley`, lat: h.lat, lon: h.lon });
    flyTo(h.lat, h.lon, Math.max(h.zoom, 13));
    setHits(null);
    setQuery("");
    setSearchMsg(null);
  };

  const search = async (online = false) => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchMsg("Type at least two characters.");
      return;
    }
    setSearchMsg(null);
    const c = parseCoords(q);
    const local = [...(c ? [coordHit(c)] : []), ...localSearch(q, !!results)];
    if (local.length && !online) {
      setHits(local);
      return;
    }
    setSearching(true);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    try {
      const found = await searchOnline(q, ctl.signal);
      setHits([...local, ...found]);
      if (!found.length && !local.length) setSearchMsg(`No places found for “${q}”.`);
    } catch {
      setHits(local.length ? local : null);
      setSearchMsg("Online place search is unavailable (offline or blocked). Enter latitude/longitude or pick a settlement.");
    } finally {
      clearTimeout(timer);
      setSearching(false);
    }
  };

  const updateCoord = (kind: "lat" | "lon", v: string) => {
    if (kind === "lat") setLatStr(v);
    else setLonStr(v);
    const n = Number(v);
    if (v.trim() !== "" && Number.isFinite(n)) setParams({ ...params, [kind]: n, locationName: "Custom location" });
  };

  const changeUpload = (slot: "before" | "after", img: UploadedImage | null) => {
    const old = uploads[slot];
    if (old && old.url !== img?.url) URL.revokeObjectURL(old.url);
    setUpload(slot, img);
  };

  const setPick = (k: PickKey, id: string) => {
    const picks = { ...params.picks };
    if (id) picks[k] = id;
    else delete picks[k];
    setParams({ ...params, picks });
  };

  const { matched, items, found } = validation;
  const errors = items.filter((i) => i.severity === "error");
  const wantS1 = params.sensor !== "S2";
  const wantS2 = params.sensor !== "S1";
  const m = results?.metrics;
  const sg = suggestedPeriod(params.eventDate);
  const periodErr = items.some((i) => ["dates", "period", "period-event"].includes(i.id) && i.severity === "error");
  const step4 = [...errors, ...items.filter((i) => i.severity !== "error")].filter((i) => !STEP2_IDS.includes(i.id) && !STEP3_IDS.includes(i.id));
  const windowAcqs = observationWindow(params, matched);

  const optionsFor = (sensor: "S1" | "S2", pre: boolean, counterpart?: Acquisition) =>
    windowAcqs
      .filter((a) => a.sensor === sensor && (pre ? a.date < params.eventDate : a.date >= params.eventDate))
      .map((a) => ({
        id: a.id,
        label: `${fmtShort(a.date)}${a.orbit ? ` · ${a.orbit} ${a.relOrbit}` : ""}${a.cloudPct !== undefined ? ` · ${a.cloudPct}% cloud` : ""}${!inPeriod(a, params) ? " · outside period" : ""}${counterpart && sensor === "S1" && !sameGeometry(a, counterpart) ? " · orbit differs" : ""}`,
      }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3.5 py-3.5">
        {running && (
          <div className="animate-fade-in rounded-lg border border-water/25 bg-ink-850 p-3">
            <PipelineProgress progress={progress} />
          </div>
        )}

        <Step n={1} title="Select location">
          <div className="relative">
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-slate-500" />
                <input className={cn(inputCls, "pl-8")} placeholder="Settlement, town or coordinates" value={query} disabled={running} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} aria-label="Search analysis location" />
              </div>
              <button onClick={() => search()} disabled={running || searching} className="inline-flex h-8 w-16 items-center justify-center rounded-md border border-line bg-white text-[12px] font-medium text-slate-200 transition hover:border-slate-500 disabled:opacity-50">
                {searching ? <Loader2 className="size-3.5 animate-spin" /> : "Search"}
              </button>
            </div>
            {hits && hits.length > 0 && (
              <ul className="absolute left-0 right-0 top-9 z-20 max-h-56 animate-fade-in overflow-y-auto rounded-md border border-line bg-white shadow-lg">
                {hits.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => choose(p)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-slate-500/10">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] text-slate-200">{p.label}</span>
                        <span className={cn("block truncate text-[10px]", p.outside ? "text-warn" : "text-slate-500")}>{p.sub}</span>
                      </span>
                    </button>
                  </li>
                ))}
                <li className="border-t border-line">
                  <button onClick={() => search(true)} className="w-full px-2.5 py-1.5 text-left text-[11px] text-slate-400 hover:bg-slate-500/10 hover:text-slate-200">
                    Also search OpenStreetMap online…
                  </button>
                </li>
              </ul>
            )}
          </div>
          {searchMsg && <p className="mt-1.5 text-[11px] leading-snug text-warn">{searchMsg}</p>}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="Latitude">
              <input className={cn(inputCls, "font-mono")} inputMode="decimal" value={latStr} disabled={running} onChange={(e) => updateCoord("lat", e.target.value)} />
            </Field>
            <Field label="Longitude">
              <input className={cn(inputCls, "font-mono")} inputMode="decimal" value={lonStr} disabled={running} onChange={(e) => updateCoord("lon", e.target.value)} />
            </Field>
          </div>
          <button onClick={() => flyTo(params.lat, params.lon, 13)} className="mt-2 text-[11px] text-slate-400 transition hover:text-water">
            Centre map on these coordinates
          </button>
        </Step>

        <Step n={2} title="Event date & analysis period">
          <div className="mb-2.5 flex items-start gap-2 rounded-md border border-line bg-ink-850 p-2 text-[11.5px]">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-water" />
            <span className="min-w-0">
              <span className="block text-[9.5px] font-semibold uppercase tracking-wider text-slate-500">Selected location</span>
              <span className="font-medium text-slate-100">{params.locationName}</span>
              <span className="block font-mono text-[10px] text-slate-500">
                {Number.isFinite(params.lat) ? params.lat.toFixed(4) : "—"}°N, {Number.isFinite(params.lon) ? params.lon.toFixed(4) : "—"}°E
              </span>
            </span>
          </div>
          <Field label="Flood event date">
            <input type="date" className={inputCls} value={params.eventDate} disabled={running} onChange={(e) => setParams({ ...params, eventDate: e.target.value })} />
          </Field>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="From date">
              <input type="date" aria-invalid={periodErr} className={cn(inputCls, periodErr && "border-crit focus:border-crit focus:ring-crit/20")} value={params.fromDate} max={params.toDate || undefined} disabled={running} onChange={(e) => setParams({ ...params, fromDate: e.target.value })} />
            </Field>
            <Field label="To date">
              <input type="date" aria-invalid={periodErr} className={cn(inputCls, periodErr && "border-crit focus:border-crit focus:ring-crit/20")} value={params.toDate} min={params.fromDate || undefined} disabled={running} onChange={(e) => setParams({ ...params, toDate: e.target.value })} />
            </Field>
          </div>
          <button onClick={() => setParams({ ...params, fromDate: sg.from, toDate: sg.to })} disabled={running} className={cn(btnCls.base, btnCls.outline, btnCls.sm, "mt-2 w-full")}>
            <CalendarRange className="size-3" /> Suggest a period around the event ({fmtShort(sg.from)} – {fmtShort(sg.to)})
          </button>
          <p className="mt-1.5 text-[10.5px] leading-snug text-slate-500">The period is the time window you want to investigate. Satellites image an area only at discrete dates, so the images available inside it are listed below — dates are never invented.</p>
          {params.eventDate !== SCENARIO.eventDate && <p className="mt-1 text-[10.5px] text-warn">The sample dataset represents the {fmtDate(SCENARIO.eventDate)} event.</p>}
          <ItemList list={items.filter((i) => STEP2_IDS.includes(i.id))} />
        </Step>

        <Step n={3} title="Available satellite observations" right={<span className="font-mono text-[10px] text-slate-500">{found.s1} S1 · {found.s2} S2 in period</span>}>
          <div className="space-y-1.5" role="radiogroup" aria-label="Satellite selection">
            {SENSORS.map((s) => {
              const on = params.sensor === s.value;
              return (
                <button
                  key={s.value}
                  role="radio"
                  aria-checked={on}
                  disabled={running}
                  onClick={() => setParams({ ...params, sensor: s.value })}
                  className={cn("flex w-full items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-left transition disabled:opacity-60", on ? "border-water bg-water/5" : "border-line bg-white hover:border-slate-500")}
                >
                  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded border", on ? "border-water/40 text-water" : "border-line text-slate-500")}>{s.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[12px] font-medium", on ? "text-slate-100" : "text-slate-300")}>{s.title}</span>
                    <span className="block truncate text-[10.5px] text-slate-500">{s.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 rounded-md border border-line bg-white py-2">
            <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Acquisition timeline — click a marker to inspect it</div>
            <AcquisitionTimeline compact />
          </div>
          <ItemList list={items.filter((i) => STEP3_IDS.includes(i.id))} />

          <div className="mt-2.5 space-y-2">
            {(["S1", "S2"] as const)
              .filter((s) => (s === "S1" ? wantS1 : wantS2))
              .map((s) => {
                const pre = s === "S1" ? matched.s1Pre : matched.s2Pre;
                const post = s === "S1" ? matched.s1Post : matched.s2Post;
                const preKey: PickKey = s === "S1" ? "s1Pre" : "s2Pre";
                const postKey: PickKey = s === "S1" ? "s1Post" : "s2Post";
                return (
                  <div key={s} className="space-y-1.5 rounded-md border border-line bg-white p-2">
                    <div className="text-[11px] font-medium text-slate-200">{s === "S1" ? "Sentinel-1 radar" : "Sentinel-2 optical"} images</div>
                    <PickRow label="Before event" value={params.picks[preKey] ?? ""} onChange={(id) => setPick(preKey, id)} options={optionsFor(s, true, post)} auto={pre ? fmtShort(pre.date) : "none"} disabled={running} />
                    <PickRow label="After event" value={params.picks[postKey] ?? ""} onChange={(id) => setPick(postKey, id)} options={optionsFor(s, false, pre)} auto={post ? fmtShort(post.date) : "none"} disabled={running} />
                  </div>
                );
              })}
          </div>

          <div className="mt-3 rounded-md border border-line bg-ink-850 p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
              <Images className="size-3.5 text-slate-500" /> Your own images <Badge>Preview only</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <UploadSlot label="Before" image={uploads.before} onChange={(i) => changeUpload("before", i)} />
              <UploadSlot label="After" image={uploads.after} onChange={(i) => changeUpload("after", i)} />
            </div>
            <p className="mt-2 text-[10.5px] leading-snug text-slate-500">Ordinary JPG/PNG files have no georeferencing or sensor metadata, so they are displayed but never analysed. Processing requires Sentinel products via a backend that is not connected.</p>
            <button disabled={!uploads.before && !uploads.after} onClick={() => setCompareOpen(true)} className={cn(btnCls.base, btnCls.outline, btnCls.sm, "mt-2 w-full")}>
              Preview / compare uploads
            </button>
          </div>
        </Step>

        <Step n={4} title="Matched observations & data quality" right={<span className="text-[10px] text-slate-500">{items.length} checks</span>}>
          <div className="divide-y divide-line rounded-md border border-line bg-white px-2.5 py-1">
            <SceneRow label="S1 before" a={matched.s1Pre} wanted={wantS1} />
            <SceneRow label="S1 after" a={matched.s1Post} wanted={wantS1} />
            <SceneRow label="S2 before" a={matched.s2Pre} wanted={wantS2} />
            <SceneRow label="S2 after" a={matched.s2Post} wanted={wantS2} />
          </div>
          <ItemList list={step4} />
        </Step>

        <Step n={5} title="Compare before / after">
          <Segmented
            className="w-full [&>button]:flex-1"
            value={view.mode}
            onChange={onMode}
            options={[
              { value: "before", label: "Before" },
              { value: "swipe", label: "Swipe" },
              { value: "after", label: "After" },
            ]}
          />
          <input type="range" min={3} max={97} value={view.split} disabled={view.mode !== "swipe"} onChange={(e) => onSplit(Number(e.target.value))} className="mt-2 h-1 w-full cursor-pointer disabled:opacity-30" aria-label="Swipe position" />
          <p className="mt-1.5 text-[10.5px] leading-snug text-slate-500">Drag the handle on the map, use this slider, or click a used marker on the timeline. The basemap is reference imagery; detection layers appear on the “after” side.</p>
        </Step>

        <Step n={6} title="Change-analysis results">
          {results && m && !running ? (
            <div className="space-y-2 rounded-lg border border-line bg-ink-850 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warn">DEMO results</Badge>
                <span className="text-[10.5px] text-slate-500">{fmtPeriod(results.params.fromDate, results.params.toDate)}</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
                <dt className="text-slate-500">Detected water</dt>
                <dd className="text-right font-mono text-flood">{m.waterKm2.toFixed(2)} km²</dd>
                <dt className="text-slate-500">Added vs pre-event</dt>
                <dd className="text-right font-mono text-slate-200">+{results.changes.addedWaterKm2.toFixed(2)} km²</dd>
                <dt className="text-slate-500">Buildings exposed</dt>
                <dd className="text-right font-mono text-slate-200">
                  {m.buildingsLikely} + {m.buildingsPossible}?
                </dd>
                <dt className="text-slate-500">Bridges flagged</dt>
                <dd className="text-right font-mono text-slate-200">
                  {m.bridgesBlocked + m.bridgesSuspected} / {m.bridgesTotal}
                </dd>
                <dt className="text-slate-500">Modeled disconnected</dt>
                <dd className="text-right font-mono text-crit">{m.settlementsDisconnected}</dd>
              </dl>
              <div className="flex gap-1.5">
                <button onClick={() => go("impact", "infra")} className={cn(btnCls.base, btnCls.outline, btnCls.sm, "flex-1")}>
                  Impact <ArrowRight className="size-3" />
                </button>
                <button onClick={() => go("impact", "settlements")} className={cn(btnCls.base, btnCls.outline, btnCls.sm, "flex-1")}>
                  Access <ArrowRight className="size-3" />
                </button>
              </div>
              <button onClick={() => generateReport("en")} className={cn(btnCls.base, btnCls.soft, "w-full")}>
                <FileText className="size-3.5" /> Generate Rescue Brief
              </button>
            </div>
          ) : (
            <p className="rounded-md border border-line bg-ink-850 px-3 py-2 text-[11.5px] text-slate-500">{running ? "Processing…" : "No results yet. Choose the period and observations, then run the change analysis."}</p>
          )}
        </Step>
      </div>

      <div className="shrink-0 border-t border-line bg-white p-3">
        {running ? (
          <button onClick={cancel} className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-line bg-white text-[13px] font-semibold text-slate-200 transition hover:border-crit/50 hover:text-crit">
            <Square className="size-3.5" /> Cancel analysis
          </button>
        ) : (
          <button onClick={run} className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-water text-[13px] font-semibold text-on-navy transition hover:bg-cyan-300 active:scale-[0.99]">
            <Play className="size-4 fill-current" /> Run Change Analysis
          </button>
        )}
        <p className="mt-1.5 text-center text-[10.5px] leading-snug text-slate-500">
          {errors.length ? `${errors.length} blocking issue${errors.length > 1 ? "s" : ""} — fix before running` : `Period ${fmtPeriod(params.fromDate, params.toDate)} · runs on labelled demo data`}
        </p>
      </div>
      {compareOpen && <UploadCompareDialog before={uploads.before} after={uploads.after} onClose={() => setCompareOpen(false)} />}
    </div>
  );
}
