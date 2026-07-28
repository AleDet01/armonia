import { resolve } from "node:path";
import { exists, readText } from "./fs.ts";
import { parseYaml, readYaml } from "./yaml.ts";
import { validateSchema } from "./schema.ts";
import { ArmoniaError } from "./errors.ts";
import type { LockFile, ProjectManifest } from "./types.ts";

export const MANIFEST_PATH = ".armonia/project.yaml";
export const LOCK_PATH = ".armonia/lock.yaml";

export async function loadProjectManifest(projectRoot: string): Promise<ProjectManifest> {
  const path = resolve(projectRoot, MANIFEST_PATH);
  if (!(await exists(path))) {
    throw new ArmoniaError("ARM003", `Armonìa manifest not found at ${path}`);
  }
  const manifest = await readYaml<ProjectManifest>(path);
  await validateSchema("project.schema.json", manifest);
  return manifest;
}

export async function loadLockFile(projectRoot: string): Promise<LockFile | undefined> {
  const path = resolve(projectRoot, LOCK_PATH);
  if (!(await exists(path))) {
    return undefined;
  }
  const lock = await readYaml<LockFile>(path);
  await validateSchema("lock.schema.json", lock);
  return lock;
}

export async function rawManifest(projectRoot: string): Promise<unknown> {
  const path = resolve(projectRoot, MANIFEST_PATH);
  if (!(await exists(path))) {
    throw new ArmoniaError("ARM003", `Armonìa manifest not found at ${path}`);
  }
  const source = await readText(path);
  return parseYaml(source);
}
