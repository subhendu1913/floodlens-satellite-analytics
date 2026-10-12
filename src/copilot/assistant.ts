import { computeChokepoints } from "../analysis/chokepoints";
import { VERIF_LABEL, VERIF_ORDER, taskCounts, statusOf, type TaskMap } from "../state/tasks";
import { explainSettlement, hasAlternativeRoute } from "../analysis/explain";
import { TIER_LABEL, buildPriorities } from "../analysis/priorities";
import { simulateLoss } from "../analysis/simulate";
import { HOSPITAL_LABEL, HOSPITAL_NE, IMPACT_LABEL } from "../lib/format";
import type { AnalysisResults, Lang, Selection } from "../types";
import { Ctx, answerCore, assetLine, evidenceShort, impactedGroups, settlementLine, sorted, type Answer } from "./report";

/** Conversation memory: what the previous answer was about, so follow-ups resolve ("Why?", "Are there alternatives?"). */
export interface ConvCtx {
  settlementId?: string;
  groupId?: string;
  /** Entity was taken from the top of a list answer rather than named by the user. */
  viaList?: boolean;
  /** Edge ids of the last hypothetical scenario discussed. */
  simEdgeIds?: string[];
}
/** Live application state the Copilot may use (current map selection and simulator). */
export interface AppExtra {
  selectedEdgeIds?: string[];
  simEdgeIds?: string[];
  /** Manual verification statuses (local to this browser), keyed by priority-entry id. */
  tasks?: TaskMap;
}
export interface Reply extends Answer {
  ctx: ConvCtx;
  show?: Selection;
  action?: { type: "report"; lang: Lang };
}

export const SUGGESTED: Record<Lang, string[]> = {
  en: [
    "Where was flooding detected?",
    "Which settlements may be disconnected?",
    "Which roads or bridges require investigation?",
    "Which bridges are important connections?",
    "What happens if this road becomes unavailable?",
    "Are alternative mapped routes available?",
    "What changes occurred during the selected date range?",
    "Which locations need verification?",
    "Generate a Rescue Brief in English.",
    "Generate a Rescue Brief in Nepali.",
  ],
  ne: [
    "बाढी कहाँ पत्ता लागेको छ?",
    "कुन बस्तीहरू विच्छेद भएका हुन सक्छन्?",
    "कुन पुलहरू महत्त्वपूर्ण सम्पर्क हुन्?",
    "यो सडक उपलब्ध नभए के हुन्छ?",
    "वैकल्पिक नक्सांकित मार्ग उपलब्ध छन्?",
    "कुन स्थानहरू निरीक्षण गर्नुपर्छ?",
    "अंग्रेजीमा क्षेत्र संक्षिप्त विवरण तयार गर्नुहोस्।",
    "नेपालीमा क्षेत्र संक्षिप्त विवरण तयार गर्नुहोस्।",
  ],
};

const TIER_NE = { 1: "पहिले निरीक्षण", 2: "त्यसपछि निरीक्षण", 3: "सम्भव हुँदा प्रमाणित गर्ने" } as const;
const IMPACT_NE = { blocked: "डुबानका कारण सम्भवतः आवागमन अयोग्य (मोडेल)", suspected: "सम्भावित अवरोध", none: "कुनै सङ्केत छैन" } as const;

function findEntity(question: string, r: AnalysisResults): ConvCtx | null {
  const q = question.toLowerCase();
  const s = r.settlements.find((x) => q.includes(x.name.toLowerCase()) || question.includes(x.nameNe));
  if (s) return { settlementId: s.id };
  const m = question.match(/\b(BR\d|R\d{2})\b/i);
  if (m) {
    const id = m[1].toUpperCase();
    const g = r.groups.find((x) => x.id === id) ?? r.groups.find((x) => x.edgeIds.includes(id));
    if (g) return { groupId: g.id };
  }
  return null;
}

const showOf = (c: ConvCtx): Selection | undefined => (c.settlementId ? { kind: "settlement", id: c.settlementId } : c.groupId ? { kind: "group", id: c.groupId } : undefined);

const EXPLAIN = /why|explain|reason|how come|किन|कसरी|कारण/i;
const FOLLOW = /^(why|explain|what about|what else|tell me more|more detail|and )|\b(it|its|there|them|this one|that one|this settlement|that settlement)\b|किन|कसरी|त्यो|यसको|त्यहाँ|कारण/i;
const NOT_FOLLOW = /reliab|limit|casualt|population|report|brief|summar|सारांश|प्रतिवेदन|संक्षिप्त/i;
const SIM_Q = /what (happens|would happen|if)|(becomes?|is|goes?|were|are)\s+(un)?available|unavailable|simulat|if .*(closed|fails?|washed|removed|lost|cut)|के हुन्छ|उपलब्ध नभए|सिमुलेसन/i;
const ALT_Q = /alternativ|detour|re-?rout|other route|वैकल्पिक/i;

