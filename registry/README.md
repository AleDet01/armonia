# Fleet registry

The registry declares discovery sources and a schema for derived catalog output. It does not
duplicate per-repository desired state.

The 1.0 CLI intentionally stops at local repository operations. Fleet discovery through the
GitHub API is a post-1.0 capability and must use read-only permissions by default.
