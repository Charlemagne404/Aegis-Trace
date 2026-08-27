import { motion } from "framer-motion";
import type { DiagnosticNode as DiagnosticNodeType } from "@/core/types";
import { StatusGlyph, TimelineIcon } from "@/components/common/IconMap";
import { statusLabels } from "@/utils/status";
import { cn } from "@/utils/cn";

type TimelineNodeProps = {
  node: DiagnosticNodeType;
  index: number;
  selected: boolean;
  active: boolean;
  liveComplete: boolean;
  isPrimaryFailure: boolean;
  isDownstreamOfFailure: boolean;
  isScanning: boolean;
  onSelect: (id: string) => void;
};

function iconTone(
  status: DiagnosticNodeType["status"],
  liveComplete: boolean,
  isPrimaryFailure: boolean,
  isDownstreamOfFailure: boolean
): string {
  if (isPrimaryFailure || status === "failed") {
    return "text-[#ff6257]";
  }

  if (status === "running") {
    return "text-cyan-100";
  }

  if (liveComplete) {
    return "text-[#d8f7ff]";
  }

  if (isDownstreamOfFailure || ["pending", "unknown", "skipped"].includes(status)) {
    return "text-[#75849a]";
  }

  return "text-[#f4f7fb]";
}

function badgeTone(
  status: DiagnosticNodeType["status"],
  liveComplete: boolean,
  isPrimaryFailure: boolean
): string {
  if (isPrimaryFailure || status === "failed") {
    return "border-[#ff6257]/80 bg-[#151b2a] text-[#ff6257] shadow-[0_0_16px_rgba(255,98,87,0.18)]";
  }

  if (status === "warning") {
    return "border-[#f7be49]/65 bg-[#151b2a] text-[#f7be49] shadow-[0_0_14px_rgba(247,190,73,0.12)]";
  }

  if (status === "running") {
    return "border-cyan-300/75 bg-[#101c2c] text-cyan-100 shadow-[0_0_18px_rgba(103,232,249,0.18)]";
  }

  if (liveComplete) {
    return "border-cyan-300/50 bg-[#0f1c2c] text-cyan-100 shadow-[0_0_14px_rgba(56,189,248,0.12)]";
  }

  if (status === "ok") {
    return "border-[#54d786]/75 bg-[#111d2d] text-[#54d786] shadow-[0_0_16px_rgba(84,215,134,0.14)]";
  }

  return "border-[#42516b] bg-[#101826] text-[#72829a]";
}

function valueTone(
  status: DiagnosticNodeType["status"],
  liveComplete: boolean,
  isPrimaryFailure: boolean,
  isDownstreamOfFailure: boolean
): string {
  if (isPrimaryFailure || status === "failed") {
    return "text-[#ffb0a8]";
  }

  if (liveComplete) {
    return "text-[#9dc6d8]";
  }

  if (status === "ok" && !isDownstreamOfFailure) {
    return "text-slate-200";
  }

  if (status === "warning") {
    return "text-[#f7be49]";
  }

  return "text-slate-500";
}

function getTimelineValue(node: DiagnosticNodeType) {
  if (node.progressState === "running") {
    return "Checking...";
  }

  if (node.progressState === "checked" && !node.evidence.length) {
    return "Captured";
  }

  if (node.status === "pending") {
    return "Waiting";
  }

  if (node.status === "skipped") {
    return "Skipped";
  }

  if (node.status === "unknown") {
    return "Review";
  }

  const primaryValue = node.evidence[0]?.value;

  if (node.id === "ip" || node.id === "gateway" || node.id === "dns") {
    if (!primaryValue || primaryValue.length > 18) {
      return "—";
    }

    return primaryValue;
  }

  if (node.id === "internet" || node.id === "windows" || node.id === "apps") {
    return node.status === "ok" ? "Reachable" : primaryValue ?? "—";
  }

  return node.status === "ok" ? "Checked" : primaryValue ?? "Review";
}

function getTimelineLabel(node: DiagnosticNodeType) {
  if (node.id === "ip") return "IP";
  if (node.id === "windows") return "OS";
  return node.label;
}

