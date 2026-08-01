import { resolve } from "node:path";
import { applyPlan, type ApplyResult } from "./apply.ts";
import { exists } from "./fs.ts";
import { loadProjectManifest, MANIFEST_PATH } from "./manifest.ts";
import { builtInPackPath } from "./paths.ts";
import { createPlan } from "./planner.ts";
import { validateSchema } from "./schema.ts";
import { readYaml, writeYaml } from "./yaml.ts";
import type { PackManifest, Plan, ProjectManifest } from "./types.ts";

export interface PackUpgrade {
  id: string;
  from: string;
  to: string;
  /** `forward` when the catalog is newer than the pin, `backward` when it is older. */
  direction: "forward" | "backward";
}

export interface UpgradeReport {
  projectRoot: string;
  /** Pins that differ from the version available in the resolved distribution. */
  available: PackUpgrade[];
  /** Pins that already match the distribution. */
  current: Array<{ id: string; version: string }>;
  /** Pins that could not be compared, with the reason. */
  unresolved: Array<{ id: string; version: string; reason: string }>;
  /** Plan computed against the upgraded pins. */
  plan: Plan;
  applied?: ApplyResult;
  manifestChanged: boolean;
  /** True when no pin needs to move and the generated state already matches. */
  clean: boolean;
}

/** Compares dotted numeric versions. Prerelease suffixes sort below their release. */
export function compareVersions(left: string, right: string): number {
  const split = (value: string): [number[], string] => {
    const [core = "", ...rest] = value.split("-");
    return [core.split(".").map((part) => Number.parseInt(part, 10) || 0), rest.join("-")];
  };
  const [leftCore, leftPre] = split(left);
  const [rightCore, rightPre] = split(right);
  for (let index = 0; index < Math.max(leftCore.length, rightCore.length); index += 1) {
    const difference = (leftCore[index] ?? 0) - (rightCore[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  if (leftPre === rightPre) return 0;
  if (!leftPre) return 1;
  if (!rightPre) return -1;
  return leftPre > rightPre ? 1 : -1;
}

/**
 * Compares every pinned pack version against the version the resolved distribution actually
 * provides, and optionally rewrites the pins.
 *
 * Changing a pin is always an explicit act: without `apply` nothing is written.
 */
export async function upgradeProject(
  projectRoot: string,
  options: { apply?: boolean; force?: boolean } = {}
): Promise<UpgradeReport> {
  const root = resolve(projectRoot);
  const manifest = await loadProjectManifest(root);

  const available: PackUpgrade[] = [];
  const current: Array<{ id: string; version: string }> = [];
  const unresolved: Array<{ id: string; version: string; reason: string }> = [];

  for (const reference of manifest.spec.packs) {
    if (reference.path) {
      unresolved.push({
        id: reference.id,
        version: reference.version,
        reason: "Pack is provided by an explicit local path and is not managed by the distribution"
      });
      continue;
    }
    const packPath = builtInPackPath(reference.id);
    if (!(await exists(packPath))) {
      unresolved.push({
        id: reference.id,
        version: reference.version,
        reason: `Pack is not present in the resolved distribution at ${packPath}`
      });
      continue;
    }
    const pack = await readYaml<PackManifest>(packPath);
    const catalogVersion = pack.metadata.version;
    if (catalogVersion === reference.version) {
      current.push({ id: reference.id, version: reference.version });
      continue;
    }
    available.push({
      id: reference.id,
      from: reference.version,
      to: catalogVersion,
      direction: compareVersions(catalogVersion, reference.version) > 0 ? "forward" : "backward"
    });
  }

  const upgradedManifest: ProjectManifest = {
    ...manifest,
    spec: {
      ...manifest.spec,
      packs: manifest.spec.packs.map((reference) => {
        const upgrade = available.find((candidate) => candidate.id === reference.id);
        return upgrade ? { ...reference, version: upgrade.to } : reference;
      })
    }
  };

  const plan = await createPlan(root, { manifest: upgradedManifest });
  const pendingFiles = plan.entries.some(
    (entry) => entry.action === "create" || entry.action === "update" || entry.action === "conflict"
  );

  const report: UpgradeReport = {
    projectRoot: root,
    available,
    current,
    unresolved,
    plan,
    manifestChanged: false,
    clean: available.length === 0 && !pendingFiles
  };

  if (!options.apply) {
    return report;
  }

  if (available.length > 0) {
    await validateSchema("project.schema.json", upgradedManifest);
    await writeYaml(resolve(root, MANIFEST_PATH), upgradedManifest);
    report.manifestChanged = true;
  }
  report.applied = await applyPlan(plan, { force: options.force === true });
  return report;
}

export function formatUpgrade(report: UpgradeReport): string {
  const lines: string[] = [];

  if (report.available.length === 0) {
    lines.push("All pack pins match the resolved distribution.");
  } else {
    lines.push("Pack pins:");
    for (const upgrade of report.available) {
      const arrow = upgrade.direction === "forward" ? "->" : "<- (downgrade)";
      lines.push(`  ~ ${upgrade.id}  ${upgrade.from} ${arrow} ${upgrade.to}`);
    }
  }

  for (const item of report.unresolved) {
    lines.push(`  ? ${item.id}@${item.version}: ${item.reason}`);
  }

  const counts = {
    create: report.plan.entries.filter((entry) => entry.action === "create").length,
    update: report.plan.entries.filter((entry) => entry.action === "update").length,
    conflict: report.plan.entries.filter((entry) => entry.action === "conflict").length
  };

  lines.push("");
  if (counts.create + counts.update + counts.conflict === 0) {
    lines.push("Generated files: already up to date.");
  } else {
    lines.push(
      `Generated files: ${counts.create} to create, ${counts.update} to update, ${counts.conflict} conflict(s).`
    );
  }

  if (report.applied) {
    lines.push("");
    lines.push(
      `Applied: ${report.applied.created.length} created, ${report.applied.updated.length} updated` +
        (report.applied.conflicts.length > 0
          ? `, ${report.applied.conflicts.length} left untouched`
          : "")
    );
    if (report.manifestChanged) {
      lines.push("Manifest pins were rewritten. Commit .armonia/project.yaml and .armonia/lock.yaml.");
    }
  } else if (report.available.length > 0 || counts.create + counts.update > 0) {
    lines.push("");
    lines.push("Run `armonia upgrade --apply` to write these changes.");
  }

  return lines.join("\n");
}
