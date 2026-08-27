import { Activity, ArrowRight, CheckCircle2, CircleDashed } from "lucide-react";
import { motion } from "framer-motion";
import type { CSSProperties } from "react";
import type { DiagnosticNode, ScanProgress } from "@/core/types";
import { TimelineNode } from "./TimelineNode";
import { cn } from "@/utils/cn";

type DiagnosticTimelineProps = {
  nodes: DiagnosticNode[];
  selectedNodeId?: string;
  activeNodeId?: string;
  completedNodeIds: string[];
  scanProgress?: ScanProgress;
  onSelectNode: (nodeId: string) => void;
  isScanning: boolean;
};

function connectorTone(
  left: DiagnosticNode,
  right: DiagnosticNode,
  index: number,
  primaryFailedIndex: number
): string {
  if (primaryFailedIndex >= 0 && index >= primaryFailedIndex) {
    return "border-t border-dashed border-[#4b586f]/65 bg-transparent";
  }

  if (right.status === "failed" || left.status === "failed") {
    return "bg-[linear-gradient(90deg,#ff6b5e_0%,#ff6257_100%)] shadow-[0_0_14px_rgba(255,98,87,0.2)]";
  }

  if (left.status === "warning" || right.status === "warning") {
    return "bg-[linear-gradient(90deg,#f5bc48_0%,#f3c559_100%)] shadow-[0_0_10px_rgba(247,190,73,0.12)]";
  }

  if (left.status === "running" || right.status === "running") {
    return "bg-[linear-gradient(90deg,#3dcfff_0%,#54d786_52%,#54d786_100%)] timeline-connector-flow shadow-[0_0_12px_rgba(84,215,134,0.16)]";
  }

  if (left.status === "ok" && right.status === "ok") {
    return "bg-[linear-gradient(90deg,#58de8a_0%,#54d786_100%)] shadow-[0_0_12px_rgba(84,215,134,0.14)]";
  }

  return "border-t border-dashed border-[#4b586f]/65 bg-transparent";
}

