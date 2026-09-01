import packageInfo from "../../package.json";
import { TIMELINE_DEFINITION } from "./timelineDefinition";
import type { ScanResult } from "./types";

export const INITIAL_SCAN_DIAGNOSIS_ID = "not-scanned";

/**
 * Creates the honest empty state shown before the first native scan completes.
 * It contains no inferred network facts and is never written to scan history.
 */
export function createInitialScanResult(): ScanResult {
  const createdAt = new Date().toISOString();

  return {
    id: "not-run",
    createdAt,
    mode: "real",
    overallStatus: "pending",
    diagnosis: {
      id: INITIAL_SCAN_DIAGNOSIS_ID,
      title: "Ready to trace your connection",
      summary:
        "Run a scan to collect live evidence from this device and identify the first meaningful break in the connection path.",
      confidence: 0,
      severity: "info",
      recommendedFixes: []
    },
    nodes: TIMELINE_DEFINITION.map((definition) => ({
      ...definition,
      status: "pending",
      severity: "info",
      summary: "Ready to scan",
      explanation: "Run a live scan to collect evidence for this stage.",
      evidence: [],
      likelyCauses: [],
      recommendedFixes: [],
      progressState: "queued"
    })),
    environment: {
      os: "Unknown",
      platform: "unknown",
      appVersion: packageInfo.version
    }
  };
}
