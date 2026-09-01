# Windows Release Guide

This repo includes the Windows packaging pieces needed to build unsigned installers locally or through the tagged release workflow, compile-check the codebase in CI, and layer in signing later.

## Current Release State

Committed today:

1. `src-tauri/tauri.windows.conf.json`
   Enables explicit Windows installer targets for `nsis` and `msi`.
2. `.github/workflows/windows-validate.yml`
   Runs frontend tests, frontend build, and `cargo check` on `windows-latest`.
3. `src-tauri/tauri.windows.release.conf.json`
   Provides an optional signing overlay for future release builds.
4. `src-tauri/relic.conf.example`
   Documents the expected `relic` configuration shape for Azure Key Vault signing.
5. `.github/workflows/release.yml`
   Builds Windows, macOS, and Linux release artifacts and uploads them to GitHub Releases when a `v*` tag is pushed.

Not finished yet:

- No checked-in production signing certificate or `relic.conf`.
- The automated release workflow currently publishes unsigned artifacts.
- No guarantee yet that installer behavior has been validated across real Windows hardware combinations.

## Local Unsigned Installer Build

Run this on Windows with Node and Rust installed:

```bash
npm ci
npm test
npm run tauri build -- --ci
```

On Windows, Tauri merges [`src-tauri/tauri.windows.conf.json`](../src-tauri/tauri.windows.conf.json) automatically, so unsigned builds already target installer output.

## Optional Signed Build Path

The signing overlay is present so release signing can be added without changing the base app config.

1. Copy `src-tauri/relic.conf.example` to `src-tauri/relic.conf`.
2. Replace the placeholder certificate URL with the real Azure Key Vault certificate URL.
3. Set the Azure credentials required by `relic`:
   `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, and `AZURE_TENANT_ID`.
4. Build with the signing overlay:

```bash
npm run tauri build -- --ci --config src-tauri/tauri.windows.release.conf.json
```

Until a real certificate is available, the intended path is to keep producing unsigned installers locally and use CI only for compile validation.
