import { useRef, useState, type ReactNode } from "react";
import { ExternalLink, FileUp, FlaskConical, Info, Loader2, Lock, Play, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { ImageOverlay, MapContainer, Polygon, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { AOI_BOUNDS_LL, evaluate, makeSyntheticReference, parseGeoJson, referenceLatLngs } from "../analysis/validation";
import { AOI_BOUNDS, BASEMAPS } from "../components/map/DualMap";
import { Badge, EmptyState, SectionTitle } from "../components/ui";
import { fmtDate } from "../lib/format";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";

const pct = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)}%`);

function Metric({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-ink-850 p-2.5" title={hint}>
      <div className="text-[10.5px] text-slate-500">{label}</div>
      <div className={cn("font-mono text-[18px] font-semibold leading-tight", tone ?? "text-slate-100")}>{value}</div>
    </div>
  );
}

export function ValidationPage() {
  const { results, val, setVal, notify } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [layers, setLayers] = useState({ system: true, reference: true, agreement: true });
  const bm = BASEMAPS.satellite;
  const ref = val.reference;
  const res = val.result;

  const onFile = async (f: File) => {
    if (f.size > 25 * 1024 * 1024) {
      setVal((v) => ({ ...v, error: "File is larger than 25 MB." }));
      return;
    }
    try {
      const reference = parseGeoJson(await f.text(), f.name);
      setVal((v) => ({ ...v, reference, result: null, error: null }));
      notify(`Reference loaded: ${reference.featureCount} feature(s), ${reference.areaKm2.toFixed(2)} km².`);
    } catch (e) {
      setVal((v) => ({ ...v, error: e instanceof Error ? e.message : "Could not read the file." }));
    }
  };

  const run = () => {
    if (!results || !ref) return;
    setBusy(true);
    window.setTimeout(() => {
      try {
        const result = evaluate(results, ref, val.includeUncertain);
        setVal((v) => ({ ...v, result, error: null }));
      } catch (e) {
        setVal((v) => ({ ...v, error: e instanceof Error ? e.message : "Evaluation failed." }));
      }
      setBusy(false);
    }, 60);
  };

  const sysPolys = results ? results.flood.filter((f) => f.kind === "water" || val.includeUncertain) : [];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <aside className="shrink-0 space-y-4 border-b border-line bg-ink-900 p-4 lg:w-[430px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="mr-auto text-[14px] font-semibold text-white">Case-study validation</h1>
            <Badge tone="warn">Post-analysis only</Badge>
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-slate-400">
            Trishuli Valley flood, {fmtDate("2026-08-26")} — compare the completed system result with the official Copernicus Emergency Management Service reference for activation <span className="font-medium text-slate-200">EMSR927</span>.
          </p>
        </div>

        <section className="rounded-lg border border-line bg-ink-850 p-3">
          <h2 className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-200">
            <Lock className="size-3.5 text-sky-300" /> Isolation of reference data
          </h2>
          <ul className="space-y-1 text-[11px] leading-snug text-slate-400">
            <li>
              <span className="text-slate-300">Analysis inputs:</span> Sentinel-1, Sentinel-2, Copernicus DEM and the pre-event OpenStreetMap snapshot only.
            </li>
            <li>
              <span className="text-slate-300">EMSR927:</span> loaded on this page after the analysis is complete, solely to score it. It is never an input to detection, training or any derived result.
            </li>
            <li>
              <span className="text-slate-300">Post-event OSM edits:</span> never used to reconstruct damage.
            </li>
            <li>The evaluation code reads the finished results and writes nothing back to them.</li>
          </ul>
        </section>

        <section>
          <SectionTitle>1 · Completed analysis</SectionTitle>
          {results ? (
            <div className="flex items-center gap-2 rounded-lg border border-line bg-ink-850 p-2.5 text-[11.5px]">
              <Badge tone="warn">Sample result</Badge>
              <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-slate-500">{results.id}</span>
              <span className="font-mono text-water">{results.metrics.waterKm2.toFixed(2)} km²</span>
            </div>
          ) : (
            <EmptyState icon={<TriangleAlert className="size-5 text-warn" />} title="No completed analysis" className="rounded-lg border border-line py-6">
              Validation compares a finished analysis with the reference. Run the analysis first.
            </EmptyState>
          )}
        </section>

        <section>
          <SectionTitle>2 · EMSR927 reference extent</SectionTitle>
          <input
            ref={fileRef}
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            className="hidden"
            aria-label="EMSR927 reference GeoJSON"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onFile(f);
            }}
          />
          {ref ? (
            <div className={cn("rounded-lg border p-3", ref.source === "synthetic" ? "border-warn/50 bg-warn/5" : "border-ok/30 bg-ok/5")}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-slate-100">{ref.name}</div>
                  <div className="mt-0.5 text-[10.5px] text-slate-500">
                    {ref.featureCount} feature(s) · {ref.areaKm2.toFixed(2)} km² · loaded {ref.loadedAt.slice(11, 16)} UTC
                  </div>
                </div>
                <button onClick={() => setVal((v) => ({ ...v, reference: null, result: null, error: null }))} aria-label="Remove reference" className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-red-400">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              {ref.source === "synthetic" && <p className="mt-2 text-[11px] font-medium text-warn">SYNTHETIC TEST REFERENCE — derived by perturbing the sample result. It exercises the evaluation pipeline only and says nothing about real accuracy.</p>}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-line p-4 text-center">
              <div className="mx-auto flex size-9 items-center justify-center rounded-full border border-line text-slate-500">
                <Info className="size-4" />
              </div>
              <p className="mt-2 text-[12.5px] font-medium text-slate-200">EMSR927 reference data unavailable</p>
              <p className="mx-auto mt-1 max-w-[320px] text-[11px] leading-snug text-slate-500">
                FloodLens does not bundle EMSR927 maps and will not invent a comparison. Download the observed flood extent from the Copernicus EMS rapid-mapping portal, export it as GeoJSON in WGS84 (EPSG:4326) and load it below.
              </p>
              <a href="https://emergency.copernicus.eu/mapping/" target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-water hover:underline">
                Copernicus EMS mapping portal <ExternalLink className="size-3" />
              </a>
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button disabled={!results} onClick={() => fileRef.current?.click()} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-line text-[11.5px] font-medium text-slate-200 transition hover:border-slate-500 disabled:opacity-40">
              <FileUp className="size-3.5" /> Load GeoJSON
            </button>
            <button
              disabled={!results}
              onClick={() => {
                if (!results) return;
                setVal((v) => ({ ...v, reference: makeSyntheticReference(results), result: null, error: null }));
                notify("Synthetic pipeline-test reference loaded — not EMSR927.", "warn");
              }}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-line text-[11.5px] font-medium text-slate-200 transition hover:border-slate-500 disabled:opacity-40"
              title="Loads a clearly labelled synthetic layer so the metrics pipeline can be demonstrated"
            >
              <FlaskConical className="size-3.5" /> Pipeline test
            </button>
          </div>
          {val.error && (
            <p className="mt-2 flex gap-1.5 rounded-md border border-crit/40 bg-crit/10 p-2 text-[11.5px] text-red-300">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {val.error}
            </p>
          )}
        </section>

        <section>
          <SectionTitle>3 · Evaluate</SectionTitle>
          <label className="mb-2 flex items-center gap-2 text-[11.5px] text-slate-300">
            <input type="checkbox" checked={val.includeUncertain} onChange={(e) => setVal((v) => ({ ...v, includeUncertain: e.target.checked, result: null }))} className="accent-cyan-400" />
            Count “uncertain” water as detected
          </label>
          <button disabled={!results || !ref || busy} onClick={run} className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-water text-[12.5px] font-semibold text-ink-950 transition hover:bg-cyan-300 disabled:opacity-40">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4 fill-current" />} Compare with reference
          </button>
          {!ref && results && <p className="mt-1.5 text-[10.5px] text-slate-500">Load a reference extent to enable the comparison.</p>}
        </section>

        {res && (
          <section className="space-y-3">
            <SectionTitle right={<Badge tone={res.source === "synthetic" ? "warn" : "ok"}>{res.source === "synthetic" ? "Synthetic test" : "EMSR927 upload"}</Badge>}>Results</SectionTitle>
            {res.source === "synthetic" && <p className="rounded-md border border-warn/40 bg-warn/10 p-2 text-[11px] font-medium text-warn">These numbers demonstrate the evaluation pipeline only. They are not an accuracy assessment of FloodLens.</p>}
            <div className="grid grid-cols-2 gap-2">
              <Metric label="F1 score" value={pct(res.f1)} hint="2·precision·recall / (precision+recall)" tone="text-water" />
              <Metric label="IoU" value={pct(res.iou)} hint="Intersection over union of flood extents" tone="text-water" />
              <Metric label="Precision" value={pct(res.precision)} hint="Share of detected water that is in the reference" />
              <Metric label="Recall" value={pct(res.recall)} hint="Share of reference water that was detected" />
              <Metric label="System water" value={`${res.systemKm2} km²`} />
              <Metric label="Reference water" value={`${res.referenceKm2} km²`} />
              <Metric label="Overlap (agree)" value={`${res.tpKm2} km²`} tone="text-ok" />
              <Metric label="Area bias" value={res.biasPct === null ? "n/a" : `${res.biasPct >= 0 ? "+" : ""}${res.biasPct}%`} />
              <Metric label="Commission" value={`${res.fpKm2} km²`} tone="text-warn" hint="Detected but not in the reference" />
              <Metric label="Omission" value={`${res.fnKm2} km²`} tone="text-red-400" hint="In the reference but not detected" />
            </div>
            <div>
              <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">Important differences</div>
              <ul className="space-y-1.5">
                {res.differences.map((d, i) => (
                  <li key={i} className="flex gap-1.5 text-[11.5px] leading-snug text-slate-300">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-slate-600" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-[10px] leading-snug text-slate-600">
              Evaluated on a {360}×{300} raster over the analysis area. Evaluated {res.evaluatedAt.slice(0, 16).replace("T", " ")} UTC.
            </p>
          </section>
        )}
        <div className="flex items-start gap-1.5 text-[10.5px] text-slate-600">
          <ShieldCheck className="mt-0.5 size-3 shrink-0" /> Contains modified Copernicus Sentinel data 2026. EMSR927 © Copernicus EMS — used here only for validation.
        </div>
      </aside>

      <section className="relative h-[62vh] min-h-[340px] shrink-0 lg:h-auto lg:min-h-0 lg:flex-1">
        <MapContainer bounds={AOI_BOUNDS} boundsOptions={{ padding: [20, 20] }} attributionControl={false} zoomSnap={0.25} className="absolute inset-0 h-full w-full">
          <TileLayer url={bm.url} maxNativeZoom={bm.maxNativeZoom} maxZoom={19} />
          {res && layers.agreement && <ImageOverlay key={res.evaluatedAt} url={res.imageUrl} bounds={AOI_BOUNDS_LL} opacity={0.85} />}
          {layers.system && sysPolys.map((f) => <Polygon key={f.id} positions={f.hole ? [f.ring, f.hole] : f.ring} pathOptions={{ color: "#0891B2", weight: 1.5, fillColor: "#0891B2", fillOpacity: res && layers.agreement ? 0 : 0.35 }} />)}
          {layers.reference && ref && referenceLatLngs(ref).map((rings, i) => <Polygon key={i} positions={rings} pathOptions={{ color: "#0F172A", weight: 2, dashArray: "6 4", fillColor: "#0F172A", fillOpacity: res && layers.agreement ? 0 : 0.15 }} />)}
        </MapContainer>

        <div className="absolute left-3 top-3 z-[900] w-[210px] space-y-1 rounded-lg border border-line bg-ink-900/92 p-2.5 shadow-xl shadow-black/40 backdrop-blur">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-slate-300">Comparison layers</div>
          {(
            [
              ["system", "System: detected water", "#0891B2"],
              ["reference", "Reference (EMSR927)", "#0F172A"],
              ["agreement", "Agreement raster", "#16A34A"],
            ] as const
          ).map(([k, l, c]) => (
            <label key={k} className={cn("flex items-center gap-2 text-[11.5px]", k === "agreement" && !res ? "opacity-40" : "text-slate-300")}>
              <input type="checkbox" checked={layers[k]} disabled={k === "agreement" && !res} onChange={(e) => setLayers((s) => ({ ...s, [k]: e.target.checked }))} className="accent-cyan-400" />
              <span className="size-2.5 rounded-sm border" style={{ background: c + "66", borderColor: c }} />
              {l}
            </label>
          ))}
          {res && (
            <div className="space-y-0.5 border-t border-line pt-1.5 text-[10.5px] text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-ok/80" /> Agree
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-warn/80" /> Commission (system only)
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-crit/80" /> Omission (reference only)
              </div>
            </div>
          )}
        </div>
        {!ref && (
          <div className="pointer-events-none absolute bottom-6 left-1/2 z-[900] -translate-x-1/2 rounded-full border border-line bg-ink-950/90 px-3 py-1 text-[11px] text-slate-400">No reference loaded — only the system result is shown</div>
        )}
        <div className="pointer-events-none absolute bottom-0 right-0 z-[900] max-w-[70%] truncate bg-ink-950/70 px-2 py-0.5 text-[9.5px] text-slate-400">{bm.attribution} · Leaflet</div>
      </section>
    </div>
  );
}
