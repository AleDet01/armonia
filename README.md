# Armonìa

> A language-independent control plane for coherent, evolvable, and AI-ready repositories.

Armonìa is not an application framework and does not impose a source layout. It defines a
versioned repository contract, semantic capabilities, composable packs, progressive policy,
safe generated-file ownership, reusable GitHub automation, and a portable entry point for
coding agents.

The brand uses **Armonìa**; technical identifiers use the ASCII slug `armonia`.

## Status

This repository contains the **1.0.0 release candidate** and its reference implementation.
The manifest API is `armonia/v1`. Pack execution is deliberately declarative and side-effect
free.

## Why it exists

When a portfolio grows to dozens or hundreds of repositories, copying templates is not enough.
Templates initialize files but do not provide:

- controlled upgrades;
- repository-wide semantic commands;
- drift detection;
- explicit ownership of generated files;
- policy exceptions with expiry;
- a fleet catalog;
- portable coding-agent context;
- compatibility guarantees.

Armonìa supplies those missing contracts while leaving each project free to choose its
language, framework, package manager, source layout, and deployment target.

## Quick start

Prerequisite: Node.js 24 or newer. The CLI has no runtime dependencies.

```sh
node src/cli.ts init ../my-project \
  --name "My Project" \
  --language python \
  --archetype service \
  --profile baseline
```

For an existing repository:

```sh
node src/cli.ts adopt ../existing-project
```

Review and apply desired-state changes:

```sh
armonia inspect
armonia validate
armonia plan
armonia apply
armonia doctor
```

Run language-independent capabilities:

```sh
armonia run setup
armonia run lint
armonia run test
armonia run build
```

## Visual dashboard

Armonìa includes a dependency-free local dashboard built on the same engine as the CLI:

```sh
armonia ui
```

It opens a browser on a loopback-only server and explains project health, pending changes,
conflicts, diagnostics, packs, and components. Safe generated-file changes can be reviewed and
applied from the dashboard; conflicting managed files remain blocked.

### One-click local launch

After downloading or cloning the repository, use the platform launcher in the project root:

- Windows: double-click `Start Armonia.cmd`.
- macOS: double-click `Start Armonia.command`.
- Linux: run or double-click `start-armonia.sh` from a file manager that allows executable scripts.

The launcher checks for Node.js 24+, starts the local dashboard, and opens the browser.
No application framework or runtime dependency is installed.

## Repository contract

Every governed repository owns:

```text
.armonia/
├── project.yaml   # desired state
└── lock.yaml      # resolved packs and managed-file hashes
```

`project.yaml` describes identity, lifecycle, profile, packs, components, and semantic
capabilities. `lock.yaml` makes resolution reproducible and prevents Armonìa from silently
overwriting local edits.

## Architecture

```text
specification
    ↓
CLI → pack resolver → plan → explicit apply
    ↓          ↓                ↓
 policy     templates       lockfile
    ↓
GitHub + coding-agent adapters + derived fleet registry
```

See:

- [Architecture overview](docs/architecture/overview.md)
- [Project contract](docs/concepts/project-contract.md)
- [Getting started](docs/guides/getting-started.md)
- [CLI reference](docs/reference/cli.md)
- [Compatibility policy](docs/governance/compatibility.md)
- [Roadmap](ROADMAP.md)

## Safety model

- `plan` is read-only.
- `apply` refuses managed-file conflicts.
- `apply --force` is explicit and reviewable.
- scaffold files are never overwritten.
- removed packs do not trigger automatic deletion.
- pack v1 content is declarative; it cannot execute hooks.
- policy exceptions require a reason, owner, and expiry date.

## Language support

The generic adapter supports any toolchain through explicit capability commands. Built-in
reference packs cover Python, TypeScript, Rust, Go, .NET, and Java. A polyglot monorepo is
represented as multiple components.

## Development

```sh
pnpm install --frozen-lockfile
pnpm verify
```

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
