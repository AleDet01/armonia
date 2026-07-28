# Policy model

## Atomic rules

Every rule has a stable ID, explanation, default severity, executable check identifier, and
remediation. Stable IDs allow exceptions, dashboards, and automation without parsing message
text.

## Profiles

| Profile | Intended use |
|---|---|
| `experimental` | short-lived discovery |
| `baseline` | maintained repository |
| `production` | deployed or distributed software |
| `high-assurance` | critical or sensitive software |

Profiles are proportional controls, not prestige levels.

## Exceptions

An exception requires:

- rule ID;
- a meaningful reason;
- accountable owner;
- expiry date;
- preferably a tracking issue.

Expired exceptions are errors. Unknown exceptions are warnings. Valid exceptions suppress only
the named rule.

## Adding a rule

A new rule should be deterministic, explainable, cheap enough for its execution phase, and
applicable across its declared scope. Rules that depend on a language belong with its pack.
