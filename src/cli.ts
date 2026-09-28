#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { applyPlan, CLI_VERSION, type ApplyResult } from "./apply.ts";
import { ProjectContext } from "./context.ts";
import { diffProject, formatDiff } from "./diff.ts";
import { doctorProject } from "./doctor.ts";
import { getPolicyDefinition } from "./policy.ts";
import { governProject, type GovernResult } from "./initialize.ts";
import { loadLockFile } from "./manifest.ts";
import { migrateProject } from "./migrate.ts";
import { createPlan } from "./planner.ts";
import { effectiveCapabilities } from "./resolver.ts";
import { runCapability, runPipeline, DEFAULT_PIPELINE } from "./run.ts";
import { projectStatus, formatStatus } from "./status.ts";
import { formatUpgrade, upgradeProject } from "./upgrade.ts";
import { validateProject } from "./validate.ts";
import { startUiServer } from "./ui.ts";
import { ArmoniaError } from "./errors.ts";
import type { Diagnostic, Plan, ProjectManifest } from "./types.ts";

const VERSION = CLI_VERSION;

/** Exit class 2 covers every usage error. See spec/v1/diagnostics.md. */
const USAGE_CODES = new Set(["ARM070", "ARM071", "ARM072", "ARM073", "ARM074", "ARM075"]);

/** Flags that never take a value, so they cannot swallow a following positional argument. */
const BOOLEAN_FLAGS = new Set(["json", "dry-run", "force", "apply", "no-apply", "no-open", "help"]);

const MANIFEST_FLAGS = [
  "name",
  "id",
  "owner",
  "description",
  "language",
  "archetype",
  "profile",
  "visibility",
  "ai",
  "distribution-repository",
  "distribution-ref"
];

const GLOBAL_FLAGS = ["json", "root", "help"];

const COMMAND_FLAGS: Record<string, string[]> = {
  help: [],
  version: [],
  init: [...MANIFEST_FLAGS, "dry-run", "force", "no-apply"],
  adopt: [...MANIFEST_FLAGS, "dry-run", "force", "no-apply"],
  status: [],
  inspect: [],
  diff: [],
  validate: [],
  doctor: [],
  plan: [],
  apply: ["force"],
  upgrade: ["apply", "force"],
  migrate: ["apply"],
  explain: [],
  ui: ["port", "no-open"],
  run: ["component", "dry-run", "timeout"],
  ci: ["dry-run", "capability", "timeout"]
};

interface ParsedArguments {
  command: string;
  positionals: string[];
  options: Map<string, string | boolean>;
}

function parseArguments(argv: string[]): ParsedArguments {
  const command = argv[0] ?? "help";
  const positionals: string[] = [];
  const options = new Map<string, string | boolean>();
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    if (!rawKey) {
      continue;
    }
    if (inlineValue !== undefined) {
      options.set(rawKey, inlineValue);
      continue;
    }
    if (BOOLEAN_FLAGS.has(rawKey)) {
      options.set(rawKey, true);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      options.set(rawKey, next);
      index += 1;
    } else {
      options.set(rawKey, true);
    }
  }
  return { command, positionals, options };
}

function editDistance(left: string, right: string): number {
  const rows = Array.from({ length: left.length + 1 }, (_row, index) => [index]);
  for (let column = 0; column <= right.length; column += 1) {
    (rows[0] as number[])[column] = column;
  }
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      (rows[row] as number[])[column] = Math.min(
        ((rows[row - 1] as number[])[column] ?? 0) + 1,
        ((rows[row] as number[])[column - 1] ?? 0) + 1,
        ((rows[row - 1] as number[])[column - 1] ?? 0) + cost
      );
    }
  }
  return (rows[left.length] as number[])[right.length] ?? 0;
}

function suggest(value: string, candidates: string[]): string {
  const ranked = candidates
    .map((candidate) => ({ candidate, distance: editDistance(value, candidate) }))
    .filter((entry) => entry.distance <= Math.max(2, Math.floor(value.length / 3)))
    .sort((left, right) => left.distance - right.distance);
  return ranked[0] ? ` Did you mean --${ranked[0].candidate}?` : "";
}

