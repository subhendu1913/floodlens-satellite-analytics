import { ATTRIBUTIONS } from "../data/attributions";

export function Footer({ onProvenance }: { onProvenance: () => void }) {
  return (
    <footer className="navy-surface hidden shrink-0 items-start gap-3 border-t border-navy-700 bg-navy px-3 py-1 text-on-navy-muted lg:flex">
      <p className="flex-1 text-[9.5px] leading-[1.35]">
        <span className="font-semibold text-on-navy">FloodLens</span> · {ATTRIBUTIONS.join(" ")}
      </p>
      <button onClick={onProvenance} className="shrink-0 whitespace-nowrap text-[10px] font-medium text-brand-soft transition hover:text-on-navy">
        Data sources ›
      </button>
    </footer>
  );
}
