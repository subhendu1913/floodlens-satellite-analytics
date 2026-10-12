import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Bot, FileText, Languages, MapPin, Minus, RotateCw, Send, Sparkles, SquarePen, X } from "lucide-react";
import { answerQuestion, SUGGESTED, type AppExtra, type ConvCtx } from "../copilot/assistant";
import { askBackend, buildContext, copilotConnected, CopilotError } from "../copilot/service";
import { fmtPeriod } from "../lib/format";
import { ROUTES } from "../state/routes";
import { useApp } from "../state/store";
import type { Lang, Selection } from "../types";
import { cn } from "../utils/cn";
import { Badge, EmptyState, Segmented, btnCls } from "./ui";

interface Msg {
  id: number;
  role: "user" | "assistant" | "system" | "error";
  text?: string;
  evidence?: string[];
  show?: Selection;
  action?: { type: "report"; lang: Lang };
  source?: "demo" | "ai";
  retry?: { q: string; lang: Lang };
}

/** Plain-language failure text. Raw status codes or provider messages are never shown, anywhere. */
function friendly(code: string): string {
  const why = code === "TIMEOUT" ? "The AI service took too long to respond." : code === "NETWORK" ? "The AI service could not be reached." : code === "EMPTY" ? "The AI service returned an empty answer." : code.startsWith("HTTP_") ? "The AI service reported a problem." : "Something went wrong while contacting the AI service.";
  return `${why} Your question was not answered. The map and your analysis are unaffected.`;
}

/**
 * Right-side panel. Docked beside the page on large screens (the map resizes, keeping its position),
 * an overlay on small screens. Everything the assistant says — answers AND errors — appears only here.
 * Without a configured server-side AI proxy it is the rule-based Demo Copilot, which needs no API key.
 */
