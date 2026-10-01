import { access, readFile, rename, rmdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pagesDeployment } from "../src/site/pages.mjs";

const root = fileURLToPath(new URL("../dist/client/", import.meta.url));
const { prefix } = pagesDeployment();
if (prefix) {
  // Vinext puts assetPrefix in both URLs and disk paths. Pages already mounts
  // the artifact under that prefix, so normalize the physical paths once.
  const nested = path.resolve(root, prefix.slice(1), "_next");
  const target = path.join(root, "_next");
  if (!nested.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("Asset directory must stay inside the static export");
  let exists = true;
  try { await access(nested); } catch (error) { if (error.code !== "ENOENT") throw error; exists = false; }
  if (exists) {
    await rename(nested, target);
    await rmdir(path.dirname(nested));
  }
}

const html = await readFile(path.join(root, "index.html"), "utf8");
for (const match of html.matchAll(/(?:src|href)="([^"?#]+)(?:[?#][^"]*)?"/g)) {
  const url = match[1];
  if (!url.includes("/_next/")) continue;
  if (prefix && !url.startsWith(`${prefix}/`)) throw new Error("Exported asset URL has the wrong Pages prefix");
  const relative = decodeURIComponent(url.slice(prefix.length).replace(/^\//, ""));
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("Asset URL escapes the static export");
  await access(absolute);
}
console.log("Static asset paths verified.");