export function TimelineNode({
  node,
  index,
  selected,
  active,
  liveComplete,
  isPrimaryFailure,
  isDownstreamOfFailure,
  isScanning,
  onSelect
}: TimelineNodeProps) {
  const value = getTimelineValue(node);
  const iconClassName = iconTone(
    node.status,
    liveComplete,
    isPrimaryFailure,
    isDownstreamOfFailure
  );
  const shouldDim = isDownstreamOfFailure && !selected && !active;
  const displayStatus = liveComplete && node.status === "pending" ? "ok" : node.status;

  return (
    <motion.button
      type="button"
      onClick={() => onSelect(node.id)}
      className={cn(
        "timeline-node group relative isolate flex min-h-[7.75rem] flex-col items-center rounded-[14px] px-1 pb-1 pt-2 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-[#63a5ff]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#101b2b]",
        selected
          ? "bg-[linear-gradient(180deg,rgba(45,59,81,0.28)_0%,rgba(15,23,35,0.06)_100%)] ring-1 ring-inset ring-white/[0.08]"
          : "hover:bg-[linear-gradient(180deg,rgba(45,59,81,0.16)_0%,rgba(15,23,35,0.03)_100%)]"
      )}
      initial={{ opacity: 0, y: 8 }}
      animate={{
        opacity: shouldDim ? 0.48 : node.status === "pending" ? 0.72 : 1,
        y: active ? -1 : 0,
        scale: 1
      }}
      transition={{ delay: index * 0.035, duration: 0.3, ease: "easeOut" }}
      whileHover={{ y: -2 }}
      aria-pressed={selected}
      aria-current={active ? "step" : undefined}
      aria-label={`${node.label}: ${node.summary}`}
      data-status={node.status}
    >
      <div className="relative h-9 w-9">
        <span
          className={cn(
            "pointer-events-none absolute inset-[-10px] rounded-full opacity-0 blur-xl transition duration-300",
            active && node.status === "running" && "timeline-scan-halo opacity-100",
            liveComplete && "bg-cyan-400/20 opacity-100",
            isPrimaryFailure && "timeline-failure-halo opacity-100"
          )}
        />

        <motion.div
          className={cn(
            "relative grid h-9 w-9 place-items-center rounded-full border transition-[border-color,background-color,box-shadow] duration-300",
            isPrimaryFailure
              ? "border-[#ff6257]/80 bg-[#ff6257]/[0.05]"
              : liveComplete
                ? "border-cyan-300/45 bg-cyan-400/[0.06]"
                : selected
                  ? "border-white/10 bg-white/[0.025]"
                  : "border-transparent bg-transparent"
          )}
          animate={{
            scale: active && node.status === "running" ? 1.06 : isPrimaryFailure ? 1.03 : 1,
            boxShadow:
              active && node.status === "running"
                ? "0 0 24px rgba(56,189,248,.12)"
                : isPrimaryFailure
                  ? "0 0 28px rgba(255,98,87,.12)"
                  : "0 0 0 rgba(0,0,0,0)"
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <TimelineIcon
            name={node.icon}
            className={cn(
              "flex h-[18px] w-[18px] items-center justify-center text-[0.68rem] font-medium tracking-[0.01em] sm:h-5 sm:w-5 sm:text-[0.72rem]",
              node.id === "dns" && "text-[0.58rem] sm:text-[0.62rem]",
              node.id === "ip" && "text-[0.82rem] sm:text-[0.88rem]",
              iconClassName
            )}
          />
        </motion.div>
      </div>

      <div className="absolute left-1/2 top-[3.52rem] -translate-x-1/2">
        <span
          className={cn(
            "pointer-events-none absolute inset-[-5px] rounded-full opacity-0 transition duration-300",
            active && node.status === "running" && "timeline-running-ring opacity-100",
            liveComplete && "bg-cyan-400/10 opacity-100",
            isPrimaryFailure && "timeline-failure-ring opacity-100"
          )}
        />

        <motion.span
          className={cn(
            "relative grid h-[26px] w-[26px] place-items-center rounded-full border",
            badgeTone(node.status, liveComplete, isPrimaryFailure)
          )}
          animate={{
            scale: active ? 1.06 : isPrimaryFailure ? 1.08 : 1,
            y: isScanning && active ? -1 : 0
          }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          <StatusGlyph status={displayStatus} className="h-3.5 w-3.5" />
        </motion.span>
      </div>

      <div className="mt-[3.18rem] w-full">
        <p
          className={cn(
            "truncate text-[0.75rem] font-semibold tracking-[0.01em] transition-colors duration-300 sm:text-[0.85rem]",
            isPrimaryFailure ? "text-white" : shouldDim ? "text-slate-400" : "text-slate-100"
          )}
        >
          {getTimelineLabel(node)}
        </p>
        <p
          className={cn(
            "mt-1 truncate text-[0.68rem] transition-colors duration-300 sm:text-[0.75rem]",
            valueTone(node.status, liveComplete, isPrimaryFailure, isDownstreamOfFailure)
          )}
        >
          {value || "\u00a0"}
        </p>
        <span className="sr-only">{statusLabels[displayStatus]}</span>
      </div>
    </motion.button>
  );
}
