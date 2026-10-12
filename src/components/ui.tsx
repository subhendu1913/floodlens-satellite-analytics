import type { ReactNode } from "react";
import { cn } from "../utils/cn";
import type { Tone } from "../lib/format";

const toneClasses: Record<Tone, string> = {
  water: "bg-water/10 text-water border-water/25",
  flood: "bg-flood/10 text-flood border-flood/30",
  warn: "bg-warn/10 text-warn border-warn/35",
  crit: "bg-crit/10 text-crit border-crit/30",
  ok: "bg-ok/10 text-ok border-ok/30",
  info: "bg-water/10 text-water border-water/25",
  neutral: "bg-slate-500/10 text-slate-400 border-slate-500/25",
};

export const toneText: Record<Tone, string> = {
  water: "text-water",
  flood: "text-flood",
  warn: "text-warn",
  crit: "text-crit",
  ok: "text-ok",
  info: "text-water",
  neutral: "text-slate-400",
};

export const toneDot: Record<Tone, string> = {
  water: "bg-water",
  flood: "bg-flood",
  warn: "bg-warn",
  crit: "bg-crit",
  ok: "bg-ok",
  info: "bg-water",
  neutral: "bg-slate-500",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-px text-[10.5px] font-medium leading-4", toneClasses[tone], className)}>
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", className }: { tone?: Tone; className?: string }) {
  return <span className={cn("inline-block size-1.5 shrink-0 rounded-full", toneDot[tone], className)} />;
}

export function SectionTitle({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2 flex items-center justify-between", className)}>
      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">{children}</h3>
      {right}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[11px] font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10.5px] leading-snug text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "h-8 w-full rounded-md border border-line bg-white px-2.5 text-[12.5px] text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-water focus:ring-2 focus:ring-water/20 disabled:opacity-50";

/** Secondary (outline) and primary (brand) button class helpers shared by every page. */
export const btnCls = {
  base: "inline-flex items-center justify-center gap-1.5 rounded-md text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
  primary: "h-8 bg-water px-3 font-semibold text-[#ffffff] hover:bg-cyan-300",
  outline: "h-8 border border-line bg-white px-3 text-slate-200 hover:border-slate-500",
  soft: "h-8 border border-water/30 bg-water/10 px-3 text-water hover:bg-water/15",
  sm: "!h-7 !px-2.5 !text-[11.5px]",
};

export function Toggle({
  checked,
  onChange,
  label,
  swatch,
  count,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  swatch?: ReactNode;
  count?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("group flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11.5px] transition hover:bg-slate-500/10 disabled:opacity-40", checked ? "text-slate-200" : "text-slate-500")}
    >
      <span className={cn("relative h-3.5 w-6 shrink-0 rounded-full transition", checked ? "bg-water" : "bg-ink-600")}>
        <span className={cn("absolute top-0.5 size-2.5 rounded-full bg-[#ffffff] transition-all", checked ? "left-3" : "left-0.5")} />
      </span>
      {swatch}
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && <span className="font-mono text-[10.5px] text-slate-500">{count}</span>}
    </button>
  );
}

export function ConfidenceBar({ value, tone }: { value: number; tone?: Tone }) {
  const t: Tone = tone ?? (value >= 0.75 ? "ok" : value >= 0.5 ? "warn" : "crit");
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1 w-12 overflow-hidden rounded-full bg-ink-700">
        <span className={cn("block h-full rounded-full", toneDot[t])} style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="font-mono text-[10.5px] text-slate-400">{Math.round(value * 100)}%</span>
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-md border border-line bg-white p-0.5", className)} role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-2.5 font-medium transition",
            size === "sm" ? "h-5 text-[10.5px]" : "h-6 text-[11.5px]",
            value === o.value ? "bg-water text-[#ffffff]" : "text-slate-400 hover:bg-slate-500/10 hover:text-slate-200",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn("h-6 rounded-full border px-2.5 text-[11px] font-medium transition", active ? "border-water bg-water/10 text-water" : "border-line bg-white text-slate-400 hover:border-slate-500 hover:text-slate-200")}
    >
      {children}
    </button>
  );
}

export function EmptyState({ icon, title, children, className }: { icon: ReactNode; title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}>
      <div className="flex size-10 items-center justify-center rounded-full border border-line bg-ink-850 text-slate-500">{icon}</div>
      <p className="text-[12.5px] font-medium text-slate-200">{title}</p>
      {children && <div className="max-w-[300px] text-[11.5px] leading-relaxed text-slate-500">{children}</div>}
    </div>
  );
}

/** Banner used for HYPOTHETICAL / DEMO / terrain-estimate labels. */
export function Notice({ tone = "warn", title, children, icon }: { tone?: Tone; title?: string; children: ReactNode; icon?: ReactNode }) {
  const box: Record<Tone, string> = {
    water: "border-water/30 bg-water/5",
    flood: "border-flood/30 bg-flood/5",
    warn: "border-warn/40 bg-warn/5",
    crit: "border-crit/40 bg-crit/5",
    ok: "border-ok/30 bg-ok/5",
    info: "border-water/25 bg-water/5",
    neutral: "border-line bg-ink-850",
  };
  return (
    <div className={cn("flex gap-2 rounded-md border p-2.5 text-[11.5px] leading-snug text-slate-300", box[tone])}>
      {icon && <span className={cn("mt-0.5 shrink-0", toneText[tone])}>{icon}</span>}
      <div className="min-w-0">
        {title && <div className={cn("mb-0.5 font-semibold", toneText[tone])}>{title}</div>}
        {children}
      </div>
    </div>
  );
}
