import type {
  EnvironmentInfo,
  FixAction,
  FixConfirmation,
  FixExecutionResult,
  ReportFormat,
  RuntimeHealth,
  ScanProgress,
  ScanResult,
  SystemMetrics
} from "@/core/types";

export type RunScanOptions = {
  runId: string;
  onProgress?: (progress: ScanProgress) => void;
  signal?: AbortSignal;
};

export type PlatformAdapter = {
  kind: "tauri";
  runScan: (options: RunScanOptions) => Promise<ScanResult>;
  runFix: (
    fix: FixAction,
    confirmation?: FixConfirmation
  ) => Promise<FixExecutionResult>;
  exportReport: (scan: ScanResult, format: ReportFormat) => Promise<string>;
  getEnvironmentInfo: () => Promise<EnvironmentInfo>;
  getRuntimeHealth: () => Promise<RuntimeHealth>;
  getSystemMetrics: () => Promise<SystemMetrics>;
};
