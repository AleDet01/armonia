import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceFile = fileURLToPath(import.meta.url);

export function distributionRoot(): string {
  return resolve(dirname(sourceFile), "..");
}

export function schemaPath(name: string): string {
  return resolve(distributionRoot(), "spec", "v1", "schemas", name);
}

export function builtInPackPath(id: string): string {
  const parts = id.split("/");
  if (parts[0] === "language") {
    parts[0] = "languages";
  } else if (parts[0] === "archetype") {
    parts[0] = "archetypes";
  } else if (parts[0] === "capability") {
    parts[0] = "capabilities";
  }
  return resolve(distributionRoot(), "packs", ...parts, "pack.yaml");
}

export function policyRulesRoot(): string {
  return resolve(distributionRoot(), "policies", "rules");
}

export function policyProfilePath(profile: string): string {
  return resolve(distributionRoot(), "policies", "profiles", `${profile}.yaml`);
}
