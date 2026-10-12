import { compareSettlements } from "../analysis/priorities";
import { ATTRIBUTIONS, EMSR_STATEMENT, TRAINING_DATA_STATEMENT } from "../data/attributions";
import { SCENARIO } from "../data/scenario";
import {
  ACCESS_LABEL,
  ACCESS_NE,
  CONF_NE,
  HOSPITAL_LABEL,
  HOSPITAL_NE,
  IMPACT_LABEL,
  confLabel,
  digits,
  fmtDate,
} from "../lib/format";
import type { AnalysisResults, AssetGroup, Lang, SettlementResult } from "../types";

export interface ReportSection {
  heading: string;
  lines: string[];
}
export interface Report {
  lang: Lang;
  title: string;
  banner: string;
  meta: string;
  sections: ReportSection[];
  attributions: string[];
  /** Schematic map snapshot (SVG markup) rendered from the same results object. */
  snapshotSvg?: string | null;
  /** Workflow status line, e.g. "DRAFT" or "PUBLISHED (demo, local)". */
  statusLine?: string;
}
export interface Answer {
  text: string;
  evidence: string[];
}

export const EXAMPLE_QUESTIONS: Record<Lang, string[]> = {
  en: [
    "Where was flooding detected?",
    "Which settlements may be disconnected?",
    "Which bridges may need inspection?",
    "Which roads may be disrupted?",
    "What are the highest-priority locations?",
    "Summarize the findings in Nepali.",
    "Generate a situation report.",
  ],
  ne: [
    "कुन बस्तीहरू विच्छेद भएको देखिन्छ?",
    "कुन सडक र पुल पहिले निरीक्षण गर्नुपर्छ?",
    "सबैभन्दा उच्च प्राथमिकताका प्रभावित क्षेत्रहरूको सारांश दिनुहोस्।",
    "कुन बस्तीहरूले अस्पताल पहुँच गुमाएका छन्?",
    "यी नतिजाहरू कति भरपर्दा छन्?",
  ],
};

/* ------------------------------ shared helpers ------------------------------ */

const SENSOR_EN = { S1S2: "Sentinel-1 + Sentinel-2 (fusion)", S1: "Sentinel-1 radar only", S2: "Sentinel-2 optical only" };
const SENSOR_NE = { S1S2: "Sentinel-1 + Sentinel-2 (संयुक्त)", S1: "Sentinel-1 रडार मात्र", S2: "Sentinel-2 अप्टिकल मात्र" };

export class Ctx {
  constructor(
    public r: AnalysisResults,
    public lang: Lang,
  ) {}
  t = (en: string, ne: string) => (this.lang === "ne" ? ne : en);
  n = (v: string | number) => digits(v, this.lang);
  aoi = () => (this.lang === "ne" && this.r.params.locationName.startsWith("Trishuli") ? "त्रिशूली उपत्यका, नेपाल" : this.r.params.locationName);
  sName = (s: SettlementResult) => (this.lang === "ne" ? s.nameNe : s.name);
  svc = (name: string) => (this.lang === "ne" ? (this.r.services.find((x) => x.name === name)?.nameNe ?? name) : name);
  gName = (g: AssetGroup) => (this.lang === "ne" ? g.nameNe : g.name);
  gNameById = (id: string) => {
    const g = this.r.groups.find((x) => x.id === id);
    return g ? this.gName(g) : id;
  };
  conf = (c: number) => {
    const l = confLabel(c);
    return `${this.lang === "ne" ? CONF_NE[l] : l} (${this.n(Math.round(c * 100))}%)`;
  };
  access = (s: SettlementResult) => (this.lang === "ne" ? ACCESS_NE[s.status] : ACCESS_LABEL[s.status]);
  hospital = (s: SettlementResult) => (this.lang === "ne" ? HOSPITAL_NE[s.hospital.status] : HOSPITAL_LABEL[s.hospital.status]);
  impact = (g: AssetGroup) =>
    this.lang === "ne"
      ? g.state === "blocked"
        ? "डुबानका कारण सम्भवतः आवागमन अयोग्य (मोडेल)"
        : g.state === "suspected"
          ? "सम्भावित अवरोध"
          : "कुनै सङ्केत छैन"
      : IMPACT_LABEL[g.state];
  km = (v: number) => `${this.n(v)} ${this.t("km", "किमी")}`;
  date = (iso?: string) => (iso ? this.n(this.lang === "ne" ? iso : fmtDate(iso)) : this.t("unavailable", "उपलब्ध छैन"));
}

export const sorted = (r: AnalysisResults) => [...r.settlements].sort(compareSettlements);
export const impactedGroups = (r: AnalysisResults) => r.groups.filter((g) => g.state !== "none");

export function settlementLine(c: Ctx, s: SettlementResult): string {
  const nm = (ids: string[]) => ids.map((id) => c.gNameById(id)).join("; ");
  if (c.lang === "ne") {
    const route = s.post
      ? `उत्तम अवस्थामा मार्ग: ${c.svc(s.post.service)}, ${c.km(s.post.km)}${s.post.viaUncertain ? " (अनिश्चित खण्ड हुँदै)" : ""}`
      : `मोडेल अनुसार सडक मार्ग छैन${s.baseline ? ` (पहिले: ${c.svc(s.baseline.service)}, ${c.km(s.baseline.km)})` : ""}`;
    return `• ${c.sName(s)} — ${c.access(s)}। ${route}। अस्पताल: ${c.hospital(s)}। निर्भर: ${s.reliesOn.length ? nm(s.reliesOn) : "—"}। भवन (उच्च/सम्भावित): ${c.n(s.buildings.likely)}/${c.n(s.buildings.possible)} (${c.n(s.buildings.total)} मध्ये)।`;
  }
  const route = s.post
    ? `Best-case route: ${s.post.service}, ${s.post.km} km${s.post.viaUncertain ? " (via an uncertain segment)" : ""}`
    : `No modeled road route${s.baseline ? ` (baseline: ${s.baseline.service}, ${s.baseline.km} km)` : ""}`;
  return `• ${s.name} — ${c.access(s)}. ${route}. Hospital: ${c.hospital(s)}. Depends on: ${s.reliesOn.length ? nm(s.reliesOn) : "—"}. Buildings likely/possible: ${s.buildings.likely}/${s.buildings.possible} of ${s.buildings.total}.`;
}

