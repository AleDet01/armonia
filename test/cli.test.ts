import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { runCli } from "../src/cli.ts";
import { startUiServer } from "../src/ui.ts";

test("CLI returns stable usage and success exit classes", async () => {
  assert.equal(await runCli(["version"]), 0);
  assert.equal(await runCli(["does-not-exist"]), 2);
});

test("CLI initializes, validates, plans, and dry-runs a capability", async () => {
  const directory = await mkdtemp(join(tmpdir(), "armonia-cli-"));
  try {
    assert.equal(
      await runCli([
        "init",
        directory,
        "--name",
        "CLI test",
        "--id",
        "test/cli",
        "--owner",
        "tester",
        "--language",
        "go",
        "--profile",
        "baseline",
        "--json"
      ]),
      0
    );
    assert.equal(await runCli(["validate", directory, "--json"]), 0);
    assert.equal(await runCli(["plan", directory, "--json"]), 0);
    assert.equal(
      await runCli(["run", "test", "--root", directory, "--component", "root", "--dry-run", "--json"]),
      0
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test("local UI serves a project overview without opening a browser", async () => {
  const directory = await mkdtemp(join(tmpdir(), "armonia-ui-"));
  let handle: { url: string; close(): Promise<void> } | undefined;
  try {
    assert.equal(
      await runCli([
        "init",
        directory,
        "--name",
        "UI test",
        "--id",
        "test/ui",
        "--owner",
        "tester",
        "--language",
        "typescript",
        "--profile",
        "baseline",
        "--json"
      ]),
      0
    );
    handle = await startUiServer(directory, { openBrowser: false, quiet: true });
    const response = await fetch(handle.url + "api/overview");
    assert.equal(response.status, 200);
    const overview = await response.json();
    assert.equal(overview.project.name, "UI test");
    assert.equal(typeof overview.csrfToken, "string");
    assert.ok(Array.isArray(overview.plan.entries));
  } finally {
    await handle?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
