# Release process

1. Confirm the intended version and compatibility class.
2. Update `CHANGELOG.md`.
3. Run `pnpm verify`.
4. Run conformance on supported operating systems.
5. Review `armonia plan` and the lockfile.
6. Create and push an immutable signed or protected tag.
7. Invoke the reusable release workflow with a pinned Armonìa ref.
8. Publish checksums, SBOM, and provenance when release packaging is enabled.
9. Test installation from the published artifact.
10. Announce migration or rollback guidance.

Moving an existing release tag is forbidden.
