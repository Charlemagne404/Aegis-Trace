import {
  Activity,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  FileText,
  Globe,
  HardDrive,
  History,
  Home,
  LaptopMinimal,
  Play,
  Settings,
  Shield,
  Stethoscope,
  Wifi,
  Wrench
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  AppMode,
  EnvironmentInfo,
  ScanResult,
  ThemeMode,
  WorkspaceMode
} from "@/core/types";
import { platformLabel } from "@/core/platform";
import { cn } from "@/utils/cn";

type FooterMetrics = {
  source: "system" | "unavailable";
  collectedAt: string | null;
  uptimeSeconds: number | null;
  cpuUsagePercent: number | null;
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
  memoryUsagePercent: number | null;
  downloadBitsPerSecond: number | null;
  uploadBitsPerSecond: number | null;
  cpuHistory: Array<number | null>;
  memoryHistory: Array<number | null>;
};

type AppShellProps = {
  children: ReactNode;
  appVersion: string;
  scan: ScanResult;
  mode: AppMode;
  theme: ThemeMode;
  isScanning: boolean;
  workspaceMode: WorkspaceMode;
  environmentInfo: EnvironmentInfo;
  footerMetrics: FooterMetrics;
  scanActionEnabled: boolean;
  scanActionReason?: string;
  reportActionEnabled: boolean;
  reportActionReason?: string;
  onModeChange: (mode: AppMode) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onRunScan: () => void;
  onExportReport: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
};

function getNodeEvidenceValue(
  scan: ScanResult,
  nodeId: string,
  evidenceId: string
) {
  return scan.nodes
    .find((node) => node.id === nodeId)
    ?.evidence.find((item) => item.id === evidenceId)?.value;
}

function formatUptime(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) {
    return "--";
  }

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }

  return `${Math.round(value)}%`;
}

