import { readText, writeTextAtomic } from "./fs.ts";
import { ArmoniaError } from "./errors.ts";

/** Maximum nesting depth to prevent DoS via deeply nested input */
const MAX_DEPTH = 64;
/** Maximum document size in bytes */
const MAX_SIZE = 1_048_576; // 1 MB

/**
 * Unquoted scalars that indicate YAML features Armonìa deliberately does not support.
 * Detection happens at the scalar level rather than over the raw document so that
 * quoted strings, comments, and block-scalar bodies cannot produce false positives.
 */
const ANCHOR = /^&[A-Za-z0-9_][\w.-]*$/;
const ALIAS = /^\*[A-Za-z0-9_][\w.-]*$/;
const TAG = /^!!?[A-Za-z]/;
const BLOCK_INDICATOR = /^([|>])([+-]?)$/;
const BLOCK_WITH_EXPLICIT_INDENT = /^[|>][+-]?\d/;

type Chomping = "clip" | "strip" | "keep";

interface BlockStyle {
  folded: boolean;
  chomp: Chomping;
}

interface Line {
  indent: number;
  content: string;
  /** 1-based line number in the source document */
  number: number;
}

function blockStyle(rawValue: string): BlockStyle | undefined {
  if (BLOCK_WITH_EXPLICIT_INDENT.test(rawValue)) {
    throw new ArmoniaError(
      "ARM001",
      `Explicit block-scalar indentation indicators are not supported: ${rawValue}`
    );
  }
  const match = BLOCK_INDICATOR.exec(rawValue);
  if (!match) {
    return undefined;
  }
  const chomp: Chomping = match[2] === "-" ? "strip" : match[2] === "+" ? "keep" : "clip";
  return { folded: match[1] === ">", chomp };
}

function stripComment(source: string): string {
  let quote: "'" | '"' | undefined;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== "\\") {
        quote = undefined;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "#" && (index === 0 || /\s/.test(source[index - 1] ?? ""))) {
      return source.slice(0, index).trimEnd();
    }
  }
  return source.trimEnd();
}

function splitOutside(source: string, separator: string): string[] {
  const output: string[] = [];
  let quote: "'" | '"' | undefined;
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== "\\") {
        quote = undefined;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "[" || character === "{") {
      depth += 1;
    } else if (character === "]" || character === "}") {
      depth -= 1;
    } else if (character === separator && depth === 0) {
      output.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  output.push(source.slice(start).trim());
  return output;
}

