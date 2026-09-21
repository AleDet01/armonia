# Rule catalog

Rules are grouped by the relationship they protect. Severity represents likely
impact, not certainty about which source should change.

## Trust

- `scan/file-limit` — the evidence set is incomplete because traversal reached
  its configured limit.

## Documentation

- `public/readme` — no discoverable README exists.
- `command/missing-script` — documentation or CI invokes a package script that
  the nearest manifest does not expose.
- `docs/broken-relative-link` — a repository-local Markdown link has no target.
- `environment/stale-example` — an example variable has no detected source use.

## Delivery and dependencies

- `manifest/invalid-json` — a package manifest cannot be parsed.
- `manifest/missing-entrypoint` — `main`, `module`, or `types` points to a file
  absent from the repository snapshot.
- `package-manager/multiple-lockfiles` — one workspace has competing lockfile
  owners.
- `package-manager/undeclared` — a lockfile exists without an exact
  `packageManager` field.
- `command/posix-env-assignment` — a package script embeds syntax that fails in
  the default Windows shell.
- `dependency/floating-version` — a manifest resolves `latest` or `*`.
- `delivery/no-ci` and `delivery/no-test-script` — no canonical automated
  verification path is discoverable.

## Runtime

- `runtime/node-drift` — Node majors disagree across manifest, docs, CI, or a
  container base.
- `runtime/port-drift` — one documented local port disagrees with one exposed
  container port.
- `environment/undocumented` — source uses a variable missing from environment
  examples.

## Security

- `security/floating-action` — a GitHub Action uses a mutable branch ref.
- `security/workflow-permissions` — a workflow leaves token permissions implicit.
- `security/floating-container-image` — a container uses a `latest` base tag.
- `security/container-root` — a Dockerfile has no runtime `USER` declaration.
- `security/possible-secret` — a high-confidence credential shape appears in
  source; the matched value is never included in a report.
- `security/env-file-present` — a non-example environment file is present and
  deserves an ignore check.

## Community readiness

- `public/license`, `public/contributing`, `public/security`, and
  `public/code-of-conduct` check whether a public project exposes the minimum
  legal and collaboration routes developers need.

Disable a rule only in `armonia.config.json`, where the exception remains
visible in review. Rule-specific options will be added when real false-positive
data supports them.
