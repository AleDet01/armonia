import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_IGNORED = new Set([
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".vinext",
  ".wrangler",
  ".turbo",
  ".cache",
  ".codex-tmp",
  ".venv",
  "venv",
  "node_modules",
  "coverage",
  "dist",
  "out",
  "target",
  "vendor",
  "__pycache__",
]);

const TEXT_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".dockerfile",
  ".env",
  ".go",
  ".h",
  ".hpp",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".md",
  ".mdx",
  ".mjs",
  ".mts",
  ".php",
  ".properties",
  ".ps1",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const TEXT_NAMES = new Set([
  "dockerfile",
  "gemfile",
  "makefile",
  "procfile",
  "license",
  "notice",
]);

export function normalizePath(value) {
  return value.split(path.sep).join("/");
}

export function lineNumber(text, index) {
  return text.slice(0, Math.max(0, index)).split("\n").length;
}

export function isTextCandidate(relativePath) {
  const base = path.basename(relativePath).toLowerCase();
  const extension = path.extname(base);
  return (
    TEXT_EXTENSIONS.has(extension) ||
    TEXT_NAMES.has(base) ||
    base.startsWith("readme") ||
    base.startsWith("license") ||
    base.startsWith(".env") ||
    base === ".gitignore" ||
    base === ".npmrc"
  );
}

function wildcardToRegExp(pattern) {
  const escaped = normalizePath(pattern)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", "\u0000")
    .replaceAll("*", "[^/]*")
    .replaceAll("\u0000", ".*")
    .replaceAll("?", ".");
  return new RegExp(`^(?:${escaped})(?:/.*)?$`, "i");
}

export async function walkFiles(
  root,
  { exclude = [], maxFiles = 10_000 } = {},
) {
  const files = [];
  const customIgnores = exclude.map(wildcardToRegExp);
  let truncated = false;

  async function visit(directory) {
    if (files.length >= maxFiles) {
      truncated = true;
      return;
    }

    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= maxFiles) {
        truncated = true;
        return;
      }

      const absolute = path.join(directory, entry.name);
      const relative = normalizePath(path.relative(root, absolute));
      if (
        DEFAULT_IGNORED.has(entry.name.toLowerCase()) ||
        customIgnores.some((pattern) => pattern.test(relative))
      ) {
        continue;
      }

      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(relative);
    }
  }

  await visit(root);
  return { files, truncated };
}

export async function readTextMap(root, files, maxFileBytes = 512_000) {
  const texts = new Map();
  await Promise.all(
    files.filter(isTextCandidate).map(async (relative) => {
      const absolute = path.join(root, relative);
      try {
        const info = await stat(absolute);
        if (info.size > maxFileBytes) return;
        const content = await readFile(absolute, "utf8");
        if (!content.includes("\u0000")) texts.set(relative, content);
      } catch {
        // Unreadable files are represented by absence; checks remain deterministic.
      }
    }),
  );
  return texts;
}

export function closestPackage(packages, sourcePath) {
  const sourceDirectory = path.posix.dirname(normalizePath(sourcePath));
  return (
    packages
      .filter((candidate) => {
        const directory = path.posix.dirname(candidate.path);
        return directory === "." || sourceDirectory.startsWith(`${directory}/`) || sourceDirectory === directory;
      })
      .sort((a, b) => b.path.length - a.path.length)[0] ??
    packages.find((candidate) => candidate.path === "package.json") ??
    null
  );
}
