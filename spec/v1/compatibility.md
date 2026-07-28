# Compatibility policy

- Every Armonìa 1.x CLI must understand valid `armonia/v1` project manifests.
- Pack versions are resolved exactly and recorded in the lockfile.
- Pack major versions may contain breaking changes and require an explicit upgrade.
- Managed files are updated only when their current hash matches the prior lockfile.
- Scaffold files are never overwritten after creation.
- Unknown or expired policy exceptions fail validation according to the active profile.
- Migrations are explicit, reviewable, and never run during `validate`.