function keyValue(source: string): [string, string] | undefined {
  const parts = splitOutside(source, ":");
  if (parts.length < 2) {
    return undefined;
  }
  const key = parts.shift() ?? "";
  return [key.trim().replace(/^["']|["']$/g, ""), parts.join(":").trim()];
}

function scalar(source: string): unknown {
  const value = source.trim();
  if (ANCHOR.test(value) || ALIAS.test(value)) {
    throw new ArmoniaError(
      "ARM001",
      `YAML anchors and aliases (&, *) are not supported in Armonìa manifests: ${value}`
    );
  }
  if (TAG.test(value)) {
    throw new ArmoniaError(
      "ARM001",
      `YAML tags (!type) are not supported in Armonìa manifests: ${value}`
    );
  }
  if (value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    return inner ? splitOutside(inner, ",").map(scalar) : [];
  }
  if (value === "{}") return {};
  if (value === "[]") return [];
  return value;
}

function tokenize(rawLines: string[]): Line[] {
  const lines: Line[] = [];
  rawLines.forEach((raw, index) => {
    // Tabs are only rejected in the indentation region; block-scalar bodies may contain them.
    if (/^ *\t/.test(raw)) {
      throw new ArmoniaError("ARM001", `Tabs are not allowed in YAML indentation at line ${index + 1}`);
    }
    const stripped = stripComment(raw);
    if (!stripped.trim()) return;
    const indent = stripped.length - stripped.trimStart().length;
    lines.push({ indent, content: stripped.trimStart(), number: index + 1 });
  });
  return lines;
}

function parseDocument(source: string): unknown {
  if (source.length > MAX_SIZE) {
    throw new ArmoniaError("ARM001", `YAML document exceeds maximum size of ${MAX_SIZE} bytes`);
  }
  if (/^%/.test(source.trim())) {
    throw new ArmoniaError("ARM001", "YAML directives (%YAML, %TAG) are not supported");
  }
  const trimmed = source.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as unknown;
  }

  const rawLines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  const lines = tokenize(rawLines);
  if (lines.length === 0) return {};

  let depth = 0;

  function parseNode(index: number, indent: number): [unknown, number] {
    depth += 1;
    if (depth > MAX_DEPTH) {
      throw new ArmoniaError("ARM001", `YAML nesting exceeds maximum depth of ${MAX_DEPTH}`);
    }
    try {
      const line = lines[index];
      if (!line || line.indent !== indent) {
        throw new ArmoniaError("ARM001", `Invalid YAML indentation near line ${line?.number ?? "EOF"}`);
      }
      return line.content === "-" || line.content.startsWith("- ")
        ? parseSequence(index, indent)
        : parseMap(index, indent);
    } finally {
      depth -= 1;
    }
  }

  /**
   * Reads a literal (`|`) or folded (`>`) block scalar directly from the raw source lines so
   * that comment characters, blank lines, and relative indentation are preserved verbatim.
   *
   * @param tokenIndex index into `lines` of the first token after the block-scalar key
   * @param keyLineNumber 1-based source line number of the key that introduced the block
   * @param parentIndent indentation of the key that introduced the block
   * @returns the scalar value and the next index into `lines`
   */
  function parseBlockScalar(
    tokenIndex: number,
    keyLineNumber: number,
    parentIndent: number,
    style: BlockStyle
  ): [string, number] {
    const collected: string[] = [];
    let rawIndex = keyLineNumber; // 0-based index of the line following the key
    let blockIndent = -1;

    while (rawIndex < rawLines.length) {
      const raw = rawLines[rawIndex] ?? "";
      if (raw.trim() === "") {
        collected.push("");
        rawIndex += 1;
        continue;
      }
      const indent = raw.length - raw.trimStart().length;
      if (indent <= parentIndent) break;
      if (blockIndent === -1) blockIndent = indent;
      if (indent < blockIndent) break;
      collected.push(raw.slice(blockIndent).replace(/\s+$/, ""));
      rawIndex += 1;
    }

    let end = collected.length;
    while (end > 0 && collected[end - 1] === "") end -= 1;
    const trailingBlanks = collected.length - end;
    const body = collected.slice(0, end);

    let text = "";
    for (let index = 0; index < body.length; index += 1) {
      const line = body[index] ?? "";
      if (index > 0) {
        const previous = body[index - 1] ?? "";
        const foldable =
          style.folded && previous !== "" && line !== "" && !/^\s/.test(previous) && !/^\s/.test(line);
        text += foldable ? " " : "\n";
      }
      text += line;
    }

    if (style.chomp === "keep") {
      text += "\n".repeat(1 + trailingBlanks);
    } else if (style.chomp === "clip" && body.length > 0) {
      text += "\n";
    }

    // Advance past every token whose source line was consumed by the block.
    let next = tokenIndex;
    while (next < lines.length && (lines[next]?.number ?? Number.POSITIVE_INFINITY) <= rawIndex) {
      next += 1;
    }
    return [text, next];
  }

  function parseMap(
    start: number,
    indent: number,
    initial: Record<string, unknown> = {}
  ): [Record<string, unknown>, number] {
    const output = initial;
    let index = start;
    while (index < lines.length) {
      const line = lines[index];
      if (!line || line.indent < indent) break;
      if (line.indent > indent || line.content === "-" || line.content.startsWith("- ")) break;
      const pair = keyValue(line.content);
      if (!pair) {
        throw new ArmoniaError("ARM001", `Expected a YAML mapping at line ${line.number}`);
      }
      const [key, rawValue] = pair;
      if (!key) {
        throw new ArmoniaError("ARM001", `Empty YAML key at line ${line.number}`);
      }
      if (key === "<<") {
        throw new ArmoniaError(
          "ARM001",
          `YAML merge keys (<<) are not supported in Armonìa manifests at line ${line.number}`
        );
      }
      const keyLineNumber = line.number;
      index += 1;
      const block = blockStyle(rawValue);
      if (block) {
        [output[key], index] = parseBlockScalar(index, keyLineNumber, indent, block);
      } else if (rawValue) {
        output[key] = scalar(rawValue);
      } else {
        const next = lines[index];
        if (next && next.indent > indent) {
          [output[key], index] = parseNode(index, next.indent);
        } else {
          output[key] = null;
        }
      }
    }
    return [output, index];
  }

  function parseSequence(start: number, indent: number): [unknown[], number] {
    const output: unknown[] = [];
    let index = start;
    while (index < lines.length) {
      const line = lines[index];
      if (!line || line.indent < indent) break;
      if (line.indent !== indent || !(line.content === "-" || line.content.startsWith("- "))) break;
      const rest = line.content.slice(1).trim();
      const keyLineNumber = line.number;
      index += 1;
      if (!rest) {
        const next = lines[index];
        if (!next || next.indent <= indent) {
          output.push(null);
        } else {
          const [value, nextIndex] = parseNode(index, next.indent);
          output.push(value);
          index = nextIndex;
        }
        continue;
      }

      const pair = keyValue(rest);
      if (!pair) {
        output.push(scalar(rest));
        continue;
      }
      const object: Record<string, unknown> = {};
      const [key, rawValue] = pair;
      // Keys inside a sequence item are indented by the two characters of the "- " prefix.
      const itemIndent = indent + 2;
      const block = blockStyle(rawValue);
      if (block) {
        [object[key], index] = parseBlockScalar(index, keyLineNumber, itemIndent, block);
      } else if (rawValue) {
        object[key] = scalar(rawValue);
      } else {
        const next = lines[index];
        if (next && next.indent > indent) {
          [object[key], index] = parseNode(index, next.indent);
        } else {
          object[key] = null;
        }
      }
      const next = lines[index];
      if (next && next.indent > indent) {
        const [value, nextIndex] = parseMap(index, next.indent, object);
        output.push(value);
        index = nextIndex;
      } else {
        output.push(object);
      }
    }
    return [output, index];
  }

  const [value, next] = parseNode(0, lines[0]?.indent ?? 0);
  if (next !== lines.length) {
    throw new ArmoniaError("ARM001", `Unexpected YAML content at line ${lines[next]?.number}`);
  }
  return value;
}

function yamlScalar(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return JSON.stringify(String(value));
}

/**
 * Renders a multi-line string as a literal block scalar when doing so round-trips exactly.
 * Returns undefined when the value must fall back to a quoted scalar.
 */
function blockScalarLines(key: string, value: string, prefix: string, indent: number): string[] | undefined {
  if (!value.includes("\n")) return undefined;
  const endsWithNewline = value.endsWith("\n");
  const body = endsWithNewline ? value.slice(0, -1) : value;
  const bodyLines = body.split("\n");
  const first = bodyLines[0] ?? "";
  // A leading blank or indented first line makes the block indentation ambiguous, and trailing
  // whitespace is not preserved by block scalars.
  if (first === "" || /^\s/.test(first)) return undefined;
  if (bodyLines.some((line) => line !== "" && /\s$/.test(line))) return undefined;
  if (bodyLines.some((line) => /^\s*$/.test(line) && line !== "")) return undefined;
  if (body.endsWith("\n")) return undefined;
  const inner = " ".repeat(indent + 2);
  return [
    `${prefix}${key}: ${endsWithNewline ? "|" : "|-"}`,
    ...bodyLines.map((line) => (line === "" ? "" : `${inner}${line}`))
  ];
}

function emit(value: unknown, indent: number): string[] {
  const prefix = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${prefix}[]`];
    const lines: string[] = [];
    for (const item of value) {
      if (item !== null && typeof item === "object") {
        lines.push(`${prefix}-`);
        lines.push(...emit(item, indent + 2));
      } else {
        lines.push(`${prefix}- ${yamlScalar(item)}`);
      }
    }
    return lines;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return [`${prefix}{}`];
    const lines: string[] = [];
    for (const [key, item] of entries) {
      if (typeof item === "string") {
        const block = blockScalarLines(key, item, prefix, indent);
        if (block) {
          lines.push(...block);
          continue;
        }
      }
      if (item !== null && typeof item === "object") {
        if ((Array.isArray(item) && item.length === 0) || (!Array.isArray(item) && Object.keys(item).length === 0)) {
          lines.push(`${prefix}${key}: ${Array.isArray(item) ? "[]" : "{}"}`);
        } else {
          lines.push(`${prefix}${key}:`);
          lines.push(...emit(item, indent + 2));
        }
      } else {
        lines.push(`${prefix}${key}: ${yamlScalar(item)}`);
      }
    }
    return lines;
  }
  return [`${prefix}${yamlScalar(value)}`];
}

export async function readYaml<T>(path: string): Promise<T> {
  try {
    return parseDocument(await readText(path)) as T;
  } catch (error) {
    if (error instanceof ArmoniaError) throw error;
    throw new ArmoniaError("ARM001", `Cannot parse YAML file: ${path}`, error);
  }
}

export async function writeYaml(path: string, value: unknown): Promise<void> {
  await writeTextAtomic(path, serializeYaml(value));
}

export function serializeYaml(value: unknown): string {
  return `${emit(value, 0).join("\n")}\n`;
}

export function parseYaml<T>(source: string): T {
  return parseDocument(source) as T;
}
