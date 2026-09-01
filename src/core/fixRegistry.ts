import type {
  FixAction,
  FixConfirmation,
  FixSafety,
  PlatformId,
  ScanResult
} from "./types";

export const AGGRESSIVE_CONFIRMATION_PHRASE = "RESET";

export const FIX_ACTIONS: Record<string, FixAction> = {
  "flush-dns": {
    id: "flush-dns",
    title: "Flush DNS cache",
    description:
      "Clears stale local DNS entries so the operating system asks your configured DNS server again.",
    safety: "safe",
    requiresAdmin: false,
    commandsPreview: ["ipconfig /flushdns"],
    estimatedImpact: "No connection reset. Existing apps may retry name lookups."
  },
  "renew-dhcp": {
    id: "renew-dhcp",
    title: "Renew DHCP lease",
    description:
      "Requests a fresh IP configuration from the router or DHCP server.",
    safety: "safe",
    requiresAdmin: false,
    commandsPreview: ["ipconfig /release", "ipconfig /renew"],
    estimatedImpact: "Connection may drop briefly while the lease is renewed."
  },
  "restart-wlan-service": {
    id: "restart-wlan-service",
    title: "Restart WLAN AutoConfig",
    description:
      "Restarts the operating-system service or interface that manages wireless discovery and connection.",
    safety: "safe",
    requiresAdmin: true,
    commandsPreview: ["Restart-Service WlanSvc"],
    estimatedImpact: "Wi-Fi may disconnect briefly and reconnect automatically."
  },
  "generate-wlan-report": {
    id: "generate-wlan-report",
    title: "Generate WLAN report",
    description:
      "Opens the platform's built-in wireless diagnostics tool for local review.",
    safety: "safe",
    requiresAdmin: false,
    commandsPreview: ["netsh wlan show wlanreport"],
    estimatedImpact: "Read-only report generation. No network settings are changed."
  },
  "open-network-settings": {
    id: "open-network-settings",
    title: "Open Network Settings",
    description:
      "Opens the platform network settings so you can review connection state manually.",
    safety: "safe",
    requiresAdmin: false,
    commandsPreview: ["start ms-settings:network"],
    estimatedImpact: "No settings are changed automatically."
  },
  "open-device-manager": {
    id: "open-device-manager",
    title: "Open Device Manager",
    description:
      "Opens Device Manager so you can check whether the wireless adapter is disabled or missing a driver.",
    safety: "safe",
    requiresAdmin: false,
    commandsPreview: ["devmgmt.msc"],
    estimatedImpact: "Opens a Windows administration window. No device is changed automatically."
  },
  "reconnect-wifi": {
    id: "reconnect-wifi",
    title: "Reconnect to current Wi-Fi",
    description:
      "Disconnects and reconnects the active Wi-Fi connection while keeping its saved profile.",
    safety: "moderate",
    requiresAdmin: false,
    commandsPreview: ["netsh wlan disconnect", "netsh wlan connect name=\"<SSID>\""],
    estimatedImpact: "Wi-Fi will be unavailable briefly while the connection is rebuilt.",
    warning:
      "This interrupts active downloads, calls, and remote sessions, but does not delete the saved profile."
  },
  "open-router-settings": {
    id: "open-router-settings",
    title: "Open router settings",
    description:
      "Opens the detected default gateway in your browser so you can check router status or WAN settings.",
    safety: "safe",
    requiresAdmin: false,
    commandsPreview: ["Open http://<gateway> in your browser"],
    estimatedImpact: "Opens your browser. Aegis does not change router settings automatically."
  },
  "open-captive-portal": {
    id: "open-captive-portal",
    title: "Open Wi-Fi sign-in page",
    description:
      "Opens a connectivity page that can trigger the hotel, office, or public Wi-Fi sign-in screen.",
    safety: "safe",
    requiresAdmin: false,
    commandsPreview: ["Open the network sign-in page in your browser"],
    estimatedImpact: "Opens a browser. Aegis never captures or submits your sign-in details.",
    warning:
      "Complete any sign-in or terms step in the browser before returning to Aegis and re-running the scan."
  },
  "reset-proxy": {
    id: "reset-proxy",
    title: "Clear detected system proxy",
    description:
      "Clears the detected manual system proxy so apps can try a direct connection again.",
    safety: "moderate",
    requiresAdmin: false,
    commandsPreview: ["netsh winhttp reset proxy"],
    estimatedImpact: "Apps using the previous proxy may reconnect directly.",
    warning:
      "Do not use this if your workplace or VPN requires the proxy. Save the existing proxy details first."
  },
  "restart-adapter": {
    id: "restart-adapter",
    title: "Restart selected adapter",
    description:
      "Disables and re-enables the active network adapter to recover a stuck interface.",
    safety: "moderate",
    requiresAdmin: true,
    commandsPreview: [
      "Disable-NetAdapter -Name \"<adapter>\" -Confirm:$false",
      "Enable-NetAdapter -Name \"<adapter>\" -Confirm:$false"
    ],
    estimatedImpact: "The network connection will drop briefly.",
    warning:
      "Use only after safer fixes fail. This interrupts active downloads, calls, and remote sessions."
  },
  "forget-current-profile": {
    id: "forget-current-profile",
    title: "Forget current Wi-Fi profile",
    description:
      "Deletes the saved Wi-Fi profile so the device can reconnect from a clean profile.",
    safety: "moderate",
    requiresAdmin: false,
    commandsPreview: ["netsh wlan delete profile name=\"<SSID>\""],
    estimatedImpact: "You will need the Wi-Fi password to reconnect.",
    warning:
      "Aegis never reads or exports saved Wi-Fi passwords. Make sure you know the password first."
  },
  "dns-automatic": {
    id: "dns-automatic",
    title: "Reset DNS to automatic",
    description:
      "Returns the adapter to DNS servers provided by DHCP instead of manually configured DNS.",
    safety: "moderate",
    requiresAdmin: true,
    commandsPreview: [
      "Set-DnsClientServerAddress -InterfaceAlias \"<adapter>\" -ResetServerAddresses"
    ],
    estimatedImpact: "Name resolution may change immediately.",
    warning:
      "This changes adapter DNS settings. Review the command preview before applying."
  },
  "set-public-dns": {
    id: "set-public-dns",
    title: "Temporarily set public DNS",
    description:
      "Sets DNS to Cloudflare and Google public resolvers for the active adapter.",
    safety: "moderate",
    requiresAdmin: true,
    commandsPreview: [
      "Set-DnsClientServerAddress -InterfaceAlias \"<adapter>\" -ServerAddresses 1.1.1.1,8.8.8.8"
    ],
    estimatedImpact: "Changes DNS behavior until reverted.",
    warning:
      "Only use this when your current DNS server is confirmed broken or unreachable."
  },
  "winsock-reset": {
    id: "winsock-reset",
    title: "Winsock reset",
    description:
      "Resets the Windows network socket catalog. This is a Windows-only last-resort repair.",
    safety: "aggressive",
    requiresAdmin: true,
    commandsPreview: ["netsh winsock reset"],
    estimatedImpact: "A restart is usually required.",
    warning:
      "This can disrupt VPN, security, and proxy software. Aegis will never run it automatically."
  },
  "tcpip-reset": {
    id: "tcpip-reset",
    title: "TCP/IP reset",
    description:
      "Resets core Windows TCP/IP configuration. This is a Windows-only advanced last-resort fix.",
    safety: "aggressive",
    requiresAdmin: true,
    commandsPreview: ["netsh int ip reset"],
    estimatedImpact: "A restart is usually required and custom IP settings may be lost.",
    warning:
      "Review adapter settings first. This should only be used after targeted fixes fail."
  },
  "full-network-reset-settings": {
    id: "full-network-reset-settings",
    title: "Open full network reset",
    description:
      "Opens the Windows network reset settings page without running the reset for you.",
    safety: "aggressive",
    requiresAdmin: true,
    commandsPreview: ["start ms-settings:network-status"],
    estimatedImpact:
      "No reset is performed by Aegis. Windows will show its own final confirmation.",
    warning:
      "Full network reset is a last resort and may remove adapters, VPNs, and saved networking configuration."
  }
};

