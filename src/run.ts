import { spawn } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
import { ArmoniaError } from "./errors.ts";
import { loadProjectManifest } from "./manifest.ts";
import { effectiveCapabilities, resolvePacks } from "./resolver.ts";

export interface RunOptions {
  component?: string;
  dryRun?: boolean;
  timeout?: number;
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
  timeout?: number;
}

/**
 * Capability sequence used by `armonia ci`.
 *
 * `verify` is deliberately excluded because it is a project's own aggregate gate and would
 * duplicate the steps above. `release` and `deploy` are privileged and never run here.
 */
export const DEFAULT_PIPELINE = ["setup", "format", "lint", "typecheck", "test", "build"] as const;

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
  const components = manifest.spec.components;
  if (!options.component && components.length > 1) {
    // Silently running only the first component of a polyglot repository would report success
    // while leaving most of it unverified.
    throw new ArmoniaError(
      "ARM050",
      `This repository declares ${components.length} components (${components
        .map((candidate) => candidate.id)
        .join(", ")}). Select one with --component, or use \`armonia ci\` to cover all of them.`
    );
  }
  const component = options.component
    ? components.find((candidate) => candidate.id === options.component)
    : components[0];
  if (!component) {
    throw new ArmoniaError(
      "ARM050",
      options.component
        ? `Unknown component: ${options.component}. Declared components: ${components
            .map((candidate) => candidate.id)
            .join(", ")}`
        : "The manifest declares no components"
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
  const timeoutMs = options.timeout ?? 0;
  const exitCode = await new Promise<number>((fulfill, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: { ...process.env, ...(command.env ?? {}) },
      shell: false,
      stdio: "inherit"
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill("SIGTERM");
        killTimer = setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 5000);
        killTimer.unref();
      }, timeoutMs);
      timer.unref();
    }
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
    };
    child.once("error", (err) => {
      cleanup();
      reject(err);
    });
    child.once("exit", (code) => {
      cleanup();
      fulfill(code ?? 1);
    });
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
  const requested = options.capabilities ?? [...DEFAULT_PIPELINE];
  const results: RunResult[] = [];

  for (const component of manifest.spec.components) {
    const capabilities = effectiveCapabilities(manifest, packs, component.id);
    for (const capability of requested) {
      if (!capabilities[capability]) {
        continue;
      }
      const result = await runCapability(root, capability, {
        component: component.id,
        ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
        ...(options.timeout === undefined ? {} : { timeout: options.timeout })
      });
      results.push(result);
      if (result.exitCode !== 0) {
        return results;
      }
    }
  }
  return results;
}
