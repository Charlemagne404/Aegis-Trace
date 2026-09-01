import { generateOverallDiagnosis, getOverallStatus } from "./diagnosisScoring";
import { getFixActions } from "./fixRegistry";
import { TIMELINE_DEFINITION } from "./timelineDefinition";
import type {
  DiagnosticNode,
  DiagnosticStatus,
  EvidenceItem,
  ScanResult,
  Severity
} from "./types";

type NodePatch = Partial<DiagnosticNode> & Pick<DiagnosticNode, "id">;

export type ScenarioId =
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

export type ScenarioDefinition = {
  id: ScenarioId;
  label: string;
  description: string;
};

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: "dns-failure",
    label: "DNS failure",
    description: "Internet by IP works, domain lookup fails."
  },
  {
    id: "healthy",
    label: "Healthy connection",
    description: "Every timeline check passes."
  },
  {
    id: "dhcp-apipa",
    label: "DHCP / APIPA",
    description: "Wi-Fi connected but the device has a 169.254.x.x address."
  },
  {
    id: "no-adapter",
    label: "No Wi-Fi adapter",
    description: "The operating system cannot see a usable wireless adapter."
  },
  {
    id: "wlan-service-stopped",
    label: "Wireless management stopped",
    description: "Wireless service is stopped while adapter exists."
  },
  {
    id: "gateway-unreachable",
    label: "Gateway unreachable",
    description: "Valid IP exists, but the router does not respond."
  },
  {
    id: "internet-unreachable",
    label: "Internet unreachable",
    description: "Router responds, external IP endpoints do not."
  },
  {
    id: "proxy-app-issue",
    label: "Proxy / app issue",
    description: "Network checks pass, app-layer HTTPS fails."
  },
  {
    id: "windows-false-negative",
    label: "OS false no-internet",
    description: "Independent tests pass but the operating system reports no internet."
  },
  {
    id: "captive-portal",
    label: "Captive portal",
    description: "Connection likely requires a browser sign-in."
  }
];

const okEvidence = (id: string, label: string, value: string, detail?: string) =>
  ({
    id,
    label,
    value,
    status: "ok",
    detail
  }) satisfies EvidenceItem;

const warningEvidence = (
  id: string,
  label: string,
  value: string,
  detail?: string
) =>
  ({
    id,
    label,
    value,
    status: "warning",
    detail
  }) satisfies EvidenceItem;

const failedEvidence = (
  id: string,
  label: string,
  value: string,
  detail?: string
) =>
  ({
    id,
    label,
    value,
    status: "failed",
    detail
  }) satisfies EvidenceItem;

const unknownEvidence = (
  id: string,
  label: string,
  value: string,
  detail?: string
) =>
  ({
    id,
    label,
    value,
    status: "unknown",
    detail
  }) satisfies EvidenceItem;

function severityForStatus(status: DiagnosticStatus): Severity {
  if (status === "failed") return "high";
  if (status === "warning") return "medium";
  if (status === "skipped" || status === "unknown") return "low";
  return "info";
}

