# ADR-0002: Declarative packs in v1

- Status: accepted
- Date: 2026-07-28

## Context

Executable plugins are flexible but make repository adoption equivalent to running third-party
code with developer or CI permissions.

## Decision

Pack v1 can declare metadata, dependencies, conflicts, capabilities, files, and policy. It
cannot execute hooks.

## Consequences

The attack surface and compatibility model are smaller. Unusual integrations must use explicit
project scripts or future sandboxed extension research.
