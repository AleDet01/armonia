import { resolve } from "node:path";
import { ArmoniaError } from "./errors.ts";
import { exists, hashContent, readText, writeTextAtomic } from "./fs.ts";
import { LOCK_PATH } from "./manifest.ts";
import { parseYaml, serializeYaml } from "./yaml.ts";
import type { LockFile, Plan } from "./types.ts";

export const CLI_VERSION = "1.0.0-rc.1";

export interface ApplyOptions {
  /** Overwrite managed files whose content diverged from the lockfile. */
  force?: boolean;
  /**
   * Apply every safe entry and leave conflicting managed files untouched instead of refusing
   * the whole plan. Conflicting paths are reported and stay outside Armonìa ownership.
   */
  skipConflicts?: boolean;
}

export interface ApplyResult {
  created: string[];
  updated: string[];
  unchanged: string[];
  skipped: string[];
  /** Managed files left untouched because their content diverged (only with skipConflicts). */
  conflicts: string[];
  lockChanged: boolean;
}

/**
 * The lockfile records when it was generated, but that timestamp must never by itself make the
 * file look changed. Equality is therefore computed over everything except `generatedAt`.
 */
function lockFingerprint(lock: LockFile): string {
  const { generatedAt: _generatedAt, ...rest } = lock;
  return serializeYaml(rest);
}

export async function applyPlan(plan: Plan, options: ApplyOptions = {}): Promise<ApplyResult> {
  const { force = false, skipConflicts = false } = options;
  const conflicts = plan.entries.filter((entry) => entry.action === "conflict");
  if (conflicts.length > 0 && !force && !skipConflicts) {
    throw new ArmoniaError(
      "ARM033",
      `Plan contains ${conflicts.length} managed-file conflict(s); no files were changed`
    );
  }

  const result: ApplyResult = {
    created: [],
    updated: [],
    unchanged: [],
    skipped: [],
    conflicts: [],
    lockChanged: false
  };
  const lock: LockFile = {
    apiVersion: "armonia/v1",
    kind: "Lock",
    generatedBy: `armonia-cli/${CLI_VERSION}`,
    generatedAt: new Date().toISOString(),
    packs: plan.packs.map(({ manifest }) => ({
      id: manifest.metadata.id,
      version: manifest.metadata.version
    })),
    files: {}
  };

  for (const entry of plan.entries) {
    if (entry.action === "skip") {
      result.skipped.push(entry.path);
      const target = resolve(plan.projectRoot, entry.path);
      if (entry.ownership === "scaffold" && (await exists(target))) {
        lock.files[entry.path] = {
          source: entry.source,
          ownership: entry.ownership,
          hash: hashContent(await readText(target))
        };
      }
      continue;
    }

    // A conflicting file is deliberately left as the project owns it and is not recorded in the
    // lockfile, so it stays outside Armonìa ownership until it is resolved explicitly.
    if (entry.action === "conflict" && !force) {
      result.conflicts.push(entry.path);
      continue;
    }

    if (!entry.desiredContent || !entry.desiredHash) {
      throw new ArmoniaError("ARM034", `Plan entry ${entry.path} has no desired content`);
    }

    if (entry.action === "create") {
      await writeTextAtomic(resolve(plan.projectRoot, entry.path), entry.desiredContent);
      result.created.push(entry.path);
    } else if (entry.action === "update" || entry.action === "conflict") {
      await writeTextAtomic(resolve(plan.projectRoot, entry.path), entry.desiredContent);
      result.updated.push(entry.path);
    } else {
      result.unchanged.push(entry.path);
    }

    lock.files[entry.path] = {
      source: entry.source,
      ownership: entry.ownership,
      hash: entry.desiredHash
    };
  }

  const lockPath = resolve(plan.projectRoot, LOCK_PATH);
  let currentFingerprint: string | undefined;
  if (await exists(lockPath)) {
    try {
      currentFingerprint = lockFingerprint(parseYaml<LockFile>(await readText(lockPath)));
    } catch {
      currentFingerprint = undefined;
    }
  }
  if (currentFingerprint !== lockFingerprint(lock)) {
    await writeTextAtomic(lockPath, serializeYaml(lock));
    result.lockChanged = true;
  }

  return result;
}
