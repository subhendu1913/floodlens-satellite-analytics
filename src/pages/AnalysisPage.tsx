import { useState } from "react";
import { FileText } from "lucide-react";
import { AnalyzePanel } from "../components/AnalyzePanel";
import { MapWorkspace } from "../components/MapWorkspace";
import { PageHeader } from "../components/PageHeader";
import { Segmented, btnCls } from "../components/ui";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";

/** Flood Analysis: location, event date and period on the left; the before / after comparison map on the right. */
export function AnalysisPage() {
  const { results, generateReport } = useApp();
  const [tab, setTab] = useState<"workflow" | "map">("map");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Flood Analysis"
        desc="Choose location, event date and a From–To period, compare before / after imagery, run change analysis"
        actions={
          <button disabled={!results} onClick={() => generateReport("en")} className={cn(btnCls.base, btnCls.primary, btnCls.sm)}>
            <FileText className="size-3" /> Generate Rescue Brief
          </button>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex shrink-0 justify-center border-b border-line bg-white p-2 lg:hidden">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "workflow", label: "Period & images" },
              { value: "map", label: "Map" },
            ]}
          />
        </div>
        <aside className={cn("min-h-0 flex-1 border-line bg-white lg:block lg:w-[328px] lg:flex-none lg:border-r", tab === "workflow" ? "block" : "hidden")}>
          <AnalyzePanel />
        </aside>
        <section className={cn("relative min-h-0 min-w-0 flex-1 lg:block", tab === "map" ? "block" : "hidden")}>
          <div className="absolute inset-0">
            <MapWorkspace variant="full" />
          </div>
        </section>
      </div>
    </div>
  );
}
