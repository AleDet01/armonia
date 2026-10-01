import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { scanRepository, toSarif } from "../src/core/report.mjs";
import { repositoryFixture } from "./helpers.mjs";
import { collectFacts } from "../src/core/collectors.mjs";
import { runChecks } from "../src/core/checks.mjs";
import { readTextFiles, walkFiles } from "../src/core/files.mjs";

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

test("missing or non-directory scan roots are errors rather than clean reports", async (context) => {
  const root = await repositoryFixture(context, { "file.txt": "text" });
  await assert.rejects(scanRepository(path.join(root, "missing")));
  await assert.rejects(scanRepository(path.join(root, "file.txt")));
});

test("file coverage is bounded, explicit, and the exact traversal limit is not truncated", async (context) => {
  const root = await repositoryFixture(context, { "README.md": "x".repeat(2048), "LICENSE": "MIT", "src/binary.ts": Buffer.from([0, 1, 2]) });
  assert.equal((await walkFiles(root, { maxFiles: 3 })).truncated, false);
  assert.equal((await walkFiles(root, { maxFiles: 2 })).truncated, true);
  const report = await scanRepository(root, { config: { maxFileBytes: 1024 } });
  assert.equal(report.repository.skipped.length, 2);
  assert.ok(report.findings.some((item) => item.ruleId === "scan/incomplete"));
});

test("invalid manifest shapes never crash the scanner", async (context) => {
  for (const manifest of [null, [], "text", { scripts: "test" }, { engines: { node: 22 } }, { dependencies: [] }]) {
    const root = await repositoryFixture(context, { "package.json": JSON.stringify(manifest), "README.md": "```bash\nnpm run test\n```" });
    const report = await scanRepository(root);
    assert.ok(report.findings.some((item) => item.ruleId === "manifest/invalid-json"));
  }
});

test("secrets in docs, manifests and workflows cannot leak through any reporter", async (context) => {
  const secret = ["gh", "p_", "a".repeat(30)].join("");
  const root = await repositoryFixture(context, {
    "README.md": `# Example\n[Link](docs/${secret})\n`,
    "package.json": JSON.stringify({ scripts: { test: `TOKEN=${secret} node --test` } }),
    ".github/workflows/ci.yml": `permissions: {}\njobs:\n  test:\n    steps:\n      - run: npm run ${secret}\n`,
  });
  const report = await scanRepository(root);
  assert.equal(report.counts.critical, 3);
  assert.ok(!JSON.stringify(report).includes(secret));
  assert.ok(!JSON.stringify(toSarif(report)).includes(secret));
  const { formatTerminal } = await import("../src/core/report.mjs");
  assert.ok(!formatTerminal(report).includes(secret));
});

test("workflow blocks, explicit permissions and own script properties are understood", async (context) => {
  const root = await repositoryFixture(context, {
    "package.json": JSON.stringify({ engines: { node: ">=22" }, scripts: { test: "node --test" } }),
    "README.md": "# Example\nNode 24\n```bash\nnpm run toString\n```",
    ".github/workflows/ci.yml": "permissions: {}\njobs:\n  test:\n    steps:\n      - run: |\n          npm run absent\n          npm test\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 24\n",
  });
  const report = await scanRepository(root);
  const missing = report.findings.filter((item) => item.ruleId === "command/missing-script");
  assert.equal(missing.length, 2);
  assert.ok(missing.some((item) => item.evidence[0].line === 6));
  assert.ok(!report.findings.some((item) => ["runtime/node-drift", "security/workflow-permissions"].includes(item.ruleId)));
});

test("fingerprints do not depend on evidence collection order", async (context) => {
  const root = await repositoryFixture(context, { "README.md": "# Example\nNode 20", "package.json": JSON.stringify({ engines: { node: ">=22" } }) });
  const facts = await collectFacts(root);
  const first = runChecks(facts).find((item) => item.ruleId === "runtime/node-drift");
  facts.runtimes.reverse();
  const second = runChecks(facts).find((item) => item.ruleId === "runtime/node-drift");
  assert.equal(first.fingerprint, second.fingerprint);
});