export function getFixAction(id: string): FixAction {
  const action = FIX_ACTIONS[id];
  if (!action) {
    throw new Error(`Unknown fix action: ${id}`);
  }
  return action;
}

export function getFixActions(ids: string[]): FixAction[] {
  return ids.map(getFixAction);
}

const ADVANCED_FIX_IDS: Partial<Record<PlatformId, string[]>> = {
  windows: ["winsock-reset", "tcpip-reset", "full-network-reset-settings"]
};

export function getAdvancedFixActions(platform: PlatformId): FixAction[] {
  return rankFixes(getFixActions(ADVANCED_FIX_IDS[platform] ?? []));
}

function uniqueFixes(fixes: FixAction[]): FixAction[] {
  return fixes.filter(
    (fix, index, allFixes) =>
      allFixes.findIndex((candidate) => candidate.id === fix.id) === index
  );
}

export type SupplementalRepairOptions = {
  alternatives: FixAction[];
  advanced: FixAction[];
};

/**
 * Keeps the main repair plan concise while recovering contextual alternatives that were
 * attached to individual timeline nodes. Native adapters use this same node-level list to
 * withhold actions they cannot safely target on the current platform.
 */
export function getSupplementalRepairOptions(
  scan: Pick<ScanResult, "overallStatus" | "diagnosis" | "nodes">,
  platform: PlatformId
): SupplementalRepairOptions {
  if (scan.overallStatus === "ok") {
    return { alternatives: [], advanced: [] };
  }

  const primaryIds = new Set(
    scan.diagnosis.recommendedFixes.slice(0, 4).map((fix) => fix.id)
  );
  const nodeFixes = scan.nodes.flatMap((node) => node.recommendedFixes);
  const diagnosisOverflow = scan.diagnosis.recommendedFixes.slice(4);
  const contextualFixes = uniqueFixes([...diagnosisOverflow, ...nodeFixes]).filter(
    (fix) => !primaryIds.has(fix.id)
  );
  const advanced = uniqueFixes([
    ...contextualFixes.filter((fix) => fix.safety === "aggressive"),
    ...getAdvancedFixActions(platform)
  ]);

  return {
    alternatives: rankFixes(
      contextualFixes.filter((fix) => fix.safety !== "aggressive")
    ),
    advanced: rankFixes(advanced)
  };
}

