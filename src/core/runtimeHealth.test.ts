import { describe, expect, it } from "vitest";
import {
  createLabRuntimeHealth,
  createPreviewRuntimeHealth,
  deriveWorkspaceMode,
  getFixDisabledReason,
  getScanDisabledReason
} from "./runtimeHealth";

describe("runtimeHealth helpers", () => {
  it("keeps preview scans available while blocking live fixes", () => {
    const preview = createPreviewRuntimeHealth({ isWindows: true, isTauri: false });

    expect(preview.capabilities.canRunTimelineScans).toBe(true);
    expect(preview.capabilities.canRunFixes).toBe(false);
    expect(getScanDisabledReason(preview, false)).toBeUndefined();
    expect(getFixDisabledReason(preview, false)).toContain("supported Aegis desktop app");
    expect(deriveWorkspaceMode(preview, false)).toBe("preview");
  });

  it("treats lab mode as a separate executable workspace", () => {
    const lab = createLabRuntimeHealth();

    expect(lab.capabilities.canRunTimelineScans).toBe(true);
    expect(lab.capabilities.canRunFixes).toBe(true);
    expect(getScanDisabledReason(lab, true)).toBeUndefined();
    expect(getFixDisabledReason(lab, true)).toBeUndefined();
    expect(deriveWorkspaceMode(lab, true)).toBe("lab");
  });
});