function baseNode(id: string): DiagnosticNode {
  const definition = TIMELINE_DEFINITION.find((item) => item.id === id);
  if (!definition) {
    throw new Error(`Missing timeline definition for ${id}`);
  }

  const common = {
    id,
    label: definition.label,
    technicalLabel: definition.technicalLabel,
    icon: definition.icon,
    status: "ok" as DiagnosticStatus,
    severity: "info" as Severity,
    checks: definition.checks,
    likelyCauses: [] as string[],
    recommendedFixes: [] as DiagnosticNode["recommendedFixes"]
  };

  switch (id) {
    case "device":
      return {
        ...common,
        summary: "Device networking is available.",
        explanation:
          "Aegis can query the local network stack. No system-level blocker was detected before adapter checks.",
        evidence: [
          okEvidence("os", "Operating system", "Windows 11 Pro"),
          okEvidence("stack", "Network stack", "Accessible"),
          warningEvidence("admin", "Administrator", "Not elevated", "Read-only diagnostics can still run.")
        ],
        rawOutput:
          "OS: Windows 11 Pro\nNetwork stack: accessible\nAdmin: false\nClock drift: within expected range"
      };
    case "adapter":
      return {
        ...common,
        summary: "A usable Wi-Fi adapter is enabled.",
        explanation:
          "The operating system reports an enabled wireless adapter with a healthy driver state.",
        evidence: [
          okEvidence("adapter", "Adapter", "Intel(R) Wi-Fi 6E AX211"),
          okEvidence("state", "State", "Up"),
          okEvidence("driver", "Driver", "Healthy")
        ],
        rawOutput:
          "Name: Wi-Fi\nInterfaceDescription: Intel(R) Wi-Fi 6E AX211\nStatus: Up\nDriver: OK"
      };
    case "wifi":
      return {
        ...common,
        summary: "Wi-Fi radio and service are working.",
        explanation:
          "The wireless service is running and the interface reports an active Wi-Fi connection.",
        evidence: [
          okEvidence("service", "WlanSvc", "Running"),
          okEvidence("ssid", "Connected SSID", "Aegis-Lab"),
          okEvidence("signal", "Signal", "88%")
        ],
        rawOutput:
          "WlanSvc: Running\nState: connected\nSSID: Aegis-Lab\nSignal: 88%"
      };
    case "profile":
      return {
        ...common,
        summary: "The saved Wi-Fi profile is usable.",
        explanation:
          "The current SSID has a matching saved profile and the authentication settings look consistent.",
        evidence: [
          okEvidence("profile", "Profile", "Aegis-Lab"),
          okEvidence("auth", "Authentication", "WPA2-Personal"),
          okEvidence("security", "Security key", "Present, not exported")
        ],
        rawOutput:
          "Profile: Aegis-Lab\nAuthentication: WPA2-Personal\nKey content: not requested"
      };
    case "ip":
      return {
        ...common,
        summary: "The device has a valid IP address.",
        explanation:
          "Windows received a private IPv4 address, subnet mask, and DHCP-provided lease.",
        evidence: [
          okEvidence("ipv4", "IPv4 address", "192.168.1.42"),
          okEvidence("dhcp", "DHCP", "Enabled"),
          okEvidence("subnet", "Subnet", "255.255.255.0")
        ],
        rawOutput:
          "IPv4 Address: 192.168.1.42\nSubnet Mask: 255.255.255.0\nDHCP Enabled: Yes"
      };
    case "gateway":
      return {
        ...common,
        summary: "The router is reachable.",
        explanation:
          "A default gateway exists and responds to local reachability checks.",
        evidence: [
          okEvidence("gateway", "Default gateway", "192.168.1.1"),
          okEvidence("route", "Default route", "0.0.0.0/0 via 192.168.1.1"),
          okEvidence("ping", "Gateway ping", "12 ms")
        ],
        rawOutput:
          "DefaultGateway: 192.168.1.1\nRoute: 0.0.0.0/0\nPing: Reply in 12ms"
      };
    case "internet":
      return {
        ...common,
        summary: "External IP connectivity works.",
        explanation:
          "The router path can reach public IP endpoints, so the basic internet route is available.",
        evidence: [
          okEvidence("cloudflare", "1.1.1.1", "Reachable"),
          okEvidence("google", "8.8.8.8", "Reachable"),
          okEvidence("tcp", "TCP fallback", "443 reachable")
        ],
        rawOutput:
          "Test-NetConnection 1.1.1.1: TcpTestSucceeded=True\nPing 8.8.8.8: Reply"
      };
    case "dns":
      return {
        ...common,
        summary: "Domain name resolution works.",
        explanation:
          "Configured DNS servers are present and domain lookups resolve normally.",
        evidence: [
          okEvidence("server", "DNS server", "192.168.1.1"),
          okEvidence("google", "google.com", "142.250.72.14"),
          okEvidence("cloudflare", "cloudflare.com", "104.16.132.229")
        ],
        rawOutput:
          "Server: 192.168.1.1\nName: google.com\nAddress: 142.250.72.14"
      };
    case "windows":
      return {
        ...common,
        summary: "The operating system reports internet access.",
        explanation:
          "Operating-system network status aligns with the direct connectivity checks.",
        evidence: [
          okEvidence("profile", "Network profile", "Private"),
          okEvidence("connectivity", "IPv4 connectivity", "Internet"),
          okEvidence("proxy", "WinHTTP proxy", "Direct access")
        ],
        rawOutput:
          "NetworkCategory: Private\nIPv4Connectivity: Internet\nWinHTTP proxy: Direct access"
      };
    case "apps":
      return {
        ...common,
        summary: "Application-layer HTTPS works.",
        explanation:
          "Aegis can establish HTTPS connectivity to a known endpoint. App-specific issues are unlikely.",
        evidence: [
          okEvidence("https", "HTTPS 443", "Reachable"),
          okEvidence("tls", "TLS handshake", "Succeeded"),
          okEvidence("proxy", "App proxy symptom", "Not detected")
        ],
        rawOutput:
          "Test-NetConnection www.microsoft.com -Port 443: TcpTestSucceeded=True"
      };
    default:
      throw new Error(`Unhandled node: ${id}`);
  }
}

