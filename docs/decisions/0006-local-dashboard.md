# ADR-0006: Local dependency-free dashboard

- Status: accepted
- Date: 2026-09-29
- Owners: Armonìa maintainers

## Context

The CLI is the reference control-plane implementation, but new users need a faster way to
understand repository health, planned generated-file changes, diagnostics, packs, and
components. A separate frontend application would add installation steps, runtime dependencies,
and a second implementation of control-plane behavior.

## Decision

Provide a local web dashboard through `armonia ui`. The dashboard is served by the reference
CLI on the loopback interface, uses static HTML/CSS/browser JavaScript, and calls the same
TypeScript engine used by CLI commands. It adds no runtime package dependencies.

Mutating UI operations reuse the existing planner and apply safety model. They require a
per-process local token, and conflicts are never force-applied from the UI.

Platform launchers start the same command so a downloaded checkout can be opened with a single
user action once Node.js 24+ is available.

## Consequences

The UI remains portable, small, and behaviorally aligned with the CLI. Packaging must include
the `ui/` assets. Browser actions can expose only deliberately selected engine operations, and
new mutating actions require the same safety review as CLI mutations.

## Alternatives considered

A React/Vite application was rejected because it adds a build/runtime dependency surface for a
small local control-plane UI. An Electron/Tauri desktop application was rejected because it
would substantially increase distribution and release complexity before there is evidence that
a native shell is required.
