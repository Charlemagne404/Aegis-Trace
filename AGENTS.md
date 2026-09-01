# AGENTS.md — Aegis Trace

## Project Identity

Aegis Trace is a polished Windows desktop application focused on visually diagnosing and safely repairing Wi‑Fi and networking issues.

The core identity of the app is:

> A visual diagnostic timeline that shows exactly where the connection chain breaks.

This is not just a collection of repair scripts.
This is a modern, professional diagnostic experience.

The timeline is the heart of the product.

---

# Core Product Principles

## 1. Diagnosis Before Repair

Never blindly reset everything.

The app should:

1. Analyze
2. Explain
3. Show evidence
4. Recommend the safest fix
5. Only then offer repair actions

Every repair action should be justified by evidence.

Bad:

* "Internet broken? Reset network stack."

Good:

* "DNS resolution failed while external IP connectivity works. Recommend flushing DNS cache first."

---

## 2. The Timeline Is The Main Feature

The diagnostic timeline is the visual and conceptual centerpiece.

Everything in the app should reinforce this.

The timeline should:

* clearly show progression through the network stack
* visually indicate where failure occurs
* be readable even to non-technical users
* support deeper technical inspection
* animate scan progression smoothly
* make diagnosis feel intuitive

The timeline should feel:

* clean
* modern
* sleek
* calm
* professional
* trustworthy

Never clutter it.

---

## 3. Human-Readable First

The app should explain technical issues in plain language.

Normal mode should:

* avoid jargon where possible
* explain why something matters
* explain consequences of failures
* recommend clear next steps

Technician mode may expose:

* raw command output
* IPs
* routes
* adapter details
* diagnostics evidence
* PowerShell/netsh output

But normal users should never feel overwhelmed.

---

## 4. Safety Is Mandatory

Never perform dangerous networking changes silently.

Rules:

* Never run arbitrary shell commands from frontend input.
* Never allow unrestricted command execution.
* All fixes must be allowlisted.
* All aggressive fixes require explicit confirmation.
* Show command previews before execution.
* Never auto-run destructive fixes.
* Never export Wi‑Fi passwords.
* Never collect telemetry.
* Never upload reports.
* All data stays local.

The app must always feel trustworthy.

---

# Design Philosophy

## Desired Aesthetic

The app should feel like:

* Linear
* Stripe dashboard
* Windows 11 Fluent
* premium desktop utility
* subtle sci‑fi professionalism

NOT:

* gamer RGB
* hacker terminal spam
* old enterprise admin tools
* cluttered diagnostics dashboards
* outdated Windows forms

---

## Visual Style

Preferred design language:

* dark mode first
* soft gradients
* rounded 2xl cards
* subtle glow
* translucent surfaces
* excellent spacing
* smooth motion
* calm typography
* strong hierarchy
* minimal clutter

Animations should feel:

* responsive
* polished
* smooth
* subtle
* informative

Never overdo motion.

---

# Architecture Principles

## Modular By Default

The app must be highly modular.

Separate:

* UI
* diagnostic engine
* diagnosis scoring
* repair registry
* platform adapters
* report generation
* command execution

Avoid giant components.
Avoid giant files.
Avoid deeply coupled logic.

---

## Data-Driven UI

The UI should render from structured diagnostic data.

Do NOT hardcode:

* statuses
* colors
* timeline flow
* fixes
* node logic

The UI should consume typed diagnostic objects.

The timeline must render dynamically from scan results.

---

## Production Development

The installed Tauri desktop application is the product path and must use native diagnostics on the current operating system.

* Live scans must collect evidence from the device through a platform adapter.
* Repairs must execute only through the allowlisted native command registry and confirmation flow.
* Unsupported or incomplete runtimes must fail closed and explain what capability is unavailable.
* The browser entry point serves the product site; it must never fabricate device diagnostics or repair outcomes.
* Synthetic scenario data is permitted only inside automated tests and must be explicitly identified as test data.

---

# Diagnostic Philosophy

The goal is to identify:

* where the connection chain fails
* what evidence supports that
* what the safest fix is
* what the confidence level is

The app should reason about networking issues.

