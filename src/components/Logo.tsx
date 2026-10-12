import { cn } from "../utils/cn";

/**
 * FloodLens identity: a royal-blue tile holding a lens (ring) with a water line, plus a small
 * satellite point on its orbit — satellite intelligence over water. Used everywhere the brand appears.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="FloodLens logo" className={cn("shrink-0", className)}>
      <rect width="32" height="32" rx="7" fill="#2563EB" />
      <circle cx="15" cy="17" r="8" fill="none" stroke="#FFFFFF" strokeWidth="2" />
      <path d="M9.5 17.5c1.4-1.6 2.8-1.6 4.2 0s2.8 1.6 4.2 0 2.8-1.6 3.6-.4" fill="none" stroke="#FFFFFF" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M21.2 10.4 23.7 8.2" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
      <circle cx="25" cy="7.4" r="2.3" fill="#FFFFFF" />
    </svg>
  );
}

/** The exact product name — always "FloodLens". `tone` is the surface it sits on. */
export function Wordmark({ tone = "navy", className }: { tone?: "navy" | "light"; className?: string }) {
  return (
    <span className={cn("font-semibold tracking-tight", className)}>
      <span className={tone === "navy" ? "text-on-navy" : "text-navy"}>Flood</span>
      <span className={tone === "navy" ? "text-brand-soft" : "text-water"}>Lens</span>
    </span>
  );
}

export function Logo({ tone = "navy", size = 28, textClass = "text-[15px]", tagline = false, className }: { tone?: "navy" | "light"; size?: number; textClass?: string; tagline?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      <span className="flex flex-col leading-none">
        <Wordmark tone={tone} className={textClass} />
        {tagline && <span className={cn("mt-1 text-[9px] font-medium uppercase tracking-[0.16em]", tone === "navy" ? "text-on-navy-muted" : "text-slate-500")}>Satellite flood intelligence</span>}
      </span>
    </span>
  );
}
