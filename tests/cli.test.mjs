import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { repositoryFixture } from "./helpers.mjs";

const cli = fileURLToPath(new URL("../bin/armonia.mjs", import.meta.url));
function run(root, args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" });
}

test("CLI uses config failOn, allows overrides, and writes atomic output", async (context) => {
  const root = await repositoryFixture(context, { "armonia.config.json": JSON.stringify({ failOn: "never" }) });
  assert.equal(run(root, ["scan", ".", "--format", "json"]).status, 0);
  assert.equal(run(root, ["scan", ".", "--fail-on", "error"]).status, 1);
  const output = path.join(root, "reports", "x=y=z.json");
  const result = run(root, ["scan", ".", "--format=json", `--output=${output}`]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(await readFile(output, "utf8")).repository.root, ".");
  assert.deepEqual(await readdir(path.dirname(output)), ["x=y=z.json"]);
});

test("CLI rejects bad arguments before writing an output", async (context) => {
  const root = await repositoryFixture(context, {});
  const output = path.join(root, "report.json");
  for (const args of [["--format", "xml"], ["--fail-on", "fatal"], ["--typo", "yes"], ["--format"], [".", "."]]) {
    const result = run(root, ["scan", ...args, "--output", output]);
    assert.equal(result.status, 2);
    await assert.rejects(access(output));
  }
});

test("CLI init does not overwrite config and malformed JSON never leaks its contents", async (context) => {
  const root = await repositoryFixture(context, {});
  assert.equal(run(root, ["init"]).status, 0);
  const original = await readFile(path.join(root, "armonia.config.json"), "utf8");
  assert.equal(run(root, ["init"]).status, 2);
  assert.equal(await readFile(path.join(root, "armonia.config.json"), "utf8"), original);
  const secret = ["private", "value", "123456"].join("-");
  const invalid = await repositoryFixture(context, { "armonia.config.json": `{"value": ${secret}}` });
  const result = run(invalid, ["scan"]);
  assert.equal(result.status, 2);
  assert.ok(!result.stderr.includes(secret));
});

test("portfolio reports missing repositories without publishing local paths", async (context) => {
  const root = await repositoryFixture(context, { "registry.json": JSON.stringify({ repositories: [{ slug: "missing", name: "Missing", path: "unavailable", domain: "tool", description: "Example", relation: "independent" }] }) });
  const result = run(root, ["portfolio", "--registry", "registry.json", "--output", "snapshot.json"]);
  assert.equal(result.status, 0, result.stderr);
  const snapshot = JSON.parse(await readFile(path.join(root, "snapshot.json"), "utf8"));
  assert.equal(snapshot.repositories[0].available, false);
  assert.equal(snapshot.repositories[0].score, null);
  assert.ok(!JSON.stringify(snapshot).includes(root));
});

test("failed output writes clean temporary files and preserve the destination", async (context) => {
  const root = await repositoryFixture(context, { "occupied/keep.txt": "preserve" });
  const result = run(root, ["scan", ".", "--fail-on", "never", "--output", "occupied"]);
  assert.equal(result.status, 2);
  assert.equal(await readFile(path.join(root, "occupied", "keep.txt"), "utf8"), "preserve");
  assert.deepEqual(await readdir(root), ["occupied"]);
});
