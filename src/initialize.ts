import { resolve } from "node:path";
import { applyPlan, type ApplyResult } from "./apply.ts";
import { createDetectedManifest, type ManifestOptions } from "./detect.ts";
import { ArmoniaError } from "./errors.ts";
import { exists } from "./fs.ts";
import { MANIFEST_PATH } from "./manifest.ts";
import { createPlan } from "./planner.ts";
import { validateSchema } from "./schema.ts";
import { writeYaml } from "./yaml.ts";
import type { Detection, Plan, ProjectManifest } from "./types.ts";

export interface InitializeResult {
  manifest: ProjectManifest;
  detections: Detection[];
  plan: Plan;
  applied?: ApplyResult;
}

export async function initializeProject(
  projectRoot: string,
  options: ManifestOptions,
  applyFiles = true
): Promise<InitializeResult> {
  const root = resolve(projectRoot);
  const manifestPath = resolve(root, MANIFEST_PATH);
  if (await exists(manifestPath)) {
    throw new ArmoniaError("ARM060", `Project is already governed by Armonìa: ${manifestPath}`);
  }

  const { manifest, detections } = await createDetectedManifest(root, options);
  await validateSchema("project.schema.json", manifest);
  await writeYaml(manifestPath, manifest);
  const plan = await createPlan(root);
  const result: InitializeResult = { manifest, detections, plan };
  if (applyFiles) {
    result.applied = await applyPlan(plan);
  }
  return result;
}
