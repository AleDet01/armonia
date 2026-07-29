export type Severity = "info" | "warning" | "error";

export interface Diagnostic {
  rule: string;
  severity: Severity;
  message: string;
  path?: string;
  remediation?: string;
}

export interface CapabilityCommand {
  argv: string[];
  cwd?: string;
  env?: Record<string, string>;
  description?: string;
}

export interface Component {
  id: string;
  path: string;
  languages?: string[];
  capabilities?: Record<string, CapabilityCommand>;
}

export interface PackReference {
  id: string;
  version: string;
  path?: string;
}

export interface PolicyException {
  rule: string;
  reason: string;
  owner: string;
  expires: string;
  trackingIssue?: string | number;
}

export interface ProjectManifest {
  apiVersion: "armonia/v1";
  kind: "Project";
  metadata: {
    id: string;
    name: string;
    description?: string;
    owners: string[];
  };
  spec: {
    lifecycle: "proposed" | "incubating" | "active" | "maintenance" | "deprecated" | "archived";
    maturity?: "prototype" | "emerging" | "stable";
    criticality?: "tier-1" | "tier-2" | "tier-3" | "tier-4";
    profile: "experimental" | "baseline" | "production" | "high-assurance";
    visibility?: "public" | "private" | "internal";
    distribution?: {
      repository: string;
      ref: string;
    };
    packs: PackReference[];
    components: Component[];
    github?: {
      defaultBranch?: string;
      issues?: boolean;
      releases?: boolean;
    };
    ai?: {
      contextEntry?: string;
      generatedAdapters?: string[];
    };
    policy?: {
      exceptions?: PolicyException[];
    };
  };
}

export type OwnershipMode = "managed" | "scaffold" | "reference";

export interface PackFile {
  target: string;
  source: string;
  ownership: OwnershipMode;
  condition?: string;
}

export interface PackManifest {
  apiVersion: "armonia/v1";
  kind: "Pack";
  metadata: {
    id: string;
    version: string;
    description?: string;
    markers?: string[];
  };
  compatibility: {
    spec: string;
  };
  requires?: PackReference[];
  conflicts?: string[];
  provides?: string[];
  defaults?: {
    capabilities?: Record<string, CapabilityCommand>;
  };
  files?: PackFile[];
  policies?: string[];
}

export interface ResolvedPack {
  manifest: PackManifest;
  directory: string;
}

export interface LockFileEntry {
  source: string;
  ownership: OwnershipMode;
  hash: string;
}

export interface LockFile {
  apiVersion: "armonia/v1";
  kind: "Lock";
  generatedBy: string;
  generatedAt?: string;
  packs: Array<{ id: string; version: string }>;
  files: Record<string, LockFileEntry>;
}

export type PlanAction = "create" | "update" | "unchanged" | "skip" | "conflict";

export interface PlanEntry {
  path: string;
  action: PlanAction;
  ownership: OwnershipMode;
  source: string;
  reason: string;
  desiredContent?: string;
  desiredHash?: string;
}

export interface Plan {
  projectRoot: string;
  packs: ResolvedPack[];
  entries: PlanEntry[];
  diagnostics: Diagnostic[];
}

export interface PolicyDefinition {
  apiVersion: "armonia/v1";
  kind: "Policy";
  id: string;
  title: string;
  description: string;
  defaultSeverity: Severity;
  check: string;
  path?: string;
  remediation: string;
}

export interface PolicyProfile {
  apiVersion: "armonia/v1";
  kind: "PolicyProfile";
  metadata: {
    id: string;
    description: string;
  };
  rules: Array<{
    id: string;
    severity?: Severity;
  }>;
}

export interface Detection {
  language: string;
  evidence: string[];
  confidence: number;
}
