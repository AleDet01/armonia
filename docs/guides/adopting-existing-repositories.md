# Adopting existing repositories

`armonia adopt` is intentionally conservative.

## Flow

1. Detect root ecosystem markers.
2. Propose a primary language adapter.
3. Create the desired-state manifest.
4. Calculate file changes.
5. Refuse conflicting managed targets.
6. Apply only safe creations and exact matches.

```sh
armonia adopt .
armonia plan
```

If a managed target already exists with different content, decide whether to:

- retain the project-owned file and change the pack selection;
- merge the desired convention manually, then re-plan;
- explicitly accept the generated form with `armonia apply --force`.

Do not use `--force` as a routine adoption option.

## Adoption sequence for a large portfolio

1. Inventory only.
2. Add manifest with `experimental` profile.
3. Resolve file ownership.
4. Enable baseline CI.
5. Burn down warnings.
6. Upgrade appropriate repositories to production controls.

Batch by repository type and review upgrade pull requests in bounded groups.