/** Rejects flags that the selected command does not understand, instead of ignoring them. */
function assertKnownFlags(args: ParsedArguments): void {
  const allowed = COMMAND_FLAGS[args.command];
  if (!allowed) {
    return;
  }
  const permitted = new Set([...allowed, ...GLOBAL_FLAGS]);
  for (const key of args.options.keys()) {
    if (!permitted.has(key)) {
      throw new ArmoniaError(
        "ARM074",
        `Unknown option --${key} for command "${args.command}".${suggest(key, [...permitted])}`
      );
    }
  }
}

function optionString(args: ParsedArguments, key: string): string | undefined {
  const value = args.options.get(key);
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new ArmoniaError("ARM075", `Option --${key} requires a value`);
  }
  return value;
}

function optionBoolean(args: ParsedArguments, key: string): boolean {
  const value = args.options.get(key);
  return value === true || value === "true";
}

function optionInteger(args: ParsedArguments, key: string): number | undefined {
  const value = optionString(args, key);
  if (value === undefined) {
    return undefined;
  }
  if (!/^\d+$/.test(value)) {
    throw new ArmoniaError("ARM075", `Option --${key} requires a non-negative integer, received "${value}"`);
  }
  return Number.parseInt(value, 10);
}

function optionList(args: ParsedArguments, key: string): string[] | undefined {
  const value = optionString(args, key);
  if (value === undefined) {
    return undefined;
  }
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) {
    throw new ArmoniaError("ARM075", `Option --${key} requires at least one value`);
  }
  return items;
}

/**
 * Resolves the project root. `offset` is the index of the path among the positional arguments,
 * which differs for commands whose first positional is an argument rather than a path.
 */
function projectRoot(args: ParsedArguments, offset = 0): string {
  return resolve(optionString(args, "root") ?? args.positionals[offset] ?? ".");
}

function print(value: unknown, json: boolean): void {
  if (json || typeof value !== "string") {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${value}\n`);
}

function printDiagnostics(diagnostics: Diagnostic[], json: boolean): void {
  if (json) {
    print({ diagnostics }, true);
    return;
  }
  if (diagnostics.length === 0) {
    print("No diagnostics.", false);
    return;
  }
  for (const item of diagnostics) {
    const location = item.path ? ` (${item.path})` : "";
    print(`[${item.severity.toUpperCase()}] ${item.rule}${location}: ${item.message}`, false);
    if (item.remediation) {
      print(`  Fix: ${item.remediation}`, false);
    }
  }
}

function planSummary(plan: Plan): Record<string, number> {
  return {
    create: plan.entries.filter((entry) => entry.action === "create").length,
    update: plan.entries.filter((entry) => entry.action === "update").length,
    unchanged: plan.entries.filter((entry) => entry.action === "unchanged").length,
    skip: plan.entries.filter((entry) => entry.action === "skip").length,
    conflict: plan.entries.filter((entry) => entry.action === "conflict").length
  };
}

function publicPlan(plan: Plan): unknown {
  return {
    projectRoot: plan.projectRoot,
    packs: plan.packs.map(({ manifest }) => ({
      id: manifest.metadata.id,
      version: manifest.metadata.version
    })),
    entries: plan.entries.map(({ desiredContent: _content, ...entry }) => entry),
    summary: planSummary(plan),
    diagnostics: plan.diagnostics
  };
}

function formatPlan(plan: Plan): string {
  const lines: string[] = [];
  for (const entry of plan.entries) {
    const symbol =
      entry.action === "create"
        ? "+"
        : entry.action === "update"
          ? "~"
          : entry.action === "conflict"
            ? "!"
            : entry.action === "skip"
              ? "-"
              : "=";
    lines.push(`  ${symbol} ${entry.path} (${entry.action}, ${entry.ownership})`);
  }
  const summary = planSummary(plan);
  lines.push("");
  lines.push(
    `Summary: ${summary.create} create, ${summary.update} update, ${summary.unchanged} unchanged, ` +
      `${summary.skip} skip, ${summary.conflict} conflict`
  );
  return lines.join("\n");
}

function formatApply(result: ApplyResult): string {
  const lines: string[] = [];
  for (const path of result.created) lines.push(`  + ${path}`);
  for (const path of result.updated) lines.push(`  ~ ${path}`);
  for (const path of result.conflicts) lines.push(`  ! ${path} (left untouched, content diverged)`);
  lines.push("");
  lines.push(
    `Applied: ${result.created.length} created, ${result.updated.length} updated, ` +
      `${result.unchanged.length} unchanged, ${result.skipped.length} skipped`
  );
  if (result.conflicts.length > 0) {
    lines.push(
      `${result.conflicts.length} conflict(s) left untouched. Resolve them, then re-run \`armonia apply\`, ` +
        "or accept the generated form with `armonia apply --force`."
    );
  }
  lines.push(result.lockChanged ? "Lockfile updated." : "Lockfile unchanged.");
  return lines.join("\n");
}

