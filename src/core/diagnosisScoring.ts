import {
  filterAutomaticRecommendations,
  getFixActions,
  rankFixes
} from "./fixRegistry";
import { TIMELINE_NODE_IDS } from "./timelineDefinition";
import type {
  DiagnosticNode,
  DiagnosticStatus,
  FixAction,
  OverallDiagnosis,
  Severity
} from "./types";

function indexNodes(nodes: DiagnosticNode[]): Record<string, DiagnosticNode> {
  return Object.fromEntries(nodes.map((node) => [node.id, node]));
}

function hasEvidence(node: DiagnosticNode | undefined, text: string): boolean {
  if (!node) return false;
  const needle = text.toLowerCase();
  return node.evidence.some(
    (item) =>
      item.label.toLowerCase().includes(needle) ||
      item.value.toLowerCase().includes(needle) ||
      item.detail?.toLowerCase().includes(needle)
  );
}

function firstProblemNode(nodes: DiagnosticNode[]): DiagnosticNode | undefined {
  const byId = indexNodes(nodes);
  const failedId = TIMELINE_NODE_IDS.find((id) => byId[id]?.status === "failed");
  if (failedId) return byId[failedId];
  const warningId = TIMELINE_NODE_IDS.find(
    (id) => byId[id]?.status === "warning"
  );
  return warningId ? byId[warningId] : undefined;
}

function statusRank(status: DiagnosticStatus): number {
  if (status === "failed") return 4;
  if (status === "warning") return 3;
  if (status === "unknown" || status === "skipped") return 2;
  if (status === "running" || status === "pending") return 1;
  return 0;
}

export function getOverallStatus(nodes: DiagnosticNode[]): DiagnosticStatus {
  const worst = nodes.reduce<DiagnosticStatus>((current, node) => {
    return statusRank(node.status) > statusRank(current) ? node.status : current;
  }, "ok");

  if (worst === "skipped" || worst === "unknown") return "warning";
  if (worst === "running" || worst === "pending") return "running";
  return worst;
}

function buildDiagnosis(input: {
  id: string;
  title: string;
  summary: string;
  confidence: number;
  severity: Severity;
  primaryFailedNodeId?: string;
  fixes: FixAction[];
}): OverallDiagnosis {
  return {
    id: input.id,
    title: input.title,
    summary: input.summary,
    confidence: input.confidence,
    severity: input.severity,
    primaryFailedNodeId: input.primaryFailedNodeId,
    recommendedFixes: rankFixes(filterAutomaticRecommendations(input.fixes))
  };
}

