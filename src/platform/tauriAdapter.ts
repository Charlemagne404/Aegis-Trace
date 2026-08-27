import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  createDegradedRuntimeHealth,
  createPreviewRuntimeHealth
} from "@/core/runtimeHealth";
import { isLivePlatform } from "@/core/platform";
import { isAllowlistedFixId } from "@/core/fixRegistry";
import {
  buildHtmlReport,
  buildJsonReport,
  buildZipCaseFile,
  downloadBinaryFile,
  downloadTextFile,
  reportFilename,
  uint8ArrayToBase64
} from "@/core/reportExport";
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
import { mockAdapter } from "./mockAdapter";
import { getBrowserEnvironmentInfo, getBrowserSystemMetrics } from "./browserEnvironment";
import type { PlatformAdapter } from "./platformAdapter";

export function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && isTauri();
}

type SerializedReportPayload = {
  content: string;
  encoding: "utf8" | "base64";
  mimeType: string;
};

class TauriCommandError extends Error {
  constructor(
    readonly command: string,
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "TauriCommandError";
  }
}

let environmentInfoPromise: Promise<EnvironmentInfo> | undefined;

async function getResolvedEnvironmentInfo(): Promise<EnvironmentInfo> {
  if (!hasTauriRuntime()) {
    return getBrowserEnvironmentInfo();
  }

  if (!environmentInfoPromise) {
    environmentInfoPromise = invoke<EnvironmentInfo>("get_environment_info", {}).catch((error) => {
      console.warn("Tauri command get_environment_info failed; using synthesized runtime info", error);
      return {
        ...getBrowserEnvironmentInfo(true),
        isTauri: true
      };
    });
  }

  return environmentInfoPromise;
}

async function invokeTauriCommand<T>(
  command: string,
  payload: Record<string, unknown>
): Promise<T> {
  try {
    return await invoke<T>(command, payload);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : `Unknown Tauri error while running ${command}.`;
    throw new TauriCommandError(
      command,
      `Aegis could not complete the native '${command}' command. ${detail}`,
      error
    );
  }
}

async function serializeReport(
  scan: ScanResult,
  format: ReportFormat
): Promise<SerializedReportPayload> {
  if (format === "json") {
    return {
      content: buildJsonReport(scan),
      encoding: "utf8",
      mimeType: "application/json"
    };
  }

  if (format === "html") {
    return {
      content: buildHtmlReport(scan),
      encoding: "utf8",
      mimeType: "text/html"
    };
  }

  const content = await buildZipCaseFile(scan);
  return {
    content: uint8ArrayToBase64(content),
    encoding: "base64",
    mimeType: "application/zip"
  };
}

async function exportReportFallback(
  scan: ScanResult,
  format: ReportFormat,
  payload: SerializedReportPayload
): Promise<string> {
  const filename = reportFilename(scan, format);

  if (format === "zip") {
    const content = await buildZipCaseFile(scan);
    downloadBinaryFile(filename, content, payload.mimeType);
    return filename;
  }

  downloadTextFile(filename, payload.content, payload.mimeType);
  return filename;
}

export const tauriAdapter: PlatformAdapter = {
  kind: "tauri",
  async runScan({ scenarioId, runId, onProgress }) {
    if (!hasTauriRuntime()) {
      return mockAdapter.runScan({ scenarioId, runId, onProgress });
    }

    const environment = await getResolvedEnvironmentInfo();
    if (!isLivePlatform(environment.platform)) {
      return mockAdapter.runScan({ scenarioId, runId, onProgress });
    }

    const unlisten = onProgress
      ? await listen<ScanProgress>("aegis-trace://scan-progress", (event) => {
          if (event.payload.runId === runId) {
            onProgress(event.payload);
          }
        })
      : undefined;

    try {
      return await invokeTauriCommand<ScanResult>("run_scan", { scenarioId, runId });
    } finally {
      await unlisten?.();
    }
  },
  async runFix(fix: FixAction, confirmation?: FixConfirmation) {
    if (!isAllowlistedFixId(fix.id)) {
      return {
        fixId: fix.id,
        status: "blocked",
        title: "Unknown fix",
        message: "The requested fix ID is not in the frontend allowlist."
      };
    }

    const environment = await getResolvedEnvironmentInfo();
    if (!hasTauriRuntime() || !isLivePlatform(environment.platform)) {
      return {
        fixId: fix.id,
        status: "blocked",
        title: "Fix unavailable",
        message:
          "Real fix execution is only available inside the Windows or macOS Tauri build. No command was executed."
      };
    }

    try {
      return await invokeTauriCommand<FixExecutionResult>("run_fix", {
        fixId: fix.id,
        confirmation
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Aegis could not start the requested fix in the native runtime.";

      return {
        fixId: fix.id,
        status: "blocked",
        title: "Fix execution failed",
        message,
        requiresAdmin: fix.requiresAdmin
      };
    }
  },
  async exportReport(scan, format) {
    const payload = await serializeReport(scan, format);

    if (!hasTauriRuntime()) {
      return exportReportFallback(scan, format, payload);
    }

    try {
      return await invoke<string>("export_report", {
        scan,
        format,
        content: payload.content,
        encoding: payload.encoding
      });
    } catch (error) {
      console.warn("Tauri command export_report failed; using browser fallback", error);
      return exportReportFallback(scan, format, payload);
    }
  },
  async getEnvironmentInfo() {
    return getResolvedEnvironmentInfo();
  },
  async getRuntimeHealth() {
    if (!hasTauriRuntime()) {
      return createPreviewRuntimeHealth(getBrowserEnvironmentInfo());
    }

    try {
      return await invokeTauriCommand<RuntimeHealth>("get_runtime_health", {});
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : "Aegis could not verify the native desktop runtime.";
      return createDegradedRuntimeHealth(detail);
    }
  },
  async getSystemMetrics() {
    if (!hasTauriRuntime()) {
      return getBrowserSystemMetrics();
    }

    try {
      return await invokeTauriCommand<SystemMetrics>("get_system_metrics", {});
    } catch (error) {
      console.warn("Tauri command get_system_metrics failed; using browser metrics", error);
      return getBrowserSystemMetrics();
    }
  }
};
