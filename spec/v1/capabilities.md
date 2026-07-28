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

Projects may introduce namespaced capabilities such as `database/migrate`. Unqualified new
capability names are reserved for the core specification.
