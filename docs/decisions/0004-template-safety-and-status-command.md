# ADR-0004: Template safety hardening and status command

- Status: accepted
- Date: 2026-07-29
- Owners: AleDet01

## Context

The template engine substitutes manifest values into generated files (including GitHub Actions
workflow YAML). A malicious or accidental `<<armonia:...>>` pattern in a manifest field value
(e.g., `project.name`) could produce secondary template markers in the rendered output, leading
to unexpected content in CI files or recursive expansion.

Additionally, symlinks in pack directories could bypass the `safePath` boundary check that
prevents a pack from reading files outside its own directory tree.

Separately, the CLI lacked a quick "how is my project doing?" command, forcing users to run
`validate` + `plan` + `doctor` separately to get a full picture.

## Decision

1. **Template marker rejection**: after variable substitution, the rendered output is scanned
   for residual `<<armonia:...>>` patterns. If found, the operation fails with ARM022 instead
   of producing potentially dangerous content.

2. **Symlink resolution for pack sources**: before reading a pack file source, the planner
   resolves symlinks via `realpath` and verifies the resolved path still falls within the
   pack's directory boundary.

3. **`status` command**: a new read-only CLI command returns a concise summary of project
   identity, file state (up-to-date/pending/conflicts/orphaned), and policy compliance in
   both human and JSON format.

4. **`generatedAt` in lockfile**: the lock includes an ISO timestamp for auditability.

## Consequences

- Template injection via manifest values is blocked with a clear error.
- Symlink-based path traversal from pack sources is prevented.
- Users can quickly assess repository health with `armonia status`.
- The lockfile gains provenance metadata (additive, backward-compatible).
- Security-specific tests cover these attack vectors explicitly.

## Alternatives considered

- Escaping manifest values before substitution: rejected because the correct escaping depends
  on the target format (YAML, Markdown, shell) and would add complexity without solving the
  root cause. Rejecting dangerous patterns is simpler and more secure.
- Using `lstat` instead of `realpath`: insufficient because a symlink chain could still
  resolve outside the boundary.
