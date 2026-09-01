import { describe, expect, it } from "vitest";
import { createScenarioScanResult } from "./diagnosticScenarios";
import { projectScenarioAfterFix } from "./scenarioTransitions";
import {
  buildRepairBlockedVerification,
  buildRepairVerification
} from "./repairVerification";

describe("repair verification", () => {
  it("marks a repair as resolved when the verification scan clears the failure", () => {
    const beforeScan = createScenarioScanResult("dns-failure");
    const afterScan = createScenarioScanResult(
      projectScenarioAfterFix("dns-failure", "flush-dns")
    );

    const verification = buildRepairVerification(beforeScan, afterScan, {
      fixId: "flush-dns",
      status: "success",
      title: "Flush DNS cache",
      message: "Test fix"
    });

    expect(verification.status).toBe("resolved");
    expect(verification.afterDiagnosis).toBe("Everything looks good");
    expect(verification.changedNodes.some((node) => node.nodeId === "dns")).toBe(true);
  });

  it("marks a repair as unchanged when the verification scan keeps the same failure", () => {
    const beforeScan = createScenarioScanResult("internet-unreachable");
    const afterScan = createScenarioScanResult("internet-unreachable");

    const verification = buildRepairVerification(beforeScan, afterScan, {
      fixId: "generate-wlan-report",
      status: "success",
      title: "Generate WLAN report",
      message: "Test fix"
    });

    expect(verification.status).toBe("unchanged");
    expect(verification.afterDiagnosis).toBe(beforeScan.diagnosis.title);
  });

  it("builds a blocked verification summary when a fix does not execute", () => {
    const beforeScan = createScenarioScanResult("dhcp-apipa");

    const verification = buildRepairBlockedVerification(beforeScan, {
      fixId: "restart-adapter",
      status: "blocked",
      title: "Restart selected adapter",
      message: "Confirmation required"
    });

    expect(verification.status).toBe("blocked");
    expect(verification.detail).toContain("Confirmation required");
  });
});
