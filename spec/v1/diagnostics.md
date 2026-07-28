# Diagnostic contract

Diagnostics have a stable rule identifier, severity, human-readable message, optional path,
and remediation. Machine-readable output uses the same fields.

Exit-code classes:

| Code | Meaning |
|---|---|
| `0` | Command completed successfully |
| `1` | Validation, policy, conflict, or command failure |
| `2` | Invalid CLI usage |
| `3` | Internal or distribution error |

Rule identifiers are public API. Message text can improve between compatible releases.
