import { isAbsolute, relative, resolve } from "node:path";
import { realpath } from "node:fs/promises";
import { ArmoniaError } from "./errors.ts";
import { exists, hashContent, readText } from "./fs.ts";
import { loadLockFile, loadProjectManifest } from "./manifest.ts";
import { resolvePacks } from "./resolver.ts";
import { conditionMatches, renderTemplate } from "./template.ts";
import type {
  Diagnostic,
  LockFile,
  PackFile,
  Plan,
  PlanEntry,
  ProjectManifest,
  ResolvedPack
} from "./types.ts";

function safePath(root: string, candidate: string, label: string): string {
  const fullPath = resolve(root, candidate);
  const rel = relative(resolve(root), fullPath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new ArmoniaError("ARM030", `${label} escapes its allowed root: ${candidate}`);
  }
  return fullPath;
}

async function safeSourcePath(root: string, candidate: string, label: string): Promise<string> {
  const fullPath = safePath(root, candidate, label);
  if (!(await exists(fullPath))) {
    return fullPath;
  }
  const resolved = await realpath(fullPath);
  const resolvedRoot = await realpath(root).catch(() => resolve(root));
  const rel = relative(resolvedRoot, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new ArmoniaError("ARM030", `${label} escapes its allowed root via symlink: ${candidate}`);
  }
  return resolved;
}

async function planFile(
  projectRoot: string,
  manifest: ProjectManifest,
  pack: ResolvedPack,
  file: PackFile,
  lock: LockFile | undefined
): Promise<PlanEntry> {
  const sourceId = `${pack.manifest.metadata.id}@${pack.manifest.metadata.version}:${file.source}`;
  if (!conditionMatches(file.condition, manifest)) {
    return {
      path: file.target,
      action: "skip",
      ownership: file.ownership,
      source: sourceId,
      reason: `Condition ${file.condition} is not active`
    };
  }

  if (file.ownership === "reference") {
    return {
      path: file.target,
      action: "skip",
      ownership: file.ownership,
      source: sourceId,
      reason: "Reference files are consumed remotely and are not materialized"
    };
  }

  const sourcePath = await safeSourcePath(pack.directory, file.source, "Pack source");
  if (!(await exists(sourcePath))) {
    throw new ArmoniaError("ARM031", `Pack file source not found: ${sourcePath}`);
  }

  const targetPath = safePath(projectRoot, file.target, "Pack target");
  const desiredContent = renderTemplate(await readText(sourcePath), manifest);
  const desiredHash = hashContent(desiredContent);

  if (!(await exists(targetPath))) {
    return {
      path: file.target,
      action: "create",
      ownership: file.ownership,
      source: sourceId,
      reason: "Target does not exist",
      desiredContent,
      desiredHash
    };
  }

  const currentHash = hashContent(await readText(targetPath));
  if (currentHash === desiredHash) {
    return {
      path: file.target,
      action: "unchanged",
      ownership: file.ownership,
      source: sourceId,
      reason: "Target already matches the desired content",
      desiredContent,
      desiredHash
    };
  }

  if (file.ownership === "scaffold") {
    return {
      path: file.target,
      action: "skip",
      ownership: file.ownership,
      source: sourceId,
      reason: "Scaffold target already exists and is project-owned",
      desiredContent,
      desiredHash
    };
  }

  const previous = lock?.files[file.target];
  if (previous && previous.hash === currentHash) {
    return {
      path: file.target,
      action: "update",
      ownership: file.ownership,
      source: sourceId,
      reason: "Managed target is unchanged since the previous resolution",
      desiredContent,
      desiredHash
    };
  }

  return {
    path: file.target,
    action: "conflict",
    ownership: file.ownership,
    source: sourceId,
    reason: previous
      ? "Managed target was modified outside Armonìa"
      : "Existing target has no Armonìa ownership record",
    desiredContent,
    desiredHash
  };
}

export interface PlanOptions {
  /**
   * Plan against an in-memory manifest instead of reading `.armonia/project.yaml`.
   * This lets `init` and `adopt` evaluate the full outcome before writing anything to disk.
   */
  manifest?: ProjectManifest;
  /** Reuse an already-resolved pack graph instead of resolving and re-validating it. */
  packs?: ResolvedPack[];
}

export async function createPlan(projectRoot: string, options: PlanOptions = {}): Promise<Plan> {
  const root = resolve(projectRoot);
  const manifest = options.manifest ?? (await loadProjectManifest(root));
  const lock = await loadLockFile(root);
  const packs = options.packs ?? (await resolvePacks(root, manifest));
  const entries: PlanEntry[] = [];
  const diagnostics: Diagnostic[] = [];
  const targets = new Map<string, string>();

  for (const pack of packs) {
    for (const file of pack.manifest.files ?? []) {
      const priorOwner = targets.get(file.target);
      if (priorOwner) {
        throw new ArmoniaError(
          "ARM032",
          `Pack file collision for ${file.target}: ${priorOwner} and ${pack.manifest.metadata.id}`
        );
      }
      targets.set(file.target, pack.manifest.metadata.id);
      const entry = await planFile(root, manifest, pack, file, lock);
      entries.push(entry);
      if (entry.action === "conflict") {
        diagnostics.push({
          rule: "repository.managed-file-conflict",
          severity: "error",
          message: `${entry.path}: ${entry.reason}`,
          path: entry.path,
          remediation: "Review the local changes, restore the managed file, or apply explicitly with --force."
        });
      }
    }
  }

  for (const path of Object.keys(lock?.files ?? {})) {
    if (!targets.has(path)) {
      diagnostics.push({
        rule: "repository.orphaned-managed-file",
        severity: "warning",
        message: `${path} was managed by a previously resolved pack but is no longer selected.`,
        path,
        remediation: "Review and remove or adopt the file manually. Armonìa never deletes it automatically."
      });
    }
  }

  return {
    projectRoot: root,
    packs,
    entries: entries.sort((left, right) => left.path.localeCompare(right.path)),
    diagnostics
  };
}
