import { MapWorkspace } from "../components/MapWorkspace";
import { PageHeader } from "../components/PageHeader";
import { SplitView } from "../components/SplitView";
import { TABS } from "../state/routes";
import { useApp } from "../state/store";
import { AltRoutesTab } from "./impact/AltRoutesTab";
import { CriticalTab } from "./impact/CriticalTab";
import { DownstreamTab } from "./impact/DownstreamTab";
import { InfraTab } from "./impact/InfraTab";
import { SettlementsTab } from "./impact/SettlementsTab";
import { SimulatorTab } from "./impact/SimulatorTab";

const WIDTH: Record<string, string> = {
  infra: "lg:w-[min(820px,60%)]",
  settlements: "lg:w-[440px]",
  critical: "lg:w-[480px]",
  simulator: "lg:w-[470px]",
  alternatives: "lg:w-[460px]",
  downstream: "lg:w-[430px]",
};

/**
 * Impact & Access: related tools live as tabs inside one workspace, sharing ONE persistent map
 * (the map element never changes between tabs, so position and selection are preserved).
 */
export function ImpactAccessPage() {
  const { tab } = useApp();
  const cur = tab ?? "infra";
  const body =
    cur === "settlements" ? <SettlementsTab /> : cur === "critical" ? <CriticalTab /> : cur === "simulator" ? <SimulatorTab /> : cur === "alternatives" ? <AltRoutesTab /> : cur === "downstream" ? <DownstreamTab /> : <InfraTab />;
  const label = TABS.impact?.find((t) => t.id === cur)?.label ?? "List";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Impact & Access" desc="What may be affected, who may be cut off, and what-if tools — all on one map" tabbed />
      <div className="min-h-0 flex-1">
        <SplitView list={body} map={<MapWorkspace variant="compact" hideInspectorFor={cur === "settlements" ? ["settlement"] : []} />} listWidth={WIDTH[cur]} listLabel={label} />
      </div>
    </div>
  );
}
