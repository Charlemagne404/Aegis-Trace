import { useCallback, useRef, useState } from "react";
import { runDiagnosticEngine } from "@/core/diagnosticEngine";
import type {
  DiagnosticNode,
  MockScenarioId,
  ScanProgress,
  ScanResult,
  ScanRunMetadata
} from "@/core/types";
import type { PlatformAdapter } from "@/platform/platformAdapter";
import { TimeoutError, withTimeout } from "@/utils/async";

type UseDiagnosticScanInput = {
  adapter: PlatformAdapter;
  initialScan: ScanResult;
  onScanComplete?: (scan: ScanResult, metadata?: ScanRunMetadata) => void;
};

const SCAN_TIMEOUT_MS = 150_000;

function severityForStatus(status: DiagnosticNode["status"]): DiagnosticNode["severity"] {
  if (status === "failed") return "high";
  if (status === "warning") return "medium";
  if (status === "unknown" || status === "skipped") return "low";
  return "info";
}

function buildPendingNodes(nodes: DiagnosticNode[]): DiagnosticNode[] {
  return nodes.map((node) => ({
    ...node,
    evidence: [],
    likelyCauses: [],
    recommendedFixes: [],
    rawOutput: undefined,
    status: "pending",
    severity: "info",
    progressState: "queued",
    summary: "Queued for scan...",
    explanation: "Aegis will fill this stage as soon as the live scan reaches it."
  }));
}

function markNodeRunning(
  nodes: DiagnosticNode[],
  activeNodeId: string | undefined,
  activeMessage: string | undefined
): DiagnosticNode[] {
  return nodes.map((node) => {
    if (node.id === activeNodeId) {
      return {
        ...node,
        status: "running",
        severity: "info",
        progressState: "running",
        summary: activeMessage ?? `Checking ${node.label.toLowerCase()}...`
      };
    }

    if (node.progressState === "checked") {
      return node;
    }

    if (node.progressState === "running") {
      return {
        ...node,
        status: "pending",
        severity: "info",
        progressState: "queued",
        summary: "Waiting for earlier checks..."
      };
    }

    return node;
  });
}

function applyNodeCompletion(
  nodes: DiagnosticNode[],
  progress: ScanProgress
): DiagnosticNode[] {
  if (!progress.nodeId || !progress.nodeStatus) {
    return nodes;
  }

  const nodeStatus = progress.nodeStatus;

  return nodes.map((node) =>
    node.id === progress.nodeId
      ? {
          ...node,
          status: nodeStatus,
          severity: severityForStatus(nodeStatus),
          progressState: "checked",
          summary: progress.nodeSummary ?? node.summary
        }
      : node
  );
}

