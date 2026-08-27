import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Play,
  Radar,
  Wifi
} from "lucide-react";
import { motion } from "framer-motion";
import type { DiagnosticNode, OverallDiagnosis, ScanProgress } from "@/core/types";
import { cn } from "@/utils/cn";
import { severityLabels } from "@/utils/status";

type StatusOverviewProps = {
  diagnosis: OverallDiagnosis;
  liveNodes: DiagnosticNode[];
  completedChecks: number;
  lastRunAt: string;
  scanDurationMs?: number;
  isScanning: boolean;
  scanProgress?: ScanProgress;
  totalTimelineNodes: number;
  scanActionEnabled: boolean;
  scanActionReason?: string;
  onRunScan: () => void;
};

function getCheckedStageCount(
  scanProgress: ScanProgress | undefined,
  totalStages: number,
  isScanning: boolean
) {
  if (!isScanning) {
    return totalStages;
  }

  if (scanProgress?.kind === "scan-finished") {
    return totalStages;
  }

  if (typeof scanProgress?.nodeIndex !== "number") {
    return 0;
  }

  return Math.min(
    totalStages,
    scanProgress.nodeIndex + (scanProgress.kind === "node-completed" ? 1 : 0)
  );
}

export function StatusOverview({
  diagnosis,
  liveNodes,
  completedChecks,
  lastRunAt,
  scanDurationMs,
  isScanning,
  scanProgress,
  totalTimelineNodes,
  scanActionEnabled,
  scanActionReason,
  onRunScan
}: StatusOverviewProps) {
  const liveProblemNode = liveNodes.find(
    (node) => node.status === "failed" || node.status === "warning"
  );
  const isProblemState = !["info", "low"].includes(diagnosis.severity);
  const shouldShowProblemState = isScanning ? Boolean(liveProblemNode) : isProblemState;
  const severity = isScanning ? liveProblemNode?.severity ?? "info" : diagnosis.severity;
  const checkedStages = getCheckedStageCount(scanProgress, totalTimelineNodes, isScanning);
  const activeStage =
    isScanning && typeof scanProgress?.nodeIndex === "number"
      ? Math.min(scanProgress.nodeIndex + 1, totalTimelineNodes)
      : undefined;
  const progressPercent = isScanning
    ? scanProgress?.kind === "scan-finished"
      ? 100
      : Math.min(
          96,
          Math.max(
            5,
            ((checkedStages + (scanProgress?.kind === "node-started" ? 0.42 : 0)) /
              Math.max(totalTimelineNodes, 1)) *
              100
          )
        )
    : 100;
  const statusHeadline = shouldShowProblemState
    ? isScanning && liveProblemNode
      ? `${liveProblemNode.label} needs attention`
      : "Problems detected"
    : isScanning
      ? "Tracing your connection"
      : "Connection looks healthy";
  const severityBars = {
    info: 2,
    low: 3,
    medium: 4,
    high: 5,
    critical: 6
  }[severity];
  const lastRunLabel = new Date(lastRunAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
  const statusLabel = isScanning
    ? "Scanning now"
    : shouldShowProblemState
      ? "Needs attention"
      : "All clear";
  const statusDescription = isScanning
    ? liveProblemNode?.summary ??
      scanProgress?.message ??
      "Aegis is moving through the connection chain and will stop the story at the first meaningful break."
      : diagnosis.summary;
  const completionLabel =
    typeof scanDurationMs === "number"
      ? `Finished in ${(scanDurationMs / 1000).toFixed(1)}s`
      : "No duration";

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: "easeOut" }}
      className="scan-overview app-panel relative min-w-0 shrink-0 overflow-hidden rounded-[18px] px-4 py-3.5 sm:px-5 sm:py-4"
      aria-live="polite"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(255,103,86,0.1),transparent_24%),radial-gradient(circle_at_68%_0%,rgba(49,116,255,0.08),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(75,141,255,0.38),transparent)]" />

      <div className="relative grid gap-4 xl:grid-cols-[minmax(300px,1.65fr)_minmax(140px,0.72fr)_minmax(190px,0.9fr)_minmax(176px,0.86fr)] xl:items-center xl:gap-0">
        <div className="flex min-w-0 items-center gap-3.5 pr-0 sm:gap-4 xl:pr-7">
          <div
            className={cn(
              "scan-status-icon relative grid h-[60px] w-[60px] shrink-0 place-items-center rounded-[20px] border sm:h-[68px] sm:w-[68px] sm:rounded-[22px]",
              isScanning
                ? "border-cyan-300/35 bg-cyan-300/[0.07] text-cyan-100"
                : shouldShowProblemState
                  ? "border-[#ff6a5a]/35 bg-[#ff6a5a]/[0.06] text-[#ff6a5a]"
                  : "border-[#54d786]/30 bg-[#54d786]/[0.06] text-[#54d786]"
            )}
          >
            <span
              className={cn(
                "pointer-events-none absolute inset-[-9px] rounded-[26px] opacity-0 blur-xl",
                isScanning && "scan-pulse-ring opacity-100",
                !isScanning && shouldShowProblemState && "timeline-failure-halo opacity-100",
                !isScanning && !shouldShowProblemState && "bg-[#54d786]/10 opacity-100"
              )}
            />
            {isScanning ? (
              <Radar className="relative h-7 w-7 animate-pulse sm:h-8 sm:w-8" strokeWidth={1.75} />
            ) : (
              <Wifi className="relative h-7 w-7 sm:h-8 sm:w-8" strokeWidth={1.75} />
            )}
            {!isScanning && shouldShowProblemState ? (
              <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border border-[#ff6a5a]/80 bg-[#111c2c] text-[#ff6a5a] shadow-[0_0_20px_rgba(255,98,87,0.2)]">
                <AlertCircle className="h-3.5 w-3.5" strokeWidth={2.2} />
              </span>
            ) : null}
            {!isScanning && !shouldShowProblemState ? (
              <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border border-[#54d786]/60 bg-[#111c2c] text-[#54d786]">
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.2} />
              </span>
            ) : null}
          </div>

          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Connection health
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]",
                  isScanning
                    ? "border-cyan-300/25 bg-cyan-300/[0.08] text-cyan-100"
                    : shouldShowProblemState
                      ? "border-[#ff6a5a]/25 bg-[#ff6a5a]/[0.08] text-[#ffb0a8]"
                      : "border-[#54d786]/25 bg-[#54d786]/[0.08] text-[#8ae6af]"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isScanning
                      ? "bg-cyan-300 animate-pulse"
                      : shouldShowProblemState
                        ? "bg-[#ff6a5a]"
                        : "bg-[#54d786]"
                  )}
                />
                {statusLabel}
              </span>
            </div>
            <h2 className="max-w-full break-words text-[1.26rem] font-semibold leading-tight tracking-[-0.025em] text-white sm:text-[1.34rem] 2xl:text-[1.5rem]">
              {statusHeadline}
            </h2>
            <p className="mt-1 max-w-[38rem] text-[0.84rem] leading-5 text-slate-300 sm:text-[0.9rem] sm:leading-6">
              {statusDescription}
            </p>
          </div>
        </div>

        <div className="scan-overview-metric border-t border-[color:var(--aegis-line)] pt-3 xl:border-l xl:border-t-0 xl:px-5 xl:py-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
            Severity
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p
              className={cn(
                "text-[1.05rem] font-semibold tracking-[-0.01em]",
                shouldShowProblemState ? "text-[#ff6a5a]" : "text-[#54d786]"
              )}
            >
              {isScanning && !liveProblemNode ? "Building" : severityLabels[severity]}
            </p>
            {!isScanning ? (
              <span className="text-xs text-slate-500">{diagnosis.confidence}% confidence</span>
            ) : null}
          </div>
          <div className="mt-2 flex gap-1.5" aria-label={`${severityLabels[severity]} severity`}>
            {Array.from({ length: 6 }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  index < severityBars
                    ? shouldShowProblemState
                      ? "bg-[#ff6257] shadow-[0_0_9px_rgba(255,98,87,0.18)]"
                      : "bg-[#54d786] shadow-[0_0_9px_rgba(84,215,134,0.16)]"
                    : "bg-[#263349]"
                )}
              />
            ))}
          </div>
        </div>

        <div className="scan-overview-metric border-t border-[color:var(--aegis-line)] pt-3 xl:border-l xl:border-t-0 xl:px-5 xl:py-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              {isScanning ? "Live progress" : "Diagnostics completed"}
            </p>
            <span className="text-xs font-medium text-slate-300">
              {isScanning
                ? `${checkedStages} / ${totalTimelineNodes} stages`
                : `${completedChecks} checks`}
            </span>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-[#1d2a3f] ring-1 ring-white/[0.04]"
            role="progressbar"
            aria-label={isScanning ? "Diagnostic scan progress" : "Diagnostic scan complete"}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressPercent)}
          >
            <motion.div
              className={cn(
                "h-full rounded-full shadow-[0_0_15px_rgba(75,141,255,0.28)]",
                isScanning
                  ? "bg-[linear-gradient(90deg,#38bdf8_0%,#4b8dff_55%,#63a5ff_100%)]"
                  : shouldShowProblemState
                    ? "bg-[linear-gradient(90deg,#ff8a7e_0%,#ff6257_100%)]"
                    : "bg-[linear-gradient(90deg,#54d786_0%,#65e4a0_100%)]"
              )}
              initial={false}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </div>
          <div className="mt-2 flex min-w-0 items-center justify-between gap-3 text-xs text-slate-400">
            <span className="truncate">
              {isScanning
                ? activeStage
                  ? `Stage ${activeStage}: ${scanProgress?.nodeLabel ?? "checking"}`
                  : "Preparing the connection path"
                : completionLabel}
            </span>
            <span className="shrink-0 font-medium text-slate-300">{Math.round(progressPercent)}%</span>
          </div>
        </div>

        <div className="border-t border-[color:var(--aegis-line)] pt-3 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-1">
          <p className="text-right text-xs text-slate-500">
            Last run · {lastRunLabel}
          </p>
          <button
            type="button"
            onClick={onRunScan}
            disabled={isScanning || !scanActionEnabled}
            title={!scanActionEnabled ? scanActionReason : undefined}
            className="app-primary-button mt-2.5 inline-flex min-h-[40px] w-full min-w-0 items-center justify-between overflow-hidden rounded-[10px] px-0 text-[0.9rem] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="inline-flex flex-1 items-center justify-center gap-2.5 px-4">
              <Play className={cn("h-3.5 w-3.5", isScanning && "animate-pulse")} fill="currentColor" />
              {isScanning ? "Running scan" : "Run scan"}
            </span>
            <span className="flex h-full items-center border-l border-white/10 px-3 text-white/75">
              <ChevronDown className="h-4 w-4" />
            </span>
          </button>
        </div>
      </div>
    </motion.section>
  );
}
