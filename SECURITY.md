# Security policy

## Supported versions

Armonia is currently pre-1.0. Security fixes are applied to the latest release
and the `main` branch.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's
**Security → Report a vulnerability** flow for this repository. If private
vulnerability reporting is temporarily unavailable, open a public issue that
contains no exploit details and asks a maintainer to provide a private channel.

Include the affected version, operating system, minimal reproduction, impact,
and whether credentials or private source content may have been exposed. Expect
an acknowledgement within seven days. We will coordinate disclosure after a
fix is available.

## Scanner threat model

Armonia treats repository content as untrusted data. The core scanner:

- never executes repository files or discovered commands;
- performs no network requests;
- does not follow symbolic links;
- bounds file count and individual text file size;
- ignores dependency, VCS, build, cache, and virtual-environment directories;
- redacts credential-shaped values before constructing a finding;
- writes output only when the caller provides an output path.

Reports can still reveal filenames, line numbers, project metadata, and the
names of environment variables. Review a report before publishing it.
