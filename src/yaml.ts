import { readText, writeTextAtomic } from "./fs.ts";
import { ArmoniaError } from "./errors.ts";

interface Line {
  indent: number;
  content: string;
  number: number;
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

function tokenize(source: string): Line[] {
  const lines: Line[] = [];
  source.replace(/^\uFEFF/, "").split(/\r?\n/).forEach((raw, index) => {
    if (raw.includes("\t")) {
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
  const trimmed = source.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as unknown;
  }
  const lines = tokenize(source);
  if (lines.length === 0) return {};

  function parseNode(index: number, indent: number): [unknown, number] {
    const line = lines[index];
    if (!line || line.indent !== indent) {
      throw new ArmoniaError("ARM001", `Invalid YAML indentation near line ${line?.number ?? "EOF"}`);
    }
    return line.content === "-" || line.content.startsWith("- ")
      ? parseSequence(index, indent)
      : parseMap(index, indent);
  }

  function parseBlockScalar(start: number, parentIndent: number, folded: boolean): [string, number] {
    const parts: string[] = [];
    let index = start;
    while (index < lines.length) {
      const line = lines[index];
      if (!line || line.indent <= parentIndent) break;
      parts.push(line.content);
      index += 1;
    }
    return [`${parts.join(folded ? " " : "\n")}\n`, index];
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
      index += 1;
      if (rawValue === "|" || rawValue === ">") {
        [output[key], index] = parseBlockScalar(index, indent, rawValue === ">");
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
      if (rawValue === "|" || rawValue === ">") {
        [object[key], index] = parseBlockScalar(index, indent, rawValue === ">");
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