export function isAllowlistedFixId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(FIX_ACTIONS, id);
}

export function safetySortValue(safety: FixSafety): number {
  if (safety === "safe") return 0;
  if (safety === "moderate") return 1;
  return 2;
}

export function requiresExplicitConfirmation(safety: FixSafety): boolean {
  return safety !== "safe";
}

export function requiresTypedConfirmation(safety: FixSafety): boolean {
  return safety === "aggressive";
}

export function buildFixConfirmation(
  safety: FixSafety,
  typedPhrase?: string
): FixConfirmation | undefined {
  if (!requiresExplicitConfirmation(safety)) {
    return undefined;
  }

  return {
    acknowledged: true,
    typedPhrase: requiresTypedConfirmation(safety) ? typedPhrase : undefined
  };
}

export function filterAutomaticRecommendations(fixes: FixAction[]): FixAction[] {
  return fixes.filter((fix) => fix.safety !== "aggressive");
}

export function rankFixes(fixes: FixAction[]): FixAction[] {
  return [...fixes].sort((a, b) => {
    const safetyDelta = safetySortValue(a.safety) - safetySortValue(b.safety);
    if (safetyDelta !== 0) return safetyDelta;
    return Number(a.requiresAdmin) - Number(b.requiresAdmin);
  });
}
