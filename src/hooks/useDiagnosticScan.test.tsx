import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createScenarioScanResult } from "@/core/diagnosticScenarios";
import type { ScanRunMetadata } from "@/core/types";
import type { PlatformAdapter } from "@/platform/platformAdapter";
import { useDiagnosticScan } from "./useDiagnosticScan";

function createAdapter(runScan: PlatformAdapter["runScan"]): PlatformAdapter {
  return {
    kind: "tauri",
    runScan,
    runFix: vi.fn(),
    exportReport: vi.fn(),
    getEnvironmentInfo: vi.fn(),
    getRuntimeHealth: vi.fn(),
    getSystemMetrics: vi.fn()
  };
}

describe("useDiagnosticScan", () => {
  it("commits the final scan and forwards the run metadata", async () => {
    const initialScan = createScenarioScanResult("healthy");
    const finalScan = createScenarioScanResult("dns-failure");
    const metadata: ScanRunMetadata = {
      reason: "manual"
    };
    const onScanComplete = vi.fn();
    const runScan = vi.fn(async ({ runId, onProgress }) => {
      onProgress?.({
        runId,
        kind: "scan-started",
        totalNodes: finalScan.nodes.length,
        message: "Starting"
      });
      onProgress?.({
        runId,
        kind: "node-started",
        nodeId: "device",
        nodeIndex: 0,
        totalNodes: finalScan.nodes.length,
        message: "Checking device"
      });
      onProgress?.({
        runId,
        kind: "node-progressed",
        nodeId: "device",
        nodeIndex: 0,
        nodeStatus: "running",
        totalNodes: finalScan.nodes.length,
        message: "Reading device evidence"
      });
      onProgress?.({
        runId,
        kind: "node-completed",
        nodeId: "device",
        nodeIndex: 0,
        nodeStatus: "ok",
        nodeSummary: "Device checked",
        totalNodes: finalScan.nodes.length,
        message: "Device checked"
      });
      onProgress?.({
        runId,
        kind: "scan-finished",
        totalNodes: finalScan.nodes.length,
        message: "Finished"
      });
      return finalScan;
    });
    const adapter = createAdapter(runScan);
    const { result } = renderHook(() =>
      useDiagnosticScan({ initialScan, adapter, onScanComplete })
    );

    await act(async () => {
      await result.current.runScan(metadata);
    });

    expect(runScan).toHaveBeenCalledTimes(1);
    expect(result.current.scanResult).toBe(finalScan);
    expect(result.current.displayNodes).toBe(finalScan.nodes);
    expect(result.current.isScanning).toBe(false);
    expect(onScanComplete).toHaveBeenCalledWith(finalScan, metadata);
  });

  it("refuses a second scan while the first scan is still running", async () => {
    const initialScan = createScenarioScanResult("healthy");
    const finalScan = createScenarioScanResult("healthy");
    let releaseFirstScan!: (scan: typeof finalScan) => void;
    const firstScan = new Promise<typeof finalScan>((resolve) => {
      releaseFirstScan = resolve;
    });
    const runScan = vi.fn(async () => firstScan);
    const adapter = createAdapter(runScan);
    const { result } = renderHook(() => useDiagnosticScan({ initialScan, adapter }));

    let firstRun: ReturnType<typeof result.current.runScan> | undefined;
    await act(async () => {
      firstRun = result.current.runScan();
    });

    expect(result.current.canStartScan()).toBe(false);
    await waitFor(() => expect(result.current.isScanning).toBe(true));

    let secondRun: ReturnType<typeof result.current.runScan> | undefined;
    await act(async () => {
      secondRun = result.current.runScan();
    });

    await expect(secondRun).resolves.toBeUndefined();
    expect(runScan).toHaveBeenCalledTimes(1);

    releaseFirstScan(finalScan);
    await act(async () => {
      await firstRun;
    });

    expect(result.current.isScanning).toBe(false);
    expect(result.current.scanResult).toBe(finalScan);
    expect(result.current.canStartScan()).toBe(true);
  });

  it("aborts an in-flight scan when a saved result is loaded", async () => {
    const initialScan = createScenarioScanResult("healthy");
    const replacementScan = createScenarioScanResult("dns-failure");
    let observedSignal: AbortSignal | undefined;
    const runScan = vi.fn(({ signal }: { signal?: AbortSignal }) =>
      new Promise<typeof replacementScan>((_resolve, reject) => {
        observedSignal = signal;
        signal?.addEventListener(
          "abort",
          () => reject(new Error("scan aborted")),
          { once: true }
        );
      })
    );
    const adapter = createAdapter(runScan);
    const { result } = renderHook(() =>
      useDiagnosticScan({ initialScan, adapter })
    );

    let pendingRun: ReturnType<typeof result.current.runScan> | undefined;
    await act(async () => {
      pendingRun = result.current.runScan();
    });
    await waitFor(() => expect(result.current.isScanning).toBe(true));

    await act(async () => {
      result.current.loadScan(replacementScan);
      await pendingRun;
    });

    expect(observedSignal?.aborted).toBe(true);
    expect(result.current.isScanning).toBe(false);
    expect(result.current.scanResult).toBe(replacementScan);
    expect(result.current.canStartScan()).toBe(true);
  });
});
