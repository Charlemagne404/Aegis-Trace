use crate::diagnostics::{
    self, export_local_report, EnvironmentInfo, FixConfirmation, FixExecutionResult, RuntimeHealth,
    ScanProgressEvent, ScanResult, SystemMetrics,
};
use crate::platform;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn run_scan(app: AppHandle, run_id: String) -> Result<ScanResult, String> {
    let cancellation = diagnostics::register_scan(&run_id)?;
    let task_run_id = run_id.clone();
    let joined = tauri::async_runtime::spawn_blocking(move || {
        let result = platform::run_scan(
            &task_run_id,
            &cancellation,
            |progress: ScanProgressEvent| {
                let _ = app.emit("aegis-trace://scan-progress", progress);
            },
        )
        .map_err(|error| error.to_string());
        diagnostics::unregister_scan(&task_run_id);
        result
    })
    .await;

    if joined.is_err() {
        diagnostics::unregister_scan(&run_id);
    }

    joined.map_err(|error| format!("Native scan task failed: {error}"))?
}

#[tauri::command]
pub fn cancel_scan(run_id: String) -> bool {
    diagnostics::cancel_scan(&run_id)
}

#[tauri::command]
pub async fn run_fix(
    fix_id: String,
    confirmation: Option<FixConfirmation>,
) -> Result<FixExecutionResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        platform::run_fix(&fix_id, confirmation.as_ref()).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Native repair task failed: {error}"))?
}

#[tauri::command]
pub async fn export_report(
    _scan: serde_json::Value,
    format: String,
    content: String,
    encoding: Option<String>,
) -> Result<String, String> {
    export_local_report(&format, &content, encoding.as_deref()).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn generate_wlan_report() -> Result<FixExecutionResult, String> {
    tauri::async_runtime::spawn_blocking(|| {
        platform::generate_wireless_report().map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Native wireless report task failed: {error}"))?
}

#[tauri::command]
pub async fn get_environment_info() -> Result<EnvironmentInfo, String> {
    tauri::async_runtime::spawn_blocking(platform::environment_info)
        .await
        .map_err(|error| format!("Environment info task failed: {error}"))
}

#[tauri::command]
pub async fn get_runtime_health() -> Result<RuntimeHealth, String> {
    tauri::async_runtime::spawn_blocking(platform::runtime_health)
        .await
        .map_err(|error| format!("Runtime health task failed: {error}"))
}

#[tauri::command]
pub async fn get_system_metrics() -> Result<SystemMetrics, String> {
    tauri::async_runtime::spawn_blocking(platform::system_metrics)
        .await
        .map_err(|error| format!("System metrics task failed: {error}"))
}
