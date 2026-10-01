import { createHash } from "node:crypto";
import path from "node:path";
import { compareText, nodeMajorsConflict, safeText, STANDARD_ENV } from "./text.mjs";
import { closestPackage } from "./files.mjs";

const SEVERITY_ORDER = { critical: 0, error: 1, warning: 2, info: 3 };
const PENALTY = { critical: 24, error: 10, warning: 3, info: 0 };

function stableFingerprint(ruleId, message, evidence) {
  const identity = [
    ruleId,
    message,
    ...evidence.map((item) => `${item.source}:${item.line}:${item.value}`).sort(),
  ].join("\n");
  return createHash("sha256").update(identity).digest("hex").slice(0, 16);
}

function makeFinding({
  ruleId,
  category,
  severity,
  message,
  why,
  evidence = [],
  suggestion,
  contradiction = false,
}) {
  message = safeText(message);
  why = safeText(why);
  suggestion = suggestion === undefined ? undefined : safeText(suggestion);
  evidence = evidence.map((item) => ({ ...item, source: safeText(item.source), label: safeText(item.label), value: safeText(item.value) }));
  return {
    ruleId,
    category,
    severity,
    message,
    why,
    evidence,
    suggestion,
    contradiction,
    fingerprint: stableFingerprint(ruleId, message, evidence),
  };
}

function rootPackage(facts) {
  return facts.packages.find((item) => item.path === "package.json") ?? null;
}

function fileEvidence(source, value = source) {
  return { source, line: 1, label: "repository", value };
}

function hasAnyFile(facts, patterns) {
  return facts.files.some((file) => patterns.some((pattern) => pattern.test(file)));
}

