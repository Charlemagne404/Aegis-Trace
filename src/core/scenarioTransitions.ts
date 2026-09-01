import type { ScenarioId } from "./diagnosticScenarios";

const SCENARIO_FIX_TRANSITIONS: Partial<
  Record<ScenarioId, Partial<Record<string, ScenarioId>>>
> = {
  "dns-failure": {
    "flush-dns": "healthy",
    "renew-dhcp": "healthy",
    "dns-automatic": "healthy",
    "set-public-dns": "healthy"
  },
  "dhcp-apipa": {
    "renew-dhcp": "healthy",
    "reconnect-wifi": "healthy",
    "restart-adapter": "healthy"
  },
  "wlan-service-stopped": {
    "restart-wlan-service": "healthy"
  },
  "gateway-unreachable": {
    "renew-dhcp": "healthy",
    "reconnect-wifi": "healthy",
    "restart-adapter": "healthy"
  },
  "windows-false-negative": {
    "flush-dns": "healthy"
  },
  "captive-portal": {
    "open-captive-portal": "healthy",
    "open-network-settings": "healthy"
  },
  "internet-unreachable": {
    "renew-dhcp": "healthy",
    "reconnect-wifi": "healthy",
    "restart-adapter": "healthy"
  },
  "proxy-app-issue": {
    "reset-proxy": "healthy"
  }
};

export function projectScenarioAfterFix(
  scenarioId: ScenarioId,
  fixId: string
): ScenarioId {
  return SCENARIO_FIX_TRANSITIONS[scenarioId]?.[fixId] ?? scenarioId;
}
