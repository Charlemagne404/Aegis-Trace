import JSZip from "jszip";
import { platformLabel, scanPlatform } from "./platform";
import type { DiagnosticNode, ReportFormat, ScanResult } from "./types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeFilenameSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function nodeToHtml(node: DiagnosticNode): string {
  const evidence = node.evidence
    .map(
      (item) => `
        <li>
          <strong>${escapeHtml(item.label)}</strong>
          <span>${escapeHtml(item.value)}</span>
          <em>${escapeHtml(item.status)}</em>
          ${item.detail ? `<p>${escapeHtml(item.detail)}</p>` : ""}
        </li>`
    )
    .join("");

  return `
    <section class="node ${escapeHtml(node.status)}">
      <h3>${escapeHtml(node.label)}</h3>
      <p>${escapeHtml(node.summary)}</p>
      <ul>${evidence}</ul>
    </section>`;
}

function scanSourceLabel(scan: ScanResult): string {
  return scan.mode === "fixture"
    ? "Test fixture"
    : `Live ${platformLabel(scanPlatform(scan))} scan`;
}

function nodeToSummaryBlock(node: DiagnosticNode): string {
  const evidenceLines = node.evidence.map(
    (item) =>
      `- ${item.label}: ${item.value} [${item.status}]${item.detail ? ` (${item.detail})` : ""}`
  );

  return [
    `${node.label} [${node.status.toUpperCase()}]`,
    node.summary,
    node.explanation,
    evidenceLines.length ? "Evidence:" : undefined,
    ...evidenceLines,
    node.recommendedFixes.length
      ? `Recommended fixes: ${node.recommendedFixes.map((fix) => fix.title).join(", ")}`
      : undefined
  ]
    .filter(Boolean)
    .join("\n");
}

function caseFilenamePrefix(scan: ScanResult): string {
  return `aegis-trace-case-${scan.id}`;
}

export function reportFilename(scan: ScanResult, format: ReportFormat): string {
  const extension = format === "zip" ? "zip" : format;
  return `${caseFilenamePrefix(scan)}.${extension}`;
}

export function buildJsonReport(scan: ScanResult): string {
  return JSON.stringify(
    {
      privacy:
        "This report is generated locally. It intentionally excludes saved Wi-Fi passwords and is not uploaded by Aegis Trace.",
      scan
    },
    null,
    2
  );
}

export function buildCaseSummaryText(scan: ScanResult): string {
  const failedNode = scan.nodes.find(
    (node) => node.id === scan.diagnosis.primaryFailedNodeId
  );

  return [
    "Aegis Trace Case Summary",
    "",
    `Diagnosis: ${scan.diagnosis.title}`,
    `Summary: ${scan.diagnosis.summary}`,
    `Confidence: ${scan.diagnosis.confidence}%`,
    `Source: ${scanSourceLabel(scan)}`,
    `Created: ${scan.createdAt}`,
    failedNode ? `Primary failure point: ${failedNode.label}` : "Primary failure point: none",
    "",
    "Recommended fixes:",
    ...scan.diagnosis.recommendedFixes.map(
      (fix) => `- ${fix.title} [${fix.safety}] ${fix.description}`
    ),
    "",
    "Timeline:",
    ...scan.nodes.flatMap((node) => ["", nodeToSummaryBlock(node)])
  ].join("\n");
}