export function generateOverallDiagnosis(nodes: DiagnosticNode[]): OverallDiagnosis {
  const byId = indexNodes(nodes);
  const problem = firstProblemNode(nodes);
  const adapter = byId.adapter;
  const wifi = byId.wifi;
  const ip = byId.ip;
  const gateway = byId.gateway;
  const internet = byId.internet;
  const dns = byId.dns;
  const windows = byId.windows;
  const apps = byId.apps;

  if (!problem) {
    return buildDiagnosis({
      id: "healthy",
      title: "Everything looks good",
      summary:
        "The full connection chain is responding. Wi-Fi, gateway, internet, DNS, operating-system status, and app-layer checks all passed.",
      confidence: 96,
      severity: "info",
      fixes: []
    });
  }

  if (adapter?.status === "failed") {
    return buildDiagnosis({
      id: "no-wifi-adapter",
      title: "No usable Wi-Fi adapter detected",
      summary:
        "The operating system is not reporting an enabled wireless adapter. The connection cannot proceed until the adapter or driver is available.",
      confidence: 94,
      severity: "high",
      primaryFailedNodeId: "adapter",
      fixes: getFixActions(["open-network-settings", "generate-wlan-report"])
    });
  }

  if (wifi?.status === "failed" && hasEvidence(wifi, "WlanSvc")) {
    return buildDiagnosis({
      id: "wlan-service-stopped",
      title: "Wi-Fi management is not running",
      summary:
        "The wireless adapter is present, but the operating-system service that manages Wi-Fi connections is stopped.",
      confidence: 93,
      severity: "high",
      primaryFailedNodeId: "wifi",
      fixes: getFixActions(["restart-wlan-service", "open-network-settings"])
    });
  }

  if (ip?.status === "failed") {
    return buildDiagnosis({
      id: "dhcp-failure",
      title: "Connected to Wi-Fi, but no valid IP address",
      summary:
        "The Wi-Fi link is established, but the operating system did not receive a usable IP address from the network. This commonly points to DHCP or router configuration.",
      confidence: hasEvidence(ip, "169.254") ? 95 : 88,
      severity: "high",
      primaryFailedNodeId: "ip",
      fixes: getFixActions(["renew-dhcp", "restart-adapter", "open-network-settings"])
    });
  }

  if (gateway?.status === "failed") {
    return buildDiagnosis({
      id: "gateway-unreachable",
      title: "Connected locally, but router is unreachable",
      summary:
        "The device has an IP address and gateway route, but the router is not responding. The issue is likely between the device and local network gateway.",
      confidence: 86,
      severity: "high",
      primaryFailedNodeId: "gateway",
      fixes: getFixActions(["renew-dhcp", "restart-adapter", "open-network-settings"])
    });
  }

  if (internet?.status === "failed") {
    return buildDiagnosis({
      id: "internet-unreachable",
      title: "Router works, but the internet is unreachable",
      summary:
        "The device can reach the router, but external IP connectivity is failing. This points to the router, ISP, VPN, firewall, or upstream routing.",
      confidence: 84,
      severity: "high",
      primaryFailedNodeId: "internet",
      fixes: getFixActions(["renew-dhcp", "generate-wlan-report", "open-network-settings"])
    });
  }

  if (dns?.status === "failed" && internet?.status === "ok") {
    return buildDiagnosis({
      id: "dns-failure",
      title: "Connected, but DNS is failing",
      summary:
        "Your device can reach the router and internet by IP address, but domain name lookups are failing. Websites may not load even though the connection itself works.",
      confidence: 91,
      severity: "high",
      primaryFailedNodeId: "dns",
      fixes: getFixActions([
        "flush-dns",
        "renew-dhcp",
        "dns-automatic",
        "set-public-dns"
      ])
    });
  }

  if (
    apps?.status === "failed" &&
    (hasEvidence(windows, "proxy") || hasEvidence(apps, "proxy"))
  ) {
    return buildDiagnosis({
      id: "proxy-app-issue",
      title: "Proxy settings may be blocking apps",
      summary:
        "Core connectivity and DNS pass, but app-layer HTTPS checks fail while proxy settings are enabled.",
      confidence: 74,
      severity: "medium",
      primaryFailedNodeId: "apps",
      fixes: getFixActions(["open-network-settings", "generate-wlan-report"])
    });
  }

  if (
    windows?.status === "warning" &&
    apps?.status === "ok" &&
    internet?.status === "ok" &&
    dns?.status === "ok"
  ) {
    return buildDiagnosis({
      id: "windows-false-negative",
      title: "The operating system may be incorrectly reporting no internet",
      summary:
        "Independent internet and DNS tests pass, but the operating system still reports limited connectivity. This is likely an operating-system status mismatch.",
      confidence: 69,
      severity: "medium",
      primaryFailedNodeId: "windows",
      fixes: getFixActions(["flush-dns", "open-network-settings", "generate-wlan-report"])
    });
  }

  if (hasEvidence(windows, "captive") || hasEvidence(apps, "redirect")) {
    return buildDiagnosis({
      id: "captive-portal",
      title: "Network may require sign-in",
      summary:
        "Connectivity is partially available, but web traffic appears redirected. This often means a hotel, office, or public Wi-Fi sign-in page is required.",
      confidence: 67,
      severity: "medium",
      primaryFailedNodeId: windows?.status === "warning" ? "windows" : "apps",
      fixes: getFixActions(["open-network-settings"])
    });
  }

  return buildDiagnosis({
    id: "degraded",
    title: "Network path is degraded",
    summary:
      "Aegis found a problem in the connection chain. Review the highlighted timeline node for evidence and the safest next action.",
    confidence: 62,
    severity: problem.severity,
    primaryFailedNodeId: problem.id,
    fixes: problem.recommendedFixes
  });
}
