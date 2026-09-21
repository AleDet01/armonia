# Contributing to Armonia

Thank you for helping make repository maintenance more trustworthy.

## Before opening a change

1. Search existing issues and rule documentation.
2. Keep the core deterministic and offline. A core rule must not require an
   account, network call, model, or ecosystem-specific daemon.
3. For a new rule, provide:
   - a minimal repository fixture that should fail;
   - a legitimate counterexample that must not fail;
   - evidence from at least two sources when the rule claims contradiction;
   - wording that explains impact without asserting an unknown source of truth.

## Local workflow

Prerequisite: Node.js `>=22.13.0`.

```bash
npm ci --ignore-scripts
npm run check
```

Keep production runtime dependencies out of `src/core` unless a proposal proves
that Node built-ins cannot implement the behavior safely. Generated portfolio
metrics must come from `npm run portfolio`; do not hand-edit scores.

## Pull requests

Use a focused title and explain the repository relationship the change makes
verifiable. Include tests and documentation in the same pull request. Visual
changes should preserve keyboard access, responsive behavior, contrast, and
reduced-motion support.

By contributing, you agree that your contribution is licensed under the MIT
License and follows the project [Code of Conduct](CODE_OF_CONDUCT.md).
