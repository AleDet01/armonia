import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { compareText } from "./text.mjs";

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
  ".armonia",
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
  ".cjs",
  ".cts",
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
  "copying",
  ".nvmrc",
  ".node-version",
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
    base.startsWith("dockerfile.") ||
    base === ".gitignore" ||
    base === ".npmrc"
  );
}

function wildcardToRegExp(pattern) {
  const escaped = normalizePath(pattern)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**/", "\u0001")
    .replaceAll("**", "\u0000")
    .replaceAll("*", "[^/]*")
    .replaceAll("?", "[^/]")
    .replaceAll("\u0000", ".*")
    .replaceAll("\u0001", "(?:.*/)?");
  return new RegExp(`^(?:${escaped})(?:/.*)?$`, "i");
}

export async function walkFiles(
  root,
  { exclude = [], maxFiles = 10_000 } = {},
) {
  const files = [];
  const directories = [];
  const skipped = [];
  const customIgnores = exclude.map(wildcardToRegExp);
  let truncated = false;
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("Scan root must be a real directory, not a symbolic link");
  const resolvedRoot = await realpath(root);

  async function visit(directory) {
    let entries;
    try {
      const resolved = await realpath(directory);
      const relative = path.relative(resolvedRoot, resolved);
      if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || relative === "..") throw new Error("outside root");
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      skipped.push({ source: normalizePath(path.relative(root, directory)) || ".", reason: "unreadable directory" });
      return;
    }

    entries.sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = normalizePath(path.relative(root, absolute));
      if (
        DEFAULT_IGNORED.has(entry.name.toLowerCase()) ||
        customIgnores.some((pattern) => pattern.test(relative))
      ) {
        continue;
      }

      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        directories.push(relative);
        await visit(absolute);
      } else if (entry.isFile()) {
        if (files.length >= maxFiles) {
          truncated = true;
          return;
        }
        files.push(relative);
      }
      if (truncated) return;
    }
  }

  await visit(root);
  return { files, directories, skipped, truncated };
}

export async function readTextFiles(root, files, maxFileBytes = 512_000) {
  const texts = new Map();
  const skipped = [];
  const resolvedRoot = await realpath(root);
  const candidates = files.filter(isTextCandidate);
  const totalLimit = 64 * 1024 * 1024;
  let retainedBytes = 0;

  async function read(relative) {
    const absolute = path.join(root, relative);
    let handle;
    try {
      const info = await lstat(absolute, { bigint: true });
      const resolved = await realpath(absolute);
      const fromRoot = path.relative(resolvedRoot, resolved);
      if (
        !info.isFile() || info.isSymbolicLink() || fromRoot === ".." ||
        fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)
      ) return { reason: "not a regular in-root file" };
      if (info.size > maxFileBytes) return { reason: "file size limit" };
      handle = await open(absolute, "r");
      const opened = await handle.stat({ bigint: true });
      // Older Node/libuv on Windows reports dev=0 for path stats, but a real
      // volume ID for fstat. In that case only inode + canonical root are
      // comparable. BigInt stats avoid rounding NTFS file identifiers.
      const deviceMatches = process.platform === "win32" && info.dev === 0n
        ? true
        : opened.dev === info.dev;
      if (!opened.isFile() || !deviceMatches || opened.ino !== info.ino || opened.size !== info.size) return { reason: "file changed during scan" };
      // Reserve only the observed size plus one growth-detection byte, not the
      // full configured limit for every tiny file. Never retain partial reads.
      const buffer = Buffer.alloc(Number(info.size) + 1);
      let bytes = 0;
      while (bytes < buffer.length) {
        const result = await handle.read(buffer, bytes, buffer.length - bytes, null);
        if (!result.bytesRead) break;
        bytes += result.bytesRead;
      }
      if (bytes > maxFileBytes) return { reason: "file size limit" };
      const afterRead = await handle.stat({ bigint: true });
      if (BigInt(bytes) !== info.size || afterRead.size !== info.size || afterRead.mtimeNs !== opened.mtimeNs) return { reason: "file changed during scan" };
      const content = buffer.subarray(0, bytes).toString("utf8");
      return content.includes("\u0000") ? { reason: "binary content" } : { content, bytes };
    } catch {
      return { reason: "unreadable file" };
    } finally {
      if (handle) await handle.close();
    }
  }

  // Bounded batches preserve traversal order and cap concurrent disk handles.
  for (let offset = 0; offset < candidates.length; offset += 8) {
    const batch = candidates.slice(offset, offset + 8);
    const results = retainedBytes >= totalLimit ? [] : await Promise.all(batch.map(read));
    batch.forEach((source, index) => {
      const result = results[index];
      if (!result || (result.bytes !== undefined && retainedBytes + result.bytes > totalLimit)) skipped.push({ source, reason: "total text size limit" });
      else if (result.reason) skipped.push({ source, reason: result.reason });
      else {
        retainedBytes += result.bytes;
        texts.set(source, result.content);
      }
    });
  }
  return { texts, skipped };
}

export async function readTextMap(root, files, maxFileBytes = 512_000) {
  const { texts } = await readTextFiles(root, files, maxFileBytes);
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
