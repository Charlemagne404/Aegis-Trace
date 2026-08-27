# Platform support

Aegis Trace keeps its diagnostic model and React UI shared across desktop platforms. Native commands are selected by the Rust target at compile time through [`src-tauri/src/platform.rs`](../src-tauri/src/platform.rs).

| Platform | Desktop runtime | Live diagnostics | Allowlisted repairs | Current boundary |
| --- | --- | --- | --- | --- |
| Windows 10/11 | Supported | Supported through PowerShell and Windows networking tools | Supported, with confirmation and elevation gates | Existing Windows adapter |
| macOS desktop | Supported for development and validation | Supported through `ifconfig`, `networksetup`, `route`, `scutil`, DNS tools, and bounded HTTPS probes | Supported for platform-equivalent actions; admin-only actions fail closed without elevation | macOS adapter |
| Linux | Tauri shell can compile | Preview/mock fallback only | Blocked until a Linux adapter is implemented | Explicit future adapter boundary |

The Linux entry point is intentionally a graceful fallback. It does not reinterpret Linux command output as Windows or macOS evidence, and it does not claim live support yet.

## Native command safety

The frontend sends scan requests and fix IDs only. Each native adapter maps those IDs to a fixed command and argument list. Values discovered from the operating system, such as an interface name or Wi-Fi network name, are passed as arguments rather than interpolated into a shell command.

Live scans are read-only. Moderate and aggressive repairs require the existing confirmation flow, and administrator-only repairs are blocked when the desktop process is not elevated.

## Validation limits

The CI jobs compile and test the adapters on their target operating systems. They do not replace runtime testing against real Wi-Fi hardware, captive portals, VPNs, enterprise proxies, or administrator policies.
