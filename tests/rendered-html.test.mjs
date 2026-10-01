import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readStaticPage() {
  return readFile(new URL("../dist/client/index.html", import.meta.url), "utf8");
}

test("static export contains the finished Armonia product surface", async () => {
  const html = await readStaticPage();
  assert.match(html, /<title>Armonia — Repository truth, reconciled<\/title>/i);
  assert.match(html, /Find drift/);
  assert.match(html, /Scan a folder/);
  assert.match(html, /Three signals/);
  assert.match(html, /format sarif/);
  assert.match(html, /_next\/static/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/);
});

test("the starter preview is removed and accessibility affordances remain", async () => {
  const [page, layout, css, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview|codex-preview/);
  assert.doesNotMatch(layout, /Starter Project/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton|drizzle-orm/);
  assert.match(page, /aria-label="Primary navigation"/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /:focus-visible/);
});