function patchNode(node: DiagnosticNode, patch?: NodePatch): DiagnosticNode {
  if (!patch) return node;
  const status = patch.status ?? node.status;
  return {
    ...node,
    ...patch,
    status,
    severity: patch.severity ?? severityForStatus(status),
    recommendedFixes: patch.recommendedFixes ?? node.recommendedFixes
  };
}

function makeSkipped(id: string, summary: string): NodePatch {
  return {
    id,
    status: "skipped",
    severity: "low",
    summary,
    explanation:
      "Aegis did not run this downstream check because an earlier point in the connection chain failed.",
    evidence: [
      unknownEvidence(
        `${id}-skipped`,
        "Check skipped",
        "Waiting for earlier failure to be resolved"
      )
    ],
    likelyCauses: ["Earlier timeline failure prevents this check from being meaningful"],
    recommendedFixes: []
  };
}

function buildNodes(patches: NodePatch[]): DiagnosticNode[] {
  const patchMap = new Map(patches.map((patch) => [patch.id, patch]));
  return TIMELINE_DEFINITION.map((definition) =>
    patchNode(baseNode(definition.id), patchMap.get(definition.id))
  );
}

function makeScan(id: ScenarioId, patches: NodePatch[]): ScanResult {
  const nodes = buildNodes(patches);
  const diagnosis = generateOverallDiagnosis(nodes);

  return {
    id: `fixture-${id}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    mode: "fixture",
    overallStatus: getOverallStatus(nodes),
    diagnosis,
    nodes,
    environment: {
      platform: "windows",
      os: "Windows 11 Pro",
      hostname: "DESKTOP-AEGIS",
      appVersion: "1.3.0.2024",
      isAdmin: false
    }
  };
}

function scenarioPatches(id: ScenarioId): NodePatch[] {
  switch (id) {
    case "healthy":
      return [];
    case "dns-failure":
      return [
        {
          id: "dns",
          status: "failed",
          severity: "high",
          summary: "Domain name lookups are failing.",
          explanation:
            "The device can reach public IP addresses, but domain names are not resolving. Most websites and apps need DNS before they can connect.",
          evidence: [
            okEvidence("server", "DNS server", "192.168.1.1"),
            failedEvidence("google", "google.com lookup", "Failed", "Resolve-DnsName timed out."),
            failedEvidence("cloudflare", "cloudflare.com lookup", "Failed"),
            okEvidence("ip-path", "External IP path", "1.1.1.1 reachable")
          ],
          likelyCauses: [
            "Router DNS forwarding is stuck",
            "Stale local DNS cache",
            "Incorrect DNS server from DHCP",
            "Filtering or security software is blocking DNS"
          ],
          recommendedFixes: getFixActions([
            "flush-dns",
            "renew-dhcp",
            "dns-automatic",
            "set-public-dns",
            "open-router-settings",
            "open-network-settings"
          ]),
          rawOutput:
            "Resolve-DnsName google.com\nResolve-DnsName: DNS request timed out.\n\nTest-NetConnection 1.1.1.1\nTcpTestSucceeded: True"
        },
        {
          id: "windows",
          status: "warning",
          severity: "medium",
          summary: "The operating system may report limited connectivity because DNS failed.",
          explanation:
            "Operating-system internet status relies partly on DNS. Since DNS is failing, the status warning is likely a symptom, not the root cause.",
          evidence: [
            warningEvidence("ncsi", "OS connectivity", "Limited"),
            okEvidence("proxy", "WinHTTP proxy", "Direct access")
          ],
          likelyCauses: ["DNS failure is affecting operating-system connectivity detection"]
        },
        {
          id: "apps",
          status: "unknown",
          severity: "low",
          summary: "App checks are inconclusive until DNS is repaired.",
          explanation:
            "Most app checks need domain resolution. Aegis will retest this after DNS works.",
          evidence: [
            unknownEvidence("https", "HTTPS by hostname", "Not tested", "DNS failed before app-layer checks.")
          ],
          likelyCauses: ["DNS failure blocks hostname-based app checks"]
        }
      ];
    case "dhcp-apipa":
      return [
        {
          id: "ip",
          status: "failed",
          severity: "high",
          summary: "The device has an APIPA address instead of a valid network address.",
          explanation:
            "The Wi-Fi link is connected, but DHCP did not provide a usable IP address. A 169.254.x.x address only works for limited local fallback networking.",
          evidence: [
            failedEvidence("ipv4", "IPv4 address", "169.254.77.18", "APIPA fallback range detected."),
            failedEvidence("gateway", "Default gateway", "Missing"),
            warningEvidence("dhcp", "DHCP", "Enabled but no lease")
          ],
          likelyCauses: [
            "Router DHCP service is unavailable",
            "Signal/authentication completed but network admission failed",
            "Static IP or DHCP client state is stale"
          ],
          recommendedFixes: getFixActions([
            "renew-dhcp",
            "reconnect-wifi",
            "restart-adapter",
            "open-network-settings",
            "generate-wlan-report"
          ]),
          rawOutput:
            "IPv4 Address: 169.254.77.18\nDefault Gateway: \nDHCP Enabled: Yes\nLease Obtained: N/A"
        },
        makeSkipped("gateway", "Gateway cannot be checked without a valid IP configuration."),
        makeSkipped("internet", "Internet checks require a valid IP address first."),
        makeSkipped("dns", "DNS checks require a valid IP address first."),
        {
          id: "windows",
          status: "warning",
          summary: "The operating system reports no internet access.",
          explanation:
            "This warning is expected because the device does not have a valid IP address.",
          evidence: [warningEvidence("connectivity", "IPv4 connectivity", "No traffic")]
        },
        makeSkipped("apps", "Application checks require IP connectivity first.")
      ];
    case "no-adapter":
      return [
        {
          id: "adapter",
          status: "failed",
          severity: "high",
          summary: "No enabled Wi-Fi adapter was detected.",
          explanation:
            "Windows does not report a usable wireless adapter. The driver may be missing, the adapter may be disabled, or no wireless hardware is present.",
          evidence: [
            failedEvidence("wifi-adapter", "Wi-Fi adapter", "Not found"),
            warningEvidence("pnp", "Network devices", "Ethernet only")
          ],
          likelyCauses: [
            "Wireless adapter disabled",
            "Driver problem",
            "USB or internal Wi-Fi hardware disconnected"
          ],
          recommendedFixes: getFixActions([
            "open-device-manager",
            "open-network-settings",
            "generate-wlan-report"
          ]),
          rawOutput:
            "Get-NetAdapter\nName: Ethernet Status: Up\nNo interface with NdisPhysicalMedium WirelessLan"
        },
        makeSkipped("wifi", "Wi-Fi service checks need a wireless adapter."),
        makeSkipped("profile", "Profiles cannot be evaluated without Wi-Fi."),
        makeSkipped("ip", "IP checks for Wi-Fi are unavailable."),
        makeSkipped("gateway", "Gateway checks are unavailable."),
        makeSkipped("internet", "Internet checks are unavailable."),
        makeSkipped("dns", "DNS checks are unavailable."),
        makeSkipped("windows", "Operating-system status is not meaningful without an adapter."),
        makeSkipped("apps", "App checks are unavailable.")
      ];
    case "wlan-service-stopped":
      return [
        {
          id: "wifi",
          status: "failed",
          severity: "high",
          summary: "Wireless management is stopped.",
          explanation:
            "Windows can see the Wi-Fi adapter, but the service responsible for managing wireless networks is not running.",
          evidence: [
            failedEvidence("service", "WlanSvc", "Stopped"),
            unknownEvidence("interface", "Wireless interface", "Unavailable while service is stopped")
          ],
          likelyCauses: [
            "WLAN AutoConfig service stopped",
            "Service startup failure",
            "Security or optimization tool disabled Wi-Fi management"
          ],
          recommendedFixes: getFixActions([
            "restart-wlan-service",
            "open-network-settings",
            "generate-wlan-report"
          ]),
          rawOutput:
            "Get-Service WlanSvc\nStatus   Name\nStopped  WlanSvc\n\nnetsh wlan show interfaces\nThere is no wireless interface on the system."
        },
        makeSkipped("profile", "Profile checks require the WLAN service."),
        makeSkipped("ip", "IP checks require Wi-Fi to connect first."),
        makeSkipped("gateway", "Gateway checks require Wi-Fi connectivity."),
        makeSkipped("internet", "Internet checks require Wi-Fi connectivity."),
        makeSkipped("dns", "DNS checks require Wi-Fi connectivity."),
        makeSkipped("windows", "Operating-system status is blocked by the Wi-Fi service failure."),
        makeSkipped("apps", "App checks are blocked by the Wi-Fi service failure.")
      ];
    case "gateway-unreachable":
      return [
        {
          id: "gateway",
          status: "failed",
          severity: "high",
          summary: "The default gateway is present but not responding.",
          explanation:
            "The device has a valid IP configuration, but packets to the router are not getting replies.",
          evidence: [
            okEvidence("gateway", "Default gateway", "192.168.1.1"),
            failedEvidence("ping", "Gateway ping", "Request timed out"),
            okEvidence("route", "Default route", "0.0.0.0/0 via 192.168.1.1")
          ],
          likelyCauses: [
            "Router is overloaded or offline",
            "Local Wi-Fi isolation or firewall issue",
            "Bad subnet/gateway pairing"
          ],
          recommendedFixes: getFixActions([
            "renew-dhcp",
            "reconnect-wifi",
            "restart-adapter",
            "open-router-settings",
            "open-network-settings",
            "generate-wlan-report"
          ]),
          rawOutput:
            "DefaultGateway: 192.168.1.1\nPing 192.168.1.1: Request timed out"
        },
        makeSkipped("internet", "Internet checks depend on reaching the gateway."),
        makeSkipped("dns", "DNS checks depend on reaching the gateway."),
        {
          id: "windows",
          status: "warning",
          summary: "The operating system reports no internet because the gateway is unreachable.",
          explanation:
            "This is consistent with the failed gateway check and is not the primary failure.",
          evidence: [warningEvidence("connectivity", "IPv4 connectivity", "Local network only")]
        },
        makeSkipped("apps", "App checks depend on gateway reachability.")
      ];
    case "internet-unreachable":
      return [
        {
          id: "internet",
          status: "failed",
          severity: "high",
          summary: "The router is reachable, but public IP endpoints are not.",
          explanation:
            "Local network connectivity works, but the route beyond the router is failing.",
          evidence: [
            okEvidence("gateway", "Gateway", "192.168.1.1 reachable"),
            failedEvidence("cloudflare", "1.1.1.1", "Unreachable"),
            failedEvidence("google", "8.8.8.8", "Unreachable")
          ],
          likelyCauses: [
            "ISP outage",
            "Router WAN disconnected",
            "VPN or firewall route problem"
          ],
          recommendedFixes: getFixActions([
            "renew-dhcp",
            "reconnect-wifi",
            "restart-adapter",
            "open-router-settings",
            "generate-wlan-report",
            "open-network-settings"
          ]),
          rawOutput:
            "Ping 192.168.1.1: Reply\nPing 1.1.1.1: Request timed out\nTest-NetConnection 8.8.8.8: TcpTestSucceeded=False"
        },
        makeSkipped("dns", "DNS cannot be trusted while external IP connectivity is down."),
        {
          id: "windows",
          status: "warning",
          summary: "The operating system reports no internet access.",
          explanation:
            "This warning matches the failed external IP connectivity check.",
          evidence: [warningEvidence("connectivity", "IPv4 connectivity", "No internet")]
        },
        {
          id: "apps",
          status: "failed",
          summary: "Apps cannot reach external services.",
          explanation:
            "Application traffic is expected to fail while public IP connectivity is unavailable.",
          evidence: [failedEvidence("https", "HTTPS endpoint", "Unreachable")]
        }
      ];
    case "proxy-app-issue":
      return [
        {
          id: "windows",
          status: "warning",
          severity: "medium",
          summary: "A system proxy is configured.",
          explanation:
            "Core internet and DNS checks pass, but the operating system has a proxy configured. If the proxy is stale or unreachable, apps may fail while raw connectivity works.",
          evidence: [
            warningEvidence("proxy", "WinHTTP proxy", "proxy.corp.example:8080"),
            okEvidence("connectivity", "IPv4 connectivity", "Internet")
          ],
          likelyCauses: [
            "Stale proxy settings",
            "VPN profile left proxy enabled",
            "Corporate proxy unreachable outside the office"
          ],
          recommendedFixes: getFixActions([
            "reset-proxy",
            "open-network-settings",
            "generate-wlan-report"
          ]),
          rawOutput:
            "Current WinHTTP proxy settings:\n    Proxy Server(s): proxy.corp.example:8080\n    Bypass List: <local>"
        },
        {
          id: "apps",
          status: "failed",
          severity: "medium",
          summary: "HTTPS app-layer checks fail through the configured proxy.",
          explanation:
            "The network path and DNS are working, but app-style HTTPS traffic is failing. Proxy configuration is the strongest signal.",
          evidence: [
            failedEvidence("https", "HTTPS 443", "Failed"),
            warningEvidence("proxy", "Proxy", "Enabled"),
            okEvidence("dns", "DNS", "Resolving")
          ],
          likelyCauses: [
            "Proxy server unavailable",
            "Proxy requires VPN or authentication",
            "Application-specific proxy override"
          ],
          recommendedFixes: getFixActions([
            "reset-proxy",
            "open-network-settings",
            "generate-wlan-report"
          ]),
          rawOutput:
            "Test-NetConnection www.microsoft.com -Port 443\nTcpTestSucceeded: False\nProxy: proxy.corp.example:8080"
        }
      ];
    case "windows-false-negative":
      return [
        {
          id: "windows",
          status: "warning",
          severity: "medium",
          summary: "Operating-system status disagrees with direct connectivity tests.",
          explanation:
            "Aegis can reach the internet, resolve DNS, and connect to HTTPS, but the operating system still reports limited connectivity.",
          evidence: [
            warningEvidence("ncsi", "Windows connectivity", "No Internet"),
            okEvidence("internet", "External IP", "Reachable"),
            okEvidence("dns", "DNS", "Resolving"),
            okEvidence("apps", "HTTPS", "Reachable")
          ],
          likelyCauses: [
            "NCSI false negative",
            "Connectivity status cache is stale",
            "Captive portal detection endpoint blocked"
          ],
          recommendedFixes: getFixActions([
            "flush-dns",
            "open-network-settings",
            "generate-wlan-report"
          ]),
          rawOutput:
            "Get-NetConnectionProfile: IPv4Connectivity=NoTraffic\nTest-NetConnection 1.1.1.1: True\nResolve-DnsName google.com: Success"
        }
      ];
    case "captive-portal":
      return [
        {
          id: "internet",
          status: "warning",
          severity: "medium",
          summary: "External connectivity is partially available.",
          explanation:
            "Some low-level tests respond, but web requests do not behave like normal internet access.",
          evidence: [
            okEvidence("gateway", "Gateway", "Reachable"),
            warningEvidence("http", "HTTP probe", "Redirected")
          ],
          likelyCauses: ["Public Wi-Fi requires sign-in", "Captive portal intercepts web traffic"]
        },
        {
          id: "windows",
          status: "warning",
          severity: "medium",
          summary: "Captive portal sign-in is suspected.",
          explanation:
            "The network appears to redirect web traffic, which commonly means you need to open a browser and accept terms or sign in.",
          evidence: [
            warningEvidence("captive", "Captive portal", "Suspected"),
            warningEvidence("redirect", "HTTP redirect", "login.network.local")
          ],
          likelyCauses: [
            "Hotel, airport, office, or guest Wi-Fi login page",
            "Network terms must be accepted"
          ],
          recommendedFixes: getFixActions([
            "open-captive-portal",
            "open-network-settings",
            "generate-wlan-report"
          ]),
          rawOutput:
            "Invoke-WebRequest http://www.msftconnecttest.com/connecttest.txt\nStatusCode: 302\nLocation: http://login.network.local"
        },
        {
          id: "apps",
          status: "warning",
          severity: "medium",
          summary: "Apps may fail until the network sign-in is complete.",
          explanation:
            "Apps often cannot complete requests until the captive portal allows normal internet traffic.",
          evidence: [
            warningEvidence("redirect", "HTTPS probe", "Redirect/login required")
          ],
          likelyCauses: ["Captive portal not completed"]
        }
      ];
  }
}

export function createScenarioScanResult(scenarioId: ScenarioId = "healthy"): ScanResult {
  return makeScan(scenarioId, scenarioPatches(scenarioId));
}
