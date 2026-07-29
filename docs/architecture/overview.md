# Architecture overview

## System boundary

Armonìa is a repository control plane. Consumer repositories remain independently buildable and
do not link Armonìa into their runtime products.

```text
Control plane                         Consumer repository
────────────────────────────          ──────────────────────────────
specification                         .armonia/project.yaml
pack catalog              ───────▶    .armonia/lock.yaml
policy catalog                        generated/scaffold files
reference CLI                         local source and toolchain
reusable workflows                    thin caller workflow

                                       │
                                       └────▶ derived fleet catalog
```

## Layers

### Specification

The stable protocol defines projects, packs, policy, lockfiles, lifecycle, capabilities,
diagnostics, and compatibility. It contains no Python, TypeScript, Rust, Go, .NET, or Java
assumption.

### Reference engine

The CLI parses desired state, validates schemas, resolves a directed acyclic pack graph,
calculates a plan, detects ownership conflicts, applies safe changes, and executes declared
capabilities.

### Pack catalog

Packs provide declarative defaults, files, and policy selection. They cannot execute hooks in
v1. Technology-specific behavior stays at this layer.

### Policy

Atomic rules describe intent and remediation. Profiles select severity. Exceptions are local,
owned, justified, and expiring.

### Integrations

GitHub workflows, ruleset examples, organization properties, issue forms, and coding-agent
adapters project the portable contract into specific tools.

### Registry

The registry discovers repositories and derives fleet state. It is not a second desired-state
database.

## Data flow

1. The project manifest declares packs and components.
2. The resolver loads exact pack versions and checks requirements, cycles, and conflicts.
3. The planner renders applicable files and compares them with the filesystem and lockfile.
4. Conflicting managed changes stop the operation.
5. Explicit apply writes atomically and records new hashes.
6. Policy validation evaluates the resulting repository, not only the manifest.
7. CI calls the same CLI and capability contract used locally.

## Trust boundaries

- project manifests are trusted repository configuration;
- remote repositories and refs are untrusted until explicitly pinned;
- pack templates are data, not executable code;
- pack template sources are symlink-resolved and boundary-checked;
- manifest values are validated against template marker injection;
- capability commands are project-owned executable configuration;
- pull-request workflows use read-only permissions by default;
- release and deployment are isolated privileged paths;
- agent instructions cannot override repository security policy.

## Failure containment

Consumer repositories pin immutable Armonìa refs. A broken new release therefore affects only
repositories that explicitly upgrade. Removed packs leave files in place and emit a warning;
automatic deletion is intentionally excluded.
