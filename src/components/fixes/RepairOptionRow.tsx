import { ArrowRight, Lock } from "lucide-react";
import type { FixAction } from "@/core/types";
import { SafetyPill } from "@/components/common/SafetyPill";

type RepairOptionRowProps = {
  fix: FixAction;
  actionsEnabled: boolean;
  disabledReason?: string;
  onRun: (fix: FixAction) => void;
};

function actionLabel(fix: FixAction) {
  if (fix.id === "open-captive-portal") return "Open sign-in";
  if (fix.id === "open-router-settings") return "Open router";
  if (fix.id === "open-device-manager") return "Open Device Manager";
  if (fix.id === "reconnect-wifi") return "Reconnect Wi-Fi";
  if (fix.id === "reset-proxy") return "Clear proxy";
  if (fix.safety === "aggressive") return "Review last resort";
  return "Preview & run";
}

export function RepairOptionRow({
  fix,
  actionsEnabled,
  disabledReason,
  onRun
}: RepairOptionRowProps) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[0.9rem] font-medium text-white">{fix.title}</h3>
          <SafetyPill
            safety={fix.safety}
            className="px-2 py-0.5 text-[0.65rem]"
          />
          {fix.requiresAdmin ? (
            <span className="inline-flex items-center gap-1 text-[0.68rem] text-slate-500">
              <Lock className="h-3 w-3" />
              Admin
            </span>
          ) : null}
        </div>
        <p className="mt-1 max-w-[38rem] text-[0.78rem] leading-5 text-slate-400">
          {fix.description}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onRun(fix)}
        disabled={!actionsEnabled}
        title={!actionsEnabled ? disabledReason : undefined}
        className="app-outline-button inline-flex shrink-0 items-center justify-center gap-2 rounded-[9px] border-[rgba(62,111,191,0.4)] bg-[rgba(13,31,56,0.58)] px-3 py-2 text-xs font-medium text-[#63a5ff] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {actionLabel(fix)}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
