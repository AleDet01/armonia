import { resolve } from "node:path";
import { loadProjectManifest, loadLockFile } from "./manifest.ts";
import { createPlan } from "./planner.ts";
import { evaluatePolicies } from "./policy.ts";
import { resolvePacks } from "./resolver.ts";
import type { Diagnostic, LockFile, Plan, ProjectManifest, ResolvedPack } from "./types.ts";

/**
 * Lazily-loaded, memoized project state.
 *
 * Resolving the pack graph validates every pack manifest against the public schema, and building
 * a plan renders every managed template. Commands that need several of these views share one
 * context so the work happens at most once per invocation.
 */
export class ProjectContext {
  readonly root: string;
  private _manifest?: Promise<ProjectManifest>;
  private _packs?: Promise<ResolvedPack[]>;
  private _lock?: Promise<LockFile | undefined>;
  private _plan?: Promise<Plan>;
  private _policyDiagnostics?: Promise<Diagnostic[]>;

  constructor(projectRoot: string) {
    this.root = resolve(projectRoot);
  }

  manifest(): Promise<ProjectManifest> {
    this._manifest ??= loadProjectManifest(this.root);
    return this._manifest;
  }

  packs(): Promise<ResolvedPack[]> {
    this._packs ??= this.manifest().then((manifest) => resolvePacks(this.root, manifest));
    return this._packs;
  }

  lock(): Promise<LockFile | undefined> {
    this._lock ??= loadLockFile(this.root);
    return this._lock;
  }

  plan(): Promise<Plan> {
    this._plan ??= (async () =>
      createPlan(this.root, { manifest: await this.manifest(), packs: await this.packs() }))();
    return this._plan;
  }

  policyDiagnostics(): Promise<Diagnostic[]> {
    this._policyDiagnostics ??= (async () =>
      evaluatePolicies(this.root, await this.manifest(), await this.packs()))();
    return this._policyDiagnostics;
  }
}