function formatBandwidth(bitsPerSecond: number | null) {
  if (bitsPerSecond === null || !Number.isFinite(bitsPerSecond)) {
    return "--";
  }

  if (bitsPerSecond >= 1_000_000) {
    return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`;
  }

  if (bitsPerSecond >= 1_000) {
    return `${(bitsPerSecond / 1_000).toFixed(1)} Kbps`;
  }

  return `${Math.round(bitsPerSecond)} bps`;
}

function buildSparklinePoints(values: Array<number | null>) {
  const fallbackY = 11;
  const resolvedValues = values.map((value) => (value === null ? null : Math.max(0, value)));
  const maxValue =
    resolvedValues.reduce<number>((currentMax, value) => {
      if (value === null) {
        return currentMax;
      }

      return Math.max(currentMax, value);
    }, 0) || 100;

  return resolvedValues
    .map((value, index) => {
      const x = 2 + (96 / Math.max(values.length - 1, 1)) * index;
      const ratio = value === null ? null : Math.min(value / maxValue, 1);
      const y = ratio === null ? fallbackY : 11 - ratio * 7;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function FooterSparkline({
  points,
  strokeClassName
}: {
  points: string;
  strokeClassName?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 14"
      aria-hidden="true"
      className={cn("h-3.5 w-[70px]", strokeClassName)}
      fill="none"
    >
      <path
        d={`M ${points.split(" ").join(" L ")}`}
        className="opacity-95"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function FooterSegment({
  label,
  children,
  className
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-w-0 shrink-0 items-center gap-2.5 whitespace-nowrap border-r border-[color:var(--aegis-line-soft)] px-4 first:pl-0 last:border-r-0 last:pr-0",
        className
      )}
    >
      {label ? (
        <span className="text-[0.9rem] font-normal tracking-[0.01em] text-slate-500">{label}</span>
      ) : null}
      {children}
    </div>
  );
}

export function AppShell({
  children,
  appVersion,
  scan,
  mode,
  theme,
  isScanning,
  workspaceMode,
  environmentInfo,
  footerMetrics,
  scanActionEnabled,
  scanActionReason,
  reportActionEnabled,
  reportActionReason,
  onModeChange,
  onThemeChange,
  onRunScan,
  onExportReport,
  onOpenHistory,
  onOpenSettings
}: AppShellProps) {
  const cpuSparkPoints = buildSparklinePoints(footerMetrics.cpuHistory);
  const memorySparkPoints = buildSparklinePoints(footerMetrics.memoryHistory);
  const footerStatusLabel =
    footerMetrics.source === "system"
      ? "Live metrics"
      : "Metrics unavailable";
  const footerStatusDotClassName =
    footerMetrics.source === "system"
      ? "bg-[#54d786]"
      : "bg-slate-500";
  const technicianModeEnabled = mode === "technician";

  const navItems = [
    {
      label: "Overview",
      icon: Home,
      active: false
    },
    {
      label: "Diagnosis",
      icon: Stethoscope,
      active: true
    },
    {
      label: "Connectivity Tests",
      icon: Activity
    },
    {
      label: "Wi-Fi Advisor",
      icon: Wifi
    },
    {
      label: "DNS Toolkit",
      icon: Globe
    },
    {
      label: "Traffic Monitor",
      icon: Activity
    },
    {
      label: "System Insights",
      icon: History
    },
    {
      label: "Reports",
      icon: FileText
    },
    {
      label: "Tools",
      icon: Wrench,
      hasDisclosure: true
    },
    {
      label: "Settings",
      icon: Settings
    }
  ];

  const workspaceSummary = {
    live: {
      badge: `Live ${platformLabel(environmentInfo.platform, environmentInfo.os)} device`,
      title: scan.environment.hostname ?? `${platformLabel(environmentInfo.platform, environmentInfo.os)} desktop`,
      description: "Allowlisted diagnostics and repair actions are available.",
      accentClassName: "text-[#54d786]",
      dotClassName: "bg-[#54d786]"
    },
    unavailable: {
      badge: "Desktop runtime required",
      title: scan.environment.hostname ?? "Desktop app required",
      description: "Open the installed desktop app to run live diagnostics on this device.",
      accentClassName: "text-[#f2b84b]",
      dotClassName: "bg-[#f2b84b]"
    },
    degraded: {
      badge: "Runtime issue",
      title: scan.environment.hostname ?? `${platformLabel(environmentInfo.platform, environmentInfo.os)} desktop`,
      description: "Live diagnostics are paused until the native runtime is healthy again.",
      accentClassName: "text-[#ff8a7e]",
      dotClassName: "bg-[#ff6a5a]"
    }
  }[workspaceMode];
  const hostnameDisplay =
    environmentInfo.hostname ??
    scan.environment.hostname ??
    workspaceSummary.title ??
    `${platformLabel(environmentInfo.platform, environmentInfo.os)} desktop`;

  const adapterName =
    getNodeEvidenceValue(scan, "adapter", "adapter") ??
    hostnameDisplay ??
    `${platformLabel(environmentInfo.platform, environmentInfo.os)} desktop`;
  const networkName = getNodeEvidenceValue(scan, "wifi", "ssid");
  const wifiSignal = getNodeEvidenceValue(scan, "wifi", "signal");
  const ipAddress = getNodeEvidenceValue(scan, "ip", "ipv4");
  const sidebarConnectionLabel = networkName
    ? `Connected to ${networkName}`
    : workspaceSummary.description;
  const sidebarPrimaryMetric = wifiSignal ?? workspaceSummary.badge;
  const sidebarSecondaryMetric = ipAddress ?? environmentInfo.os;

  return (
    <div
      className={cn(
        "h-dvh max-h-dvh overflow-hidden bg-[#08111b] text-slate-100 antialiased"
      )}
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(31,110,255,0.12),transparent_24%),radial-gradient(circle_at_70%_0%,rgba(72,132,255,0.07),transparent_20%),linear-gradient(180deg,#09111b_0%,#0b1220_100%)]" />

      <div className="relative mx-auto h-full max-w-[1680px] overflow-hidden">
        <div className="grid h-full lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)_auto]">
          <aside className="min-h-0 border-b border-[color:var(--aegis-line)] bg-[linear-gradient(180deg,rgba(9,16,28,0.98)_0%,rgba(7,14,24,0.98)_100%)] px-4 py-3 lg:row-span-2 lg:flex lg:flex-col lg:overflow-hidden lg:border-b-0 lg:border-r lg:px-3.5 lg:py-6">
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center gap-3 px-1 pb-3 pt-0.5 lg:px-3 lg:pb-5 lg:pt-1">
                <div className="grid h-10 w-10 place-items-center rounded-[15px] border border-[#2f7dff]/26 bg-[radial-gradient(circle_at_50%_35%,rgba(52,120,255,0.18),transparent_62%),linear-gradient(180deg,rgba(12,27,45,0.98)_0%,rgba(8,17,30,0.98)_100%)] text-[#5ba1ff] shadow-[0_0_26px_rgba(47,125,255,0.12)] lg:h-12 lg:w-12 lg:rounded-[18px]">
                  <Shield className="h-5 w-5 lg:h-6 lg:w-6" strokeWidth={1.7} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[0.96rem] font-semibold tracking-[0.01em] text-white lg:text-[1.02rem]">
                    AEGIS-DESKTOP
                  </p>
                  <p className="mt-0.5 text-[0.88rem] tracking-[0.01em] text-slate-300 lg:text-[0.98rem]">
                    Aegis Trace
                  </p>
                </div>
              </div>

              <div className="mx-1 h-px bg-[linear-gradient(90deg,transparent_0%,rgba(110,133,166,0.2)_8%,rgba(110,133,166,0.2)_92%,transparent_100%)]" />

              <nav className="hide-scrollbar mt-4 hidden min-h-0 flex-1 overflow-y-auto lg:block">
                <div className="space-y-1">
                  {navItems.map(({ label, icon: Icon, active, hasDisclosure }) => (
                    <div
                      key={label}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-slate-300 transition",
                        active
                          ? "bg-[linear-gradient(180deg,rgba(23,35,53,0.92)_0%,rgba(18,29,44,0.9)_100%)] text-white shadow-[inset_2px_0_0_#2f7dff]"
                          : "hover:bg-white/[0.02] hover:text-white"
                      )}
                    >
                      {active ? (
                        <span className="absolute inset-y-[9px] left-0 w-px rounded-full bg-[#2f7dff]" />
                      ) : null}
                      <span
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-[10px] transition",
                          active
                            ? "text-[#dce8fb]"
                            : "text-slate-400 group-hover:text-slate-200"
                        )}
                      >
                        <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                      </span>
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                        <span className="truncate text-[0.95rem] font-medium tracking-[0.01em]">
                          {label}
                        </span>
                        {hasDisclosure ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              </nav>
            </div>

            <div className="mt-4 hidden rounded-[12px] border border-[rgba(104,127,160,0.12)] bg-[linear-gradient(180deg,rgba(18,29,44,0.92)_0%,rgba(11,19,30,0.98)_100%)] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(170,192,224,0.03),0_14px_28px_rgba(0,0,0,0.16)] lg:block">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-white/[0.05] bg-[rgba(14,24,38,0.9)] text-slate-300">
                  <Wifi className="h-[18px] w-[18px]" strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.95rem] font-medium tracking-[0.01em] text-slate-100">
                    {adapterName}
                  </p>
                  <p className="mt-1 text-[0.9rem] leading-5 text-slate-300">
                    {sidebarConnectionLabel}
                  </p>

                  <div className="mt-2.5 flex items-center gap-3 text-[0.84rem] text-slate-400">
                    <span>{sidebarPrimaryMetric}</span>
                    <span className="h-1 w-1 rounded-full bg-slate-600" />
                    <span className="truncate">{sidebarSecondaryMetric}</span>
                  </div>
                </div>
              </div>

              <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3.5">
                <div className="flex items-center gap-3">
                  <span className="grid h-5 w-5 place-items-center rounded-full border border-[#54d786]/45 bg-[#54d786]/10 text-[#54d786]">
                    <span className="h-2 w-2 rounded-full bg-current" />
                  </span>
                  <span className="text-[0.98rem] font-medium text-slate-100">
                    Technician Mode
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onModeChange(technicianModeEnabled ? "normal" : "technician")}
                  className={cn(
                    "relative h-[26px] w-12 rounded-full border transition",
                    technicianModeEnabled
                      ? "border-[#2f7dff]/70 bg-[linear-gradient(180deg,#3b8dff_0%,#2f7dff_100%)] shadow-[0_0_18px_rgba(47,125,255,0.18)]"
                      : "border-white/[0.08] bg-[#1b2737]"
                  )}
                  aria-label="Toggle technician mode"
                  aria-pressed={technicianModeEnabled}
                >
                  <span
                    className={cn(
                      "absolute top-[2px] h-5 w-5 rounded-full bg-white transition",
                      technicianModeEnabled ? "left-[25px]" : "left-[2px]"
                    )}
                  />
                </button>
              </div>
            </div>
          </aside>

          <header className="min-w-0 border-b border-white/8 bg-[#0a1320]/95 px-4 sm:px-6 lg:px-7">
            <div className="flex min-h-[68px] flex-col justify-center gap-2.5 py-2.5 xl:min-h-[80px] xl:flex-row xl:items-center xl:justify-between xl:py-0">
              <div className="flex min-w-0 items-center gap-4">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[13px] border border-white/8 bg-white/[0.02] text-slate-300 sm:h-10 sm:w-10 sm:rounded-[14px]">
                  <LaptopMinimal className="h-[18px] w-[18px] sm:h-5 sm:w-5" strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] text-slate-500">Current device</p>
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[0.98rem] font-medium tracking-[0.01em] text-white sm:text-[1.04rem]">
                      {hostnameDisplay}
                    </p>
                    <span className={cn("h-1.5 w-1.5 rounded-full", workspaceSummary.dotClassName)} />
                    <p className="truncate text-[0.78rem] text-slate-400 sm:text-[0.92rem]">{workspaceSummary.badge}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 xl:justify-end">
                <button
                  type="button"
                  onClick={onRunScan}
                  disabled={isScanning || !scanActionEnabled}
                  title={!scanActionEnabled ? scanActionReason : undefined}
                  className="app-outline-button inline-flex items-center gap-2 rounded-[10px] px-3.5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:py-2.5"
                  aria-busy={isScanning}
                >
                  <Play className="h-4 w-4 text-[#4b8dff]" strokeWidth={1.8} />
                  {isScanning ? "Running scan" : "Run scan"}
                </button>
                <button
                  type="button"
                  onClick={onExportReport}
                  disabled={!reportActionEnabled}
                  className="app-icon-button"
                  aria-label="Export report"
                  title={reportActionEnabled ? "Export report" : reportActionReason}
                >
                  <HardDrive className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={onOpenHistory}
                  className="app-icon-button"
                  aria-label="Open scan history"
                >
                  <History className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="app-icon-button"
                  aria-label="Open settings"
                  title="Open settings"
                >
                  <Settings className="h-5 w-5" />
                </button>
              </div>
            </div>
          </header>

          <main className="app-main min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 lg:px-6 lg:py-3">
            {children}
          </main>

          <footer className="min-w-0 shrink-0 overflow-hidden border-t border-[color:var(--aegis-line)] bg-[linear-gradient(180deg,rgba(12,18,29,0.98)_0%,rgba(8,15,25,0.98)_100%)] px-4 sm:px-6 lg:col-span-2">
            <div className="hide-scrollbar flex min-h-[54px] items-center overflow-x-auto text-[0.89rem] text-slate-300 2xl:grid 2xl:grid-cols-[1.35fr_1.15fr_1fr_1fr_1.1fr_1.7fr_1.15fr] 2xl:overflow-visible">
              <FooterSegment className="min-w-[220px] 2xl:min-w-0">
                <span className="font-normal tracking-[0.01em] text-slate-300">
                  Aegis Trace
                </span>
              </FooterSegment>

              <FooterSegment className="min-w-[150px] 2xl:min-w-0">
                <span className="text-slate-400">Version {appVersion}</span>
              </FooterSegment>

              <FooterSegment label="Uptime" className="min-w-[148px] 2xl:min-w-0">
                <span className="text-slate-300">{formatUptime(footerMetrics.uptimeSeconds)}</span>
              </FooterSegment>

              <FooterSegment label="CPU" className="min-w-[142px] 2xl:min-w-0">
                <span className="text-slate-200">
                  {formatPercent(footerMetrics.cpuUsagePercent)}
                </span>
                <FooterSparkline
                  points={cpuSparkPoints}
                  strokeClassName="text-slate-500/90"
                />
              </FooterSegment>

              <FooterSegment label="Memory" className="min-w-[160px] 2xl:min-w-0">
                <span className="text-slate-200">
                  {formatPercent(footerMetrics.memoryUsagePercent)}
                </span>
                <FooterSparkline
                  points={memorySparkPoints}
                  strokeClassName="text-slate-500/90"
                />
              </FooterSegment>

              <FooterSegment label="Network" className="min-w-[224px] 2xl:min-w-0">
                <span className="inline-flex items-center gap-1 text-slate-400">
                  <span className="text-slate-300">
                    {formatBandwidth(footerMetrics.downloadBitsPerSecond)}
                  </span>
                  <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.7} />
                </span>
                <span className="inline-flex items-center gap-1 text-slate-400">
                  {formatBandwidth(footerMetrics.uploadBitsPerSecond)}
                  <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.7} />
                </span>
              </FooterSegment>

              <FooterSegment className="min-w-[146px] justify-end 2xl:min-w-0">
                <span className="text-[0.9rem] font-normal tracking-[0.01em] text-slate-500">Status</span>
                <span className={cn("h-2.5 w-2.5 rounded-full", footerStatusDotClassName)} />
                <span className="text-slate-300">{footerStatusLabel}</span>
              </FooterSegment>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
