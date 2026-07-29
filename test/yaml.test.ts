import assert from "node:assert/strict";
import { test } from "node:test";
import { parseYaml, serializeYaml } from "../src/yaml.ts";

test("yaml: rejects YAML anchors", () => {
  const input = `base: &base
  key: value
derived:
  <<: *base
`;
  assert.throws(() => parseYaml(input), /anchors and aliases/);
});

test("yaml: rejects YAML tags", () => {
  assert.throws(() => parseYaml("value: !!python/object {}"), /tags/);
});

test("yaml: rejects directives", () => {
  assert.throws(() => parseYaml("%YAML 1.2\n---\nkey: val"), /directives/);
});

test("yaml: rejects oversized documents", () => {
  const huge = "key: " + "x".repeat(1_100_000);
  assert.throws(() => parseYaml(huge), /maximum size/);
});

test("yaml: handles empty document", () => {
  assert.deepEqual(parseYaml(""), {});
  assert.deepEqual(parseYaml("   \n\n  "), {});
});

test("yaml: handles simple scalars", () => {
  const result = parseYaml<Record<string, unknown>>(`
name: hello
count: 42
enabled: true
nothing: null
`);
  assert.equal(result.name, "hello");
  assert.equal(result.count, 42);
  assert.equal(result.enabled, true);
  assert.equal(result.nothing, null);
});

test("yaml: handles inline arrays", () => {
  const result = parseYaml<Record<string, unknown>>(`
items: [one, two, three]
empty: []
`);
  assert.deepEqual(result.items, ["one", "two", "three"]);
  assert.deepEqual(result.empty, []);
});
