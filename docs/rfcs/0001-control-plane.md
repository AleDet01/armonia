# RFC 0001: Repository control plane

- Status: accepted
- Date: 2026-07-28

## Problem

One-shot templates cannot keep a heterogeneous repository fleet coherent after creation.
A runtime framework would couple unrelated products to a central implementation.

## Proposal

Adopt a portable desired-state contract, exact pack resolution, safe materialization, semantic
capabilities, progressive policy, and tool-specific adapters.

## Rejected alternatives

- universal source layout: conflicts with ecosystem conventions;
- Git submodules for shared governance: poor contributor and automation ergonomics;
- mutable central workflow references: uncontrolled blast radius;
- executable pack hooks in v1: excessive supply-chain risk;
- manually maintained fleet status: inevitable duplication and drift.

## Consequences

Armonìa owns additional specification and migration work, but consumers remain autonomous,
upgrades are reviewable, and unsupported languages can use the generic adapter.
