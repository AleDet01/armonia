# Privacy notes

Armonia is designed to run against repositories that may contain private code,
internal hostnames, environment-variable names, and operational metadata. This
document describes the boundary of the open-source core, not a legal privacy
notice for a hosted service.

## What the core does

- Reads regular files within the requested repository boundary.
- Parses a limited set of text and structured-file surfaces to collect claims.
- Produces deterministic terminal, JSON, or SARIF reports.
- Writes a report only when the caller passes `--output`.

## What the core does not do

- It does not execute scanned code, package scripts, containers, or workflows.
- It does not make network requests or require an account, token, or model key.
- It does not follow symbolic links.
- It does not send telemetry.
- It does not include a detected high-confidence credential value in a finding.

## What may appear in a report

Findings can include relative filenames, line numbers, package metadata,
environment-variable names, commands, ports, and the text needed to explain a
contradiction. A report is therefore a review artifact: inspect it before
attaching it to an issue, pull request, CI artifact, or external ticket.

## Safe operating practice

1. Keep local `.env`, credential, database, cache, and build paths ignored.
2. Use `--output` only in an ignored artifact directory when scanning private code.
3. Review JSON and SARIF output before publishing it outside your organization.
4. Report a suspected vulnerability through the process in [SECURITY.md](../SECURITY.md).

The scanner is a safety-oriented aid, not a substitute for secret scanning,
access controls, incident response, or an independent security review.
