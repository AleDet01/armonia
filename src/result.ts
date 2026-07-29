import type { Diagnostic } from "./types.ts";

/**
 * Represents the outcome of an operation that may partially succeed.
 * Commands return this instead of throwing on first error.
 */
export interface OperationResult<T> {
  /** The computed value, or null if the operation could not produce a result */
  value: T | null;
  /** All diagnostics collected during the operation */
  diagnostics: Diagnostic[];
  /** Whether the operation completed without error-level diagnostics */
  ok: boolean;
}

export function success<T>(value: T, diagnostics: Diagnostic[] = []): OperationResult<T> {
  return { value, diagnostics, ok: !diagnostics.some((d) => d.severity === "error") };
}

export function failure<T>(diagnostics: Diagnostic[]): OperationResult<T> {
  return { value: null, diagnostics, ok: false };
}
