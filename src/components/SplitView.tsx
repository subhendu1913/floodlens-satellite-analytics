import { useState, type ReactNode } from "react";
import { cn } from "../utils/cn";
import { Segmented } from "./ui";

/** List / detail on the left, map on the right (lg+). On small screens the two are switched with tabs. */
export function SplitView({ list, map, listWidth = "lg:w-[460px]", listLabel = "List" }: { list: ReactNode; map: ReactNode; listWidth?: string; listLabel?: string }) {
  const [tab, setTab] = useState<"list" | "map">("list");
  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="flex shrink-0 justify-center border-b border-line bg-ink-900 p-2 lg:hidden">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "list", label: listLabel },
            { value: "map", label: "Map" },
          ]}
        />
      </div>
      <section className={cn("min-h-0 flex-1 flex-col overflow-hidden bg-ink-900 lg:flex lg:flex-none lg:border-r lg:border-line", listWidth, tab === "list" ? "flex" : "hidden")}>{list}</section>
      <section className={cn("relative min-h-0 min-w-0 flex-1 lg:block", tab === "map" ? "block" : "hidden")}>
        <div className="absolute inset-0">{map}</div>
      </section>
    </div>
  );
}
