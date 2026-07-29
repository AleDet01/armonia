# AGENTS.md

## Purpose

This repository is the reference implementation and specification of Armonìa. Preserve the
separation between the language-independent public contract and the TypeScript/Node reference
CLI.

## Repository map

- `spec/v1/`: stable schemas and public semantics.
- `src/`: zero-runtime-dependency reference CLI.
- `packs/`: declarative, exactly versioned pack catalog.
- `policies/`: atomic rules and enforcement profiles.
- `.github/workflows/`: local and reusable GitHub automation.
- `integrations/`: organization-level GitHub assets.
- `ai/`: portable agent context, adapters, safety guidance, and evaluations.
- `migrations/`: explicit compatibility transformations.
- `examples/`: conformance examples, not hidden test fixtures.
- `test/`: automated safety and behavior tests.

## Canonical commands

- `node --experimental-strip-types src/cli.ts version`
- `node --experimental-strip-types --test test/core.test.ts test/cli.test.ts test/security.test.ts test/yaml.test.ts`
- `node --experimental-strip-types src/cli.ts validate .`
- `node --experimental-strip-types src/cli.ts status .`
- `node --experimental-strip-types src/cli.ts diff .`
- `node --experimental-strip-types src/cli.ts doctor .`
- `pnpm verify`

## Architectural invariants

- Do not introduce a language-specific assumption into `spec/v1`.
- Do not execute arbitrary code from packs.
- Do not overwrite a managed file whose current hash differs from the lockfile.
- Do not delete orphaned managed files automatically.
- Do not make GitHub a dependency of the core manifest model.
- Keep lifecycle, maturity, criticality, and health as separate dimensions.
- Treat schema, policy IDs, CLI exit classes, workflow inputs, and capability semantics as
  public API.

## Editing rules

- Update schemas, examples, documentation, and tests together.
- Record breaking or cross-cutting decisions in `docs/decisions/`.
- Add a migration before changing persisted semantics.
- Keep tool-specific AI files generated from portable sources.
- Never bypass TLS verification or add secrets to examples.

## Definition of done

`pnpm verify` passes, the generated-state plan is conflict-free and idempotent, relevant
documentation is updated, and no stable contract is changed without compatibility analysis.
