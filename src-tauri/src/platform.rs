use crate::diagnostics::{
    self, EnvironmentInfo, FixConfirmation, FixExecutionResult, RuntimeHealth, ScanProgressEvent,
    ScanResult, SystemMetrics,
};
use std::error::Error;

pub fn run_scan<F>(
    run_id: &str,
    cancellation: &diagnostics::ScanCancellation,
    emit_progress: F,
) -> Result<ScanResult, Box<dyn Error>>
where
    F: FnMut(ScanProgressEvent),
{
    diagnostics::with_scan_cancellation(cancellation, || {
        #[cfg(target_os = "windows")]
        {
            diagnostics::run_windows_scan(run_id, emit_progress)
        }

        #[cfg(target_os = "macos")]
        {
            crate::macos::run_scan(run_id, emit_progress)
        }

        #[cfg(target_os = "linux")]
        {
            crate::linux::run_scan(run_id, emit_progress)
        }

        #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
        {
            let _ = (run_id, emit_progress);
            Err("Aegis Trace does not support live diagnostics on this operating system.".into())
        }
    })
}

pub fn run_fix(
    fix_id: &str,
    confirmation: Option<&FixConfirmation>,
) -> Result<FixExecutionResult, Box<dyn Error>> {
    #[cfg(target_os = "windows")]
    return diagnostics::run_allowlisted_fix(fix_id, confirmation);

    #[cfg(target_os = "macos")]
    return crate::macos::run_allowlisted_fix(fix_id, confirmation);

    #[cfg(target_os = "linux")]
    return crate::linux::run_allowlisted_fix(fix_id, confirmation);

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    diagnostics::run_allowlisted_fix(fix_id, confirmation)
}

pub fn generate_wireless_report() -> Result<FixExecutionResult, Box<dyn Error>> {
    #[cfg(target_os = "windows")]
    return diagnostics::generate_wlan_report_impl();

    #[cfg(target_os = "macos")]
    return crate::macos::generate_wireless_report_impl();

    #[cfg(target_os = "linux")]
    return crate::linux::generate_wireless_report_impl();

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    diagnostics::generate_wlan_report_impl()
}

pub fn environment_info() -> EnvironmentInfo {
    #[cfg(target_os = "macos")]
    {
        crate::macos::environment_info()
    }

    #[cfg(target_os = "linux")]
    {
        crate::linux::environment_info()
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        diagnostics::environment_info()
    }
}

pub fn runtime_health() -> RuntimeHealth {
    #[cfg(target_os = "macos")]
    {
        crate::macos::runtime_health()
    }

    #[cfg(target_os = "linux")]
    {
        crate::linux::runtime_health()
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        diagnostics::runtime_health()
    }
}

pub fn system_metrics() -> SystemMetrics {
    diagnostics::system_metrics()
}
