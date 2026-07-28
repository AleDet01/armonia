# AI integration

Armonìa uses `AGENTS.md` as the portable, human-readable source of repository instructions.
Tool-specific files are thin adapters and must not become independent knowledge stores.

Context is layered:

1. Armonìa safety invariants;
2. organization guidance;
3. project manifest and root `AGENTS.md`;
4. component architecture;
5. task-specific material.

Adapters should point to canonical sources, remain short, and be evaluated against the cases in
`evals/`.
