# Changelog

All notable changes are documented here. Armonìa uses semantic versioning for its public
specification and CLI surfaces.

## 1.0.0-rc.1 — 2026-07-28

### Added

- Local visual dashboard via `armonia ui`, with health, plan, diagnostics, packs, components,
  and guarded safe-apply actions.
- One-click platform launchers for starting the downloaded repository in the browser.

- `armonia/v1` project, pack, policy, and lock contracts.
- Reference CLI with safe planning, application, validation, capability execution, and migration.
- Declarative built-in pack catalog.
- Progressive policy profiles and expiring exceptions.
- Reusable GitHub workflows and organization integration assets.
- Portable coding-agent context model.
- Conformance tests and polyglot examples.

### Security

- Managed-file changes are hash guarded.
- Pack paths and target paths are constrained to their allowed roots.
- Pack v1 cannot execute arbitrary hooks.
- GitHub workflow actions are pinned to immutable commits.
