import { readText } from "./fs.ts";
import { schemaPath } from "./paths.ts";
import { ArmoniaError } from "./errors.ts";

interface SchemaError {
  path: string;
  message: string;
}

type Schema = Record<string, unknown>;

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pointer(root: Schema, reference: string): Schema {
  if (!reference.startsWith("#/")) {
    throw new ArmoniaError("ARM002", `Only local JSON Schema references are supported: ${reference}`);
  }
  let current: unknown = root;
  for (const rawPart of reference.slice(2).split("/")) {
    const part = rawPart.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!current || typeof current !== "object" || !(part in current)) {
      throw new ArmoniaError("ARM002", `Unresolvable JSON Schema reference: ${reference}`);
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current as Schema;
}

function typeMatches(type: string, value: unknown): boolean {
  switch (type) {
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number";
    case "string":
    case "boolean":
      return typeof value === type;
    case "null":
      return value === null;
    default:
      return true;
  }
}

function validateNode(
  schema: Schema,
  value: unknown,
  path: string,
  root: Schema,
  errors: SchemaError[]
): void {
  if (typeof schema.$ref === "string") {
    validateNode(pointer(root, schema.$ref), value, path, root, errors);
    return;
  }

  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((candidate) => {
      const nested: SchemaError[] = [];
      validateNode(candidate as Schema, value, path, root, nested);
      return nested.length === 0;
    });
    if (matches.length !== 1) {
      errors.push({ path, message: "must match exactly one allowed schema" });
    }
    return;
  }

  if ("const" in schema && !same(value, schema.const)) {
    errors.push({ path, message: `must equal ${JSON.stringify(schema.const)}` });
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => same(candidate, value))) {
    errors.push({ path, message: `must be one of ${schema.enum.join(", ")}` });
  }
  if (typeof schema.type === "string" && !typeMatches(schema.type, value)) {
    errors.push({ path, message: `must be ${schema.type}` });
    return;
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push({ path, message: `must contain at least ${schema.minLength} character(s)` });
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      errors.push({ path, message: `must match ${schema.pattern}` });
    }
    if (schema.format === "date") {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      const timestamp = match ? Date.parse(`${value}T00:00:00Z`) : Number.NaN;
      const canonical = Number.isNaN(timestamp)
        ? ""
        : new Date(timestamp).toISOString().slice(0, 10);
      if (!match || canonical !== value) {
        errors.push({ path, message: "must be a valid YYYY-MM-DD date" });
      }
    }
  }

  if (typeof value === "number" && typeof schema.minimum === "number" && value < schema.minimum) {
    errors.push({ path, message: `must be at least ${schema.minimum}` });
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push({ path, message: `must contain at least ${schema.minItems} item(s)` });
    }
    if (schema.uniqueItems === true) {
      const serialized = value.map((item) => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) {
        errors.push({ path, message: "must contain unique items" });
      }
    }
    if (schema.items && typeof schema.items === "object") {
      value.forEach((item, index) =>
        validateNode(schema.items as Schema, item, `${path}/${index}`, root, errors)
      );
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    for (const required of (schema.required ?? []) as string[]) {
      if (!(required in record)) {
        errors.push({ path, message: `is missing required property ${required}` });
      }
    }
    for (const [key, item] of Object.entries(record)) {
      if (properties[key]) {
        validateNode(properties[key], item, `${path}/${key}`, root, errors);
      } else if (schema.additionalProperties === false) {
        errors.push({ path: `${path}/${key}`, message: "is not an allowed property" });
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        validateNode(schema.additionalProperties as Schema, item, `${path}/${key}`, root, errors);
      }
    }
  }
}

export async function validateSchema(name: string, value: unknown): Promise<void> {
  const schema = JSON.parse(await readText(schemaPath(name))) as Schema;
  const errors: SchemaError[] = [];
  validateNode(schema, value, "", schema, errors);
  if (errors.length > 0) {
    const message = errors.map((error) => `${error.path || "/"} ${error.message}`).join("; ");
    throw new ArmoniaError("ARM002", `Schema validation failed for ${name}: ${message}`, errors);
  }
}
