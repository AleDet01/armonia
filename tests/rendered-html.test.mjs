import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { pagesDeployment } from "../src/site/pages.mjs";
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

test("every local exported asset resolves under the deployed Pages mount", async () => {
  const html = await readStaticPage();
  const { prefix, url } = pagesDeployment();
  let verified = 0;
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    const asset = match[1];
    if (/^(?:https?:|data:)/.test(asset)) continue;
    const resolved = new URL(asset, url);
    if (prefix) assert.ok(resolved.pathname.startsWith(`${prefix}/`), asset);
    const relative = decodeURIComponent(resolved.pathname.slice(prefix.length).replace(/^\//, ""));
    await access(new URL(`../dist/client/${relative}`, import.meta.url));
    verified += 1;
  }
  assert.ok(verified >= 5);
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
