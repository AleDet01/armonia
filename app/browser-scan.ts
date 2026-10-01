export type BrowserEvidence = {
  source: string;
  line: number;
};

export type BrowserFinding = {
  ruleId: string;
  severity: "critical" | "error" | "warning" | "info";
  message: string;
  detail: string;
  suggestion: string;
  evidence: BrowserEvidence[];
};

export type BrowserScanReport = {
  files: number;
  skipped: number;
  claims: number;
  score: number;
  grade: string;
  counts: Record<BrowserFinding["severity"], number>;
  findings: BrowserFinding[];
};

type TextFile = { path: string; text: string };
type Runtime = { major: number; source: string; line: number };
type Port = { value: number; kind: "documentation" | "container"; source: string; line: number };
type EnvUse = { name: string; source: string; line: number };

const IGNORED_DIRECTORIES = new Set([
  ".git", ".hg", ".svn", ".next", ".vinext", ".wrangler", ".turbo",
  ".cache", ".venv", "venv", "node_modules", "coverage", "dist", "out",
  "target", "vendor", "__pycache__",
]);

const TEXT_EXTENSIONS = new Set([
  "c", "cc", "conf", "cpp", "cs", "css", "dockerfile", "env", "go", "h",
  "hpp", "html", "ini", "java", "js", "json", "jsx", "kt", "md", "mdx",
  "mjs", "mts", "php", "properties", "ps1", "py", "rb", "rs", "sh", "toml",
  "ts", "tsx", "txt", "xml", "yaml", "yml",
]);

const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?|py|go|rs|rb|php|java|kt|cs|cpp|cc)$/i;
const README = /(^|\/)readme(?:\.[^/]+)?$/i;
const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/i;
const DOCKER = /(^|\/)(?:dockerfile(?:\.[^/]+)?|[^/]+\.dockerfile)$/i;
const ENV_EXAMPLE = /(^|\/)\.env(?:\.[^/]+)?\.(?:example|sample|template)$|(^|\/)\.env\.example$/i;

function lineNumber(text: string, index: number | undefined) {
  return text.slice(0, Math.max(0, index ?? 0)).split("\n").length;
}

function majorVersion(value: string) {
  const match = value.match(/(?:^|[^\d])(\d{1,3})(?:\.\d+)?/);
  return match ? Number(match[1]) : null;
}

function isTextCandidate(path: string) {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  const extension = name.split(".").pop() ?? "";
  return (
    TEXT_EXTENSIONS.has(extension) ||
    ["dockerfile", "gemfile", "makefile", "procfile", "license", "notice", ".gitignore", ".npmrc"].includes(name) ||
    name.startsWith("readme") ||
    name.startsWith("license") ||
    name.startsWith(".env")
  );
}

function normalizeFiles(files: FileList | File[]) {
  const selected = Array.from(files).map((file) => ({
    file,
    path: (file.webkitRelativePath || file.name).replaceAll("\\", "/"),
  }));
  const root = selected.length > 0 && selected.every(({ path }) => path.includes("/"))
    ? selected[0].path.split("/")[0]
    : null;
  return selected
    .map(({ file, path }) => ({ file, path: root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path }))
    .filter(({ path }) => path && !path.split("/").some((part) => IGNORED_DIRECTORIES.has(part.toLowerCase())))
    .filter(({ path }) => isTextCandidate(path));
}

function addFinding(
  findings: BrowserFinding[],
  finding: Omit<BrowserFinding, "evidence"> & { evidence?: BrowserEvidence[] },
) {
  findings.push({ ...finding, evidence: finding.evidence ?? [] });
}

function score(findings: BrowserFinding[]) {
  const counts: BrowserScanReport["counts"] = { critical: 0, error: 0, warning: 0, info: 0 };
  const penalties = { critical: 24, error: 10, warning: 3, info: 0 };
  let value = 100;
  for (const finding of findings) {
    counts[finding.severity] += 1;
    value -= penalties[finding.severity];
  }
  const result = Math.max(0, value);
  const grade = result >= 95 ? "A+" : result >= 90 ? "A" : result >= 80 ? "B" : result >= 70 ? "C" : result >= 60 ? "D" : "F";
  return { score: result, grade, counts };
}