export function assetLine(c: Ctx, g: AssetGroup, rank?: number): string {
  const dep = g.dependents.map((id) => c.sName(c.r.settlements.find((s) => s.id === id)!));
  const hdep = g.hospitalDependents.map((id) => c.sName(c.r.settlements.find((s) => s.id === id)!));
  const pre = rank ? `${c.n(rank)}. ` : "• ";
  if (c.lang === "ne") {
    return `${pre}${c.gName(g)} — ${c.impact(g)}; विश्वसनीयता ${c.conf(g.confidence)}${dep.length ? `; यसमा निर्भर बस्ती: ${dep.join(", ")}` : ""}${hdep.length ? `; अस्पताल पहुँच प्रभावित: ${hdep.join(", ")}` : ""}। स्थलगत प्रमाणीकरण आवश्यक।`;
  }
  return `${pre}${g.name} — ${IMPACT_LABEL[g.state]}; confidence ${c.conf(g.confidence)}${dep.length ? `; settlements relying on it: ${dep.join(", ")}` : ""}${hdep.length ? `; hospital access affected for: ${hdep.join(", ")}` : ""}. Field verification required.`;
}

function evidenceLines(c: Ctx): string[] {
  const r = c.r;
  const a = r.acquisitions;
  const hasS1 = r.effectiveSensor !== "S2";
  const hasS2 = r.effectiveSensor !== "S1";
  const out: string[] = [];
  out.push(
    c.t(
      `Analysis period: ${fmtDate(r.params.fromDate)} – ${fmtDate(r.params.toDate)} (flood event ${fmtDate(r.params.eventDate)}). Satellites image an area only at discrete dates; the acquisition dates below are the ones actually used.`,
      `विश्लेषण अवधि: ${c.n(r.params.fromDate)} – ${c.n(r.params.toDate)} (बाढी मिति ${c.n(r.params.eventDate)})। उपग्रहले निश्चित मितिमा मात्र तस्बिर लिन्छ; तल दिइएका मिति वास्तविक प्रयोग गरिएका हुन्।`,
    ),
  );
  if (r.acquisitions.outside.length) out.push(c.t("Some selected images lie outside the requested period (baseline imagery) — see the data-quality notes.", "केही छानिएका तस्बिर अनुरोध गरिएको अवधिभन्दा बाहिर छन् (आधार तस्बिर)।"));
  out.push(
    c.lang === "ne"
      ? `डेटा वर्ग: नमूना डेमो डेटा (वास्तविक उपग्रह प्रशोधन होइन)। प्रयोग गरिएको सेन्सर: ${SENSOR_NE[r.effectiveSensor]}।`
      : `Data class: SAMPLE DEMONSTRATION DATA (not live satellite processing). Sensors used: ${SENSOR_EN[r.effectiveSensor]}.`,
  );
  if (hasS1 && a.s1Pre && a.s1Post) {
    out.push(
      c.lang === "ne"
        ? `Sentinel-1: ${c.date(a.s1Pre.date)} → ${c.date(a.s1Post.date)} · ${a.s1Post.orbit} कक्षा ${c.n(a.s1Post.relOrbit ?? 0)} (मिल्दो दृश्य ज्यामिति प्रमाणित)।`
        : `Sentinel-1: ${fmtDate(a.s1Pre.date)} → ${fmtDate(a.s1Post.date)} · ${a.s1Post.orbit} orbit ${a.s1Post.relOrbit} (viewing geometry validated as compatible).`,
    );
  } else {
    out.push(c.t("Sentinel-1: not used or unavailable.", "Sentinel-1: प्रयोग गरिएको छैन वा उपलब्ध छैन।"));
  }
  if (hasS2 && a.s2Pre && a.s2Post) {
    out.push(
      c.lang === "ne"
        ? `Sentinel-2: ${c.date(a.s2Pre.date)} (बादल ${c.n(a.s2Pre.cloudPct ?? 0)}%) → ${c.date(a.s2Post.date)} (बादल ${c.n(a.s2Post.cloudPct ?? 0)}%)।`
        : `Sentinel-2: ${fmtDate(a.s2Pre.date)} (${a.s2Pre.cloudPct}% cloud) → ${fmtDate(a.s2Post.date)} (${a.s2Post.cloudPct}% cloud).`,
    );
  } else {
    out.push(c.t("Sentinel-2: not used or unavailable.", "Sentinel-2: प्रयोग गरिएको छैन वा उपलब्ध छैन।"));
  }
  out.push(
    c.lang === "ne"
      ? `भू-आकृति: Copernicus DEM। पूर्वाधार: बाढी अघिको OpenStreetMap स्न्यापसट (${c.date(SCENARIO.osmSnapshotDate)}); बाढीपछिका OSM सम्पादन प्रयोग गरिएका छैनन्।`
      : `Terrain: Copernicus DEM. Infrastructure: pre-event OpenStreetMap snapshot (${fmtDate(SCENARIO.osmSnapshotDate)}); post-event OSM edits are not used.`,
  );
  return out;
}

