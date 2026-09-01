import { describe, expect, it } from "vitest";
import { createScenarioScanResult } from "./diagnosticScenarios";

describe("diagnosis scoring", () => {
  it("identifies DNS failure after external IP connectivity passes", () => {
    const scan = createScenarioScanResult("dns-failure");

    expect(scan.diagnosis.id).toBe("dns-failure");
    expect(scan.diagnosis.primaryFailedNodeId).toBe("dns");
    expect(scan.diagnosis.confidence).toBeGreaterThanOrEqual(90);
    expect(scan.diagnosis.recommendedFixes[0]?.id).toBe("flush-dns");
  });

  it("identifies DHCP/APIPA failure at the IP node", () => {
    const scan = createScenarioScanResult("dhcp-apipa");

    expect(scan.diagnosis.id).toBe("dhcp-failure");
    expect(scan.diagnosis.primaryFailedNodeId).toBe("ip");
    expect(scan.nodes.find((node) => node.id === "ip")?.status).toBe("failed");
    expect(scan.diagnosis.recommendedFixes.some((fix) => fix.safety === "aggressive")).toBe(
      false
    );
  });

  it("does not recommend repairs for a healthy connection", () => {
    const scan = createScenarioScanResult("healthy");

    expect(scan.diagnosis.id).toBe("healthy");
    expect(scan.overallStatus).toBe("ok");
    expect(scan.diagnosis.recommendedFixes).toHaveLength(0);
  });
});
