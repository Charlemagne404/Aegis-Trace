import type { PlatformId, ScanResult } from "./types";

export function normalizePlatform(value: string | undefined): PlatformId {
  const normalized = value?.trim().toLowerCase() ?? "";

  if (normalized === "windows" || normalized.startsWith("win")) {
    return "windows";
  }

  if (
    normalized === "macos" ||
    normalized === "mac os" ||
    normalized === "darwin" ||
    normalized.includes("mac")
  ) {
    return "macos";
  }

  if (normalized === "linux" || normalized.includes("linux")) {
    return "linux";
  }

  return "unknown";
}

export function detectBrowserPlatform(): PlatformId {
  if (typeof navigator === "undefined") {
    return "unknown";
  }

  return normalizePlatform(`${navigator.userAgent} ${navigator.platform}`);
}

export function isLivePlatform(platform: PlatformId): boolean {
  return platform === "windows" || platform === "macos";
}

export function platformLabel(platform: PlatformId, fallback = "Unknown platform"): string {
  switch (platform) {
    case "windows":
      return "Windows";
    case "macos":
      return "macOS";
    case "linux":
      return "Linux";
    default:
      return fallback;
  }
}

export function scanPlatform(scan: Pick<ScanResult, "environment">): PlatformId {
  return scan.environment.platform ?? normalizePlatform(scan.environment.os);
}
