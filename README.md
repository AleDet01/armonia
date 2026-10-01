<p align="center">
  <img src="public/armonia-mark.svg" alt="Armonia" width="68" height="68" />
</p>

<h1 align="center">Armonia</h1>

<p align="center">
  <strong>Find repository drift before it ships.</strong><br />
  Local-first consistency checks for the promises scattered across a software repository.
</p>

<p align="center">
  <a href="https://github.com/AleDet01/Armonia/actions/workflows/ci.yml"><img src="https://github.com/AleDet01/Armonia/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-161b22?style=flat-square" alt="MIT license" /></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A522.13-161b22?style=flat-square&logo=nodedotjs" alt="Node.js 22.13 or newer" />
</p>

<p align="center">
  <a href="https://AleDet01.github.io/Armonia/">Live demo</a> ·
  <a href="docs/rules.md">Rules</a> ·
  <a href="docs/privacy.md">Privacy</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <img src="public/readme-preview.svg" alt="Armonia interface preview" width="100%" />
</p>

Armonia does not choose which file is right. It reports the declarations that
disagree, their exact source locations, and a stable finding for code review or
CI. A valid README, workflow, container and manifest can still contradict each
other; Armonia checks the relationships between them.

## What it checks

| Surface | Examples |
| --- | --- |
| Documentation | missing README, broken relative links, commands that do not exist |
| Runtime | Node major and local-port drift across docs, CI, manifests and Docker |
| Delivery | invalid manifests, missing entrypoints, conflicting lockfiles, absent CI or test scripts |
| Environment | undocumented or stale example variables |
| Security posture | mutable Action refs, implicit workflow permissions, floating images, credential-shaped values |
| Community readiness | license, contribution guide, security policy and code of conduct |

## Quick start

Requires Node.js 22.13 or newer.
The CLI uses Node built-ins only; installed development dependencies power the
website, build and verification tools, not the scan engine.

```bash
git clone https://github.com/AleDet01/Armonia.git
cd Armonia
npm ci --ignore-scripts
node bin/armonia.mjs scan .
```

Use `--fail-on never` for an exploratory local run. By default, the CLI exits
with code `1` when it finds an error or critical issue. Configuration can set
`failOn`; an explicit `--fail-on` takes precedence. Exit code `2` indicates an
invalid invocation, configuration or unreadable scan root.

```bash
# A portable report for review or automation
node bin/armonia.mjs scan . --format json --output artifacts/armonia.json

# Native findings for compatible code-scanning tools
node bin/armonia.mjs scan . --format sarif --output artifacts/armonia.sarif
```

## Browser demo

Run `npm run dev`, then choose a repository folder in a Chromium-based browser.
The demo reads supported text files locally, never uploads them, and does not
execute repository code. Use the CLI for the complete, repeatable check in CI.
The preview implements only README/license, manifest validity, simple Node/port
drift, environment and credential-shape checks. Its score is a preview heuristic,
not the CLI's category-based score. The README illustration is a static preview;
GitHub does not execute the site's interactive UI or animations inside a README.

## Configuration and coverage

Create a configuration with `node bin/armonia.mjs init .`. Supported fields are
defined in [the shipped schema](schema/armonia.schema.json); invalid values and
unknown fields fail before scanning. `exclude` accepts repository-relative
`*`, `**` and `?` patterns; `rules.disable` makes exceptions explicit.

The CLI defaults to 10,000 files and 512,000 bytes per text file. Both scanners
retain at most 64 MiB of text and read at most eight files concurrently. The
browser additionally limits selection to 3,000 supported text candidates.
Skipped candidates are counted and produce `scan/incomplete`; traversal
truncation produces `scan/file-limit`. A partial scan is not a clean bill of
health. Generated `.armonia` reports are excluded from subsequent scans.

Collectors are conservative text heuristics, not full parsers. Node checks
compare simple major-level requirements in the nearest package scope; complex
ranges and dynamic workflow values are not inferred. Port drift is reported
only for one distinct documented port versus one distinct container port.
Relative-link spelling is case-sensitive for portability to Linux. Git ignore
rules are not automatically applied; use explicit exclusions where needed.

## Privacy and scope

The scanner makes no network requests, does not follow symbolic links, bounds
file traversal and text size, and redacts recognized credential-shaped values
in every report field. Detection covers supported text files, not only source.
Reports can still contain relative paths, line numbers and project metadata:
review them before sharing.

Armonia is an early `0.x` project. It surfaces evidence; maintainers decide
which declaration to change. Read the full [threat model](docs/privacy.md) and
[rule catalog](docs/rules.md) before enforcing it in production.

## Deploy and contribute

The demo is a static GitHub Pages export. Once the remote and Pages are enabled,
each push to `main` runs lint, type checks and tests, audits dependencies, and
publishes the verified `dist/client` artifact. The
workflow uses least-privilege permissions and pins third-party Actions to
immutable commits; Dependabot maintains dependencies and Actions weekly.

```bash
npm run check
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md),
[RELEASING.md](RELEASING.md), and [CHANGELOG.md](CHANGELOG.md) for the project
contract and release process.

## License

[MIT](LICENSE) © Armonia contributors.
