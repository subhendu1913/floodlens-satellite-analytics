import type { ReactNode } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { ROUTES, TABS } from "../state/routes";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";

/** Page title, breadcrumb, consistent Back button and (optionally) the tool tabs of a workspace. */
export function PageHeader({ title, desc, actions, tabbed = false }: { title: string; desc?: string; actions?: ReactNode; tabbed?: boolean }) {
  const { route, tab, go, back } = useApp();
  const tabs = TABS[route];
  const cur = tabs?.find((t) => t.id === tab);
  const label = ROUTES.find((r) => r.id === route)?.label ?? title;
  return (
    <header className="shrink-0 border-b border-line bg-white px-4 pt-2">
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        {route !== "overview" && (
          <button onClick={back} className="inline-flex h-6 items-center gap-1 rounded border border-line px-1.5 text-slate-300 transition hover:border-slate-500 hover:text-slate-100" aria-label="Go back">
            <ArrowLeft className="size-3" /> Back
          </button>
        )}
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 truncate">
          <button onClick={() => go("overview")} className="hover:text-water hover:underline">
            Overview
          </button>
          {route !== "overview" && (
            <>
              <ChevronRight className="size-3 shrink-0" />
              <span className={cn(cur ? "" : "font-medium text-slate-200")}>{label}</span>
            </>
          )}
          {cur && (
            <>
              <ChevronRight className="size-3 shrink-0" />
              <span className="font-medium text-slate-200">{cur.label}</span>
            </>
          )}
        </nav>
        {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
      </div>
      <div className="mt-1 flex items-baseline gap-3">
        <h1 className="text-[15px] font-semibold text-slate-100">{title}</h1>
        {desc && <p className="hidden min-w-0 truncate text-[11.5px] text-slate-500 md:block">{desc}</p>}
      </div>
      {tabbed && tabs && (
        <div role="tablist" aria-label={`${label} tools`} className="-mb-px mt-1.5 flex gap-0.5 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === tab}
              title={t.hint}
              onClick={() => go(route, t.id)}
              className={cn("h-8 shrink-0 border-b-2 px-3 text-[12px] font-medium transition", t.id === tab ? "border-water text-water" : "border-transparent text-slate-400 hover:text-slate-100")}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {(!tabbed || !tabs) && <div className="h-2" />}
    </header>
  );
}
