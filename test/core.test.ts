import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appendFile, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { applyPlan } from "../src/apply.ts";
import { initializeProject } from "../src/initialize.ts";
import { loadProjectManifest } from "../src/manifest.ts";
import { migrateProject } from "../src/migrate.ts";
import { createPlan } from "../src/planner.ts";
import { validateSchema } from "../src/schema.ts";
import { parseYaml, serializeYaml, writeYaml } from "../src/yaml.ts";
import { exists, readText, writeTextAtomic } from "../src/fs.ts";
import { resolvePacks } from "../src/resolver.ts";
import { readYaml } from "../src/yaml.ts";

async function filesBelow(root: string): Promise<string[]> {
  const output: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else {
        output.push(path);
      }
    }
  }
  await visit(root);
  return output;
}

test("YAML subset round-trips nested manifests and inline arrays", () => {
  const source = `
apiVersion: armonia/v1
kind: Project
metadata:
  owners: [alexd, bot]
spec:
  enabled: true
  components:
    - id: root
      path: .
      commands:
        test:
          argv: [node, --test]
`;
  const parsed = parseYaml<Record<string, unknown>>(source);
  const roundTrip = parseYaml<Record<string, unknown>>(serializeYaml(parsed));
  assert.deepEqual(roundTrip, parsed);
});

test("project schema rejects missing required properties", async () => {
  await assert.rejects(
    validateSchema("project.schema.json", {
      apiVersion: "armonia/v1",
      kind: "Project"
    }),
    /missing required property metadata/
  );
});

test("initialize is idempotent and protects modified managed files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "armonia-core-"));
  try {
    await initializeProject(directory, {
      name: "Core test",
      id: "test/core",
      owner: "tester",
      language: "generic",
      profile: "experimental",
      generatedAdapters: ["cursor", "codex"]
    });

    assert.equal(await exists(resolve(directory, ".cursor/rules/armonia.mdc")), true);
    const stablePlan = await createPlan(directory);
    assert.equal(
      stablePlan.entries.filter((entry) => ["create", "update", "conflict"].includes(entry.action))
        .length,
      0
    );

    await appendFile(resolve(directory, ".editorconfig"), "# local edit\n", "utf8");
    const conflictPlan = await createPlan(directory);
    assert.equal(
      conflictPlan.entries.find((entry) => entry.path === ".editorconfig")?.action,
      "conflict"
    );
    await assert.rejects(applyPlan(conflictPlan), /managed-file conflict/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("pack file sources cannot escape their pack directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "armonia-boundary-"));
  try {
    await initializeProject(directory, {
      name: "Boundary test",
      id: "test/boundary",
      owner: "tester",
      language: "generic",
      profile: "experimental"
    });
    const manifest = await loadProjectManifest(directory);
    manifest.spec.packs.push({
      id: "capability/evil",
      version: "1.0.0",
      path: ".armonia/evil-pack.yaml"
    });
    await writeYaml(resolve(directory, ".armonia/project.yaml"), manifest);
    await writeTextAtomic(
      resolve(directory, ".armonia/evil-pack.yaml"),
      `apiVersion: armonia/v1
kind: Pack
metadata:
  id: capability/evil
  version: 1.0.0
compatibility:
  spec: ^1
files:
  - target: escaped.txt
    source: ../../outside.txt
    ownership: managed
`
    );
    await assert.rejects(createPlan(directory), /escapes its allowed root/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("legacy v0 manifest migration is previewable and explicit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "armonia-migrate-"));
  try {
    await mkdir(resolve(directory, ".armonia"), { recursive: true });
    await writeTextAtomic(
      resolve(directory, ".armonia/project.yaml"),
      `version: 0
name: Legacy
owner: tester
language: generic
commands:
  test: [node, --test]
`
    );

    const preview = await migrateProject(directory, false);
    assert.equal(preview.required, true);
    assert.equal(preview.applied, false);

    const applied = await migrateProject(directory, true);
    assert.equal(applied.applied, true);
    assert.equal((await loadProjectManifest(directory)).apiVersion, "armonia/v1");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("all conformance examples validate and resolve their pack graph", async () => {
  const examplesRoot = resolve(import.meta.dirname, "..", "examples");
  for (const name of await readdir(examplesRoot)) {
    if (name === "README.md") continue;
    const root = resolve(examplesRoot, name);
    const manifest = await loadProjectManifest(root);
    const packs = await resolvePacks(root, manifest);
    assert.ok(packs.length >= 2, `${name} should resolve core and at least one adapter`);
  }
});

test("every built-in pack conforms to the public pack schema", async () => {
  const packsRoot = resolve(import.meta.dirname, "..", "packs");
  const manifests = (await filesBelow(packsRoot)).filter((path) => path.endsWith("pack.yaml"));
  assert.ok(manifests.length >= 10);
  for (const path of manifests) {
    await validateSchema("pack.schema.json", await readYaml(path));
  }
});

test("all relative Markdown links resolve to local files", async () => {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const markdownFiles = (await filesBelow(repositoryRoot)).filter((path) => path.endsWith(".md"));
  const failures: string[] = [];
  const link = /\]\(([^)]+)\)/g;
  for (const path of markdownFiles) {
    const source = await readText(path);
    for (const match of source.matchAll(link)) {
      const target = match[1]?.split("#", 1)[0] ?? "";
      if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
      if (!(await exists(resolve(path, "..", decodeURIComponent(target))))) {
        failures.push(`${path}: ${target}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test("all repository YAML assets are syntactically parseable", async () => {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const yamlFiles = (await filesBelow(repositoryRoot)).filter(
    (path) => path.endsWith(".yaml") || path.endsWith(".yml")
  );
  for (const path of yamlFiles) {
    assert.doesNotThrow(() => parseYaml(readFileSync(path, "utf8")), path);
  }
});
