# Contributing

Contributions are welcome when they preserve Armonìa's thin-core, capability-oriented model.

## Before proposing a core abstraction

Provide evidence from at least three distinct repository use cases. A feature used by one
ecosystem normally belongs in a language, archetype, capability, or governance pack.

## Development

1. Use Node.js 24 or newer and pnpm 11.
2. Run `pnpm install --frozen-lockfile`.
3. Make a focused change.
4. Update schemas, fixtures, documentation, and migrations together.
5. Run `pnpm verify`.
6. Complete the pull-request risk and rollback section.

## Compatibility

Treat schema fields, policy IDs, capability semantics, CLI exit classes, JSON output, workflow
inputs, and ownership behavior as public API. Open an RFC before a breaking or cross-cutting
change.

## Commit and pull-request style

Conventional Commit titles are encouraged for Armonìa itself but are not a universal platform
requirement. Pull requests should describe the problem, evidence, alternatives, compatibility
impact, migration, and rollback.

## Security

Do not disclose vulnerabilities in a public issue. Follow `SECURITY.md`.
