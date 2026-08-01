import { resolve } from "node:path";
import { applyPlan, type ApplyResult } from "./apply.ts";
import { createDetectedManifest, type ManifestOptions } from "./detect.ts";
import { ArmoniaError } from "./errors.ts";
import { exists } from "./fs.ts";
import { LOCK_PATH, MANIFEST_PATH } from "./manifest.ts";
import { createPlan } from "./planner.ts";
import { validateSchema } from "./schema.ts";
import { writeYaml } from "./yaml.ts";
import type { Detection, Plan, ProjectManifest } from "./types.ts";

export type GovernMode = "init" | "adopt";

export interface GovernOptions extends ManifestOptions {
  /**
   * `init` assumes a repository with no competing conventions and refuses to proceed when a
   * managed target already exists with different content. `adopt` expects existing conventions:
   * it applies every safe change and reports the rest for manual resolution.
   */
  mode?: GovernMode;
  /** Compute and report the outcome without writing anything. */
  dryRun?: boolean;
  /** Overwrite diverging managed files. Never implied. */
  force?: boolean;
  /** Write the manifest but skip materializing files. */
  applyFiles?: boolean;
}

export interface GovernResult {
  mode: GovernMode;
  manifest: ProjectManifest;
  detections: Detection[];
  plan: Plan;
  applied?: ApplyResult;
  /** Managed targets that already exist with different content. */
  conflicts: string[];
  dryRun: boolean;
  manifestWritten: boolean;
}

/**
 * Brings a repository under Armonìa governance.
 *
 * The plan is computed against the in-memory manifest *before* anything is written, so a
 * repository can never be left with a manifest but no lockfile. That state used to be
 * unrecoverable because a second attempt failed with ARM060.
 */
export async function governProject(
  projectRoot: string,
  options: GovernOptions = {}
): Promise<GovernResult> {
  const root = resolve(projectRoot);
  const mode = options.mode ?? "init";
  const manifestPath = resolve(root, MANIFEST_PATH);

  if (await exists(manifestPath)) {
    const governed = (await exists(resolve(root, LOCK_PATH)))
      ? "Run `armonia status` to inspect it, or `armonia plan` to preview pending changes."
      : "The manifest exists without a lockfile. Run `armonia apply` to complete the setup.";
    throw new ArmoniaError(
      "ARM060",
      `Project is already governed by Armonìa: ${manifestPath}. ${governed}`
    );
  }

  const { manifest, detections } = await createDetectedManifest(root, options);
  await validateSchema("project.schema.json", manifest);

  const plan = await createPlan(root, { manifest });
  const conflicts = plan.entries
    .filter((entry) => entry.action === "conflict")
    .map((entry) => entry.path);

  if (mode === "init" && conflicts.length > 0 && !options.force) {
    throw new ArmoniaError(
      "ARM062",
      `${conflicts.length} managed target(s) already exist with different content: ${conflicts.join(", ")}. ` +
        "Nothing was written. Use `armonia adopt` to bring an existing repository under governance " +
        "without overwriting its files."
    );
  }

  const result: GovernResult = {
    mode,
    manifest,
    detections,
    plan,
    conflicts,
    dryRun: options.dryRun === true,
    manifestWritten: false
  };

  if (options.dryRun) {
    return result;
  }

  await writeYaml(manifestPath, manifest);
  result.manifestWritten = true;

  if (options.applyFiles !== false) {
    result.applied = await applyPlan(plan, {
      force: options.force === true,
      // Adoption never fails the whole repository because one file diverges.
      skipConflicts: mode === "adopt"
    });
  }

  return result;
}

export interface InitializeResult {
  manifest: ProjectManifest;
  detections: Detection[];
  plan: Plan;
  applied?: ApplyResult;
}

/** Initializes a repository that has no competing conventions. */
export async function initializeProject(
  projectRoot: string,
  options: ManifestOptions,
  applyFiles = true
): Promise<InitializeResult> {
  const result = await governProject(projectRoot, {
    ...options,
    mode: "init",
    applyFiles
  });
  const value: InitializeResult = {
    manifest: result.manifest,
    detections: result.detections,
    plan: result.plan
  };
  if (result.applied) {
    value.applied = result.applied;
  }
  return value;
}

/** Adopts an existing repository, applying only safe changes. */
export async function adoptProject(
  projectRoot: string,
  options: ManifestOptions & { dryRun?: boolean; force?: boolean } = {}
): Promise<GovernResult> {
  return governProject(projectRoot, { ...options, mode: "adopt" });
}
