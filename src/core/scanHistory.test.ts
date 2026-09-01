import { beforeEach, describe, expect, it } from "vitest";
import { createScenarioScanResult } from "./diagnosticScenarios";
import {
  clearScanHistory,
  loadScanHistory,
  saveScanHistory,
  upsertScanHistoryEntry
} from "./scanHistory";
import type { ScanHistoryEntry } from "./types";

function makeEntry(id: string, capturedAt: string): ScanHistoryEntry {
  const scan = createScenarioScanResult("healthy");
  scan.mode = "real";
  scan.id = id;
  scan.createdAt = capturedAt;

  return {
    id,
    capturedAt,
    reason: "manual",
    scan
  };
}

describe("scan history storage", () => {
  beforeEach(() => {
    clearScanHistory();
  });

  it("saves and reloads history entries from local storage", () => {
    const entries = [
      makeEntry("scan-1", "2026-05-27T09:15:00.000Z"),
      makeEntry("scan-2", "2026-05-27T09:16:00.000Z")
    ];

    saveScanHistory(entries);

    expect(loadScanHistory().map((entry) => entry.id)).toEqual(["scan-2", "scan-1"]);
  });

  it("keeps the newest copy of an entry when upserting", () => {
    const olderEntry = makeEntry("scan-1", "2026-05-27T09:15:00.000Z");
    const newerEntry = makeEntry("scan-1", "2026-05-27T09:18:00.000Z");

    const nextHistory = upsertScanHistoryEntry([olderEntry], newerEntry);

    expect(nextHistory).toHaveLength(1);
    expect(nextHistory[0]?.capturedAt).toBe("2026-05-27T09:18:00.000Z");
  });

  it("ignores malformed or incomplete saved scans", () => {
    const validEntry = makeEntry("valid", "2026-05-27T09:18:00.000Z");
    window.localStorage.setItem(
      "aegis.scan-history.v2",
      JSON.stringify([
        validEntry,
        { id: "broken", capturedAt: "not-a-date", reason: "manual", scan: {} },
        { id: "wrong-reason", capturedAt: validEntry.capturedAt, reason: "scenario", scan: validEntry.scan }
      ])
    );

    expect(loadScanHistory().map((entry) => entry.id)).toEqual(["valid"]);
  });
});