Examples:

If:

* gateway works
* external IP works
* DNS fails

Then:

* diagnose DNS failure
* high confidence
* recommend safe DNS-related fixes first

If:

* Wi‑Fi connected
* no valid IP
* APIPA 169.254.x.x

Then:

* diagnose DHCP/IP configuration failure

The app should not just dump command outputs.
It should interpret them.

---

# Timeline Philosophy

Preferred timeline order:

1. Device
2. Adapter
3. Wi‑Fi
4. Profile
5. IP Address
6. Gateway
7. Internet
8. DNS
9. Windows Status
10. Apps

The timeline should:

* visually flow left → right
* animate during scans
* highlight failure points
* dim unknown downstream nodes if appropriate
* support hover/click inspection
* work responsively

The failure point should be instantly obvious.

---

# UX Rules

## Normal Mode

Prioritize:

* clarity
* calmness
* simplicity
* actionable information

Hide:

* raw commands
* excessive evidence
* overwhelming technical detail

Always explain:

* what happened
* why it matters
* what to do next

---

## Technician Mode

Expose:

* raw outputs
* exact commands
* IPs
* routes
* DNS servers
* adapter states
* event log details
* confidence scoring
* internal evidence

Technician mode is for power users.

---

# Repair Action Philosophy

Repair actions must be categorized:

## Safe

Examples:

* flush DNS
* renew DHCP
* restart WLAN service
* open network settings

These should feel approachable.

---

## Moderate

Examples:

* forget Wi‑Fi profile
* change DNS settings
* restart adapter

These require confirmation.

---

## Aggressive

Examples:

* winsock reset
* TCP/IP reset
* full network reset

These require:

* strong warnings
* explicit confirmation
* command previews
* explanation of consequences

Never run aggressive fixes automatically.

---

# Backend Rules

Backend command execution must:

* use allowlisted commands only
* use fixed command mappings
* never execute arbitrary frontend input
* enforce timeouts
* capture stdout/stderr
* fail gracefully
* return structured results

The frontend should send:

* fix IDs
* scan requests

Never raw shell commands.

---

# Reporting Rules

Reports must:

* stay local
* warn about sensitive info
* exclude passwords
* be readable
* explain failures clearly

Preferred export formats:

* JSON
* HTML
* ZIP case file

Report design should match app styling.

---

# Code Quality Standards

Preferred:

* TypeScript strict mode
* reusable utilities
* typed models
* isolated logic
* small components
* readable naming
* predictable state
* maintainable architecture

Avoid:

* duplicated logic
* magic strings
* giant switch statements
* giant monolithic components
* deeply nested conditionals

---

# Preferred Technologies

Frontend:

* React
* TypeScript
* TailwindCSS
* Framer Motion
* lucide-react

Desktop:

* Tauri v2

Backend:

* Rust Tauri commands
* PowerShell integration on Windows

---

# Preferred Component Structure

Suggested organization:

src/
components/
dashboard/
timeline/
details/
fixes/
reports/
settings/
core/
types/
engine/
scoring/
fixes/
platform/
adapters/
hooks/
utils/

Maintain clean separation of concerns.

---

# Development Priorities

Priority order:

1. Beautiful polished timeline UI
2. Reliable live platform diagnostics
3. Clean architecture
4. Diagnostic engine and scoring
5. Safe repair actions
6. Reporting/export
7. Technician mode depth
8. Advanced repair actions

Do not prematurely optimize.

Polish and clarity matter.

---

# Important Non-Goals

This app is NOT:

* malware
* a pentesting tool
* a hacking toolkit
* a remote administration backdoor
* a telemetry collector
* an antivirus
* an enterprise monitoring suite

Stay focused on:

* local diagnostics
* visual troubleshooting
* safe repair workflows
* user understanding

---

# Final Guiding Principle

Aegis Trace should make networking issues feel understandable.

Users should be able to look at the timeline and immediately understand:

> where the connection broke
> why it matters
> what evidence supports it
> what the safest next step is

The app should feel:

* intelligent
* calm
* trustworthy
* modern
* polished
* visual
* informative
* safe

The timeline is the soul of the product.
