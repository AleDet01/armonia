#!/usr/bin/env node

import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { formatTerminal, scanRepository, toSarif } from "../src/core/report.mjs";

const VERSION = "0.1.0";
const SEVERITY = { critical: 0, error: 1, warning: 2, info: 3, never: 99 };

function help() {
  return `
Armonia ${VERSION} — reconcile repository truth

Usage:
  armonia scan [path] [--format terminal|json|sarif] [--output file]
  armonia portfolio [--registry file] [--output file]
  armonia init [path]
  armonia rules

Scan options:
  --config <file>       Use an explicit configuration file
  --fail-on <severity>  critical, error, warning, info, or never (default: error)
  --format <format>     terminal, json, or sarif (default: terminal)
  --output <file>       Write output atomically instead of stdout
  --no-color            Disable ANSI colors

Armonia performs no network requests and never includes detected secret values
in a report. Exit code 1 means the selected severity threshold was reached.
`.trim();
}

function parseArguments(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      options._.push(token);
      continue;
    }
    if (token === "--no-color") {
      options.color = false;
      continue;
    }
    const [name, inline] = token.slice(2).split("=", 2);
    const value = inline ?? argv[index + 1];
    if (inline === undefined) index += 1;
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
    options[name.replaceAll("-", "_")] = value;
  }
  return options;
}

async function writeOutput(target, content) {
  const absolute = path.resolve(target);
  await mkdir(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  await writeFile(temporary, content, "utf8");
  const { rename } = await import("node:fs/promises");
  await rename(temporary, absolute);
}

function serialize(report, format, color) {
  if (format === "terminal") return `${formatTerminal(report, { color })}\n`;
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  if (format === "sarif") return `${JSON.stringify(toSarif(report), null, 2)}\n`;
  throw new Error(`Unsupported format “${format}”. Use terminal, json, or sarif.`);
}

function thresholdReached(report, threshold) {
  const target = SEVERITY[threshold];
  if (target === undefined) throw new Error(`Unsupported severity “${threshold}”.`);
  if (threshold === "never") return false;
  return report.findings.some((finding) => SEVERITY[finding.severity] <= target);
}

async function scanCommand(options) {
  const root = path.resolve(options._[0] ?? ".");
  const format = options.format ?? "terminal";
  const threshold = options.fail_on ?? "error";
  const report = await scanRepository(root, { configPath: options.config });
  const content = serialize(report, format, options.color);
  if (options.output) await writeOutput(options.output, content);
  else process.stdout.write(content);
  return thresholdReached(report, threshold) ? 1 : 0;
}

async function portfolioCommand(options) {
  const registryPath = path.resolve(options.registry ?? "portfolio/registry.json");
  const registryRoot = path.dirname(registryPath);
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  if (!Array.isArray(registry.repositories)) {
    throw new Error("Portfolio registry must contain a repositories array.");
  }

  const repositories = [];
  for (const entry of registry.repositories) {
    const repositoryRoot = path.resolve(registryRoot, entry.path);
    let available = false;
    try {
      available = (await stat(repositoryRoot)).isDirectory();
    } catch {
      available = false;
    }
    if (!available) {
      repositories.push({
        ...portfolioMetadata(entry),
        available: false,
        score: null,
        grade: null,
        claims: 0,
        contradictions: 0,
        findings: 0,
      });
      continue;
    }

    try {
      const report = await scanRepository(repositoryRoot);
      repositories.push({
        ...portfolioMetadata(entry),
        available: true,
        score: report.score,
        grade: report.grade,
        claims: report.repository.claims,
        contradictions: report.contradictions,
        findings: report.findings.length,
      });
    } catch (error) {
      repositories.push({
        ...portfolioMetadata(entry),
        available: false,
        score: null,
        grade: null,
        claims: 0,
        contradictions: 0,
        findings: 0,
        error: error.message,
      });
    }
  }

  const snapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    repositories,
  };
  const output = options.output ?? "portfolio/snapshot.json";
  await writeOutput(output, `${JSON.stringify(snapshot, null, 2)}\n`);
  process.stdout.write(`Armonia mapped ${repositories.filter((item) => item.available).length}/${repositories.length} repositories → ${output}\n`);
  return 0;
}

function portfolioMetadata(entry) {
  return {
    slug: entry.slug,
    name: entry.name,
    description: entry.description,
    domain: entry.domain,
    stack: entry.stack ?? [],
    relation: entry.relation,
  };
}

async function initCommand(options) {
  const root = path.resolve(options._[0] ?? ".");
  await mkdir(root, { recursive: true });
  const configPath = path.join(root, "armonia.config.json");
  try {
    await access(configPath);
    throw new Error(`${configPath} already exists; Armonia will not overwrite it.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const config = {
    $schema: "./schema/armonia.schema.json",
    failOn: "error",
    exclude: ["fixtures/**", "generated/**"],
    rules: { disable: [] },
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`Created ${path.relative(process.cwd(), configPath) || configPath}\nRun “armonia scan .” to establish the first evidence baseline.\n`);
  return 0;
}

function rulesCommand() {
  const groups = {
    trust: ["scan/file-limit"],
    docs: ["public/readme", "command/missing-script", "docs/broken-relative-link", "environment/stale-example"],
    delivery: ["manifest/invalid-json", "package-manager/multiple-lockfiles", "package-manager/undeclared", "command/posix-env-assignment", "manifest/missing-entrypoint", "dependency/floating-version", "delivery/no-ci", "delivery/no-test-script"],
    runtime: ["runtime/node-drift", "runtime/port-drift", "environment/undocumented"],
    security: ["security/floating-action", "security/workflow-permissions", "security/floating-container-image", "security/container-root", "security/possible-secret", "security/env-file-present"],
    community: ["public/license", "public/contributing", "public/security", "public/code-of-conduct"],
  };
  for (const [group, rules] of Object.entries(groups)) {
    process.stdout.write(`${group}\n${rules.map((rule) => `  ${rule}`).join("\n")}\n\n`);
  }
  return 0;
}

export async function main(argv = process.argv.slice(2)) {
  const [command = "help", ...rest] = argv;
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(`${help()}\n`);
    return 0;
  }
  if (["--version", "-v", "version"].includes(command)) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  const options = parseArguments(rest);
  if (command === "scan") return scanCommand(options);
  if (command === "portfolio") return portfolioCommand(options);
  if (command === "init") return initCommand(options);
  if (command === "rules") return rulesCommand();
  throw new Error(`Unknown command “${command}”.\n\n${help()}`);
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isEntrypoint) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`Armonia: ${error.message}\n`);
      process.exitCode = 2;
    });
}
