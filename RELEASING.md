# Releasing Armonia

This checklist is the release gate for the public repository and optional npm
package. Do not tag or publish when any required item is unknown.

## Before the release candidate

1. Start from a clean working tree and a supported Node.js 22 environment.
2. Review `git diff --check` and `git status --ignored` for accidental artifacts.
3. Scan the staged content with an independent secret scanner and inspect all findings manually.
4. Confirm that `.env`, credentials, local databases, generated reports, caches, and hosting/account configuration are not staged.
5. Review generated portfolio snapshots: they may disclose repository names, relative paths, scores, and metadata.

## Verification

```bash
npm ci --ignore-scripts
npm run check
npm pack --dry-run
```

Run the checks again in GitHub Actions from a clean checkout. Inspect the
package file list from `npm pack --dry-run`; only the CLI, core engine, schema,
README, and license should be included.

## GitHub repository settings

After creating the remote repository:

1. Protect `main`: require pull requests and the `ci / verify` check before merging.
2. Enable Dependabot alerts and version updates.
3. Enable private vulnerability reporting and verify the instructions in `SECURITY.md`.
4. Enable secret-scanning push protection where the GitHub plan supports it.
5. Add the actual repository URL to `package.json` before any npm publication.
6. Create a GitHub Release from an annotated, signed tag when signing is available.

## npm publication

This repository is public-source ready; npm publication is a separate decision.
Choose and verify an available package name, set `repository`, `bugs`, and
`homepage` metadata, then run `npm publish --dry-run` before a real publish.

Never paste tokens, credentials, or private report output into a release note.
