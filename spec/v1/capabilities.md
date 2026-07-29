# Capability vocabulary

A capability is a semantic operation that a component can perform. Commands are represented
as argument arrays and run without an implicit shell.

## Core capability names

| Capability | Meaning |
|---|---|
| `setup` | Materialize the declared development dependencies |
| `format` | Apply deterministic formatting |
| `lint` | Perform static style and correctness checks |
| `typecheck` | Perform static type analysis |
| `test` | Execute the component's automated test suite |
| `build` | Produce build outputs without publishing them |
| `package` | Produce distributable artifacts |
| `verify` | Run the component's complete local quality gate |
| `release` | Publish an immutable release |
| `deploy` | Change a running environment |

`release` and `deploy` are privileged capabilities. Shared CI must not invoke them as part of
ordinary pull-request validation.

## Security boundaries

Capability commands are **trusted executable configuration** owned by the project. Armonìa
enforces the following boundaries at execution time:

- Commands are spawned without a shell (`shell: false`); no interpolation occurs.
- Arguments are passed as an array, not concatenated strings.
- The working directory is validated to be inside the repository root.
- Environment variables from the command declaration are merged onto the current process
  environment; secrets should not appear in the manifest.
- An optional timeout terminates stuck processes (SIGTERM, then SIGKILL after 5 seconds).
- Pack defaults can contribute capability commands, but the project manifest always overrides.
- A pack cannot inject a capability command that the project did not select.

The trust boundary is: **the project manifest is trusted configuration**. Anyone with write
access to `.armonia/project.yaml` can execute arbitrary commands via capabilities. This is
equivalent to writing a Makefile or package.json script — it is intentional project-owned
executable configuration, not third-party code execution.

Projects may introduce namespaced capabilities such as `database/migrate`. Unqualified new
capability names are reserved for the core specification.
