# ADR-0003: Self-contained Node reference CLI

- Status: accepted
- Date: 2026-07-28

## Context

The CLI must validate and operate when package registries are unavailable or their TLS trust is
misconfigured. Runtime dependency installation would weaken bootstrap reliability.

## Decision

The release-candidate CLI targets Node.js 24, uses erasable TypeScript directly, and includes a
bounded YAML parser and JSON Schema subset covering Armonìa's published schemas.

## Consequences

Bootstrap has no npm dependency graph or compilation step. Node 24 is a firm prerequisite, and
every new schema keyword must be supported by the internal validator or rejected during review.