export function CopilotDrawer() {
  const { copilot, setCopilot, results, copilotSeed, generateReport, pick, go, route, selected, sim, stale, tasks } = useApp();
  const [lang, setLang] = useState<Lang>("en");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const idRef = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const lastResultsId = useRef<string | null>(null);
  const lastSeed = useRef(0);
  const ctxRef = useRef<ConvCtx>({});
  const abortRef = useRef<AbortController | null>(null);
  const msgsRef = useRef<Msg[]>([]);
  msgsRef.current = msgs;
  const staleRef = useRef(stale);
  staleRef.current = stale;
  const extraRef = useRef<AppExtra>({});
  extraRef.current = {
    selectedEdgeIds: selected?.kind === "edge" ? [selected.id] : selected?.kind === "group" ? results?.groups.find((g) => g.id === selected.id)?.edgeIds : undefined,
    simEdgeIds: sim?.edgeIds,
    tasks,
  };

  const push = useCallback((m: Omit<Msg, "id">) => setMsgs((prev) => [...prev, { ...m, id: idRef.current++ }]), []);

  useEffect(() => {
    if (!results) return;
    if (lastResultsId.current && lastResultsId.current !== results.id) {
      ctxRef.current = {};
      push({ role: "system", text: "Analysis results were updated. Answers now reflect the latest run." });
    }
    lastResultsId.current = results.id;
  }, [results, push]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy, copilot]);

  const ask = useCallback(
    async (q: string, l: Lang, o: { forceDemo?: boolean; again?: boolean } = {}) => {
      const text = q.trim();
      if (!text || !results) return;
      if (!o.again) push({ role: "user", text });
      setBusy(true);
      if (copilotConnected && !o.forceDemo) {
        const ctl = new AbortController();
        abortRef.current = ctl;
        const timer = window.setTimeout(() => ctl.abort(), 20000);
        try {
          const history = msgsRef.current.filter((m) => (m.role === "user" || m.role === "assistant") && m.text).slice(-6).map((m) => ({ role: m.role, text: m.text ?? "" }));
          const answer = await askBackend({ question: text, lang: l, history, context: buildContext(results) }, ctl.signal);
          push({ role: "assistant", source: "ai", text: answer });
        } catch (e) {
          push({ role: "error", text: friendly(e instanceof CopilotError ? e.code : "UNKNOWN"), retry: { q: text, lang: l } });
        } finally {
          window.clearTimeout(timer);
          setBusy(false);
        }
        return;
      }
      await new Promise((res) => window.setTimeout(res, 280));
      const a = answerQuestion(text, results, l, ctxRef.current, extraRef.current);
      ctxRef.current = a.ctx;
      push({
        role: "assistant",
        source: "demo",
        text: a.text,
        evidence: staleRef.current ? [...a.evidence, "Period or images changed since the last run — this answer reflects the last completed analysis"] : a.evidence,
        show: a.show,
        action: a.action,
      });
      setBusy(false);
    },
    [results, push],
  );

  useEffect(() => {
    if (copilotSeed && copilotSeed.nonce !== lastSeed.current && results) {
      lastSeed.current = copilotSeed.nonce;
      void ask(copilotSeed.q, lang);
    }
  }, [copilotSeed, results, ask, lang]);

  const showOnMap = (s: Selection) => {
    if (!ROUTES.find((r) => r.id === route)?.hasMap) go("analysis");
    pick(s);
  };

  if (copilot === "closed") return null;

  if (copilot === "min") {
    const n = msgs.filter((m) => m.role === "assistant").length;
    return (
      <div className="fixed bottom-14 right-4 z-[1500] flex animate-fade-in items-center overflow-hidden rounded-full border border-water/40 bg-white shadow-lg lg:bottom-9">
        <button onClick={() => setCopilot("open")} className="flex h-9 items-center gap-2 pl-3 pr-2 text-[12px] font-medium text-water transition hover:bg-slate-500/5" aria-label="Expand AI Copilot">
          <Sparkles className="size-3.5" />
          AI Copilot
          {n > 0 && <span className="rounded-full bg-water/15 px-1.5 font-mono text-[10px]">{n}</span>}
        </button>
        <button onClick={() => setCopilot("closed")} aria-label="Close AI Copilot" className="flex h-9 w-8 items-center justify-center border-l border-line text-slate-500 transition hover:bg-slate-500/5 hover:text-slate-100">
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  const label = copilotConnected ? "Connected AI" : "Demo Copilot";

  return (
    <aside aria-label="AI Copilot" className="fixed bottom-0 right-0 top-12 z-[1500] flex w-[min(420px,100vw)] animate-slide-in flex-col border-l border-line bg-white shadow-lg lg:static lg:z-auto lg:w-[392px] lg:shrink-0 lg:animate-none lg:shadow-none">
      <div className="navy-surface flex items-center gap-2 border-b border-navy-700 bg-navy px-3 py-2.5">
        <div className="flex size-7 items-center justify-center rounded-md bg-water text-on-navy">
          <Sparkles className="size-3.5" />
        </div>
        <div className="mr-auto leading-tight">
          <div className="text-[13px] font-semibold text-on-navy">FloodLens AI Copilot</div>
          <div className="text-[10px] text-on-navy-muted">{copilotConnected ? "Connected AI · uses the computed results as context" : "Demo Copilot · rule-based, answers only from computed results"}</div>
        </div>
        <Segmented
          size="sm"
          value={lang}
          onChange={setLang}
          options={[
            { value: "en", label: "EN", title: "English" },
            { value: "ne", label: "नेपाली", title: "Nepali" },
          ]}
        />
        <button
          onClick={() => {
            if (msgs.length && !window.confirm("Start a new conversation? The current one will be cleared.")) return;
            abortRef.current?.abort();
            setMsgs([]);
            setBusy(false);
            ctxRef.current = {};
          }}
          title="New conversation"
          aria-label="New conversation"
          className="rounded p-1.5 text-on-navy-muted transition hover:bg-navy-800 hover:text-on-navy"
        >
          <SquarePen className="size-3.5" />
        </button>
        <button onClick={() => setCopilot("min")} title="Minimize" aria-label="Minimize AI Copilot" className="rounded p-1.5 text-on-navy-muted transition hover:bg-navy-800 hover:text-on-navy">
          <Minus className="size-4" />
        </button>
        <button onClick={() => setCopilot("closed")} aria-label="Close AI Copilot" className="rounded p-1.5 text-on-navy-muted transition hover:bg-navy-800 hover:text-on-navy">
          <X className="size-4" />
        </button>
      </div>

      {!results ? (
        <EmptyState icon={<Bot className="size-5" />} title="No analysis results to reason over" className="flex-1">
          Run an analysis for an area covered by the demo dataset. The Copilot never answers from anything other than the structured results.
        </EmptyState>
      ) : (
        <>
          <div className="border-b border-line bg-ink-850 px-3 py-1.5 text-[10.5px] leading-snug text-slate-500">
            Using: <span className="font-medium text-slate-300">{results.params.locationName}</span> · {fmtPeriod(results.params.fromDate, results.params.toDate)}
            {stale && <span className="ml-1 font-medium text-warn">· period or images changed since this run</span>}
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
            <div className="rounded-lg border border-line bg-ink-850 p-3 text-[11.5px] leading-relaxed text-slate-300">
              {copilotConnected ? (
                <p>
                  Answers come from a <span className="font-medium text-slate-100">connected AI service</span> that receives a summary of the computed analysis results. It can make mistakes — check anything important against the map and the Evidence Inspector.
                </p>
              ) : (
                <p>
                  This is the <span className="font-medium text-slate-100">Demo Copilot — rule-based, not a connected language model</span>. It needs no API key and answers from the same structured analysis results shown on every page, states when information is unavailable, and never invents casualties, populations, damage or road closures. What-ifs are always labelled hypothetical.
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="warn">DEMO DATA</Badge>
                <Badge tone={copilotConnected ? "ok" : "info"}>{label}</Badge>
              </div>
            </div>

            {msgs.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[88%] rounded-lg rounded-br-sm bg-water px-3 py-2 text-[12px] text-on-navy">{m.text}</div>
                </div>
              ) : m.role === "system" ? (
                <div key={m.id} className="text-center text-[10.5px] text-slate-500">
                  — {m.text} —
                </div>
              ) : m.role === "error" ? (
                <div key={m.id} role="alert" className="animate-fade-in rounded-lg border border-crit/30 bg-crit/5 px-3 py-2.5 text-[12px] text-slate-200">
                  <div className="flex gap-2">
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-crit" />
                    <p className="leading-snug">{m.text}</p>
                  </div>
                  {m.retry && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button disabled={busy} onClick={() => void ask(m.retry!.q, m.retry!.lang, { again: true })} className={cn(btnCls.base, btnCls.outline, btnCls.sm)}>
                        <RotateCw className="size-3" /> Retry
                      </button>
                      <button disabled={busy} onClick={() => void ask(m.retry!.q, m.retry!.lang, { again: true, forceDemo: true })} className={cn(btnCls.base, btnCls.soft, btnCls.sm)}>
                        Answer with Demo Copilot
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div key={m.id} className="animate-fade-in">
                  <div className="rounded-lg rounded-tl-sm border border-line bg-ink-850 px-3 py-2.5 text-[12px] leading-relaxed text-slate-200">
                    <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-slate-500">{m.source === "ai" ? "Connected AI" : "Demo Copilot · rule-based"}</div>
                    <div className="space-y-1.5">
                      {m.text!.split("\n").map((l, i) => (
                        <p key={i} className={cn(l.startsWith("•") || /^(\d+|[०-९]+)\./.test(l) ? "pl-3 -indent-3" : "", l.startsWith("–") && "pl-3 text-[11px] text-slate-400", l.startsWith("HYPOTHETICAL") || l.startsWith("काल्पनिक") ? "font-semibold text-slate-100" : "")}>
                          {l}
                        </p>
                      ))}
                    </div>
                    {(m.show || m.action) && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {m.show && (
                          <button onClick={() => showOnMap(m.show!)} className={cn(btnCls.base, btnCls.outline, btnCls.sm)}>
                            <MapPin className="size-3" /> Show on map
                          </button>
                        )}
                        {m.action && (
                          <button
                            onClick={() => {
                              generateReport(m.action!.lang);
                              setCopilot("min");
                            }}
                            className={cn(btnCls.base, btnCls.soft, btnCls.sm)}
                          >
                            <FileText className="size-3" /> Generate &amp; open Rescue Brief ({m.action.lang === "en" ? "English" : "नेपाली"})
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {m.evidence && m.evidence.length > 0 && (
                    <div className="mt-1 px-1 text-[10px] leading-snug text-slate-500">
                      <span className="font-semibold uppercase tracking-wider text-slate-500">Evidence · </span>
                      {m.evidence.join(" | ")}
                    </div>
                  )}
                </div>
              ),
            )}
            {busy && (
              <div className="flex items-center gap-1 px-2 text-slate-500" aria-label="The Copilot is answering">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1.5 animate-bounce rounded-full bg-slate-500" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-line bg-white p-3">
            <div className="mb-2 flex max-h-[96px] flex-wrap gap-1.5 overflow-y-auto">
              {SUGGESTED[lang].map((q) => (
                <button key={q} disabled={busy} onClick={() => void ask(q, lang)} className="rounded-full border border-line bg-white px-2.5 py-1 text-left text-[11px] text-slate-300 transition hover:border-water hover:text-water disabled:opacity-50">
                  {q}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                value={input}
                disabled={busy}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && input.trim()) {
                    void ask(input, lang);
                    setInput("");
                  }
                }}
                placeholder={lang === "en" ? "Ask a follow-up, e.g. “Why?” or “What if BR1 is lost?”" : "थप प्रश्न सोध्नुहोस्…"}
                className="h-9 min-w-0 flex-1 rounded-md border border-line bg-white px-3 text-[12.5px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-water focus:ring-2 focus:ring-water/20"
                aria-label="Ask the AI Copilot"
              />
              <button
                onClick={() => {
                  void ask(input, lang);
                  setInput("");
                }}
                disabled={busy || !input.trim()}
                aria-label="Send"
                className="flex size-9 items-center justify-center rounded-md bg-water text-on-navy transition hover:bg-cyan-300 disabled:opacity-40"
              >
                <Send className="size-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => generateReport(lang)} className={cn(btnCls.base, btnCls.primary, btnCls.sm, "flex-1")}>
                <FileText className="size-3" /> Generate Rescue Brief ({lang === "en" ? "English" : "नेपाली"})
              </button>
              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                <Languages className="size-3" /> follows EN / नेपाली
              </span>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
