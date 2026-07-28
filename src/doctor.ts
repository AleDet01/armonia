import { access } from "node:fs/promises";
import { delimiter, extname, resolve } from "node:path";
import { createPlan } from "./planner.ts";
import { loadProjectManifest } from "./manifest.ts";
import { effectiveCapabilities, resolvePacks } from "./resolver.ts";
import { validateProject } from "./validate.ts";
import type { Diagnostic } from "./types.ts";

async function executableExists(command: string): Promise<boolean> {
  if (command.includes("/") || command.includes("\\")) {
    return access(resolve(command)).then(() => true).catch(() => false);
  }
  const paths = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];
  for (const directory of paths) {
    for (const extension of extensions) {
      const candidate = resolve(directory, extname(command) ? command : `${command}${extension}`);
      if (await access(candidate).then(() => true).catch(() => false)) {
        return true;
      }
    }
  }
  return false;
}

export async function doctorProject(projectRoot: string): Promise<{
  healthy: boolean;
  diagnostics: Diagnostic[];
}> {
  const validation = await validateProject(projectRoot);
  const diagnostics = [...validation.diagnostics];
  const manifest = await loadProjectManifest(projectRoot);
  const packs = await resolvePacks(projectRoot, manifest);

  const checked = new Set<string>();
  for (const component of manifest.spec.components) {
    for (const [capability, command] of Object.entries(
      effectiveCapabilities(manifest, packs, component.id)
    )) {
      const executable = command.argv[0];
      if (!executable || checked.has(executable)) {
        continue;
      }
      checked.add(executable);
      if (!(await executableExists(executable))) {
        diagnostics.push({
          rule: "environment.executable-missing",
          severity: "warning",
          message: `${executable} is required by ${component.id}:${capability} but is not on PATH`,
          remediation: "Install the declared toolchain or override the component capability."
        });
      }
    }
  }

  const plan = await createPlan(projectRoot);
  for (const entry of plan.entries) {
    if (entry.action === "create" || entry.action === "update") {
      diagnostics.push({
        rule: "repository.generated-drift",
        severity: "warning",
        message: `${entry.path} requires action: ${entry.action}`,
        path: entry.path,
        remediation: "Review `armonia plan` and run `armonia apply`."
      });
    }
  }

  return {
    healthy: !diagnostics.some((item) => item.severity === "error"),
    diagnostics
  };
}