export function buildHtmlReport(scan: ScanResult): string {
  const failedNode = scan.nodes.find(
    (node) => node.id === scan.diagnosis.primaryFailedNodeId
  );

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Aegis Trace Report</title>
  <style>
    :root { color-scheme: dark; font-family: Aptos, "Segoe UI", sans-serif; background: #07101d; color: #ecfeff; }
    body { margin: 0; padding: 40px; background: radial-gradient(circle at 20% 0%, rgba(56,213,255,.18), transparent 30%), #07101d; }
    main { max-width: 980px; margin: 0 auto; }
    header, section { border: 1px solid rgba(255,255,255,.12); background: rgba(13,20,36,.78); border-radius: 24px; padding: 24px; margin-bottom: 18px; box-shadow: 0 20px 80px rgba(0,0,0,.28); }
    h1, h2, h3 { margin: 0 0 10px; }
    p { color: #b9c8da; line-height: 1.6; }
    .timeline { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
    .node.ok { border-color: rgba(68,224,165,.35); }
    .node.warning { border-color: rgba(251,191,36,.45); }
    .node.failed { border-color: rgba(251,113,133,.55); }
    ul { padding-left: 18px; }
    li { margin: 10px 0; color: #dce8f7; }
    li span { color: #93c5fd; margin-left: 8px; }
    li em { color: #94a3b8; margin-left: 8px; font-style: normal; }
    .privacy { color: #fcd34d; }
    pre { white-space: pre-wrap; background: rgba(0,0,0,.28); border-radius: 16px; padding: 16px; color: #b9e6ff; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(scan.diagnosis.title)}</h1>
      <p>${escapeHtml(scan.diagnosis.summary)}</p>
      <p><strong>Confidence:</strong> ${scan.diagnosis.confidence}% · <strong>Source:</strong> ${escapeHtml(scanSourceLabel(scan))} · <strong>Created:</strong> ${escapeHtml(scan.createdAt)}</p>
      <p class="privacy">Privacy note: this local report excludes saved Wi-Fi passwords and is not uploaded by Aegis Trace.</p>
    </header>
    ${
      failedNode
        ? `<section><h2>Primary failure point</h2><p>${escapeHtml(failedNode.label)}: ${escapeHtml(failedNode.summary)}</p></section>`
        : ""
    }
    <section>
      <h2>Timeline</h2>
      <div class="timeline">${scan.nodes.map(nodeToHtml).join("")}</div>
    </section>
    <section>
      <h2>Recommended fixes</h2>
      <ul>${scan.diagnosis.recommendedFixes
        .map(
          (fix) =>
            `<li><strong>${escapeHtml(fix.title)}</strong> (${escapeHtml(fix.safety)}) - ${escapeHtml(fix.description)}</li>`
        )
        .join("")}</ul>
    </section>
    <section>
      <h2>Raw output</h2>
      ${scan.nodes
        .filter((node) => node.rawOutput)
        .map(
          (node) =>
            `<details><summary>${escapeHtml(node.label)}</summary><pre>${escapeHtml(node.rawOutput ?? "")}</pre></details>`
        )
        .join("")}
    </section>
  </main>
</body>
</html>`;
}

export async function buildZipCaseFile(scan: ScanResult): Promise<Uint8Array> {
  const zip = new JSZip();
  const rawOutputFolder = zip.folder("raw-output");
  const exportedAt = new Date().toISOString();

  zip.file(
    "README.txt",
    [
      "Aegis Trace Case File",
      "",
      "This archive stays local to the device unless you manually share it.",
      "It excludes saved Wi-Fi passwords, but it may contain adapter names, IP addresses, DNS servers, and command output.",
      "",
      "Contents:",
      "- diagnosis-summary.txt: plain-language summary of the failure chain",
      "- timeline-report.html: styled report for easy review",
      "- scan-data.json: full structured diagnostic payload",
      "- manifest.json: export metadata",
      "- raw-output/: per-node command output when available"
    ].join("\n")
  );
  zip.file("diagnosis-summary.txt", buildCaseSummaryText(scan));
  zip.file("timeline-report.html", buildHtmlReport(scan));
  zip.file("scan-data.json", buildJsonReport(scan));
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        exportType: "aegis-trace-case-file",
        exportedAt,
        scanId: scan.id,
        createdAt: scan.createdAt,
        mode: scan.mode,
        source: scanSourceLabel(scan),
        diagnosis: {
          id: scan.diagnosis.id,
          title: scan.diagnosis.title,
          summary: scan.diagnosis.summary,
          confidence: scan.diagnosis.confidence,
          severity: scan.diagnosis.severity,
          primaryFailedNodeId: scan.diagnosis.primaryFailedNodeId
        },
        nodes: scan.nodes.map((node) => ({
          id: node.id,
          label: node.label,
          status: node.status,
          severity: node.severity,
          hasRawOutput: Boolean(node.rawOutput)
        }))
      },
      null,
      2
    )
  );

  for (const node of scan.nodes) {
    if (!node.rawOutput) {
      continue;
    }

    rawOutputFolder?.file(
      `${sanitizeFilenameSegment(node.id)}-${sanitizeFilenameSegment(node.label)}.txt`,
      node.rawOutput
    );
  }

  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(filename, blob);
}

export function downloadBinaryFile(
  filename: string,
  content: Uint8Array,
  mimeType: string
): void {
  const copied = new Uint8Array(content.byteLength);
  copied.set(content);
  const blob = new Blob([copied.buffer], { type: mimeType });
  downloadBlob(filename, blob);
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function uint8ArrayToBase64(content: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < content.length; index += chunkSize) {
    const chunk = content.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}
