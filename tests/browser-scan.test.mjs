import assert from "node:assert/strict";
import test from "node:test";
import { scanSelectedFiles } from "../app/browser-scan.ts";

function selectedFile(path, content) {
  const file = new File([content], path.split("/").at(-1), { type: "text/plain" });
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}

test("the browser scanner finds drift without retaining a detected credential", async () => {
  const exposed = ["gh", "p_", "abcdefghijklmnopqrstuvwxyz123456"].join("");
  const envUse = ["process", "env", "DATABASE_URL"].join(".");
  const report = await scanSelectedFiles([
    selectedFile("example/README.md", "# Example\n\nNode 20\nOpen http://localhost:8080.\n"),
    selectedFile("example/package.json", JSON.stringify({ engines: { node: ">=22" } })),
    selectedFile("example/Dockerfile", "FROM node:22\nEXPOSE 3000\n"),
    selectedFile("example/.env.example", "LEGACY_TOKEN=replace-me\n"),
    selectedFile("example/src/index.mjs", `const token = "${exposed}";\nexport const value = ${envUse};\n`),
  ]);

  const rules = new Set(report.findings.map((finding) => finding.ruleId));
  assert.equal(report.files, 5);
  assert.ok(rules.has("runtime/node-drift"));
  assert.ok(rules.has("runtime/port-drift"));
  assert.ok(rules.has("environment/undocumented"));
  assert.ok(rules.has("security/possible-secret"));
  assert.doesNotMatch(JSON.stringify(report), new RegExp(exposed));
});

test("browser scan handles read failures and binary candidates with explicit coverage", async () => {
  const unreadable = selectedFile("repo/src/unreadable.ts", "text");
  Object.defineProperty(unreadable, "text", { value: async () => { throw new Error("read failed"); } });
  const report = await scanSelectedFiles([
    selectedFile("repo/README.md", "# Example"), selectedFile("repo/COPYING", "MIT"),
    selectedFile("repo/src/binary.cts", "\0"), unreadable,
    selectedFile("repo/node_modules/package/index.ts", "ignored"),
  ]);
  assert.equal(report.files, 2);
  assert.equal(report.skipped, 2);
  assert.deepEqual(report.findings.map((item) => item.ruleId), ["scan/incomplete"]);
});

test("browser normalization preserves mixed roots and redacts secret-shaped filenames", async () => {
  const secret = ["gh", "p_", "b".repeat(30)].join("");
  const envUse = ["process", "env", "MISSING_CONFIG"].join(".");
  const report = await scanSelectedFiles([
    selectedFile("one/README.md", "# One"), selectedFile("two/LICENSE", "MIT"),
    selectedFile(`one/src/${secret}.cts`, envUse),
  ]);
  assert.equal(report.files, 3);
  assert.match(report.findings[0].evidence[0].source, /^one\/src\//);
  assert.ok(!JSON.stringify(report).includes(secret));
});

test("browser detects credentials in text configuration and respects compatible runtime bounds", async () => {
  const secret = ["gh", "p_", "c".repeat(30)].join("");
  const report = await scanSelectedFiles([
    selectedFile("repo/README.md", `# Example\nNode 24\n${secret}`),
    selectedFile("repo/package.json", JSON.stringify({ engines: { node: ">=22" } })),
    selectedFile("repo/LICENSE", "MIT"),
  ]);
  assert.deepEqual(report.findings.map((item) => item.ruleId), ["security/possible-secret"]);
  assert.ok(report.score <= 49);
  assert.ok(!JSON.stringify(report).includes(secret));
});

test("browser validates manifest shape and ignores ambiguous port declarations", async () => {
  const report = await scanSelectedFiles([
    selectedFile("repo/README.md", "# Example\nhttp://localhost:8080 http://localhost:3000"),
    selectedFile("repo/Dockerfile", "FROM node:22\nEXPOSE 9000"),
    selectedFile("repo/package.json", "null"), selectedFile("repo/LICENSE", "MIT"),
  ]);
  assert.deepEqual(report.findings.map((item) => item.ruleId), ["manifest/invalid-json"]);
});

test("browser file IO is bounded and repeated scans remain deterministic", async () => {
  let active = 0;
  let peak = 0;
  const files = Array.from({ length: 32 }, (_, index) => {
    const file = selectedFile(`repo/src/${index}.ts`, "text");
    Object.defineProperty(file, "text", { value: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return "text";
    } });
    return file;
  });
  const first = await scanSelectedFiles(files);
  assert.ok(peak <= 8);
  assert.deepEqual(await scanSelectedFiles(files.reverse()), first);
});

test("the browser scanner reports files it intentionally leaves unread", async () => {
  const largeContent = "x".repeat(512_001);
  const report = await scanSelectedFiles([
    selectedFile("example/README.md", "# Example\n\nNode 22\n"),
    selectedFile("example/LICENSE", "MIT\n"),
    selectedFile("example/src/large.mjs", largeContent),
  ]);

  assert.equal(report.files, 2);
  assert.equal(report.skipped, 1);
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].ruleId, "scan/incomplete");
  assert.equal(report.counts.warning, 1);
  assert.ok(report.score < 100);
});
