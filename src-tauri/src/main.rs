#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod commands;
mod diagnostics;
mod platform;

#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "windows")]
use std::process::Command;

#[cfg(target_os = "windows")]
const ELEVATED_LAUNCH_FLAG: &str = "--aegis-elevated-launch";

#[cfg(target_os = "windows")]
fn quote_powershell_single(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

#[cfg(target_os = "windows")]
fn request_elevation_if_needed() {
    if diagnostics::current_process_is_admin() {
        return;
    }

    let Ok(exe_path) = std::env::current_exe() else {
        return;
    };

    let exe = quote_powershell_single(&exe_path.to_string_lossy());
    let args: Vec<String> = std::env::args_os()
        .skip(1)
        .filter_map(|arg| arg.into_string().ok())
        .filter(|arg| arg != ELEVATED_LAUNCH_FLAG)
        .map(|arg| quote_powershell_single(&arg))
        .collect();

    let argument_list = if args.is_empty() {
        String::new()
    } else {
        format!("-ArgumentList {}", args.join(","))
    };

    let command = format!(
        "Start-Process -FilePath {exe} {argument_list} -Verb RunAs",
        exe = exe,
        argument_list = if argument_list.is_empty() {
            String::new()
        } else {
            format!("{argument_list} ")
        }
    );

    let status = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            &command,
        ])
        .status();

    if matches!(status, Ok(exit) if exit.success()) {
        std::process::exit(0);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::run_scan,
            commands::run_fix,
            commands::export_report,
            commands::generate_wlan_report,
            commands::get_environment_info,
            commands::get_runtime_health,
            commands::get_system_metrics
        ])
        .run(tauri::generate_context!())
        .expect("error while running Aegis Trace");
}

fn main() {
    #[cfg(target_os = "windows")]
    request_elevation_if_needed();

    run();
}
