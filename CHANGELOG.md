# Changelog

All notable changes to Armonia are documented here. The project follows
[Semantic Versioning](https://semver.org/).

## Unreleased

### Correctness and reliability

- Validate configuration and portfolio registries against the shipped schemas;
  honor configured CLI severity thresholds and reject invalid arguments before
  writing output. Use exclusive temporary report files with cleanup.
- Bound file-reading concurrency and retained text, preserve deterministic
  ordering, expose skipped paths and reject invalid scan roots.
- Validate manifest shapes, collect multiline workflow commands, recognize
  inline permissions and inspect the final Docker runtime user.
- Respect simple Node lower bounds and independent package scopes, avoid
  ambiguous port contradictions and use portable case-sensitive link checks.
- Redact recognized credentials from all report fields and scan all supported
  text surfaces; make finding identities independent of evidence ordering.
- Add regression coverage for CLI, schemas, browser failures and static assets;
  make TypeScript and dependency audit part of the publication gate.
- Fix project-Pages asset layout, handle user Pages roots, remove unused CSS
  and improve scanner loading, clipboard, error and critical-finding states.
- Improve contrast of green text and warning labels on light backgrounds
  without changing the layout or decorative shader palette.
- Keep website dependencies development-only so the packaged offline CLI has
  no runtime dependencies; derive CLI/report versions from package metadata.

### Security and release hygiene

- Removed deployment-specific configuration from the public source tree.
- Replaced the checked-in multi-project portfolio snapshot with a self-contained reference snapshot.
- Added public-release guidance, privacy notes, dependency updates, and issue/PR templates.

## 0.1.0 — 2026-08-09

### Added

- Deterministic repository scanning with terminal, JSON, and SARIF reporters.
- Cross-file checks for documentation, runtime, environment, delivery, security posture, and community readiness.
- A local portfolio registry and a responsive web surface for exploring generated evidence.
