import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { RuntimeHealth } from "@/core/types";
import { cn } from "@/utils/cn";

type RuntimeNoticeProps = {
  runtimeHealth: RuntimeHealth;
  scanError?: string;
};

export function RuntimeNotice({ runtimeHealth, scanError }: RuntimeNoticeProps) {
  if (
    runtimeHealth.state !== "degraded" &&
    runtimeHealth.state !== "unavailable" &&
    !scanError
  ) {
    return null;
  }

  const hasRuntimeIssue = runtimeHealth.state === "degraded" || runtimeHealth.state === "unavailable";

  return (
    <section
      className={cn(
        "app-panel relative min-w-0 overflow-hidden rounded-[14px] border px-5 py-4",
        scanError
          ? "border-[#ff6a5a]/25 bg-[#ff6a5a]/[0.08]"
          : hasRuntimeIssue && runtimeHealth.state === "degraded"
            ? "border-[#ff6a5a]/25 bg-[#ff6a5a]/[0.08]"
            : "border-[#f2b84b]/20 bg-[#f2b84b]/[0.08]"
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {scanError || runtimeHealth.state === "degraded" ? (
              <AlertTriangle className="h-5 w-5 shrink-0 text-[#ff847a]" />
            ) : (
              <ShieldAlert className="h-5 w-5 shrink-0 text-[#f6cf6c]" />
            )}
            <h2 className="text-[1rem] font-semibold text-white">
              {scanError ? "Diagnostic action failed" : runtimeHealth.summary}
            </h2>
          </div>
          <p className="mt-2 max-w-[64rem] text-[0.95rem] leading-7 text-slate-200">
            {scanError ?? runtimeHealth.detail}
          </p>
        </div>

        {hasRuntimeIssue && runtimeHealth.issues.length ? (
          <div className="rounded-[12px] border border-white/10 bg-black/10 px-3.5 py-3 text-sm text-slate-300">
            <p className="font-medium text-white">Native runtime checks</p>
            <ul className="mt-2 space-y-1.5">
              {runtimeHealth.issues.slice(0, 3).map((issue) => (
                <li key={issue.id}>
                  {issue.title}: {issue.detail}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
