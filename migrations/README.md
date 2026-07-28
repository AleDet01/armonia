# Migrations

Migrations are explicit transformations of persisted contracts. `armonia migrate` previews by
default and writes only with `--apply`.

Each migration requires:

- source and target versions;
- fixture of the old form;
- expected result;
- validation of the result;
- rollback guidance;
- release notes.

Validation never performs migration.
