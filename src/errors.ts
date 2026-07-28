export class ArmoniaError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ArmoniaError";
    this.code = code;
    this.details = details;
  }
}
