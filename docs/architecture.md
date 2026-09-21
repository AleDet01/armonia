# Architecture

Armonia separates observation from judgment so that adding an output format or
portfolio does not change what the scanner believes.

## Pipeline

1. **Bounded discovery** walks regular files without following symbolic links.
2. **Collectors** extract source-located claims from text and structured files.
3. **Checks** reconcile claims with a shared intent and emit immutable findings.
4. **Scoring** applies capped penalties per rule so repository size cannot
   dominate a score through repeated instances of one problem.
5. **Reporters** render the same report as terminal text, JSON, or SARIF.
6. **Portfolio aggregation** retains only scores, counts, metadata, and declared
   relationships. It does not publish source evidence.

## Trust boundaries

Repository content is untrusted and is never executed. JSON parsing is limited
to known configuration and manifest surfaces. Text files are bounded by
`maxFileBytes`; traversal is bounded by `maxFiles`. Symbolic links and common
dependency/build directories are skipped.

The current collectors use intentionally conservative patterns. A missing fact
should reduce coverage, not produce a confident contradiction. Rules that need
language-aware parsing can add an optional adapter later, but deterministic
behavior and evidence locations remain part of the contract.

## Stable identities

A finding fingerprint hashes the rule, message, and normalized evidence
locations. It is independent of output order and absolute checkout path. This
allows review systems to recognize a recurring contradiction without storing
the source itself.

## Report compatibility

`schemaVersion` versions the JSON contract. Additive fields may appear within a
schema version. Removing, renaming, or changing the meaning of a field requires
the next schema version.
