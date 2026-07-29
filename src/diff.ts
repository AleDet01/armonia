import { resolve } from "node:path";
import { createPlan } from "./planner.ts";
import { loadLockFile } from "./manifest.ts";

export interface DiffEntry {
  path: string;
  action: string;
  ownership: string;
  source: string;
  reason: string;
}

export interface DiffResult {
  projectRoot: string;
  entries: DiffEntry[];
  orphaned: string[];
  summary: {
    create: number;
    update: number;
    conflict: number;
    orphaned: number;
    total: number;
  };
  clean: boolean;
}

export async function diffProject(projectRoot: string): Promise<DiffResult> {
  const root = resolve(projectRoot);
  const plan = await createPlan(root);
  const lock = await loadLockFile(root);

  const actionable = plan.entries.filter(
    (e) => e.action === "create" || e.action === "update" || e.action === "conflict"
  );

  const entries: DiffEntry[] = actionable.map((e) => ({
    path: e.path,
    action: e.action,
    ownership: e.ownership,
    source: e.source,
    reason: e.reason,
  }));

  const orphaned = Object.keys(lock?.files ?? {}).filter(
    (path) => !plan.entries.some((e) => e.path === path)
  );

  const summary = {
    create: actionable.filter((e) => e.action === "create").length,
    update: actionable.filter((e) => e.action === "update").length,
    conflict: actionable.filter((e) => e.action === "conflict").length,
    orphaned: orphaned.length,
    total: actionable.length + orphaned.length,
  };

  return {
    projectRoot: root,
    entries,
    orphaned,
    summary,
    clean: summary.total === 0,
  };
}

export function formatDiff(result: DiffResult): string {
  if (result.clean) {
    return "No divergence detected. Repository matches desired state.";
  }

  const lines: string[] = [];

  for (const entry of result.entries) {
    const symbol =
      entry.action === "create" ? "+" :
      entry.action === "update" ? "~" :
      "!";
    lines.push(`  ${symbol} ${entry.path} (${entry.action}, ${entry.ownership})`);
    lines.push(`    source: ${entry.source}`);
    lines.push(`    reason: ${entry.reason}`);
  }

  for (const path of result.orphaned) {
    lines.push(`  ? ${path} (orphaned — previously managed, no longer selected)`);
  }

  lines.push("");
  const parts: string[] = [];
  if (result.summary.create > 0) parts.push(`${result.summary.create} to create`);
  if (result.summary.update > 0) parts.push(`${result.summary.update} to update`);
  if (result.summary.conflict > 0) parts.push(`${result.summary.conflict} conflict(s)`);
  if (result.summary.orphaned > 0) parts.push(`${result.summary.orphaned} orphaned`);
  lines.push(`Summary: ${parts.join(", ")}`);

  return lines.join("\n");
}