/**
 * Scan a folder selected through the browser's directory picker. File contents
 * never leave the browser: this module has no network or server dependencies.
 */
export async function scanSelectedFiles(files: FileList | File[]): Promise<BrowserScanReport> {
  const candidates = normalizeFiles(files);
  const selected = candidates.slice(0, 3_000);
  let skipped = Math.max(0, candidates.length - selected.length);
  const texts: TextFile[] = [];

  await Promise.all(selected.map(async ({ file, path }) => {
    if (file.size > 512_000) {
      skipped += 1;
      return;
    }
    const text = await file.text();
    if (!text.includes("\0")) texts.push({ path, text });
  }));
  texts.sort((a, b) => a.path.localeCompare(b.path));

  const findings: BrowserFinding[] = [];
  const runtimes: Runtime[] = [];
  const ports: Port[] = [];
  const envUses: EnvUse[] = [];
  const envDeclarations = new Map<string, BrowserEvidence>();
  let claims = texts.length;
  let hasReadme = false;
  let hasLicense = false;

  for (const { path, text } of texts) {
    const base = path.split("/").pop()?.toLowerCase() ?? "";
    if (README.test(path)) {
      hasReadme = true;
      for (const match of text.matchAll(/Node(?:\.js)?\s*(?:version\s*)?(?:>=|>|=|v)?\s*(\d{1,3})(?:\.\d+){0,2}/gi)) {
        runtimes.push({ major: Number(match[1]), source: path, line: lineNumber(text, match.index) });
        claims += 1;
      }
      for (const match of text.matchAll(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):([1-9]\d{1,4})/g)) {
        ports.push({ value: Number(match[1]), kind: "documentation", source: path, line: lineNumber(text, match.index) });
        claims += 1;
      }
    }
    if (base.startsWith("license") || base === "copying") hasLicense = true;

    if (base === "package.json") {
      try {
        const manifest = JSON.parse(text) as { engines?: { node?: string } };
        if (manifest.engines?.node) {
          const major = majorVersion(manifest.engines.node);
          if (major !== null) {
            runtimes.push({ major, source: path, line: lineNumber(text, text.indexOf("\"node\"")) });
            claims += 1;
          }
        }
      } catch {
        addFinding(findings, {
          ruleId: "manifest/invalid-json",
          severity: "error",
          message: `${path} is not valid JSON`,
          detail: "The manifest could not be read.",
          suggestion: "Fix the JSON syntax.",
          evidence: [{ source: path, line: 1 }],
        });
      }
    }

    if (WORKFLOW.test(path)) {
      for (const match of text.matchAll(/node-version:\s*["']?([^\s#"']+)/gi)) {
        const major = majorVersion(match[1]);
        if (major !== null) {
          runtimes.push({ major, source: path, line: lineNumber(text, match.index) });
          claims += 1;
        }
      }
    }

    if (DOCKER.test(path)) {
      for (const match of text.matchAll(/^\s*FROM\s+node:([^\s@]+)/gim)) {
        const major = majorVersion(match[1]);
        if (major !== null) {
          runtimes.push({ major, source: path, line: lineNumber(text, match.index) });
          claims += 1;
        }
      }
      for (const match of text.matchAll(/^\s*EXPOSE\s+(\d{2,5})/gim)) {
        ports.push({ value: Number(match[1]), kind: "container", source: path, line: lineNumber(text, match.index) });
        claims += 1;
      }
      const floating = text.match(/^\s*FROM\s+[^\s:]+:latest\b/im);
      if (floating) {
        addFinding(findings, {
          ruleId: "security/floating-container-image",
          severity: "warning",
          message: `${path} uses a latest container tag`,
          detail: "The base image can change without a source change.",
          suggestion: "Pin an image version or digest.",
          evidence: [{ source: path, line: lineNumber(text, floating.index) }],
        });
      }
    }

    if (ENV_EXAMPLE.test(path)) {
      for (const match of text.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/gm)) {
        envDeclarations.set(match[1], { source: path, line: lineNumber(text, match.index) });
        claims += 1;
      }
    }

    if (SOURCE_EXTENSION.test(path)) {
      for (const match of text.matchAll(/process\.env(?:\.([A-Z][A-Z0-9_]*)|\[["']([A-Z][A-Z0-9_]*)["']\])/g)) {
        const name = match[1] || match[2];
        envUses.push({ name, source: path, line: lineNumber(text, match.index) });
        claims += 1;
      }
      for (const pattern of [/\bAKIA[0-9A-Z]{16}\b/g, /\bgh[pousr]_[A-Za-z0-9_]{24,}\b/g, /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g]) {
        for (const match of text.matchAll(pattern)) {
          addFinding(findings, {
            ruleId: "security/possible-secret",
            severity: "critical",
            message: `Possible credential in ${path}`,
            detail: "The matched value is redacted in this browser report.",
            suggestion: "Revoke the value and remove it from repository history.",
            evidence: [{ source: path, line: lineNumber(text, match.index) }],
          });
        }
      }
    }
  }

  if (texts.length === 0) {
    addFinding(findings, {
      ruleId: "scan/no-text-files",
      severity: "warning",
      message: "No supported text files were selected",
      detail: "The browser scanner only reads supported source and configuration files.",
      suggestion: "Choose the repository root rather than a build or dependency folder.",
    });
  }
  if (!hasReadme) {
    addFinding(findings, {
      ruleId: "public/readme",
      severity: "error",
      message: "No README was found",
      detail: "A public repository needs a clear entry point.",
      suggestion: "Add a root README.",
      evidence: [{ source: "README.md", line: 1 }],
    });
  }
  if (!hasLicense) {
    addFinding(findings, {
      ruleId: "public/license",
      severity: "error",
      message: "No license file was found",
      detail: "Reuse terms are not explicit.",
      suggestion: "Add a LICENSE file.",
      evidence: [{ source: "LICENSE", line: 1 }],
    });
  }

  const nodeVersions = [...new Set(runtimes.map((item) => item.major))].sort((a, b) => a - b);
  if (nodeVersions.length > 1) {
    addFinding(findings, {
      ruleId: "runtime/node-drift",
      severity: "error",
      message: `Node runtime declarations differ: ${nodeVersions.join(", ")}`,
      detail: "The repository names more than one Node major version.",
      suggestion: "Choose one supported major version or document a compatibility matrix.",
      evidence: runtimes.slice(0, 8).map(({ source, line }) => ({ source, line })),
    });
  }
  const documentedPort = ports.find((item) => item.kind === "documentation");
  const containerPort = ports.find((item) => item.kind === "container");
  if (documentedPort && containerPort && documentedPort.value !== containerPort.value) {
    addFinding(findings, {
      ruleId: "runtime/port-drift",
      severity: "error",
      message: `Documented port ${documentedPort.value} differs from container port ${containerPort.value}`,
      detail: "The documented address may not reach the container.",
      suggestion: "Align the documentation and Docker exposure.",
      evidence: [documentedPort, containerPort].map(({ source, line }) => ({ source, line })),
    });
  }
  for (const use of envUses) {
    if (["CI", "NODE_ENV"].includes(use.name) || envDeclarations.has(use.name)) continue;
    addFinding(findings, {
      ruleId: "environment/undocumented",
      severity: "warning",
      message: `${use.name} is used but missing from an environment example`,
      detail: "A new checkout cannot discover this configuration.",
      suggestion: `Add ${use.name} to .env.example with a safe placeholder.`,
      evidence: [{ source: use.source, line: use.line }],
    });
  }

  findings.sort((a, b) => {
    const order = { critical: 0, error: 1, warning: 2, info: 3 };
    return order[a.severity] - order[b.severity] || a.ruleId.localeCompare(b.ruleId);
  });
  return { files: texts.length, skipped, claims, findings, ...score(findings) };
}
