import { readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { exists, readText } from "./fs.ts";
import { policyProfilePath, policyRulesRoot } from "./paths.ts";
import { parseYaml, readYaml } from "./yaml.ts";
import { validateSchema } from "./schema.ts";
import { ArmoniaError } from "./errors.ts";
import { effectiveCapabilities } from "./resolver.ts";
import type {
  Diagnostic,
  PolicyDefinition,
  PolicyProfile,
  ProjectManifest,
  ResolvedPack,
  Severity
} from "./types.ts";

interface Finding {
  message: string;
  path?: string;
}

async function walkYaml(root: string): Promise<string[]> {
  const output: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if ([".yaml", ".yml"].includes(extname(entry.name))) {
        output.push(path);
      }
    }
  }
  await visit(root);
  return output;
}

async function loadCatalog(): Promise<Map<string, PolicyDefinition>> {
  const catalog = new Map<string, PolicyDefinition>();
  for (const path of await walkYaml(policyRulesRoot())) {
    const definition = await readYaml<PolicyDefinition>(path);
    await validateSchema("policy.schema.json", definition);
    if (catalog.has(definition.id)) {
      throw new ArmoniaError("ARM040", `Duplicate policy definition: ${definition.id}`);
    }
    catalog.set(definition.id, definition);
  }
  return catalog;
}

export async function getPolicyDefinition(id: string): Promise<PolicyDefinition | undefined> {
  return (await loadCatalog()).get(id);
}

async function workflowFiles(projectRoot: string): Promise<string[]> {
  const directory = resolve(projectRoot, ".github", "workflows");
  if (!(await exists(directory))) {
    return [];
  }
  return (await readdir(directory))
    .filter((name) => [".yaml", ".yml"].includes(extname(name)))
    .map((name) => resolve(directory, name));
}

/**
 * A workflow satisfies the explicit-permissions rule when it declares top-level `permissions`
 * or when every job declares its own. The structural check needs a parsed document; when a
 * workflow uses YAML features outside the supported subset the check degrades to a lenient
 * textual match rather than reporting a finding it cannot substantiate.
 */
function permissionsFinding(
  definition: PolicyDefinition,
  path: string,
  source: string
): Finding | undefined {
  let workflow: { permissions?: unknown; jobs?: Record<string, unknown> } | undefined;
  try {
    workflow = parseYaml(source);
  } catch {
    workflow = undefined;
  }

  if (!workflow || typeof workflow !== "object") {
    return /^\s*permissions\s*:/m.test(source)
      ? undefined
      : { message: `${definition.description}: ${path}`, path };
  }

  if (workflow.permissions !== undefined && workflow.permissions !== null) {
    return undefined;
  }

  const jobs = workflow.jobs;
  if (!jobs || typeof jobs !== "object") {
    return { message: `${definition.description}: ${path}`, path };
  }

  const entries = Object.entries(jobs);
  if (entries.length === 0) {
    return { message: `${definition.description}: ${path}`, path };
  }

  const unscoped = entries
    .filter(([, job]) => {
      if (!job || typeof job !== "object") return true;
      const record = job as Record<string, unknown>;
      // A job that only calls a reusable workflow inherits the caller's permissions contract.
      if (record.uses !== undefined && record.permissions === undefined) return true;
      return record.permissions === undefined || record.permissions === null;
    })
    .map(([name]) => name);

  return unscoped.length === 0
    ? undefined
    : {
        message: `${definition.description}: ${path} (job(s) without permissions: ${unscoped.join(", ")})`,
        path
      };
}

