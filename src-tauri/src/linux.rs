//! Linux-native diagnostics and repairs.
//!
//! The adapter intentionally uses a small, fixed command vocabulary. It supports Linux desktops
//! with or without NetworkManager: core route, address, DNS, gateway, and HTTPS checks use
//! common system tools, while Wi-Fi profile actions are offered only when NetworkManager can
//! identify a selected device. Values discovered from the system are passed as arguments, never
//! interpolated into a shell command.

use crate::diagnostics::{
    DiagnosticNode, DiagnosticStatus, Environment, EnvironmentInfo, EvidenceItem, FixAction,
    FixConfirmation, FixExecutionResult, FixSafety, OverallDiagnosis, RuntimeCapabilities,
    RuntimeHealth, RuntimeIssue, ScanProgressEvent, ScanResult, Severity,
};
use serde_json::Value;
use std::error::Error;
use std::fs;
use std::io::Read;
use std::net::Ipv4Addr;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const TOTAL_TIMELINE_NODES: usize = 10;
const AGGRESSIVE_CONFIRMATION_PHRASE: &str = "RESET";
const MAX_CAPTURE_BYTES: usize = 512 * 1024;

#[derive(Debug)]
struct CommandOutput {
    stdout: String,
    stderr: String,
    success: bool,
    ran: bool,
}

#[derive(Debug, Clone, Default)]
struct LinkFact {
    name: String,
    state: String,
    mac_address: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct NetworkManagerDevice {
    name: String,
    kind: String,
    state: String,
    connection: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct LinuxContext {
    interface: Option<String>,
    connection: Option<String>,
    gateway: Option<String>,
    is_wifi: bool,
    network_manager_available: bool,
    resolvectl_available: bool,
    network_settings_available: bool,
    browser_program: Option<String>,
}

fn now_iso() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
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
    let stdout_reader = child
        .stdout
        .take()
        .map(|mut stream| thread::spawn(move || read_process_output(&mut stream)));
    let stderr_reader = child
        .stderr
        .take()
        .map(|mut stream| thread::spawn(move || read_process_output(&mut stream)));
    let start = Instant::now();
    loop {
        if crate::diagnostics::scan_cancelled() {
            let _ = child.kill();
            let _ = child.wait();
            let process_stderr = join_process_output(stderr_reader);
            return Ok(CommandOutput {
                stdout: join_process_output(stdout_reader),
                stderr: if process_stderr.trim().is_empty() {
                    "Scan cancelled or exceeded its time budget".to_string()
                } else {
                    format!("{process_stderr}\nScan cancelled or exceeded its time budget")
                },
                success: false,
                ran: true,
            });
        }

        if child.try_wait()?.is_some() {
            let status = child.wait()?;
            return Ok(CommandOutput {
                stdout: join_process_output(stdout_reader),
                stderr: join_process_output(stderr_reader),
                success: status.success(),
                ran: true,
            });
        }

        if start.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            let process_stderr = join_process_output(stderr_reader);
            return Ok(CommandOutput {
                stdout: join_process_output(stdout_reader),
                stderr: if process_stderr.trim().is_empty() {
                    "Command timed out".to_string()
                } else {
                    format!("{process_stderr}\nCommand timed out")
                },
                success: false,
                ran: true,
            });
        }

        thread::sleep(Duration::from_millis(40));
    }
}

fn read_process_output<R: Read>(reader: &mut R) -> Vec<u8> {
    let mut captured = Vec::new();
    let mut buffer = [0_u8; 8 * 1024];

    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(bytes_read) => {
                if captured.len() < MAX_CAPTURE_BYTES {
                    let remaining = MAX_CAPTURE_BYTES - captured.len();
                    captured.extend_from_slice(&buffer[..bytes_read.min(remaining)]);
                }
            }
            Err(_) => break,
        }
    }

    captured
}

fn join_process_output(handle: Option<thread::JoinHandle<Vec<u8>>>) -> String {
    handle
        .and_then(|handle| handle.join().ok())
        .map(|bytes| String::from_utf8_lossy(&bytes).to_string())
        .unwrap_or_default()
}

fn capture(program: &str, args: &[&str], label: &str) -> CommandOutput {
    if crate::diagnostics::scan_cancelled() {
        return CommandOutput {
            stdout: String::new(),
            stderr: format!("{label}: scan cancelled or exceeded its time budget"),
            success: false,
            ran: false,
        };
    }

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
    if crate::diagnostics::scan_cancelled() {
        return CommandOutput {
            stdout: String::new(),
            stderr: format!("{label}: scan cancelled or exceeded its time budget"),
            success: false,
            ran: false,
        };
    }

    run_process(program, args, timeout).unwrap_or_else(|error| CommandOutput {
        stdout: String::new(),
        stderr: format!("{label}: {error}"),
        success: false,
        ran: false,
    })
}

fn capture_owned(program: &str, args: &[String], label: &str) -> CommandOutput {
    let values: Vec<&str> = args.iter().map(String::as_str).collect();
    capture(program, &values, label)
}

fn command_available(program: &str, args: &[&str]) -> bool {
    capture_with_timeout(program, args, Duration::from_secs(4), program).ran
}

fn browser_program() -> Option<String> {
    if command_available("xdg-open", &["--help"]) {
        Some("xdg-open".to_string())
    } else if command_available("gio", &["help", "open"]) {
        Some("gio".to_string())
    } else {
        None
    }
}

