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

test("the browser scanner reports files it intentionally leaves unread", async () => {
  const largeContent = "x".repeat(512_001);
  const report = await scanSelectedFiles([
    selectedFile("example/README.md", "# Example\n\nNode 22\n"),
    selectedFile("example/LICENSE", "MIT\n"),
    selectedFile("example/src/large.mjs", largeContent),
  ]);

  assert.equal(report.files, 2);
  assert.equal(report.skipped, 1);
  assert.equal(report.findings.length, 0);
  assert.equal(report.score, 100);
});
