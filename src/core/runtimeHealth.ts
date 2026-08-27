import type { EnvironmentInfo, RuntimeHealth, WorkspaceMode } from "./types";
import { isLivePlatform, platformLabel } from "./platform";

function checkedAt() {
  return new Date().toISOString();
}

export function createPreviewRuntimeHealth(environment?: Partial<EnvironmentInfo>): RuntimeHealth {
  const platform = environment?.platform ?? "unknown";
  const platformName = platformLabel(platform);
  const desktopHint = platform === "linux"
    ? "Linux live diagnostics are planned for a future platform adapter."
    : isLivePlatform(platform)
      ? `Live ${platformName} scans and repair actions require the Aegis Tauri desktop app.`
      : "Live scans and repair actions require a supported Aegis Tauri desktop app.";

  return {
    checkedAt: checkedAt(),
    state: "preview",
    summary: "Preview workspace",
    detail: `This session can preview the timeline with local sample data. ${desktopHint}`,
    capabilities: {
      canRunTimelineScans: true,
      canRunLiveScans: false,
      canRunFixes: false,
      canExportReports: true,
      canCollectSystemMetrics: false
    },
    issues: []
  };
}

export function createLabRuntimeHealth(): RuntimeHealth {
  return {
    checkedAt: checkedAt(),
    state: "preview",
    summary: "Diagnostic lab",
    detail:
      "Simulation mode is active. Aegis will replay scan progress and fix outcomes without touching the device.",
    capabilities: {
      canRunTimelineScans: true,
      canRunLiveScans: false,
      canRunFixes: true,
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

export function deriveWorkspaceMode(
  runtimeHealth: RuntimeHealth,
  demoMode: boolean
): WorkspaceMode {
  if (demoMode) {
    return "lab";
  }

  if (runtimeHealth.state === "degraded") {
    return "degraded";
  }

  return runtimeHealth.capabilities.canRunLiveScans ? "live" : "preview";
}

export function getScanDisabledReason(
  runtimeHealth: RuntimeHealth,
  demoMode: boolean
): string | undefined {
  if (demoMode || runtimeHealth.capabilities.canRunTimelineScans) {
    return undefined;
  }

  return runtimeHealth.detail;
}

export function getFixDisabledReason(
  runtimeHealth: RuntimeHealth,
  demoMode: boolean
): string | undefined {
  if (demoMode || runtimeHealth.capabilities.canRunFixes) {
    return undefined;
  }

  if (runtimeHealth.state === "preview") {
    return "Live repair actions only run inside a supported Aegis desktop app. Use Diagnostic lab to simulate fixes during development.";
  }

  return runtimeHealth.detail;
}
