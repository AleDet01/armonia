# ADR-0001: Contract over template

- Status: accepted
- Date: 2026-07-28

## Context

Projects use different languages, layouts, release strategies, and deployment targets. A single
repository template cannot evolve those projects safely.

## Decision

The stable core is a manifest and capability contract. Templates are pack-owned implementation
details with explicit ownership.

## Consequences

Every project has a predictable control surface without inheriting a universal source layout.
Armonìa must maintain schemas, resolution, and migrations.
