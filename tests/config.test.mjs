import assert from "node:assert/strict";
import test from "node:test";
import { validateConfig, validateRegistry } from "../src/core/config.mjs";
import { pagesDeployment } from "../src/site/pages.mjs";
import { nodeMajorsConflict, safeText } from "../src/core/text.mjs";

test("configuration validation follows the shipped schema", () => {
  assert.deepEqual(validateConfig({ maxFiles: 1, maxFileBytes: 1024, failOn: "never", rules: { disable: ["public/readme"] }, exclude: ["fixtures/**"] }), { maxFiles: 1, maxFileBytes: 1024, failOn: "never", rules: { disable: ["public/readme"] }, exclude: ["fixtures/**"] });
  for (const value of [null, [], 42, { failOn: "fatal" }, { maxFiles: 0 }, { maxFiles: 1.5 }, { maxFiles: 1000001 }, { maxFileBytes: 0 }, { exclude: [1] }, { exclude: ["a", "a"] }, { rules: [] }, { rules: { typo: [] } }, { unknown: true }, { name: "" }]) assert.throws(() => validateConfig(value));
});

test("portfolio registries reject invalid entries and duplicate identities", () => {
  const entry = { slug: "demo", name: "Demo", path: ".", domain: "tool", description: "Example", relation: "self" };
  assert.doesNotThrow(() => validateRegistry({ repositories: [entry] }));
  for (const value of [null, { repositories: [null] }, { repositories: [{ ...entry, path: 1 }] }, { repositories: [{ ...entry, slug: "Bad Slug" }] }, { repositories: [entry, entry] }]) assert.throws(() => validateRegistry(value));
});

test("runtime comparisons respect lower bounds and avoid guessing complex ranges", () => {
  assert.equal(nodeMajorsConflict([">=22.13.0", "Node 24", "24-alpine"]), false);
  assert.equal(nodeMajorsConflict([">=22", "Node 20"]), true);
  assert.equal(nodeMajorsConflict(["^22.0.0", "24"]), true);
  assert.equal(nodeMajorsConflict(["22 || 24", "24"]), false);
  assert.equal(nodeMajorsConflict(["${{ matrix.node }}", "22"]), false);
});

test("Pages configuration handles project, user and local sites", () => {
  assert.deepEqual(pagesDeployment({}), { prefix: "", url: "http://localhost:3000/" });
  assert.deepEqual(pagesDeployment({ GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "owner/Armonia" }), { prefix: "/Armonia", url: "https://owner.github.io/Armonia/" });
  assert.deepEqual(pagesDeployment({ GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "owner/owner.github.io" }), { prefix: "", url: "https://owner.github.io/" });
  assert.throws(() => pagesDeployment({ GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "owner/../secret" }));
});

test("report sanitization removes credentials and terminal control sequences", () => {
  const secret = ["github", "_pat_", "a".repeat(30)].join("");
  assert.equal(safeText(`value=${secret}\u001b[2J\u0000`), "value=[redacted][2J");
  assert.equal(safeText("line1\r\nline2\tvalue"), "line1 line2 value");
});
