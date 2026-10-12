import { FileText } from "lucide-react";
import { MapWorkspace } from "../components/MapWorkspace";
import { PageHeader } from "../components/PageHeader";
import { SplitView } from "../components/SplitView";
import { btnCls } from "../components/ui";
import { TABS } from "../state/routes";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";
import { LocationsTab } from "./rescue/LocationsTab";
import { RisksTab } from "./rescue/RisksTab";
import { TasksTab } from "./rescue/TasksTab";

const WIDTH: Record<string, string> = { locations: "lg:w-[500px]", risks: "lg:w-[460px]", tasks: "lg:w-[500px]" };

/** Rescue Action Center (sidebar: Rescue Priorities): three connected sections sharing one persistent map. */
export function PrioritiesPage() {
  const { tab, results, generateReport } = useApp();
  const cur = tab ?? "locations";
  const body = cur === "risks" ? <RisksTab /> : cur === "tasks" ? <TasksTab /> : <LocationsTab />;
  const label = TABS.priorities?.find((t) => t.id === cur)?.label ?? "List";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Rescue Action Center"
        desc="What to investigate first — priority locations, access risks and verification tasks"
        tabbed
        actions={
          <button disabled={!results} onClick={() => generateReport("en")} className={cn(btnCls.base, btnCls.primary, btnCls.sm)}>
            <FileText className="size-3" /> Generate Rescue Brief
          </button>
        }
      />
      <div className="min-h-0 flex-1">
        <SplitView list={body} map={<MapWorkspace variant="compact" />} listWidth={WIDTH[cur]} listLabel={label} />
      </div>
    </div>
  );
}
