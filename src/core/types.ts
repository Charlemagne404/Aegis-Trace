export type DiagnosticStatus =
  | "ok"
  | "warning"
  | "failed"
  | "unknown"
  | "skipped"
  | "pending"
  | "running";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export type FixSafety = "safe" | "moderate" | "aggressive";

export type AppMode = "normal" | "technician";

export type ThemeMode = "system" | "dark" | "light";

export type WorkspaceMode = "live" | "preview" | "lab" | "degraded";

export type PlatformId = "windows" | "macos" | "linux" | "unknown";

export type ScanHistoryReason = "manual" | "scenario" | "verification";

export type ReportFormat = "json" | "html" | "zip";

export type RepairVerificationStatus =
  | "resolved"
  | "improved"
  | "unchanged"
  | "worse"
  | "blocked";

export type MockScenarioId =
  | "healthy"
  | "dns-failure"
  | "dhcp-apipa"
  | "no-adapter"
  | "wlan-service-stopped"
  | "gateway-unreachable"
  | "internet-unreachable"
  | "proxy-app-issue"
  | "windows-false-negative"
  | "captive-portal";

export type EvidenceItem = {
  id: string;
  label: string;
  value: string;
  status: DiagnosticStatus;
  detail?: string;
};

export type FixAction = {
  id: string;
  title: string;
  description: string;
  safety: FixSafety;
  requiresAdmin: boolean;
  commandsPreview?: string[];
  estimatedImpact: string;
  warning?: string;
};

export type FixConfirmation = {
  acknowledged: boolean;
  typedPhrase?: string;
};

export type DiagnosticNode = {
  id: string;
  label: string;
  technicalLabel?: string;
  icon: string;
  status: DiagnosticStatus;
  severity: Severity;
  summary: string;
  explanation: string;
  checks: string[];
  evidence: EvidenceItem[];
  likelyCauses: string[];
  recommendedFixes: FixAction[];
  rawOutput?: string;
  startedAt?: string;
  completedAt?: string;
  progressState?: "queued" | "running" | "checked";
};

export type OverallDiagnosis = {
  id: string;
  title: string;
  summary: string;
  confidence: number;
  severity: Severity;
  primaryFailedNodeId?: string;
  recommendedFixes: FixAction[];
};

export type ScanResult = {
  id: string;
  createdAt: string;
  mode: "mock" | "real";
  overallStatus: DiagnosticStatus;
  diagnosis: OverallDiagnosis;
  nodes: DiagnosticNode[];
  environment: {
    os: string;
    platform?: PlatformId;
    hostname?: string;
    appVersion: string;
    isAdmin?: boolean;
  };
};

export type FixExecutionResult = {
  fixId: string;
  status: "success" | "failed" | "blocked" | "simulated";
  title: string;
  message: string;
  stdout?: string;
  stderr?: string;
  requiresAdmin?: boolean;
};

export type EnvironmentInfo = ScanResult["environment"] & {
  platform: PlatformId;
  isWindows: boolean;
  isTauri: boolean;
};

export type RuntimeIssueSeverity = "info" | "warning" | "error";

export type RuntimeIssue = {
  id: string;
  severity: RuntimeIssueSeverity;
  title: string;
  detail: string;
};

export type RuntimeCapabilities = {
  canRunTimelineScans: boolean;
  canRunLiveScans: boolean;
  canRunFixes: boolean;
  canExportReports: boolean;
  canCollectSystemMetrics: boolean;
};

export type RuntimeHealth = {
  checkedAt: string;
  state: "ready" | "preview" | "degraded";
  summary: string;
  detail: string;
  capabilities: RuntimeCapabilities;
  issues: RuntimeIssue[];
};

export type SystemMetrics = {
  collectedAt: string;
  source: "system" | "browser";
  uptimeSeconds: number | null;
  cpuUsagePercent: number | null;
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
  networkReceivedBytes: number | null;
  networkTransmittedBytes: number | null;
};

export type ScanProgress = {
  runId: string;
  kind:
    | "scan-started"
    | "node-started"
    | "node-progressed"
    | "node-completed"
    | "scan-finished";
  nodeId?: string;
  nodeLabel?: string;
  nodeIndex?: number;
  nodeStatus?: DiagnosticStatus;
  nodeSummary?: string;
  totalNodes: number;
  message: string;
};

export type ScanRunMetadata = {
  reason: ScanHistoryReason;
  scenarioId?: MockScenarioId;
  relatedFixId?: string;
  relatedFixTitle?: string;
};

export type RepairNodeTransition = {
  nodeId: string;
  label: string;
  beforeStatus: DiagnosticStatus;
  afterStatus: DiagnosticStatus;
  beforeSummary: string;
  afterSummary: string;
};

export type RepairVerification = {
  id: string;
  fixId: string;
  fixTitle: string;
  status: RepairVerificationStatus;
  verifiedAt: string;
  beforeScanId: string;
  afterScanId?: string;
  beforeDiagnosis: string;
  afterDiagnosis?: string;
  summary: string;
  detail: string;
  changedNodes: RepairNodeTransition[];
};

export type ScanHistoryEntry = {
  id: string;
  capturedAt: string;
  reason: ScanHistoryReason;
  scenarioId?: MockScenarioId;
  relatedFixId?: string;
  relatedFixTitle?: string;
  scan: ScanResult;
};
