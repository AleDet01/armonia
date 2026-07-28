# Armonìa v1 contract

Armonìa governs repository metadata, capabilities, policy, generated-file ownership, and
evolution. It does not define a source-code layout, application framework, package manager,
or deployment platform.

## Public contracts

The following surfaces are stable for the lifetime of `armonia/v1`:

- project, pack, policy, and lock schemas;
- lifecycle vocabulary;
- capability semantics;
- policy identifiers;
- CLI exit-code classes and JSON result shape;
- reusable-workflow inputs;
- ownership behavior for generated files.

Additive optional fields may be introduced without changing `apiVersion`. Removing a field,
changing its meaning, or making an optional field mandatory requires a new API version or an
explicit migration.

## Sources of truth

| Concern | Source |
|---|---|
| Desired repository state | `.armonia/project.yaml` |
| Resolved packs and managed-file hashes | `.armonia/lock.yaml` |
| Operational work | GitHub Issues and Projects |
| Architecture decisions | versioned ADRs |
| Runtime health | derived catalog data |

Armonìa never writes operational health back into the project manifest.
