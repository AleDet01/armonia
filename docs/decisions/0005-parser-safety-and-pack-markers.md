# ADR-0005: Parser boundary enforcement and pack-driven language markers

- Status: accepted
- Date: 2026-07-29
- Owners: AleDet01

## Context

The custom YAML parser had no size limits, depth limits, or explicit rejection of dangerous
YAML constructs (anchors, aliases, tags, directives). While the parser did not implement
these features, malformed input could produce confusing errors rather than clear rejection.

Additionally, language detection was hardcoded in `detect.ts` with no way for new language
packs to contribute their own filesystem markers.

## Decision

1. **Parser boundaries**: the YAML parser now enforces a maximum document size (1 MB),
   maximum nesting depth (64 levels), and explicitly rejects YAML anchors, aliases, tags,
   and directives with clear error messages explaining they are not supported.

2. **Pack-driven markers**: language packs can declare a `markers` array in their metadata.
   The detection system reads these markers at runtime, falling back to built-in defaults
   only when a pack does not declare its own. This allows community packs (e.g.,
   `language/kotlin`) to be discovered without modifying the core.

3. **Project context**: a `ProjectContext` class provides lazy-loaded, memoized access to
   manifest, packs, and lock — preventing redundant filesystem reads across commands.

4. **Operation result type**: an `OperationResult<T>` type enables future accumulation of
   partial results instead of throwing on first error.

## Consequences

- Maliciously crafted YAML cannot cause unbounded memory or CPU usage.
- Unsupported YAML features produce clear, actionable errors instead of silent corruption.
- New language packs are automatically discoverable without core changes.
- Commands can share loaded project state without re-reading files.
- The foundation exists for progressive error accumulation in future versions.
