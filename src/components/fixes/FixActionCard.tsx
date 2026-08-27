import { ArrowRight, Lock, TerminalSquare } from "lucide-react";
import type { FixAction } from "@/core/types";
import { SafetyPill } from "@/components/common/SafetyPill";

type FixActionCardProps = {
  fix: FixAction;
  actionsEnabled: boolean;
  disabledReason?: string;
  onRun: (fix: FixAction) => void;
};

export function FixActionCard({
  fix,
  actionsEnabled,
  disabledReason,
  onRun
}: FixActionCardProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-white">{fix.title}</h4>
            <SafetyPill safety={fix.safety} />
            {fix.requiresAdmin ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-slate-300">
                <Lock className="h-3 w-3" />
                Admin
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-400">{fix.description}</p>
          <p className="mt-2 text-sm text-slate-300">{fix.estimatedImpact}</p>
        </div>
        <button
          type="button"
          onClick={() => onRun(fix)}
          disabled={!actionsEnabled}
          title={!actionsEnabled ? disabledReason : undefined}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-sm font-semibold text-cyan-50 transition hover:border-cyan-200/45 hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Preview & run
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {fix.commandsPreview?.length ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <TerminalSquare className="h-3.5 w-3.5" />
            Command preview
          </div>
          <pre className="whitespace-pre-wrap font-mono text-xs leading-5 text-cyan-50/80">
            {fix.commandsPreview.join("\n")}
          </pre>
        </div>
      ) : null}

      {fix.warning ? (
        <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100">
          {fix.warning}
        </p>
      ) : null}

      {!actionsEnabled && disabledReason ? (
        <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.035] p-3 text-sm leading-6 text-slate-300">
          {disabledReason}
        </p>
      ) : null}
    </article>
  );
}
