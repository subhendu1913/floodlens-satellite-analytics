import { HOSPITAL_LABEL, HOSPITAL_NE, digits } from "../lib/format";
import type { AnalysisResults, Lang, SettlementResult } from "../types";

/** True when a distinct, mapped post-event route should be drawn / described. */
export function hasAlternativeRoute(s: SettlementResult): boolean {
  if (s.status === "disconnected" || s.postEdges.length === 0) return false;
  if (s.status === "suspected") return true;
  return s.postEdges.join() !== s.baselineEdges.join();
}

/** Plain-language explanation of a settlement's classification, built only from computed results. */
export function explainSettlement(s: SettlementResult, r: AnalysisResults, lang: Lang): string[] {
  const ne = lang === "ne";
  const t = (en: string, np: string) => (ne ? np : en);
  const n = (v: string | number) => digits(v, lang);
  const svc = (name: string) => (ne ? (r.services.find((x) => x.name === name)?.nameNe ?? name) : name);
  const gName = (id: string) => {
    const g = r.groups.find((x) => x.id === id);
    return g ? (ne ? g.nameNe : g.name) : id;
  };
  const blocked = s.disrupted.filter((d) => d.state === "blocked");
  const postUncertain = r.roads.filter((x) => s.postEdges.includes(x.id) && x.impact.state === "suspected");
  const names = (l: { name: string }[]) => l.map((x) => x.name).join("; ");
  const out: string[] = [];

  if (s.status === "disconnected") {
    out.push(
      t(
        `Classified modeled disconnected: after removing ${blocked.length} segment(s) with high-confidence detected water (${names(blocked)}), no road route to a town or hospital remains in the pre-event OSM network.`,
        `मोडेल अनुसार विच्छेद: उच्च-विश्वसनीयताको पानी भएका ${n(blocked.length)} खण्ड (${names(blocked)}) हटाएपछि बाढी अघिको OSM सञ्जालमा सहर वा अस्पतालसम्म कुनै सडक मार्ग बाँकी रहँदैन।`,
      ),
    );
  } else if (s.status === "suspected") {
    out.push(
      t(
        `Classified access uncertain: the only modeled route to ${s.post!.service} (${s.post!.km} km) passes through ${postUncertain.length} segment(s) flagged as possible disruption (${names(postUncertain)}). Because these segments are uncertain, the settlement is not classed as disconnected.`,
        `पहुँच अनिश्चित: ${svc(s.post!.service)} (${n(s.post!.km)} किमी) सम्मको एकमात्र मोडेल मार्ग सम्भावित अवरोध भएका ${n(postUncertain.length)} खण्ड (${names(postUncertain)}) हुँदै जान्छ। ती खण्ड अनिश्चित भएकाले बस्तीलाई विच्छेद भनिएको छैन।`,
      ),
    );
  } else if (s.disrupted.length) {
    out.push(
      t(
        `Access maintained: segments on the pre-event route (${names(s.disrupted)}) are flagged, but a mapped alternative reaches ${s.post!.service} in ${s.post!.km} km without flagged segments.`,
        `पहुँच कायम: बाढी अघिको मार्गका खण्ड (${names(s.disrupted)}) चिह्नित छन्, तर नक्सांकित वैकल्पिक मार्गले चिह्नित खण्ड बिना ${svc(s.post!.service)} सम्म ${n(s.post!.km)} किमीमा पुर्‍याउँछ।`,
      ),
    );
  } else {
    out.push(
      t(
        `Access maintained: no flagged segment lies on the pre-event route${s.baseline ? ` to ${s.baseline.service}` : ""}.`,
        `पहुँच कायम: बाढी अघिको मार्गमा कुनै चिह्नित खण्ड छैन${s.baseline ? ` (${svc(s.baseline.service)})` : ""}।`,
      ),
    );
  }

  if (s.baseline) {
    out.push(
      t(
        `Pre-event route: ${s.baseline.service}, ${s.baseline.km} km${s.reliesOn.length ? ` via ${s.reliesOn.map(gName).join("; ")}` : ""}.`,
        `बाढी अघिको मार्ग: ${svc(s.baseline.service)}, ${n(s.baseline.km)} किमी${s.reliesOn.length ? ` — ${s.reliesOn.map(gName).join("; ")} हुँदै` : ""}।`,
      ),
    );
  }

  if (hasAlternativeRoute(s)) {
    out.push(
      t(
        `Alternative mapped route: ${s.post!.service}, ${s.post!.km} km${s.post!.viaUncertain ? " (through uncertain segments)" : ""}. Drawn on the map when the settlement is selected.`,
        `वैकल्पिक नक्सांकित मार्ग: ${svc(s.post!.service)}, ${n(s.post!.km)} किमी${s.post!.viaUncertain ? " (अनिश्चित खण्ड हुँदै)" : ""}। बस्ती छान्दा नक्सामा देखिन्छ।`,
      ),
    );
  } else if (s.status === "disconnected") {
    out.push(t("No alternative mapped route exists in the OSM network.", "OSM सञ्जालमा कुनै वैकल्पिक नक्सांकित मार्ग छैन।"));
  }

  const h = s.hospital;
  out.push(
    t(
      `Hospital access: ${HOSPITAL_LABEL[h.status]}${h.postKm ? ` (${h.postKm} km)` : ""}${s.hospitalDisrupted.length ? `; flagged on the hospital route: ${names(s.hospitalDisrupted)}` : ""}.`,
      `अस्पताल पहुँच: ${HOSPITAL_NE[h.status]}${h.postKm ? ` (${n(h.postKm)} किमी)` : ""}${s.hospitalDisrupted.length ? `; अस्पताल मार्गमा चिह्नित: ${names(s.hospitalDisrupted)}` : ""}।`,
    ),
  );
  out.push(
    t(
      "Modeled connectivity uses pre-event OpenStreetMap roads. It is not confirmation of real-world accessibility; unmapped tracks, ferries and footpaths are not modeled.",
      "मोडेल गरिएको सम्पर्क बाढी अघिको OpenStreetMap सडकमा आधारित छ। यो वास्तविक पहुँचको पुष्टि होइन; नक्सा नबनेका बाटो, नाव र पैदल मार्ग मोडेल गरिएका छैनन्।",
    ),
  );
  return out;
}
