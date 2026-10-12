import type { SimResult } from "../analysis/simulate";
import type { Report, ReportSection } from "../copilot/report";
import { digits } from "../lib/format";
import { buildSnapshotSvg } from "../lib/snapshot";
import type { TaskMap } from "../state/tasks";
import type { AnalysisResults, Lang } from "../types";
import { buildBrief } from "./brief";

export interface ReportDoc extends Report {
  id: string;
  status: "draft" | "published";
  analysisId: string;
  dataClass: "sample";
  author: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  publishedBy?: string;
  /** True once a person has edited generated text. */
  edited: boolean;
  /** True when a hypothetical simulation section was explicitly included. */
  includesSimulation?: boolean;
}

export const statusLineOf = (d: Pick<ReportDoc, "status" | "publishedAt" | "publishedBy" | "lang">): string => {
  if (d.status === "published") {
    return d.lang === "ne"
      ? `स्थिति: प्रकाशित (डेमो, स्थानीय) — ${d.publishedAt?.slice(0, 16).replace("T", " ")} UTC, समीक्षक: ${d.publishedBy}। यो ब्राउजरभित्र मात्र सुरक्षित छ; कुनै बाह्य निकायलाई पठाइएको छैन।`
      : `STATUS: PUBLISHED (demo, local) — ${d.publishedAt?.slice(0, 16).replace("T", " ")} UTC, reviewed by ${d.publishedBy}. Stored in this browser only; not sent to any external authority.`;
  }
  return d.lang === "ne" ? "स्थिति: ड्राफ्ट — समीक्षा गरिएको छैन।" : "STATUS: DRAFT — not reviewed.";
};

export function createReportDoc(r: AnalysisResults, lang: Lang, author: string, opts: { sim?: SimResult | null; tasks?: TaskMap } = {}): ReportDoc {
  const base = buildBrief(r, lang, opts);
  const notes: ReportSection = {
    heading: `${digits(base.sections.length + 1, lang)}. ${lang === "ne" ? "समीक्षकको टिप्पणी (सम्पादन योग्य)" : "Reviewer notes (editable)"}`,
    lines: [
      lang === "ne"
        ? "अहिलेसम्म समीक्षकको टिप्पणी छैन। प्रमाणीकरणको अवस्था, सम्पर्क गरिएका स्थलगत टोली र लिइएका निर्णयहरू यहाँ लेख्नुहोस्।"
        : "No reviewer notes yet. Record verification status, field contacts reached and decisions taken here.",
    ],
  };
  const now = new Date().toISOString();
  const doc: ReportDoc = {
    ...base,
    sections: [...base.sections, notes],
    snapshotSvg: buildSnapshotSvg(r),
    id: `RPT-${Date.now().toString(36).toUpperCase()}`,
    status: "draft",
    analysisId: r.id,
    dataClass: "sample",
    author,
    createdAt: now,
    updatedAt: now,
    edited: false,
    includesSimulation: !!opts.sim,
  };
  doc.statusLine = statusLineOf(doc);
  return doc;
}
