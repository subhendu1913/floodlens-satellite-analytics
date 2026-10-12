import { CheckCircle2, CircleAlert, TriangleAlert } from "lucide-react";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";

export function ToastHost() {
  const { toast } = useApp();
  if (!toast) return null;
  const Icon = toast.tone === "ok" ? CheckCircle2 : toast.tone === "warn" ? CircleAlert : TriangleAlert;
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-16 left-1/2 z-[2500] -translate-x-1/2 px-3 lg:bottom-10">
      <div
        key={toast.id}
        className={cn(
          "pointer-events-auto flex max-w-[520px] animate-fade-in items-start gap-2 rounded-md border bg-ink-800 px-3 py-2 text-[12px] shadow-2xl shadow-black/60",
          toast.tone === "ok" ? "border-ok/40 text-slate-100" : toast.tone === "warn" ? "border-warn/50 text-warn" : "border-crit/50 text-red-300",
        )}
      >
        <Icon className={cn("mt-0.5 size-3.5 shrink-0", toast.tone === "ok" ? "text-ok" : "")} />
        <span>{toast.msg}</span>
      </div>
    </div>
  );
}
