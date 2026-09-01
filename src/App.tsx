import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { AppShell } from "@/components/layout/AppShell";
import { FindingsPanel } from "@/components/dashboard/FindingsPanel";
import { RecentScans } from "@/components/dashboard/RecentScans";
import { StatusOverview } from "@/components/dashboard/StatusOverview";
import { DiagnosticTimeline } from "@/components/timeline/DiagnosticTimeline";
import { ConfirmFixModal } from "@/components/fixes/ConfirmFixModal";
import { RepairPlanPanel } from "@/components/fixes/RepairPlanPanel";
import { DetailsPanel } from "@/components/details/DetailsPanel";
import { ReportPreview } from "@/components/reports/ReportPreview";
import { RuntimeNotice } from "@/components/runtime/RuntimeNotice";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { createInitialScanResult } from "@/core/initialScan";
import { getSupplementalRepairOptions } from "@/core/fixRegistry";
import {
  createUnavailableRuntimeHealth,
  deriveWorkspaceMode,
  getFixDisabledReason,
  getScanDisabledReason
} from "@/core/runtimeHealth";
import {
  buildRepairBlockedVerification,
  buildRepairVerification
} from "@/core/repairVerification";
import {
  clearScanHistory,
  loadScanHistory,
  saveScanHistory,
  upsertScanHistoryEntry
} from "@/core/scanHistory";
import type {
  AppMode,
  EnvironmentInfo,
  FixAction,
  FixConfirmation,
  FixExecutionResult,
  RepairVerification,
  ReportFormat,
  RuntimeHealth,
  ScanHistoryEntry,
  ScanRunMetadata,
  ScanResult,
  ThemeMode,
  WorkspaceMode
} from "@/core/types";
import { useDiagnosticScan } from "@/hooks/useDiagnosticScan";
import { useFooterMetrics } from "@/hooks/useFooterMetrics";
import { hasTauriRuntime, tauriAdapter } from "@/platform/tauriAdapter";
import { getBrowserEnvironmentInfo } from "@/platform/browserEnvironment";
import { TimeoutError, withTimeout } from "@/utils/async";

const FIX_EXECUTION_TIMEOUT_MS = 45_000;

type PendingHistoryCapture = ScanRunMetadata;

function createHistoryEntry(
  scan: ScanResult,
  capture: PendingHistoryCapture
): ScanHistoryEntry {
  return {
    id: `${scan.id}-${capture.reason}-${capture.relatedFixId ?? "scan"}`,
    capturedAt: scan.createdAt,
    reason: capture.reason,
    relatedFixId: capture.relatedFixId,
    relatedFixTitle: capture.relatedFixTitle,
    scan
  };
}

function resolveInitialAppState() {
  const history = loadScanHistory();
  const latestEntry = history[0];

  return {
    history,
    initialScan: latestEntry?.scan ?? createInitialScanResult()
  };
}

