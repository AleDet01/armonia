export const STANDARD_ENV = new Set([
  "CI", "HOME", "PATH", "PWD", "SHELL", "TERM", "TMP", "TEMP", "USER",
  "USERNAME", "NODE_ENV", "CODEX_SANDBOX", "GITHUB_ACTIONS", "GITHUB_REPOSITORY",
]);

/** @param {string} left @param {string} right */
export function compareText(left, right) {
  // Repository ordering must not depend on the machine's language/locale.
  return left < right ? -1 : left > right ? 1 : 0;
}

export function secretPatterns() {
  return [
    /\bAKIA[0-9A-Z]{16}\b/g,
    /\bgh[pousr]_[A-Za-z0-9_]{24,}\b/g,
    /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  ];
}

/** Sanitize repository-controlled strings before they enter any report. */
export function safeText(value) {
  let text = String(value);
  text = text.replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, "[redacted]");
  for (const pattern of secretPatterns()) text = text.replace(pattern, "[redacted]");
  // Do not let repository strings inject terminal control sequences.
  text = text.replace(/\r\n|\r|\n|\t/g, " ");
  return Array.from(text).filter((character) => {
    const code = character.codePointAt(0);
    return code >= 32 && (code < 127 || code > 159);
  }).join("");
}

/** Conservative major-level range comparison; unsupported syntax is unknown. */
export function nodeMajorsConflict(declarations) {
  const ranges = declarations.map((raw) => {
    const text = String(raw).replace(/^Node(?:\.js)?\s*(?:version\s*)?/i, "").trim();
    const match = text.match(/^(>=|>|<=|<|\^|~|=|v)?\s*(\d{1,3})(?:\.\d+|\.x|\.\*){0,2}(?:[-+][\w.-]+)?$/i);
    if (!match) return null;
    const major = Number(match[2]);
    // Patch/minor bounds cannot be proved contradictory at major resolution.
    if ([">=", ">"].includes(match[1])) return [major, Infinity];
    if (["<=", "<"].includes(match[1])) return [0, major];
    return [major, major];
  }).filter(Boolean);
  let lower = 0;
  let upper = Infinity;
  for (const [minimum, maximum] of ranges) {
    lower = Math.max(lower, minimum);
    upper = Math.min(upper, maximum);
  }
  return ranges.length > 1 && lower > upper;
}

export function validManifest(value) {
  const record = (item) => item !== null && typeof item === "object" && !Array.isArray(item);
  if (!record(value)) return false;
  for (const field of ["scripts", "engines", "dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    if (value[field] === undefined) continue;
    if (!record(value[field])) return false;
    if (Object.values(value[field]).some((item) => typeof item !== "string")) return false;
  }
  return true;
}
