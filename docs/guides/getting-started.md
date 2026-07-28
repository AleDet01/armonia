# Getting started

## Requirements

- Node.js 24 or newer;
- Git;
- the toolchains required by the selected component capability commands.

Armonìa itself has no runtime package dependencies.

## Initialize a project

```sh
armonia init ./my-project \
  --name "My Project" \
  --id github.com/example/my-project \
  --owner maintainer \
  --language python \
  --archetype service \
  --profile baseline
```

The command writes a manifest, computes a plan, applies conflict-free files, and writes a
lockfile.

## Configure distribution

After publishing Armonìa in an organization, pin its repository and immutable commit:

```yaml
spec:
  distribution:
    repository: example/armonia
    ref: 0123456789abcdef0123456789abcdef01234567
```

`armonia apply` then materializes the caller workflow.

## Review

```sh
armonia inspect
armonia validate
armonia plan
armonia doctor
```

Warnings represent improvement work; errors block compliance.

## Add project-specific commands

Override pack defaults in the component:

```yaml
capabilities:
  setup:
    argv: [uv, sync, --frozen]
  test:
    argv: [uv, run, pytest, -q]
```

## Commit

Commit both `.armonia/project.yaml` and `.armonia/lock.yaml`, plus all reviewed generated and
scaffold files.
