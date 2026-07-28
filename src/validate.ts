import { resolve } from "node:path";
import { loadProjectManifest } from "./manifest.ts";
import { resolvePacks } from "./resolver.ts";
import { evaluatePolicies } from "./policy.ts";
import { createPlan } from "./planner.ts";
import type { Diagnostic, ProjectManifest, ResolvedPack } from "./types.ts";

export interface ValidationResult {
  valid: boolean;
  manifest: ProjectManifest;
  packs: ResolvedPack[];
  diagnostics: Diagnostic[];
}

export async function validateProject(projectRoot: string): Promise<ValidationResult> {
  const root = resolve(projectRoot);
  const manifest = await loadProjectManifest(root);
  const packs = await resolvePacks(root, manifest);
  const policyDiagnostics = await evaluatePolicies(root, manifest, packs);
  const plan = await createPlan(root);
  const diagnostics = [...policyDiagnostics, ...plan.diagnostics];
  return {
    valid: !diagnostics.some((item) => item.severity === "error"),
    manifest,
    packs,
    diagnostics
  };
}
