import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { createScenarioScanResult } from "./diagnosticScenarios";
import { buildCaseSummaryText, buildZipCaseFile } from "./reportExport";

describe("report export", () => {
  it("builds a readable plain-language case summary", () => {
    const scan = createScenarioScanResult("dns-failure");
    const summary = buildCaseSummaryText(scan);

    expect(summary).toContain("Aegis Trace Case Summary");
    expect(summary).toContain(scan.diagnosis.title);
    expect(summary).toContain("Recommended fixes:");
    expect(summary).toContain("Timeline:");
  });

  it("packages a ZIP case file with structured and human-readable evidence", async () => {
    const scan = createScenarioScanResult("dns-failure");
    const zipBytes = await buildZipCaseFile(scan);
    const archive = await JSZip.loadAsync(zipBytes);
    const filenames = Object.keys(archive.files);

    expect(filenames).toContain("README.txt");
    expect(filenames).toContain("diagnosis-summary.txt");
    expect(filenames).toContain("timeline-report.html");
    expect(filenames).toContain("scan-data.json");
    expect(filenames).toContain("manifest.json");
    expect(
      filenames.some((filename) => filename.startsWith("raw-output/") && !archive.files[filename].dir)
    ).toBe(true);

    const manifestContent = await archive.file("manifest.json")?.async("string");
    expect(manifestContent).toBeTruthy();

    const manifest = JSON.parse(manifestContent ?? "{}") as {
      exportType?: string;
      scanId?: string;
      diagnosis?: { title?: string };
    };

    expect(manifest.exportType).toBe("aegis-trace-case-file");
    expect(manifest.scanId).toBe(scan.id);
    expect(manifest.diagnosis?.title).toBe(scan.diagnosis.title);
  });
});
