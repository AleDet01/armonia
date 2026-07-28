# Roadmap

The roadmap separates contractual commitments from experiments. Stable items preserve
`armonia/v1`; preview items can change behind explicit opt-in.

## 1.0 release candidate

- stable project, pack, policy, and lock schemas;
- zero-runtime-dependency Node 24 reference CLI;
- safe `init`, `adopt`, `plan`, `apply`, `validate`, `doctor`, `run`, `ci`, and migration flows;
- core, generic, Python, TypeScript, Rust, Go, .NET, and Java packs;
- experimental, baseline, production, and high-assurance policy profiles;
- reusable GitHub validation, CI, security, and release workflows;
- portable `AGENTS.md` model and tool adapters;
- conformance examples and migration fixtures.

## 1.0 publication gates

- publish the canonical GitHub repository;
- replace repository-owner placeholders in issue and organization assets;
- record an immutable distribution SHA in `.armonia/project.yaml`;
- run the workflow suite on Linux, Windows, and macOS;
- perform a security review focused on path traversal and command boundaries;
- exercise adoption against at least three real repositories;
- publish migration and rollback notes;
- remove the temporary distribution policy exception.

## 1.1 candidates

- generated SARIF output;
- fleet inventory command using the GitHub API;
- batched upgrade pull requests;
- structured YAML/JSON merge ownership;
- change-aware component CI;
- signed release bundles and SBOM generation;
- adapter conformance tests for major coding agents.

## Future exploration

- sandboxed executable extensions only if declarative packs prove insufficient;
- GitHub App for large-fleet synchronization;
- static fleet portal generated from registry output;
- additional hosting providers through adapters;
- policy-engine interoperability.

These items are not promises. They require evidence from real project use.
