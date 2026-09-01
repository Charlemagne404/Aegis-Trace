import { describe, expect, it } from "vitest";
import { createInitialScanResult } from "./initialScan";

describe("initial scan state", () => {
  it("starts without claiming any network facts", () => {
    const result = createInitialScanResult();

    expect(result.mode).toBe("real");
    expect(result.overallStatus).toBe("pending");
    expect(result.diagnosis.id).toBe("not-scanned");
    expect(result.diagnosis.confidence).toBe(0);
    expect(result.nodes).toHaveLength(10);
    expect(result.nodes.every((node) => node.status === "pending")).toBe(true);
    expect(result.nodes.every((node) => node.evidence.length === 0)).toBe(true);
  });
});
