import { describe, expect, it } from "vitest";
import { createScenarioScanResult } from "./diagnosticScenarios";
import {
  getAdvancedFixActions,
  getFixAction,
  getSupplementalRepairOptions
} from "./fixRegistry";

describe("scan repair options", () => {
  it("exposes contextual alternatives and Windows last-resort actions", () => {
    const scan = createScenarioScanResult("gateway-unreachable");
    const options = getSupplementalRepairOptions(scan, "windows");

    expect(scan.diagnosis.recommendedFixes.map((fix) => fix.id)).toContain(
      "open-router-settings"
    );
    expect(options.alternatives.some((fix) => fix.id === "reconnect-wifi")).toBe(true);
    expect(options.advanced.map((fix) => fix.id)).toEqual([
      "winsock-reset",
      "tcpip-reset",
      "full-network-reset-settings"
    ]);
  });

  it("does not add repair options to a healthy scan", () => {
    const scan = createScenarioScanResult("healthy");

    expect(getSupplementalRepairOptions(scan, "windows")).toEqual({
      alternatives: [],
      advanced: []
    });
  });

  it("keeps new actions in the allowlist and advanced actions platform-scoped", () => {
    expect(getFixAction("reconnect-wifi").safety).toBe("moderate");
    expect(getFixAction("open-captive-portal").safety).toBe("safe");
    expect(getFixAction("reset-proxy").safety).toBe("moderate");
    expect(getAdvancedFixActions("macos")).toEqual([]);
    expect(getAdvancedFixActions("linux")).toEqual([]);
  });
});
