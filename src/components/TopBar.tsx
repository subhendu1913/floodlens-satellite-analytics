import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays, CheckCircle2, CircleDashed, Home, Loader2, LogOut, MapPin, Menu, Sparkles, TriangleAlert, UserRound } from "lucide-react";
import { fmtPeriod } from "../lib/format";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";
import { GlobalSearch } from "./GlobalSearch";
import { Logo } from "./Logo";

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const { params, status, results, stale, copilot, setCopilot, session, signOut, goHome } = useApp();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener("mousedown", on);
    return () => window.removeEventListener("mousedown", on);
  }, []);

  const proc: { label: string; short: string; icon: ReactNode } =
    status === "running"
      ? { label: "Processing…", short: "Processing", icon: <Loader2 className="size-3 animate-spin text-brand-soft" /> }
      : status === "error"
        ? { label: "Processing failed", short: "Failed", icon: <TriangleAlert className="size-3 text-crit-soft" /> }
        : results
          ? stale
            ? { label: "Period or images changed — re-run", short: "Re-run needed", icon: <CircleDashed className="size-3 text-warn-soft" /> }
            : { label: "Demo analysis loaded", short: "Demo analysis", icon: <CheckCircle2 className="size-3 text-ok-soft" /> }
          : { label: "No analysis", short: "No analysis", icon: <CircleDashed className="size-3 text-on-navy-muted" /> };

  const initial = session.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <header className="navy-surface flex h-12 shrink-0 items-center gap-2.5 border-b border-navy-700 bg-navy px-3 text-on-navy">
      <button onClick={onMenu} aria-label="Open navigation" className="rounded p-1.5 text-on-navy-muted hover:bg-navy-800 hover:text-on-navy lg:hidden">
        <Menu className="size-4" />
      </button>
      <button onClick={goHome} className="flex items-center rounded" title="FloodLens home — the public landing page (your analysis is kept)" aria-label="FloodLens — back to the home page">
        <Logo tone="navy" size={28} className="[&>span:last-child]:hidden sm:[&>span:last-child]:flex" />
      </button>

      <div className="mx-1 hidden h-6 w-px bg-navy-700 md:block" />
      <div className="min-w-0 flex-1">
        <GlobalSearch variant="navy" />
      </div>

      <div className="hidden items-center gap-3 text-[12px] text-on-navy-muted xl:flex" title="Current analysis location, flood event date and analysis period">
        <span className="flex max-w-[190px] items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate font-medium text-on-navy">{params.locationName}</span>
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <CalendarDays className="size-3.5" />
          <span className="font-medium text-on-navy">{fmtPeriod(params.fromDate, params.toDate).replace(/ 2026/g, "")}</span>
        </span>
      </div>
      <span title={proc.label} className="hidden items-center gap-1.5 whitespace-nowrap rounded border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] font-medium text-on-navy lg:inline-flex">
        {proc.icon}
        <span className="hidden 2xl:inline">{proc.label}</span>
        <span className="2xl:hidden">{proc.short}</span>
      </span>

      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-warn bg-warn px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-navy" title="Results come from clearly labelled sample data, not live satellite processing.">
        Demo mode
      </span>

      <button
        onClick={() => setCopilot(copilot === "open" ? "min" : "open")}
        aria-pressed={copilot === "open"}
        className={cn("inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[12px] font-medium text-on-navy transition", copilot === "open" ? "border-water bg-water" : "border-white/25 bg-white/10 hover:bg-white/20")}
      >
        <Sparkles className="size-3.5" />
        <span className="hidden sm:inline">AI Copilot</span>
      </button>

      <div ref={ref} className="relative">
        <button onClick={() => setMenu(!menu)} aria-label="Account menu" aria-expanded={menu} className="flex size-8 items-center justify-center rounded-full border border-navy-700 bg-navy-800 text-[12px] font-semibold text-on-navy transition hover:border-brand-soft">
          {initial}
        </button>
        {menu && (
          <div className="absolute right-0 top-full z-[1800] mt-1.5 w-[280px] animate-fade-in overflow-hidden rounded-lg border border-line bg-white shadow-lg">
            <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
              <span className="flex size-8 items-center justify-center rounded-full bg-ink-700 text-slate-300">
                <UserRound className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-medium text-slate-100">{session.name}</div>
                <div className="truncate text-[10.5px] text-slate-500">{session.kind === "demo" ? "Demo session" : `Local profile${session.email ? ` · ${session.email}` : ""}`}</div>
              </div>
            </div>
            <p className="border-b border-line px-3 py-2 text-[10.5px] leading-snug text-slate-500">Not authenticated. No account server is connected; this label lives only in this browser tab.</p>
            <button
              onClick={() => {
                setMenu(false);
                goHome();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-slate-300 transition hover:bg-slate-500/10 hover:text-slate-100"
            >
              <Home className="size-3.5" /> FloodLens home (landing page)
            </button>
            <button
              onClick={() => {
                setMenu(false);
                signOut();
              }}
              className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-[12px] text-slate-300 transition hover:bg-slate-500/10 hover:text-slate-100"
            >
              <LogOut className="size-3.5" /> End session
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
