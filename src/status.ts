import { resolve } from "node:path";
import { loadProjectManifest, loadLockFile } from "./manifest.ts";
import { resolvePacks } from "./resolver.ts";
import { createPlan } from "./planner.ts";
import { evaluatePolicies } from "./policy.ts";
import type { Diagnostic } from "./types.ts";

export interface StatusSummary {
  project: {
    id: string;
    name: string;
    lifecycle: string;
    profile: string;
  };
  packs: number;
  components: number;
  files: {
    managed: number;
    scaffold: number;
    upToDate: number;
    pending: number;
    conflicts: number;
    orphaned: number;
  };
  policy: {
    errors: number;
    warnings: number;
    info: number;
  };
  healthy: boolean;
}

export async function projectStatus(projectRoot: string): Promise<StatusSummary> {
  const root = resolve(projectRoot);
  const manifest = await loadProjectManifest(root);
  const lock = await loadLockFile(root);
  const packs = await resolvePacks(root, manifest);
  const plan = await createPlan(root);
  const policyDiagnostics = await evaluatePolicies(root, manifest, packs);

  const managed = plan.entries.filter((e) => e.ownership === "managed").length;
  const scaffold = plan.entries.filter((e) => e.ownership === "scaffold").length;
  const upToDate = plan.entries.filter((e) => e.action === "unchanged" || e.action === "skip").length;
  const pending = plan.entries.filter((e) => e.action === "create" || e.action === "update").length;
  const conflicts = plan.entries.filter((e) => e.action === "conflict").length;
  const orphaned = Object.keys(lock?.files ?? {}).filter(
    (path) => !plan.entries.some((e) => e.path === path)
  ).length;

  const errors = policyDiagnostics.filter((d) => d.severity === "error").length;
  const warnings = policyDiagnostics.filter((d) => d.severity === "warning").length;
  const info = policyDiagnostics.filter((d) => d.severity === "info").length;

  return {
    project: {
      id: manifest.metadata.id,
      name: manifest.metadata.name,
      lifecycle: manifest.spec.lifecycle,
      profile: manifest.spec.profile,
    },
    packs: packs.length,
    components: manifest.spec.components.length,
    files: { managed, scaffold, upToDate, pending, conflicts, orphaned },
    policy: { errors, warnings, info },
    healthy: conflicts === 0 && errors === 0,
  };
}

export function formatStatus(summary: StatusSummary): string {
  const lines: string[] = [];
  lines.push(`${summary.project.name} (${summary.project.id})`);
  lines.push(`  lifecycle: ${summary.project.lifecycle}  profile: ${summary.project.profile}`);
  lines.push(`  packs: ${summary.packs}  components: ${summary.components}`);
  lines.push("");
  lines.push("Files:");
  lines.push(`  up-to-date: ${summary.files.upToDate}  pending: ${summary.files.pending}  conflicts: ${summary.files.conflicts}`);
  if (summary.files.orphaned > 0) {
    lines.push(`  orphaned: ${summary.files.orphaned}`);
  }
  lines.push("");
  lines.push("Policy:");
  if (summary.policy.errors === 0 && summary.policy.warnings === 0 && summary.policy.info === 0) {
    lines.push("  all clear");
  } else {
    const parts: string[] = [];
    if (summary.policy.errors > 0) parts.push(`${summary.policy.errors} error(s)`);
    if (summary.policy.warnings > 0) parts.push(`${summary.policy.warnings} warning(s)`);
    if (summary.policy.info > 0) parts.push(`${summary.policy.info} info`);
    lines.push(`  ${parts.join("  ")}`);
  }
  lines.push("");
  lines.push(summary.healthy ? "Status: healthy" : "Status: action required");
  return lines.join("\n");
}
