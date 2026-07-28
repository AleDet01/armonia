import { ArmoniaError } from "./errors.ts";
import type { ProjectManifest } from "./types.ts";

function context(manifest: ProjectManifest): Record<string, string> {
  const distribution = manifest.spec.distribution;
  return {
    "project.id": manifest.metadata.id,
    "project.name": manifest.metadata.name,
    "project.description": manifest.metadata.description ?? "",
    "project.owner": manifest.metadata.owners[0] ?? "",
    "project.lifecycle": manifest.spec.lifecycle,
    "project.profile": manifest.spec.profile,
    "github.defaultBranch": manifest.spec.github?.defaultBranch ?? "main",
    "distribution.repository": distribution?.repository ?? "",
    "distribution.ref": distribution?.ref ?? ""
  };
}

export function renderTemplate(source: string, manifest: ProjectManifest): string {
  const values = context(manifest);
  return source.replace(/<<armonia:([A-Za-z0-9_.-]+)>>/g, (_match, key: string) => {
    if (!(key in values)) {
      throw new ArmoniaError("ARM020", `Unknown template variable: ${key}`);
    }
    return values[key] ?? "";
  });
}

export function conditionMatches(condition: string | undefined, manifest: ProjectManifest): boolean {
  if (!condition) {
    return true;
  }
  switch (condition) {
    case "distribution":
      return Boolean(manifest.spec.distribution);
    case "public":
      return manifest.spec.visibility === "public";
    case "releases":
      return manifest.spec.github?.releases === true;
    default:
      throw new ArmoniaError("ARM021", `Unknown pack-file condition: ${condition}`);
  }
}
