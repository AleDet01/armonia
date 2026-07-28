# Project contract

## Desired state

`.armonia/project.yaml` answers:

- what repository this is;
- who owns it;
- where it is in its lifecycle;
- which governance profile applies;
- which packs compose its defaults;
- which components exist;
- which semantic operations each component supports;
- which policy exceptions are temporary and why.

The manifest does not contain live health, CI results, issue counts, or vulnerability counts.
Those are derived observations.

## Resolved state

`.armonia/lock.yaml` records:

- exact pack IDs and versions;
- the CLI version that created the resolution;
- every materialized managed/scaffold file;
- source pack;
- ownership mode;
- desired SHA-256 hash.

The lockfile is committed. It is evidence and an overwrite guard, not a cache.

## Components

A component is a governed unit within a repository:

```yaml
components:
  - id: api
    path: services/api
    languages: [python]
    capabilities:
      test:
        argv: [uv, run, pytest]
```

Repositories with a single application use one `root` component. Polyglot monorepos declare
multiple components.

## Capabilities

Capabilities separate semantics from implementation:

```text
test  ──▶ pytest
test  ──▶ npm test
test  ──▶ cargo test
test  ──▶ go test ./...
```

Commands use argument arrays and do not receive an implicit shell. Complex logic belongs in a
reviewable project script.

## File ownership

- `managed`: update only when the current hash matches the previous lock.
- `scaffold`: create once; never overwrite.
- `reference`: consume remotely; do not materialize.

An existing unmanaged target never becomes managed silently unless it already matches the
desired content.

## Source-of-truth matrix

| Concern | Authority |
|---|---|
| Identity and lifecycle | project manifest |
| Generated state | lockfile |
| Work tracking | GitHub Issues/Projects |
| Milestone commitment | GitHub Milestones |
| Architecture rationale | ADRs |
| Release history | immutable tags and releases |
| Portfolio health | derived registry output |
