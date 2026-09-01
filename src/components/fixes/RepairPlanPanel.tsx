import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  RotateCcw,
  ThumbsDown,
  ThumbsUp
} from "lucide-react";
import type {
  FixAction,
  FixExecutionResult,
  OverallDiagnosis
} from "@/core/types";
import { SafetyPill } from "@/components/common/SafetyPill";
import { cn } from "@/utils/cn";
import { RepairOptionRow } from "./RepairOptionRow";

type RepairPlanPanelProps = {
  diagnosis: OverallDiagnosis;
  fixResult: FixExecutionResult | null;
  isScanning: boolean;
  fixesEnabled: boolean;
  fixesDisabledReason?: string;
  scanActionEnabled: boolean;
  scanActionReason?: string;
  additionalFixes: FixAction[];
  advancedFixes: FixAction[];
  onRunFix: (fix: FixAction) => void;
  onRunScan: () => void;
};

function actionLabel(fix: FixAction) {
  if (fix.id === "renew-dhcp") return "Renew IP";
  if (fix.id === "restart-adapter") return "Restart Adapter";
  if (fix.id === "flush-dns") return "Flush DNS";
  if (fix.id === "reconnect-wifi") return "Reconnect Wi-Fi";
  if (fix.id === "open-router-settings") return "Open router";
  if (fix.id === "open-captive-portal") return "Open sign-in";
  if (fix.id === "open-device-manager") return "Open Device Manager";
  if (fix.id === "reset-proxy") return "Clear proxy";
  if (fix.id === "open-network-settings") return "View Guide";
  if (fix.safety === "safe") return "Apply Safe Fix";
  if (fix.safety === "moderate") return "Review Fix";
  return "Preview Fix";
}

