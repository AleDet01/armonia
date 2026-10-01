import { readFile } from "node:fs/promises";
import path from "node:path";
import { collectFacts } from "./collectors.mjs";
import { runChecks, scoreFindings } from "./checks.mjs";
import { validateConfig } from "./config.mjs";
import { compareText, safeText } from "./text.mjs";

export const REPORT_SCHEMA_VERSION = 1;
export const TOOL_VERSION = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")).version;

export async function readConfig(root, explicitPath) {
  const candidates = explicitPath
    ? [path.resolve(root, explicitPath)]
    : ["armonia.config.json", ".armoniarc.json"].map((name) => path.join(root, name));
  for (const candidate of candidates) {
    let text;
    try {
      text = await readFile(candidate, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT" && !explicitPath) continue;
      if (error?.code === "ENOENT") throw new Error(`Configuration not found: ${candidate}`);
      throw new Error(`Cannot read Armonia configuration: ${error.code ?? "read failure"}`);
    }
    let config;
    try { config = JSON.parse(text); }
    catch { throw new Error("Armonia configuration is not valid JSON"); }
    return validateConfig(config);
  }
  return {};
}

function countClaims(facts) {
  return (
    facts.packages.length +
    facts.commands.length +
    facts.runtimes.length +
    facts.ports.length +
    facts.envUses.length +
    facts.envDeclarations.length +
    facts.links.length +
    facts.actions.length +
    facts.files.length
  );
}

function buildGraph(findings) {
  const nodeMap = new Map();
  const edges = [];
  for (const finding of findings) {
    const sources = [];
    for (const item of finding.evidence) {
      if (!nodeMap.has(item.source)) {
        nodeMap.set(item.source, {
          id: item.source,
          kind: item.label,
        });
      }
      sources.push(item.source);
    }
    if (sources.length > 1) {
      edges.push({
        id: finding.fingerprint,
        ruleId: finding.ruleId,
        severity: finding.severity,
        sources: [...new Set(sources)],
      });
    }
  }
  return {
    nodes: [...nodeMap.values()].sort((a, b) => compareText(a.id, b.id)),
    edges,
  };
}

export async function scanRepository(root = ".", options = {}) {
  const absoluteRoot = path.resolve(root);
  const config = validateConfig(options.config ?? (await readConfig(absoluteRoot, options.configPath)));
  const facts = await collectFacts(absoluteRoot, config);
  const findings = runChecks(facts, config);
  const scoring = scoreFindings(findings);
  const counts = { critical: 0, error: 0, warning: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] += 1;

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    tool: { name: "armonia", version: TOOL_VERSION },
    repository: {
      name: safeText(config.name ?? facts.name),
      root: options.includeAbsolutePath ? safeText(absoluteRoot) : ".",
      files: facts.files.length,
      claims: countClaims(facts),
      truncated: facts.truncated,
      skipped: facts.skipped.map((item) => ({ source: safeText(item.source), reason: item.reason })),
    },
    score: scoring.score,
    grade: scoring.grade,
    categories: scoring.categories,
    counts,
    contradictions: findings.filter((finding) => finding.contradiction).length,
    findings,
    graph: buildGraph(findings),
  };
}

export function toSarif(report) {
  const rules = new Map();
  for (const finding of report.findings) {
    if (!rules.has(finding.ruleId)) {
      rules.set(finding.ruleId, {
        id: finding.ruleId,
        shortDescription: { text: finding.message },
        fullDescription: { text: finding.why },
        help: { text: finding.suggestion },
        properties: { category: finding.category },
      });
    }
  }
  const level = { critical: "error", error: "error", warning: "warning", info: "note" };
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "Armonia",
            version: report.tool.version,
            informationUri: "https://github.com/AleDet01/Armonia",
            rules: [...rules.values()],
          },
        },
        results: report.findings.map((finding) => ({
          ruleId: finding.ruleId,
          level: level[finding.severity],
          message: { text: finding.message },
          locations: finding.evidence.slice(0, 1).map((item) => ({
            physicalLocation: {
              artifactLocation: { uri: item.source.split("/").map(encodeURIComponent).join("/") },
              region: { startLine: Math.max(1, item.line || 1) },
            },
          })),
          relatedLocations: finding.evidence.slice(1).map((item, index) => ({
            id: index + 1,
            message: { text: `${item.label}: ${item.value}` },
            physicalLocation: {
              artifactLocation: { uri: item.source.split("/").map(encodeURIComponent).join("/") },
              region: { startLine: Math.max(1, item.line || 1) },
            },
          })),
          partialFingerprints: { armoniaFingerprint: finding.fingerprint },
          properties: { category: finding.category, contradiction: finding.contradiction },
        })),
      },
    ],
  };
}

export function formatTerminal(report, { color = process.stdout.isTTY } = {}) {
  const paint = color
    ? {
        critical: (value) => `\u001b[91m${value}\u001b[0m`,
        error: (value) => `\u001b[31m${value}\u001b[0m`,
        warning: (value) => `\u001b[33m${value}\u001b[0m`,
        info: (value) => `\u001b[36m${value}\u001b[0m`,
        strong: (value) => `\u001b[1m${value}\u001b[0m`,
        dim: (value) => `\u001b[2m${value}\u001b[0m`,
      }
    : Object.fromEntries(["critical", "error", "warning", "info", "strong", "dim"].map((key) => [key, (value) => value]));

  const lines = [];
  lines.push("");
  lines.push(`${paint.strong("ARMONIA")}  ${report.repository.name}`);
  lines.push(`${paint.strong(`${report.score}/100`)} · grade ${report.grade} · ${report.repository.claims} claims · ${report.contradictions} contradictions`);
  lines.push("");
  if (report.findings.length === 0) {
    lines.push("✓ No contradictions or readiness gaps found.");
  }
  for (const finding of report.findings) {
    const marker = finding.severity === "critical" ? "!!" : finding.severity === "error" ? "×" : finding.severity === "warning" ? "!" : "·";
    lines.push(`${paint[finding.severity](`${marker} ${finding.severity.toUpperCase()}`)} ${paint.strong(finding.message)}`);
    lines.push(`  ${paint.dim(finding.ruleId)} · ${finding.why}`);
    for (const item of finding.evidence) {
      lines.push(`  ↳ ${item.source}:${item.line}  ${item.value}`);
    }
    if (finding.suggestion) lines.push(`  fix: ${finding.suggestion}`);
    lines.push("");
  }
  lines.push(`Summary  ${report.counts.critical} critical · ${report.counts.error} errors · ${report.counts.warning} warnings · ${report.counts.info} notes`);
  return lines.join("\n");
}
