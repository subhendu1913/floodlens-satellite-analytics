import { computeChokepoints } from "../analysis/chokepoints";
import { buildPriorities } from "../analysis/priorities";
import type { SimResult } from "../analysis/simulate";
import { buildReport, type Report, type ReportSection } from "../copilot/report";
import { IMPACT_LABEL, confLabel, digits, fmtDate, fmtPeriod } from "../lib/format";
import { VERIF_LABEL, VERIF_LABEL_NE, VERIF_ORDER, statusOf, taskCounts, type TaskMap } from "../state/tasks";
import type { AnalysisResults, ImpactState, Lang } from "../types";

const IMPACT_NE: Record<ImpactState, string> = { blocked: "डुबानका कारण सम्भवतः आवागमन अयोग्य (मोडेल)", suspected: "सम्भावित अवरोध", none: "कुनै बाढी सङ्केत छैन" };

/**
 * Rescue Brief = situation report + period changes + critical connections + verification workflow
 * (+ an explicitly requested, clearly labelled hypothetical simulation). Every number is read from the
 * shared analysis results object (and the manual verification statuses), so it matches the map and tables.
 */
export function buildBrief(r: AnalysisResults, lang: Lang, opts: { sim?: SimResult | null; tasks?: TaskMap } = {}): Report {
  const base = buildReport(r, lang);
  const ne = lang === "ne";
  const t = (en: string, np: string) => (ne ? np : en);
  const n = (v: string | number) => digits(v, lang);
  const tasks = opts.tasks ?? {};

  /* ---------- what changed in the selected period ---------- */
  const c = r.changes;
  const changed = c.settlementsChanged.length
    ? c.settlementsChanged.map((s) => `${ne ? s.nameNe : s.name} (${s.to === "disconnected" ? t("modeled disconnected", "मोडेल अनुसार विच्छेद") : t("access uncertain", "पहुँच अनिश्चित")})`).join(", ")
    : "—";
  const changes: ReportSection = {
    heading: t("X. What changed in the selected period", "X. छानिएको अवधिमा के परिवर्तन भयो"),
    lines: [
      t(`Analysis period ${fmtPeriod(c.fromDate, c.toDate)}; flood event ${fmtDate(c.eventDate)}.`, `विश्लेषण अवधि ${n(c.fromDate)} – ${n(c.toDate)}; बाढी मिति ${n(c.eventDate)}।`),
      t(
        `Floodwater: ${c.detectedWaterKm2.toFixed(2)} km² detected (high confidence) versus ${c.baselineWaterKm2.toFixed(2)} km² of pre-event mapped waterways in the same reaches — about ${c.addedWaterKm2.toFixed(2)} km² of additional water. A further ${c.uncertainKm2.toFixed(2)} km² is uncertain and ${c.debrisKm2.toFixed(2)} km² is suspected debris.`,
        `बाढीको पानी: उच्च विश्वसनीयतामा ${n(c.detectedWaterKm2.toFixed(2))} वर्ग किमी पत्ता लागेको, सोही खण्डमा बाढी अघि नक्सांकित जलमार्ग ${n(c.baselineWaterKm2.toFixed(2))} वर्ग किमी — करिब ${n(c.addedWaterKm2.toFixed(2))} वर्ग किमी थप पानी। थप ${n(c.uncertainKm2.toFixed(2))} वर्ग किमी अनिश्चित र ${n(c.debrisKm2.toFixed(2))} वर्ग किमी शंकास्पद भग्नावशेष।`,
      ),
      t(
        `Potentially affected: ${c.buildingsExposed} buildings (likely or possible), ${c.roadsFlagged} road segments and ${c.bridgesFlagged} of ${r.metrics.bridgesTotal} bridges carry a flood or debris indicator.`,
        `सम्भावित प्रभावित: ${n(c.buildingsExposed)} भवन (उच्च वा सम्भावित), ${n(c.roadsFlagged)} सडक खण्ड र ${n(r.metrics.bridgesTotal)} मध्ये ${n(c.bridgesFlagged)} पुलमा बाढी वा भग्नावशेष सङ्केत छ।`,
      ),
      t(`Settlements whose modeled access changed from maintained (pre-event) to a problem status: ${changed}.`, `बाढी अघि पहुँच कायम रहेकोमध्ये मोडेल पहुँच समस्या देखिएका बस्ती: ${changed}।`),
      t(
        "These are differences between pre-event mapped data and post-event detections. The baseline waterways come from mapped (OSM-derived) geometry, not from a satellite water map of the “before” date, and none of this confirms structural damage.",
        "यी बाढी अघिको नक्सांकित तथ्याङ्क र बाढीपछिको पहिचानबीचको फरक हुन्। आधार जलमार्ग नक्सांकित (OSM-आधारित) ज्यामितिबाट आएका हुन्, “अघि” मितिको उपग्रह पानी नक्साबाट होइन; यीमध्ये कुनैले संरचनात्मक क्षति पुष्टि गर्दैन।",
      ),
    ],
  };

  /* ---------- critical connections ---------- */
  const ck = computeChokepoints(r).slice(0, 5);
  const crit: ReportSection = {
    heading: t("X. Critical road and bridge connections (structural, hypothetical)", "X. महत्त्वपूर्ण सडक र पुल सम्पर्क (संरचनात्मक, काल्पनिक)"),
    lines: [
      t(
        "Computed on the pre-event OpenStreetMap road network by hypothetically removing each connection in turn. This measures structural importance only; it is not evidence of damage, closure or flooding.",
        "बाढी अघिको OpenStreetMap सडक सञ्जालमा प्रत्येक सम्पर्क काल्पनिक रूपमा हटाएर गणना गरिएको। यसले संरचनात्मक महत्त्व मात्र मापन गर्छ; क्षति, बन्द वा बाढीको प्रमाण होइन।",
      ),
      ...(ck.length
        ? ck.map((x, i) => {
            const iso = x.isolates.map((y) => (ne ? y.nameNe : y.name)).join(", ") || "—";
            const hosp = x.hospitalLost.map((y) => (ne ? y.nameNe : y.name)).join(", ") || "—";
            const lvl = x.confidence !== null ? confLabel(x.confidence) : null;
            const ev = lvl ? `${t(IMPACT_LABEL[x.exposure], IMPACT_NE[x.exposure])} (${t("evidence", "प्रमाण")} ${t(lvl, lvl === "High" ? "उच्च" : lvl === "Medium" ? "मध्यम" : "न्यून")})` : t(IMPACT_LABEL.none, IMPACT_NE.none);
            return t(
              `${i + 1}. ${x.name} — isolates: ${iso}; hospital route lost: ${hosp}; ${x.alternatives} Flood evidence: ${ev}.`,
              `${n(i + 1)}. ${x.nameNe} — विच्छेद हुने: ${iso}; अस्पताल मार्ग गुम्ने: ${hosp}; ${x.detours.length ? "वैकल्पिक नक्सांकित मार्ग उपलब्ध।" : "वैकल्पिक नक्सांकित मार्ग छैन।"} बाढी प्रमाण: ${ev}।`,
            );
          })
        : [t("No connection was found whose loss would change settlement access.", "कुनै सम्पर्क भेटिएन जसको क्षतिले बस्तीको पहुँच परिवर्तन गर्छ।")]),
    ],
  };

  /* ---------- locations requiring verification ---------- */
  const entries = buildPriorities(r);
  const counts = taskCounts(entries.map((e) => e.id), tasks);
  const label = (s: keyof typeof VERIF_LABEL) => (ne ? VERIF_LABEL_NE[s] : VERIF_LABEL[s]);
  const focus = entries.filter((e) => e.tier <= 2).slice(0, 8);
  const verif: ReportSection = {
    heading: t("X. Locations requiring verification", "X. प्रमाणीकरण आवश्यक स्थान"),
    lines: [
      t(
        `Verification workflow (manual statuses recorded in this browser): ${VERIF_ORDER.map((s) => `${label(s)} ${counts[s]}`).join(" · ")}.`,
        `प्रमाणीकरण प्रक्रिया (यही ब्राउजरमा हातले राखिएको अवस्था): ${VERIF_ORDER.map((s) => `${label(s)} ${n(counts[s])}`).join(" · ")}।`,
      ),
      ...focus.map((e, i) => {
        const note = tasks[e.id]?.note;
        return `${n(i + 1)}. ${e.name} — ${label(statusOf(tasks, e.id))}${note ? ` — ${t("note", "टिप्पणी")}: ${note}` : ""} (${t("rule", "नियम")} ${e.rule})`;
      }),
      t(
        "Statuses describe the investigation workflow only. They are entered manually and do not confirm real-world conditions.",
        "अवस्थाले अनुसन्धान प्रक्रिया मात्र जनाउँछ। ती हातले राखिएका हुन् र वास्तविक अवस्था पुष्टि गर्दैनन्।",
      ),
    ],
  };

  const extra: ReportSection[] = [changes, crit, verif];

  /* ---------- optional, explicitly included hypothetical scenario ---------- */
  const sim = opts.sim;
  if (sim) {
    const grp = (k: "lost" | "hospital-lost" | "detour" | "unchanged" | "already") => sim.items.filter((i) => i.category === k);
    const names = (k: "lost" | "hospital-lost" | "detour" | "unchanged" | "already") => grp(k).map((i) => (ne ? i.nameNe : i.name)).join(", ") || "—";
    extra.push({
      heading: t("X. HYPOTHETICAL SCENARIO — connection-loss simulation", "X. काल्पनिक परिदृश्य — सम्पर्क क्षति सिमुलेसन"),
      lines: [
        t("This section is a what-if exercise. It does NOT describe a confirmed road failure or closure.", "यो खण्ड 'के हुन्छ' अभ्यास हो। यसले पुष्टि भएको सडक विफलता वा बन्दको वर्णन गर्दैन।"),
        t(`Connection removed: ${sim.edgeNames.join(" + ")}. Starting network: ${sim.base === "modeled" ? "current modeled network (segments with high-confidence detected water already removed)" : "pre-event network"}.`, `हटाइएको सम्पर्क: ${sim.edgeNames.join(" + ")}। सुरु सञ्जाल: ${sim.base === "modeled" ? "हालको मोडेल सञ्जाल" : "बाढी अघिको सञ्जाल"}।`),
        ...(sim.alreadyUnavailable ? [t("This connection is already modeled as impassable, so the simulation changes nothing.", "यो सम्पर्क पहिले नै मोडेलमा आवागमन अयोग्य छ, त्यसैले सिमुलेसनले केही परिवर्तन गर्दैन।")] : []),
        t(`Settlements losing every modeled route (${grp("lost").length}): ${names("lost")}.`, `सबै मोडेल मार्ग गुमाउने बस्ती (${n(grp("lost").length)}): ${names("lost")}।`),
        t(`Settlements keeping a town route but losing the hospital route (${grp("hospital-lost").length}): ${names("hospital-lost")}.`, `सहर मार्ग रहने तर अस्पताल मार्ग गुम्ने बस्ती (${n(grp("hospital-lost").length)}): ${names("hospital-lost")}।`),
        t(`Settlements rerouted via alternative mapped routes (${grp("detour").length}): ${grp("detour").map((i) => `${i.name}${i.deltaKm !== null ? ` (+${i.deltaKm} km)` : ""}`).join(", ") || "—"}.`, `वैकल्पिक नक्सांकित मार्गबाट पुग्ने बस्ती (${n(grp("detour").length)}): ${grp("detour").map((i) => `${i.nameNe}${i.deltaKm !== null ? ` (+${n(i.deltaKm)} किमी)` : ""}`).join(", ") || "—"}।`),
        t(`Unchanged: ${grp("unchanged").length}. Already without a modeled route before the scenario: ${grp("already").length}.`, `परिवर्तन नभएका: ${n(grp("unchanged").length)}। परिदृश्य अघि नै मार्ग नभएका: ${n(grp("already").length)}।`),
      ],
    });
  }

  const sections = [...base.sections.slice(0, 3), ...extra, ...base.sections.slice(3)].map((s, i) => ({ ...s, heading: s.heading.replace(/^[\dX०-९]+\.\s*/, `${n(i + 1)}. `) }));
  return {
    ...base,
    title: base.title.replace("Situation Report", "Rescue Brief").replace("परिस्थिति प्रतिवेदन", "उद्धार संक्षिप्त प्रतिवेदन"),
    sections,
  };
}
