import { readFile } from "node:fs/promises";

// Only the vocabulary used by our two small, shipped schemas is supported.
// Keeping validation tied to those schemas prevents documentation/runtime drift.
function validate(value, schema, location) {
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${location} must be an object`);
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) throw new Error(`${location} is missing a required field`);
    }
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties, key)) {
        if (schema.additionalProperties === false) throw new Error(`${location} contains an unsupported field`);
      } else validate(value[key], schema.properties[key], `${location}.${key}`);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) throw new Error(`${location} must be an array`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) throw new Error(`${location} contains too many items`);
    if (schema.uniqueItems && new Set(value).size !== value.length) throw new Error(`${location} contains duplicate items`);
    value.forEach((item, index) => validate(item, schema.items, `${location}[${index}]`));
  } else if (schema.type === "string") {
    if (typeof value !== "string" || value.length < (schema.minLength ?? 0) || (schema.pattern && !new RegExp(schema.pattern).test(value))) throw new Error(`${location} must be a valid string`);
  } else if (schema.type === "integer") {
    if (!Number.isInteger(value) || value < schema.minimum || value > schema.maximum) throw new Error(`${location} is outside the supported integer range`);
  }
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${location} is not a supported value`);
}

const configSchema = JSON.parse(await readFile(new URL("../../schema/armonia.schema.json", import.meta.url), "utf8"));
const portfolioSchema = JSON.parse(await readFile(new URL("../../schema/portfolio.schema.json", import.meta.url), "utf8"));

export function validateConfig(value) {
  validate(value, configSchema, "configuration");
  return value;
}

export function validateRegistry(value) {
  validate(value, portfolioSchema, "registry");
  const slugs = value.repositories.map((entry) => entry.slug);
  if (new Set(slugs).size !== slugs.length) throw new Error("Registry slugs must be unique");
  return value;
}
