#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { applyPlan } from "./apply.ts";
import { doctorProject } from "./doctor.ts";
import { getPolicyDefinition } from "./policy.ts";
import { initializeProject } from "./initialize.ts";
import { loadProjectManifest } from "./manifest.ts";
import { migrateProject } from "./migrate.ts";
import { createPlan } from "./planner.ts";
import { effectiveCapabilities, resolvePacks } from "./resolver.ts";
import { runCapability, runPipeline } from "./run.ts";
import { validateProject } from "./validate.ts";
import { ArmoniaError } from "./errors.ts";
import type { Diagnostic, Plan, ProjectManifest } from "./types.ts";

const VERSION = "1.0.0-rc.1";

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

function optionString(args: ParsedArguments, key: string): string | undefined {
  const value = args.options.get(key);
  return typeof value === "string" ? value : undefined;
}

function optionBoolean(args: ParsedArguments, key: string): boolean {
  return args.options.get(key) === true || args.options.get(key) === "true";
}

function root(args: ParsedArguments): string {
  return resolve(optionString(args, "root") ?? args.positionals[1] ?? ".");
}

function print(value: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  if (typeof value === "string") {
    process.stdout.write(`${value}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
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

function publicPlan(plan: Plan): unknown {
  return {
    projectRoot: plan.projectRoot,
    packs: plan.packs.map(({ manifest }) => ({
      id: manifest.metadata.id,
      version: manifest.metadata.version
    })),
    entries: plan.entries.map(({ desiredContent: _content, ...entry }) => entry),
    diagnostics: plan.diagnostics
  };
}

function help(): string {
  return `Armonìa ${VERSION}

Usage:
  armonia <command> [path] [options]

Commands:
  init [path]          Initialize a new governed repository
  adopt [path]         Detect and adopt an existing repository
  inspect [path]       Show manifest, packs, components, and capabilities
  validate [path]      Validate schema, packs, policies, and conflicts
  doctor [path]        Validate plus toolchain and generated-drift checks
  plan [path]          Preview generated-file changes
  apply [path]         Apply a conflict-free plan
  run <capability>     Run a semantic component capability
  ci [path]            Run available CI capabilities for every component
  upgrade [path]       Preview or apply the currently selected pack versions
  migrate [path]       Preview or apply a supported manifest migration
  explain <rule>       Explain a policy rule
  version              Print the CLI version

Common options:
  --root <path>        Explicit project root
  --json               Machine-readable output

Initialization options:
  --name <name> --id <id> --owner <owner> --description <text>
  --language <id> --archetype <id> --profile <profile> --visibility <visibility>
  --ai <adapter,...>
  --distribution-repository <owner/repo> --distribution-ref <sha-or-tag>

Mutation options:
  --force              Overwrite managed-file conflicts during apply
  --apply              Apply an upgrade or migration preview

Run options:
  --component <id> --dry-run`;
}

function manifestOptions(args: ParsedArguments): Parameters<typeof initializeProject>[1] {
  const value: Parameters<typeof initializeProject>[1] = {};
  const mappings: Array<[string, keyof typeof value]> = [
    ["name", "name"],
    ["id", "id"],
    ["owner", "owner"],
    ["description", "description"],
    ["language", "language"],
    ["archetype", "archetype"],
    ["distribution-repository", "distributionRepository"],
    ["distribution-ref", "distributionRef"]
  ];
  for (const [flag, property] of mappings) {
    const option = optionString(args, flag);
    if (option !== undefined) {
      Object.assign(value, { [property]: option });
    }
  }
  const profile = optionString(args, "profile");
  if (profile) {
    value.profile = profile as ProjectManifest["spec"]["profile"];
  }
  const visibility = optionString(args, "visibility");
  if (visibility) {
    value.visibility = visibility as ProjectManifest["spec"]["visibility"];
  }
  const adapters = optionString(args, "ai");
  if (adapters) {
    value.generatedAdapters = adapters.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return value;
}

async function inspectProject(projectRoot: string): Promise<unknown> {
  const manifest = await loadProjectManifest(projectRoot);
  const packs = await resolvePacks(projectRoot, manifest);
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
  const json = optionBoolean(args, "json");

  try {
    switch (args.command) {
      case "help":
      case "--help":
      case "-h":
        print(help(), false);
        return 0;
      case "version":
      case "--version":
        print(VERSION, json);
        return 0;
      case "init":
      case "adopt": {
        const projectRoot = resolve(args.positionals[0] ?? optionString(args, "root") ?? ".");
        const result = await initializeProject(projectRoot, manifestOptions(args), true);
        print(
          {
            projectRoot,
            mode: args.command,
            detections: result.detections,
            applied: result.applied
          },
          json
        );
        return 0;
      }
      case "inspect":
        print(await inspectProject(resolve(args.positionals[0] ?? optionString(args, "root") ?? ".")), json);
        return 0;
      case "validate": {
        const result = await validateProject(
          resolve(args.positionals[0] ?? optionString(args, "root") ?? ".")
        );
        printDiagnostics(result.diagnostics, json);
        return result.valid ? 0 : 1;
      }
      case "doctor": {
        const result = await doctorProject(
          resolve(args.positionals[0] ?? optionString(args, "root") ?? ".")
        );
        printDiagnostics(result.diagnostics, json);
        return result.healthy ? 0 : 1;
      }
      case "plan": {
        const plan = await createPlan(
          resolve(args.positionals[0] ?? optionString(args, "root") ?? ".")
        );
        print(publicPlan(plan), json);
        return plan.entries.some((entry) => entry.action === "conflict") ? 1 : 0;
      }
      case "apply": {
        const projectRoot = resolve(args.positionals[0] ?? optionString(args, "root") ?? ".");
        const plan = await createPlan(projectRoot);
        const result = await applyPlan(plan, optionBoolean(args, "force"));
        print(result, json);
        return 0;
      }
      case "run": {
        const capability = args.positionals[0];
        if (!capability) {
          throw new ArmoniaError("ARM070", "run requires a capability name");
        }
        const result = await runCapability(
          resolve(optionString(args, "root") ?? "."),
          capability,
          {
            component: optionString(args, "component"),
            dryRun: optionBoolean(args, "dry-run")
          }
        );
        if (optionBoolean(args, "dry-run") || json) {
          print(result, json);
        }
        return result.exitCode;
      }
      case "ci": {
        const projectRoot = resolve(args.positionals[0] ?? optionString(args, "root") ?? ".");
        const results = await runPipeline(projectRoot, {
          ...(optionBoolean(args, "dry-run") ? { dryRun: true } : {})
        });
        if (json || optionBoolean(args, "dry-run")) {
          print({ results }, json);
        }
        return results.find((result) => result.exitCode !== 0)?.exitCode ?? 0;
      }
      case "upgrade": {
        const projectRoot = resolve(args.positionals[0] ?? optionString(args, "root") ?? ".");
        const plan = await createPlan(projectRoot);
        if (optionBoolean(args, "apply")) {
          print(await applyPlan(plan, optionBoolean(args, "force")), json);
        } else {
          print(publicPlan(plan), json);
        }
        return plan.entries.some((entry) => entry.action === "conflict") ? 1 : 0;
      }
      case "migrate": {
        const projectRoot = resolve(args.positionals[0] ?? optionString(args, "root") ?? ".");
        print(await migrateProject(projectRoot, optionBoolean(args, "apply")), json);
        return 0;
      }
      case "explain": {
        const id = args.positionals[0];
        if (!id) {
          throw new ArmoniaError("ARM071", "explain requires a policy rule ID");
        }
        const definition = await getPolicyDefinition(id);
        if (!definition) {
          throw new ArmoniaError("ARM072", `Unknown policy rule: ${id}`);
        }
        print(definition, json);
        return 0;
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
    if (json) {
      print({ error: { code: wrapped.code, message: wrapped.message, details: wrapped.details } }, true);
    } else {
      process.stderr.write(`Error ${wrapped.code}: ${wrapped.message}\n`);
    }
    return wrapped.code === "ARM073" || wrapped.code === "ARM070" || wrapped.code === "ARM071"
      ? 2
      : wrapped.code === "ARM999"
        ? 3
        : 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  process.exitCode = await runCli();
}
