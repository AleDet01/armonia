import { resolve } from "node:path";
import { ArmoniaError } from "./errors.ts";
import { rawManifest, MANIFEST_PATH } from "./manifest.ts";
import { validateSchema } from "./schema.ts";
import { writeYaml } from "./yaml.ts";
import type { ProjectManifest } from "./types.ts";

export interface MigrationResult {
  required: boolean;
  from: string;
  to: "armonia/v1";
  manifest: ProjectManifest;
  applied: boolean;
}

type LegacyManifest = {
  version?: number;
  apiVersion?: string;
  name?: string;
  description?: string;
  owner?: string;
  language?: string;
  lifecycle?: ProjectManifest["spec"]["lifecycle"];
  profile?: ProjectManifest["spec"]["profile"];
  commands?: Record<string, string[]>;
};

function legacyToV1(value: LegacyManifest): ProjectManifest {
  const name = value.name ?? "Migrated project";
  const language = value.language ?? "generic";
  return {
    apiVersion: "armonia/v1",
    kind: "Project",
    metadata: {
      id: `local/${name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-")}`,
      name,
      description: value.description ?? "",
      owners: [value.owner ?? "maintainer"]
    },
    spec: {
      lifecycle: value.lifecycle ?? "incubating",
      maturity: "prototype",
      criticality: "tier-3",
      profile: value.profile ?? "baseline",
      visibility: "private",
      packs: [
        { id: "core", version: "1.0.0" },
        { id: `language/${language}`, version: "1.0.0" }
      ],
      components: [
        {
          id: "root",
          path: ".",
          languages: [language],
          capabilities: Object.fromEntries(
            Object.entries(value.commands ?? {}).map(([id, argv]) => [id, { argv }])
          )
        }
      ],
      github: {
        defaultBranch: "main",
        issues: true,
        releases: false
      },
      ai: {
        contextEntry: "AGENTS.md",
        generatedAdapters: []
      },
      policy: {
        exceptions: []
      }
    }
  };
}

export async function migrateProject(
  projectRoot: string,
  apply = false
): Promise<MigrationResult> {
  const raw = (await rawManifest(projectRoot)) as LegacyManifest & {
    kind?: string;
  };
  if (raw.apiVersion === "armonia/v1" && raw.kind === "Project") {
    await validateSchema("project.schema.json", raw);
    return {
      required: false,
      from: "armonia/v1",
      to: "armonia/v1",
      manifest: raw as ProjectManifest,
      applied: false
    };
  }

  if (!(raw.version === 0 || raw.apiVersion === "armonia/v0")) {
    throw new ArmoniaError("ARM061", "No supported migration path exists for this manifest");
  }

  const manifest = legacyToV1(raw);
  await validateSchema("project.schema.json", manifest);
  if (apply) {
    await writeYaml(resolve(projectRoot, MANIFEST_PATH), manifest);
  }
  return {
    required: true,
    from: raw.apiVersion ?? `version/${raw.version}`,
    to: "armonia/v1",
    manifest,
    applied: apply
  };
}
