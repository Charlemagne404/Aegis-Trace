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

export function getBrowserSystemMetrics(): SystemMetrics {
  const memory =
    typeof performance !== "undefined" && "memory" in performance
      ? (
          performance as Performance & {
            memory?: {
              usedJSHeapSize: number;
              jsHeapSizeLimit: number;
            };
          }
        ).memory
      : undefined;

  return {
    collectedAt: new Date().toISOString(),
    source: "browser",
    uptimeSeconds:
      typeof performance !== "undefined" ? Math.round(performance.now() / 1000) : null,
    cpuUsagePercent: null,
    memoryUsedBytes: memory?.usedJSHeapSize ?? null,
    memoryTotalBytes: memory?.jsHeapSizeLimit ?? null,
    networkReceivedBytes: null,
    networkTransmittedBytes: null
  };
}
