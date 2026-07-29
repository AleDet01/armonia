# CLI reference

## Read-only commands

### `status`

Returns a concise health summary: project identity, file state, policy compliance, and overall
health. Returns exit code `0` when healthy, `1` when action is required.

### `diff`

Shows divergence between observed repository state and desired state. Reports files that need
to be created, updated, or have conflicts, plus orphaned files from removed packs. Returns
exit code `0` when clean, `1` when divergence exists.

### `inspect`

Returns the manifest, resolved packs, components, and effective capability commands.

### `validate`

Validates schemas, pack resolution, policy, and managed-file conflicts. Warnings do not change
the exit code; errors return `1`.

### `doctor`

Adds executable discovery and generated-state drift checks.

### `plan`

Reports `create`, `update`, `unchanged`, `skip`, and `conflict`. Desired file bodies are omitted
from ordinary JSON output to keep machine results compact.

### `explain <rule|file>`

Returns the complete policy definition and remediation for a rule ID. When given a file path
instead, returns provenance information: which pack generated it, its ownership mode, and
current state.

## Mutating commands

### `init` and `adopt`

Create the project manifest and apply only a conflict-free initial plan.

### `apply`

Applies the current plan. `--force` allows replacement of conflicting managed files and must be
reviewed carefully.

### `upgrade`

Previews the files implied by the currently selected pack versions. Add `--apply` to write.
Changing selected versions remains an explicit manifest edit.

### `migrate`

Previews a supported manifest migration. Add `--apply` to write it. Validation never migrates
implicitly.

## Execution

### `run <capability>`

Runs one component capability without an implicit shell.

### `ci`

For every component, runs the available capabilities in this order:

```text
setup → format → lint → typecheck → test → build
```

Absent capabilities are skipped. A failing command stops the sequence.

## Output

Use `--json` for automation. Stable exit classes are documented in
`spec/v1/diagnostics.md`.
