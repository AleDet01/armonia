import { readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { builtInPackPath } from "./paths.ts";
import { exists, readText } from "./fs.ts";
import { readYaml } from "./yaml.ts";
import type {
  CapabilityCommand,
  Detection,
  PackManifest,
  ProjectManifest
} from "./types.ts";

/**
 * Fallback markers for language detection when pack markers are not available.
 * New languages should declare markers in their pack.yaml instead of here.
 */
const fallbackMarkers: Array<{ language: string; files: string[]; patterns?: RegExp[] }> = [
  { language: "python", files: ["pyproject.toml", "requirements.txt", "setup.py"] },
  { language: "typescript", files: ["package.json", "tsconfig.json"] },
  { language: "rust", files: ["Cargo.toml"] },
  { language: "go", files: ["go.mod"] },
  { language: "dotnet", files: [], patterns: [/\.(sln|csproj|fsproj)$/i] },
  { language: "java", files: ["pom.xml", "build.gradle", "build.gradle.kts"] }
];

async function loadPackMarkers(): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  for (const marker of fallbackMarkers) {
    const path = builtInPackPath(`language/${marker.language}`);
    if (await exists(path)) {
      try {
        const pack = await readYaml<PackManifest>(path);
        if (pack.metadata.markers && pack.metadata.markers.length > 0) {
          result.set(marker.language, pack.metadata.markers);
          continue;
        }
      } catch {
        // Fall through to default markers
      }
    }
    result.set(marker.language, marker.files);
  }
  return result;
}

function matchesMarker(fileName: string, marker: string): boolean {
  if (marker.startsWith("*.")) {
    return fileName.endsWith(marker.slice(1));
  }
  return fileName === marker;
}

export async function detectLanguages(projectRoot: string): Promise<Detection[]> {
  const names = await readdir(projectRoot).catch(() => [] as string[]);
  const packMarkers = await loadPackMarkers();
  const detections: Detection[] = [];

  for (const [language, markers] of packMarkers) {
    const evidence = names.filter((name) =>
      markers.some((marker) => matchesMarker(name, marker))
    );
    // Also check fallback patterns (for dotnet glob patterns in filenames)
    const fallback = fallbackMarkers.find((m) => m.language === language);
    if (fallback?.patterns) {
      for (const name of names) {
        if (fallback.patterns.some((p) => p.test(name)) && !evidence.includes(name)) {
          evidence.push(name);
        }
      }
    }
    if (evidence.length > 0) {
      detections.push({
        language,
        evidence,
        confidence: evidence.length > 1 ? 1 : 0.9
      });
    }
  }

  return detections.sort(
    (left, right) => right.confidence - left.confidence || left.language.localeCompare(right.language)
  );
}

async function packDefaults(language: string): Promise<Record<string, CapabilityCommand>> {
  const path = builtInPackPath(`language/${language}`);
  if (!(await exists(path))) {
    return {};
  }
  return (await readYaml<PackManifest>(path)).defaults?.capabilities ?? {};
}

async function adaptedDefaults(
  root: string,
  language: string
): Promise<Record<string, CapabilityCommand>> {
  const defaults = await packDefaults(language);

  if (language === "python" && (await exists(resolve(root, "uv.lock")))) {
    return {
      setup: { argv: ["uv", "sync", "--frozen"] },
      lint: { argv: ["uv", "run", "ruff", "check", "."] },
      test: { argv: ["uv", "run", "pytest"] },
      build: { argv: ["uv", "build"] }
    };
  }

  if (language === "typescript") {
    if (await exists(resolve(root, "pnpm-lock.yaml"))) {
      return {
        setup: { argv: ["pnpm", "install", "--frozen-lockfile"] },
        lint: { argv: ["pnpm", "run", "lint"] },
        typecheck: { argv: ["pnpm", "run", "check"] },
        test: { argv: ["pnpm", "test"] },
        build: { argv: ["pnpm", "run", "build"] }
      };
    }
    if (await exists(resolve(root, "yarn.lock"))) {
      return {
        setup: { argv: ["yarn", "install", "--immutable"] },
        lint: { argv: ["yarn", "lint"] },
        typecheck: { argv: ["yarn", "check"] },
        test: { argv: ["yarn", "test"] },
        build: { argv: ["yarn", "build"] }
      };
    }
  }

  if (language === "java") {
    if (await exists(resolve(root, "mvnw"))) {
      return {
        setup: { argv: ["./mvnw", "--batch-mode", "dependency:go-offline"] },
        test: { argv: ["./mvnw", "--batch-mode", "test"] },
        build: { argv: ["./mvnw", "--batch-mode", "package", "-DskipTests"] }
      };
    }
    if (await exists(resolve(root, "gradlew"))) {
      return {
        setup: { argv: ["./gradlew", "dependencies"] },
        test: { argv: ["./gradlew", "test"] },
        build: { argv: ["./gradlew", "build", "-x", "test"] }
      };
    }
  }

  return defaults;
}

export interface ManifestOptions {
  name?: string;
  id?: string;
  owner?: string;
  description?: string;
  language?: string;
  archetype?: string;
  profile?: ProjectManifest["spec"]["profile"];
  visibility?: ProjectManifest["spec"]["visibility"];
  distributionRepository?: string;
  distributionRef?: string;
  generatedAdapters?: string[];
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createDetectedManifest(
  projectRoot: string,
  options: ManifestOptions = {}
): Promise<{ manifest: ProjectManifest; detections: Detection[] }> {
  const detections = await detectLanguages(projectRoot);
  const language = options.language ?? detections[0]?.language ?? "generic";
  const name = options.name ?? basename(resolve(projectRoot));
  const owner = options.owner ?? process.env.USERNAME ?? process.env.USER ?? "maintainer";
  const capabilities = await adaptedDefaults(projectRoot, language);
  const packs: ProjectManifest["spec"]["packs"] = [
    { id: "core", version: "1.0.0" },
    { id: `language/${language}`, version: "1.0.0" }
  ];
  if (options.archetype) {
    packs.push({ id: `archetype/${options.archetype}`, version: "1.0.0" });
  }

  const spec: ProjectManifest["spec"] = {
    lifecycle: "incubating",
    maturity: "prototype",
    criticality: "tier-3",
    profile: options.profile ?? "baseline",
    visibility: options.visibility ?? "private",
    packs,
    components: [
      {
        id: "root",
        path: ".",
        languages: detections.length > 0 ? detections.map((item) => item.language) : [language],
        capabilities
      }
    ],
    github: {
      defaultBranch: "main",
      issues: true,
      releases: false
    },
    ai: {
      contextEntry: "AGENTS.md",
      generatedAdapters: options.generatedAdapters ?? []
    },
    policy: {
      exceptions: []
    }
  };

  if (options.distributionRepository && options.distributionRef) {
    spec.distribution = {
      repository: options.distributionRepository,
      ref: options.distributionRef
    };
  }

  return {
    detections,
    manifest: {
      apiVersion: "armonia/v1",
      kind: "Project",
      metadata: {
        id: options.id ?? `local/${slug(name)}`,
        name,
        description: options.description ?? "",
        owners: [owner]
      },
      spec
    }
  };
}

export async function packageScripts(projectRoot: string): Promise<Record<string, string>> {
  const path = resolve(projectRoot, "package.json");
  if (!(await exists(path))) {
    return {};
  }
  const value = JSON.parse(await readText(path)) as { scripts?: Record<string, string> };
  return value.scripts ?? {};
}
