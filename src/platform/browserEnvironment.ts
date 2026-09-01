import packageInfo from "../../package.json";
import { detectBrowserPlatform, platformLabel } from "@/core/platform";
import type { EnvironmentInfo, SystemMetrics } from "@/core/types";

export function getBrowserEnvironmentInfo(isTauri = false): EnvironmentInfo {
  const platform = detectBrowserPlatform();
  const browserPlatform = typeof navigator !== "undefined" ? navigator.platform : undefined;

  return {
    os: platformLabel(platform, browserPlatform || "Unknown"),
    platform,
    hostname: isTauri ? "Desktop runtime" : "Local browser",
    appVersion: packageInfo.version,
    isAdmin: false,
    isWindows: platform === "windows",
    isTauri
  };
}

export function getUnavailableSystemMetrics(): SystemMetrics {
  return {
    collectedAt: new Date().toISOString(),
    source: "unavailable",
    uptimeSeconds: null,
    cpuUsagePercent: null,
    memoryUsedBytes: null,
    memoryTotalBytes: null,
    networkReceivedBytes: null,
    networkTransmittedBytes: null
  };
}