fn hostname() -> Option<String> {
    let output = capture("hostname", &[], "hostname");
    output
        .stdout
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

fn current_process_is_admin() -> bool {
    capture("id", &["-u"], "effective user ID")
        .stdout
        .trim()
        .parse::<u32>()
        .is_ok_and(|id| id == 0)
}

fn parse_json_list(stdout: &str) -> Vec<Value> {
    serde_json::from_str::<Value>(stdout)
        .ok()
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default()
}

fn parse_links(stdout: &str) -> Vec<LinkFact> {
    parse_json_list(stdout)
        .into_iter()
        .filter_map(|value| {
            let name = value.get("ifname")?.as_str()?.to_string();
            if name == "lo" {
                return None;
            }
            Some(LinkFact {
                name,
                state: value
                    .get("operstate")
                    .and_then(Value::as_str)
                    .unwrap_or("UNKNOWN")
                    .to_string(),
                mac_address: value
                    .get("address")
                    .and_then(Value::as_str)
                    .map(str::to_string),
            })
        })
        .collect()
}

fn parse_ipv4_by_interface(stdout: &str, interface: &str) -> Option<String> {
    parse_json_list(stdout)
        .into_iter()
        .find(|value| value.get("ifname").and_then(Value::as_str) == Some(interface))
        .and_then(|value| value.get("addr_info").and_then(Value::as_array).cloned())
        .and_then(|addresses| {
            addresses.into_iter().find_map(|address| {
                let is_global = address.get("scope").and_then(Value::as_str) == Some("global");
                let local = address.get("local").and_then(Value::as_str)?;
                (address.get("family").and_then(Value::as_str) == Some("inet") && is_global)
                    .then(|| local.to_string())
            })
        })
}

fn parse_default_route(stdout: &str) -> (Option<String>, Option<String>) {
    let route = parse_json_list(stdout).into_iter().next();
    let interface = route
        .as_ref()
        .and_then(|value| value.get("dev"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let gateway = route
        .as_ref()
        .and_then(|value| value.get("gateway"))
        .and_then(Value::as_str)
        .map(str::to_string);
    (interface, gateway)
}

fn parse_nmcli_devices(stdout: &str) -> Vec<NetworkManagerDevice> {
    stdout
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(4, ':');
            let name = parts.next()?.trim();
            let kind = parts.next()?.trim();
            let state = parts.next()?.trim();
            let connection = parts
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty() && *value != "--" && *value != "-");
            (!name.is_empty()).then(|| NetworkManagerDevice {
                name: name.to_string(),
                kind: kind.to_string(),
                state: state.to_string(),
                connection: connection.map(str::to_string),
            })
        })
        .collect()
}

fn parse_nameservers(contents: &str) -> Vec<String> {
    contents
        .lines()
        .filter_map(|line| line.trim().strip_prefix("nameserver"))
        .filter_map(|value| value.split_whitespace().next())
        .filter(|value| value.parse::<std::net::IpAddr>().is_ok())
        .map(str::to_string)
        .collect()
}

fn is_valid_ipv4(value: Option<&str>) -> bool {
    value
        .and_then(|value| value.parse::<Ipv4Addr>().ok())
        .is_some_and(|address| {
            !address.is_unspecified() && !address.is_loopback() && !address.is_link_local()
        })
}

fn command_has_signal(output: &CommandOutput) -> bool {
    output.ran && (!output.stdout.trim().is_empty() || !output.stderr.trim().is_empty())
}

