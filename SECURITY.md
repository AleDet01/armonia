# Security policy

## Supported versions

Security fixes are developed for the latest stable release line. During the release-candidate
phase, fixes target the newest candidate.

## Reporting a vulnerability

Do not open a public issue. After this repository is published, use GitHub's private security
advisory flow or the private contact channel declared by the repository owner.

Include:

- affected version and surface;
- impact and threat model;
- minimal reproduction;
- whether credentials or user data are involved;
- suggested mitigation, if known.

Never include live credentials, personal data, or active exploit infrastructure.

## Scope

Particularly relevant areas include managed-file boundary bypass, path traversal, command
execution, malicious pack content, workflow privilege escalation, unsafe migrations, and
incorrect policy suppression.