function createScanRunId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useDiagnosticScan({
  adapter,
  initialScan,
  onScanComplete
}: UseDiagnosticScanInput) {
  const [scanResult, setScanResult] = useState(initialScan);
  const [displayNodes, setDisplayNodes] = useState(initialScan.nodes);
  const [isScanning, setIsScanning] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | undefined>();
  const [completedNodeIds, setCompletedNodeIds] = useState<string[]>([]);
  const [scanProgress, setScanProgress] = useState<ScanProgress | undefined>();
  const [scanError, setScanError] = useState<string | undefined>();
  const [scanDurationMs, setScanDurationMs] = useState<number | undefined>();
  const runIdRef = useRef(0);
  const scanResultRef = useRef(initialScan);
  const activeNodeIdRef = useRef<string | undefined>(undefined);
  const completedNodeIdsRef = useRef<string[]>([]);
  const isScanningRef = useRef(false);

  const isStaleRun = (runId: number) => runIdRef.current !== runId;

  const canStartScan = useCallback(() => !isScanningRef.current, []);

  const resetLiveState = useCallback(() => {
    activeNodeIdRef.current = undefined;
    completedNodeIdsRef.current = [];
    setActiveNodeId(undefined);
    setCompletedNodeIds([]);
    setScanProgress(undefined);
  }, []);

  const loadScan = useCallback((nextScan: ScanResult) => {
    runIdRef.current += 1;
    scanResultRef.current = nextScan;
    setScanResult(nextScan);
    setDisplayNodes(nextScan.nodes);
    resetLiveState();
    setIsScanning(false);
    isScanningRef.current = false;
    setScanError(undefined);
    setScanDurationMs(undefined);
  }, [resetLiveState]);

  const runScan = useCallback(
    async (scenarioId?: MockScenarioId, metadata?: ScanRunMetadata) => {
      if (isScanningRef.current) {
        return undefined;
      }

      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      const scanRunId = createScanRunId();
      isScanningRef.current = true;
      setIsScanning(true);
      setScanError(undefined);
      setScanDurationMs(undefined);
      resetLiveState();
      setDisplayNodes(buildPendingNodes(scanResultRef.current.nodes));
      const scanStartedAt = Date.now();

      let finalScan: ScanResult;
      try {
        finalScan = await withTimeout(
          runDiagnosticEngine(adapter, {
            scenarioId,
            runId: scanRunId,
            onProgress: (progress) => {
              if (isStaleRun(runId)) return;

              setScanProgress(progress);

              if (progress.kind === "node-started") {
                activeNodeIdRef.current = progress.nodeId;
                setActiveNodeId(progress.nodeId);
                setDisplayNodes((currentNodes) =>
                  markNodeRunning(currentNodes, progress.nodeId, progress.message)
                );
                return;
              }

              if (progress.kind === "node-completed") {
                if (progress.nodeId && !completedNodeIdsRef.current.includes(progress.nodeId)) {
                  completedNodeIdsRef.current = [...completedNodeIdsRef.current, progress.nodeId];
                  setCompletedNodeIds(completedNodeIdsRef.current);
                }

                setDisplayNodes((currentNodes) => applyNodeCompletion(currentNodes, progress));
                return;
              }

              if (progress.kind === "node-progressed" && progress.nodeId) {
                activeNodeIdRef.current = progress.nodeId;
                setActiveNodeId(progress.nodeId);
                setDisplayNodes((currentNodes) =>
                  currentNodes.map((node) =>
                    node.id === progress.nodeId
                      ? {
                          ...node,
                          status: "running",
                          severity: "info",
                          progressState: "running",
                          summary: progress.message
                        }
                      : node
                  )
                );
                return;
              }

              if (progress.kind === "scan-finished") {
                setDisplayNodes((currentNodes) =>
                  activeNodeIdRef.current
                    ? markNodeRunning(currentNodes, activeNodeIdRef.current, progress.message)
                    : currentNodes
                );
              }
            }
          }),
          SCAN_TIMEOUT_MS,
          "The diagnostic scan took too long and was stopped."
        );
      } catch (error) {
        if (!isStaleRun(runId)) {
          const message =
            error instanceof TimeoutError
              ? error.message
              : error instanceof Error
                ? error.message
                : "Aegis could not complete the diagnostic scan.";
          console.warn("Diagnostic scan did not complete", error);
          runIdRef.current += 1;
          setDisplayNodes(scanResultRef.current.nodes);
          resetLiveState();
          setIsScanning(false);
          isScanningRef.current = false;
          setScanError(message);
          setScanDurationMs(undefined);
        }
        return undefined;
      }

      if (isStaleRun(runId)) return undefined;
      scanResultRef.current = finalScan;
      setScanResult(finalScan);
      setDisplayNodes(finalScan.nodes);
      resetLiveState();
      setIsScanning(false);
      isScanningRef.current = false;
      setScanError(undefined);
      setScanDurationMs(Math.max(0, Date.now() - scanStartedAt));
      onScanComplete?.(finalScan, metadata);
      return finalScan;
    },
    [adapter, onScanComplete, resetLiveState]
  );

  return {
    scanResult,
    displayNodes,
    isScanning,
    activeNodeId,
    completedNodeIds,
    scanProgress,
    scanError,
    scanDurationMs,
    canStartScan,
    runScan,
    loadScan
  };
}