function limitationLines(c: Ctx): string[] {
  const r = c.r;
  if (c.lang === "en") return r.limitations;
  const out = [
    "नमूना डेटा: ज्यामिति र प्रमाण मानहरू प्रत्यक्ष Sentinel-1/Sentinel-2 प्रणालीका उदाहरणीय प्रतिनिधि हुन्; यी उपग्रहबाट प्राप्त वास्तविक निष्कर्ष होइनन्।",
    "उपग्रह तस्बिरले मात्र संरचनात्मक क्षति पुष्टि गर्न सक्दैन। “सम्भवतः आवागमन अयोग्य” भनेको सडक वा पहुँच मार्ग डुबानमा परेको मोडेल मात्र हो, भत्किएको प्रमाण होइन।",
    `सडक सम्पर्क विश्लेषण बाढी अघिको OpenStreetMap स्न्यापसट (${c.date(SCENARIO.osmSnapshotDate)}) मा आधारित छ; नक्सा नबनेका बाटो, पैदल मार्ग र नाव वैकल्पिक पहुँच हुन सक्छन्।`,
    "“विच्छेद (मोडेल)” = उच्च-विश्वसनीयताले डुबेका खण्ड हटाउँदा कुनै सडक मार्ग नरहनु। “पहुँच अनिश्चित” = मार्ग शंकास्पद खण्ड हुँदै मात्र उपलब्ध हुनु।",
    "जनसंख्या, हताहत र आवश्यकता सम्बन्धी तथ्याङ्क गणना गरिएका नतिजामा समावेश छैनन्, त्यसैले उपलब्ध छैनन्।",
  ];
  if (r.effectiveSensor === "S2") out.push("Sentinel-1 रडार प्रयोग गरिएको छैन: पानी पहिचान अप्टिकल तस्बिरमा निर्भर छ र बादलले ढाकेका क्षेत्र मूल्याङ्कन गर्न सकिँदैन।");
  if (r.effectiveSensor === "S1") out.push("Sentinel-2 अप्टिकल तस्बिर प्रयोग गरिएको छैन: भग्नावशेष सङ्केत रडार कोहेरेन्समा मात्र आधारित भएकाले विश्वसनीयता कम छ।");
  if (r.s2Cloud) out.push(`बाढीपछिको Sentinel-2 तस्बिरमा बादल ${c.n(r.acquisitions.s2Post?.cloudPct ?? 0)}% छ; बादल मास्कभित्र अप्टिकल प्रमाण उपलब्ध छैन।`);
  if (r.recession < 1) out.push(`बाढीपछिको तस्बिर ढिलो लिइएकाले पानी घटेको हुन सक्छ; मोडेल गरिएको क्षेत्र नमूना शिखरको ${c.n(Math.round(r.recession * 100))}% मा सीमित छ।`);
  if (r.effectiveSensor !== "S2") out.push("दक्षिण-पश्चिमको साँघुरो खोँचमा रडार छाया/लेओभर हुने भएकाले त्यहाँ पानीको विश्वसनीयता कम छ।");
  return out;
}

/* ------------------------------ report ------------------------------ */

