# Compatibility and deprecation

## Stable v1 surfaces

- persisted schemas;
- lifecycle and capability semantics;
- policy identifiers;
- ownership behavior;
- CLI exit classes and documented JSON fields;
- reusable-workflow input names.

## Compatible changes

- optional schema fields;
- new opt-in packs;
- new policy rules not selected by an existing stable profile;
- clearer diagnostic messages;
- safe bug fixes that restore documented behavior.

## Incompatible changes

- removing or reinterpreting a field;
- changing a stable rule ID;
- making an optional field mandatory;
- silently adopting or deleting files;
- changing capability meaning;
- altering a reusable-workflow input contract.

Incompatible persisted changes require a new API version and explicit migration. Pack breaking
changes require a new pack major.

## Deprecation

A deprecation includes rationale, replacement, detection, migration, rollback, and a removal
window. Security issues can shorten the window but still require clear release notes.