test("relative links are case-sensitive and empty directories are valid targets", async (context) => {
  const root = await repositoryFixture(context, { "README.md": "[wrong](guide.md) [empty](empty/) [root](./)", "Guide.md": "# Guide" });
  await mkdir(path.join(root, "empty"));
  const report = await scanRepository(root);
  assert.equal(report.findings.filter((item) => item.ruleId === "docs/broken-relative-link").length, 1);
});

test("Docker runtime user is checked in the final stage including inherited stages", async (context) => {
  for (const [docker, expected] of [
    ["FROM node:22 AS build\nUSER node\nFROM node:22\n", true],
    ["FROM node:22\nUSER root\n", true],
    ["FROM node:22 AS build\nUSER node\nFROM build\n", false],
    ["FROM node:22\nUSER 1000:1000\n", false],
  ]) {
    const root = await repositoryFixture(context, { Dockerfile: docker });
    const report = await scanRepository(root);
    assert.equal(report.findings.some((item) => item.ruleId === "security/container-root"), expected);
  }
});

test("independent nested packages are not forced into a single Node runtime", async (context) => {
  const root = await repositoryFixture(context, {
    "apps/one/package.json": JSON.stringify({ engines: { node: "20" } }),
    "apps/one/README.md": "# One\nNode 20",
    "apps/two/package.json": JSON.stringify({ engines: { node: "24" } }),
    "apps/two/README.md": "# Two\nNode 24",
  });
  const report = await scanRepository(root);
  assert.ok(!report.findings.some((item) => item.ruleId === "runtime/node-drift"));
});

test("exclude double-star patterns include zero-depth matches", async (context) => {
  const root = await repositoryFixture(context, { "ignored.ts": "root", "src/ignored.ts": "nested", "src/keep.ts": "keep" });
  const walk = await walkFiles(root, { exclude: ["**/ignored.ts"] });
  assert.deepEqual(walk.files, ["src/keep.ts"]);
});

test("text retention stops at the aggregate size budget deterministically", async (context) => {
  const content = "x".repeat(512_000);
  const files = Object.fromEntries(Array.from({ length: 140 }, (_, index) => [`src/${String(index).padStart(3, "0")}.txt`, content]));
  const root = await repositoryFixture(context, files);
  const { files: discovered } = await walkFiles(root);
  const result = await readTextFiles(root, discovered);
  const bytes = [...result.texts.values()].reduce((sum, text) => sum + Buffer.byteLength(text), 0);
  assert.ok(bytes <= 64 * 1024 * 1024);
  assert.equal(result.texts.size, 131);
  assert.equal(result.skipped.length, 9);
  assert.ok(result.skipped.every((item) => item.reason === "total text size limit"));
  assert.deepEqual([...result.texts.keys()], discovered.slice(0, 131));
});

test("directory junctions are excluded from discovery", async (context) => {
  const { symlink } = await import("node:fs/promises");
  const root = await repositoryFixture(context, { "README.md": "# Example" });
  const external = await repositoryFixture(context, { "secret.txt": "outside root" });
  await symlink(external, path.join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
  const walk = await walkFiles(root);
  assert.deepEqual(walk.files, ["README.md"]);
  await assert.rejects(scanRepository(path.join(root, "linked")));
});

test("discovery order is ordinal rather than locale-dependent", async (context) => {
  const names = ["Z.txt", "a.txt", "Ä.txt"];
  const root = await repositoryFixture(context, Object.fromEntries(names.map((name) => [name, "text"])));
  const walk = await walkFiles(root);
  assert.deepEqual(walk.files, names.toSorted());
});

test("bounded readers retain empty files and files exactly at the size limit", async (context) => {
  const root = await repositoryFixture(context, { "empty.txt": "", "exact.txt": "x".repeat(1024) });
  const result = await readTextFiles(root, ["empty.txt", "exact.txt"], 1024);
  assert.equal(result.texts.get("empty.txt"), "");
  assert.equal(result.texts.get("exact.txt").length, 1024);
  assert.deepEqual(result.skipped, []);
});
