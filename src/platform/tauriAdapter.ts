import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  createDegradedRuntimeHealth,
  createUnavailableRuntimeHealth
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
import { getBrowserEnvironmentInfo, getUnavailableSystemMetrics } from "./browserEnvironment";
import type { PlatformAdapter } from "./platformAdapter";

export function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && isTauri();
}

function createScanAbortError() {
  const error = new Error("Diagnostic scan was cancelled.");
  error.name = "AbortError";
  return error;
}

function throwIfScanAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createScanAbortError();
  }
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
  async runScan({ runId, onProgress, signal }) {
    throwIfScanAborted(signal);

    if (!hasTauriRuntime()) {
      throw new TauriCommandError(
        "run_scan",
        "Live diagnostics require the installed Aegis Trace desktop app."
      );
    }

    const environment = await getResolvedEnvironmentInfo();
    throwIfScanAborted(signal);
    if (!isLivePlatform(environment.platform)) {
      throw new TauriCommandError(
        "run_scan",
        "Live diagnostics are not supported on this operating system."
      );
    }

    const unlisten = onProgress
      ? await listen<ScanProgress>("aegis-trace://scan-progress", (event) => {
          if (event.payload.runId === runId) {
            onProgress(event.payload);
          }
        })
      : undefined;
    let cancelRequest: Promise<unknown> | undefined;
    const requestCancel = () => {
      if (!cancelRequest) {
        cancelRequest = invoke<boolean>("cancel_scan", { runId }).catch((error) => {
          console.warn("Tauri scan cancellation request failed", error);
        });
      }
    };

    try {
      signal?.addEventListener("abort", requestCancel, { once: true });
      throwIfScanAborted(signal);
      return await invokeTauriCommand<ScanResult>("run_scan", { runId });
    } finally {
      signal?.removeEventListener("abort", requestCancel);
      try {
        await unlisten?.();
      } catch (error) {
        console.warn("Tauri scan progress listener cleanup failed", error);
      }
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
          "Real fix execution is only available inside a supported Aegis Tauri desktop build. No command was executed."
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
      return createUnavailableRuntimeHealth(getBrowserEnvironmentInfo());
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
      return getUnavailableSystemMetrics();
    }

    try {
      return await invokeTauriCommand<SystemMetrics>("get_system_metrics", {});
    } catch (error) {
      console.warn("Tauri command get_system_metrics failed", error);
      return getUnavailableSystemMetrics();
    }
  }
};
