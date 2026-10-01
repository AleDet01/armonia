import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { scanRepository, toSarif } from "../src/core/report.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function fixture(files) {
  const root = await mkdtemp(path.join(tmpdir(), "armonia-test-"));
  await Promise.all(
    Object.entries(files).map(async ([relative, content]) => {
      const target = path.join(root, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
    }),
  );
  return root;
}

test("a coherent repository produces a perfect, deterministic report", async (context) => {
  const envAccess = ["process", "env", "DATABASE_URL"].join(".");
  const githubActions = ["process", "env", "GITHUB_ACTIONS"].join(".");
  const githubRepository = ["process", "env", "GITHUB_REPOSITORY"].join(".");
  const root = await fixture({
    "package.json": JSON.stringify({
      name: "coherent",
      version: "1.0.0",
      packageManager: "npm@11.0.0",
      engines: { node: ">=22" },
      scripts: { test: "node --test", build: "node build.mjs" },
    }),
    "package-lock.json": "{}",
    "README.md": "# Coherent\n\nNode 22\n\n```bash\nnpm test\nnpm run build\n```\n\n[Guide](docs/guide.md)\n",
    "docs/guide.md": "# Guide\n",
    ".env.example": "DATABASE_URL=postgres://example\n",
    "src/index.mjs": `export const url = ${envAccess};\nexport const isCi = ${githubActions};\nexport const repository = ${githubRepository};\n`,
    ".github/workflows/ci.yml": "permissions:\n  contents: read\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n      - run: npm test\n",
    "LICENSE": "MIT License\n",
    "CONTRIBUTING.md": "# Contributing\n",
    "SECURITY.md": "# Security\n",
    "CODE_OF_CONDUCT.md": "# Conduct\n",
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  const first = await scanRepository(root);
  const second = await scanRepository(root);
  assert.equal(first.score, 100);
  assert.equal(first.grade, "A+");
  assert.deepEqual(first.findings, []);
  assert.deepEqual(first, second);
  assert.equal(first.repository.root, ".");
});

test("cross-file contradictions retain both witnesses and redact secrets", async (context) => {
  const exposed = ["gh", "p_", "abcdefghijklmnopqrstuvwxyz123456"].join("");
  const envAccess = ["process", "env", "DATABASE_URL"].join(".");
  const root = await fixture({
    "package.json": JSON.stringify({
      name: "drifting",
      packageManager: "npm@11.0.0",
      engines: { node: ">=22" },
      scripts: { test: "node --test" },
    }),
    "package-lock.json": "{}",
    "README.md": `# Drifting\n\nRequires Node ${20}. Open http://localhost:8080.\n\n\u0060\u0060\u0060bash\nnpm run verify\n\u0060\u0060\u0060\n\n[Missing guide](docs/missing.md)\n`,
    ".env.example": "LEGACY_TOKEN=replace-me\n",
    "src/index.mjs": `const token = "${exposed}";\nexport const url = ${envAccess};\n`,
    "Dockerfile": "FROM node:18\nEXPOSE 3000\nCMD [\"node\", \"src/index.mjs\"]\n",
    ".github/workflows/ci.yml": "jobs:\n  test:\n    steps:\n      - uses: owner/action@main\n      - run: npm run verify\n",
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  const report = await scanRepository(root);
  const ids = new Set(report.findings.map((finding) => finding.ruleId));
  assert.ok(ids.has("runtime/node-drift"));
  assert.ok(ids.has("runtime/port-drift"));
  assert.ok(ids.has("command/missing-script"));
  assert.ok(ids.has("environment/undocumented"));
  assert.ok(ids.has("docs/broken-relative-link"));
  assert.ok(ids.has("security/floating-action"));
  assert.ok(ids.has("security/possible-secret"));

  const runtime = report.findings.find((finding) => finding.ruleId === "runtime/node-drift");
  assert.equal(runtime.contradiction, true);
  assert.ok(runtime.evidence.length >= 2);
  assert.ok(runtime.evidence.some((item) => item.source === "package.json"));
  assert.ok(runtime.evidence.some((item) => item.source === "README.md"));

  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, new RegExp(exposed));
  assert.match(serialized, /\[redacted\]/);
  assert.ok(report.score < 80);
});

test("SARIF preserves primary and related evidence locations", async (context) => {
  const root = await fixture({
    "package.json": JSON.stringify({
      name: "sarif-fixture",
      packageManager: "npm@11.0.0",
      engines: { node: ">=22" },
      scripts: { test: "node --test" },
    }),
    "package-lock.json": "{}",
    "README.md": `# Fixture\n\nRequires Node ${20}.\n`,
    "LICENSE": "MIT\n",
    "CONTRIBUTING.md": "ok\n",
    "SECURITY.md": "ok\n",
    "CODE_OF_CONDUCT.md": "ok\n",
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  const sarif = toSarif(await scanRepository(root));
  assert.equal(sarif.version, "2.1.0");
  const result = sarif.runs[0].results.find((item) => item.ruleId === "runtime/node-drift");
  assert.equal(result.level, "error");
  assert.equal(result.locations.length, 1);
  assert.ok(result.relatedLocations.length >= 1);
  assert.match(result.partialFingerprints.armoniaFingerprint, /^[a-f0-9]{16}$/);
});

test("the CLI returns the threshold exit code without leaking absolute paths", async () => {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    process.execPath,
    [path.join(projectRoot, "bin", "armonia.mjs"), "scan", projectRoot, "--format", "json", "--fail-on", "never"],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.repository.root, ".");
  assert.doesNotMatch(result.stdout, /C:\\\\Users/i);
});
