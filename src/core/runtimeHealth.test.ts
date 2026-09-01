import { describe, expect, it } from "vitest";
import {
  createUnavailableRuntimeHealth,
  deriveWorkspaceMode,
  getFixDisabledReason,
  getScanDisabledReason
} from "./runtimeHealth";

describe("runtimeHealth helpers", () => {
  it("blocks live actions when the desktop runtime is unavailable", () => {
    const unavailable = createUnavailableRuntimeHealth({
      platform: "windows",
      isWindows: true,
      isTauri: false
    });

    expect(unavailable.capabilities.canRunTimelineScans).toBe(false);
    expect(unavailable.capabilities.canRunFixes).toBe(false);
    expect(getScanDisabledReason(unavailable)).toContain("Live diagnostics");
    expect(getFixDisabledReason(unavailable)).toContain("installed Aegis Trace");
    expect(deriveWorkspaceMode(unavailable)).toBe("unavailable");
  });

  it("keeps a degraded native runtime fail-closed", () => {
    const degraded = {
      ...createUnavailableRuntimeHealth(),
      state: "degraded" as const,
      detail: "Native startup checks failed."
    };

    expect(getScanDisabledReason(degraded)).toBe("Native startup checks failed.");
    expect(getFixDisabledReason(degraded)).toBe("Native startup checks failed.");
    expect(deriveWorkspaceMode(degraded)).toBe("degraded");
  });
});