export default function App() {
  const initialAppState = useRef(resolveInitialAppState()).current;
  const initialEnvironmentInfo = getBrowserEnvironmentInfo(hasTauriRuntime());
  const [selectedNodeId, setSelectedNodeId] = useState(
    initialAppState.initialScan.diagnosis.primaryFailedNodeId ??
      initialAppState.initialScan.nodes[0]?.id
  );
  const [mode, setMode] = useState<AppMode>("normal");
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reportError, setReportError] = useState<string | undefined>();
  const [pendingFix, setPendingFix] = useState<FixAction | null>(null);
  const [fixBusy, setFixBusy] = useState(false);
  const [fixResult, setFixResult] = useState<FixExecutionResult | null>(null);
  const [environmentInfo, setEnvironmentInfo] = useState<EnvironmentInfo>({
    ...initialEnvironmentInfo,
    appVersion: initialAppState.initialScan.environment.appVersion
  });
  const [runtimeHealth, setRuntimeHealth] = useState<RuntimeHealth>(
    createUnavailableRuntimeHealth(initialEnvironmentInfo)
  );
  const [repairVerification, setRepairVerification] =
    useState<RepairVerification | null>(null);
  const [isVerifyingFix, setIsVerifyingFix] = useState(false);
  const fixBusyRef = useRef(false);
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>(
    initialAppState.history
  );

  const adapter = tauriAdapter;
  const workspaceMode: WorkspaceMode = deriveWorkspaceMode(runtimeHealth);
  const footerMetrics = useFooterMetrics(adapter);

  const {
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
  } = useDiagnosticScan({
    adapter,
    initialScan: initialAppState.initialScan,
    onScanComplete: (scan, metadata) => {
      setSelectedNodeId(scan.diagnosis.primaryFailedNodeId ?? scan.nodes[0]?.id);
      setScanHistory((currentHistory) =>
        upsertScanHistoryEntry(
          currentHistory,
          createHistoryEntry(
            scan,
            metadata ?? {
              reason: "manual"
            }
          )
        )
      );
    }
  });

  useEffect(() => {
    if (scanHistory.length) {
      saveScanHistory(scanHistory);
    } else {
      clearScanHistory();
    }
  }, [scanHistory]);

  useEffect(() => {
    if (activeNodeId) {
      setSelectedNodeId(activeNodeId);
    }
  }, [activeNodeId]);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([adapter.getEnvironmentInfo(), adapter.getRuntimeHealth()])
      .then(([environment, health]) => {
        if (cancelled) {
          return;
        }

        setEnvironmentInfo(environment);
        setRuntimeHealth(health);
      })
      .catch((error) => {
        console.warn("Failed to load runtime environment info", error);

        if (!cancelled) {
          const unavailableEnvironment = getBrowserEnvironmentInfo(hasTauriRuntime());
          setEnvironmentInfo(unavailableEnvironment);
          setRuntimeHealth(createUnavailableRuntimeHealth(unavailableEnvironment));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [adapter]);

  useEffect(() => {
    if (showRawOutput) {
      setMode("technician");
    }
  }, [showRawOutput]);

  const selectedNode =
    displayNodes.find((node) => node.id === selectedNodeId) ?? displayNodes[0];
  const supplementalRepairOptions = getSupplementalRepairOptions(
    scanResult,
    scanResult.environment.platform ?? environmentInfo.platform
  );
  const totalChecks = scanResult.nodes.reduce((count, node) => count + node.evidence.length, 0);
  const hasCompletedScan = scanResult.overallStatus !== "pending";
  const workspaceBusy = isScanning || fixBusy || isVerifyingFix;
  const scanActionReason =
    getScanDisabledReason(runtimeHealth) ??
    (workspaceBusy ? "Aegis is finishing the current diagnostic action." : undefined);
  const fixDisabledReason =
    getFixDisabledReason(runtimeHealth) ??
    (workspaceBusy ? "Wait for the current diagnostic action to finish before applying a fix." : undefined);
  const canRunScan = !scanActionReason;
  const canRunFixes = !fixDisabledReason;
  const reportActionReason = hasCompletedScan
    ? undefined
    : "Run a scan before exporting a report.";

  const handleRunScan = () => {
    if (!canRunScan || workspaceBusy || !canStartScan()) {
      return;
    }

    setFixResult(null);
    setRepairVerification(null);
    setPendingFix(null);
    void runScan({ reason: "manual" });
  };

  const handleSelectHistoryEntry = (entry: ScanHistoryEntry) => {
    if (workspaceBusy) {
      return;
    }

    loadScan(entry.scan);
    setSelectedNodeId(entry.scan.diagnosis.primaryFailedNodeId ?? entry.scan.nodes[0]?.id);
    setFixResult(null);
    setPendingFix(null);
    setRepairVerification(null);
    setIsVerifyingFix(false);
    setDetailsOpen(false);
    setReportOpen(false);
    setHistoryOpen(false);
  };

  const handleConfirmFix = async (fix: FixAction, confirmation?: FixConfirmation) => {
    if (fixBusyRef.current || isScanning || !canStartScan()) {
      return;
    }

    if (!canRunFixes) {
      setPendingFix(null);
      setFixResult({
        fixId: fix.id,
        status: "blocked",
        title: "Repair action unavailable",
        message: fixDisabledReason ?? "Aegis cannot run live repair actions in this session.",
        requiresAdmin: fix.requiresAdmin
      });
      return;
    }

    const beforeScan = scanResult;
    fixBusyRef.current = true;
    setFixBusy(true);
    setRepairVerification(null);
    setScanHistory((currentHistory) =>
      upsertScanHistoryEntry(
        currentHistory,
        createHistoryEntry(beforeScan, {
          reason: "manual"
        })
      )
    );
    try {
      const result = await withTimeout(
        adapter.runFix(fix, confirmation),
        FIX_EXECUTION_TIMEOUT_MS,
        "The repair command took too long and was stopped before Aegis could verify it."
      );
      setFixResult(result);
      setPendingFix(null);

      if (result.status === "success") {
        setIsVerifyingFix(true);
        const verificationMetadata: PendingHistoryCapture = {
          reason: "verification",
          relatedFixId: fix.id,
          relatedFixTitle: fix.title
        };

        const afterScan = await runScan(verificationMetadata);
        if (afterScan) {
          setRepairVerification(buildRepairVerification(beforeScan, afterScan, result));
        } else {
          setRepairVerification(
            buildRepairBlockedVerification(beforeScan, {
              ...result,
              status: "blocked",
              message: "The verification scan did not complete."
            })
          );
        }
      } else {
        setRepairVerification(buildRepairBlockedVerification(beforeScan, result));
      }
    } catch (error) {
      const message =
        error instanceof TimeoutError
          ? error.message
          : "Aegis could not complete the requested repair action.";
      const blockedResult: FixExecutionResult = {
        fixId: fix.id,
        status: "blocked",
        title: fix.title,
        message,
        requiresAdmin: fix.requiresAdmin
      };

      setFixResult(blockedResult);
      setPendingFix(null);
      setRepairVerification(buildRepairBlockedVerification(beforeScan, blockedResult));
    } finally {
      fixBusyRef.current = false;
      setFixBusy(false);
      setIsVerifyingFix(false);
    }
  };

  const handleExportReport = (format: ReportFormat) => {
    setReportError(undefined);
    void adapter.exportReport(scanResult, format).catch((error) => {
      setReportError(
        error instanceof Error
          ? error.message
          : "Aegis could not export the requested report."
      );
    });
  };

  return (
    <AppShell
      appVersion={environmentInfo.appVersion}
      scan={scanResult}
      mode={mode}
      theme={theme}
      isScanning={isScanning}
      workspaceMode={workspaceMode}
      environmentInfo={environmentInfo}
      footerMetrics={footerMetrics}
      scanActionEnabled={canRunScan}
      scanActionReason={scanActionReason}
      reportActionEnabled={hasCompletedScan}
      reportActionReason={reportActionReason}
      onModeChange={setMode}
      onThemeChange={setTheme}
      onRunScan={handleRunScan}
      onExportReport={() => {
        if (!hasCompletedScan) {
          return;
        }
        setReportError(undefined);
        setReportOpen(true);
      }}
      onOpenHistory={() => setHistoryOpen(true)}
      onOpenSettings={() => setSettingsOpen(true)}
    >
      <div className="dashboard-viewport flex min-w-0 flex-col gap-3 lg:h-full lg:min-h-0">
        <RuntimeNotice runtimeHealth={runtimeHealth} scanError={scanError} />

        <StatusOverview
          diagnosis={scanResult.diagnosis}
          liveNodes={displayNodes}
          completedChecks={totalChecks}
          hasCompletedScan={hasCompletedScan}
          lastRunAt={scanResult.createdAt}
          scanDurationMs={scanDurationMs}
          isScanning={isScanning}
          scanProgress={scanProgress}
          totalTimelineNodes={displayNodes.length}
          scanActionEnabled={canRunScan}
          scanActionReason={scanActionReason}
          onRunScan={handleRunScan}
        />

        <DiagnosticTimeline
          nodes={displayNodes}
          selectedNodeId={selectedNode?.id}
          activeNodeId={activeNodeId}
          completedNodeIds={completedNodeIds}
          scanProgress={scanProgress}
          onSelectNode={setSelectedNodeId}
          isScanning={isScanning}
        />

        <div className="grid min-w-0 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
          <FindingsPanel
            nodes={displayNodes}
            selectedNodeId={selectedNode?.id}
            onSelectNode={setSelectedNodeId}
            onViewDetails={() => setDetailsOpen(Boolean(selectedNode))}
          />

          <RepairPlanPanel
            diagnosis={scanResult.diagnosis}
            fixResult={fixResult}
            isScanning={isScanning}
            fixesEnabled={canRunFixes}
            fixesDisabledReason={fixDisabledReason}
            scanActionEnabled={canRunScan}
            scanActionReason={scanActionReason}
            additionalFixes={supplementalRepairOptions.alternatives}
            advancedFixes={supplementalRepairOptions.advanced}
            onRunFix={setPendingFix}
            onRunScan={handleRunScan}
          />
        </div>
      </div>

      <AnimatePresence>
        <ConfirmFixModal
          fix={pendingFix}
          busy={fixBusy}
          onCancel={() => setPendingFix(null)}
          onConfirm={handleConfirmFix}
        />
      </AnimatePresence>

      {reportOpen ? (
        <ReportPreview
          scan={scanResult}
          exportError={reportError}
          onClose={() => setReportOpen(false)}
          onExport={handleExportReport}
        />
      ) : null}

      {detailsOpen && selectedNode ? (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-slate-950/72 p-4 backdrop-blur-xl"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedNode.label} details`}
        >
          <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/12 bg-[#0c1424] shadow-panel">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Selected timeline stage
                </p>
                <h2 className="mt-1 text-lg font-semibold text-white">{selectedNode.label}</h2>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="rounded-full border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
              <DetailsPanel
                node={selectedNode}
                mode={mode}
                fixesEnabled={canRunFixes}
                fixesDisabledReason={fixDisabledReason}
                onRunFix={setPendingFix}
              />
            </div>
          </div>
        </div>
      ) : null}

      {historyOpen ? (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-slate-950/72 p-4 backdrop-blur-xl"
          role="dialog"
          aria-modal="true"
          aria-label="Local scan history"
        >
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/12 bg-[#0c1424] shadow-panel">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Timeline archive
                </p>
                <h2 className="mt-1 text-lg font-semibold text-white">Local scan history</h2>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-full border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 overflow-auto p-4 sm:p-5">
              <RecentScans
                entries={scanHistory}
                activeScanId={scanResult.id}
                onSelectScan={handleSelectHistoryEntry}
                onClearHistory={() => setScanHistory([])}
              />
            </div>
          </div>
        </div>
      ) : null}

      <SettingsPanel
        open={settingsOpen}
        environmentInfo={environmentInfo}
        rawOutput={showRawOutput}
        onRawOutputChange={setShowRawOutput}
        onClose={() => setSettingsOpen(false)}
      />
    </AppShell>
  );
}
