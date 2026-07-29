import { resolve } from "node:path";
import { ArmoniaError } from "./errors.ts";
import { exists, hashContent, readText, writeTextAtomic } from "./fs.ts";
import { LOCK_PATH } from "./manifest.ts";
import { serializeYaml } from "./yaml.ts";
import type { LockFile, Plan } from "./types.ts";

export interface ApplyResult {
  created: string[];
  updated: string[];
  unchanged: string[];
  skipped: string[];
  lockChanged: boolean;
}

export async function applyPlan(plan: Plan, force = false): Promise<ApplyResult> {
  const conflicts = plan.entries.filter((entry) => entry.action === "conflict");
  if (conflicts.length > 0 && !force) {
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
    lockChanged: false
  };
  const lock: LockFile = {
    apiVersion: "armonia/v1",
    kind: "Lock",
    generatedBy: "armonia-cli/1.0.0-rc.1",
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

    if (!entry.desiredContent || !entry.desiredHash) {
      throw new ArmoniaError("ARM034", `Plan entry ${entry.path} has no desired content`);
    }

    if (entry.action === "create") {
      await writeTextAtomic(resolve(plan.projectRoot, entry.path), entry.desiredContent);
      result.created.push(entry.path);
    } else if (entry.action === "update" || (entry.action === "conflict" && force)) {
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
  const desiredLock = serializeYaml(lock);
  const currentLock = (await exists(lockPath)) ? await readText(lockPath) : undefined;
  if (!currentLock || currentLock.replace(/\r\n/g, "\n") !== desiredLock) {
    await writeTextAtomic(lockPath, desiredLock);
    result.lockChanged = true;
  }

  return result;
}
