import assert from "node:assert/strict";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { renderTemplate, conditionMatches } from "../src/template.ts";
import { initializeProject } from "../src/initialize.ts";
import { createPlan } from "../src/planner.ts";
import { writeTextAtomic } from "../src/fs.ts";
import { writeYaml } from "../src/yaml.ts";
import { loadProjectManifest } from "../src/manifest.ts";
import type { ProjectManifest } from "../src/types.ts";

function makeManifest(overrides: Partial<ProjectManifest["metadata"]> = {}): ProjectManifest {
  return {
    apiVersion: "armonia/v1",
    kind: "Project",
    metadata: {
      id: "test/security",
      name: overrides.name ?? "Safe Project",
      owners: ["tester"],
      ...overrides,
    },
    spec: {
      lifecycle: "incubating",
      profile: "baseline",
      packs: [{ id: "core", version: "1.0.0" }],
      components: [{ id: "root", path: "." }],
    },
  };
}

test("template injection: manifest values containing template markers are rejected", () => {
  const malicious = makeManifest({ name: "Evil <<armonia:project.id>> Injection" });
  assert.throws(
    () => renderTemplate("Project: <<armonia:project.name>>", malicious),
    /template markers/
  );
});

test("template injection: safe values pass through correctly", () => {
  const safe = makeManifest({ name: "My Normal Project" });
  const result = renderTemplate("Name: <<armonia:project.name>>", safe);
  assert.equal(result, "Name: My Normal Project");
});

test("template: unknown variable throws ARM020", () => {
  const manifest = makeManifest();
  assert.throws(
    () => renderTemplate("<<armonia:does.not.exist>>", manifest),
    /Unknown template variable/
  );
});

test("symlink traversal: pack source via symlink outside boundary is rejected", async () => {
  const directory = await mkdtemp(join(tmpdir(), "armonia-symlink-"));
  const outsideDir = await mkdtemp(join(tmpdir(), "armonia-outside-"));
  try {
    await writeFile(join(outsideDir, "secret.txt"), "sensitive data", "utf8");

    await initializeProject(directory, {
      name: "Symlink test",
      id: "test/symlink",
      owner: "tester",
      language: "generic",
      profile: "experimental",
    });

    const manifest = await loadProjectManifest(directory);
    manifest.spec.packs.push({
      id: "capability/evil",
      version: "1.0.0",
      path: ".armonia/evil-pack.yaml",
    });
    await writeYaml(resolve(directory, ".armonia/project.yaml"), manifest);

    const packDir = resolve(directory, ".armonia/evil-templates");
    await mkdir(packDir, { recursive: true });
    await symlink(join(outsideDir, "secret.txt"), join(packDir, "symlinked.txt"));

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
  - target: stolen.txt
    source: evil-templates/symlinked.txt
    ownership: managed
`
    );

    await assert.rejects(createPlan(directory), /escapes its allowed root/);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(outsideDir, { recursive: true, force: true });
  }
});

test("conditionMatches: unknown condition throws ARM021", () => {
  const manifest = makeManifest();
  assert.throws(
    () => conditionMatches("nonexistent-condition", manifest),
    /Unknown pack-file condition/
  );
});

test("conditionMatches: distribution condition works correctly", () => {
  const withDist = makeManifest();
  withDist.spec.distribution = { repository: "org/repo", ref: "abc123" };
  assert.equal(conditionMatches("distribution", withDist), true);

  const withoutDist = makeManifest();
  assert.equal(conditionMatches("distribution", withoutDist), false);
});

test("distribution-pinned: empty ref is flagged when distribution is declared", async () => {
  const directory = await mkdtemp(join(tmpdir(), "armonia-distpin-"));
  try {
    await initializeProject(directory, {
      name: "DistPin test",
      id: "test/distpin",
      owner: "tester",
      language: "generic",
      profile: "baseline",
      distributionRepository: "org/armonia",
      distributionRef: "not-a-sha",
    });
    const { validateProject } = await import("../src/validate.ts");
    const result = await validateProject(directory);
    const pinDiag = result.diagnostics.find((d) => d.rule === "github.distribution-pinned");
    assert.ok(pinDiag, "distribution-pinned should fire for non-SHA ref");
    assert.equal(pinDiag.severity, "warning");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("distribution-pinned: valid SHA passes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "armonia-distpin2-"));
  try {
    await initializeProject(directory, {
      name: "DistPin OK",
      id: "test/distpin-ok",
      owner: "tester",
      language: "generic",
      profile: "baseline",
      distributionRepository: "org/armonia",
      distributionRef: "16d4b7846a40e1ce68aa7cb06f3884670d562701",
    });
    const { validateProject } = await import("../src/validate.ts");
    const result = await validateProject(directory);
    const pinDiag = result.diagnostics.find((d) => d.rule === "github.distribution-pinned");
    assert.equal(pinDiag, undefined, "valid SHA should not trigger distribution-pinned");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("diff command reports clean state after fresh init", async () => {
  const directory = await mkdtemp(join(tmpdir(), "armonia-diff-"));
  try {
    await initializeProject(directory, {
      name: "Diff test",
      id: "test/diff",
      owner: "tester",
      language: "generic",
      profile: "experimental",
    });
    const { diffProject } = await import("../src/diff.ts");
    const result = await diffProject(directory);
    assert.equal(result.clean, true);
    assert.equal(result.summary.total, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("determinism: same input produces identical plan entries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "armonia-determ-"));
  try {
    await initializeProject(directory, {
      name: "Determinism test",
      id: "test/determinism",
      owner: "tester",
      language: "typescript",
      archetype: "library",
      profile: "baseline",
    });
    const { createPlan } = await import("../src/planner.ts");
    const plan1 = await createPlan(directory);
    const plan2 = await createPlan(directory);
    const strip = (p: typeof plan1) => p.entries.map(({ desiredContent: _, ...e }) => e);
    assert.deepEqual(strip(plan1), strip(plan2));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("readonly: validate, plan, status and diff do not modify the repository", async () => {
  const directory = await mkdtemp(join(tmpdir(), "armonia-readonly-"));
  try {
    await initializeProject(directory, {
      name: "Readonly test",
      id: "test/readonly",
      owner: "tester",
      language: "generic",
      profile: "experimental",
    });
    // Snapshot all files
    const { readdir, stat, readFile } = await import("node:fs/promises");
    const snapshot = new Map<string, string>();
    async function walk(dir: string) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { await walk(full); }
        else { snapshot.set(full, (await readFile(full, "utf8"))); }
      }
    }
    await walk(directory);

    // Run readonly commands
    const { validateProject } = await import("../src/validate.ts");
    const { createPlan } = await import("../src/planner.ts");
    const { projectStatus } = await import("../src/status.ts");
    const { diffProject } = await import("../src/diff.ts");
    await validateProject(directory);
    await createPlan(directory);
    await projectStatus(directory);
    await diffProject(directory);

    // Verify nothing changed
    const after = new Map<string, string>();
    async function walk2(dir: string) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { await walk2(full); }
        else { after.set(full, (await readFile(full, "utf8"))); }
      }
    }
    await walk2(directory);
    assert.deepEqual([...after.keys()].sort(), [...snapshot.keys()].sort());
    for (const [path, content] of snapshot) {
      assert.equal(after.get(path), content, `File modified: ${path}`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
