# Governance

## Roles

- **Maintainers** merge changes, publish releases, and steward compatibility.
- **Pack owners** maintain a bounded pack and its conformance fixtures.
- **Contributors** propose and implement changes through pull requests.

Until additional maintainers are appointed, the repository owner performs all roles.

## Decision process

- Local, compatible implementation changes use ordinary pull requests.
- Cross-cutting or public-contract changes require an RFC.
- Accepted architecture decisions are recorded as ADRs.
- Breaking changes require a migration, rollback plan, and major-version review.
- Security fixes may use a private process and receive retrospective documentation.

Maintainers seek evidence-based consensus. When consensus is not possible, the designated
maintainer records the decision and rationale.

## Stability

Experimental features require explicit opt-in. Preview features receive migration guidance.
Stable surfaces follow `docs/governance/compatibility.md`.

## Release authority

A release requires green conformance checks, a reviewed changelog, immutable version tags, and
verification that generated-state changes are intentional.
