import { spawn } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
import { ArmoniaError } from "./errors.ts";
import { loadProjectManifest } from "./manifest.ts";
import { effectiveCapabilities, resolvePacks } from "./resolver.ts";

export interface RunOptions {
  component?: string;
  dryRun?: boolean;
}

export interface RunResult {
  component: string;
  capability: string;
  argv: string[];
  cwd: string;
  exitCode: number;
}

export interface PipelineOptions {
  dryRun?: boolean;
  capabilities?: string[];
}

function inside(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return !rel.startsWith("..") && !isAbsolute(rel);
}

export async function runCapability(
  projectRoot: string,
  capability: string,
  options: RunOptions = {}
): Promise<RunResult> {
  const root = resolve(projectRoot);
  const manifest = await loadProjectManifest(root);
  const packs = await resolvePacks(root, manifest);
  const component =
    manifest.spec.components.find((candidate) => candidate.id === options.component) ??
    (options.component ? undefined : manifest.spec.components[0]);
  if (!component) {
    throw new ArmoniaError(
      "ARM050",
      options.component
        ? `Unknown component: ${options.component}`
        : "A component must be selected for this repository"
    );
  }

  const command = effectiveCapabilities(manifest, packs, component.id)[capability];
  if (!command) {
    throw new ArmoniaError(
      "ARM051",
      `Component ${component.id} does not provide capability ${capability}`
    );
  }

  const cwd = resolve(root, component.path, command.cwd ?? ".");
  if (!inside(root, cwd)) {
    throw new ArmoniaError("ARM052", `Capability working directory escapes the repository: ${cwd}`);
  }

  if (options.dryRun) {
    return {
      component: component.id,
      capability,
      argv: command.argv,
      cwd,
      exitCode: 0
    };
  }

  const [executable, ...args] = command.argv;
  if (!executable) {
    throw new ArmoniaError("ARM053", `Capability ${capability} has an empty argv`);
  }
  const exitCode = await new Promise<number>((fulfill, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: { ...process.env, ...(command.env ?? {}) },
      shell: false,
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code) => fulfill(code ?? 1));
  });

  return {
    component: component.id,
    capability,
    argv: command.argv,
    cwd,
    exitCode
  };
}

export async function runPipeline(
  projectRoot: string,
  options: PipelineOptions = {}
): Promise<RunResult[]> {
  const root = resolve(projectRoot);
  const manifest = await loadProjectManifest(root);
  const packs = await resolvePacks(root, manifest);
  const requested = options.capabilities ?? ["setup", "format", "lint", "typecheck", "test", "build"];
  const results: RunResult[] = [];

  for (const component of manifest.spec.components) {
    const capabilities = effectiveCapabilities(manifest, packs, component.id);
    for (const capability of requested) {
      if (!capabilities[capability]) {
        continue;
      }
      const result = await runCapability(root, capability, {
        component: component.id,
        ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun })
      });
      results.push(result);
      if (result.exitCode !== 0) {
        return results;
      }
    }
  }
  return results;
}