function formatGovern(result: GovernResult): string {
  const lines: string[] = [];
  lines.push(
    `${result.dryRun ? "Preview" : result.mode === "adopt" ? "Adopted" : "Initialized"}: ` +
      `${result.manifest.metadata.name} (${result.manifest.metadata.id})`
  );
  if (result.detections.length > 0) {
    lines.push(
      `Detected: ${result.detections.map((item) => `${item.language} (${item.evidence.join(", ")})`).join("; ")}`
    );
  } else {
    lines.push("Detected: no ecosystem markers; using the generic adapter.");
  }
  lines.push(`Profile: ${result.manifest.spec.profile}  packs: ${result.manifest.spec.packs.length}`);
  lines.push("");
  if (result.applied) {
    lines.push(formatApply(result.applied));
  } else {
    lines.push(formatPlan(result.plan));
    if (result.dryRun) {
      lines.push("");
      lines.push("Nothing was written.");
    }
  }
  if (!result.dryRun) {
    lines.push("");
    lines.push("Next: review the generated files, then commit .armonia/project.yaml and .armonia/lock.yaml.");
  }
  return lines.join("\n");
}

function help(): string {
  return `Armonìa ${VERSION}

Usage:
  armonia <command> [path] [options]

Read-only commands:
  status [path]        Show a concise project health summary
  inspect [path]       Show manifest, packs, components, and capabilities
  diff [path]          Show divergence between observed and desired state
  plan [path]          Preview generated-file changes
  validate [path]      Validate schema, packs, policies, and conflicts
  doctor [path]        Validate plus toolchain and generated-drift checks
  explain <rule|file>  Explain a policy rule, or trace a file to its pack
  ui [path]            Open the local visual dashboard
  version              Print the CLI version

Mutating commands:
  init [path]          Initialize a repository with no competing conventions
  adopt [path]         Adopt an existing repository, applying only safe changes
  apply [path]         Apply a conflict-free plan
  upgrade [path]       Compare pack pins to the distribution and optionally bump them
  migrate [path]       Preview or apply a supported manifest migration

Execution:
  run <capability>     Run one semantic component capability
  ci [path]            Run the available CI capabilities for every component

Common options:
  --root <path>        Explicit project root
  --json               Machine-readable output

ui options:
  --port <number>       Use a specific local port (default: automatic)
  --no-open             Start without opening the browser

init / adopt options:
  --name <name> --id <id> --owner <owner> --description <text>
  --language <id> --archetype <id> --profile <profile> --visibility <visibility>
  --ai <adapter,...>
  --distribution-repository <owner/repo> --distribution-ref <sha>
  --dry-run            Report the outcome without writing anything
  --no-apply           Write the manifest only
  --force              Overwrite diverging managed files

apply / upgrade options:
  --force              Overwrite managed-file conflicts
  --apply              Write an upgrade or migration instead of previewing it

run / ci options:
  --component <id>     Target a single component
  --capability <a,b>   Override the ci capability sequence
  --timeout <ms>       Terminate a stuck command
  --dry-run            Report the resolved commands without executing them

Default ci sequence: ${DEFAULT_PIPELINE.join(" -> ")}

Exit codes: 0 success, 1 policy or state failure, 2 usage error, 3 internal error.`;
}

