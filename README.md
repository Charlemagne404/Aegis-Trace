# Aegis Trace

Aegis Trace is a production Tauri desktop app for visual Wi-Fi and network diagnostics on Windows, macOS, and Linux. The product centers on a left-to-right diagnostic timeline that shows where the connection path breaks across:

Device -> Adapter -> Wi-Fi -> Profile -> IP Address -> Gateway -> Internet -> DNS -> OS Status -> Apps

## Current State

The project has a usable React/Tauri shell, a typed cross-platform diagnostic model, ranked repair recommendations, local report export, and native Windows, macOS, and Linux adapters for live probes and allowlisted fixes.

What is implemented today:

- Timeline-first dashboard with animated scan progression.
- Normal and Technician modes.
- Live native scans that inspect the current device and stream progress through the timeline.
- Local scan history with restore-on-load behavior.
- Repair confirmation flow with command previews and post-fix verification.
- Local JSON, HTML, and ZIP case-file export.
- Tauri v2 command surface for live Windows, macOS, and Linux scans, report export, and allowlisted fix execution.
- Windows, macOS, and Linux compile/test validation in GitHub Actions.

What is still limited:

- Real diagnostics and repair execution work in the Windows, macOS, and Linux Tauri runtimes. Linux uses the standard `ip`, `nmcli`, `resolvectl`, `getent`, `ping`, and `curl` toolchain where available, and clearly records partial coverage when a distribution omits an optional tool.
- The browser entry point serves the product site; live diagnostics and repairs require the installed Tauri desktop app.
- Runtime validation on real Windows hardware is still needed for broader confidence.
- Tagged releases are built on native Windows, macOS, and Linux GitHub runners and uploaded to GitHub Releases. Code-signing and notarization are still required before presenting a release as fully trusted.

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

Run the product site locally:

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

Windows validation runs in [`.github/workflows/windows-validate.yml`](./.github/workflows/windows-validate.yml), macOS validation runs in [`.github/workflows/macos-validate.yml`](./.github/workflows/macos-validate.yml), and Linux validation runs in [`.github/workflows/linux-validate.yml`](./.github/workflows/linux-validate.yml). They cover frontend tests/builds and native Rust checks on their target runners, but they do not replace live runtime testing on real Wi-Fi hardware.

## Project Layout

```text
src/
  components/     React UI for dashboard, timeline, details, fixes, reports, and settings
  core/           typed models, scoring, report export, history, repair verification
  hooks/          scan orchestration and footer metrics
  platform/       native Tauri adapter and environment detection

src-tauri/
  src/            Tauri commands, shared types, and native platform adapters
  tauri.conf.json app metadata and bundle defaults
  tauri.windows.conf.json Windows installer bundle config
  tauri.windows.release.conf.json optional signing overlay
```

See [`docs/platform-support.md`](./docs/platform-support.md) for the platform support matrix.

## Windows Packaging

- Windows installer targets are configured in [`src-tauri/tauri.windows.conf.json`](./src-tauri/tauri.windows.conf.json).
- Optional signing overlay guidance lives in [`docs/windows-release.md`](./docs/windows-release.md).
- ZIP case files include a plain-language summary, structured scan JSON, a styled HTML timeline report, manifest metadata, and raw per-node output when available.

## Publishing a Release

Create and push a version tag from the commit you want to publish:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The [`Build and publish release`](./.github/workflows/release.yml) workflow builds Windows `.exe`/`.msi`, macOS Intel and Apple Silicon `.dmg`, and Linux `.AppImage`/`.deb`/`.rpm` artifacts, then publishes them with SHA-256 checksums to the matching GitHub Release.
