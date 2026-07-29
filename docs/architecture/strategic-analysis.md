# Armonìa — Strategic Analysis and Improvement Plan

Date: 2026-07-29

## Executive Summary

Armonìa is a **language-independent repository control plane** that transforms repository
governance from a one-shot template problem into a continuous, verifiable protocol. The 1.0
release candidate is architecturally sound, with a minimal core (~1000 lines of TypeScript,
zero runtime dependencies), stable JSON Schema specifications, 21 declarative packs, 10
atomic policy rules, reusable GitHub workflows, and a portable coding-agent context system.

This document records the findings from a comprehensive analysis and the rationale for
implemented improvements.

## Product Definition

**What Armonìa is**: a protocol and tool that makes repositories self-describing,
governable, upgradeable, and verifiable — without becoming part of their runtime.

**What Armonìa is not**: an application framework, a package manager, a CI system, a
one-time template engine, or a centralized state database.

**Value proposition**: Armonìa transforms heterogeneous repositories into a governable
system with stable contracts, progressive policy, controlled upgrades, and semantic
capabilities — without imposing language, layout, or runtime dependencies.

**Primary users**: platform engineers, engineering managers, DevSecOps leads with 20–1000+
repositories.

**Wedge (first adoption use-case)**: a team with 10–50 repositories wanting to standardize
CI, configuration, and quality gates without losing control after initial scaffolding.

**Long-term competitive advantage**: the combination of explicit file ownership + progressive
policy + semantic capabilities + lockfile-as-guard = a "verifiable social contract" for
repositories that no current tool provides in composite form.

## Verified Invariants

| Invariant | Implementation |
|---|---|
| Packs cannot execute code | ADR-0002; resolver only reads metadata |
| Managed files require hash match for update | planner.ts conflict detection |
| No automatic file deletion | Orphan detection emits warning only |
| Exact version resolution | resolver.ts ID + version strict match |
| Cycle detection | Visiting set in resolver |
| File collision detection | targets Map in planner |
| Atomic writes | fs.ts rename from temp file |
| Path traversal blocked | safePath + symlink resolution |
| Template injection blocked | Post-render marker detection |
| Exceptions expire | policy.ts date comparison |

## Key Problems Addressed

### Security (implemented)

1. **Template injection** — manifest values containing `<<armonia:...>>` patterns could
   produce dangerous content in workflow YAML. Now rejected with ARM022.

2. **Symlink traversal** — pack sources via symlinks could escape the boundary check. Now
   resolved with `realpath` before boundary validation.

### Developer Experience (implemented)

3. **`status` command** — provides a one-glance health summary instead of requiring users to
   run multiple commands.

4. **Plan summary** — `plan` output now includes a count summary (create/update/unchanged/
   skip/conflict) for quick assessment.

### Provenance (implemented)

5. **`generatedAt` in lockfile** — ISO timestamp for auditability and upgrade diagnostics.

## Ecosystem Comparison

| Tool | Overlap | Armonìa differentiator |
|---|---|---|
| Cookiecutter/Copier | Initial templates | Manages entire file lifecycle |
| Backstage Templates | Scaffolding + catalog | No central service required |
| Renovate/Dependabot | Automated updates | Governs config and policy, not app deps |
| OPA/Conftest | Policy-as-code | Integrates policy with file ownership |
| GitHub Org Rulesets | Branch governance | Adds content governance |
| Nix/Bazel | Deterministic builds | Orthogonal control plane |
| Crossplane | Desired-state reconciliation | For repositories, not cloud infra |

## Architecture Confirmation

The current architecture is fundamentally correct. No restructuring is needed. The
improvements are additive:

```
specification (unchanged)
    ↓
CLI → resolver → planner → apply → lockfile
 │         │          │                │
 │    [symlink       [template       [+generatedAt]
 │     resolve]       injection
 │                    guard]
 ↓
+ status command (new read-only surface)
```

## Roadmap Assessment

### Completed in this iteration

- Template injection protection (ARM022)
- Symlink boundary resolution
- `status` command with JSON and human output
- `plan` summary counts
- `generatedAt` provenance field
- Security-specific test suite
- ADR-0004 documenting decisions
- Documentation updates (CLI reference, architecture overview)

### Recommended for 1.0 GA (remaining)

- Cross-platform CI verification (needs Node 24 environment)
- Fix the self-referencing lock.yaml (run `armonia apply` in Node 24)
- Review policy `distribution-pinned` edge case (empty ref)

### Recommended for 1.1

- SARIF diagnostic output
- Explanation graph (trace any file back to its pack + manifest source)
- `armonia diff` for visual comparison
- Fleet inventory via GitHub API (read-only)
- Structured auto-remediation for simple policy fixes

### Recommended for 1.2+

- Batch upgrade PRs across fleet
- Conformance levels in registry catalog
- Signed pack bundles
- Remote pack sources (beyond built-in)

## What Not to Build

- Executable pack hooks (already rejected in ADR-0002)
- Central database of repository state (registry is derived, not authoritative)
- AI-powered policy decisions (policy must be deterministic)
- Universal source layout enforcement
- Package manager or build system features
- Vendor-specific lock-in
- Complex template language (current substitution is intentionally minimal)

## Open Questions

1. Should `generatedAt` comparison be excluded from lockfile equality checks to avoid
   unnecessary churn? (Current: included in comparison, will cause a lock update on every
   apply even if nothing else changed)

2. Should remote pack sources be URL-based or Git-ref-based? (Affects security model
   significantly)

3. What is the governance model for community-contributed packs? (Pack catalog curation)

## Files Modified

| File | Change |
|---|---|
| `src/template.ts` | Template injection guard (ARM022) |
| `src/planner.ts` | Symlink-safe source path resolution |
| `src/apply.ts` | `generatedAt` timestamp in lock |
| `src/types.ts` | `generatedAt` optional field |
| `src/status.ts` | New status command implementation |
| `src/cli.ts` | Wire status command, plan summary |
| `src/index.ts` | Export status module |
| `spec/v1/schemas/lock.schema.json` | `generatedAt` field |
| `test/security.test.ts` | Security test suite |
| `docs/decisions/0004-*` | ADR for these changes |
| `docs/reference/cli.md` | Document status command |
| `docs/architecture/overview.md` | Updated trust boundaries |
| `.armonia/lock.yaml` | Added generatedAt field |
| `.armonia/project.yaml` | Fixed lint placeholder |
| `AGENTS.md` | Updated canonical commands |
| `package.json` | Include security tests |
