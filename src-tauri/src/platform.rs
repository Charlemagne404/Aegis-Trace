use crate::diagnostics::{
    self, EnvironmentInfo, FixConfirmation, FixExecutionResult, RuntimeHealth, ScanProgressEvent,
    ScanResult, SystemMetrics,
};
use std::error::Error;

pub fn run_scan<F>(
    scenario_id: Option<String>,
    run_id: &str,
    emit_progress: F,
) -> Result<ScanResult, Box<dyn Error>>
where
    F: FnMut(ScanProgressEvent),
{
    #[cfg(target_os = "windows")]
    return diagnostics::run_windows_scan(scenario_id, run_id, emit_progress);

    #[cfg(target_os = "macos")]
    return crate::macos::run_scan(scenario_id, run_id, emit_progress);

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    diagnostics::run_windows_scan(scenario_id, run_id, emit_progress)
}

pub fn run_fix(
    fix_id: &str,
    confirmation: Option<&FixConfirmation>,
) -> Result<FixExecutionResult, Box<dyn Error>> {
    #[cfg(target_os = "windows")]
    return diagnostics::run_allowlisted_fix(fix_id, confirmation);

    #[cfg(target_os = "macos")]
    return crate::macos::run_allowlisted_fix(fix_id, confirmation);

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    diagnostics::run_allowlisted_fix(fix_id, confirmation)
}

pub fn generate_wireless_report() -> Result<FixExecutionResult, Box<dyn Error>> {
    #[cfg(target_os = "windows")]
    return diagnostics::generate_wlan_report_impl();

    #[cfg(target_os = "macos")]
    return crate::macos::generate_wireless_report_impl();

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    diagnostics::generate_wlan_report_impl()
}

pub fn environment_info() -> EnvironmentInfo {
    #[cfg(target_os = "macos")]
    {
        crate::macos::environment_info()
    }

    #[cfg(not(target_os = "macos"))]
    {
        diagnostics::environment_info()
    }
}

pub fn runtime_health() -> RuntimeHealth {
    #[cfg(target_os = "macos")]
    {
        crate::macos::runtime_health()
    }

    #[cfg(not(target_os = "macos"))]
    {
        diagnostics::runtime_health()
    }
}

pub fn system_metrics() -> SystemMetrics {
    diagnostics::system_metrics()
}