export function answerQuestion(question: string, r: AnalysisResults, lang: Lang, prev: ConvCtx = {}, extra: AppExtra = {}): Reply {
  const c = new Ctx(r, lang);
  const q = question.toLowerCase();
  const m = r.metrics;
  const ev = evidenceShort(c);
  const reply = (lines: string[], ctx: ConvCtx | null, more: Partial<Reply> = {}): Reply => ({
    text: lines.join("\n"),
    evidence: ev,
    ctx: ctx ?? prev,
    show: ctx ? showOf(ctx) : undefined,
    ...more,
  });
  const confText = (v: number | null) => (v === null ? c.t("not applicable", "लागू हुँदैन") : c.conf(v));
  const nm = (i: { name: string; nameNe: string }) => (lang === "ne" ? i.nameNe : i.name);
  const list = (l: { name: string; nameNe: string }[]) => (l.length ? l.map(nm).join(", ") : "—");

  // 1 — Nepali summary
  if (/nepali|नेपाली/i.test(question) && /summar|सारांश/i.test(question)) {
    const a = answerCore("summarize the highest-priority affected areas", r, "ne");
    return { ...a, ctx: prev, text: `नेपालीमा सारांश (डेमो डेटा, नियम-आधारित सहायक):\n${a.text}` };
  }

  // 2 — area brief / report hand-off
  if (/(generate|create|prepare|draft|write|make)[^.?]*(report|brief)|area brief|situation report/i.test(q) || /प्रतिवेदन|संक्षिप्त विवरण/.test(question)) {
    const rl: Lang = /nepali|नेपाली/i.test(question) ? "ne" : /english|अंग्रेजी/i.test(question) ? "en" : /[\u0900-\u097F]/.test(question) ? "ne" : lang;
    return reply(
      [
        c.t("Ready to generate a Rescue Brief from the current structured results. It is not yet saved or published.", "हालका संरचित नतिजाबाट क्षेत्र संक्षिप्त विवरण तयार गर्न तयार। अझै सुरक्षित वा प्रकाशित गरिएको छैन।"),
        c.t(
          `Preview: ${m.settlementsDisconnected} modeled disconnected and ${m.settlementsSuspected} access-uncertain settlements; ${m.bridgesBlocked + m.bridgesSuspected} of ${m.bridgesTotal} bridges flagged; ${m.waterKm2.toFixed(2)} km² detected water (demo data).`,
          `पूर्वावलोकन: ${c.n(m.settlementsDisconnected)} बस्ती मोडेल अनुसार विच्छेद र ${c.n(m.settlementsSuspected)} को पहुँच अनिश्चित; ${c.n(m.bridgesTotal)} मध्ये ${c.n(m.bridgesBlocked + m.bridgesSuspected)} पुल चिह्नित; ${c.n(m.waterKm2.toFixed(2))} वर्ग किमी पानी (डेमो डेटा)।`,
        ),
        c.t("Open it in Reports to review, edit, save as draft, publish, print or export.", "समीक्षा, सम्पादन, ड्राफ्ट सुरक्षित, प्रकाशन, प्रिन्ट वा निर्यात गर्न प्रतिवेदन खण्डमा खोल्नुहोस्।"),
      ],
      null,
      { action: { type: "report", lang: rl } },
    );
  }

  const ent = findEntity(question, r);

  // 2b — what changed during the selected date range
  if (/what (has )?changed|changes? (occurred|during|in the|over|between)|date range|selected period|during the (selected )?period|since the (flood|event)/i.test(q) || /परिवर्तन|अवधि/.test(question)) {
    const ch = r.changes;
    const a = r.acquisitions;
    const imgs = [
      r.effectiveSensor !== "S2" && a.s1Pre && a.s1Post ? `Sentinel-1 ${c.date(a.s1Pre.date)} → ${c.date(a.s1Post.date)}` : null,
      r.effectiveSensor !== "S1" && a.s2Pre && a.s2Post ? `Sentinel-2 ${c.date(a.s2Pre.date)} → ${c.date(a.s2Post.date)}` : null,
    ]
      .filter(Boolean)
      .join("; ");
    const moved = ch.settlementsChanged.map((s) => `${nm(s)} (${s.to === "disconnected" ? c.t("modeled disconnected", "मोडेल अनुसार विच्छेद") : c.t("access uncertain", "पहुँच अनिश्चित")})`).join(", ");
    return reply(
      [
        c.t(`Selected period ${c.date(ch.fromDate)} – ${c.date(ch.toDate)} (flood event ${c.date(ch.eventDate)}). Images actually compared: ${imgs || "none available"}.`, `छानिएको अवधि ${c.date(ch.fromDate)} – ${c.date(ch.toDate)} (बाढी ${c.date(ch.eventDate)})। वास्तविक तुलना गरिएका तस्बिर: ${imgs || "उपलब्ध छैन"}।`),
        c.t(
          `• Floodwater: ${ch.detectedWaterKm2.toFixed(2)} km² detected versus ${ch.baselineWaterKm2.toFixed(2)} km² of pre-event mapped waterways in the same reaches (≈ +${ch.addedWaterKm2.toFixed(2)} km²); ${ch.uncertainKm2.toFixed(2)} km² uncertain; ${ch.debrisKm2.toFixed(2)} km² suspected debris.`,
          `• बाढीको पानी: ${c.n(ch.detectedWaterKm2.toFixed(2))} वर्ग किमी पत्ता लागेको, सोही खण्डमा बाढी अघि नक्सांकित जलमार्ग ${c.n(ch.baselineWaterKm2.toFixed(2))} वर्ग किमी (≈ +${c.n(ch.addedWaterKm2.toFixed(2))}); ${c.n(ch.uncertainKm2.toFixed(2))} अनिश्चित; ${c.n(ch.debrisKm2.toFixed(2))} शंकास्पद भग्नावशेष।`,
        ),
        c.t(
          `• Potentially affected: ${ch.buildingsExposed} buildings, ${ch.roadsFlagged} road segments, ${ch.bridgesFlagged} of ${m.bridgesTotal} bridges carry a flood or debris indicator.`,
          `• सम्भावित प्रभावित: ${c.n(ch.buildingsExposed)} भवन, ${c.n(ch.roadsFlagged)} सडक खण्ड, ${c.n(m.bridgesTotal)} मध्ये ${c.n(ch.bridgesFlagged)} पुलमा सङ्केत।`,
        ),
        c.t(`• Settlements whose modeled access changed from maintained to a problem: ${moved || "none"}.`, `• मोडेल पहुँच कायमबाट समस्यामा परिवर्तन भएका बस्ती: ${moved || "कोही छैन"}।`),
        c.t(
          "These are differences between pre-event mapped data and post-event detections, not a pixel-by-pixel record, and they do not confirm damage. Satellites image an area only on discrete dates — nothing is inferred between them.",
          "यी बाढी अघिको नक्सांकित तथ्याङ्क र बाढीपछिको पहिचानबीचको फरक हुन्, क्षति पुष्टि होइन। उपग्रहले निश्चित मितिमा मात्र तस्बिर लिन्छ — बीचका मितिबारे अनुमान गरिएको छैन।",
        ),
      ],
      null,
    );
  }

  // 2c — verification workflow
  if (/verif|under review|needs? checking/i.test(q) || /प्रमाणीकरण|प्रमाणित/.test(question)) {
    const entries = buildPriorities(r);
    const tasks = extra.tasks ?? {};
    const counts = taskCounts(entries.map((e) => e.id), tasks);
    const open = entries.filter((e) => statusOf(tasks, e.id) === "needs" && e.tier <= 2).slice(0, 5);
    return reply(
      [
        c.t(`Verification workflow (manual statuses saved in this browser): ${VERIF_ORDER.map((s) => `${VERIF_LABEL[s]} ${counts[s]}`).join(" · ")}.`, `प्रमाणीकरण प्रक्रिया (यही ब्राउजरमा हातले राखिएको): ${VERIF_ORDER.map((s) => `${VERIF_LABEL[s]} ${c.n(counts[s])}`).join(" · ")}।`),
        ...(open.length ? [c.t("Still needing verification (highest tiers):", "अझै प्रमाणीकरण आवश्यक (उच्च तह):"), ...open.map((e, i) => `${c.n(i + 1)}. ${e.name} — ${e.impact}`)] : [c.t("No tier-1 or tier-2 item is waiting for verification.", "पहिलो वा दोस्रो तहको कुनै वस्तु प्रमाणीकरणको प्रतीक्षामा छैन।")]),
        c.t("Statuses are manual workflow entries; they do not confirm real-world conditions. Update them in Rescue Priorities → Verification Tasks.", "अवस्था हातले राखिएको प्रक्रिया हो; वास्तविक अवस्था पुष्टि गर्दैन। 'उद्धार प्राथमिकता → प्रमाणीकरण कार्य' मा अद्यावधिक गर्नुहोस्।"),
      ],
      open[0]?.selection.kind === "settlement" ? { settlementId: open[0].selection.id, viaList: true } : open[0]?.selection.kind === "group" ? { groupId: open[0].selection.id, viaList: true } : null,
    );
  }

  // 2d — roads or bridges that require investigation
  if (/road/i.test(q) && /bridge/i.test(q) && /investigat|inspect|require|verif/i.test(q)) {
    const gs = impactedGroups(r).slice(0, 8);
    const tasks = extra.tasks ?? {};
    return reply(
      gs.length
        ? [
            c.t(`${gs.length} road / bridge connection(s) are flagged for investigation, in rule order:`, `${c.n(gs.length)} सडक/पुल सम्पर्क निरीक्षणका लागि चिह्नित (नियम क्रममा):`),
            ...gs.map((g, i) => `${assetLine(c, g, i + 1)} [${VERIF_LABEL[statusOf(tasks, `P-${g.id}`)]}]`),
            c.t("Imagery cannot show structural condition: flagged means inundated approaches or nearby debris indicators, not damage.", "तस्बिरले संरचनात्मक अवस्था देखाउन सक्दैन: चिह्नित भनेको पहुँच मार्ग डुबान वा नजिक भग्नावशेष सङ्केत हो, क्षति होइन।"),
          ]
        : [c.t("No road or bridge is flagged in the current results.", "हालको नतिजामा कुनै सडक वा पुल चिह्नित छैन।")],
      gs[0] ? { groupId: gs[0].id, viaList: true } : null,
    );
  }

  // 3 — what-if: loss of a connection (HYPOTHETICAL)
  if (SIM_Q.test(question) && !/(population|casualt)/i.test(q)) {
    let ids: string[] | null = null;
    if (ent?.groupId) ids = r.groups.find((g) => g.id === ent.groupId)!.edgeIds;
    else if (extra.selectedEdgeIds?.length) ids = extra.selectedEdgeIds;
    else if (extra.simEdgeIds?.length) ids = extra.simEdgeIds;
    else if (prev.simEdgeIds?.length) ids = prev.simEdgeIds;
    if (!ids) {
      return reply([
        c.t(
          "I don't know which connection you mean. Click a road or bridge on the map (or choose one in Impact & Access → What-If Simulator) and ask again, or name it, e.g. “What happens if BR1 becomes unavailable?”.",
          "तपाईंले कुन सम्पर्क भन्न खोज्नुभएको हो मलाई थाहा छैन। नक्सामा सडक वा पुल छान्नुहोस् (वा पहुँच सिमुलेटर प्रयोग गर्नुहोस्) र फेरि सोध्नुहोस्, वा नाम लेख्नुहोस्, जस्तै “BR1 उपलब्ध नभए के हुन्छ?”।",
        ),
      ], null);
    }
    const sim = simulateLoss(r, ids, "modeled");
    const g = (k: "lost" | "hospital-lost" | "detour" | "unchanged" | "already") => sim.items.filter((i) => i.category === k);
    return reply(
      [
        c.t(`HYPOTHETICAL SCENARIO — not a confirmed event. If ${sim.edgeNames.join(" + ")} became unavailable (starting from the current modeled network):`, `काल्पनिक परिदृश्य — पुष्टि भएको घटना होइन। ${sim.edgeNames.join(" + ")} उपलब्ध नभए (हालको मोडेल सञ्जालबाट सुरु गर्दा):`),
        ...(sim.alreadyUnavailable ? [c.t("This connection is already modeled as impassable, so nothing changes.", "यो सम्पर्क पहिले नै मोडेलमा आवागमन अयोग्य छ, त्यसैले केही परिवर्तन हुँदैन।")] : []),
        c.t(`• Lose every modeled route (${g("lost").length}): ${list(g("lost"))}`, `• सबै मोडेल मार्ग गुमाउने (${c.n(g("lost").length)}): ${list(g("lost"))}`),
        c.t(`• Keep a town route but lose the hospital route (${g("hospital-lost").length}): ${list(g("hospital-lost"))}`, `• सहर मार्ग रहने तर अस्पताल मार्ग गुम्ने (${c.n(g("hospital-lost").length)}): ${list(g("hospital-lost"))}`),
        c.t(`• Rerouted via an alternative mapped route (${g("detour").length}): ${g("detour").length ? g("detour").map((i) => `${i.name}${i.deltaKm !== null ? ` (+${i.deltaKm} km)` : ""}`).join(", ") : "—"}`, `• वैकल्पिक नक्सांकित मार्गबाट पुग्ने (${c.n(g("detour").length)}): ${g("detour").length ? g("detour").map((i) => `${i.nameNe}${i.deltaKm !== null ? ` (+${c.n(i.deltaKm)} किमी)` : ""}`).join(", ") : "—"}`),
        c.t(`• Unaffected: ${g("unchanged").length}; already without a modeled route: ${g("already").length}.`, `• प्रभावित नहुने: ${c.n(g("unchanged").length)}; पहिले नै मार्ग नभएका: ${c.n(g("already").length)}।`),
        c.t("Use Impact & Access → What-If Simulator to see this on the map. Modeled on pre-event OSM roads; real conditions are unverified.", "नक्सामा हेर्न 'प्रभाव र पहुँच → पहुँच सिमुलेटर' प्रयोग गर्नुहोस्। बाढी अघिको OSM सडकमा आधारित; वास्तविक अवस्था प्रमाणित छैन।"),
      ],
      { ...prev, simEdgeIds: ids, groupId: r.roads.find((e) => e.id === ids![0])?.groupId },
    );
  }

  // 4 — critical connections / chokepoints
  if (/chokepoint|critical (connection|road|bridge|link)|important (connection|bridge|road)|key (bridge|road)/i.test(q) || /महत्त्वपूर्ण|मुख्य सम्पर्क/.test(question)) {
    const all = computeChokepoints(r);
    const bridgesOnly = /bridge|पुल/i.test(question);
    const cks = (bridgesOnly ? all.filter((x) => x.kind === "bridge") : all).slice(0, 5);
    return reply(
      cks.length
        ? [
            c.t("Critical connections (structural, hypothetical — computed on the pre-event road network by removing each connection in turn):", "महत्त्वपूर्ण सम्पर्क (संरचनात्मक, काल्पनिक — बाढी अघिको सडक सञ्जालमा प्रत्येक सम्पर्क हटाएर गणना):"),
            ...cks.map((k, i) =>
              c.t(
                `${i + 1}. ${k.name} — would isolate: ${list(k.isolates)}; hospital route lost: ${list(k.hospitalLost)}; ${k.alternatives} Flood evidence: ${IMPACT_LABEL[k.exposure]}${k.confidence !== null ? ` (${c.conf(k.confidence)})` : ""}.`,
                `${c.n(i + 1)}. ${k.nameNe} — विच्छेद हुने: ${list(k.isolates)}; अस्पताल मार्ग गुम्ने: ${list(k.hospitalLost)}; ${k.detours.length ? "वैकल्पिक नक्सांकित मार्ग उपलब्ध।" : "वैकल्पिक नक्सांकित मार्ग छैन।"} बाढी प्रमाण: ${IMPACT_NE[k.exposure]}।`,
              ),
            ),
            c.t("Importance is structural. It does not mean any of these connections is damaged or closed.", "महत्त्व संरचनात्मक हो। यसको अर्थ यी सम्पर्क क्षतिग्रस्त वा बन्द छन् भन्ने होइन।"),
          ]
        : [c.t("No critical connection was found in the modeled network.", "मोडेल गरिएको सञ्जालमा कुनै महत्त्वपूर्ण सम्पर्क भेटिएन।")],
      cks[0] ? { groupId: cks[0].id, viaList: true } : null,
    );
  }

  // 5 — alternative mapped routes (general)
  if (ALT_Q.test(question) && !ent && !(prev.settlementId || prev.groupId || prev.simEdgeIds)) {
    const alts = r.settlements.filter(hasAlternativeRoute);
    const all = computeChokepoints(r);
    const none = all.filter((k) => k.isolates.length && !k.detours.length).length;
    return reply([
      c.t(`In the current modeled network, ${alts.length} settlement(s) use a route that differs from their pre-event route${alts.length ? `: ${alts.map((s) => `${s.name} (${s.post!.km} km${s.post!.viaUncertain ? ", via uncertain segment" : ""})`).join(", ")}` : ""}.`, `हालको मोडेल सञ्जालमा ${c.n(alts.length)} बस्तीले बाढी अघिको भन्दा फरक मार्ग प्रयोग गर्छन्${alts.length ? `: ${alts.map((s) => c.sName(s)).join(", ")}` : ""}।`),
      c.t(`${none} of ${all.length} critical connections have no alternative mapped route for the settlements that depend on them.`, `${c.n(all.length)} मध्ये ${c.n(none)} महत्त्वपूर्ण सम्पर्कमा निर्भर बस्तीका लागि वैकल्पिक नक्सांकित मार्ग छैन।`),
      c.t("Select a settlement to draw its best-case route, or use the What-If Simulator or Alternative Routes tool to test a specific connection. Unmapped tracks are not modeled.", "बस्ती छानेर उत्तम मार्ग हेर्नुहोस्, वा खास सम्पर्क जाँच्न पहुँच सिमुलेटर प्रयोग गर्नुहोस्। नक्सा नबनेका बाटो मोडेल गरिएका छैनन्।"),
    ], null);
  }

  // 6 — explicitly named settlement / asset
  if (ent) {
    if (EXPLAIN.test(question)) {
      if (ent.settlementId) {
        const s = r.settlements.find((x) => x.id === ent.settlementId)!;
        return reply([`${c.sName(s)} — ${c.access(s)}`, ...explainSettlement(s, r, lang).map((l) => `• ${l}`)], ent);
      }
      const g = r.groups.find((x) => x.id === ent.groupId)!;
      return reply([assetLine(c, g), ...g.reasons.map((x) => `– ${x}`)], ent);
    }
    const a = answerCore(question, r, lang);
    return { ...a, ctx: ent, show: showOf(ent) };
  }

  // 7 — follow-up on the previous topic
  if ((prev.settlementId || prev.groupId || prev.simEdgeIds) && (FOLLOW.test(question) || ALT_Q.test(question)) && !NOT_FOLLOW.test(question)) {
    if (prev.simEdgeIds && ALT_Q.test(question)) {
      const sim = simulateLoss(r, prev.simEdgeIds, "modeled");
      const d = sim.items.filter((i) => i.category === "detour");
      return reply(
        d.length
          ? [c.t(`Hypothetical alternatives if ${sim.edgeNames.join(" + ")} became unavailable:`, `${sim.edgeNames.join(" + ")} उपलब्ध नभए काल्पनिक विकल्प:`), ...d.map((i) => c.t(`• ${i.name}: rerouted${i.deltaKm !== null ? `, +${i.deltaKm} km` : ""} (${i.after ? `${i.after.km} km to ${i.after.service}` : "hospital route changes"})`, `• ${i.nameNe}: मार्ग परिवर्तन${i.deltaKm !== null ? `, +${c.n(i.deltaKm)} किमी` : ""}`)), c.t("Settlements that would lose every route have no alternative in the mapped network.", "सबै मार्ग गुमाउने बस्तीका लागि नक्सांकित सञ्जालमा विकल्प छैन।")]
          : [c.t("No settlement would be rerouted in this scenario; the affected ones would have no alternative mapped route.", "यस परिदृश्यमा कुनै बस्ती पुनःमार्ग हुँदैन; प्रभावितहरूका लागि नक्सांकित विकल्प छैन।")],
        null,
      );
    }
    const lead = prev.viaList ? [c.t("Taking the first item of my previous answer:", "मेरो अघिल्लो उत्तरको पहिलो वस्तुका बारेमा:")] : [];
    if (prev.settlementId) {
      const s = r.settlements.find((x) => x.id === prev.settlementId)!;
      if (/hospital|अस्पताल/i.test(question)) {
        return reply(
          [
            ...lead,
            c.t(
              `${s.name}: hospital access is "${HOSPITAL_LABEL[s.hospital.status]}"${s.hospital.postKm ? ` (${s.hospital.postKm} km best case)` : ""}; pre-event baseline ${s.hospital.baselineKm ?? "unavailable"} km.`,
              `${c.sName(s)}: अस्पताल पहुँच "${HOSPITAL_NE[s.hospital.status]}"${s.hospital.postKm ? ` (उत्तम अवस्थामा ${c.n(s.hospital.postKm)} किमी)` : ""}; बाढी अघि ${s.hospital.baselineKm !== null ? c.n(s.hospital.baselineKm) : "उपलब्ध छैन"} किमी।`,
            ),
            ...(s.hospitalDisrupted.length ? [c.t(`Flagged on the hospital route: ${s.hospitalDisrupted.map((d) => d.name).join("; ")}.`, `अस्पताल मार्गमा चिह्नित: ${s.hospitalDisrupted.map((d) => d.name).join("; ")}।`)] : []),
          ],
          { settlementId: s.id },
        );
      }
      if (ALT_Q.test(question) || /route|मार्ग/i.test(question)) {
        return reply(
          [
            ...lead,
            hasAlternativeRoute(s)
              ? c.t(`${s.name}: alternative mapped route ${s.post!.service}, ${s.post!.km} km${s.post!.viaUncertain ? " (through uncertain segments)" : ""}. It is drawn on the map when the settlement is selected.`, `${c.sName(s)}: वैकल्पिक नक्सांकित मार्ग ${c.svc(s.post!.service)}, ${c.n(s.post!.km)} किमी${s.post!.viaUncertain ? " (अनिश्चित खण्ड हुँदै)" : ""}।`)
              : c.t(`${s.name}: no distinct alternative mapped route is available in the OSM network${s.status === "connected" ? " (the pre-event route is unaffected)" : ""}.`, `${c.sName(s)}: OSM सञ्जालमा फरक वैकल्पिक नक्सांकित मार्ग उपलब्ध छैन।`),
          ],
          { settlementId: s.id },
        );
      }
      if (EXPLAIN.test(question)) return reply([...lead, `${c.sName(s)} — ${c.access(s)}`, ...explainSettlement(s, r, lang).map((l) => `• ${l}`)], { settlementId: s.id });
      return reply([...lead, settlementLine(c, s), ...explainSettlement(s, r, lang).slice(0, 1).map((l) => `• ${l}`)], { settlementId: s.id });
    }
    if (prev.groupId) {
      const g = r.groups.find((x) => x.id === prev.groupId)!;
      const dep = g.dependents.map((id) => r.settlements.find((s) => s.id === id)!.name);
      const k = computeChokepoints(r).find((x) => x.id === g.id);
      return reply(
        [
          ...lead,
          assetLine(c, g),
          ...g.reasons.map((x) => `– ${x}`),
          c.t(dep.length ? `Non-connected settlements relying on it: ${dep.join(", ")}.` : "No non-connected settlement depends on it in the modeled network.", dep.length ? `यसमा निर्भर विच्छेद/अनिश्चित बस्ती: ${dep.join(", ")}।` : "मोडेल गरिएको सञ्जालमा कुनै विच्छेद बस्ती यसमा निर्भर छैन।"),
          ...(k ? [c.t(`Structural role (hypothetical): ${k.why} ${k.alternatives}`, `संरचनात्मक भूमिका (काल्पनिक): विच्छेद हुने बस्ती — ${list(k.isolates)}।`)] : []),
        ],
        { groupId: g.id },
      );
    }
  }

  // 8 — flood location
  if ((/where|locat|which (area|reach|part)/i.test(q) && /flood|water|inundat/i.test(q)) || /detected water|flooded areas?|flood extent/i.test(q) || (/कहाँ/.test(question) && /बाढी|पानी/.test(question))) {
    const cores = r.flood.filter((f) => f.part === "core" && f.kind === "water").sort((a, b) => b.areaKm2 - a.areaKm2).slice(0, 6);
    const exposed = r.settlements.filter((s) => s.buildings.likely > 0).sort((a, b) => b.buildings.likely - a.buildings.likely).slice(0, 4);
    return reply(
      [
        c.t(`Detected water (high confidence): ${m.waterKm2.toFixed(2)} km², plus ${m.uncertainKm2.toFixed(2)} km² uncertain, along ${new Set(cores.map((f) => f.waterway)).size} waterway(s). Area is calculated from the mapped polygons (demo data).`, `पत्ता लागेको पानी (उच्च विश्वसनीयता): ${c.n(m.waterKm2.toFixed(2))} वर्ग किमी, थप ${c.n(m.uncertainKm2.toFixed(2))} वर्ग किमी अनिश्चित (डेमो डेटा)।`),
        ...cores.map((f) => c.t(`• ${f.waterway} (${f.reachId}): ${f.areaKm2.toFixed(2)} km², evidence ${c.conf(f.confidence)}`, `• ${f.waterway} (${f.reachId}): ${c.n(f.areaKm2.toFixed(2))} वर्ग किमी, प्रमाण ${c.conf(f.confidence)}`)),
        c.t(
          r.debris.length ? `Suspected debris indicators: ${r.debris.length} zone(s), ${m.debrisKm2.toFixed(2)} km² suspected — ${r.debris.map((d) => `${d.id} (${c.conf(d.confidence)})`).join(", ")}. Indicators only, not confirmed.` : "No debris indicator exceeded the reporting threshold.",
          r.debris.length ? `शंकास्पद भग्नावशेष सङ्केत: ${c.n(r.debris.length)} क्षेत्र — ${r.debris.map((d) => d.id).join(", ")}। पुष्टि भएको छैन।` : "कुनै भग्नावशेष सङ्केत सीमाभन्दा माथि छैन।",
        ),
        ...(exposed.length ? [c.t(`Settlements with buildings inside detected water: ${exposed.map((s) => `${s.name} (${s.buildings.likely})`).join(", ")}.`, `पत्ता लागेको पानीभित्र भवन भएका बस्ती: ${exposed.map((s) => `${c.sName(s)} (${c.n(s.buildings.likely)})`).join(", ")}।`)] : []),
        ...(r.gaps.length ? [c.t(`Data gap: ${r.gaps[0].reason}`, "डेटा अन्तर: बादल/छायाले ढाकेको क्षेत्रमा अप्टिकल प्रमाण उपलब्ध छैन।")] : []),
      ],
      null,
    );
  }

  // 9 — bridges only
  if (/bridge|पुल/i.test(question) && !/road|सडक|बाटो/i.test(question)) {
    const bridges = impactedGroups(r).filter((g) => g.kind === "bridge");
    const top = bridges[0];
    return reply(
      bridges.length
        ? [
            c.t(`${bridges.length} of ${m.bridgesTotal} bridge crossings are flagged for inspection (ordered by the transparent priority rules):`, `${c.n(m.bridgesTotal)} मध्ये ${c.n(bridges.length)} पुल क्रसिङ निरीक्षणका लागि चिह्नित (पारदर्शी प्राथमिकता नियम अनुसार क्रम):`),
            ...bridges.map((g, i) => assetLine(c, g, i + 1)),
            c.t("Imagery cannot show a bridge's structural condition; flagged means inundated approaches or nearby debris indicators.", "तस्बिरले पुलको संरचनात्मक अवस्था देखाउन सक्दैन; चिह्नित भनेको पहुँच मार्ग डुबान वा नजिक भग्नावशेष सङ्केत हो।"),
          ]
        : [c.t("No bridge is flagged in the current results.", "हालको नतिजामा कुनै पुल चिह्नित छैन।")],
      top ? { groupId: top.id, viaList: true } : null,
    );
  }

  // 10 — roads only
  if (/road|highway|सडक|बाटो/i.test(question) && !/bridge|पुल/i.test(question) && !/inspect|निरीक्षण/i.test(question)) {
    const roads = r.roads
      .filter((e) => !e.isBridge && e.impact.state !== "none")
      .sort((a, b) => (a.impact.state === "blocked" ? 0 : 1) - (b.impact.state === "blocked" ? 0 : 1) || b.impact.confidence - a.impact.confidence)
      .slice(0, 8);
    return reply(
      roads.length
        ? [
            c.t(`${m.roadSegmentsBlocked} road segment(s) likely impassable (modeled) and ${m.roadSegmentsSuspected} with possible disruption; ${m.roadKmInundated} km of mapped road under detected water. Top items:`, `${c.n(m.roadSegmentsBlocked)} सडक खण्ड सम्भवतः आवागमन अयोग्य (मोडेल) र ${c.n(m.roadSegmentsSuspected)} मा सम्भावित अवरोध; ${c.n(m.roadKmInundated)} किमी नक्सांकित सडक पानीमुनि। मुख्य वस्तु:`),
            ...roads.map((e) => `• ${e.name} — ${lang === "ne" ? IMPACT_NE[e.impact.state] : IMPACT_LABEL[e.impact.state]}; ${c.t(`≈${Math.round(e.impact.waterM)} m under detected water`, `≈${c.n(Math.round(e.impact.waterM))} मि. पानीमुनि`)}; ${c.t("evidence", "प्रमाण")} ${c.conf(e.impact.confidence)}`),
            c.t("These are modeled from pre-event OSM roads and detected water; none is a confirmed closure.", "यी बाढी अघिको OSM सडक र पत्ता लागेको पानीबाट मोडेल गरिएका हुन्; कुनै पनि पुष्टि भएको बन्द होइन।"),
          ]
        : [c.t("No road segment is flagged in the current results.", "हालको नतिजामा कुनै सडक खण्ड चिह्नित छैन।")],
      roads[0] ? { groupId: roads[0].groupId, viaList: true } : null,
    );
  }

  // 11 — priorities / locations requiring investigation
  if ((/priorit|investigat|require/i.test(q) && !/summar/i.test(q)) || /उच्च प्राथमिकताका स्थान|निरीक्षण गर्नुपर्छ/.test(question)) {
    const top6 = buildPriorities(r).slice(0, 6);
    const top = top6[0];
    return reply(
      [
        c.t(`Top ${top6.length} locations by the published rules (tier, then dependents, then evidence):`, `प्रकाशित नियम अनुसार शीर्ष ${c.n(top6.length)} स्थान (तह, निर्भर बस्ती, प्रमाण क्रममा):`),
        ...top6.map((p, i) => `${c.n(i + 1)}. ${p.name} — ${lang === "ne" ? TIER_NE[p.tier] : TIER_LABEL[p.tier]}; ${p.impact}; ${c.t("rule", "नियम")} ${p.rule}; ${c.t("evidence", "प्रमाण")} ${confText(p.confidence)}`),
        c.t("Priorities indicate where to investigate next, not confirmed emergencies. See Rescue Priorities for evidence and rules.", "प्राथमिकताले अर्को निरीक्षण कहाँ गर्ने भन्ने देखाउँछ, पुष्टि भएको आपत्कालीन अवस्था होइन।"),
      ],
      top?.selection.kind === "settlement" ? { settlementId: top.selection.id, viaList: true } : top?.selection.kind === "group" ? { groupId: top.selection.id, viaList: true } : null,
    );
  }

  // 12 — everything else: core intents, with conversation memory taken from list answers
  const a = answerCore(question, r, lang);
  let ctx = prev;
  if (/cut|isolat|disconnect|settlement|village|access|stranded/i.test(q) || /विच्छेद|बस्ती|गाउँ|पहुँच/.test(question)) {
    const first = sorted(r).find((s) => s.status !== "connected");
    if (first) ctx = { settlementId: first.id, viaList: true };
  } else if (/bridge|road|inspect|crossing/i.test(q) || /सडक|पुल|निरीक्षण/.test(question)) {
    const first = impactedGroups(r)[0];
    if (first) ctx = { groupId: first.id, viaList: true };
  }
  return { ...a, ctx, show: ctx !== prev ? showOf(ctx) : undefined };
}
