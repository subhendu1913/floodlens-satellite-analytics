import { Info, Radar, Satellite, TriangleAlert } from "lucide-react";
import { Badge, EmptyState, Notice } from "../components/ui";
import { CATALOG } from "../data/scenario";
import { fmtDate, type Tone } from "../lib/format";
import { useApp } from "../state/store";

export function SatelliteDataPage() {
  const { results, validation } = useApp();
  if (!results) {
    return (
      <EmptyState icon={<Satellite className="size-5" />} title="No analysis loaded" className="h-full">
        Run the flood analysis to see which Sentinel observations were considered and used.
      </EmptyState>
    );
  }
  const a = results.acquisitions;
  const s1On = results.effectiveSensor !== "S2";
  const s2On = results.effectiveSensor !== "S1";

  const status = (id: string, sensor: "S1" | "S2"): { label: string; tone: Tone } => {
    if ((sensor === "S1" && !s1On) || (sensor === "S2" && !s2On)) return { label: "Not used (sensor not selected)", tone: "neutral" };
    if (a.s1Pre?.id === id || a.s2Pre?.id === id) return { label: "Used — before event", tone: "ok" };
    if (a.s1Post?.id === id || a.s2Post?.id === id) return { label: "Used — after event", tone: "ok" };
    if (a.s1Rejected?.id === id) return { label: "Rejected — orbit geometry differs from the post-event scene", tone: "warn" };
    return { label: "Not selected for this run", tone: "neutral" };
  };
  const warns = validation.items.filter((i) => i.severity === "warn" || i.severity === "error");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1000px] space-y-5 p-5">
        <Notice tone="warn" icon={<TriangleAlert className="size-3.5" />} title="Sample acquisition catalogue">
          The list below is a hand-authored catalogue for the demonstration scenario. It was <span className="font-medium text-slate-100">not queried</span> from the Copernicus Data Space, and no Sentinel product was downloaded or processed. A live build would replace it behind the same service interface.
        </Notice>

        <section>
          <h2 className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">Observations considered for {results.params.locationName}</h2>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[640px] border-collapse text-left text-[11.5px]">
              <thead className="bg-ink-850 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Satellite</th>
                  <th className="px-2 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Product</th>
                  <th className="px-2 py-2 font-medium">Orbit · relative</th>
                  <th className="px-2 py-2 font-medium">Cloud</th>
                  <th className="px-2 py-2 font-medium">Status in this analysis</th>
                </tr>
              </thead>
              <tbody>
                {CATALOG.map((c) => {
                  const s = status(c.id, c.sensor);
                  return (
                    <tr key={c.id} className="border-t border-line">
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-100">
                          {c.sensor === "S1" ? <Radar className="size-3.5 text-slate-500" /> : <Satellite className="size-3.5 text-slate-500" />}
                          Sentinel-{c.sensor === "S1" ? "1" : "2"}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-slate-300">{fmtDate(c.date)}</td>
                      <td className="px-2 py-2 font-mono text-[10.5px] text-slate-500">{c.product}</td>
                      <td className="px-2 py-2 text-slate-400">{c.orbit ? `${c.orbit} · ${c.relOrbit}` : "—"}</td>
                      <td className="px-2 py-2">{c.cloudPct === undefined ? <span className="text-slate-500">n/a (radar)</span> : <Badge tone={c.cloudPct >= 25 ? "warn" : "ok"}>{c.cloudPct}%</Badge>}</td>
                      <td className="px-2 py-2">
                        <Badge tone={s.tone} className="whitespace-normal">
                          {s.label}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[10.5px] leading-snug text-slate-500">Sentinel-1 change detection only compares scenes with the same orbit direction and relative orbit (matching viewing geometry). Scenes from a different track are never compared pixel by pixel.</p>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-lg border border-line bg-white p-3.5">
            <h2 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">Other inputs</h2>
            <ul className="space-y-1.5 text-[11.5px] leading-snug text-slate-300">
              <li>
                <span className="font-medium text-slate-100">Copernicus WorldDEM-30:</span> <Badge tone="warn">not loaded</Badge> — terrain-guided tools use placeholder channel-elevation attributes.
              </li>
              <li>
                <span className="font-medium text-slate-100">OpenStreetMap:</span> pre-event snapshot only. Post-event edits are never used to reconstruct damage.
              </li>
              <li>
                <span className="font-medium text-slate-100">Training data:</span> none — detection is rule-based on the sample evidence layers.
              </li>
              <li>
                <span className="font-medium text-slate-100">Processing:</span> sample-data engine in the browser ({results.id}); no live satellite processing.
              </li>
            </ul>
          </section>
          <section className="rounded-lg border border-line bg-white p-3.5">
            <h2 className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <Info className="size-3" /> Quality checks for this run
            </h2>
            {warns.length ? (
              <ul className="space-y-1.5">
                {warns.map((w) => (
                  <li key={w.id} className="text-[11.5px] leading-snug">
                    <span className="font-medium text-slate-100">{w.title}</span>
                    <span className="block text-[10.5px] text-slate-500">{w.detail}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11.5px] text-slate-500">No warnings raised for the chosen dates and sensors.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
