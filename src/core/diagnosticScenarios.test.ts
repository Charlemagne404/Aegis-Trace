import { describe, expect, it } from "vitest";
import { SCENARIOS, createScenarioScanResult } from "./diagnosticScenarios";
import { TIMELINE_NODE_IDS } from "./timelineDefinition";

describe("diagnostic scenario fixtures", () => {
  it("keeps every scenario aligned to the full timeline", () => {
    for (const scenario of SCENARIOS) {
      const scan = createScenarioScanResult(scenario.id);
      expect(scan.nodes.map((node) => node.id)).toEqual(TIMELINE_NODE_IDS);
    }
  });

  it("includes evidence for every node", () => {
    for (const scenario of SCENARIOS) {
      const scan = createScenarioScanResult(scenario.id);
      expect(scan.nodes.every((node) => node.evidence.length > 0)).toBe(true);
    }
  });
});
