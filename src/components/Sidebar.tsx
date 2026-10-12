import { Database, FileText, Home, LayoutDashboard, ListChecks, Network, PanelLeftClose, PanelLeftOpen, Waves, type LucideIcon } from "lucide-react";
import { buildPriorities } from "../analysis/priorities";
import { ROUTES, type Route } from "../state/routes";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";

const ICONS: Record<Route, LucideIcon> = {
  overview: LayoutDashboard,
  analysis: Waves,
  impact: Network,
  priorities: ListChecks,
  reports: FileText,
  data: Database,
};

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }: Props) {
  const { route, go, goHome, results, reports } = useApp();
  const m = results?.metrics;
  const counts: Partial<Record<Route, { n: string; hint: string }>> = {
    impact: m ? { n: String(m.settlementsDisconnected + m.settlementsSuspected), hint: "settlements with modeled access problems" } : undefined,
    priorities: results ? { n: String(buildPriorities(results).filter((p) => p.tier === 1).length), hint: "locations in the first investigation tier" } : undefined,
    reports: reports.length ? { n: String(reports.length), hint: "saved reports" } : undefined,
  };

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 top-12 z-[1590] bg-navy/50 lg:hidden" onClick={onCloseMobile} />}
      <aside
        aria-label="FloodLens navigation"
        className={cn(
          "navy-surface fixed bottom-0 left-0 top-12 z-[1600] flex w-[236px] shrink-0 -translate-x-full flex-col border-r border-navy-700 bg-navy transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 lg:transition-[width]",
          collapsed ? "lg:w-[52px]" : "lg:w-[208px]",
          mobileOpen && "translate-x-0",
        )}
      >
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          <div className={cn("px-2.5 pb-1 pt-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-on-navy-muted/70", collapsed && "lg:hidden")}>Dashboard</div>
          {ROUTES.map((r) => {
            const Icon = ICONS[r.id];
            const on = route === r.id;
            const c = counts[r.id];
            return (
              <button
                key={r.id}
                onClick={() => {
                  go(r.id);
                  onCloseMobile();
                }}
                title={`${r.label} — ${r.desc}`}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "group flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[12.5px] font-medium transition",
                  on ? "bg-water text-on-navy" : "text-on-navy-muted hover:bg-navy-800 hover:text-on-navy",
                  collapsed && "lg:justify-center lg:px-0",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className={cn("flex-1 truncate", collapsed && "lg:hidden")}>{r.label}</span>
                {c && (
                  <span title={c.hint} className={cn("rounded px-1.5 font-mono text-[10px] text-on-navy", on ? "bg-white/20" : "bg-navy-700", collapsed && "lg:hidden")}>
                    {c.n}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-2 pb-2">
          <button
            onClick={() => {
              onCloseMobile();
              goHome();
            }}
            title="Back to the public FloodLens landing page (Sign In, Create Account, Continue as Demo). Your analysis and reports are kept."
            className={cn("flex h-9 w-full items-center gap-2.5 rounded-md border border-white/20 px-2.5 text-[12.5px] font-medium text-on-navy transition hover:bg-navy-800", collapsed && "lg:justify-center lg:px-0")}
          >
            <Home className="size-4 shrink-0" />
            <span className={cn("flex-1 truncate text-left", collapsed && "lg:hidden")}>Back to Home</span>
          </button>
        </div>
        <div className={cn("border-t border-navy-700 p-2", collapsed && "lg:hidden")}>
          <div className="rounded-md border border-white/15 bg-navy-800 px-2.5 py-2 text-[10.5px] leading-snug text-on-navy-muted">
            <span className="font-bold uppercase tracking-wide text-warn-soft">Demo mode</span> · FloodLens shows labelled sample data, not live satellite processing.
          </div>
        </div>
        <button
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden h-9 items-center gap-2 border-t border-navy-700 px-4 text-[11.5px] text-on-navy-muted transition hover:bg-navy-800 hover:text-on-navy lg:flex"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          <span className={cn(collapsed && "hidden")}>Collapse</span>
        </button>
      </aside>
    </>
  );
}