export function buildReport(r: AnalysisResults, lang: Lang): Report {
  const c = new Ctx(r, lang);
  const m = r.metrics;
  const cut = sorted(r).filter((s) => s.status === "disconnected");
  const unc = sorted(r).filter((s) => s.status === "suspected");
  const hospLost = r.settlements.filter((s) => s.hospital.status !== "reachable");
  const top = impactedGroups(r).slice(0, 5);
  const now = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

  const figures =
    lang === "ne"
      ? [
          `पत्ता लागेको पानी: ${c.n(m.waterKm2.toFixed(2))} वर्ग किमी (उच्च विश्वसनीयता) र थप ${c.n(m.uncertainKm2.toFixed(2))} वर्ग किमी अनिश्चित।`,
          `शंकास्पद भग्नावशेष क्षेत्र: ${c.n(m.debrisKm2.toFixed(2))} वर्ग किमी (${c.n(r.debris.length)} क्षेत्र, सबै पुष्टि नभएका सङ्केत)।`,
          `भवन: ${c.n(m.buildingsTotal)} नक्सांकित भवनमध्ये ${c.n(m.buildingsLikely)} डुबानमा परेको सम्भावना उच्च, ${c.n(m.buildingsPossible)} सम्भावित प्रभावित${m.buildingsUnassessed ? `, ${c.n(m.buildingsUnassessed)} बादलका कारण मूल्याङ्कन गर्न नसकिने` : ""} (जोखिम मात्र; क्षति पुष्टि भएको छैन)।`,
          `सडक: ${c.n(m.roadKmInundated)} किमी नक्सांकित सडक डुबानमा; ${c.n(m.roadSegmentsBlocked)} खण्ड सम्भवतः आवागमन अयोग्य र ${c.n(m.roadSegmentsSuspected)} खण्ड सम्भावित अवरोधयुक्त।`,
          `पुल: ${c.n(m.bridgesTotal)} मध्ये ${c.n(m.bridgesBlocked)} सम्भवतः आवागमन अयोग्य, ${c.n(m.bridgesSuspected)} सम्भावित अवरोधयुक्त (संरचनात्मक अवस्था अज्ञात)।`,
          `बस्ती: ${c.n(m.settlementsTotal)} मध्ये ${c.n(m.settlementsDisconnected)} विच्छेद (मोडेल), ${c.n(m.settlementsSuspected)} पहुँच अनिश्चित, ${c.n(m.settlementsConnected)} पहुँच कायम।`,
          `अस्पताल पहुँच: ${c.n(m.hospitalLost)} बस्तीको लागि मोडेल अनुसार मार्ग छैन; ${c.n(m.hospitalUncertain)} बस्तीको लागि अनिश्चित।`,
        ]
      : [
          `Detected water: ${m.waterKm2.toFixed(2)} km² (high confidence) plus ${m.uncertainKm2.toFixed(2)} km² of uncertain water signal.`,
          `Suspected debris: ${m.debrisKm2.toFixed(2)} km² across ${r.debris.length} indicator zone(s) — indicators only, none confirmed.`,
          `Buildings: of ${m.buildingsTotal} mapped footprints, ${m.buildingsLikely} likely inundated and ${m.buildingsPossible} possibly affected${m.buildingsUnassessed ? `; ${m.buildingsUnassessed} not assessable (cloud)` : ""}. This is exposure, not confirmed damage.`,
          `Roads: ${m.roadKmInundated} km of mapped road under detected water; ${m.roadSegmentsBlocked} segment(s) likely impassable and ${m.roadSegmentsSuspected} with possible disruption.`,
          `Bridges: ${m.bridgesBlocked} of ${m.bridgesTotal} likely impassable and ${m.bridgesSuspected} with possible disruption (structural condition unknown).`,
          `Settlements: of ${m.settlementsTotal}, ${m.settlementsDisconnected} modeled disconnected, ${m.settlementsSuspected} with uncertain access, ${m.settlementsConnected} with access maintained.`,
          `Hospital access: no modeled route for ${m.hospitalLost} settlement(s); uncertain for ${m.hospitalUncertain}.`,
        ];

  const sections: ReportSection[] = [
    { heading: c.t("1. Key figures (computed)", "१. मुख्य तथ्याङ्क (गणना गरिएको)"), lines: figures },
    {
      heading: c.t("2. Settlements: modeled disconnected or uncertain access", "२. बस्ती: विच्छेद वा अनिश्चित पहुँच"),
      lines: [
        ...(cut.length
          ? [c.t("Modeled disconnected — no remaining road route when high-confidence inundated segments are removed:", "मोडेल अनुसार विच्छेद — उच्च-विश्वसनीयताले डुबेका खण्ड हटाउँदा कुनै सडक मार्ग नरहेका:"), ...cut.map((s) => settlementLine(c, s))]
          : [c.t("No settlement is modeled as disconnected.", "मोडेल गरिएको सञ्जालमा कुनै बस्ती विच्छेद भएको छैन।")]),
        ...(unc.length
          ? [c.t("Access uncertain — a route exists only through suspected segments:", "पहुँच अनिश्चित — मार्ग शंकास्पद खण्ड हुँदै मात्र उपलब्ध:"), ...unc.map((s) => settlementLine(c, s))]
          : []),
        ...(hospLost.length
          ? [
              c.t(
                `Hospital access not confirmed for: ${hospLost.map((s) => s.name).join(", ")}.`,
                `अस्पताल पहुँच पुष्टि नभएका बस्ती: ${hospLost.map((s) => s.nameNe).join(", ")}।`,
              ),
            ]
          : []),
      ],
    },
    {
      heading: c.t("3. Inspect first (ranked)", "३. पहिले निरीक्षण गर्नुपर्ने (प्राथमिकता क्रम)"),
      lines: top.length
        ? top.map((g, i) => assetLine(c, g, i + 1))
        : [c.t("No roads or bridges were flagged.", "कुनै सडक वा पुल चिह्नित गरिएको छैन।")],
    },
    { heading: c.t("4. Evidence summary", "४. प्रमाण सारांश"), lines: evidenceLines(c) },
    {
      heading: c.t("5. Confidence and key limitations", "५. विश्वसनीयता र मुख्य सीमितता"),
      lines: [
        c.t(
          "Confidence bands: High ≥ 75%, Medium 50–75%, Low < 50% (fused evidence score, not a probability of damage).",
          "विश्वसनीयता स्तर: उच्च ≥ ७५%, मध्यम ५०–७५%, न्यून < ५०% (संयुक्त प्रमाण अङ्क; क्षतिको सम्भावना होइन)।",
        ),
        ...limitationLines(c).map((l) => `• ${l}`),
      ],
    },
    {
      heading: c.t("6. Data integrity", "६. डेटा अखण्डता"),
      lines: [
        c.t(EMSR_STATEMENT, "Copernicus EMSR927 सन्दर्भ नक्सा विश्लेषणपछिको प्रमाणीकरण/तुलनामा मात्र सीमित छन्; पहिचान, प्रशिक्षण वा कुनै व्युत्पन्न नतिजामा कहिल्यै प्रयोग गरिएका छैनन्। प्रमाणीकरण 'केस-स्टडी प्रमाणीकरण' पृष्ठमा, विश्लेषण सकिएपछि मात्र हुन्छ; यो प्रतिवेदनमा कुनै प्रमाणीकरण मापन समावेश छैन।"),
        c.t(TRAINING_DATA_STATEMENT, "यस प्रोटोटाइपमा कुनै मेसिन-लर्निङ मोडेल वा प्रशिक्षण डेटासेट प्रयोग गरिएको छैन; पहिचान नमूना प्रमाण तहमा आधारित नियम-आधारित छ।"),
      ],
    },
  ];

  return {
    lang,
    title: c.t(`FloodLens Situation Report — ${r.params.locationName}`, `FloodLens परिस्थिति प्रतिवेदन — ${c.aoi()}`),
    banner: c.t(
      "SAMPLE DEMONSTRATION DATA — results are illustrative and are not derived from live satellite processing.",
      "नमूना (डेमो) तथ्याङ्क — नतिजाहरू उदाहरणीय हुन्; प्रत्यक्ष उपग्रह प्रशोधनबाट प्राप्त होइनन्।",
    ),
    meta: c.t(
      `Flood event: ${fmtDate(r.params.eventDate)} · Analysis period: ${fmtDate(r.params.fromDate)} – ${fmtDate(r.params.toDate)} · Generated: ${now} · Source: FloodLens structured analysis results (${r.id})`,
      `बाढी मिति: ${c.n(r.params.eventDate)} · विश्लेषण अवधि: ${c.n(r.params.fromDate)} – ${c.n(r.params.toDate)} · तयार गरिएको: ${c.n(now)} · स्रोत: FloodLens संरचित विश्लेषण नतिजा (${r.id})`,
    ),
    sections,
    attributions: ATTRIBUTIONS,
  };
}

