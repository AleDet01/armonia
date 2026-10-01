import path from "node:path";
import { closestPackage, lineNumber, normalizePath, readTextFiles, walkFiles } from "./files.mjs";
import { compareText, secretPatterns, validManifest } from "./text.mjs";

const WORKFLOW_PATTERN = /^\.github\/workflows\/[^/]+\.ya?ml$/i;
const README_PATTERN = /(^|\/)readme(?:\.[^/]+)?$/i;
const DOCKER_PATTERN = /(^|\/)(?:dockerfile(?:\.[^/]+)?|[^/]+\.dockerfile)$/i;
const ENV_EXAMPLE_PATTERN = /(^|\/)\.env(?:\.[^/]+)?\.(?:example|sample|template)$|(^|\/)\.env\.example$/i;
const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|py|go|rs|rb|php|java|kt|cs|cpp|cc)$/i;

function evidence(source, line, label, value) {
  return { source: normalizePath(source), line, label, value };
}

function pushMatches(target, text, source, regex, create) {
  for (const match of text.matchAll(regex)) {
    target.push(create(match, evidence(source, lineNumber(text, match.index), "source", match[0])));
  }
}

function majorVersion(raw) {
  const match = String(raw).match(/(?:^|[^\d])(\d{1,3})(?:\.\d+)?/);
  return match ? Number(match[1]) : null;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function collectMarkdown(text, source, facts) {
  pushMatches(
    facts.links,
    text,
    source,
    /(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g,
    (match, at) => ({ target: match[1], evidence: at }),
  );

  const fencePattern = /```(?:bash|sh|shell|zsh|powershell|pwsh|cmd)?\s*\n([\s\S]*?)```/gi;
  for (const fence of text.matchAll(fencePattern)) {
    const start = lineNumber(text, fence.index);
    const lines = fence[1].split("\n");
    lines.forEach((line, offset) => {
      const clean = line.replace(/^\s*(?:\$|>)\s*/, "").trim();
      if (!clean || clean.startsWith("#")) return;
      collectCommand(clean, source, start + offset + 1, "documentation", facts);
    });
  }

  pushMatches(
    facts.runtimes,
    text,
    source,
    /Node(?:\.js)?\s*(?:version\s*)?(?:>=|>|=|v)?\s*(\d{1,3})(?:\.\d+){0,2}/gi,
    (match, at) => ({ runtime: "node", major: Number(match[1]), raw: match[0], kind: "documentation", evidence: at }),
  );

  pushMatches(
    facts.ports,
    text,
    source,
    /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):([1-9]\d{1,4})/g,
    (match, at) => ({ port: Number(match[1]), kind: "documentation", evidence: at }),
  );
}

function collectCommand(command, source, line, kind, facts) {
  facts.commands.push({ command, kind, evidence: evidence(source, line, kind, command) });
  const patterns = [
    /\bnpm\s+run\s+([\w:.-]+)/g,
    /\b(?:pnpm|bun)\s+(?:run\s+)?([\w:.-]+)/g,
    /\byarn\s+(?:run\s+)?([\w:.-]+)/g,
  ];
  for (const pattern of patterns) {
    for (const match of command.matchAll(pattern)) {
      if (["install", "add", "exec", "dlx", "init", "create", "audit", "update", "remove", "publish", "pack", "list", "outdated", "why", "config"].includes(match[1])) continue;
      facts.scriptReferences.push({ script: match[1], kind, evidence: evidence(source, line, kind, match[0]) });
    }
  }
  if (/\bnpm\s+test\b/.test(command)) {
    facts.scriptReferences.push({ script: "test", kind, evidence: evidence(source, line, kind, "npm test") });
  }
  if (/\bnpm\s+start\b/.test(command)) {
    facts.scriptReferences.push({ script: "start", kind, evidence: evidence(source, line, kind, "npm start") });
  }
}

function collectWorkflow(text, source, facts) {
  const lines = text.split("\n");
  let runIndent = null;
  lines.forEach((line, index) => {
    const run = line.match(/^\s*(?:-\s*)?run:\s*[>|-]?\s*(.*)$/);
    if (run?.[1]) collectCommand(run[1].trim(), source, index + 1, "workflow", facts);
    if (run) runIndent = /run:\s*[>|][+-]?\s*(?:#.*)?$/.test(line)
      ? /^[ \t]*/.exec(line)[0].length + (line.trimStart().startsWith("-") ? 2 : 0)
      : null;
    else if (runIndent !== null && line.trim()) {
      if (/^[ \t]*/.exec(line)[0].length > runIndent) collectCommand(line.trim(), source, index + 1, "workflow", facts);
      else runIndent = null;
    }

    const uses = line.match(/^\s*(?:-\s*)?uses:\s*["']?([^\s"']+)/);
    if (uses) {
      facts.actions.push({ reference: uses[1], evidence: evidence(source, index + 1, "workflow", uses[1]) });
    }

    const node = line.match(/node-version:\s*["']?([^\s#"']+)/i);
    if (node) {
      facts.runtimes.push({
        runtime: "node",
        major: majorVersion(node[1]),
        raw: node[1],
        kind: "workflow",
        evidence: evidence(source, index + 1, "workflow", line.trim()),
      });
    }
  });

  if (!/^\s*permissions\s*:/m.test(text)) {
    facts.workflowsWithoutPermissions.push(evidence(source, 1, "workflow", "permissions not declared"));
  }
}

function collectDocker(text, source, facts) {
  pushMatches(
    facts.runtimes,
    text,
    source,
    /^\s*FROM\s+node:([^\s@]+)/gim,
    (match, at) => ({ runtime: "node", major: majorVersion(match[1]), raw: match[1], kind: "container", evidence: at }),
  );
  pushMatches(
    facts.ports,
    text,
    source,
    /^\s*EXPOSE\s+(\d{2,5})/gim,
    (match, at) => ({ port: Number(match[1]), kind: "container", evidence: at }),
  );
  if (/^\s*FROM\s+[^\s:]+:latest\b/im.test(text)) {
    const match = text.match(/^\s*FROM\s+[^\s:]+:latest\b/im);
    facts.floatingImages.push(evidence(source, lineNumber(text, match?.index ?? 0), "container", match?.[0]?.trim() ?? "latest"));
  }
  let user = null;
  let currentStage = null;
  const stageUsers = new Map();
  for (const line of text.split("\n")) {
    const from = line.match(/^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i);
    if (from) {
      user = stageUsers.get(from[1].toLowerCase()) ?? null;
      currentStage = from[2]?.toLowerCase() ?? null;
      if (currentStage) stageUsers.set(currentStage, user);
    }
    const declared = line.match(/^\s*USER\s+(\S+)/i);
    if (declared) {
      user = declared[1];
      if (currentStage) stageUsers.set(currentStage, user);
    }
  }
  if (!user || /^(?:root|0+)(?::|$)/i.test(user) || user.includes("$")) {
    facts.rootContainers.push(evidence(source, 1, "container", user ? `USER ${user}` : "no final-stage USER instruction"));
  }
}

function collectEnv(text, source, kind, facts) {
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/);
    if (!match) return;
    facts.envDeclarations.push({ name: match[1], kind, evidence: evidence(source, index + 1, kind, match[1]) });
  });
}

function collectSource(text, source, facts) {
  const patterns = [
    /process\.env(?:\.([A-Z][A-Z0-9_]*)|\[["']([A-Z][A-Z0-9_]*)["']\])/g,
    /Deno\.env\.get\(["']([A-Z][A-Z0-9_]*)["']\)/g,
    /(?:os\.getenv|os\.environ\.get|std::env::var|env::var|System\.getenv)\(["']([A-Z][A-Z0-9_]*)["']\)/g,
    /os\.environ\[["']([A-Z][A-Z0-9_]*)["']\]/g,
  ];
  for (const regex of patterns) {
    for (const match of text.matchAll(regex)) {
      const name = match.slice(1).find(Boolean);
      const after = text.slice((match.index ?? 0) + match[0].length).trimStart();
      if (after.startsWith("??=")) continue;
      facts.envUses.push({ name, evidence: evidence(source, lineNumber(text, match.index), "source", name) });
    }
  }
}

function collectSecrets(text, source, facts) {
  for (const regex of secretPatterns()) {
    for (const match of text.matchAll(regex)) {
      facts.possibleSecrets.push(evidence(source, lineNumber(text, match.index), "source", `[redacted:${match[0].slice(0, 3)}…]`));
    }
  }
}

export async function collectFacts(root, config = {}) {
  const absoluteRoot = path.resolve(root);
  const walk = await walkFiles(absoluteRoot, {
    exclude: config.exclude ?? [],
    maxFiles: config.maxFiles ?? 10_000,
  });
  const { texts, skipped } = await readTextFiles(absoluteRoot, walk.files, config.maxFileBytes ?? 512_000);
  const fileSet = new Set(walk.files);
  const facts = {
    root: absoluteRoot,
    name: path.basename(absoluteRoot),
    files: walk.files,
    fileSet,
    texts,
    truncated: walk.truncated,
    skipped: [...walk.skipped, ...skipped],
    directories: walk.directories,
    packages: [],
    readmes: [],
    workflows: [],
    dockerfiles: [],
    commands: [],
    scriptReferences: [],
    runtimes: [],
    ports: [],
    envUses: [],
    envDeclarations: [],
    links: [],
    actions: [],
    workflowsWithoutPermissions: [],
    floatingImages: [],
    rootContainers: [],
    possibleSecrets: [],
    invalidJson: [],
  };

  for (const [source, text] of texts) {
    const base = path.posix.basename(source).toLowerCase();
    if (base === "package.json") {
      const data = parseJson(text);
      if (validManifest(data)) {
        const packageFact = { path: source, data, text };
        facts.packages.push(packageFact);
        if (data.engines?.node) {
          facts.runtimes.push({
            runtime: "node",
            major: majorVersion(data.engines.node),
            raw: data.engines.node,
            kind: "manifest",
            evidence: evidence(source, lineNumber(text, text.indexOf('"node"')), "manifest", data.engines.node),
          });
        }
      } else {
        facts.invalidJson.push(evidence(source, 1, "manifest", "invalid JSON or manifest field types"));
      }
    }
    if (README_PATTERN.test(source)) {
      facts.readmes.push(source);
      collectMarkdown(text, source, facts);
    }
    if (WORKFLOW_PATTERN.test(source)) {
      facts.workflows.push(source);
      collectWorkflow(text, source, facts);
    }
    if (DOCKER_PATTERN.test(source)) {
      facts.dockerfiles.push(source);
      collectDocker(text, source, facts);
    }
    if (ENV_EXAMPLE_PATTERN.test(source)) collectEnv(text, source, "env-example", facts);
    if (SOURCE_EXTENSIONS.test(source)) collectSource(text, source, facts);
    collectSecrets(text, source, facts);
  }

  facts.packages.sort((a, b) => compareText(a.path, b.path));
  for (const reference of facts.scriptReferences) {
    reference.package = closestPackage(facts.packages, reference.evidence.source);
  }
  return facts;
}