async function runCheck(
  definition: PolicyDefinition,
  projectRoot: string,
  manifest: ProjectManifest,
  packs: ResolvedPack[]
): Promise<Finding[]> {
  switch (definition.check) {
    case "file-exists": {
      if (!definition.path) {
        throw new ArmoniaError("ARM041", `Policy ${definition.id} requires path`);
      }
      return (await exists(resolve(projectRoot, definition.path)))
        ? []
        : [{ message: definition.description, path: definition.path }];
    }
    case "workflow-exists": {
      const files = await workflowFiles(projectRoot);
      return files.length > 0
        ? []
        : [{ message: definition.description, path: ".github/workflows" }];
    }
    case "workflow-permissions-explicit": {
      const findings: Finding[] = [];
      for (const path of await workflowFiles(projectRoot)) {
        const finding = permissionsFinding(definition, path, await readText(path));
        if (finding) {
          findings.push(finding);
        }
      }
      return findings;
    }
    case "actions-pinned": {
      const findings: Finding[] = [];
      const pattern = /^\s*uses\s*:\s*([^@\s]+)@([^\s#]+).*$/gm;
      for (const path of await workflowFiles(projectRoot)) {
        const source = await readText(path);
        for (const match of source.matchAll(pattern)) {
          const action = match[1] ?? "";
          const reference = match[2] ?? "";
          if (!action.startsWith("./") && !/^[a-f0-9]{40}$/i.test(reference)) {
            findings.push({
              message: `${action}@${reference} is not pinned to a full commit SHA`,
              path
            });
          }
        }
      }
      return findings;
    }
    case "tests-declared": {
      return manifest.spec.components
        .filter((component) => !effectiveCapabilities(manifest, packs, component.id).test)
        .map((component) => ({
          message: `Component ${component.id} does not declare the test capability`,
          path: ".armonia/project.yaml"
        }));
    }
    case "security-file-applicable": {
      const applicable =
        manifest.spec.visibility === "public" ||
        ["production", "high-assurance"].includes(manifest.spec.profile);
      return applicable && !(await exists(resolve(projectRoot, "SECURITY.md")))
        ? [{ message: definition.description, path: "SECURITY.md" }]
        : [];
    }
    case "distribution-declared": {
      return manifest.spec.distribution
        ? []
        : [{ message: definition.description, path: ".armonia/project.yaml" }];
    }
    case "distribution-pinned": {
      const distribution = manifest.spec.distribution;
      if (!distribution) {
        return [];
      }
      const reference = distribution.ref;
      if (!reference || !reference.trim()) {
        return [{
          message: "Distribution is declared but ref is empty or missing",
          path: ".armonia/project.yaml"
        }];
      }
      return /^[a-f0-9]{40}$/i.test(reference)
        ? []
        : [{
            message: `Distribution ref ${reference} is mutable or is not a full commit SHA`,
            path: ".armonia/project.yaml"
          }];
    }
    default:
      throw new ArmoniaError("ARM042", `Unsupported policy check: ${definition.check}`);
  }
}

function diagnostic(
  definition: PolicyDefinition,
  severity: Severity,
  finding: Finding
): Diagnostic {
  const value: Diagnostic = {
    rule: definition.id,
    severity,
    message: finding.message,
    remediation: definition.remediation
  };
  if (finding.path) {
    value.path = finding.path;
  }
  return value;
}

export async function evaluatePolicies(
  projectRoot: string,
  manifest: ProjectManifest,
  packs: ResolvedPack[]
): Promise<Diagnostic[]> {
  const profilePath = policyProfilePath(manifest.spec.profile);
  if (!(await exists(profilePath))) {
    throw new ArmoniaError(
      "ARM044",
      `Policy profile "${manifest.spec.profile}" was not found at ${profilePath}`
    );
  }
  const profile = await readYaml<PolicyProfile>(profilePath);
  await validateSchema("profile.schema.json", profile);
  const catalog = await loadCatalog();
  const selected = new Map(profile.rules.map((rule) => [rule.id, rule.severity]));
  for (const pack of packs) {
    for (const rule of pack.manifest.policies ?? []) {
      if (!selected.has(rule)) {
        selected.set(rule, undefined);
      }
    }
  }

  const diagnostics: Diagnostic[] = [];
  const exceptions = manifest.spec.policy?.exceptions ?? [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (const exception of exceptions) {
    const expiry = new Date(`${exception.expires}T00:00:00Z`);
    if (expiry < today) {
      diagnostics.push({
        rule: "policy.exception-expired",
        severity: "error",
        message: `Exception for ${exception.rule} expired on ${exception.expires}`,
        path: ".armonia/project.yaml",
        remediation: "Remove the exception or renew it with a new rationale and tracking issue."
      });
    }
    if (!catalog.has(exception.rule)) {
      diagnostics.push({
        rule: "policy.exception-unknown",
        severity: "warning",
        message: `Exception refers to unknown policy ${exception.rule}`,
        path: ".armonia/project.yaml",
        remediation: "Remove the stale exception or install the pack that defines the policy."
      });
    }
  }

  for (const [id, severityOverride] of selected) {
    const definition = catalog.get(id);
    if (!definition) {
      throw new ArmoniaError("ARM043", `Policy profile references unknown rule: ${id}`);
    }

    const activeException = exceptions.find((exception) => {
      const expiry = new Date(`${exception.expires}T00:00:00Z`);
      return exception.rule === id && expiry >= today;
    });
    if (activeException) {
      continue;
    }

    const severity = severityOverride ?? definition.defaultSeverity;
    for (const finding of await runCheck(definition, projectRoot, manifest, packs)) {
      diagnostics.push(diagnostic(definition, severity, finding));
    }
  }

  const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return diagnostics.sort(
    (left, right) => rank[left.severity] - rank[right.severity] || left.rule.localeCompare(right.rule)
  );
}
