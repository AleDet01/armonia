# Conformance examples

These manifests demonstrate contract composition. They are fixtures, not production templates
to copy blindly.

- `minimal`: any language through explicit commands;
- `python-service`: service with uv-based commands;
- `typescript-library`: pnpm library;
- `rust-cli`: Cargo CLI;
- `polyglot-monorepo`: Go backend plus TypeScript frontend.

Every example must validate against `project.schema.json` and resolve its pack graph.