function relativeTarget(source, target) {
  let clean = target.replace(/^<|>$/g, "");
  try {
    clean = decodeURIComponent(clean);
  } catch {
    // Keep malformed links as-is so the missing path remains explainable.
  }
  clean = clean.split(/[?#]/)[0];
  if (!clean) return null;
  if (/^(?:[a-z]+:|#|\/\/)/i.test(clean)) return null;
  const base = clean.startsWith("/") ? "" : path.posix.dirname(source);
  return path.posix.normalize(path.posix.join(base, clean)).replace(/^\.\//, "");
}

function packageDirectory(packagePath) {
  const directory = path.posix.dirname(packagePath);
  return directory === "." ? "" : directory;
}

export function runChecks(facts, config = {}) {
  const findings = [];
  const disabled = new Set(config.rules?.disable ?? []);
  const add = (finding) => {
    if (!disabled.has(finding.ruleId)) findings.push(makeFinding(finding));
  };

  if (facts.truncated) {
    add({
      ruleId: "scan/file-limit",
      category: "trust",
      severity: "warning",
      message: "The scan reached its configured file limit",
      why: "A partial evidence set can hide contradictions and lowers confidence in the result.",
      evidence: [fileEvidence(".", `maxFiles=${config.maxFiles ?? 10_000}`)],
      suggestion: "Raise maxFiles or narrow the repository with explicit exclude patterns.",
    });
  }

  if (facts.skipped?.length) {
    add({
      ruleId: "scan/incomplete",
      category: "trust",
      severity: "warning",
      message: `${facts.skipped.length} paths could not be fully inspected`,
      why: "Unreadable, binary or oversized text candidates are not evidence of a clean repository.",
      evidence: facts.skipped.slice(0, 8).map((item) => fileEvidence(item.source, item.reason)),
      suggestion: "Review skipped paths and size limits; rescan a stable, readable checkout.",
    });
  }

  for (const invalid of facts.invalidJson) {
    add({
      ruleId: "manifest/invalid-json",
      category: "delivery",
      severity: "error",
      message: `${invalid.source} is not a valid package manifest`,
      why: "Package tooling cannot interpret a malformed manifest reliably.",
      evidence: [invalid],
      suggestion: "Repair JSON syntax and field types before relying on other manifest checks.",
    });
  }

  if (!hasAnyFile(facts, [/(^|\/)readme(?:\.[^/]+)?$/i])) {
    add({
      ruleId: "public/readme",
      category: "docs",
      severity: "error",
      message: "No README was found",
      why: "A public repository needs a discoverable explanation of its purpose and first successful workflow.",
      evidence: [fileEvidence("README.md", "missing")],
      suggestion: "Add a root README with purpose, quick start, support and contribution paths.",
    });
  }

  const publicFiles = [
    {
      ruleId: "public/license",
      severity: "error",
      message: "No license file was found",
      why: "Source without an explicit license is not safely reusable as open source.",
      suggestion: "Add a LICENSE file and align package metadata with it.",
      patterns: [/(^|\/)licen[cs]e(?:\.|$)/i, /(^|\/)copying(?:\.|$)/i],
      expected: "LICENSE",
    },
    {
      ruleId: "public/contributing",
      severity: "warning",
      message: "Contribution guidance is missing",
      why: "Potential contributors need one authoritative path for setup, tests and review expectations.",
      suggestion: "Add CONTRIBUTING.md with a reproducible local validation flow.",
      patterns: [/(^|\/)contributing(?:\.|$)/i],
      expected: "CONTRIBUTING.md",
    },
    {
      ruleId: "public/security",
      severity: "warning",
      message: "A security policy is missing",
      why: "Public maintainers need a private, explicit route for vulnerability reports.",
      suggestion: "Add SECURITY.md with supported versions and a private contact route.",
      patterns: [/(^|\/)security\.md$/i],
      expected: "SECURITY.md",
    },
    {
      ruleId: "public/code-of-conduct",
      severity: "info",
      message: "A code of conduct is missing",
      why: "Community expectations are easier to enforce when they are written before a conflict occurs.",
      suggestion: "Add CODE_OF_CONDUCT.md before inviting broad public contribution.",
      patterns: [/(^|\/)code[-_]of[-_]conduct(?:\.|$)/i],
      expected: "CODE_OF_CONDUCT.md",
    },
  ];

  for (const publicFile of publicFiles) {
    if (!hasAnyFile(facts, publicFile.patterns)) {
      add({
        ...publicFile,
        category: "community",
        evidence: [fileEvidence(publicFile.expected, "missing")],
      });
    }
  }

  const lockNames = new Map([
    ["package-lock.json", "npm"],
    ["npm-shrinkwrap.json", "npm"],
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
  ]);
  const lockGroups = new Map();
  for (const file of facts.files) {
    const manager = lockNames.get(path.posix.basename(file).toLowerCase());
    if (!manager) continue;
    const directory = path.posix.dirname(file);
    const group = lockGroups.get(directory) ?? [];
    group.push({ manager, file });
    lockGroups.set(directory, group);
  }
  for (const locks of lockGroups.values()) {
    const managers = new Set(locks.map((item) => item.manager));
    if (managers.size > 1) {
      add({
        ruleId: "package-manager/multiple-lockfiles",
        category: "delivery",
        severity: "error",
        message: `Multiple package managers own the same workspace: ${[...managers].join(", ")}`,
        why: "Competing lockfiles can resolve different dependency graphs on different machines.",
        evidence: locks.map((item) => fileEvidence(item.file, item.manager)),
        suggestion: "Choose one package manager and remove only the obsolete lockfiles.",
        contradiction: true,
      });
    }
  }

  const root = rootPackage(facts);
  const rootLocks = lockGroups.get(".") ?? [];
  if (root && rootLocks.length === 1 && !root.data.packageManager) {
    add({
      ruleId: "package-manager/undeclared",
      category: "delivery",
      severity: "warning",
      message: `The ${rootLocks[0].manager} lockfile has no packageManager declaration`,
      why: "A lockfile identifies the tool family but not the exact version expected by contributors and CI.",
      evidence: [fileEvidence(root.path, "packageManager missing"), fileEvidence(rootLocks[0].file, rootLocks[0].manager)],
      suggestion: `Add a packageManager field with the tested ${rootLocks[0].manager} version.`,
      contradiction: true,
    });
  }

  for (const reference of facts.scriptReferences) {
    const packageFact = reference.package;
    if (!packageFact) continue;
    const scripts = packageFact.data.scripts ?? {};
    if (!Object.hasOwn(scripts, reference.script)) {
      add({
        ruleId: "command/missing-script",
        category: reference.kind === "workflow" ? "delivery" : "docs",
        severity: reference.kind === "workflow" ? "error" : "warning",
        message: `${reference.evidence.source} invokes missing script “${reference.script}”`,
        why: "A documented or automated command must resolve to an executable package script.",
        evidence: [
          reference.evidence,
          fileEvidence(packageFact.path, `scripts.${reference.script} missing`),
        ],
        suggestion: `Add scripts.${reference.script} or update the command to the canonical script name.`,
        contradiction: true,
      });
    }
  }

  for (const packageFact of facts.packages) {
    const scripts = packageFact.data.scripts ?? {};
    for (const [name, command] of Object.entries(scripts)) {
      if (typeof command === "string" && /^\s*[A-Z_][A-Z0-9_]*=[^\s]+\s+/.test(command)) {
        add({
          ruleId: "command/posix-env-assignment",
          category: "delivery",
          severity: "warning",
          message: `Script “${name}” uses a POSIX-only environment assignment`,
          why: "The script fails under the default Windows command shell.",
          evidence: [fileEvidence(packageFact.path, `${name}: ${command}`)],
          suggestion: "Set the default in application code or use a cross-platform environment helper.",
        });
      }
    }

    for (const field of ["main", "module", "types"]) {
      const value = packageFact.data[field];
      if (typeof value !== "string" || /[*?]/.test(value)) continue;
      const target = path.posix.normalize(path.posix.join(packageDirectory(packageFact.path), value));
      if (!facts.fileSet.has(target)) {
        add({
          ruleId: "manifest/missing-entrypoint",
          category: "delivery",
          severity: "error",
          message: `${packageFact.path} points ${field} to a missing file`,
          why: "Published consumers will receive a manifest entry that cannot be resolved.",
          evidence: [fileEvidence(packageFact.path, `${field}: ${value}`), fileEvidence(target, "missing")],
          suggestion: `Build or correct the ${field} entry before publishing.`,
          contradiction: true,
        });
      }
    }

    for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      for (const [name, version] of Object.entries(packageFact.data[section] ?? {})) {
        if (version === "*" || version === "latest") {
          add({
            ruleId: "dependency/floating-version",
            category: "security",
            severity: "warning",
            message: `${name} uses the floating version “${version}”`,
            why: "Unbounded dependency resolution makes future installs non-reproducible.",
            evidence: [fileEvidence(packageFact.path, `${section}.${name}: ${version}`)],
            suggestion: "Declare an intentional version range and refresh the lockfile.",
          });
        }
      }
    }
  }

  const nodeFacts = facts.runtimes.filter((item) => item.runtime === "node" && item.major !== null);
  const runtimeGroups = new Map();
  for (const runtime of nodeFacts) {
    const scope = closestPackage(facts.packages, runtime.evidence.source)?.path ?? ".";
    const group = runtimeGroups.get(scope) ?? [];
    group.push(runtime);
    runtimeGroups.set(scope, group);
  }
  for (const group of runtimeGroups.values()) {
    const nodeMajors = new Set(group.map((item) => item.major));
    if (nodeMajorsConflict(group.map((item) => item.raw))) {
      add({
        ruleId: "runtime/node-drift",
        category: "runtime",
        severity: "error",
        message: `Node runtime declarations disagree: ${[...nodeMajors].sort((a, b) => a - b).join(", ")}`,
        why: "Local development, CI and production can execute materially different JavaScript behavior.",
        evidence: group.map((item) => item.evidence).sort((a, b) => compareText(a.source, b.source) || a.line - b.line || compareText(String(a.value), String(b.value))).slice(0, 8),
        suggestion: "Align incompatible runtime requirements; this check compares simple major-level declarations, not full semver ranges.",
        contradiction: true,
      });
    }
  }

  const documentedPorts = [...new Set(facts.ports.filter((item) => item.kind === "documentation").map((item) => item.port))];
  const containerPorts = [...new Set(facts.ports.filter((item) => item.kind === "container").map((item) => item.port))];
  if (documentedPorts.length === 1 && containerPorts.length === 1 && documentedPorts[0] !== containerPorts[0]) {
    add({
      ruleId: "runtime/port-drift",
      category: "runtime",
      severity: "error",
      message: `Documented port ${documentedPorts[0]} disagrees with container port ${containerPorts[0]}`,
      why: "Users following the documented address will not reach the containerized service.",
      evidence: [
        facts.ports.find((item) => item.kind === "documentation").evidence,
        facts.ports.find((item) => item.kind === "container").evidence,
      ],
      suggestion: "Align the documented URL, application binding and container exposure.",
      contradiction: true,
    });
  }

  const declaredEnv = new Map();
  for (const declaration of facts.envDeclarations) {
    if (!declaredEnv.has(declaration.name)) declaredEnv.set(declaration.name, declaration);
  }
  const usedEnv = new Map();
  for (const use of facts.envUses) {
    if (!usedEnv.has(use.name)) usedEnv.set(use.name, use);
  }
  for (const [name, use] of usedEnv) {
    if (STANDARD_ENV.has(name) || declaredEnv.has(name)) continue;
    add({
      ruleId: "environment/undocumented",
      category: "runtime",
      severity: "warning",
      message: `Environment variable ${name} is used but not documented in an env example`,
      why: "A fresh checkout cannot discover all configuration required by the source.",
      evidence: [use.evidence, fileEvidence(".env.example", `${name} missing`)],
      suggestion: `Add ${name} with a safe placeholder and explanation to .env.example.`,
      contradiction: true,
    });
  }
  for (const [name, declaration] of declaredEnv) {
    if (usedEnv.has(name)) continue;
    add({
      ruleId: "environment/stale-example",
      category: "docs",
      severity: "info",
      message: `Environment example declares ${name}, but no source usage was found`,
      why: "Stale setup instructions create unnecessary configuration work and uncertainty.",
      evidence: [declaration.evidence],
      suggestion: "Check for non-source consumers before removing a stale entry.",
    });
  }

  for (const link of facts.links) {
    const target = relativeTarget(link.evidence.source, link.target);
    if (!target || target.startsWith("..")) continue;
    const normalized = target.replace(/\/$/, "");
    const exists = normalized === "." || facts.fileSet.has(normalized) || facts.directories?.includes(normalized);
    if (!exists) {
      add({
        ruleId: "docs/broken-relative-link",
        category: "docs",
        severity: "warning",
        message: `${link.evidence.source} links to missing path “${target}”`,
        why: "Broken repository-local links block onboarding and make documentation unverifiable.",
        evidence: [link.evidence, fileEvidence(target, "missing")],
        suggestion: "Correct the relative path or restore the referenced file.",
        contradiction: true,
      });
    }
  }

  for (const action of facts.actions) {
    const [, ref] = action.reference.split("@");
    if (ref && /^(?:main|master|develop|dev|head)$/i.test(ref)) {
      add({
        ruleId: "security/floating-action",
        category: "security",
        severity: "error",
        message: `GitHub Action ${action.reference} uses a mutable branch`,
        why: "A branch can change without review and alter privileged CI behavior.",
        evidence: [action.evidence],
        suggestion: "Pin the action to a reviewed commit SHA and let an updater manage revisions.",
      });
    }
  }

  for (const workflow of facts.workflowsWithoutPermissions) {
    add({
      ruleId: "security/workflow-permissions",
      category: "security",
      severity: "warning",
      message: `${workflow.source} does not declare token permissions`,
      why: "Explicit least-privilege permissions reduce the impact of a compromised workflow step.",
      evidence: [workflow],
      suggestion: "Declare top-level permissions and elevate only the jobs that require more access.",
    });
  }

  for (const image of facts.floatingImages) {
    add({
      ruleId: "security/floating-container-image",
      category: "security",
      severity: "warning",
      message: `${image.source} uses a latest container tag`,
      why: "The same build can silently resolve a different base image later.",
      evidence: [image],
      suggestion: "Pin a version or digest and update it deliberately.",
    });
  }

  for (const container of facts.rootContainers) {
    add({
      ruleId: "security/container-root",
      category: "security",
      severity: "warning",
      message: `${container.source} does not declare a non-root user`,
      why: "A process running as root increases the impact of a container escape or application compromise.",
      evidence: [container],
      suggestion: "Create or select a non-root runtime user and switch with USER.",
    });
  }

  for (const secret of facts.possibleSecrets) {
    add({
      ruleId: "security/possible-secret",
      category: "security",
      severity: "critical",
      message: `A possible credential is embedded in ${secret.source}`,
      why: "Committed credentials can be harvested from history even after the visible line is removed.",
      evidence: [{ ...secret, value: "[redacted]" }],
      suggestion: "Revoke the credential, remove it from history, and replace it with an environment reference.",
    });
  }

  const sensitiveFiles = facts.files.filter((file) => /(^|\/)\.env(?:\.[^/]+)?$/i.test(file) && !/(?:example|sample|template)$/i.test(file));
  for (const file of sensitiveFiles) {
    add({
      ruleId: "security/env-file-present",
      category: "security",
      severity: "warning",
      message: `Potentially sensitive environment file ${file} is present`,
      why: "Local secret files are easy to add to a commit accidentally.",
      evidence: [fileEvidence(file, "sensitive filename")],
      suggestion: "Confirm it is ignored and keep only a redacted example under version control.",
    });
  }

  if (facts.workflows.length === 0 && facts.files.some((file) => /(^|\/)(?:src|app|lib)\//.test(file))) {
    add({
      ruleId: "delivery/no-ci",
      category: "delivery",
      severity: "warning",
      message: "No GitHub Actions workflow was found",
      why: "A public project needs at least one reproducible validation path that does not depend on a maintainer's machine.",
      evidence: [fileEvidence(".github/workflows", "no workflow files")],
      suggestion: "Add a least-privilege workflow that runs the same check command documented for contributors.",
    });
  }

  if (root && !root.data.scripts?.test) {
    add({
      ruleId: "delivery/no-test-script",
      category: "delivery",
      severity: "warning",
      message: "The root package has no test script",
      why: "Contributors and automation need one canonical entry point for behavioral verification.",
      evidence: [fileEvidence(root.path, "scripts.test missing")],
      suggestion: "Add a test script, even if it initially runs a small smoke suite.",
    });
  }

  findings.sort((a, b) => {
    const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return severity || compareText(a.ruleId, b.ruleId) || compareText(a.fingerprint, b.fingerprint);
  });
  return findings;
}

export function scoreFindings(findings) {
  const categoryNames = ["trust", "docs", "delivery", "runtime", "security", "community"];
  const groupedPenalty = new Map();
  for (const finding of findings) {
    const key = `${finding.category}:${finding.ruleId}`;
    const current = groupedPenalty.get(key) ?? 0;
    const cap = finding.severity === "critical" ? 30 : 20;
    groupedPenalty.set(key, Math.min(cap, current + PENALTY[finding.severity]));
  }

  const categories = {};
  for (const category of categoryNames) {
    const penalty = [...groupedPenalty.entries()]
      .filter(([key]) => key.startsWith(`${category}:`))
      .reduce((sum, [, value]) => sum + value, 0);
    categories[category] = Math.max(0, 100 - penalty);
  }

  const activeCategories = categoryNames.filter((category) =>
    findings.some((finding) => finding.category === category),
  );
  const relevant = activeCategories.length > 0 ? activeCategories : categoryNames;
  const categoryAverage = Math.round(
    relevant.reduce((sum, category) => sum + categories[category], 0) / relevant.length,
  );
  const ceiling = findings.some((finding) => finding.severity === "critical")
    ? 49
    : findings.some((finding) => finding.severity === "error")
      ? 79
      : findings.some((finding) => finding.severity === "warning")
        ? 94
        : 100;
  const score = Math.min(categoryAverage, ceiling);
  const grade = score >= 95 ? "A+" : score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  return { score, grade, categories };
}
