import type {
  DiagnosticNode,
  DiagnosticStatus,
  EvidenceItem,
  FixAction,
  FixSafety,
  OverallDiagnosis,
  ScanHistoryEntry,
  ScanResult,
  Severity,
  PlatformId
} from "./types";

const SCAN_HISTORY_STORAGE_KEY = "aegis.scan-history.v1";
const SCAN_HISTORY_LIMIT = 18;

const DIAGNOSTIC_STATUSES = new Set<DiagnosticStatus>([
  "ok",
  "warning",
  "failed",
  "unknown",
  "skipped",
  "pending",
  "running"
]);
const SEVERITIES = new Set<Severity>(["info", "low", "medium", "high", "critical"]);
const FIX_SAFETIES = new Set<FixSafety>(["safe", "moderate", "aggressive"]);
const PLATFORM_IDS = new Set<PlatformId>(["windows", "macos", "linux", "unknown"]);
const SCAN_HISTORY_REASONS = new Set<ScanHistoryEntry["reason"]>([
  "manual",
  "scenario",
  "verification"
]);
const MOCK_SCENARIO_IDS = new Set([
  "healthy",
  "dns-failure",
  "dhcp-apipa",
  "no-adapter",
  "wlan-service-stopped",
  "gateway-unreachable",
  "internet-unreachable",
  "proxy-app-issue",
  "windows-false-negative",
  "captive-portal"
]);

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isDiagnosticStatus(value: unknown): value is DiagnosticStatus {
  return typeof value === "string" && DIAGNOSTIC_STATUSES.has(value as DiagnosticStatus);
}

function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && SEVERITIES.has(value as Severity);
}

function isFixSafety(value: unknown): value is FixSafety {
  return typeof value === "string" && FIX_SAFETIES.has(value as FixSafety);
}

function isFixAction(value: unknown): value is FixAction {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    isFixSafety(value.safety) &&
    typeof value.requiresAdmin === "boolean" &&
    typeof value.estimatedImpact === "string" &&
    (value.commandsPreview === undefined || isStringArray(value.commandsPreview)) &&
    (value.warning === undefined || typeof value.warning === "string")
  );
}

function isEvidenceItem(value: unknown): value is EvidenceItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.value === "string" &&
    isDiagnosticStatus(value.status) &&
    (value.detail === undefined || typeof value.detail === "string")
  );
}

function isDiagnosticNode(value: unknown): value is DiagnosticNode {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    (value.technicalLabel === undefined || typeof value.technicalLabel === "string") &&
    typeof value.icon === "string" &&
    isDiagnosticStatus(value.status) &&
    isSeverity(value.severity) &&
    typeof value.summary === "string" &&
    typeof value.explanation === "string" &&
    isStringArray(value.checks) &&
    Array.isArray(value.evidence) &&
    value.evidence.every(isEvidenceItem) &&
    isStringArray(value.likelyCauses) &&
    Array.isArray(value.recommendedFixes) &&
    value.recommendedFixes.every(isFixAction) &&
    (value.rawOutput === undefined || typeof value.rawOutput === "string") &&
    (value.startedAt === undefined || isValidTimestamp(value.startedAt)) &&
    (value.completedAt === undefined || isValidTimestamp(value.completedAt)) &&
    (value.progressState === undefined ||
      value.progressState === "queued" ||
      value.progressState === "running" ||
      value.progressState === "checked")
  );
}

function isOverallDiagnosis(value: unknown): value is OverallDiagnosis {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    typeof value.confidence === "number" &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 100 &&
    isSeverity(value.severity) &&
    (value.primaryFailedNodeId === undefined || typeof value.primaryFailedNodeId === "string") &&
    Array.isArray(value.recommendedFixes) &&
    value.recommendedFixes.every(isFixAction)
  );
}

function isScanResult(value: unknown): value is ScanResult {
  if (!isRecord(value)) {
    return false;
  }

  const environment = value.environment;
  return (
    typeof value.id === "string" &&
    isValidTimestamp(value.createdAt) &&
    (value.mode === "mock" || value.mode === "real") &&
    isDiagnosticStatus(value.overallStatus) &&
    isOverallDiagnosis(value.diagnosis) &&
    Array.isArray(value.nodes) &&
    value.nodes.length > 0 &&
    value.nodes.every(isDiagnosticNode) &&
    isRecord(environment) &&
    typeof environment.os === "string" &&
    typeof environment.appVersion === "string" &&
    (environment.platform === undefined ||
      (typeof environment.platform === "string" &&
        PLATFORM_IDS.has(environment.platform as PlatformId))) &&
    (environment.hostname === undefined || typeof environment.hostname === "string") &&
    (environment.isAdmin === undefined || typeof environment.isAdmin === "boolean")
  );
}

function isScanHistoryReason(value: unknown): value is ScanHistoryEntry["reason"] {
  return typeof value === "string" && SCAN_HISTORY_REASONS.has(value as ScanHistoryEntry["reason"]);
}

function isScanHistoryEntry(value: unknown): value is ScanHistoryEntry {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isValidTimestamp(value.capturedAt) &&
    isScanHistoryReason(value.reason) &&
    (value.scenarioId === undefined ||
      (typeof value.scenarioId === "string" && MOCK_SCENARIO_IDS.has(value.scenarioId))) &&
    (value.relatedFixId === undefined || typeof value.relatedFixId === "string") &&
    (value.relatedFixTitle === undefined || typeof value.relatedFixTitle === "string") &&
    isScanResult(value.scan)
  );
}

function normalizeHistory(entries: ScanHistoryEntry[]): ScanHistoryEntry[] {
  return [...entries]
    .filter(isScanHistoryEntry)
    .sort(
      (left, right) =>
        new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime()
    )
    .slice(0, SCAN_HISTORY_LIMIT);
}

export function loadScanHistory(): ScanHistoryEntry[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const storedValue = window.localStorage.getItem(SCAN_HISTORY_STORAGE_KEY);
    if (!storedValue) {
      return [];
    }

    const parsedValue = JSON.parse(storedValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    const entries = parsedValue.filter(isScanHistoryEntry);

    return normalizeHistory(entries);
  } catch (error) {
    console.warn("Failed to load scan history from storage", error);
    return [];
  }
}

export function saveScanHistory(entries: ScanHistoryEntry[]): void {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(
      SCAN_HISTORY_STORAGE_KEY,
      JSON.stringify(normalizeHistory(entries))
    );
  } catch (error) {
    console.warn("Failed to save scan history to storage", error);
  }
}

export function upsertScanHistoryEntry(
  entries: ScanHistoryEntry[],
  nextEntry: ScanHistoryEntry
): ScanHistoryEntry[] {
  return normalizeHistory(
    [nextEntry, ...entries].filter((entry, index, collection) => {
      return (
        collection.findIndex((candidate) => candidate.id === entry.id) === index
      );
    })
  );
}

export function clearScanHistory(): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(SCAN_HISTORY_STORAGE_KEY);
}
