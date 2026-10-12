import { useEffect, useRef, useState } from "react";
import { Building2, Cable, Crosshair, Globe, Home, Loader2, MapPin, Search, X } from "lucide-react";
import { coordHit, localSearch, parseCoords, searchOnline, type HitKind, type SearchHit } from "../lib/search";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";

const ICON: Record<HitKind, typeof Home> = { settlement: Home, service: Building2, asset: Cable, area: MapPin, coords: Crosshair, online: Globe };

type Online = { state: "idle" | "loading" | "error" | "done"; hits: SearchHit[]; msg?: string };

/**
 * Location search for settlements, towns, bridges and coordinates.
 * `variant="navy"` sits on the dark top bar; `variant="light"` on white content (dashboard).
 * Only one instance should own the "/" focus shortcut.
 */
export function GlobalSearch({ variant = "navy", shortcut = true }: { variant?: "navy" | "light"; shortcut?: boolean }) {
  const { results, goToHit, pin, clearPin } = useApp();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [online, setOnline] = useState<Online>({ state: "idle", hits: [] });
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const navy = variant === "navy";

  const coords = parseCoords(q);
  const base: SearchHit[] = [...(coords ? [coordHit(coords)] : []), ...(q.trim() ? localSearch(q, !!results) : [])];
  const items = [...base, ...online.hits];
  const canOnline = q.trim().length >= 3 && !coords;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (shortcut && e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(t.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [shortcut]);

  const choose = (h: SearchHit) => {
    goToHit(h);
    setQ(h.label);
    setOpen(false);
    inputRef.current?.blur();
  };

  const searchWeb = async () => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    const timer = setTimeout(() => ctl.abort(), 6000);
    setOnline({ state: "loading", hits: [] });
    try {
      const hits = await searchOnline(q.trim(), ctl.signal);
      setOnline({ state: "done", hits, msg: hits.length ? undefined : `No online places found for “${q.trim()}”.` });
    } catch {
      setOnline({ state: "error", hits: [], msg: "Online place search is unavailable (offline or blocked). Use a settlement name or coordinates." });
    } finally {
      clearTimeout(timer);
    }
  };

  return (
    <div ref={boxRef} className={cn("relative w-full", navy ? "max-w-[520px]" : "max-w-[560px]")}>
      <Search className={cn("pointer-events-none absolute left-3 size-3.5", navy ? "top-[9px] text-on-navy-muted" : "top-[13px] text-slate-500")} />
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={`global-search-list-${variant}`}
        aria-label="Search settlements, towns or coordinates"
        value={q}
        placeholder="Search settlement, town or coordinates (e.g. 27.93, 85.13)"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOnline({ state: "idle", hits: [] });
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            if (items[active]) choose(items[active]);
            else if (canOnline) searchWeb();
          } else if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        className={cn(
          "w-full rounded-md border pl-8 pr-14 text-[12.5px] outline-none transition",
          navy
            ? "h-8 border-navy-700 bg-navy-800 text-on-navy placeholder:text-on-navy-muted/70 focus:border-brand-soft focus:ring-1 focus:ring-brand-soft/40"
            : "h-10 border-line bg-white text-slate-100 placeholder:text-slate-600 focus:border-water focus:ring-2 focus:ring-water/20",
        )}
      />
      {(q || pin) && (
        <button
          onClick={() => {
            setQ("");
            clearPin();
            setOnline({ state: "idle", hits: [] });
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className={cn("absolute rounded p-1", navy ? "right-8 top-1.5 text-on-navy-muted hover:bg-navy-700 hover:text-on-navy" : "right-9 top-2.5 text-slate-500 hover:bg-slate-500/10 hover:text-slate-100")}
        >
          <X className="size-3.5" />
        </button>
      )}
      {shortcut && <kbd className={cn("pointer-events-none absolute hidden rounded border px-1.5 font-mono text-[10px] sm:block", navy ? "right-2 top-[7px] border-navy-700 text-on-navy-muted" : "right-2 top-[11px] border-line text-slate-500")}>/</kbd>}

      {open && q.trim() && (
        <div id={`global-search-list-${variant}`} role="listbox" className="absolute left-0 right-0 top-full z-[1800] mt-1 animate-fade-in overflow-hidden rounded-lg border border-line bg-white shadow-lg">
          {items.length === 0 && online.state !== "loading" && <p className="px-3 py-2.5 text-[11.5px] text-slate-400">No matches in the analysis area. Try a settlement name (e.g. “Mankha”), a bridge (“BR1”) or coordinates such as “27.93, 85.13”.</p>}
          {items.map((h, i) => {
            const Icon = ICON[h.kind];
            return (
              <button key={h.id} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => choose(h)} className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left", i === active ? "bg-slate-500/10" : "")}>
                <Icon className={cn("size-3.5 shrink-0", h.outside ? "text-warn" : "text-slate-400")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-slate-100">{h.label}</span>
                  <span className={cn("block truncate text-[10.5px]", h.outside ? "text-warn" : "text-slate-500")}>{h.sub}</span>
                </span>
                <span className="font-mono text-[10px] text-slate-500">
                  {h.lat.toFixed(3)}, {h.lon.toFixed(3)}
                </span>
              </button>
            );
          })}
          {canOnline && (
            <div className="border-t border-line">
              <button onClick={searchWeb} disabled={online.state === "loading"} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11.5px] text-slate-300 transition hover:bg-slate-500/10 disabled:opacity-60">
                {online.state === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : <Globe className="size-3.5 text-slate-500" />}
                Search OpenStreetMap online for “{q.trim()}”
              </button>
              {online.msg && <p className={cn("px-3 pb-2 text-[11px]", online.state === "error" ? "text-warn" : "text-slate-500")}>{online.msg}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