export function RepairPlanPanel({
  diagnosis,
  fixResult,
  isScanning,
  fixesEnabled,
  fixesDisabledReason,
  scanActionEnabled,
  scanActionReason,
  additionalFixes,
  advancedFixes,
  onRunFix,
  onRunScan
}: RepairPlanPanelProps) {
  const steps = diagnosis.recommendedFixes.slice(0, 4);
  const awaitingScan = diagnosis.id === "not-scanned";
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const optionCount = steps.length + additionalFixes.length + advancedFixes.length;

  return (
    <section className="app-panel flex min-w-0 flex-col rounded-[18px] lg:h-full lg:min-h-0">
      <div className="flex items-start justify-between gap-3 border-b border-[color:var(--aegis-line-soft)] px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-[1.02rem] font-semibold tracking-[0.01em] text-white">How to fix it</h2>
          <p className="mt-1 text-[0.88rem] leading-6 text-slate-400">
            Follow the lowest-risk steps first. Each action is tied to the evidence above.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[#4b8dff]/20 bg-[#4b8dff]/[0.07] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9bc5ff]">
          {isScanning
            ? "Rechecking"
            : awaitingScan
              ? "Scan required"
              : optionCount
                ? `${optionCount} options`
                : "No action"}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
        {isScanning ? (
          <div className="rounded-[16px] border border-cyan-300/20 bg-cyan-300/[0.06] px-4 py-4">
            <div className="flex items-center gap-2.5 text-cyan-100">
              <LoaderCircle className="h-[18px] w-[18px] animate-spin" />
              <p className="font-medium text-white">Refreshing recommendations</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Aegis is waiting for the new break point before suggesting a repair.
            </p>
          </div>
        ) : awaitingScan ? (
          <div className="rounded-[16px] border border-[#63a5ff]/20 bg-[#63a5ff]/[0.06] px-4 py-4">
            <p className="font-medium text-white">Run a live scan first</p>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              Aegis will only recommend a repair after it has collected evidence from this device.
            </p>
          </div>
        ) : steps.length ? (
          <div className="overflow-hidden rounded-[14px] border border-[color:var(--aegis-line-soft)] bg-[linear-gradient(180deg,rgba(15,24,36,0.88)_0%,rgba(11,20,31,0.94)_100%)] shadow-[inset_0_1px_0_rgba(170,192,224,0.02)]">
            {steps.map((fix, index) => (
              <article
                key={fix.id}
                className={cn(
                  "flex flex-col gap-2 px-4 py-2.5 sm:px-5 lg:flex-row lg:items-center",
                  index !== steps.length - 1 && "border-b border-[color:var(--aegis-line-soft)]"
                )}
              >
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#4b8dff]/20 bg-[#4b8dff]/[0.08] text-sm font-semibold text-[#a8caff]">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[0.94rem] font-medium tracking-[0.01em] text-white">
                      {fix.title}
                    </h3>
                    <p className="mt-1 max-w-[34rem] truncate text-[0.82rem] leading-5 text-slate-400">
                      {fix.description}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 lg:min-w-[15rem] lg:flex-nowrap">
                  <SafetyPill
                    safety={fix.safety}
                    className="border-transparent bg-transparent px-0 py-0 text-[0.94rem] font-medium capitalize tracking-normal"
                  />
                  <button
                    type="button"
                    onClick={() => onRunFix(fix)}
                    disabled={!fixesEnabled}
                    title={!fixesEnabled ? fixesDisabledReason : undefined}
                    className="app-outline-button inline-flex min-w-[9.5rem] items-center justify-center gap-2 rounded-[9px] border-[rgba(62,111,191,0.4)] bg-[rgba(13,31,56,0.58)] px-4 py-2.5 text-sm font-medium text-[#63a5ff] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionLabel(fix)}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-[16px] border border-[#54d786]/20 bg-[#54d786]/[0.06] px-4 py-4">
            <div className="flex items-center gap-2.5 text-[#8ae6af]">
              <CheckCircle2 className="h-[18px] w-[18px]" />
              <p className="font-medium text-white">No repair action is needed</p>
            </div>
            <p className="mt-1 text-sm leading-6 text-[#c5f4d6]">
              The diagnostic chain completed without finding a repairable break point.
            </p>
          </div>
        )}

        {additionalFixes.length || advancedFixes.length ? (
          <div className="mt-3 overflow-hidden rounded-[14px] border border-[color:var(--aegis-line-soft)] bg-[rgba(13,23,36,0.58)]">
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <div>
                <p className="text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  More ways to try
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Other actions suggested by the stages Aegis checked.
                </p>
              </div>
              <span className="shrink-0 text-xs font-medium text-slate-500">
                {additionalFixes.length + advancedFixes.length} more
              </span>
            </div>

            {showMoreOptions ? (
              <div className="border-t border-[color:var(--aegis-line-soft)]">
                {additionalFixes.length ? (
                  <div className="divide-y divide-[color:var(--aegis-line-soft)]">
                    {additionalFixes.map((fix) => (
                      <RepairOptionRow
                        key={fix.id}
                        fix={fix}
                        actionsEnabled={fixesEnabled}
                        disabledReason={fixesDisabledReason}
                        onRun={onRunFix}
                      />
                    ))}
                  </div>
                ) : null}

                {advancedFixes.length ? (
                  <div className="border-t border-amber-300/10">
                    <div className="px-4 pb-1 pt-3 sm:px-5">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-amber-200/70">
                        Last-resort repairs
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        These reset deeper networking state and always require an explicit confirmation.
                      </p>
                    </div>
                    <div className="divide-y divide-[color:var(--aegis-line-soft)]">
                      {advancedFixes.map((fix) => (
                        <RepairOptionRow
                          key={fix.id}
                          fix={fix}
                          actionsEnabled={fixesEnabled}
                          disabledReason={fixesDisabledReason}
                          onRun={onRunFix}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setShowMoreOptions((visible) => !visible)}
              className="flex w-full items-center justify-center gap-2 border-t border-[color:var(--aegis-line-soft)] px-4 py-2.5 text-sm font-medium text-[#63a5ff] transition hover:bg-white/[0.03] hover:text-[#9bc5ff]"
              aria-expanded={showMoreOptions}
            >
              {showMoreOptions ? "Hide additional options" : "Show additional options"}
              {showMoreOptions ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
        ) : null}

        {fixResult ? (
          <div className="mt-3 rounded-[14px] border border-[#4b8dff]/22 bg-[#4b8dff]/[0.08] px-4 py-3">
            <p className="font-medium text-white">{fixResult.title}</p>
            <p className="mt-1 text-sm leading-6 text-slate-300">{fixResult.message}</p>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border-t border-[color:var(--aegis-line-soft)] px-1 pt-3">
          <button
            type="button"
            onClick={onRunScan}
            disabled={isScanning || !scanActionEnabled}
            title={!scanActionEnabled ? scanActionReason : undefined}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-300 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RotateCcw className="h-4 w-4" />
            {isScanning ? "Running live scan" : awaitingScan ? "Run live scan" : "Re-run tests"}
          </button>

          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>Was this helpful?</span>
            <span className="inline-flex items-center gap-2">
              <button
                type="button"
                aria-label="Mark diagnosis helpful"
                className="grid h-8 w-8 place-items-center rounded-full border border-white/[0.07] bg-white/[0.02] text-slate-400 transition hover:border-[#54d786]/30 hover:bg-[#54d786]/[0.08] hover:text-[#8ae6af]"
              >
                <ThumbsUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Mark diagnosis not helpful"
                className="grid h-8 w-8 place-items-center rounded-full border border-white/[0.07] bg-white/[0.02] text-slate-400 transition hover:border-[#ff6a5a]/30 hover:bg-[#ff6a5a]/[0.08] hover:text-[#ffb0a8]"
              >
                <ThumbsDown className="h-4 w-4" />
              </button>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
