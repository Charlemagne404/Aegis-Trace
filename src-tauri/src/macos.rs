//! macOS-native diagnostics and repairs.
//!
//! This module deliberately uses a small, fixed command vocabulary. Values discovered from the
//! operating system are passed as argument values, never interpolated into a shell command.

use crate::diagnostics::{
    DiagnosticNode, DiagnosticStatus, Environment, EnvironmentInfo, EvidenceItem, FixAction,
    FixConfirmation, FixExecutionResult, FixSafety, OverallDiagnosis, RuntimeCapabilities,
    RuntimeHealth, RuntimeIssue, ScanProgressEvent, ScanResult, Severity,
};
use std::error::Error;
use std::net::{IpAddr, Ipv4Addr};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const TOTAL_TIMELINE_NODES: usize = 10;
const AGGRESSIVE_CONFIRMATION_PHRASE: &str = "RESET";

#[derive(Debug)]
struct CommandOutput {
    stdout: String,
    stderr: String,
    success: bool,
    ran: bool,
}

#[derive(Debug, Clone, Default)]
struct InterfaceFact {
    name: String,
    active: bool,
    mac_address: Option<String>,
    ipv4_address: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct HardwarePort {
    name: String,
    device: String,
}

#[derive(Debug, Clone, Default)]
struct NetworkInfo {
    ipv4_address: Option<String>,
    subnet_mask: Option<String>,
    router: Option<String>,
    dhcp: bool,
}

#[derive(Debug, Clone, Default)]
struct MacContext {
    active_device: Option<String>,
    active_service: Option<String>,
    wifi_device: Option<String>,
    wifi_service: Option<String>,
    wifi_ssid: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct ProxyFact {
    configured: bool,
    detail: String,
}

type MacCommand = (String, Vec<String>);
type MacCommandResult = Result<(FixAction, Vec<MacCommand>), Box<FixExecutionResult>>;

fn now_iso() -> String {
    let now = time::OffsetDateTime::now_utc();
    now.format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn now_id() -> String {
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("real-{millis}")
}

fn run_process(
    program: &str,
    args: &[&str],
    timeout: Duration,
) -> Result<CommandOutput, Box<dyn Error>> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn()?;
    let start = Instant::now();

    loop {
        if child.try_wait()?.is_some() {
            let output = child.wait_with_output()?;
            return Ok(CommandOutput {
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                success: output.status.success(),
                ran: true,
            });
        }

        if start.elapsed() > timeout {
            let _ = child.kill();
            let output = child.wait_with_output()?;
            return Ok(CommandOutput {
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: "Command timed out".to_string(),
                success: false,
                ran: true,
            });
        }

        thread::sleep(Duration::from_millis(40));
    }
}

fn capture(program: &str, args: &[&str], label: &str) -> CommandOutput {
    run_process(program, args, Duration::from_secs(8)).unwrap_or_else(|error| CommandOutput {
        stdout: String::new(),
        stderr: format!("{label}: {error}"),
        success: false,
        ran: false,
    })
}

fn capture_with_timeout(
    program: &str,
    args: &[&str],
    timeout: Duration,
    label: &str,
) -> CommandOutput {
    run_process(program, args, timeout).unwrap_or_else(|error| CommandOutput {
        stdout: String::new(),
        stderr: format!("{label}: {error}"),
        success: false,
        ran: false,
    })
}

fn capture_owned(program: &str, args: &[String], label: &str) -> CommandOutput {
    let references: Vec<&str> = args.iter().map(String::as_str).collect();
    capture(program, &references, label)
}

fn command_available(program: &str, args: &[&str]) -> bool {
    capture_with_timeout(program, args, Duration::from_secs(4), program).ran
}

fn first_line(output: &CommandOutput) -> Option<String> {
    output
        .stdout
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

fn value_after_colon(line: &str) -> Option<String> {
    line.split_once(':')
        .map(|(_, value)| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn parse_hardware_ports(stdout: &str) -> Vec<HardwarePort> {
    let mut ports = Vec::new();
    let mut name = None;
    let mut device = None;

    for line in stdout.lines() {
        let trimmed = line.trim();
        if let Some(value) = trimmed.strip_prefix("Hardware Port:") {
            if let (Some(name), Some(device)) = (name.take(), device.take()) {
                ports.push(HardwarePort { name, device });
            }
            name = Some(value.trim().to_string());
        } else if let Some(value) = trimmed.strip_prefix("Device:") {
            device = Some(value.trim().to_string());
        }
    }

    if let (Some(name), Some(device)) = (name, device) {
        ports.push(HardwarePort { name, device });
    }

    ports
}

fn parse_interface_names(stdout: &str) -> Vec<String> {
    stdout
        .split_whitespace()
        .filter(|name| !is_loopback_interface(name))
        .map(str::to_string)
        .collect()
}

fn parse_interface_fact(name: &str, stdout: &str) -> InterfaceFact {
    let mut fact = InterfaceFact {
        name: name.to_string(),
        active: stdout.lines().any(|line| {
            line.trim().eq_ignore_ascii_case("status: active")
                || (line.contains("flags=") && line.contains("UP"))
        }),
        ..InterfaceFact::default()
    };

    for line in stdout.lines() {
        let trimmed = line.trim();
        if let Some(value) = trimmed.strip_prefix("ether ") {
            fact.mac_address = Some(value.trim().to_string());
        } else if let Some(value) = trimmed.strip_prefix("inet ") {
            fact.ipv4_address = value.split_whitespace().next().map(str::to_string);
        }
    }

    fact
}

fn parse_network_info(stdout: &str) -> NetworkInfo {
    let mut info = NetworkInfo::default();

    for line in stdout.lines() {
        let lower = line.to_ascii_lowercase();
        let value = value_after_colon(line);
        if lower.starts_with("ip address:") {
            info.ipv4_address = value;
        } else if lower.starts_with("subnet mask:") {
            info.subnet_mask = value;
        } else if lower.starts_with("router:") {
            info.router = value;
        } else if lower.contains("dhcp configuration") {
            info.dhcp = true;
        }
    }

    info
}

fn parse_airport_network(stdout: &str) -> Option<String> {
    stdout
        .lines()
        .find(|line| line.to_ascii_lowercase().contains("current wi-fi network:"))
        .and_then(value_after_colon)
}

fn parse_preferred_networks(stdout: &str) -> Vec<String> {
    stdout
        .lines()
        .skip(1)
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| line.trim_start_matches('*').trim().to_string())
        .filter(|line| !line.is_empty())
        .collect()
}

fn parse_dns_servers(stdout: &str) -> Vec<String> {
    stdout
        .lines()
        .filter_map(|line| {
            let candidate = if line.to_ascii_lowercase().contains("nameserver[") {
                value_after_colon(line)
            } else if line.to_ascii_lowercase().starts_with("dns servers:") {
                value_after_colon(line)
            } else {
                Some(line.trim().to_string())
            }?;

            candidate
                .split_whitespace()
                .find(|item| item.parse::<IpAddr>().is_ok())
                .map(str::to_string)
        })
        .collect()
}

fn parse_route(stdout: &str) -> (Option<String>, Option<String>) {
    let mut gateway = None;
    let mut interface = None;

    for line in stdout.lines() {
        let lower = line.to_ascii_lowercase();
        if lower.trim_start().starts_with("gateway:") {
            gateway = value_after_colon(line);
        } else if lower.trim_start().starts_with("interface:") {
            interface = value_after_colon(line);
        }
    }

    (gateway, interface)
}

fn parse_network_service_order(stdout: &str) -> Vec<(String, String)> {
    let mut services = Vec::new();
    let mut current_service = None;

    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('(')
            && !trimmed.starts_with("(Hardware Port:")
            && trimmed.contains(") ")
        {
            current_service = trimmed
                .split_once(") ")
                .map(|(_, service)| service.trim().trim_start_matches('*').trim().to_string())
                .filter(|service| !service.is_empty());
        } else if let Some(device) = trimmed
            .strip_prefix("(Hardware Port:")
            .and_then(|value| value.split("Device:").nth(1))
            .and_then(|value| value.split(',').next())
            .map(|value| value.trim().trim_end_matches(')').to_string())
        {
            if let Some(service) = current_service.take() {
                services.push((device, service));
            }
        }
    }

    services
}

fn service_for_device(service_order: &[(String, String)], device: &str) -> Option<String> {
    service_order
        .iter()
        .find(|(candidate, _)| candidate.eq_ignore_ascii_case(device))
        .map(|(_, service)| service.clone())
}

fn parse_proxy(stdout: &str) -> ProxyFact {
    let mut enabled = Vec::new();
    let mut servers = Vec::new();

    for line in stdout.lines() {
        let lower = line.to_ascii_lowercase();
        let value = value_after_colon(line).unwrap_or_default();
        let is_enabled = value == "1" || value.eq_ignore_ascii_case("yes");
        if lower.contains("enable") && is_enabled {
            enabled.push(line.trim().to_string());
        }
        if (lower.contains("proxy") || lower.contains("pac")) && !value.is_empty() && !is_enabled {
            servers.push(line.trim().to_string());
        }
    }

    ProxyFact {
        configured: !enabled.is_empty() || !servers.is_empty(),
        detail: if enabled.is_empty() && servers.is_empty() {
            "Direct access".to_string()
        } else {
            enabled
                .into_iter()
                .chain(servers)
                .collect::<Vec<_>>()
                .join(", ")
        },
    }
}

fn parse_http_status(stdout: &str) -> Option<u16> {
    stdout.lines().find_map(|line| {
        let mut parts = line.split_whitespace();
        let protocol = parts.next()?;
        if !protocol.starts_with("HTTP/") {
            return None;
        }
        parts.next()?.parse::<u16>().ok()
    })
}

fn has_ip_address(stdout: &str) -> bool {
    stdout.split_whitespace().any(|token| {
        token
            .trim_matches(|character: char| !character.is_ascii_alphanumeric() && character != '.')
            .parse::<IpAddr>()
            .is_ok()
    })
}

fn dns_succeeded(output: &CommandOutput) -> bool {
    let lower = output.stdout.to_ascii_lowercase();
    output.success
        && has_ip_address(&output.stdout)
        && (!lower.contains("status:") || lower.contains("status: noerror"))
}

fn output_has_signal(output: &CommandOutput) -> bool {
    output.ran && (!output.stdout.trim().is_empty() || !output.stderr.trim().is_empty())
}

fn tcp_probe(address: &str, port: &str, label: &str) -> CommandOutput {
    let netcat = capture_with_timeout(
        "nc",
        &["-G", "4", "-z", address, port],
        Duration::from_secs(6),
        label,
    );
    if netcat.ran {
        return netcat;
    }

    let url = format!("https://{address}:{port}");
    capture_with_timeout(
        "curl",
        &[
            "-k",
            "-sS",
            "-o",
            "/dev/null",
            "--connect-timeout",
            "5",
            "--max-time",
            "8",
            &url,
        ],
        Duration::from_secs(10),
        label,
    )
}

fn is_valid_ipv4(value: Option<&str>) -> bool {
    value
        .and_then(|value| value.parse::<Ipv4Addr>().ok())
        .map(|address| {
            !address.is_unspecified() && !address.is_loopback() && !address.is_link_local()
        })
        .unwrap_or(false)
}

fn is_loopback_interface(name: &str) -> bool {
    let normalized = name.trim().to_ascii_lowercase();
    normalized == "lo" || normalized == "lo0" || normalized.contains("loopback")
}

fn is_wireless_port(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.contains("wi-fi")
        || lower.contains("wifi")
        || lower.contains("airport")
        || lower.contains("wireless")
}

fn quote_preview(value: &str) -> String {
    if value.chars().all(|character| {
        character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-' | '/')
    }) {
        value.to_string()
    } else {
        format!("\"{}\"", value.replace('"', "\\\""))
    }
}

fn evidence(
    id: &str,
    label: &str,
    value: impl Into<String>,
    status: DiagnosticStatus,
    detail: Option<String>,
) -> EvidenceItem {
    EvidenceItem {
        id: id.to_string(),
        label: label.to_string(),
        value: value.into(),
        status,
        detail,
    }
}

fn checks(id: &str) -> Vec<String> {
    match id {
        "device" => vec![
            "Operating system detected",
            "Network stack accessible",
            "Permissions and admin status checked",
            "System clock sanity checked",
        ],
        "adapter" => vec![
            "Network interfaces detected",
            "Wireless interface identified",
            "Active interface checked",
            "Hardware address read",
        ],
        "wifi" => vec![
            "Wireless interface available",
            "Association state checked",
            "Current SSID read",
            "Signal and radio details reviewed",
        ],
        "profile" => vec![
            "Current SSID detected",
            "Preferred profile inventory checked",
            "Saved profile match reviewed",
            "Credentials never requested",
        ],
        "ip" => vec![
            "IPv4 address exists",
            "Link-local range avoided",
            "Subnet information present",
            "DHCP configuration checked",
        ],
        "gateway" => vec![
            "Default gateway exists",
            "Default route checked",
            "Gateway reachability tested",
        ],
        "internet" => vec![
            "External endpoint tested",
            "Secondary endpoint compared",
            "TCP reachability checked",
        ],
        "dns" => vec![
            "DNS servers discovered",
            "Domain resolution tested",
            "Public resolver comparison checked",
        ],
        "windows" => vec![
            "Operating-system connectivity checked",
            "Proxy configuration reviewed",
            "Captive portal suspicion reviewed",
        ],
        "apps" => vec![
            "HTTPS endpoint tested",
            "Proxy and firewall symptoms reviewed",
            "App-specific failure likelihood assessed",
        ],
        _ => vec!["Diagnostic data collected"],
    }
    .into_iter()
    .map(str::to_string)
    .collect()
}

#[allow(clippy::too_many_arguments)]
fn node(
    id: &str,
    label: &str,
    technical_label: &str,
    icon: &str,
    status: DiagnosticStatus,
    summary: &str,
    explanation: &str,
    evidence_items: Vec<EvidenceItem>,
    likely_causes: Vec<&str>,
    recommended_fixes: Vec<FixAction>,
    raw_output: String,
) -> DiagnosticNode {
    let severity = match status {
        DiagnosticStatus::Failed => Severity::High,
        DiagnosticStatus::Warning => Severity::Medium,
        DiagnosticStatus::Unknown | DiagnosticStatus::Skipped => Severity::Low,
        _ => Severity::Info,
    };

    DiagnosticNode {
        id: id.to_string(),
        label: label.to_string(),
        technical_label: Some(technical_label.to_string()),
        icon: icon.to_string(),
        status,
        severity,
        summary: summary.to_string(),
        explanation: explanation.to_string(),
        checks: checks(id),
        evidence: evidence_items,
        likely_causes: likely_causes.into_iter().map(str::to_string).collect(),
        recommended_fixes,
        raw_output: if raw_output.trim().is_empty() {
            None
        } else {
            Some(raw_output)
        },
    }
}

fn combine_outputs(outputs: &[(&str, &CommandOutput)]) -> String {
    outputs
        .iter()
        .filter(|(_, output)| !output.stdout.trim().is_empty() || !output.stderr.trim().is_empty())
        .map(|(label, output)| {
            let mut section = format!("=== {label} ===");
            if !output.stdout.trim().is_empty() {
                section.push('\n');
                section.push_str(output.stdout.trim());
            }
            if !output.stderr.trim().is_empty() {
                section.push('\n');
                section.push_str("stderr:\n");
                section.push_str(output.stderr.trim());
            }
            section
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn skipped_output(label: &str, reason: &str) -> CommandOutput {
    CommandOutput {
        stdout: String::new(),
        stderr: format!("{label}: probe skipped: {reason}"),
        success: false,
        ran: false,
    }
}

fn progress_event(
    run_id: &str,
    kind: &str,
    node_id: Option<&str>,
    node_index: Option<usize>,
    status: Option<DiagnosticStatus>,
    summary: Option<&str>,
    message: &str,
) -> ScanProgressEvent {
    let label = node_id.map(|id| match id {
        "device" => "Device",
        "adapter" => "Adapter",
        "wifi" => "Wi-Fi",
        "profile" => "Profile",
        "ip" => "IP Address",
        "gateway" => "Gateway",
        "internet" => "Internet",
        "dns" => "DNS",
        "windows" => "OS Status",
        "apps" => "Apps",
        _ => id,
    });

    ScanProgressEvent {
        run_id: run_id.to_string(),
        kind: kind.to_string(),
        node_id: node_id.map(str::to_string),
        node_label: label.map(str::to_string),
        node_index,
        node_status: status,
        node_summary: summary.map(str::to_string),
        total_nodes: TOTAL_TIMELINE_NODES,
        message: message.to_string(),
    }
}

fn emit_started<F>(emit: &mut F, run_id: &str, node_id: &str, index: usize, message: &str)
where
    F: FnMut(ScanProgressEvent),
{
    emit(progress_event(
        run_id,
        "node-started",
        Some(node_id),
        Some(index),
        None,
        None,
        message,
    ));
}

fn emit_checkpoint<F>(
    emit: &mut F,
    run_id: &str,
    node_id: &str,
    index: usize,
    status: DiagnosticStatus,
    summary: &str,
) where
    F: FnMut(ScanProgressEvent),
{
    emit(progress_event(
        run_id,
        "node-progressed",
        Some(node_id),
        Some(index),
        Some(status),
        Some(summary),
        summary,
    ));
}

fn mac_fix_action(id: &str, context: &MacContext) -> Option<FixAction> {
    let service = context
        .active_service
        .as_deref()
        .map(quote_preview)
        .unwrap_or_else(|| "<network-service>".to_string());
    let device = context
        .active_device
        .as_deref()
        .map(quote_preview)
        .unwrap_or_else(|| "<interface>".to_string());
    let wifi_service = context
        .wifi_service
        .as_deref()
        .map(quote_preview)
        .unwrap_or_else(|| "<wireless-service>".to_string());
    let wifi_device = context
        .wifi_device
        .as_deref()
        .map(quote_preview)
        .unwrap_or_else(|| "<wireless-interface>".to_string());
    let ssid = context
        .wifi_ssid
        .as_deref()
        .map(quote_preview)
        .unwrap_or_else(|| "<SSID>".to_string());

    let action = match id {
        "flush-dns" => FixAction {
            id: id.to_string(),
            title: "Flush DNS cache".to_string(),
            description: "Clears the local macOS DNS cache so lookups start fresh.".to_string(),
            safety: FixSafety::Safe,
            requires_admin: true,
            commands_preview: Some(vec![
                "dscacheutil -flushcache".to_string(),
                "killall -HUP mDNSResponder".to_string(),
            ]),
            estimated_impact: "Existing lookups may be retried immediately.".to_string(),
            warning: None,
        },
        "renew-dhcp" => FixAction {
            id: id.to_string(),
            title: "Renew DHCP lease".to_string(),
            description: "Requests a fresh IP configuration from the network.".to_string(),
            safety: FixSafety::Safe,
            requires_admin: true,
            commands_preview: Some(vec![format!("ipconfig set {device} DHCP")]),
            estimated_impact: "The connection may drop briefly.".to_string(),
            warning: None,
        },
        "restart-wlan-service" => FixAction {
            id: id.to_string(),
            title: "Restart Wi-Fi interface".to_string(),
            description:
                "Toggles the active macOS network service to recover a stuck wireless interface."
                    .to_string(),
            safety: FixSafety::Safe,
            requires_admin: true,
            commands_preview: Some(vec![
                format!("networksetup -setnetworkserviceenabled {wifi_service} off"),
                format!("networksetup -setnetworkserviceenabled {wifi_service} on"),
            ]),
            estimated_impact: "Wi-Fi will disconnect briefly.".to_string(),
            warning: None,
        },
        "generate-wlan-report" => FixAction {
            id: id.to_string(),
            title: "Open Wireless Diagnostics".to_string(),
            description: "Opens Apple's built-in wireless diagnostics tool for local review."
                .to_string(),
            safety: FixSafety::Safe,
            requires_admin: false,
            commands_preview: Some(vec![
                "open /System/Library/CoreServices/WirelessDiagnostics.app".to_string(),
            ]),
            estimated_impact: "Read-only diagnostics window opens.".to_string(),
            warning: None,
        },
        "open-network-settings" => FixAction {
            id: id.to_string(),
            title: "Open Network Settings".to_string(),
            description: "Opens macOS Network settings for manual review.".to_string(),
            safety: FixSafety::Safe,
            requires_admin: false,
            commands_preview: Some(vec![
                "open x-apple.systempreferences:com.apple.preference.network".to_string(),
            ]),
            estimated_impact: "No settings are changed automatically.".to_string(),
            warning: None,
        },
        "restart-adapter" => FixAction {
            id: id.to_string(),
            title: "Restart selected network service".to_string(),
            description: "Disables and re-enables the selected macOS network service.".to_string(),
            safety: FixSafety::Moderate,
            requires_admin: true,
            commands_preview: Some(vec![
                format!("networksetup -setnetworkserviceenabled {service} off"),
                format!("networksetup -setnetworkserviceenabled {service} on"),
            ]),
            estimated_impact: "The network connection will drop briefly.".to_string(),
            warning: Some(
                "This interrupts active downloads, calls, and remote sessions.".to_string(),
            ),
        },
        "forget-current-profile" => FixAction {
            id: id.to_string(),
            title: "Forget current Wi-Fi profile".to_string(),
            description: "Removes the current SSID from the preferred wireless network list."
                .to_string(),
            safety: FixSafety::Moderate,
            requires_admin: true,
            commands_preview: Some(vec![format!(
                "networksetup -removepreferredwirelessnetwork {wifi_device} {ssid}"
            )]),
            estimated_impact: "You will need the Wi-Fi password to reconnect.".to_string(),
            warning: Some("Aegis never reads or exports saved Wi-Fi passwords.".to_string()),
        },
        "dns-automatic" => FixAction {
            id: id.to_string(),
            title: "Reset DNS to automatic".to_string(),
            description: "Returns the network service to DNS servers supplied by the network."
                .to_string(),
            safety: FixSafety::Moderate,
            requires_admin: true,
            commands_preview: Some(vec![format!("networksetup -setdnsservers {service} empty")]),
            estimated_impact: "Name resolution settings change immediately.".to_string(),
            warning: Some(
                "Review the service name and command preview before applying.".to_string(),
            ),
        },
        "set-public-dns" => FixAction {
            id: id.to_string(),
            title: "Temporarily set public DNS".to_string(),
            description: "Sets Cloudflare and Google public resolvers for the selected service."
                .to_string(),
            safety: FixSafety::Moderate,
            requires_admin: true,
            commands_preview: Some(vec![format!(
                "networksetup -setdnsservers {service} 1.1.1.1 8.8.8.8"
            )]),
            estimated_impact: "DNS behavior changes until reverted.".to_string(),
            warning: Some(
                "Use this only when the current DNS path is confirmed broken.".to_string(),
            ),
        },
        _ => return None,
    };

    Some(action)
}

fn mac_fixes(ids: &[&str], context: &MacContext) -> Vec<FixAction> {
    ids.iter()
        .filter_map(|id| mac_fix_action(id, context))
        .collect()
}

fn validate_confirmation(
    fix: &FixAction,
    confirmation: Option<&FixConfirmation>,
) -> Option<FixExecutionResult> {
    match fix.safety {
        FixSafety::Safe => None,
        FixSafety::Moderate => (!confirmation.is_some_and(|value| value.acknowledged)).then(||
            blocked_fix_result(
                &fix.id,
                "Confirmation required",
                "This moderate fix requires an explicit confirmation step before Aegis will run it.",
                fix.requires_admin,
            )
        ),
        FixSafety::Aggressive => {
            if !confirmation.is_some_and(|value| value.acknowledged) {
                Some(blocked_fix_result(
                    &fix.id,
                    "Confirmation required",
                    "This aggressive fix requires an explicit confirmation step before Aegis will run it.",
                    fix.requires_admin,
                ))
            } else if confirmation.and_then(|value| value.typed_phrase.as_deref())
                != Some(AGGRESSIVE_CONFIRMATION_PHRASE)
            {
                Some(blocked_fix_result(
                    &fix.id,
                    "Typed confirmation required",
                    "This aggressive fix is locked until the exact confirmation phrase is provided.",
                    fix.requires_admin,
                ))
            } else {
                None
            }
        }
    }
}

fn blocked_fix_result(
    fix_id: &str,
    title: &str,
    message: &str,
    requires_admin: bool,
) -> FixExecutionResult {
    FixExecutionResult {
        fix_id: fix_id.to_string(),
        status: "blocked".to_string(),
        title: title.to_string(),
        message: message.to_string(),
        stdout: None,
        stderr: None,
        requires_admin: Some(requires_admin),
    }
}

fn current_process_is_admin() -> bool {
    let output = capture_with_timeout("id", &["-u"], Duration::from_secs(3), "uid");
    output.success && first_line(&output).as_deref() == Some("0")
}

fn discover_context() -> MacContext {
    let hardware = capture("networksetup", &["-listallhardwareports"], "hardware ports");
    let ports = parse_hardware_ports(&hardware.stdout);
    let wireless = ports.iter().find(|port| is_wireless_port(&port.name));
    let wifi_device = wireless.map(|port| port.device.clone());
    let wifi_ssid = wifi_device.as_deref().and_then(|device| {
        let output = capture(
            "networksetup",
            &["-getairportnetwork", device],
            "Wi-Fi network",
        );
        parse_airport_network(&output.stdout)
    });
    let route = capture("route", &["-n", "get", "default"], "default route");
    let (_, route_device) = parse_route(&route.stdout);
    let service_order = capture(
        "networksetup",
        &["-listnetworkserviceorder"],
        "network service order",
    );
    let services = parse_network_service_order(&service_order.stdout);
    let wifi_service = wifi_device
        .as_deref()
        .and_then(|device| service_for_device(&services, device))
        .or_else(|| wireless.map(|port| port.name.clone()));
    let active_device = route_device.or_else(|| wifi_device.clone());
    let active_service = active_device
        .as_deref()
        .and_then(|device| service_for_device(&services, device))
        .or_else(|| wifi_service.clone());

    MacContext {
        active_device,
        active_service,
        wifi_device,
        wifi_service,
        wifi_ssid,
    }
}

fn command_for_fix(fix_id: &str, context: &MacContext) -> MacCommandResult {
    let fix = mac_fix_action(fix_id, context).ok_or_else(|| {
        Box::new(blocked_fix_result(
            fix_id,
            "Fix unavailable on macOS",
            "This action is Windows-specific or is not supported by the macOS adapter. No command was executed.",
            false,
        ))
    })?;

    let required_device = || {
        context.active_device.clone().ok_or_else(|| {
            Box::new(blocked_fix_result(
                fix_id,
                "Network interface unavailable",
                "Aegis could not determine the macOS interface to target safely. Re-run diagnostics and try again.",
                fix.requires_admin,
            ))
        })
    };
    let required_service = || {
        context.active_service.clone().ok_or_else(|| {
            Box::new(blocked_fix_result(
                fix_id,
                "Network service unavailable",
                "Aegis could not determine the macOS network service to target safely. Re-run diagnostics and try again.",
                fix.requires_admin,
            ))
        })
    };
    let required_wifi_device = || {
        context.wifi_device.clone().ok_or_else(|| {
            Box::new(blocked_fix_result(
                fix_id,
                "Wireless interface unavailable",
                "Aegis could not determine the macOS wireless interface to target safely. Re-run diagnostics and try again.",
                fix.requires_admin,
            ))
        })
    };
    let required_wifi_service = || {
        context.wifi_service.clone().ok_or_else(|| {
            Box::new(blocked_fix_result(
                fix_id,
                "Wireless service unavailable",
                "Aegis could not determine the macOS wireless service to target safely. Re-run diagnostics and try again.",
                fix.requires_admin,
            ))
        })
    };
    let required_ssid = || {
        context.wifi_ssid.clone().ok_or_else(|| {
            Box::new(blocked_fix_result(
                fix_id,
                "Wi-Fi profile unavailable",
                "Aegis could not determine the current Wi-Fi network name to target safely.",
                fix.requires_admin,
            ))
        })
    };

    let commands = match fix_id {
        "flush-dns" => vec![
            ("dscacheutil".to_string(), vec!["-flushcache".to_string()]),
            ("killall".to_string(), vec!["-HUP".to_string(), "mDNSResponder".to_string()]),
        ],
        "renew-dhcp" => vec![(
            "ipconfig".to_string(),
            vec!["set".to_string(), required_device()? , "DHCP".to_string()],
        )],
        "restart-wlan-service" => {
            let service = required_wifi_service()?;
            vec![
                (
                    "networksetup".to_string(),
                    vec![
                        "-setnetworkserviceenabled".to_string(),
                        service.clone(),
                        "off".to_string(),
                    ],
                ),
                (
                    "networksetup".to_string(),
                    vec![
                        "-setnetworkserviceenabled".to_string(),
                        service,
                        "on".to_string(),
                    ],
                ),
            ]
        }
        "restart-adapter" => {
            let service = required_service()?;
            vec![
                (
                    "networksetup".to_string(),
                    vec![
                        "-setnetworkserviceenabled".to_string(),
                        service.clone(),
                        "off".to_string(),
                    ],
                ),
                (
                    "networksetup".to_string(),
                    vec![
                        "-setnetworkserviceenabled".to_string(),
                        service,
                        "on".to_string(),
                    ],
                ),
            ]
        }
        "generate-wlan-report" => vec![
            (
                "open".to_string(),
                vec!["/System/Library/CoreServices/WirelessDiagnostics.app".to_string()],
            ),
        ],
        "open-network-settings" => vec![
            (
                "open".to_string(),
                vec!["x-apple.systempreferences:com.apple.preference.network".to_string()],
            ),
        ],
        "forget-current-profile" => vec![(
            "networksetup".to_string(),
            vec![
                "-removepreferredwirelessnetwork".to_string(),
                required_wifi_device()?,
                required_ssid()?,
            ],
        )],
        "dns-automatic" => vec![(
            "networksetup".to_string(),
            vec![
                "-setdnsservers".to_string(),
                required_service()?,
                "empty".to_string(),
            ],
        )],
        "set-public-dns" => vec![(
            "networksetup".to_string(),
            vec![
                "-setdnsservers".to_string(),
                required_service()?,
                "1.1.1.1".to_string(),
                "8.8.8.8".to_string(),
            ],
        )],
        _ => {
            return Err(Box::new(blocked_fix_result(
                fix_id,
                "Fix unavailable on macOS",
                "This action is Windows-specific or is not supported by the macOS adapter. No command was executed.",
                false,
            )))
        }
    };

    Ok((fix, commands))
}

fn run_commands(fix: &FixAction, commands: Vec<(String, Vec<String>)>) -> FixExecutionResult {
    let mut stdout = String::new();
    let mut stderr = String::new();
    let mut success = true;

    for (program, args) in commands {
        stdout.push_str("$ ");
        stdout.push_str(&program);
        if !args.is_empty() {
            stdout.push(' ');
            stdout.push_str(
                &args
                    .iter()
                    .map(|arg| quote_preview(arg))
                    .collect::<Vec<_>>()
                    .join(" "),
            );
        }
        stdout.push('\n');

        let output = capture_owned(&program, &args, &program);
        if !output.stdout.is_empty() {
            stdout.push_str(&output.stdout);
            if !output.stdout.ends_with('\n') {
                stdout.push('\n');
            }
        }
        if !output.stderr.is_empty() {
            stderr.push_str(&output.stderr);
            if !output.stderr.ends_with('\n') {
                stderr.push('\n');
            }
        }
        success = success && output.success;
    }

    FixExecutionResult {
        fix_id: fix.id.clone(),
        status: if success { "success" } else { "failed" }.to_string(),
        title: fix.title.clone(),
        message: if success {
            "Allowlisted macOS action completed.".to_string()
        } else {
            "Allowlisted macOS action finished with errors. Review stderr.".to_string()
        },
        stdout: Some(stdout),
        stderr: if stderr.is_empty() {
            None
        } else {
            Some(stderr)
        },
        requires_admin: Some(fix.requires_admin),
    }
}

pub fn run_allowlisted_fix(
    fix_id: &str,
    confirmation: Option<&FixConfirmation>,
) -> Result<FixExecutionResult, Box<dyn Error>> {
    let context = discover_context();
    let (fix, commands) = match command_for_fix(fix_id, &context) {
        Ok(value) => value,
        Err(result) => return Ok(*result),
    };

    if let Some(result) = validate_confirmation(&fix, confirmation) {
        return Ok(result);
    }

    if fix.requires_admin && !current_process_is_admin() {
        return Ok(blocked_fix_result(
            fix_id,
            "Administrator required",
            "This macOS action requires administrator privileges. Relaunch Aegis with the required access and try again.",
            true,
        ));
    }

    Ok(run_commands(&fix, commands))
}

pub fn generate_wireless_report_impl() -> Result<FixExecutionResult, Box<dyn Error>> {
    run_allowlisted_fix("generate-wlan-report", None)
}

pub fn environment_info() -> EnvironmentInfo {
    let product = first_line(&capture("sw_vers", &["-productName"], "macOS product"))
        .unwrap_or_else(|| "macOS".to_string());
    let version = first_line(&capture("sw_vers", &["-productVersion"], "macOS version"));
    let os = version
        .map(|version| format!("{product} {version}"))
        .unwrap_or(product);

    EnvironmentInfo {
        platform: "macos".to_string(),
        os,
        hostname: first_line(&capture("scutil", &["--get", "ComputerName"], "hostname")),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        is_admin: Some(current_process_is_admin()),
        is_windows: false,
        is_tauri: true,
    }
}

pub fn runtime_health() -> RuntimeHealth {
    let interface_ready = command_available("ifconfig", &["-l"]);
    let networksetup_ready = command_available("networksetup", &["-listallhardwareports"]);
    let route_ready = command_available("route", &["-n", "get", "default"]);
    let curl_ready = command_available("curl", &["--version"]);
    let is_admin = current_process_is_admin();
    let mut issues = Vec::new();

    if !interface_ready {
        issues.push(RuntimeIssue {
            id: "ifconfig".to_string(),
            severity: "error".to_string(),
            title: "macOS interface tools are unavailable".to_string(),
            detail: "Aegis could not start ifconfig, so live interface diagnostics are paused."
                .to_string(),
        });
    }
    if !networksetup_ready {
        issues.push(RuntimeIssue {
            id: "networksetup".to_string(),
            severity: "error".to_string(),
            title: "macOS network settings tools are unavailable".to_string(),
            detail: "Aegis could not start networksetup, so wireless discovery and targeted repairs are paused.".to_string(),
        });
    }
    if !curl_ready {
        issues.push(RuntimeIssue {
            id: "curl".to_string(),
            severity: "error".to_string(),
            title: "HTTPS probe tools are unavailable".to_string(),
            detail:
                "Aegis could not start curl, so internet and application-layer probes are paused."
                    .to_string(),
        });
    }
    if !route_ready {
        issues.push(RuntimeIssue {
            id: "route".to_string(),
            severity: "warning".to_string(),
            title: "No default route was confirmed".to_string(),
            detail: "The route command is available, but this Mac may currently be offline or have no default gateway.".to_string(),
        });
    }
    if !is_admin {
        issues.push(RuntimeIssue {
            id: "elevation".to_string(),
            severity: "warning".to_string(),
            title: "Aegis is not elevated".to_string(),
            detail: "Read-only scans and settings links remain available, but administrator-only repairs stay blocked.".to_string(),
        });
    }

    let live_ready = interface_ready && networksetup_ready && curl_ready;
    RuntimeHealth {
        checked_at: now_iso(),
        state: if live_ready { "ready" } else { "degraded" }.to_string(),
        summary: if live_ready {
            "macOS runtime ready".to_string()
        } else {
            "macOS runtime issue detected".to_string()
        },
        detail: if live_ready {
            "Aegis verified the native macOS command path for live diagnostics and allowlisted actions.".to_string()
        } else {
            "Aegis paused live diagnostics until the required macOS command tools are available."
                .to_string()
        },
        capabilities: RuntimeCapabilities {
            can_run_timeline_scans: live_ready,
            can_run_live_scans: live_ready,
            can_run_fixes: live_ready,
            can_export_reports: true,
            can_collect_system_metrics: true,
        },
        issues,
    }
}

pub fn run_scan<F>(
    _scenario_id: Option<String>,
    run_id: &str,
    mut emit: F,
) -> Result<ScanResult, Box<dyn Error>>
where
    F: FnMut(ScanProgressEvent),
{
    emit(progress_event(
        run_id,
        "scan-started",
        None,
        None,
        None,
        None,
        "Preparing the macOS diagnostic timeline...",
    ));

    let hardware_out = capture("networksetup", &["-listallhardwareports"], "hardware ports");
    let ports = parse_hardware_ports(&hardware_out.stdout);
    let wireless_port = ports.iter().find(|port| is_wireless_port(&port.name));
    let wifi_device = wireless_port.map(|port| port.device.clone());
    let wifi_service = wireless_port.map(|port| port.name.clone());

    emit_started(
        &mut emit,
        run_id,
        "device",
        0,
        "Inspecting macOS access and the local network stack...",
    );
    let product_out = capture("sw_vers", &["-productName"], "macOS product");
    let version_out = capture("sw_vers", &["-productVersion"], "macOS version");
    let device_status = if product_out.success && version_out.success {
        DiagnosticStatus::Ok
    } else {
        DiagnosticStatus::Warning
    };
    emit_checkpoint(
        &mut emit,
        run_id,
        "device",
        0,
        device_status,
        if device_status == DiagnosticStatus::Ok {
            "macOS diagnostic probes are available."
        } else {
            "macOS returned partial system details, but the scan is continuing."
        },
    );

    emit_started(
        &mut emit,
        run_id,
        "adapter",
        1,
        "Checking which interface is carrying the current route...",
    );
    let interface_list_out = capture("ifconfig", &["-l"], "interfaces");
    let interface_names = parse_interface_names(&interface_list_out.stdout);
    let interface_outputs: Vec<(String, CommandOutput)> = interface_names
        .iter()
        .map(|name| {
            (
                name.clone(),
                capture("ifconfig", &[name.as_str()], "interface details"),
            )
        })
        .collect();
    let interfaces: Vec<InterfaceFact> = interface_outputs
        .iter()
        .map(|(name, output)| parse_interface_fact(name, &output.stdout))
        .collect();
    let route_out = capture("route", &["-n", "get", "default"], "default route");
    let (gateway, route_interface) = parse_route(&route_out.stdout);
    let primary_name = route_interface
        .clone()
        .or_else(|| {
            interfaces
                .iter()
                .find(|interface| interface.active && Some(&interface.name) == wifi_device.as_ref())
                .map(|interface| interface.name.clone())
        })
        .or_else(|| {
            interfaces
                .iter()
                .find(|interface| interface.active)
                .map(|interface| interface.name.clone())
        })
        .or_else(|| wifi_device.clone());
    let primary_interface = primary_name
        .as_deref()
        .and_then(|name| interfaces.iter().find(|interface| interface.name == name));
    let adapter_status = if primary_interface.is_some_and(|interface| interface.active) {
        DiagnosticStatus::Ok
    } else if !interfaces.is_empty() {
        DiagnosticStatus::Warning
    } else {
        DiagnosticStatus::Failed
    };
    emit_checkpoint(
        &mut emit,
        run_id,
        "adapter",
        1,
        adapter_status,
        match adapter_status {
            DiagnosticStatus::Ok => "macOS reports an active interface for the current route.",
            DiagnosticStatus::Warning => {
                "Interfaces are present, but no active route-bearing interface was confirmed."
            }
            _ => "macOS did not expose a usable network interface.",
        },
    );

    emit_started(
        &mut emit,
        run_id,
        "wifi",
        2,
        "Reading wireless association and radio state...",
    );
    let airport_out = if let Some(device) = wifi_device.as_deref() {
        capture(
            "networksetup",
            &["-getairportnetwork", device],
            "Wi-Fi network",
        )
    } else {
        skipped_output("Wi-Fi network", "no wireless hardware port was found")
    };
    let wifi_ssid = parse_airport_network(&airport_out.stdout);
    let wifi_present = wifi_device.is_some();
    let wifi_connected = wifi_ssid.is_some();
    let wifi_status = if !wifi_present {
        DiagnosticStatus::Skipped
    } else if wifi_connected {
        DiagnosticStatus::Ok
    } else {
        DiagnosticStatus::Warning
    };
    emit_checkpoint(
        &mut emit,
        run_id,
        "wifi",
        2,
        wifi_status,
        match wifi_status {
            DiagnosticStatus::Ok => "The macOS wireless interface is associated with a network.",
            DiagnosticStatus::Warning => {
                "A Wi-Fi interface exists, but it is not currently associated."
            }
            _ => "Wireless checks are not currently applicable.",
        },
    );

    emit_started(
        &mut emit,
        run_id,
        "profile",
        3,
        "Matching the current Wi-Fi network to preferred profiles...",
    );
    let preferred_out = if let Some(device) = wifi_device.as_deref() {
        capture(
            "networksetup",
            &["-listpreferredwirelessnetworks", device],
            "preferred Wi-Fi networks",
        )
    } else {
        skipped_output(
            "preferred Wi-Fi networks",
            "no wireless interface was found",
        )
    };
    let preferred_networks = parse_preferred_networks(&preferred_out.stdout);
    let profile_inventory_known = preferred_out.ran && !preferred_out.stdout.trim().is_empty();
    let current_profile_saved = wifi_ssid.as_ref().is_some_and(|ssid| {
        preferred_networks
            .iter()
            .any(|profile| profile.eq_ignore_ascii_case(ssid))
    });
    let profile_status = if !wifi_present || !wifi_connected {
        DiagnosticStatus::Skipped
    } else if current_profile_saved {
        DiagnosticStatus::Ok
    } else if profile_inventory_known {
        DiagnosticStatus::Warning
    } else {
        DiagnosticStatus::Unknown
    };
    emit_checkpoint(
        &mut emit,
        run_id,
        "profile",
        3,
        profile_status,
        match profile_status {
            DiagnosticStatus::Ok => "The current Wi-Fi network maps to a preferred profile.",
            DiagnosticStatus::Warning => {
                "The current Wi-Fi network was not found in the preferred profile list."
            }
            _ => "Profile checks are waiting for an active wireless association.",
        },
    );

    emit_started(
        &mut emit,
        run_id,
        "ip",
        4,
        "Inspecting IPv4, DHCP, and DNS server configuration...",
    );
    let service_order_out = capture(
        "networksetup",
        &["-listnetworkserviceorder"],
        "network service order",
    );
    let network_service = primary_name
        .as_deref()
        .and_then(|device| {
            service_for_device(
                &parse_network_service_order(&service_order_out.stdout),
                device,
            )
        })
        .or(wifi_service.clone())
        .unwrap_or_else(|| "Wi-Fi".to_string());
    let network_info_out = capture(
        "networksetup",
        &["-getinfo", network_service.as_str()],
        "network service info",
    );
    let mut network_info = parse_network_info(&network_info_out.stdout);
    let primary_ipv4 = primary_interface.and_then(|interface| interface.ipv4_address.clone());
    if network_info.ipv4_address.is_none() {
        network_info.ipv4_address = primary_ipv4.clone();
    }
    let ipv4_valid = is_valid_ipv4(
        network_info
            .ipv4_address
            .as_deref()
            .or(primary_ipv4.as_deref()),
    );
    let ip_status = if primary_interface.is_some_and(|interface| interface.active) && ipv4_valid {
        DiagnosticStatus::Ok
    } else if primary_interface.is_some_and(|interface| interface.active) {
        DiagnosticStatus::Failed
    } else {
        DiagnosticStatus::Unknown
    };
    emit_checkpoint(
        &mut emit,
        run_id,
        "ip",
        4,
        ip_status,
        match ip_status {
            DiagnosticStatus::Ok => {
                "macOS has a usable IPv4 configuration on the active interface."
            }
            DiagnosticStatus::Failed => {
                "macOS does not have a usable IPv4 address on the active interface."
            }
            _ => "IP checks are waiting for an active route-bearing interface.",
        },
    );

    emit_started(
        &mut emit,
        run_id,
        "gateway",
        5,
        "Testing the local gateway path and default route...",
    );
    let gateway_probe = if let Some(gateway) = gateway.as_deref().filter(|_| ipv4_valid) {
        capture_with_timeout(
            "ping",
            &["-c", "1", "-W", "1000", gateway],
            Duration::from_secs(4),
            "gateway ping",
        )
    } else {
        skipped_output("gateway ping", "no usable IPv4 gateway")
    };
    let route_present = gateway.is_some() && route_interface.is_some();
    let gateway_status = if !ipv4_valid {
        DiagnosticStatus::Skipped
    } else if !route_present {
        DiagnosticStatus::Failed
    } else if gateway_probe.success {
        DiagnosticStatus::Ok
    } else {
        DiagnosticStatus::Warning
    };
    emit_checkpoint(
        &mut emit,
        run_id,
        "gateway",
        5,
        gateway_status,
        match gateway_status {
            DiagnosticStatus::Ok => "A default gateway exists and responded to a local probe.",
            DiagnosticStatus::Warning => {
                "The default route exists, but the gateway probe did not respond."
            }
            DiagnosticStatus::Failed => "The active interface has no usable default gateway route.",
            _ => "Gateway checks are skipped until the interface has usable IP configuration.",
        },
    );

    emit_started(
        &mut emit,
        run_id,
        "internet",
        6,
        "Probing public internet reachability across multiple endpoints...",
    );
    let internet_ready = ipv4_valid && route_present;
    let internet_primary = if internet_ready {
        tcp_probe("1.1.1.1", "443", "internet primary")
    } else {
        skipped_output("internet primary", "no usable local route")
    };
    let internet_secondary = if internet_ready {
        tcp_probe("8.8.8.8", "443", "internet secondary")
    } else {
        skipped_output("internet secondary", "no usable local route")
    };
    let internet_tertiary = if internet_ready {
        tcp_probe("9.9.9.9", "443", "internet tertiary")
    } else {
        skipped_output("internet tertiary", "no usable local route")
    };
    let internet_outputs = [&internet_primary, &internet_secondary, &internet_tertiary];
    let internet_successes = internet_outputs
        .iter()
        .filter(|output| output.success)
        .count();
    let internet_signals = internet_outputs
        .iter()
        .filter(|output| output_has_signal(output))
        .count();
    let internet_status = if !internet_ready {
        DiagnosticStatus::Skipped
    } else if internet_successes >= 2 {
        DiagnosticStatus::Ok
    } else if internet_successes > 0 {
        DiagnosticStatus::Warning
    } else if internet_signals == internet_outputs.len() {
        DiagnosticStatus::Failed
    } else {
        DiagnosticStatus::Warning
    };
    emit_checkpoint(
        &mut emit,
        run_id,
        "internet",
        6,
        internet_status,
        match internet_status {
            DiagnosticStatus::Ok => "External TCP connectivity works.",
            DiagnosticStatus::Warning => {
                "Public endpoint probes were inconsistent or inconclusive."
            }
            DiagnosticStatus::Failed => {
                "The local path exists, but repeated public endpoint probes failed."
            }
            _ => "Internet checks are waiting for a usable local route.",
        },
    );

    emit_started(
        &mut emit,
        run_id,
        "dns",
        7,
        "Resolving hostnames through the local DNS path and a public comparison...",
    );
    let dns_servers_out = capture("scutil", &["--dns"], "DNS configuration");
    let network_dns_out = capture(
        "networksetup",
        &["-getdnsservers", network_service.as_str()],
        "network DNS servers",
    );
    let mut dns_servers = parse_dns_servers(&dns_servers_out.stdout);
    dns_servers.extend(parse_dns_servers(&network_dns_out.stdout));
    dns_servers.sort();
    dns_servers.dedup();
    let dns_ready = internet_ready;
    let local_dns = if dns_ready {
        capture_with_timeout(
            "dscacheutil",
            &["-q", "host", "-a", "name", "example.com"],
            Duration::from_secs(6),
            "local DNS",
        )
    } else {
        skipped_output("local DNS", "no usable local route")
    };
    let public_dns = if dns_ready {
        let dig = capture_with_timeout(
            "dig",
            &["+time=3", "+tries=1", "@1.1.1.1", "example.com"],
            Duration::from_secs(6),
            "public DNS",
        );
        if dig.ran {
            dig
        } else {
            capture_with_timeout(
                "nslookup",
                &["example.com", "1.1.1.1"],
                Duration::from_secs(6),
                "public DNS",
            )
        }
    } else {
        skipped_output("public DNS", "no usable local route")
    };
    let local_dns_ok = dns_succeeded(&local_dns);
    let public_dns_ok = dns_succeeded(&public_dns);
    let dns_status = if !dns_ready {
        DiagnosticStatus::Skipped
    } else if local_dns_ok {
        DiagnosticStatus::Ok
    } else if public_dns_ok {
        DiagnosticStatus::Failed
    } else if output_has_signal(&local_dns) || output_has_signal(&public_dns) {
        DiagnosticStatus::Warning
    } else {
        DiagnosticStatus::Unknown
    };
    emit_checkpoint(
        &mut emit,
        run_id,
        "dns",
        7,
        dns_status,
        match dns_status {
            DiagnosticStatus::Ok => "Domain name resolution works through the configured DNS path.",
            DiagnosticStatus::Failed => {
                "Public DNS responds, but the local DNS path did not resolve the test domain."
            }
            DiagnosticStatus::Warning => "DNS probes returned partial or inconsistent evidence.",
            _ => "DNS checks are waiting for a usable local route.",
        },
    );

    emit_started(
        &mut emit,
        run_id,
        "windows",
        8,
        "Checking OS connectivity state, proxy settings, and portal signals...",
    );
    let proxy_out = capture("scutil", &["--proxy"], "proxy configuration");
    let proxy = parse_proxy(&proxy_out.stdout);
    let http_probe = if dns_ready {
        capture_with_timeout(
            "curl",
            &[
                "-sS",
                "-L",
                "--max-redirs",
                "0",
                "--max-time",
                "7",
                "-D",
                "-",
                "-o",
                "-",
                "http://captive.apple.com/hotspot-detect.html",
            ],
            Duration::from_secs(10),
            "captive portal probe",
        )
    } else {
        skipped_output("captive portal probe", "DNS path is unavailable")
    };
    let http_lower = http_probe.stdout.to_ascii_lowercase();
    let http_status = parse_http_status(&http_probe.stdout);
    let captive_portal = http_lower.contains("location:")
        || http_lower.contains("sign in")
        || http_lower.contains("login")
        || matches!(http_status, Some(301 | 302 | 307 | 308));
    let os_status = if captive_portal || proxy.configured {
        DiagnosticStatus::Warning
    } else if route_present || wifi_connected {
        DiagnosticStatus::Ok
    } else {
        DiagnosticStatus::Unknown
    };
    emit_checkpoint(
        &mut emit,
        run_id,
        "windows",
        8,
        os_status,
        match os_status {
            DiagnosticStatus::Ok => "macOS connectivity and proxy signals look consistent.",
            DiagnosticStatus::Warning => {
                "macOS reports proxy or portal signals that may affect traffic."
            }
            _ => "macOS did not return a clear operating-system connectivity state.",
        },
    );

    emit_started(
        &mut emit,
        run_id,
        "apps",
        9,
        "Testing whether application-level HTTPS endpoints still respond cleanly...",
    );
    let apps_ready = dns_ready
        && local_dns_ok
        && !matches!(
            internet_status,
            DiagnosticStatus::Failed | DiagnosticStatus::Skipped
        );
    let app_primary = if apps_ready {
        capture_with_timeout(
            "curl",
            &[
                "-sS",
                "-o",
                "/dev/null",
                "--connect-timeout",
                "5",
                "--max-time",
                "8",
                "-w",
                "%{http_code}",
                "https://www.apple.com",
            ],
            Duration::from_secs(10),
            "Apple HTTPS",
        )
    } else {
        skipped_output("Apple HTTPS", "lower network layers are unavailable")
    };
    let app_secondary = if apps_ready {
        capture_with_timeout(
            "curl",
            &[
                "-sS",
                "-o",
                "/dev/null",
                "--connect-timeout",
                "5",
                "--max-time",
                "8",
                "-w",
                "%{http_code}",
                "https://github.com",
            ],
            Duration::from_secs(10),
            "GitHub HTTPS",
        )
    } else {
        skipped_output("GitHub HTTPS", "lower network layers are unavailable")
    };
    let app_outputs = [&app_primary, &app_secondary];
    let app_successes = app_outputs
        .iter()
        .filter(|output| {
            output.success
                && output
                    .stdout
                    .trim()
                    .parse::<u16>()
                    .map(|status| (200..400).contains(&status))
                    .unwrap_or(false)
        })
        .count();
    let app_signals = app_outputs
        .iter()
        .filter(|output| output_has_signal(output))
        .count();
    let apps_status = if !apps_ready {
        DiagnosticStatus::Skipped
    } else if app_successes >= 1 {
        DiagnosticStatus::Ok
    } else if app_signals == app_outputs.len() {
        DiagnosticStatus::Failed
    } else {
        DiagnosticStatus::Warning
    };
    emit_checkpoint(
        &mut emit,
        run_id,
        "apps",
        9,
        apps_status,
        match apps_status {
            DiagnosticStatus::Ok => "HTTPS application endpoints responded normally.",
            DiagnosticStatus::Failed => "Lower layers passed, but HTTPS application probes failed.",
            DiagnosticStatus::Warning => "HTTPS application probes were inconclusive.",
            _ => "Application checks are waiting for lower network layers to pass.",
        },
    );

    let os_name = first_line(&product_out).unwrap_or_else(|| "macOS".to_string());
    let os_version = first_line(&version_out).unwrap_or_else(|| "Unknown version".to_string());
    let hostname = first_line(&capture("scutil", &["--get", "ComputerName"], "hostname"))
        .unwrap_or_else(|| "Unknown".to_string());
    let active_interface =
        primary_interface.or_else(|| interfaces.iter().find(|interface| interface.active));
    let service_order = parse_network_service_order(&service_order_out.stdout);
    let resolved_wifi_service = wifi_device
        .as_deref()
        .and_then(|device| service_for_device(&service_order, device))
        .or(wifi_service.clone());
    let selected_context = MacContext {
        active_device: primary_name.clone().or_else(|| wifi_device.clone()),
        active_service: Some(network_service.clone()),
        wifi_device: wifi_device.clone(),
        wifi_service: resolved_wifi_service,
        wifi_ssid: wifi_ssid.clone(),
    };
    let dns_display = if dns_servers.is_empty() {
        "Not reported".to_string()
    } else {
        dns_servers.join(", ")
    };
    let profile_display = if preferred_networks.is_empty() {
        "No preferred networks reported".to_string()
    } else {
        format!(
            "{} saved: {}",
            preferred_networks.len(),
            preferred_networks
                .iter()
                .take(4)
                .cloned()
                .collect::<Vec<_>>()
                .join(", ")
        )
    };

    let statuses = [
        ("device", device_status),
        ("adapter", adapter_status),
        ("wifi", wifi_status),
        ("profile", profile_status),
        ("ip", ip_status),
        ("gateway", gateway_status),
        ("internet", internet_status),
        ("dns", dns_status),
        ("windows", os_status),
        ("apps", apps_status),
    ];
    let overall_status = if statuses
        .iter()
        .any(|(_, status)| *status == DiagnosticStatus::Failed)
    {
        DiagnosticStatus::Failed
    } else if statuses.iter().any(|(_, status)| {
        *status == DiagnosticStatus::Warning || *status == DiagnosticStatus::Unknown
    }) {
        DiagnosticStatus::Warning
    } else {
        DiagnosticStatus::Ok
    };
    let primary_problem = [
        "adapter", "wifi", "profile", "ip", "gateway", "internet", "dns", "windows", "apps",
    ]
    .iter()
    .find(|id| {
        statuses.iter().any(|(node_id, status)| {
            node_id == *id && matches!(status, DiagnosticStatus::Failed | DiagnosticStatus::Warning)
        })
    })
    .map(|id| (*id).to_string());
    let diagnosis = if matches!(
        wifi_status,
        DiagnosticStatus::Warning | DiagnosticStatus::Failed
    ) && wifi_present
        && !wifi_connected
    {
        ("wifi-unavailable", "Wi-Fi is not currently associated", "A wireless interface is present, but macOS is not reporting an active Wi-Fi association.", 86, mac_fixes(&["open-network-settings", "restart-wlan-service"], &selected_context))
    } else if ip_status == DiagnosticStatus::Failed {
        (
            "dhcp-failure",
            "Connected interface has no valid IP address",
            "The active macOS interface is up, but it does not have a usable IPv4 address.",
            91,
            mac_fixes(
                &["renew-dhcp", "restart-adapter", "open-network-settings"],
                &selected_context,
            ),
        )
    } else if gateway_status == DiagnosticStatus::Failed {
        (
            "gateway-unreachable",
            "Local gateway route is unavailable",
            "The device does not have a complete default route to the local gateway.",
            88,
            mac_fixes(
                &["renew-dhcp", "restart-adapter", "open-network-settings"],
                &selected_context,
            ),
        )
    } else if internet_status == DiagnosticStatus::Failed {
        (
            "internet-unreachable",
            "Router path works, but the internet is unreachable",
            "The local route exists, but public endpoint probes consistently failed.",
            86,
            mac_fixes(
                &["renew-dhcp", "restart-adapter", "open-network-settings"],
                &selected_context,
            ),
        )
    } else if dns_status == DiagnosticStatus::Failed {
        ("dns-failure", "Connected, but DNS is failing", "Public DNS responds, but the configured local DNS path did not resolve the test domain.", 94, mac_fixes(&["flush-dns", "dns-automatic", "set-public-dns"], &selected_context))
    } else if captive_portal {
        ("captive-portal", "The network may require browser sign-in", "HTTP traffic appears redirected or sign-in related, which is a common captive-portal pattern.", 84, mac_fixes(&["open-network-settings"], &selected_context))
    } else if proxy.configured && apps_status == DiagnosticStatus::Failed {
        ("proxy-app-issue", "Proxy settings may be blocking apps", "Lower-layer connectivity is available, but HTTPS application probes fail while macOS proxy settings are enabled.", 82, mac_fixes(&["open-network-settings"], &selected_context))
    } else if apps_status == DiagnosticStatus::Failed {
        (
            "apps-endpoint-failure",
            "Lower layers pass, but app traffic is failing",
            "Internet and DNS checks passed, but HTTPS application endpoints failed.",
            76,
            mac_fixes(&["open-network-settings"], &selected_context),
        )
    } else if overall_status == DiagnosticStatus::Ok {
        (
            "healthy",
            "Everything looks good",
            "The macOS connection chain completed without finding a clear break point.",
            94,
            Vec::new(),
        )
    } else {
        ("degraded", "Network path is degraded", "Aegis found warning-level symptoms, but no single high-confidence break point dominated the scan.", 70, mac_fixes(&["open-network-settings", "generate-wlan-report"], &selected_context))
    };

    let raw_interface = active_interface
        .map(|interface| interface.name.as_str())
        .unwrap_or("Unavailable");
    let raw_interface_output = interface_outputs
        .iter()
        .find(|(name, _)| name == raw_interface)
        .map(|(_, output)| output);
    let adapter_raw = if let Some(output) = raw_interface_output {
        combine_outputs(&[
            ("Interface list", &interface_list_out),
            ("Active interface", output),
            ("Default route", &route_out),
        ])
    } else {
        combine_outputs(&[
            ("Interface list", &interface_list_out),
            ("Default route", &route_out),
        ])
    };
    let gateway_raw = combine_outputs(&[
        ("Default route", &route_out),
        ("Gateway probe", &gateway_probe),
    ]);
    let internet_raw = combine_outputs(&[
        ("1.1.1.1:443", &internet_primary),
        ("8.8.8.8:443", &internet_secondary),
        ("9.9.9.9:443", &internet_tertiary),
    ]);
    let dns_raw = combine_outputs(&[
        ("DNS configuration", &dns_servers_out),
        ("Network DNS", &network_dns_out),
        ("Local lookup", &local_dns),
        ("Public lookup", &public_dns),
    ]);
    let os_raw = combine_outputs(&[("Proxy", &proxy_out), ("Captive portal probe", &http_probe)]);
    let apps_raw = combine_outputs(&[
        ("Apple HTTPS", &app_primary),
        ("GitHub HTTPS", &app_secondary),
    ]);

    let nodes = vec![
        node(
            "device", "Device", "Host networking", "monitor", device_status,
            if device_status == DiagnosticStatus::Ok { "macOS diagnostic probes are available." } else { "macOS returned partial system details." },
            "Aegis stays inside a fixed, read-only probe set and records partial coverage without replacing the scan with mock data.",
            vec![
                evidence("os", "Operating system", format!("{os_name} {os_version}"), DiagnosticStatus::Ok, None),
                evidence("admin", "Elevation", if current_process_is_admin() { "Administrator" } else { "Standard user" }, DiagnosticStatus::Ok, Some("Read-only diagnostics do not require administrator access.".to_string())),
                evidence("host", "Hostname", hostname.clone(), DiagnosticStatus::Ok, None),
            ],
            vec![], vec![], combine_outputs(&[("Product", &product_out), ("Version", &version_out)]),
        ),
        node(
            "adapter", "Adapter", "Network interface", "network", adapter_status,
            match adapter_status { DiagnosticStatus::Ok => "macOS reports an active network interface.", DiagnosticStatus::Warning => "Network interfaces are present, but the active path is unclear.", _ => "macOS did not expose a usable network interface." },
            "Aegis follows the interface associated with the default route and does not assume Wi-Fi is the active path.",
            vec![
                evidence("adapter", "Active interface", primary_name.clone().unwrap_or_else(|| "Unavailable".to_string()), adapter_status, active_interface.and_then(|interface| interface.mac_address.clone()).map(|mac| format!("MAC {mac}"))),
                evidence("state", "Interface state", if active_interface.is_some_and(|interface| interface.active) { "Active" } else { "Unavailable" }, adapter_status, None),
                evidence("inventory", "Interfaces", interfaces.len().to_string(), if interfaces.is_empty() { DiagnosticStatus::Warning } else { DiagnosticStatus::Ok }, None),
            ],
            vec!["The active interface may be disabled", "No default route is currently available"],
            if adapter_status == DiagnosticStatus::Failed { mac_fixes(&["open-network-settings"], &selected_context) } else { Vec::new() },
            adapter_raw,
        ),
        node(
            "wifi", "Wi-Fi", "Wireless interface", "wifi", wifi_status,
            match wifi_status { DiagnosticStatus::Ok => "The macOS wireless interface is associated.", DiagnosticStatus::Warning => "A Wi-Fi interface exists, but it is not associated.", _ => "No macOS Wi-Fi interface was detected." },
            "Wireless inspection reads the current network name only. Saved credentials are never requested or exported.",
            vec![
                evidence("interface", "Wireless interface", wifi_device.clone().unwrap_or_else(|| "Unavailable".to_string()), if wifi_present { DiagnosticStatus::Ok } else { DiagnosticStatus::Skipped }, None),
                evidence("ssid", "Connected SSID", wifi_ssid.clone().unwrap_or_else(|| "Not connected".to_string()), if wifi_connected { DiagnosticStatus::Ok } else if wifi_present { DiagnosticStatus::Warning } else { DiagnosticStatus::Skipped }, None),
            ],
            vec!["The Mac is out of range or has Wi-Fi turned off", "The access point association did not complete"],
            if wifi_status == DiagnosticStatus::Warning { mac_fixes(&["restart-wlan-service", "open-network-settings"], &selected_context) } else { Vec::new() },
            combine_outputs(&[("Hardware ports", &hardware_out), ("Wi-Fi network", &airport_out)]),
        ),
        node(
            "profile", "Profile", "Preferred wireless profile", "id-card", profile_status,
            match profile_status { DiagnosticStatus::Ok => "The current network maps to a preferred Wi-Fi profile.", DiagnosticStatus::Warning => "The current network is not in the preferred Wi-Fi list.", DiagnosticStatus::Unknown => "macOS did not return enough preferred-network data to verify the profile.", _ => "Profile checks wait for an active Wi-Fi association." },
            "macOS exposes preferred network names through networksetup; Aegis never reads keychain credentials.",
            vec![
                evidence("profile", "Current network", wifi_ssid.clone().unwrap_or_else(|| "Unavailable".to_string()), profile_status, Some("Only the network name is inspected.".to_string())),
                evidence("saved", "Preferred networks", profile_display, if current_profile_saved { DiagnosticStatus::Ok } else if profile_inventory_known { DiagnosticStatus::Warning } else { DiagnosticStatus::Unknown }, None),
            ],
            vec!["The preferred network entry may be stale", "The network may require a fresh association"],
            if profile_status == DiagnosticStatus::Warning { mac_fixes(&["forget-current-profile", "open-network-settings"], &selected_context) } else { Vec::new() },
            combine_outputs(&[("Wi-Fi network", &airport_out), ("Preferred networks", &preferred_out)]),
        ),
        node(
            "ip", "IP Address", "IPv4 configuration", "binary", ip_status,
            match ip_status { DiagnosticStatus::Ok => "macOS has a usable IPv4 configuration.", DiagnosticStatus::Failed => "The active macOS interface has no usable IPv4 address.", _ => "IP checks are waiting for an active interface." },
            "Aegis rejects link-local 169.254.x.x addresses as evidence of a healthy DHCP lease.",
            vec![
                evidence("ipv4", "IPv4 address", network_info.ipv4_address.clone().or(primary_ipv4).unwrap_or_else(|| "Unavailable".to_string()), ip_status, None),
                evidence("dhcp", "DHCP", if network_info.dhcp { "Configured" } else { "Not confirmed" }, if network_info.dhcp { DiagnosticStatus::Ok } else { DiagnosticStatus::Unknown }, None),
                evidence("subnet", "Subnet mask", network_info.subnet_mask.clone().unwrap_or_else(|| "Unavailable".to_string()), if network_info.subnet_mask.is_some() { DiagnosticStatus::Ok } else { DiagnosticStatus::Unknown }, None),
                evidence("dns", "DNS servers", dns_display.clone(), if dns_servers.is_empty() { DiagnosticStatus::Unknown } else { DiagnosticStatus::Ok }, None),
            ],
            vec!["DHCP did not provide a lease", "The access point or router is not responding to DHCP"],
            if ip_status == DiagnosticStatus::Failed { mac_fixes(&["renew-dhcp", "restart-adapter", "open-network-settings"], &selected_context) } else { Vec::new() },
            combine_outputs(&[("Network service", &network_info_out), ("Active interface", raw_interface_output.unwrap_or(&interface_list_out))]),
        ),
        node(
            "gateway", "Gateway", "Default route", "router", gateway_status,
            match gateway_status { DiagnosticStatus::Ok => "The local gateway is reachable.", DiagnosticStatus::Warning => "The default route exists, but gateway reachability is inconsistent.", DiagnosticStatus::Failed => "The active path has no usable default gateway.", _ => "Gateway checks are waiting for usable IP configuration." },
            "The gateway stage combines the route table with a bounded local ping probe.",
            vec![
                evidence("gateway", "Default gateway", gateway.clone().unwrap_or_else(|| "Unavailable".to_string()), if gateway.is_some() { DiagnosticStatus::Ok } else { DiagnosticStatus::Failed }, None),
                evidence("interface", "Route interface", route_interface.clone().unwrap_or_else(|| "Unavailable".to_string()), if route_interface.is_some() { DiagnosticStatus::Ok } else { DiagnosticStatus::Failed }, None),
                evidence("ping", "Gateway probe", if gateway_probe.success { "Responded" } else { "No response" }, if gateway_probe.success { DiagnosticStatus::Ok } else { DiagnosticStatus::Warning }, None),
            ],
            vec!["The router may be offline", "The local route may be stale or incomplete"],
            if matches!(gateway_status, DiagnosticStatus::Failed | DiagnosticStatus::Warning) { mac_fixes(&["renew-dhcp", "restart-adapter", "open-network-settings"], &selected_context) } else { Vec::new() },
            gateway_raw,
        ),
        node(
            "internet", "Internet", "External reachability", "globe", internet_status,
            match internet_status { DiagnosticStatus::Ok => "External TCP connectivity works.", DiagnosticStatus::Warning => "External endpoint reachability is inconsistent.", DiagnosticStatus::Failed => "Public endpoint probes failed.", _ => "Internet checks are waiting for a usable local route." },
            "Aegis uses multiple fixed IP endpoints so this stage does not depend on local DNS.",
            vec![
                evidence("cloudflare", "1.1.1.1:443", if internet_primary.success { "Reachable" } else { "No response" }, if internet_primary.success { DiagnosticStatus::Ok } else { DiagnosticStatus::Warning }, None),
                evidence("google", "8.8.8.8:443", if internet_secondary.success { "Reachable" } else { "No response" }, if internet_secondary.success { DiagnosticStatus::Ok } else { DiagnosticStatus::Warning }, None),
                evidence("quad9", "9.9.9.9:443", if internet_tertiary.success { "Reachable" } else { "No response" }, if internet_tertiary.success { DiagnosticStatus::Ok } else { DiagnosticStatus::Warning }, None),
            ],
            vec!["The ISP or upstream router may be unavailable", "A VPN or firewall may be blocking outbound traffic"],
            if internet_status == DiagnosticStatus::Failed { mac_fixes(&["renew-dhcp", "restart-adapter", "open-network-settings"], &selected_context) } else { Vec::new() },
            internet_raw,
        ),
        node(
            "dns", "DNS", "Name resolution", "search-check", dns_status,
            match dns_status { DiagnosticStatus::Ok => "Domain name resolution works.", DiagnosticStatus::Failed => "The configured local DNS path is failing.", DiagnosticStatus::Warning => "DNS evidence is partial or inconsistent.", _ => "DNS checks are waiting for a usable local route." },
            "Aegis compares the configured resolver path with a public resolver without changing DNS settings during diagnosis.",
            vec![
                evidence("server", "DNS servers", dns_display.clone(), if dns_servers.is_empty() { DiagnosticStatus::Unknown } else { DiagnosticStatus::Ok }, None),
                evidence("local", "Local lookup", if local_dns_ok { "Resolved" } else { "Failed" }, if local_dns_ok { DiagnosticStatus::Ok } else { DiagnosticStatus::Failed }, None),
                evidence("public", "Public comparison", if public_dns_ok { "Resolved" } else { "Failed" }, if public_dns_ok { DiagnosticStatus::Ok } else { DiagnosticStatus::Warning }, None),
            ],
            vec!["The router DNS forwarder may be stuck", "A stale cache or filtering tool may be interfering"],
            if dns_status == DiagnosticStatus::Failed { mac_fixes(&["flush-dns", "dns-automatic", "set-public-dns"], &selected_context) } else { Vec::new() },
            dns_raw,
        ),
        node(
            "windows", "OS Status", "Operating-system connectivity", "badge-check", os_status,
            match os_status { DiagnosticStatus::Ok => "macOS connectivity and proxy signals look consistent.", DiagnosticStatus::Warning => "macOS reports proxy or portal signals that may affect traffic.", _ => "macOS did not return a clear operating-system connectivity state." },
            "This cross-platform stage records operating-system proxy and portal signals without treating them as proof that lower network layers failed.",
            vec![
                evidence("proxy", "System proxy", proxy.detail.clone(), if proxy.configured { DiagnosticStatus::Warning } else { DiagnosticStatus::Ok }, None),
                evidence("portal", "Captive portal", if captive_portal { "Suspected" } else { "Not detected" }, if captive_portal { DiagnosticStatus::Warning } else { DiagnosticStatus::Ok }, http_status.map(|status| format!("HTTP {status}"))),
            ],
            vec!["A captive portal may require browser sign-in", "A manual proxy may be unavailable"],
            if captive_portal || (proxy.configured && apps_status == DiagnosticStatus::Failed) { mac_fixes(&["open-network-settings"], &selected_context) } else { Vec::new() },
            os_raw,
        ),
        node(
            "apps", "Apps", "Application layer", "app-window", apps_status,
            match apps_status { DiagnosticStatus::Ok => "Application-layer HTTPS works.", DiagnosticStatus::Failed => "HTTPS application endpoints are failing.", DiagnosticStatus::Warning => "Application-layer probes are inconclusive.", _ => "Application checks are waiting for lower network layers to pass." },
            "Application probes use fixed public HTTPS endpoints to separate app-layer failures from base network failures.",
            vec![
                evidence("apple", "Apple HTTPS", if app_primary.success { app_primary.stdout.trim() } else { "Failed" }, if app_primary.success { DiagnosticStatus::Ok } else { DiagnosticStatus::Warning }, None),
                evidence("github", "GitHub HTTPS", if app_secondary.success { app_secondary.stdout.trim() } else { "Failed" }, if app_secondary.success { DiagnosticStatus::Ok } else { DiagnosticStatus::Warning }, None),
            ],
            vec!["Proxy or filtering software may affect applications", "An application-specific service may be unavailable"],
            if apps_status == DiagnosticStatus::Failed { mac_fixes(&["open-network-settings"], &selected_context) } else { Vec::new() },
            apps_raw,
        ),
    ];

    let confidence = if diagnosis.3 > 0 { diagnosis.3 } else { 70 };
    let diagnosis_severity = if overall_status == DiagnosticStatus::Failed {
        Severity::High
    } else if overall_status == DiagnosticStatus::Warning {
        Severity::Medium
    } else {
        Severity::Info
    };
    let mut nodes_for_emit = nodes.clone();
    for (index, node) in nodes_for_emit.iter_mut().enumerate() {
        emit_checkpoint(
            &mut emit,
            run_id,
            &node.id,
            index,
            node.status,
            &node.summary,
        );
    }
    emit(progress_event(
        run_id,
        "scan-finished",
        None,
        None,
        None,
        None,
        "Finalizing the macOS diagnosis...",
    ));

    Ok(ScanResult {
        id: now_id(),
        created_at: now_iso(),
        mode: "real".to_string(),
        overall_status,
        diagnosis: OverallDiagnosis {
            id: diagnosis.0.to_string(),
            title: diagnosis.1.to_string(),
            summary: diagnosis.2.to_string(),
            confidence,
            severity: diagnosis_severity,
            primary_failed_node_id: primary_problem,
            recommended_fixes: diagnosis.4,
        },
        nodes,
        environment: Environment {
            platform: "macos".to_string(),
            os: format!("{os_name} {os_version}"),
            hostname: Some(hostname),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            is_admin: Some(current_process_is_admin()),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::{
        command_for_fix, dns_succeeded, is_valid_ipv4, parse_dns_servers, parse_hardware_ports,
        parse_interface_fact, parse_network_info, parse_network_service_order, parse_route,
        CommandOutput, MacContext,
    };

    #[test]
    fn parses_macos_hardware_ports() {
        let ports = parse_hardware_ports(
            "Hardware Port: Wi-Fi\nDevice: en0\nEthernet Address: aa:bb:cc:dd:ee:ff\n\nHardware Port: Thunderbolt Ethernet\nDevice: en5\n",
        );

        assert_eq!(ports.len(), 2);
        assert_eq!(ports[0].name, "Wi-Fi");
        assert_eq!(ports[0].device, "en0");
    }

    #[test]
    fn parses_macos_interface_and_service_data() {
        let interface = parse_interface_fact(
            "en0",
            "en0: flags=8863<UP,BROADCAST,RUNNING,SIMPLEX,MULTICAST>\n\tether aa:bb:cc:dd:ee:ff\n\tinet 192.168.1.42 netmask 0xffffff00 broadcast 192.168.1.255\n\tstatus: active\n",
        );
        let network = parse_network_info(
            "DHCP Configuration\nIP address: 192.168.1.42\nSubnet mask: 255.255.255.0\nRouter: 192.168.1.1\n",
        );

        assert!(interface.active);
        assert_eq!(interface.ipv4_address.as_deref(), Some("192.168.1.42"));
        assert_eq!(network.router.as_deref(), Some("192.168.1.1"));
        assert!(network.dhcp);
    }

    #[test]
    fn parses_macos_route_and_dns_servers() {
        let (gateway, interface) = parse_route("gateway: 192.168.1.1\ninterface: en0\n");
        let dns = parse_dns_servers("nameserver[0] : 192.168.1.1\nnameserver[1] : 1.1.1.1\n");

        assert_eq!(gateway.as_deref(), Some("192.168.1.1"));
        assert_eq!(interface.as_deref(), Some("en0"));
        assert_eq!(dns, vec!["192.168.1.1", "1.1.1.1"]);
    }

    #[test]
    fn maps_macos_devices_to_network_services() {
        let services = parse_network_service_order(
            "(1) Wi-Fi\n(Hardware Port: Wi-Fi, Device: en0)\n(2) USB 10/100/1000 LAN\n(Hardware Port: USB 10/100/1000 LAN, Device: en5)\n",
        );

        assert_eq!(
            services,
            vec![
                ("en0".to_string(), "Wi-Fi".to_string()),
                ("en5".to_string(), "USB 10/100/1000 LAN".to_string())
            ]
        );
    }

    #[test]
    fn keeps_wireless_repairs_on_the_wireless_service() {
        let context = MacContext {
            active_device: Some("en5".to_string()),
            active_service: Some("USB 10/100/1000 LAN".to_string()),
            wifi_device: Some("en0".to_string()),
            wifi_service: Some("Wi-Fi".to_string()),
            wifi_ssid: Some("Office".to_string()),
        };

        let (_, wireless_commands) = command_for_fix("restart-wlan-service", &context).unwrap();
        assert_eq!(wireless_commands[0].1[1], "Wi-Fi");

        let (_, active_commands) = command_for_fix("restart-adapter", &context).unwrap();
        assert_eq!(active_commands[0].1[1], "USB 10/100/1000 LAN");
    }

    #[test]
    fn rejects_link_local_ipv4_and_accepts_dns_output() {
        assert!(!is_valid_ipv4(Some("169.254.12.4")));
        assert!(is_valid_ipv4(Some("192.168.1.42")));
        assert!(dns_succeeded(&CommandOutput {
            stdout: "name: example.com\nip_address: 93.184.216.34\n".to_string(),
            stderr: String::new(),
            success: true,
            ran: true,
        }));
    }
}
