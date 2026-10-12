import { PageHeader } from "../components/PageHeader";
import { useApp } from "../state/store";
import { DataSourcesPage } from "./DataSourcesPage";
import { SatelliteDataPage } from "./SatelliteDataPage";
import { ValidationPage } from "./ValidationPage";

/** Validation & Data: case-study validation, satellite observations, and sources / limitations as tabs. */
export function DataPage() {
  const { tab } = useApp();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Validation & Data" desc="How results are checked, what data went in, and what is still unknown" tabbed />
      <div className="min-h-0 flex-1">{tab === "satellite" ? <SatelliteDataPage /> : tab === "sources" ? <DataSourcesPage /> : <ValidationPage />}</div>
    </div>
  );
}