export function reportToText(rep: Report): string {
  const out = [`# ${rep.title}`, "", `**${rep.banner}**`, "", rep.meta, ...(rep.statusLine ? [rep.statusLine] : []), ""];
  for (const s of rep.sections) {
    out.push(`## ${s.heading}`, ...s.lines.map((l) => (l.startsWith("•") || /^\d+\./.test(l) || /^[०-९]+\./.test(l) ? l : l.endsWith(":") || l.endsWith("ः") ? l : `- ${l}`)), "");
  }
  out.push("## Attribution", ...rep.attributions, "");
  return out.join("\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function reportToHtml(rep: Report): string {
  return `<!doctype html><html lang="${rep.lang}"><head><meta charset="utf-8"><title>${esc(rep.title)}</title>
<style>
 body{font-family:"Noto Sans","Noto Sans Devanagari",Segoe UI,Arial,sans-serif;color:#0f172a;margin:32px auto;max-width:780px;line-height:1.5;font-size:12.5px}
 h1{font-size:20px;margin:0 0 6px} h2{font-size:14px;margin:20px 0 6px;color:#0F172A;border-bottom:1px solid #E2E8F0;padding-bottom:3px}
 .banner{background:#fef3c7;border:1px solid #f59e0b;padding:8px 10px;font-weight:600;border-radius:4px;margin:10px 0}
 .meta{color:#475569;font-size:11px} p{margin:4px 0} figure{margin:12px 0} figure svg{width:100%;height:auto;max-height:520px;border:1px solid #cbd5e1} figcaption{font-size:10.5px;color:#475569;margin-top:3px} .attr{margin-top:22px;font-size:10.5px;color:#334155;border-top:1px solid #cbd5e1;padding-top:8px}
</style></head><body>
<div style="font-weight:700;font-size:12px;letter-spacing:.04em;color:#2563EB;margin-bottom:4px">FloodLens · Satellite-powered flood intelligence</div><h1 style="color:#0F172A;border-bottom:3px solid #2563EB;padding-bottom:6px">${esc(rep.title)}</h1><div class="banner">${esc(rep.banner)}</div><div class="meta">${esc(rep.meta)}</div>${rep.statusLine ? `<div class="meta"><b>${esc(rep.statusLine)}</b></div>` : ""}${rep.snapshotSvg ? `<figure>${rep.snapshotSvg}<figcaption>Schematic map snapshot rendered from the structured analysis results (no basemap). Sample data.</figcaption></figure>` : ""}
${rep.sections.map((s) => `<h2>${esc(s.heading)}</h2>${s.lines.map((l) => `<p>${esc(l)}</p>`).join("")}`).join("")}
<div class="attr">${rep.attributions.map((a) => `<p>${esc(a)}</p>`).join("")}</div>
</body></html>`;
}

/* ------------------------------ Q&A ------------------------------ */

export function evidenceShort(c: Ctx): string[] {
  const r = c.r;
  const a = r.acquisitions;
  const parts: string[] = [
    c.t(`Sample demonstration data · ${SENSOR_EN[r.effectiveSensor]}`, `नमूना डेमो डेटा · ${SENSOR_NE[r.effectiveSensor]}`),
  ];
  if (r.effectiveSensor !== "S2" && a.s1Pre && a.s1Post) parts.push(`S1 ${c.date(a.s1Pre.date)} → ${c.date(a.s1Post.date)}`);
  if (r.effectiveSensor !== "S1" && a.s2Pre && a.s2Post) parts.push(`S2 ${c.date(a.s2Pre.date)} → ${c.date(a.s2Post.date)}`);
  parts.push(c.t(`Period ${fmtDate(r.params.fromDate)} – ${fmtDate(r.params.toDate)}`, `अवधि ${c.n(r.params.fromDate)} – ${c.n(r.params.toDate)}`));
  parts.push(c.t(`OSM snapshot ${fmtDate(SCENARIO.osmSnapshotDate)}`, `OSM स्न्यापसट ${c.date(SCENARIO.osmSnapshotDate)}`));
  return [parts.join(" · ")];
}

const has = (q: string, re: RegExp) => re.test(q);

export function answerCore(question: string, r: AnalysisResults, lang: Lang): Answer {
  const c = new Ctx(r, lang);
  const q = question.toLowerCase();
  const m = r.metrics;
  const ev = evidenceShort(c);
  const ans = (lines: string[], extra: string[] = []): Answer => ({ text: lines.join("\n"), evidence: [...ev, ...extra] });
  const cut = sorted(r).filter((s) => s.status === "disconnected");
  const unc = sorted(r).filter((s) => s.status === "suspected");
  const groups = impactedGroups(r);

  // Specific asset (BR1, R05 …)
  const idMatch = question.match(/\b(BR\d|R\d{2})\b/i);
  if (idMatch) {
    const id = idMatch[1].toUpperCase();
    const g = r.groups.find((x) => x.id === id) ?? r.groups.find((x) => x.edgeIds.includes(id));
    if (g) {
      return ans([
        assetLine(c, g),
        ...g.reasons.slice(0, 3).map((x) => `– ${x}`),
        c.t("Inundation or debris near a structure is not evidence that it has failed; inspect before closing or reopening.", "संरचना वरपर डुबान वा भग्नावशेष हुनु भत्किएको प्रमाण होइन; बन्द गर्नु वा खोल्नु अघि निरीक्षण गर्नुहोस्।"),
      ]);
    }
  }

  // Specific settlement
  const named = r.settlements.find((s) => q.includes(s.name.toLowerCase()) || question.includes(s.nameNe));
  if (named) {
    return ans([
      settlementLine(c, named),
      named.status === "connected"
        ? c.t("A modeled road route avoiding all flagged segments exists.", "झण्डा लागेका खण्ड नछुने मोडेल गरिएको सडक मार्ग उपलब्ध छ।")
        : c.t("This is a road-network model on the pre-event OSM snapshot; unmapped tracks may offer alternatives. Confirm by radio/phone or field team.", "यो बाढी अघिको OSM स्न्यापसटमा आधारित सडक-सञ्जाल मोडेल हो; नक्सा नबनेका बाटो वैकल्पिक हुन सक्छन्। रेडियो/फोन वा स्थलगत टोलीबाट पुष्टि गर्नुहोस्।"),
    ]);
  }

  // Unavailable information
  if (has(q, /population|people|casualt|death|dead|injur|displac|needs|how many (families|households)/) || has(question, /जनसंख्या|मृत्यु|हताहत|घाइते|विस्थापित/)) {
    return ans([
      c.t(
        "That information is unavailable. Population, casualty, displacement and needs data are not part of the computed analysis results, so FloodLens does not estimate them.",
        "त्यो जानकारी उपलब्ध छैन। जनसंख्या, हताहत, विस्थापन र आवश्यकता सम्बन्धी तथ्याङ्क गणना गरिएका नतिजामा छैनन्, त्यसैले FloodLens ले अनुमान गर्दैन।",
      ),
      c.t(
        `Available instead: ${m.buildingsLikely} buildings likely inundated and ${m.buildingsPossible} possibly affected (mapped footprints only), and settlement access status.`,
        `यसको सट्टा उपलब्ध: ${c.n(m.buildingsLikely)} भवन डुबानमा परेको सम्भावना उच्च र ${c.n(m.buildingsPossible)} सम्भावित प्रभावित (नक्सांकित भवन मात्र) तथा बस्तीको पहुँच अवस्था।`,
      ),
    ]);
  }

  // Damage confirmation
  if (has(q, /damage|destroy|collaps|washed|structural/) || has(question, /क्षति|भत्कि|ध्वस्त/)) {
    return ans([
      c.t(
        "Satellite imagery alone cannot confirm structural damage, and FloodLens does not claim it.",
        "उपग्रह तस्बिरले मात्र संरचनात्मक क्षति पुष्टि गर्न सक्दैन, र FloodLens ले त्यस्तो दाबी गर्दैन।",
      ),
      c.t(
        `What the system reports instead: ${m.bridgesBlocked + m.bridgesSuspected} of ${m.bridgesTotal} bridges flagged for inspection, ${m.roadSegmentsBlocked} road segments likely impassable from inundation, and ${m.buildingsLikely} buildings likely inundated. These are exposure indicators requiring field or UAV verification.`,
        `यसको सट्टा प्रणालीले देखाउँछ: ${c.n(m.bridgesTotal)} मध्ये ${c.n(m.bridgesBlocked + m.bridgesSuspected)} पुल निरीक्षणका लागि चिह्नित, डुबानका कारण ${c.n(m.roadSegmentsBlocked)} सडक खण्ड सम्भवतः आवागमन अयोग्य, र ${c.n(m.buildingsLikely)} भवन डुबानमा परेको सम्भावना उच्च। यी जोखिम सङ्केत हुन्, स्थलगत वा UAV प्रमाणीकरण आवश्यक।`,
      ),
    ]);
  }

  // Hospital access
  if (has(q, /hospital|clinic|health|medical/) || has(question, /अस्पताल|स्वास्थ्य/)) {
    const lost = sorted(r).filter((s) => s.hospital.status === "lost");
    const uncertain = sorted(r).filter((s) => s.hospital.status === "uncertain");
    const nm = (l: SettlementResult[]) => (l.length ? l.map((s) => c.sName(s)).join(", ") : c.t("none", "कोही छैन"));
    return ans([
      c.t(
        `Hospital access (Trishuli District Hospital) — no modeled road route: ${lost.length} settlement(s): ${nm(lost)}.`,
        `अस्पताल पहुँच (त्रिशूली जिल्ला अस्पताल) — मोडेल अनुसार सडक मार्ग नभएका ${c.n(lost.length)} बस्ती: ${nm(lost)}।`,
      ),
      c.t(`Uncertain (route only via suspected segments): ${uncertain.length}: ${nm(uncertain)}.`, `अनिश्चित (शंकास्पद खण्ड हुँदै मात्र मार्ग): ${c.n(uncertain.length)}: ${nm(uncertain)}।`),
      c.t(`Reachable by a modeled route: ${r.settlements.length - lost.length - uncertain.length}.`, `मोडेल गरिएको मार्गबाट पुग्न सकिने: ${c.n(r.settlements.length - lost.length - uncertain.length)}।`),
      c.t("“No modeled route” reflects the pre-event OSM road graph only; air or boat access is not modeled.", "“मोडेल अनुसार मार्ग छैन” भनेको बाढी अघिको OSM सडक सञ्जाल मात्र हो; हवाई वा नाव पहुँच मोडेल गरिएको छैन।"),
    ]);
  }

  // Summary / priorities
  if (has(q, /summar|priorit|overview|highest|sitrep|situation|brief/) || has(question, /सारांश|प्राथमिक|अवस्था/)) {
    return ans([
      c.t(
        `Summary: ${m.settlementsDisconnected} of ${m.settlementsTotal} settlements are modeled as disconnected and ${m.settlementsSuspected} have uncertain access. Detected water covers ${m.waterKm2.toFixed(2)} km² (+${m.uncertainKm2.toFixed(2)} km² uncertain); ${m.buildingsLikely} buildings are likely inundated.`,
        `सारांश: ${c.n(m.settlementsTotal)} मध्ये ${c.n(m.settlementsDisconnected)} बस्ती विच्छेद (मोडेल) र ${c.n(m.settlementsSuspected)} को पहुँच अनिश्चित छ। पत्ता लागेको पानी ${c.n(m.waterKm2.toFixed(2))} वर्ग किमी (+${c.n(m.uncertainKm2.toFixed(2))} अनिश्चित); ${c.n(m.buildingsLikely)} भवन डुबानमा परेको सम्भावना उच्च।`,
      ),
      c.t("Highest-priority settlements:", "उच्च प्राथमिकताका बस्ती:"),
      ...sorted(r)
        .filter((s) => s.status !== "connected")
        .slice(0, 3)
        .map((s) => settlementLine(c, s)),
      c.t("Highest-priority crossings / roads to inspect:", "पहिले निरीक्षण गर्नुपर्ने पुल/सडक:"),
      ...groups.slice(0, 3).map((g, i) => assetLine(c, g, i + 1)),
    ]);
  }

  // Roads & bridges
  if (has(q, /bridge|road|inspect|route|highway|crossing/) || has(question, /पुल|सडक|निरीक्षण|बाटो/)) {
    return ans(
      groups.length
        ? [
            c.t(
              `Inspection order (ranked by settlements depending on the crossing, hospital access and detection confidence): ${groups.length} flagged.`,
              `निरीक्षण क्रम (क्रसिङमा निर्भर बस्ती, अस्पताल पहुँच र पहिचान विश्वसनीयताका आधारमा): ${c.n(groups.length)} चिह्नित।`,
            ),
            ...groups.slice(0, 6).map((g, i) => assetLine(c, g, i + 1)),
            c.t("Bridge condition cannot be inferred from satellite data; inundated approaches do not mean the structure failed.", "उपग्रह डेटाबाट पुलको अवस्था अनुमान गर्न सकिँदैन; पहुँच मार्ग डुब्नु संरचना भत्किनु होइन।"),
          ]
        : [c.t("No roads or bridges are flagged in the current results.", "हालको नतिजामा कुनै सडक वा पुल चिह्नित छैन।")],
    );
  }

  // Cut-off settlements
  if (has(q, /cut|isolat|disconnect|settlement|village|access|stranded/) || has(question, /विच्छेद|बस्ती|गाउँ|पहुँच|कटेका/)) {
    return ans([
      c.t(
        `Of ${m.settlementsTotal} modeled settlements: ${cut.length} are modeled as disconnected, ${unc.length} have uncertain access, ${m.settlementsConnected} retain a modeled route.`,
        `मोडेल गरिएका ${c.n(m.settlementsTotal)} बस्तीमध्ये: ${c.n(cut.length)} विच्छेद (मोडेल), ${c.n(unc.length)} को पहुँच अनिश्चित, ${c.n(m.settlementsConnected)} मा मोडेल गरिएको मार्ग कायम।`,
      ),
      c.t("Modeled disconnected:", "विच्छेद (मोडेल):"),
      ...(cut.length ? cut.map((s) => settlementLine(c, s)) : [c.t("• None identified", "• कुनै पहिचान भएन")]),
      c.t("Access uncertain (route only via suspected segments):", "पहुँच अनिश्चित (शंकास्पद खण्ड हुँदै मात्र):"),
      ...(unc.length ? unc.map((s) => settlementLine(c, s)) : [c.t("• None identified", "• कुनै पहिचान भएन")]),
      c.t("Network model on the pre-event OSM snapshot — not a field observation.", "बाढी अघिको OSM स्न्यापसटमा आधारित सञ्जाल मोडेल — स्थलगत अवलोकन होइन।"),
    ]);
  }

  // Extent
  if (has(q, /extent|area|water|flood|km|hectare|how large|how much/) || has(question, /क्षेत्रफल|पानी|बाढी|वर्ग/)) {
    return ans([
      c.t(
        `Detected water: ${m.waterKm2.toFixed(2)} km² at high confidence, plus ${m.uncertainKm2.toFixed(2)} km² uncertain. Suspected debris: ${m.debrisKm2.toFixed(2)} km² (${r.debris.length} zones).`,
        `पत्ता लागेको पानी: उच्च विश्वसनीयतामा ${c.n(m.waterKm2.toFixed(2))} वर्ग किमी, थप ${c.n(m.uncertainKm2.toFixed(2))} वर्ग किमी अनिश्चित। शंकास्पद भग्नावशेष: ${c.n(m.debrisKm2.toFixed(2))} वर्ग किमी (${c.n(r.debris.length)} क्षेत्र)।`,
      ),
      r.recession < 1
        ? c.t(`Note: post-event scene was acquired after the peak; extent scaled to ${Math.round(r.recession * 100)}% of sample peak.`, `टिप्पणी: बाढीपछिको तस्बिर शिखरपछि लिइएकाले क्षेत्र नमूना शिखरको ${c.n(Math.round(r.recession * 100))}% मा सीमित छ।`)
        : c.t("Extent reflects a post-event scene acquired within 2 days of the event.", "क्षेत्र घटनाको २ दिनभित्र लिइएको बाढीपछिको तस्बिरमा आधारित छ।"),
    ]);
  }

  // Buildings
  if (has(q, /building|house|home|structure|footprint/) || has(question, /भवन|घर/)) {
    const by = [...r.settlements].sort((a, b) => b.buildings.likely - a.buildings.likely).filter((s) => s.buildings.likely + s.buildings.possible > 0).slice(0, 4);
    return ans([
      c.t(
        `Of ${m.buildingsTotal} mapped building footprints: ${m.buildingsLikely} likely inundated, ${m.buildingsPossible} possibly affected${m.buildingsUnassessed ? `, ${m.buildingsUnassessed} not assessable (cloud)` : ""}.`,
        `${c.n(m.buildingsTotal)} नक्सांकित भवनमध्ये: ${c.n(m.buildingsLikely)} डुबानमा परेको सम्भावना उच्च, ${c.n(m.buildingsPossible)} सम्भावित प्रभावित${m.buildingsUnassessed ? `, ${c.n(m.buildingsUnassessed)} बादलका कारण मूल्याङ्कन गर्न नसकिने` : ""}।`,
      ),
      ...by.map((s) => c.t(`• ${s.name}: ${s.buildings.likely} likely / ${s.buildings.possible} possible`, `• ${c.sName(s)}: ${c.n(s.buildings.likely)} उच्च / ${c.n(s.buildings.possible)} सम्भावित`)),
      c.t("Exposure to water or debris is not structural damage.", "पानी वा भग्नावशेषको सम्पर्क संरचनात्मक क्षति होइन।"),
    ]);
  }

  // Validation / EMSR
  if (has(q, /emsr|validat|reference map|copernicus ems|training|dataset/) || has(question, /प्रमाणीकरण|प्रशिक्षण/)) {
    return ans([
      c.t(EMSR_STATEMENT, "Copernicus EMSR927 सन्दर्भ नक्सा विश्लेषणपछिको प्रमाणीकरणमा मात्र सीमित छन्; पहिचान, प्रशिक्षण वा नतिजामा कहिल्यै प्रयोग गरिएका छैनन्। प्रमाणीकरण अलग पृष्ठमा, विश्लेषणपछि मात्र हुन्छ।"),
      c.t(TRAINING_DATA_STATEMENT, "यस प्रोटोटाइपमा कुनै प्रशिक्षण डेटासेट प्रयोग गरिएको छैन।"),
    ]);
  }

  // Confidence / limitations
  if (has(q, /reliab|confiden|limit|uncertain|trust|accura|caveat|quality/) || has(question, /भरपर्दा|विश्वास|सीमा|अनिश्चित|गुणस्तर/)) {
    const lines = limitationLines(c);
    return ans([
      c.t(
        `Confidence is shown per feature (High ≥ 75%, Medium 50–75%, Low < 50%). Flagged assets: ${groups.filter((g) => confLabel(g.confidence) === "High").length} high, ${groups.filter((g) => confLabel(g.confidence) === "Medium").length} medium, ${groups.filter((g) => confLabel(g.confidence) === "Low").length} low confidence.`,
        `विश्वसनीयता प्रत्येक विशेषतामा देखाइएको छ (उच्च ≥ ७५%, मध्यम ५०–७५%, न्यून < ५०%)। चिह्नित पूर्वाधार: ${c.n(groups.filter((g) => confLabel(g.confidence) === "High").length)} उच्च, ${c.n(groups.filter((g) => confLabel(g.confidence) === "Medium").length)} मध्यम, ${c.n(groups.filter((g) => confLabel(g.confidence) === "Low").length)} न्यून।`,
      ),
      c.t("Key limitations:", "मुख्य सीमितता:"),
      ...lines.slice(0, 6).map((l) => `• ${l}`),
    ]);
  }

  // Evidence / sources
  if (has(q, /source|date|sentinel|satellite|evidence|data|orbit|when|imagery|acquisition/) || has(question, /स्रोत|मिति|उपग्रह|प्रमाण|तस्बिर/)) {
    return ans([c.t("Evidence behind the current results:", "हालका नतिजाका आधारभूत प्रमाण:"), ...evidenceLines(c).map((l) => `• ${l}`)]);
  }

  // Fallback
  return ans([
    c.t(
      "I can only answer from the computed analysis results, and I don't have an answer for that question.",
      "म गणना गरिएका विश्लेषण नतिजाबाट मात्र उत्तर दिन सक्छु, र यस प्रश्नको उत्तर मसँग छैन।",
    ),
    c.t(
      "Try asking about: modeled disconnected settlements, hospital access, roads and bridges to inspect, flood extent, buildings, evidence and dates, limitations, or a specific place such as “Is Pipaltar cut off?”.",
      "यी बारेमा सोध्न सक्नुहुन्छ: विच्छेद भएका बस्ती, अस्पताल पहुँच, निरीक्षण गर्नुपर्ने सडक/पुल, बाढी क्षेत्र, भवन, प्रमाण र मिति, सीमितता, वा “पिपलतार विच्छेद भएको छ?” जस्तो कुनै ठाउँ।",
    ),
  ]);
}