fn first_line(output: &CommandOutput) -> Option<String> {
    output
        .stdout
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

fn evidence(
    id: &str,
    label: &str,
    value: impl Into<String>,
    status: DiagnosticStatus,
    detail: Option<&str>,
) -> EvidenceItem {
    EvidenceItem {
        id: id.to_string(),
        label: label.to_string(),
        value: value.into(),
        status,
        detail: detail.map(str::to_string),
    }
}

fn node(
    id: &str,
    label: &str,
    icon: &str,
    status: DiagnosticStatus,
    summary: &str,
    explanation: &str,
    checks: &[&str],
    evidence: Vec<EvidenceItem>,
    causes: Vec<String>,
    fixes: Vec<FixAction>,
    raw_output: Option<String>,
) -> DiagnosticNode {
    let severity = match status {
        DiagnosticStatus::Failed => Severity::High,
        DiagnosticStatus::Warning => Severity::Medium,
        DiagnosticStatus::Unknown => Severity::Low,
        _ => Severity::Info,
    };
    DiagnosticNode {
        id: id.to_string(),
        label: label.to_string(),
        technical_label: Some(label.to_string()),
        icon: icon.to_string(),
        status,
        severity,
        summary: summary.to_string(),
        explanation: explanation.to_string(),
        checks: checks.iter().map(|check| (*check).to_string()).collect(),
        evidence,
        likely_causes: causes,
        recommended_fixes: fixes,
        raw_output,
    }
}

fn progress_event(
    run_id: &str,
    kind: &str,
    node_id: Option<&str>,
    node_label: Option<&str>,
    node_index: Option<usize>,
    node_status: Option<DiagnosticStatus>,
    message: &str,
) -> ScanProgressEvent {
    ScanProgressEvent {
        run_id: run_id.to_string(),
        kind: kind.to_string(),
        node_id: node_id.map(str::to_string),
        node_label: node_label.map(str::to_string),
        node_index,
        node_status,
        node_summary: None,
        total_nodes: TOTAL_TIMELINE_NODES,
        message: message.to_string(),
    }
}

fn emit_node<F>(
    emit: &mut F,
    run_id: &str,
    id: &str,
    label: &str,
    index: usize,
    status: DiagnosticStatus,
    message: &str,
) where
    F: FnMut(ScanProgressEvent),
{
    emit(progress_event(
        run_id,
        "node-started",
        Some(id),
        Some(label),
        Some(index),
        Some(DiagnosticStatus::Running),
        message,
    ));
    emit(progress_event(
        run_id,
        "node-completed",
        Some(id),
        Some(label),
        Some(index),
        Some(status),
        message,
    ));
}

fn quote_preview(value: &str) -> String {
    if value.contains(char::is_whitespace) {
        format!("\"{}\"", value.replace('"', "\\\""))
    } else {
        value.to_string()
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

fn validate_confirmation(
    fix: &FixAction,
    confirmation: Option<&FixConfirmation>,
) -> Option<FixExecutionResult> {
    match fix.safety {
        FixSafety::Safe => None,
        FixSafety::Moderate if !confirmation.is_some_and(|value| value.acknowledged) => Some(blocked_fix_result(
            &fix.id,
            "Confirmation required",
            "This moderate Linux action requires an explicit confirmation step before Aegis will run it.",
            fix.requires_admin,
        )),
        FixSafety::Aggressive if !confirmation.is_some_and(|value| value.acknowledged) => Some(blocked_fix_result(
            &fix.id,
            "Confirmation required",
            "This aggressive Linux action requires an explicit confirmation step before Aegis will run it.",
            fix.requires_admin,
        )),
        FixSafety::Aggressive if confirmation.and_then(|value| value.typed_phrase.as_deref()) != Some(AGGRESSIVE_CONFIRMATION_PHRASE) => Some(blocked_fix_result(
            &fix.id,
            "Exact confirmation required",
            "This aggressive Linux action is locked until the exact confirmation phrase is provided.",
            fix.requires_admin,
        )),
        _ => None,
    }
}

fn linux_fix(id: &str, context: &LinuxContext) -> Option<FixAction> {
    let interface = context.interface.as_deref().unwrap_or("<active device>");
    let connection = context
        .connection
        .as_deref()
        .unwrap_or("<active connection>");
    let action = match id {
        "flush-dns" if context.resolvectl_available => FixAction {
            id: id.to_string(), title: "Flush DNS cache".to_string(),
            description: "Clears the local systemd-resolved DNS cache so names are looked up again.".to_string(),
            safety: FixSafety::Safe, requires_admin: false,
            commands_preview: Some(vec!["resolvectl flush-caches".to_string()]),
            estimated_impact: "Existing apps may retry name lookups; network connections stay up.".to_string(), warning: None,
        },
        "renew-dhcp" if context.network_manager_available => FixAction {
            id: id.to_string(), title: "Reconnect active device".to_string(),
            description: "Asks NetworkManager to disconnect and reconnect the active device, requesting fresh network configuration.".to_string(),
            safety: FixSafety::Moderate, requires_admin: false,
            commands_preview: Some(vec![format!("nmcli device disconnect {}", quote_preview(interface)), format!("nmcli device connect {}", quote_preview(interface))]),
            estimated_impact: "The selected network connection will drop briefly.".to_string(),
            warning: Some("This interrupts active downloads, calls, and remote sessions on the selected device.".to_string()),
        },
        "reconnect-wifi" if context.network_manager_available && context.is_wifi => FixAction {
            id: id.to_string(), title: "Reconnect to current Wi-Fi".to_string(),
            description: "Asks NetworkManager to rebuild the active Wi-Fi connection while keeping its saved profile.".to_string(),
            safety: FixSafety::Moderate, requires_admin: false,
            commands_preview: Some(vec![format!("nmcli device disconnect {}", quote_preview(interface)), format!("nmcli device connect {}", quote_preview(interface))]),
            estimated_impact: "Wi-Fi will be unavailable briefly while it reconnects.".to_string(),
            warning: Some("This interrupts active downloads, calls, and remote sessions, but does not delete the saved profile.".to_string()),
        },
        "restart-wlan-service" if context.network_manager_available => FixAction {
            id: id.to_string(), title: "Restart NetworkManager".to_string(),
            description: "Restarts the Linux network service that manages wireless discovery and connection.".to_string(),
            safety: FixSafety::Moderate, requires_admin: true,
            commands_preview: Some(vec!["systemctl restart NetworkManager".to_string()]),
            estimated_impact: "Network connections may disconnect briefly and reconnect automatically.".to_string(),
            warning: Some("This affects NetworkManager-managed connections on this device.".to_string()),
        },
        "generate-wlan-report" if context.network_manager_available => FixAction {
            id: id.to_string(), title: "Collect NetworkManager diagnostics".to_string(),
            description: "Collects a local, read-only NetworkManager status snapshot for review.".to_string(),
            safety: FixSafety::Safe, requires_admin: false,
            commands_preview: Some(vec!["nmcli device show".to_string()]),
            estimated_impact: "Read-only diagnostic collection; no settings are changed.".to_string(), warning: None,
        },
        "open-network-settings" if context.network_settings_available => FixAction {
            id: id.to_string(), title: "Open Network Settings".to_string(),
            description: "Opens the installed Linux network settings application for manual review.".to_string(),
            safety: FixSafety::Safe, requires_admin: false,
            commands_preview: Some(vec!["gnome-control-center network (or nm-connection-editor)".to_string()]),
            estimated_impact: "No settings are changed automatically.".to_string(), warning: None,
        },
        "open-router-settings" if context.gateway.is_some() && context.browser_program.is_some() => FixAction {
            id: id.to_string(), title: "Open router settings".to_string(),
            description: "Opens the detected default gateway in your browser so you can check router status or WAN settings.".to_string(),
            safety: FixSafety::Safe, requires_admin: false,
            commands_preview: Some(vec![format!("Open http://{} in your browser", quote_preview(context.gateway.as_deref().unwrap_or("<gateway>")))]),
            estimated_impact: "Opens your browser. Aegis does not change router settings automatically.".to_string(), warning: None,
        },
        "open-captive-portal" if context.browser_program.is_some() => FixAction {
            id: id.to_string(), title: "Open Wi-Fi sign-in page".to_string(),
            description: "Opens a connectivity page that can trigger the hotel, office, or public Wi-Fi sign-in screen.".to_string(),
            safety: FixSafety::Safe, requires_admin: false,
            commands_preview: Some(vec!["Open the network sign-in page in your browser".to_string()]),
            estimated_impact: "Opens a browser. Aegis never captures or submits your sign-in details.".to_string(),
            warning: Some("Complete any sign-in or terms step in the browser before returning to Aegis and re-running the scan.".to_string()),
        },
        "restart-adapter" if context.network_manager_available => FixAction {
            id: id.to_string(), title: "Reconnect selected device".to_string(),
            description: "Disconnects and reconnects the active NetworkManager device to recover a stuck interface.".to_string(),
            safety: FixSafety::Moderate, requires_admin: false,
            commands_preview: Some(vec![format!("nmcli device disconnect {}", quote_preview(interface)), format!("nmcli device connect {}", quote_preview(interface))]),
            estimated_impact: "The network connection will drop briefly.".to_string(),
            warning: Some("Use only after safer fixes fail. This interrupts active downloads, calls, and remote sessions.".to_string()),
        },
        "forget-current-profile"
            if context.network_manager_available && context.is_wifi && context.connection.is_some() => FixAction {
            id: id.to_string(), title: "Forget current Wi-Fi profile".to_string(),
            description: "Deletes the active NetworkManager connection profile without reading or exporting its secret.".to_string(),
            safety: FixSafety::Moderate, requires_admin: false,
            commands_preview: Some(vec![format!("nmcli connection delete id {}", quote_preview(connection))]),
            estimated_impact: "You will need the Wi-Fi password to reconnect.".to_string(),
            warning: Some("Make sure you know the Wi-Fi password before continuing.".to_string()),
        },
        "dns-automatic" if context.network_manager_available && context.connection.is_some() => FixAction {
            id: id.to_string(), title: "Reset DNS to automatic".to_string(),
            description: "Returns the selected NetworkManager connection to DNS servers supplied automatically.".to_string(),
            safety: FixSafety::Moderate, requires_admin: true,
            commands_preview: Some(vec![format!("nmcli connection modify {} ipv4.ignore-auto-dns no ipv4.dns \"\"", quote_preview(connection)), format!("nmcli connection up {}", quote_preview(connection))]),
            estimated_impact: "Name resolution may change immediately.".to_string(),
            warning: Some("This changes DNS settings on the selected connection.".to_string()),
        },
        "set-public-dns" if context.network_manager_available && context.connection.is_some() => FixAction {
            id: id.to_string(), title: "Temporarily set public DNS".to_string(),
            description: "Sets the selected NetworkManager connection to Cloudflare and Google public resolvers.".to_string(),
            safety: FixSafety::Moderate, requires_admin: true,
            commands_preview: Some(vec![format!("nmcli connection modify {} ipv4.ignore-auto-dns yes ipv4.dns \"1.1.1.1,8.8.8.8\"", quote_preview(connection)), format!("nmcli connection up {}", quote_preview(connection))]),
            estimated_impact: "Changes DNS behavior until it is reverted.".to_string(),
            warning: Some("Only use this when the current DNS server is confirmed broken or unreachable.".to_string()),
        },
        _ => return None,
    };
    Some(action)
}

fn available_fixes(ids: &[&str], context: &LinuxContext) -> Vec<FixAction> {
    ids.iter().filter_map(|id| linux_fix(id, context)).collect()
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
        stdout.push_str(&output.stdout);
        stderr.push_str(&output.stderr);
        success = success && output.success;
    }
    FixExecutionResult {
        fix_id: fix.id.clone(),
        status: if success { "success" } else { "failed" }.to_string(),
        title: fix.title.clone(),
        message: if success {
            "Allowlisted Linux action completed."
        } else {
            "Allowlisted Linux action finished with errors. Review stderr."
        }
        .to_string(),
        stdout: Some(stdout),
        stderr: (!stderr.is_empty()).then_some(stderr),
        requires_admin: Some(fix.requires_admin),
    }
}

fn context_from_system() -> LinuxContext {
    let route = capture("ip", &["-j", "route", "show", "default"], "default route");
    let (interface, gateway) = parse_default_route(&route.stdout);
    let nmcli = capture(
        "nmcli",
        &[
            "-t",
            "-f",
            "DEVICE,TYPE,STATE,CONNECTION",
            "device",
            "status",
        ],
        "NetworkManager devices",
    );
    let device = interface.as_deref().and_then(|name| {
        parse_nmcli_devices(&nmcli.stdout)
            .into_iter()
            .find(|device| device.name == name)
    });
    LinuxContext {
        interface,
        connection: device.as_ref().and_then(|device| device.connection.clone()),
        gateway: gateway.filter(|value| value.parse::<Ipv4Addr>().is_ok()),
        is_wifi: device.is_some_and(|device| device.kind.eq_ignore_ascii_case("wifi")),
        network_manager_available: nmcli.ran,
        resolvectl_available: command_available("resolvectl", &["--version"]),
        network_settings_available: command_available("gnome-control-center", &["--version"])
            || command_available("nm-connection-editor", &["--version"]),
        browser_program: browser_program(),
    }
}

fn command_for_fix(
    fix_id: &str,
    context: &LinuxContext,
) -> Result<(FixAction, Vec<(String, Vec<String>)>), FixExecutionResult> {
    let fix = linux_fix(fix_id, context).ok_or_else(|| blocked_fix_result(fix_id, "Fix unavailable on Linux", "This action is Windows-specific, unavailable for the selected Linux connection, or not in the backend allowlist. No command was executed.", false))?;
    let commands = match fix_id {
        "flush-dns" => {
            if !command_available("resolvectl", &["--version"]) {
                return Err(blocked_fix_result(fix_id, "DNS cache action unavailable", "This Linux desktop does not expose systemd-resolved through resolvectl. No command was executed.", false));
            }
            vec![("resolvectl".to_string(), vec!["flush-caches".to_string()])]
        }
        "renew-dhcp" | "restart-adapter" | "reconnect-wifi" => {
            let interface = context.interface.clone().ok_or_else(|| blocked_fix_result(fix_id, "No active device", "Aegis could not determine an active route-bearing device. Re-run diagnostics before applying a device-specific fix.", fix.requires_admin))?;
            vec![
                ("nmcli".to_string(), vec!["device".to_string(), "disconnect".to_string(), interface.clone()]),
                ("nmcli".to_string(), vec!["device".to_string(), "connect".to_string(), interface]),
            ]
        }
        "restart-wlan-service" => vec![("systemctl".to_string(), vec!["restart".to_string(), "NetworkManager".to_string()])],
        "generate-wlan-report" => vec![("nmcli".to_string(), vec!["device".to_string(), "show".to_string()])],
        "open-network-settings" if command_available("gnome-control-center", &["--version"]) => vec![("gnome-control-center".to_string(), vec!["network".to_string()])],
        "open-network-settings" if command_available("nm-connection-editor", &["--version"]) => vec![("nm-connection-editor".to_string(), Vec::new())],
        "open-network-settings" => return Err(blocked_fix_result(fix_id, "Network settings app unavailable", "Aegis could not find gnome-control-center or nm-connection-editor. No command was executed.", false)),
        "open-router-settings" | "open-captive-portal" => {
            let program = context.browser_program.clone().ok_or_else(|| blocked_fix_result(fix_id, "Browser opener unavailable", "Aegis could not find a supported desktop browser opener. No command was executed.", false))?;
            let url = if fix_id == "open-router-settings" {
                let gateway = context.gateway.clone().ok_or_else(|| blocked_fix_result(fix_id, "Router address unavailable", "Aegis could not determine a valid default gateway to open safely. Re-run diagnostics and try again.", false))?;
                format!("http://{gateway}")
            } else {
                "http://neverssl.com/".to_string()
            };
            let args = if program == "gio" {
                vec!["open".to_string(), url]
            } else {
                vec![url]
            };
            vec![(program, args)]
        }
        "forget-current-profile" | "dns-automatic" | "set-public-dns" => {
            let connection = context.connection.clone().ok_or_else(|| blocked_fix_result(fix_id, "No active connection profile", "Aegis could not determine a NetworkManager connection profile for this action. No command was executed.", fix.requires_admin))?;
            match fix_id {
                "forget-current-profile" => vec![("nmcli".to_string(), vec!["connection".to_string(), "delete".to_string(), "id".to_string(), connection])],
                "dns-automatic" => vec![
                    ("nmcli".to_string(), vec!["connection".to_string(), "modify".to_string(), connection.clone(), "ipv4.ignore-auto-dns".to_string(), "no".to_string(), "ipv4.dns".to_string(), "".to_string()]),
                    ("nmcli".to_string(), vec!["connection".to_string(), "up".to_string(), connection]),
                ],
                "set-public-dns" => vec![
                    ("nmcli".to_string(), vec!["connection".to_string(), "modify".to_string(), connection.clone(), "ipv4.ignore-auto-dns".to_string(), "yes".to_string(), "ipv4.dns".to_string(), "1.1.1.1,8.8.8.8".to_string()]),
                    ("nmcli".to_string(), vec!["connection".to_string(), "up".to_string(), connection]),
                ],
                _ => unreachable!("matched above"),
            }
        }
        _ => return Err(blocked_fix_result(fix_id, "Fix unavailable on Linux", "No Linux command mapping is registered for this action. No command was executed.", fix.requires_admin)),
    };
    Ok((fix, commands))
}

pub fn run_allowlisted_fix(
    fix_id: &str,
    confirmation: Option<&FixConfirmation>,
) -> Result<FixExecutionResult, Box<dyn Error>> {
    let context = context_from_system();
    let (fix, commands) = match command_for_fix(fix_id, &context) {
        Ok(value) => value,
        Err(result) => return Ok(result),
    };
    if let Some(result) = validate_confirmation(&fix, confirmation) {
        return Ok(result);
    }
    if fix.requires_admin && !current_process_is_admin() {
        return Ok(blocked_fix_result(fix_id, "Administrator required", "This Linux action requires elevated access. Relaunch Aegis with the required access and try again.", true));
    }
    Ok(run_commands(&fix, commands))
}

pub fn generate_wireless_report_impl() -> Result<FixExecutionResult, Box<dyn Error>> {
    run_allowlisted_fix("generate-wlan-report", None)
}

pub fn environment_info() -> EnvironmentInfo {
    let release = fs::read_to_string("/etc/os-release").ok();
    let os = release
        .as_deref()
        .and_then(|value| {
            value
                .lines()
                .find_map(|line| line.strip_prefix("PRETTY_NAME="))
                .map(|value| value.trim_matches('"').to_string())
        })
        .unwrap_or_else(|| "Linux".to_string());
    EnvironmentInfo {
        platform: "linux".to_string(),
        os,
        hostname: hostname(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        is_admin: Some(current_process_is_admin()),
        is_windows: false,
        is_tauri: true,
    }
}

pub fn runtime_health() -> RuntimeHealth {
    let ip_ready = command_available("ip", &["-j", "link", "show"]);
    let getent_ready = command_available("getent", &["ahostsv4", "localhost"]);
    let curl_ready = command_available("curl", &["--version"]);
    let nmcli_ready = command_available("nmcli", &["--version"]);
    let resolvectl_ready = command_available("resolvectl", &["--version"]);
    let network_settings_ready = command_available("gnome-control-center", &["--version"])
        || command_available("nm-connection-editor", &["--version"]);
    let is_admin = current_process_is_admin();
    let mut issues = Vec::new();
    if !ip_ready {
        issues.push(RuntimeIssue { id: "ip".to_string(), severity: "error".to_string(), title: "Linux IP tools are unavailable".to_string(), detail: "Aegis could not start `ip`, so live interface, address, and route diagnostics are paused.".to_string() });
    }
    if !getent_ready {
        issues.push(RuntimeIssue {
            id: "getent".to_string(),
            severity: "error".to_string(),
            title: "Linux DNS query tools are unavailable".to_string(),
            detail: "Aegis could not start `getent`, so live DNS diagnostics are paused."
                .to_string(),
        });
    }
    if !curl_ready {
        issues.push(RuntimeIssue {
            id: "curl".to_string(),
            severity: "error".to_string(),
            title: "HTTPS probe tools are unavailable".to_string(),
            detail:
                "Aegis could not start `curl`, so internet and application-layer probes are paused."
                    .to_string(),
        });
    }
    if !nmcli_ready {
        issues.push(RuntimeIssue { id: "networkmanager".to_string(), severity: "warning".to_string(), title: "NetworkManager is unavailable".to_string(), detail: "Core Linux diagnostics remain available, but Wi-Fi profile details and NetworkManager-specific repairs stay unavailable.".to_string() });
    }
    if !resolvectl_ready {
        issues.push(RuntimeIssue { id: "resolvectl".to_string(), severity: "info".to_string(), title: "System DNS cache controls are unavailable".to_string(), detail: "Core DNS diagnostics remain available, but the DNS cache action is hidden because this desktop does not expose resolvectl.".to_string() });
    }
    if !network_settings_ready {
        issues.push(RuntimeIssue { id: "network-settings".to_string(), severity: "info".to_string(), title: "No supported network settings app was found".to_string(), detail: "Aegis keeps core diagnostics available, but does not offer a settings shortcut without GNOME Control Center or NetworkManager Connection Editor.".to_string() });
    }
    if !is_admin {
        issues.push(RuntimeIssue {
            id: "elevation".to_string(),
            severity: "warning".to_string(),
            title: "Aegis is not elevated".to_string(),
            detail:
                "Read-only scans remain available, but administrator-only repairs stay blocked."
                    .to_string(),
        });
    }
    let live_ready = ip_ready && getent_ready && curl_ready;
    RuntimeHealth {
        checked_at: now_iso(), state: if live_ready { "ready" } else { "degraded" }.to_string(),
        summary: if live_ready { "Linux runtime ready" } else { "Linux runtime issue detected" }.to_string(),
        detail: if live_ready { "Aegis verified the Linux command path for live diagnostics and available allowlisted actions." } else { "Aegis paused live diagnostics until the required Linux command tools are available." }.to_string(),
        capabilities: RuntimeCapabilities { can_run_timeline_scans: live_ready, can_run_live_scans: live_ready, can_run_fixes: live_ready && (nmcli_ready || resolvectl_ready || network_settings_ready), can_export_reports: true, can_collect_system_metrics: true }, issues,
    }
}

pub fn run_scan<F>(run_id: &str, mut emit: F) -> Result<ScanResult, Box<dyn Error>>
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
        "Preparing the Linux diagnostic timeline...",
    ));
    let environment = Environment {
        platform: "linux".to_string(),
        os: environment_info().os,
        hostname: hostname(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        is_admin: Some(current_process_is_admin()),
    };
    let links_out = capture("ip", &["-j", "link", "show"], "network links");
    let addresses_out = capture("ip", &["-j", "addr", "show"], "network addresses");
    let routes_out = capture("ip", &["-j", "route", "show", "default"], "default route");
    let nmcli_out = capture(
        "nmcli",
        &[
            "-t",
            "-f",
            "DEVICE,TYPE,STATE,CONNECTION",
            "device",
            "status",
        ],
        "NetworkManager devices",
    );
    let dns_servers = fs::read_to_string("/etc/resolv.conf")
        .map(|value| parse_nameservers(&value))
        .unwrap_or_default();
    let links = parse_links(&links_out.stdout);
    let (route_interface, gateway) = parse_default_route(&routes_out.stdout);
    let primary_interface = route_interface.or_else(|| {
        links
            .iter()
            .find(|link| link.state.eq_ignore_ascii_case("UP"))
            .map(|link| link.name.clone())
    });
    let primary_link = primary_interface
        .as_deref()
        .and_then(|name| links.iter().find(|link| link.name == name));
    let nm_devices = parse_nmcli_devices(&nmcli_out.stdout);
    let nm_device = primary_interface
        .as_deref()
        .and_then(|name| nm_devices.iter().find(|device| device.name == name));
    let is_wifi = nm_device.is_some_and(|device| device.kind.eq_ignore_ascii_case("wifi"));
    let connection = nm_device.and_then(|device| device.connection.clone());
    let context = LinuxContext {
        interface: primary_interface.clone(),
        connection: connection.clone(),
        gateway: gateway
            .clone()
            .filter(|value| value.parse::<Ipv4Addr>().is_ok()),
        is_wifi,
        network_manager_available: nmcli_out.ran,
        resolvectl_available: command_available("resolvectl", &["--version"]),
        network_settings_available: command_available("gnome-control-center", &["--version"])
            || command_available("nm-connection-editor", &["--version"]),
        browser_program: browser_program(),
    };
    let ipv4 = primary_interface
        .as_deref()
        .and_then(|name| parse_ipv4_by_interface(&addresses_out.stdout, name));
    let has_valid_ip = is_valid_ipv4(ipv4.as_deref());
    let gateway_probe = gateway.as_deref().filter(|_| has_valid_ip).map(|value| {
        capture_with_timeout(
            "ping",
            &["-c", "1", "-W", "2", value],
            Duration::from_secs(5),
            "gateway ping",
        )
    });
    let dns_probe = if has_valid_ip {
        capture_with_timeout(
            "getent",
            &["ahostsv4", "example.com"],
            Duration::from_secs(6),
            "DNS lookup",
        )
    } else {
        CommandOutput {
            stdout: String::new(),
            stderr: "Skipped until a usable IPv4 address is present.".to_string(),
            success: false,
            ran: false,
        }
    };
    let http_probe = if has_valid_ip {
        capture_with_timeout(
            "curl",
            &[
                "-fsS",
                "-o",
                "/dev/null",
                "-w",
                "%{http_code}",
                "--connect-timeout",
                "5",
                "--max-time",
                "8",
                "https://connectivitycheck.gstatic.com/generate_204",
            ],
            Duration::from_secs(10),
            "HTTPS connectivity",
        )
    } else {
        CommandOutput {
            stdout: String::new(),
            stderr: "Skipped until a usable IPv4 address is present.".to_string(),
            success: false,
            ran: false,
        }
    };

    let device_status = if links_out.success {
        DiagnosticStatus::Ok
    } else {
        DiagnosticStatus::Warning
    };
    emit_node(
        &mut emit,
        run_id,
        "device",
        "Device",
        0,
        device_status,
        "Inspecting Linux and the local network stack...",
    );
    let adapter_status = if primary_link.is_some_and(|link| link.state.eq_ignore_ascii_case("UP")) {
        DiagnosticStatus::Ok
    } else if !links.is_empty() {
        DiagnosticStatus::Warning
    } else {
        DiagnosticStatus::Failed
    };
    emit_node(
        &mut emit,
        run_id,
        "adapter",
        "Adapter",
        1,
        adapter_status,
        "Checking the interface carrying the default route...",
    );
    let wifi_status = if is_wifi
        && nm_device.is_some_and(|device| device.state.eq_ignore_ascii_case("connected"))
    {
        DiagnosticStatus::Ok
    } else if is_wifi {
        DiagnosticStatus::Warning
    } else {
        DiagnosticStatus::Skipped
    };
    emit_node(
        &mut emit,
        run_id,
        "wifi",
        "Wi-Fi",
        2,
        wifi_status,
        "Reading wireless association through NetworkManager when available...",
    );
    let profile_status = if !is_wifi {
        DiagnosticStatus::Skipped
    } else if connection.is_some() {
        DiagnosticStatus::Ok
    } else if nmcli_out.ran {
        DiagnosticStatus::Warning
    } else {
        DiagnosticStatus::Unknown
    };
    emit_node(
        &mut emit,
        run_id,
        "profile",
        "Profile",
        3,
        profile_status,
        "Matching the wireless device to its active local profile...",
    );
    let ip_status = if has_valid_ip {
        DiagnosticStatus::Ok
    } else if primary_link.is_some() {
        DiagnosticStatus::Failed
    } else {
        DiagnosticStatus::Unknown
    };
    emit_node(
        &mut emit,
        run_id,
        "ip",
        "IP Address",
        4,
        ip_status,
        "Inspecting the active IPv4 configuration and configured resolvers...",
    );
    let gateway_status = if !has_valid_ip {
        DiagnosticStatus::Skipped
    } else if gateway.is_none() {
        DiagnosticStatus::Failed
    } else if gateway_probe.as_ref().is_some_and(|output| output.success) {
        DiagnosticStatus::Ok
    } else if gateway_probe.as_ref().is_some_and(command_has_signal) {
        DiagnosticStatus::Warning
    } else {
        DiagnosticStatus::Unknown
    };
    emit_node(
        &mut emit,
        run_id,
        "gateway",
        "Gateway",
        5,
        gateway_status,
        "Testing the local default gateway path...",
    );
    let internet_status = if !has_valid_ip {
        DiagnosticStatus::Skipped
    } else if http_probe.success {
        DiagnosticStatus::Ok
    } else if http_probe.ran {
        DiagnosticStatus::Failed
    } else {
        DiagnosticStatus::Unknown
    };
    emit_node(
        &mut emit,
        run_id,
        "internet",
        "Internet",
        6,
        internet_status,
        "Testing a bounded HTTPS connectivity endpoint...",
    );
    let dns_status = if !has_valid_ip {
        DiagnosticStatus::Skipped
    } else if dns_probe.success && first_line(&dns_probe).is_some() {
        DiagnosticStatus::Ok
    } else if dns_probe.ran && gateway_status == DiagnosticStatus::Ok {
        DiagnosticStatus::Failed
    } else {
        DiagnosticStatus::Unknown
    };
    emit_node(
        &mut emit,
        run_id,
        "dns",
        "DNS",
        7,
        dns_status,
        "Testing name resolution independently from the HTTPS probe...",
    );
    let network_manager = capture(
        "systemctl",
        &["is-active", "NetworkManager"],
        "NetworkManager service",
    );
    let os_status = if !nmcli_out.ran {
        DiagnosticStatus::Unknown
    } else if network_manager.success || network_manager.stdout.trim() == "active" {
        DiagnosticStatus::Ok
    } else {
        DiagnosticStatus::Warning
    };
    emit_node(
        &mut emit,
        run_id,
        "windows-status",
        "OS Status",
        8,
        os_status,
        "Checking Linux network-service availability without changing configuration...",
    );
    let apps_status = internet_status;
    emit_node(
        &mut emit,
        run_id,
        "apps",
        "Apps",
        9,
        apps_status,
        "Confirming that an application-layer HTTPS request can complete...",
    );

    if crate::diagnostics::scan_cancelled() {
        return Err("Diagnostic scan cancelled or exceeded its time budget".into());
    }

    let raw = |label: &str, output: &CommandOutput| {
        format!(
            "## {label}\n{}{}",
            output.stdout,
            if output.stderr.is_empty() {
                String::new()
            } else {
                format!("\n[stderr]\n{}", output.stderr)
            }
        )
    };
    let nodes = vec![
        node("device", "Device", "monitor", device_status, if device_status == DiagnosticStatus::Ok { "Linux diagnostic tools responded." } else { "Linux returned partial system details; the scan continued." }, "Aegis uses a fixed, read-only Linux command set and records partial coverage.", &["Linux command availability"], vec![evidence("platform", "Platform", &environment.os, device_status, None)], vec![], vec![], Some(raw("ip link", &links_out))),
        node("adapter", "Adapter", "network", adapter_status, primary_interface.as_deref().map(|value| format!("{value} is carrying the selected route.")).unwrap_or_else(|| "No route-bearing network interface was confirmed.".to_string()).as_str(), "The adapter node identifies the interface selected by the default route.", &["Default route", "Link state"], vec![evidence("interface", "Active interface", primary_interface.clone().unwrap_or_else(|| "Not detected".to_string()), adapter_status, None), evidence("mac", "Hardware address", primary_link.and_then(|link| link.mac_address.clone()).unwrap_or_else(|| "Not available".to_string()), DiagnosticStatus::Unknown, None)], if adapter_status == DiagnosticStatus::Failed { vec!["No usable Linux network interface was exposed.".to_string()] } else { vec![] }, available_fixes(&["open-network-settings"], &context), Some(format!("{}\n\n{}", raw("ip link", &links_out), raw("ip route", &routes_out)))),
        node("wifi", "Wi-Fi", "wifi", wifi_status, if wifi_status == DiagnosticStatus::Ok { "NetworkManager reports a connected Wi-Fi device." } else if wifi_status == DiagnosticStatus::Skipped { "The active route is not using a NetworkManager Wi-Fi device." } else { "A Wi-Fi device was found but is not connected." }, "Wi-Fi details are optional because Linux desktops can use different network managers.", &["NetworkManager device state"], vec![evidence("wifi-device", "Wireless device", if is_wifi { primary_interface.clone().unwrap_or_default() } else { "Not applicable".to_string() }, wifi_status, None)], vec![], if is_wifi { available_fixes(&["restart-wlan-service", "reconnect-wifi", "open-network-settings"], &context) } else { available_fixes(&["open-network-settings"], &context) }, Some(raw("nmcli device status", &nmcli_out))),
        node("profile", "Profile", "bookmark", profile_status, connection.as_deref().map(|value| format!("Active local profile: {value}")).unwrap_or_else(|| "No active NetworkManager Wi-Fi profile was confirmed.".to_string()).as_str(), "Aegis identifies only the profile name; it never reads or exports Wi-Fi secrets.", &["NetworkManager connection mapping"], vec![evidence("connection", "Active profile", connection.clone().unwrap_or_else(|| "Not detected".to_string()), profile_status, None)], vec![], available_fixes(&["forget-current-profile", "reconnect-wifi", "open-network-settings"], &context), Some(raw("nmcli device status", &nmcli_out))),
        node("ip", "IP Address", "map-pin", ip_status, ipv4.as_deref().map(|value| format!("Active interface has IPv4 address {value}.")).unwrap_or_else(|| "No usable IPv4 address was found on the active interface.".to_string()).as_str(), "A usable IPv4 address is required before Aegis evaluates gateway, internet, and DNS reachability.", &["IPv4 address", "DNS server configuration"], vec![evidence("ipv4", "IPv4 address", ipv4.clone().unwrap_or_else(|| "Not detected".to_string()), ip_status, None), evidence("dns-servers", "Configured resolvers", if dns_servers.is_empty() { "Not found in resolv.conf".to_string() } else { dns_servers.join(", ") }, if dns_servers.is_empty() { DiagnosticStatus::Warning } else { DiagnosticStatus::Ok }, None)], if ip_status == DiagnosticStatus::Failed { vec!["DHCP may be unavailable or the interface may need reconnection.".to_string()] } else { vec![] }, available_fixes(&["renew-dhcp", "restart-adapter", "reconnect-wifi", "open-network-settings"], &context), Some(raw("ip address", &addresses_out))),
        node("gateway", "Gateway", "router", gateway_status, gateway.as_deref().map(|value| if gateway_status == DiagnosticStatus::Ok { format!("Gateway {value} responded.") } else { format!("Gateway {value} is configured but did not confirm an ICMP response.") }).unwrap_or_else(|| "No default gateway was found.".to_string()).as_str(), "Gateway checks use the route selected by Linux. An ICMP warning can also mean that a gateway blocks ping.", &["Default gateway", "One bounded ICMP probe"], vec![evidence("gateway", "Default gateway", gateway.clone().unwrap_or_else(|| "Not detected".to_string()), gateway_status, None)], if gateway_status == DiagnosticStatus::Failed { vec!["No default route is configured.".to_string()] } else { vec![] }, available_fixes(&["renew-dhcp", "restart-adapter", "reconnect-wifi", "open-router-settings"], &context), gateway_probe.as_ref().map(|output| raw("gateway ping", output))),
        node("internet", "Internet", "globe", internet_status, if internet_status == DiagnosticStatus::Ok { "A bounded HTTPS connectivity check completed." } else { "The HTTPS connectivity endpoint could not be reached." }, "Aegis checks a fixed HTTPS endpoint with a timeout and does not transmit diagnostic reports.", &["HTTPS connectivity probe"], vec![evidence("https", "Connectivity endpoint", if http_probe.success { "Reachable".to_string() } else { "Not reachable".to_string() }, internet_status, None)], if internet_status == DiagnosticStatus::Failed { vec!["The route may be blocked upstream, captive, or offline.".to_string()] } else { vec![] }, available_fixes(&["open-router-settings", "reconnect-wifi", "open-captive-portal", "open-network-settings", "generate-wlan-report"], &context), Some(raw("HTTPS probe", &http_probe))),
        node("dns", "DNS", "search", dns_status, if dns_status == DiagnosticStatus::Ok { "A hostname resolved to an IPv4 address." } else { "Aegis could not confirm hostname resolution." }, "DNS is tested separately so an address-path issue is not mislabeled as a resolver issue.", &["getent hostname lookup"], vec![evidence("dns-lookup", "Hostname resolution", if dns_probe.success { "Succeeded".to_string() } else { "Not confirmed".to_string() }, dns_status, None)], if dns_status == DiagnosticStatus::Failed { vec!["Configured DNS servers may be unavailable or returning no result.".to_string()] } else { vec![] }, available_fixes(&["flush-dns", "dns-automatic", "set-public-dns", "renew-dhcp", "open-router-settings"], &context), Some(raw("DNS probe", &dns_probe))),
        node("windows-status", "OS Status", "shield-check", os_status, if os_status == DiagnosticStatus::Ok { "NetworkManager is active." } else if nmcli_out.ran { "NetworkManager did not confirm an active service." } else { "NetworkManager is not installed or not available." }, "Linux network management varies by distribution; missing NetworkManager narrows only adapter-specific coverage.", &["NetworkManager availability"], vec![evidence("network-manager", "Network service", if network_manager.success { "Active".to_string() } else { "Not confirmed".to_string() }, os_status, None)], vec![], available_fixes(&["generate-wlan-report", "open-network-settings"], &context), Some(raw("NetworkManager service", &network_manager))),
        node("apps", "Apps", "app-window", apps_status, if apps_status == DiagnosticStatus::Ok { "An application-layer HTTPS request completed." } else { "Application-layer connectivity was not confirmed." }, "This final check reflects a bounded HTTPS request, not the health of every app on the desktop.", &["HTTPS request completion"], vec![evidence("application-path", "HTTPS request", if http_probe.success { "Completed".to_string() } else { "Not completed".to_string() }, apps_status, None)], vec![], available_fixes(&["open-captive-portal", "open-network-settings", "generate-wlan-report"], &context), Some(raw("HTTPS probe", &http_probe))),
    ];
    let failed = nodes
        .iter()
        .find(|node| node.status == DiagnosticStatus::Failed);
    let warning = nodes
        .iter()
        .find(|node| node.status == DiagnosticStatus::Warning);
    let (
        diagnosis_id,
        title,
        summary,
        severity,
        confidence,
        primary_failed_node_id,
        recommended_fixes,
    ) = if let Some(node) = failed {
        (
            format!("linux-{}", node.id),
            format!("{} needs attention", node.label),
            node.summary.clone(),
            Severity::High,
            82,
            Some(node.id.clone()),
            node.recommended_fixes.clone(),
        )
    } else if let Some(node) = warning {
        (
            format!("linux-{}", node.id),
            format!("{} needs review", node.label),
            node.summary.clone(),
            Severity::Medium,
            62,
            None,
            node.recommended_fixes.clone(),
        )
    } else {
        ("linux-healthy".to_string(), "Connection path looks healthy".to_string(), "Linux completed the available checks without a confirmed break in the connection path.".to_string(), Severity::Info, 88, None, vec![])
    };
    let result = ScanResult {
        id: now_id(),
        created_at: now_iso(),
        mode: "live".to_string(),
        overall_status: if failed.is_some() {
            DiagnosticStatus::Failed
        } else if warning.is_some() {
            DiagnosticStatus::Warning
        } else {
            DiagnosticStatus::Ok
        },
        diagnosis: OverallDiagnosis {
            id: diagnosis_id,
            title,
            summary,
            confidence,
            severity,
            primary_failed_node_id,
            recommended_fixes,
        },
        nodes,
        environment,
    };
    emit(progress_event(
        run_id,
        "scan-finished",
        None,
        None,
        None,
        Some(result.overall_status),
        "Linux diagnostic timeline completed.",
    ));
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::{
        linux_fix, parse_default_route, parse_links, parse_nameservers, parse_nmcli_devices,
        LinuxContext,
    };

    #[test]
    fn parses_route_and_link_json_without_shelling_out() {
        let links = parse_links(
            r#"[{"ifname":"lo","operstate":"UNKNOWN"},{"ifname":"wlp0s20f3","operstate":"UP","address":"aa:bb:cc:dd:ee:ff"}]"#,
        );
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].name, "wlp0s20f3");
        assert_eq!(links[0].mac_address.as_deref(), Some("aa:bb:cc:dd:ee:ff"));
        let (interface, gateway) =
            parse_default_route(r#"[{"dst":"default","gateway":"192.168.1.1","dev":"wlp0s20f3"}]"#);
        assert_eq!(interface.as_deref(), Some("wlp0s20f3"));
        assert_eq!(gateway.as_deref(), Some("192.168.1.1"));
    }

    #[test]
    fn keeps_profile_names_as_data_not_commands() {
        let devices = parse_nmcli_devices(
            "wlp0s20f3:wifi:connected:Home Network\nenp0s31f6:ethernet:disconnected:--",
        );
        assert_eq!(devices[0].connection.as_deref(), Some("Home Network"));
        assert!(devices[1].connection.is_none());
    }

    #[test]
    fn extracts_only_valid_resolver_addresses() {
        assert_eq!(parse_nameservers("search example.test\nnameserver 1.1.1.1\nnameserver not-an-address\nnameserver 2001:4860:4860::8888\n"), vec!["1.1.1.1", "2001:4860:4860::8888"]);
    }

    #[test]
    fn hides_networkmanager_repairs_when_the_desktop_uses_another_network_stack() {
        let context = LinuxContext {
            interface: Some("enp0s31f6".to_string()),
            connection: None,
            gateway: None,
            is_wifi: false,
            network_manager_available: false,
            resolvectl_available: true,
            network_settings_available: false,
            browser_program: None,
        };

        assert!(linux_fix("flush-dns", &context).is_some());
        assert!(linux_fix("renew-dhcp", &context).is_none());
        assert!(linux_fix("restart-adapter", &context).is_none());
        assert!(linux_fix("generate-wlan-report", &context).is_none());
        assert!(linux_fix("open-network-settings", &context).is_none());
        assert!(linux_fix("reconnect-wifi", &context).is_none());
        assert!(linux_fix("open-router-settings", &context).is_none());
    }

    #[test]
    fn keeps_profile_changes_scoped_to_a_networkmanager_wifi_connection() {
        let context = LinuxContext {
            interface: Some("wlp0s20f3".to_string()),
            connection: Some("Office Wi-Fi".to_string()),
            gateway: Some("192.168.1.1".to_string()),
            is_wifi: true,
            network_manager_available: true,
            resolvectl_available: true,
            network_settings_available: true,
            browser_program: Some("xdg-open".to_string()),
        };

        assert!(linux_fix("forget-current-profile", &context).is_some());
        assert!(linux_fix("dns-automatic", &context).is_some());
        assert!(linux_fix("reconnect-wifi", &context).is_some());
        assert!(linux_fix("open-router-settings", &context).is_some());
        assert!(linux_fix("open-captive-portal", &context).is_some());
    }
}
