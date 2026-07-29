import { resolve } from "node:path";
import { loadProjectManifest, loadLockFile } from "./manifest.ts";
import { resolvePacks } from "./resolver.ts";
import type { LockFile, ProjectManifest, ResolvedPack } from "./types.ts";

/**
 * Lazily-loaded project context. Each property is computed at most once.
 * Commands receive this instead of re-loading manifest/packs/lock independently.
 */
export class ProjectContext {
  readonly root: string;
  private _manifest?: ProjectManifest;
  private _packs?: ResolvedPack[];
  private _lock?: LockFile | undefined;
  private _lockLoaded = false;

  constructor(projectRoot: string) {
    this.root = resolve(projectRoot);
  }

  async manifest(): Promise<ProjectManifest> {
    if (!this._manifest) {
      this._manifest = await loadProjectManifest(this.root);
    }
    return this._manifest;
  }

  async packs(): Promise<ResolvedPack[]> {
    if (!this._packs) {
      this._packs = await resolvePacks(this.root, await this.manifest());
    }
    return this._packs;
  }

  async lock(): Promise<LockFile | undefined> {
    if (!this._lockLoaded) {
      this._lock = await loadLockFile(this.root);
      this._lockLoaded = true;
    }
    return this._lock;
  }
}
