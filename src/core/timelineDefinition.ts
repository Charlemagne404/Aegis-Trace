import type { DiagnosticNode } from "./types";

export type TimelineNodeDefinition = Pick<
  DiagnosticNode,
  "id" | "label" | "technicalLabel" | "icon" | "checks"
>;

export const TIMELINE_DEFINITION: TimelineNodeDefinition[] = [
  {
    id: "device",
    label: "Device",
    technicalLabel: "Host networking",
    icon: "monitor",
    checks: [
      "Operating system detected",
      "Network stack accessible",
      "Permissions and admin status checked",
      "System clock sanity checked"
    ]
  },
  {
    id: "adapter",
    label: "Adapter",
    technicalLabel: "Network interface",
    icon: "network",
    checks: [
      "Network adapters detected",
      "Wi-Fi adapter present",
      "Adapter enabled",
      "Driver status checked"
    ]
  },
  {
    id: "wifi",
    label: "Wi-Fi",
    technicalLabel: "Wireless interface",
    icon: "wifi",
    checks: [
      "Wireless management available",
      "Wireless interface available",
      "Interface connection state checked",
      "Nearby networks visibility checked"
    ]
  },
  {
    id: "profile",
    label: "Profile",
    technicalLabel: "Saved wireless profile",
    icon: "id-card",
    checks: [
      "Current SSID detected",
      "Saved profile exists",
      "Authentication type checked",
      "Profile consistency reviewed"
    ]
  },
  {
    id: "ip",
    label: "IP Address",
    technicalLabel: "IPv4 configuration",
    icon: "binary",
    checks: [
      "IPv4 address exists",
      "APIPA range avoided",
      "Subnet mask present",
      "DHCP configuration checked"
    ]
  },
  {
    id: "gateway",
    label: "Gateway",
    technicalLabel: "Default route",
    icon: "router",
    checks: [
      "Default gateway exists",
      "Route table checked",
      "Gateway reachability tested"
    ]
  },
  {
    id: "internet",
    label: "Internet",
    technicalLabel: "External IP reachability",
    icon: "globe",
    checks: [
      "External IP endpoint tested",
      "Secondary endpoint compared",
      "TCP fallback considered"
    ]
  },
  {
    id: "dns",
    label: "DNS",
    technicalLabel: "Name resolution",
    icon: "search-check",
    checks: [
      "DNS servers configured",
      "Domain resolution tested",
      "Public resolver comparison checked"
    ]
  },
  {
    id: "windows",
    label: "OS Status",
    technicalLabel: "Operating-system connectivity",
    icon: "badge-check",
    checks: [
      "OS connectivity status checked",
      "Proxy configuration reviewed",
      "Captive portal suspicion reviewed"
    ]
  },
  {
    id: "apps",
    label: "Apps",
    technicalLabel: "Application layer",
    icon: "app-window",
    checks: [
      "HTTPS endpoint tested",
      "Proxy and firewall symptoms reviewed",
      "App-specific failure likelihood assessed"
    ]
  }
];

export const TIMELINE_NODE_IDS = TIMELINE_DEFINITION.map((node) => node.id);