export function DiagnosticTimeline({
  nodes,
  selectedNodeId,
  activeNodeId,
  completedNodeIds,
  scanProgress,
  onSelectNode,
  isScanning
}: DiagnosticTimelineProps) {
  const activeIndex = activeNodeId
    ? nodes.findIndex((node) => node.id === activeNodeId)
    : -1;
  const primaryFailedIndex = nodes.findIndex((node) => node.status === "failed");
  const completedNodeIdSet = new Set(completedNodeIds);
  const completedStageCount = isScanning
    ? completedNodeIds.length
    : nodes.filter((node) => !["pending", "running"].includes(node.status)).length;
  const attentionCount = nodes.filter(
    (node) => node.status === "failed" || node.status === "warning"
  ).length;
  const timelineCount = Math.max(nodes.length, 1);
  const connectorCount = Math.max(nodes.length - 1, 1);
  const nodeGridStyle = {
    gridTemplateColumns: `repeat(${timelineCount}, minmax(0, 1fr))`
  } satisfies CSSProperties;
  const connectorGridStyle = {
    gridTemplateColumns: `repeat(${connectorCount}, minmax(0, 1fr))`
  } satisfies CSSProperties;

  return (
    <section
      className={cn(
        "timeline-panel app-panel min-w-0 shrink-0 overflow-hidden rounded-[18px] px-3 py-3 sm:px-5 sm:py-3.5",
        isScanning && "timeline-panel-scanning"
      )}
      aria-label="Diagnostic connection path"
      aria-live="polite"
    >
      <div className="mb-2.5 flex min-w-0 items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] border border-[#4b8dff]/20 bg-[#4b8dff]/[0.08] text-[#8db9ff]">
            <Activity className={cn("h-3.5 w-3.5", isScanning && "animate-pulse")} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[0.95rem] font-semibold tracking-[0.01em] text-white">
              Connection path
            </h2>
            <p className="hidden truncate text-xs text-slate-500 sm:block">
              Device to app layer · click a stage to inspect its evidence
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-xs">
          <span
            className={cn(
              "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium sm:inline-flex",
              isScanning
                ? "border-cyan-300/20 bg-cyan-300/[0.07] text-cyan-100"
                : attentionCount
                  ? "border-[#ff6a5a]/20 bg-[#ff6a5a]/[0.06] text-[#ffb0a8]"
                  : "border-[#54d786]/20 bg-[#54d786]/[0.06] text-[#8ae6af]"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isScanning
                  ? "bg-cyan-300 animate-pulse"
                  : attentionCount
                    ? "bg-[#ff6a5a]"
                    : "bg-[#54d786]"
              )}
            />
            {isScanning
              ? scanProgress?.nodeLabel
                ? `Checking ${scanProgress.nodeLabel}`
                : "Preparing scan"
              : attentionCount
                ? `${attentionCount} stage${attentionCount === 1 ? "" : "s"} need attention`
                : "All stages passed"}
          </span>
          <span className="font-medium text-slate-400">
            {isScanning ? `${completedStageCount}/${nodes.length}` : `${nodes.length} stages`}
          </span>
        </div>
      </div>

      <div className="timeline-scroll-shell relative overflow-x-auto overflow-y-hidden pb-1">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-7 bg-gradient-to-r from-[#101b2b] to-transparent opacity-0 sm:hidden" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-7 bg-gradient-to-l from-[#101b2b] to-transparent opacity-0 sm:hidden" />

        <div className="relative min-w-[820px] px-1 xl:min-w-0">
          <div
            className="pointer-events-none absolute inset-x-[4.5%] top-[4.02rem] grid"
            style={connectorGridStyle}
          >
            {nodes.slice(0, -1).map((node, index) => {
              const rightNode = nodes[index + 1];
              const connectorHasResolvedStatus =
                node.status !== "pending" || rightNode.status !== "pending";
              const liveConnectorClass =
                isScanning &&
                !connectorHasResolvedStatus &&
                (index < activeIndex ||
                  (completedNodeIdSet.has(node.id) && completedNodeIdSet.has(rightNode?.id ?? "")))
                  ? "bg-[linear-gradient(90deg,#31baf7_0%,#67e8f9_100%)] shadow-[0_0_12px_rgba(56,189,248,0.14)]"
                  : connectorTone(node, rightNode, index, primaryFailedIndex);

              return (
                <motion.div
                  key={`${node.id}-${rightNode?.id}`}
                  className={cn(
                    "mx-0 h-[2px] origin-left rounded-full transition-[opacity] duration-300",
                    liveConnectorClass
                  )}
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{
                    scaleX:
                      isScanning && activeIndex >= 0
                        ? index < activeIndex
                          ? 1
                          : index === activeIndex
                            ? 0.58
                            : 0.14
                        : 1,
                    opacity:
                      isScanning && activeIndex >= 0
                        ? index <= activeIndex
                          ? 1
                          : 0.34
                        : 1
                  }}
                  transition={{ delay: index * 0.04, duration: 0.4, ease: "easeOut" }}
                />
              );
            })}
          </div>

          <div className="grid gap-0.5 md:gap-1 xl:gap-0.5" style={nodeGridStyle}>
            {nodes.map((node, index) => (
              <TimelineNode
                key={node.id}
                node={node}
                index={index}
                selected={node.id === selectedNodeId}
                active={node.id === activeNodeId}
                liveComplete={completedNodeIdSet.has(node.id)}
                isPrimaryFailure={primaryFailedIndex === index}
                isDownstreamOfFailure={primaryFailedIndex >= 0 && index > primaryFailedIndex}
                isScanning={isScanning}
                onSelect={onSelectNode}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-1 text-[11px] text-slate-400 sm:text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#54d786]" />
            Passed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border border-[#ff6257] bg-[#ff6257]/20" />
            Needs attention
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CircleDashed className="h-3.5 w-3.5 text-[#64748b]" />
            Not evaluated
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-slate-500 sm:hidden">
          Swipe to explore
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </section>
  );
}
