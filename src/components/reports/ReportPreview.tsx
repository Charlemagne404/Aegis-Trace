import { Download, X } from "lucide-react";
import type { ReportFormat, ScanResult } from "@/core/types";
import { StatusPill } from "@/components/common/StatusPill";
import { platformLabel, scanPlatform } from "@/core/platform";

type ReportPreviewProps = {
  scan: ScanResult;
  exportError?: string;
  onClose: () => void;
  onExport: (format: ReportFormat) => void;
};

export function ReportPreview({ scan, exportError, onClose, onExport }: ReportPreviewProps) {
  const sourceLabel = scan.mode === "real"
    ? `Live ${platformLabel(scanPlatform(scan))} scan`
    : "Test fixture";

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/72 p-4 backdrop-blur-xl">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-3xl border border-white/12 bg-[#0c1424] shadow-panel">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div>
            <h3 className="text-xl font-semibold tracking-tight text-white">
              Diagnostic report and case file
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              Exports stay local, exclude saved Wi-Fi passwords, and preserve the current timeline evidence for later review.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close report preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-auto p-5">
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h4 className="text-2xl font-semibold tracking-tight text-white">
                  {scan.diagnosis.title}
                </h4>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  {scan.diagnosis.summary}
                </p>
                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                  {sourceLabel}
                </p>
              </div>
              <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-center">
                <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/75">
                  Confidence
                </p>
                <p className="text-3xl font-semibold text-white">
                  {scan.diagnosis.confidence}%
                </p>
              </div>
            </div>
          </section>

          <section className="mt-4 grid gap-3 md:grid-cols-2">
            {scan.nodes.map((node) => (
              <article
                key={node.id}
                className="rounded-2xl border border-white/10 bg-slate-950/35 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h5 className="font-semibold text-white">{node.label}</h5>
                    <p className="mt-1 text-sm leading-6 text-slate-400">{node.summary}</p>
                  </div>
                  <StatusPill status={node.status} />
                </div>
              </article>
            ))}
          </section>

          <section className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
            Privacy warning: exported reports may include adapter names, IP addresses, DNS servers, and command output. Aegis does not upload this data.
          </section>

          {exportError ? (
            <section className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-300/10 p-4 text-sm leading-6 text-rose-100">
              Export failed: {exportError}
            </section>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 p-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => onExport("zip")}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
          >
            <Download className="h-4 w-4" />
            Export Case File
          </button>
          <button
            type="button"
            onClick={() => onExport("json")}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.07]"
          >
            <Download className="h-4 w-4" />
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => onExport("html")}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.07]"
          >
            <Download className="h-4 w-4" />
            Export HTML
          </button>
        </div>
      </div>
    </div>
  );
}
