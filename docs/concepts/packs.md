# Packs

## Purpose

A pack is a versioned bundle of repository opinions. The core remains small because stack,
archetype, security, and distribution concerns are modeled as separate packs.

## Categories

- `core`
- `language/*`
- `archetype/*`
- `capability/*`
- `governance/*`

## Resolution

Pack references are exact. Dependencies form a directed acyclic graph. Resolution fails on:

- missing pack;
- ID or version mismatch;
- unsupported specification;
- dependency cycle;
- declared conflict;
- two packs claiming the same target file.

There is no “last pack wins” behavior for file collisions.

## Authoring guidance

1. Start from a repeated real need.
2. Keep the pack declarative.
3. Use conservative defaults that can be overridden.
4. Declare every produced capability.
5. Choose ownership per file deliberately.
6. Add fixtures and idempotence tests.
7. Version breaking changes as a new pack major.

Do not put application libraries, credentials, cloud resources, or arbitrary setup hooks in a
pack.
