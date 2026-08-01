import { ProjectContext } from "./context.ts";
import type { Diagnostic, ProjectManifest, ResolvedPack } from "./types.ts";

export interface ValidationResult {
  valid: boolean;
  manifest: ProjectManifest;
  packs: ResolvedPack[];
  diagnostics: Diagnostic[];
}

export async function validateProject(
  projectRoot: string,
  context: ProjectContext = new ProjectContext(projectRoot)
): Promise<ValidationResult> {
  const manifest = await context.manifest();
  const packs = await context.packs();
  const diagnostics = [...(await context.policyDiagnostics()), ...(await context.plan()).diagnostics];
  return {
    valid: !diagnostics.some((item) => item.severity === "error"),
    manifest,
    packs,
    diagnostics
  };
}