function manifestOptions(args: ParsedArguments): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  const mappings: Array<[string, string]> = [
    ["name", "name"],
    ["id", "id"],
    ["owner", "owner"],
    ["description", "description"],
    ["language", "language"],
    ["archetype", "archetype"],
    ["profile", "profile"],
    ["visibility", "visibility"],
    ["distribution-repository", "distributionRepository"],
    ["distribution-ref", "distributionRef"]
  ];
  for (const [flag, property] of mappings) {
    const option = optionString(args, flag);
    if (option !== undefined) {
      value[property] = option;
    }
  }
  const adapters = optionList(args, "ai");
  if (adapters) {
    value.generatedAdapters = adapters;
  }
  return value;
}

async function inspectProject(context: ProjectContext): Promise<unknown> {
  const manifest = await context.manifest();
  const packs = await context.packs();
  return {
    manifest,
    packs: packs.map(({ manifest: pack }) => ({
      id: pack.metadata.id,
      version: pack.metadata.version,
      provides: pack.provides ?? []
    })),
    components: manifest.spec.components.map((component) => ({
      ...component,
      effectiveCapabilities: effectiveCapabilities(manifest, packs, component.id)
    }))
  };
}

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  const args = parseArguments(argv);

  try {
    if (args.command === "help" || args.command === "--help" || args.command === "-h") {
      print(help(), false);
      return 0;
    }
    if (!(args.command in COMMAND_FLAGS)) {
      throw new ArmoniaError(
        "ARM073",
        `Unknown command: ${args.command}. Run \`armonia help\` for the available commands.`
      );
    }
    assertKnownFlags(args);
    const json = optionBoolean(args, "json");

    if (optionBoolean(args, "help")) {
      print(help(), false);
      return 0;
    }

    switch (args.command) {
      case "version":
        print(json ? { version: VERSION } : VERSION, json);
        return 0;

      case "init":
      case "adopt": {
        const root = projectRoot(args);
        const result = await governProject(root, {
          ...manifestOptions(args),
          mode: args.command,
          dryRun: optionBoolean(args, "dry-run"),
          force: optionBoolean(args, "force"),
          applyFiles: !optionBoolean(args, "no-apply")
        });
        if (json) {
          print(
            {
              projectRoot: root,
              mode: result.mode,
              dryRun: result.dryRun,
              manifestWritten: result.manifestWritten,
              detections: result.detections,
              conflicts: result.conflicts,
              summary: planSummary(result.plan),
              applied: result.applied ?? null
            },
            true
          );
        } else {
          print(formatGovern(result), false);
        }
        // Adoption succeeds even with conflicts, but signals that work remains.
        return result.conflicts.length > 0 && !optionBoolean(args, "force") ? 1 : 0;
      }

      case "inspect":
        print(await inspectProject(new ProjectContext(projectRoot(args))), json);
        return 0;

      case "status": {
        const summary = await projectStatus(projectRoot(args));
        print(json ? summary : formatStatus(summary), json);
        return summary.healthy ? 0 : 1;
      }

      case "diff": {
        const result = await diffProject(projectRoot(args));
        print(json ? result : formatDiff(result), json);
        return result.clean ? 0 : 1;
      }

      case "validate": {
        const result = await validateProject(projectRoot(args));
        printDiagnostics(result.diagnostics, json);
        return result.valid ? 0 : 1;
      }

      case "doctor": {
        const result = await doctorProject(projectRoot(args));
        printDiagnostics(result.diagnostics, json);
        return result.healthy ? 0 : 1;
      }

      case "plan": {
        const plan = await createPlan(projectRoot(args));
        print(json ? publicPlan(plan) : formatPlan(plan), json);
        return plan.entries.some((entry) => entry.action === "conflict") ? 1 : 0;
      }

      case "apply": {
        const root = projectRoot(args);
        const plan = await createPlan(root);
        const result = await applyPlan(plan, { force: optionBoolean(args, "force") });
        print(json ? result : formatApply(result), json);
        return 0;
      }

      case "upgrade": {
        const report = await upgradeProject(projectRoot(args), {
          apply: optionBoolean(args, "apply"),
          force: optionBoolean(args, "force")
        });
        if (json) {
          print(
            {
              projectRoot: report.projectRoot,
              available: report.available,
              current: report.current,
              unresolved: report.unresolved,
              summary: planSummary(report.plan),
              manifestChanged: report.manifestChanged,
              applied: report.applied ?? null,
              clean: report.clean
            },
            true
          );
        } else {
          print(formatUpgrade(report), false);
        }
        return report.plan.entries.some((entry) => entry.action === "conflict") ? 1 : 0;
      }

      case "migrate": {
        print(await migrateProject(projectRoot(args), optionBoolean(args, "apply")), json);
        return 0;
      }

      case "run": {
        const capability = args.positionals[0];
        if (!capability) {
          throw new ArmoniaError(
            "ARM070",
            "run requires a capability name, for example `armonia run test`"
          );
        }
        const timeout = optionInteger(args, "timeout");
        const component = optionString(args, "component");
        const result = await runCapability(projectRoot(args, 1), capability, {
          ...(component ? { component } : {}),
          dryRun: optionBoolean(args, "dry-run"),
          ...(timeout && timeout > 0 ? { timeout } : {})
        });
        if (optionBoolean(args, "dry-run") || json) {
          print(result, json);
        }
        return result.exitCode;
      }

      case "ci": {
        const capabilities = optionList(args, "capability");
        const timeout = optionInteger(args, "timeout");
        const results = await runPipeline(projectRoot(args), {
          dryRun: optionBoolean(args, "dry-run"),
          ...(capabilities ? { capabilities } : {}),
          ...(timeout && timeout > 0 ? { timeout } : {})
        });
        if (json || optionBoolean(args, "dry-run")) {
          print({ results }, json);
        }
        return results.find((result) => result.exitCode !== 0)?.exitCode ?? 0;
      }

      case "ui": {
        const port = optionInteger(args, "port");
        await startUiServer(projectRoot(args), {
          ...(port !== undefined ? { port } : {}),
          openBrowser: !optionBoolean(args, "no-open")
        });
        return 0;
      }

      case "explain": {
        const id = args.positionals[0];
        if (!id) {
          throw new ArmoniaError("ARM071", "explain requires a policy rule ID or a file path");
        }
        const definition = await getPolicyDefinition(id);
        if (definition) {
          print(definition, json);
          return 0;
        }
        const root = projectRoot(args, 1);
        const plan = await createPlan(root);
        const entry = plan.entries.find((candidate) => candidate.path === id);
        if (entry) {
          print(
            {
              file: entry.path,
              action: entry.action,
              ownership: entry.ownership,
              source: entry.source,
              reason: entry.reason,
              pack: entry.source.split("@")[0] ?? "unknown"
            },
            json
          );
          return 0;
        }
        const lock = await loadLockFile(root);
        const lockEntry = lock?.files[id];
        if (lockEntry) {
          print(
            {
              file: id,
              status: "managed",
              source: lockEntry.source,
              ownership: lockEntry.ownership,
              hash: lockEntry.hash,
              pack: lockEntry.source.split("@")[0] ?? "unknown"
            },
            json
          );
          return 0;
        }
        throw new ArmoniaError("ARM072", `Unknown policy rule or unmanaged file: ${id}`);
      }

      default:
        throw new ArmoniaError("ARM073", `Unknown command: ${args.command}`);
    }
  } catch (error) {
    const wrapped =
      error instanceof ArmoniaError
        ? error
        : new ArmoniaError(
            "ARM999",
            error instanceof Error ? error.message : "Unknown internal error",
            error
          );
    if (optionBoolean(args, "json")) {
      print({ error: { code: wrapped.code, message: wrapped.message, details: wrapped.details } }, true);
    } else {
      process.stderr.write(`Error ${wrapped.code}: ${wrapped.message}\n`);
    }
    if (USAGE_CODES.has(wrapped.code)) return 2;
    return wrapped.code === "ARM999" ? 3 : 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  process.exitCode = await runCli();
}

export type { ProjectManifest };
