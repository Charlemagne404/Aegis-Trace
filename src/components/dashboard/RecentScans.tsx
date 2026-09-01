import { Clock3, History, RotateCcw, Trash2 } from "lucide-react";
import type { ScanHistoryEntry } from "@/core/types";
import { StatusPill } from "@/components/common/StatusPill";
import { cn } from "@/utils/cn";
import { platformLabel, scanPlatform } from "@/core/platform";

type RecentScansProps = {
  entries: ScanHistoryEntry[];
  activeScanId?: string;
  onSelectScan: (entry: ScanHistoryEntry) => void;
  onClearHistory: () => void;
};

const reasonLabels: Record<ScanHistoryEntry["reason"], string> = {
  manual: "Manual",
  verification: "Repair check"
};

const reasonTone: Record<ScanHistoryEntry["reason"], string> = {
  manual: "text-cyan-100 bg-cyan-400/10 border-cyan-300/25",
  verification: "text-emerald-100 bg-emerald-400/10 border-emerald-300/25"
};

export function RecentScans({
  entries,
  activeScanId,
  onSelectScan,
  onClearHistory
}: RecentScansProps) {
  const getSourceLabel = (entry: ScanHistoryEntry) => {
    return `Live ${platformLabel(scanPlatform(entry.scan))} scan`;
  };

  return (
    <section className="app-panel min-w-0 rounded-[14px]">
      <div className="flex items-start justify-between gap-3 border-b border-[color:var(--aegis-line-soft)] px-5 py-4">
        <div>
          <div className="flex items-center gap-2 text-white">
            <History className="h-[18px] w-[18px] text-cyan-100" />
            <h2 className="text-[1rem] font-semibold tracking-[0.01em]">
              Local scan history
            </h2>
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Every completed scan stays on this device so you can reopen the timeline later.
          </p>
        </div>

        <button
          type="button"
          onClick={onClearHistory}
          disabled={!entries.length}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>

      <div className="hide-scrollbar max-h-[28rem] overflow-auto px-4 py-4 sm:px-5">
        {entries.length ? (
          <div className="space-y-3">
            {entries.map((entry) => {
              const isActive = entry.scan.id === activeScanId;
              return (
                <article
                  key={entry.id}
                  className={cn(
                    "rounded-[14px] border px-4 py-3 transition",
                    isActive
                      ? "border-cyan-300/25 bg-cyan-300/[0.08]"
                      : "border-[color:var(--aegis-line-soft)] bg-[rgba(15,24,36,0.72)] hover:bg-[rgba(18,30,46,0.84)]"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
                            reasonTone[entry.reason]
                          )}
                        >
                          {reasonLabels[entry.reason]}
                        </span>
                        {isActive ? (
                          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-white">
                            Current
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-3 truncate text-[0.98rem] font-medium text-white">
                        {entry.scan.diagnosis.title}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-400">
                        {entry.scan.diagnosis.summary}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
                        <span className="inline-flex items-center gap-2">
                          <Clock3 className="h-3.5 w-3.5" />
                          {new Date(entry.capturedAt).toLocaleString()}
                        </span>
                        {entry.relatedFixTitle ? (
                          <span>After: {entry.relatedFixTitle}</span>
                        ) : null}
                      </div>
                    </div>

                    <StatusPill status={entry.scan.overallStatus} />
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-500">{getSourceLabel(entry)}</div>

                    <button
                      type="button"
                      onClick={() => onSelectScan(entry)}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-100 transition hover:bg-white/[0.08]"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restore to workspace
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[14px] border border-dashed border-[color:var(--aegis-line-soft)] bg-[rgba(15,24,36,0.5)] px-4 py-6 text-center">
            <p className="font-medium text-white">No saved scans yet</p>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Completed scans will appear here automatically and remain local to this device.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
