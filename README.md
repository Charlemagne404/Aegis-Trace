# Aegis Trace

Aegis Trace is a mock-first Tauri desktop app for visual Wi-Fi and network diagnostics on Windows and macOS. The product centers on a left-to-right diagnostic timeline that shows where the connection path breaks across:

Device -> Adapter -> Wi-Fi -> Profile -> IP Address -> Gateway -> Internet -> DNS -> OS Status -> Apps

## Current State

The project has a usable React/Tauri shell, a typed cross-platform diagnostic model, realistic mock scenarios, ranked repair recommendations, local report export, and native Windows/macOS adapters for live probes and allowlisted fixes.

What is implemented today:

- Timeline-first dashboard with animated scan progression.
- Normal and Technician modes.
- Ten mock scenarios for cross-platform development and demos.
- Local scan history with restore-on-load behavior.
- Repair confirmation flow with command previews and post-fix verification.
- Local JSON, HTML, and ZIP case-file export.
- Tauri v2 command surface for live Windows and macOS scans, report export, and allowlisted fix execution.
- Windows and macOS compile/test validation in GitHub Actions.

What is still limited:

- Real diagnostics and repair execution work in the Windows and macOS Tauri runtimes.
- Linux currently compiles through the explicit unsupported-platform boundary and uses mock/preview data; a native Linux adapter is planned.
- Browser development mode falls back to preview or mock data and does not execute live fixes.
- Runtime validation on real Windows hardware is still needed for broader confidence.
- Code-signing and polished release automation are scaffolded, not finished.

## Safety Model

Aegis Trace is built around diagnosis before repair.

- No arbitrary shell input from the frontend.
- Frontend requests scans and allowlisted fix IDs only.
- Fix execution is mapped in the backend to fixed commands with confirmation gates.
- Moderate and aggressive repairs require explicit confirmation.
- Reports stay local.
- Saved Wi-Fi passwords are never read or exported.
- Telemetry and report uploads are not implemented.

## Development

Install dependencies:

```bash
npm install
```

Run the browser preview:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

Build the frontend:

```bash
npm run build
```

Run the Tauri desktop app on the current host:

```bash
npm run tauri dev
```

Windows validation runs in [`.github/workflows/windows-validate.yml`](./.github/workflows/windows-validate.yml), and macOS validation runs in [`.github/workflows/macos-validate.yml`](./.github/workflows/macos-validate.yml). They cover frontend tests/builds and native Rust checks on their target runners, but they do not replace live runtime testing on real Wi-Fi hardware.

## Project Layout

```text
src/
  components/     React UI for dashboard, timeline, details, fixes, reports, and settings
  core/           typed models, mock scenarios, scoring, report export, history, repair verification
  hooks/          scan orchestration and footer metrics
  platform/       browser/mock/Tauri adapters

src-tauri/
  src/            Tauri commands, shared types, and native platform adapters
  tauri.conf.json app metadata and bundle defaults
  tauri.windows.conf.json Windows installer bundle config
  tauri.windows.release.conf.json optional signing overlay
```

See [`docs/platform-support.md`](./docs/platform-support.md) for the Windows/macOS support matrix and the Linux adapter boundary.

## Windows Packaging

- Windows installer targets are configured in [`src-tauri/tauri.windows.conf.json`](./src-tauri/tauri.windows.conf.json).
- Optional signing overlay guidance lives in [`docs/windows-release.md`](./docs/windows-release.md).
- ZIP case files include a plain-language summary, structured scan JSON, a styled HTML timeline report, manifest metadata, and raw per-node output when available.
