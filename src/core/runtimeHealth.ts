import type { EnvironmentInfo, RuntimeHealth, WorkspaceMode } from "./types";
import { isLivePlatform, platformLabel } from "./platform";

function checkedAt() {
  return new Date().toISOString();
}

export function createUnavailableRuntimeHealth(
  environment?: Partial<EnvironmentInfo>
): RuntimeHealth {
  const platform = environment?.platform ?? "unknown";
  const platformName = platformLabel(platform);
  const desktopHint = isLivePlatform(platform)
    ? `Launch the installed Aegis Trace desktop app to access the ${platformName} native adapter.`
    : "Launch the installed Aegis Trace desktop app on a supported operating system to access native diagnostics.";

  return {
    checkedAt: checkedAt(),
    state: "unavailable",
    summary: "Desktop runtime required",
    detail: `Live diagnostics are unavailable in this session. ${desktopHint}`,
    capabilities: {
      canRunTimelineScans: false,
      canRunLiveScans: false,
      canRunFixes: false,
      canExportReports: true,
      canCollectSystemMetrics: false
    },
    issues: []
  };
}

export function createDegradedRuntimeHealth(
  detail: string,
  platform: EnvironmentInfo["platform"] = "unknown"
): RuntimeHealth {
  return {
    checkedAt: checkedAt(),
    state: "degraded",
    summary: `${platformLabel(platform)} runtime issue detected`,
    detail,
    capabilities: {
      canRunTimelineScans: false,
      canRunLiveScans: false,
      canRunFixes: false,
      canExportReports: true,
      canCollectSystemMetrics: false
    },
    issues: [
      {
        id: "runtime-degraded",
        severity: "error",
        title: "Live diagnostics paused",
        detail
      }
    ]
  };
}

export function deriveWorkspaceMode(runtimeHealth: RuntimeHealth): WorkspaceMode {
  if (runtimeHealth.state === "degraded") {
    return "degraded";
  }

  return runtimeHealth.capabilities.canRunLiveScans ? "live" : "unavailable";
}

export function getScanDisabledReason(runtimeHealth: RuntimeHealth): string | undefined {
  if (runtimeHealth.capabilities.canRunTimelineScans) {
    return undefined;
  }

  return runtimeHealth.detail;
}

export function getFixDisabledReason(runtimeHealth: RuntimeHealth): string | undefined {
  if (runtimeHealth.capabilities.canRunFixes) {
    return undefined;
  }

  return runtimeHealth.state === "unavailable"
    ? "Live repair actions require the installed Aegis Trace desktop app. No command was executed."
    : runtimeHealth.detail;
}
