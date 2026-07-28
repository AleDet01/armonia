import { dirname, isAbsolute, resolve } from "node:path";
import { builtInPackPath } from "./paths.ts";
import { exists } from "./fs.ts";
import { readYaml } from "./yaml.ts";
import { validateSchema } from "./schema.ts";
import { ArmoniaError } from "./errors.ts";
import type {
  CapabilityCommand,
  PackManifest,
  PackReference,
  ProjectManifest,
  ResolvedPack
} from "./types.ts";

async function loadPack(projectRoot: string, reference: PackReference): Promise<ResolvedPack> {
  let manifestPath: string;
  if (reference.path) {
    manifestPath = isAbsolute(reference.path)
      ? reference.path
      : resolve(projectRoot, reference.path);
  } else {
    manifestPath = builtInPackPath(reference.id);
  }

  if (!(await exists(manifestPath))) {
    throw new ArmoniaError("ARM010", `Pack ${reference.id}@${reference.version} was not found at ${manifestPath}`);
  }

  const manifest = await readYaml<PackManifest>(manifestPath);
  await validateSchema("pack.schema.json", manifest);

  if (manifest.metadata.id !== reference.id) {
    throw new ArmoniaError(
      "ARM011",
      `Pack ID mismatch: requested ${reference.id}, found ${manifest.metadata.id}`
    );
  }
  if (manifest.metadata.version !== reference.version) {
    throw new ArmoniaError(
      "ARM012",
      `Pack version mismatch for ${reference.id}: requested ${reference.version}, found ${manifest.metadata.version}`
    );
  }
  if (manifest.compatibility.spec !== "^1") {
    throw new ArmoniaError(
      "ARM013",
      `Pack ${reference.id}@${reference.version} does not support armonia/v1`
    );
  }

  return { manifest, directory: dirname(manifestPath) };
}

export async function resolvePacks(
  projectRoot: string,
  manifest: ProjectManifest
): Promise<ResolvedPack[]> {
  const resolvedPacks = new Map<string, ResolvedPack>();
  const visiting = new Set<string>();

  async function visit(reference: PackReference): Promise<void> {
    const key = `${reference.id}@${reference.version}`;
    if (resolvedPacks.has(key)) {
      return;
    }
    if (visiting.has(key)) {
      throw new ArmoniaError("ARM014", `Cyclic pack dependency detected at ${key}`);
    }

    visiting.add(key);
    const pack = await loadPack(projectRoot, reference);
    for (const dependency of pack.manifest.requires ?? []) {
      await visit(dependency);
    }
    visiting.delete(key);
    resolvedPacks.set(key, pack);
  }

  const selectedReferences = [...manifest.spec.packs];
  for (const adapter of manifest.spec.ai?.generatedAdapters ?? []) {
    const id = `capability/ai-${adapter}`;
    if (!selectedReferences.some((reference) => reference.id === id)) {
      selectedReferences.push({ id, version: "1.0.0" });
    }
  }

  for (const reference of selectedReferences) {
    await visit(reference);
  }

  const packs = [...resolvedPacks.values()];
  const ids = new Set(packs.map((pack) => pack.manifest.metadata.id));
  const versions = new Map<string, string>();
  for (const pack of packs) {
    const previousVersion = versions.get(pack.manifest.metadata.id);
    if (previousVersion && previousVersion !== pack.manifest.metadata.version) {
      throw new ArmoniaError(
        "ARM017",
        `Multiple versions of pack ${pack.manifest.metadata.id} were selected: ${previousVersion} and ${pack.manifest.metadata.version}`
      );
    }
    versions.set(pack.manifest.metadata.id, pack.manifest.metadata.version);
    for (const conflict of pack.manifest.conflicts ?? []) {
      if (ids.has(conflict)) {
        throw new ArmoniaError(
          "ARM015",
          `Pack ${pack.manifest.metadata.id} conflicts with ${conflict}`
        );
      }
    }
  }

  return packs;
}

export function effectiveCapabilities(
  manifest: ProjectManifest,
  packs: ResolvedPack[],
  componentId: string
): Record<string, CapabilityCommand> {
  const component = manifest.spec.components.find((candidate) => candidate.id === componentId);
  if (!component) {
    throw new ArmoniaError("ARM016", `Unknown component: ${componentId}`);
  }

  const defaults: Record<string, CapabilityCommand> = {};
  const languages = new Set(component.languages ?? []);
  for (const pack of packs) {
    const id = pack.manifest.metadata.id;
    const language = id.startsWith("language/") ? id.slice("language/".length) : undefined;
    if (language && !languages.has(language)) {
      continue;
    }
    Object.assign(defaults, pack.manifest.defaults?.capabilities ?? {});
  }

  return {
    ...defaults,
    ...(component.capabilities ?? {})
  };
}
