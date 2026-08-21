/**
 * Compiler diagnostics.
 *
 * Spec §6.2 and §10.4 require the compiler to *refuse* work it cannot do
 * safely rather than silently degrading — shrinking glyphs below the print
 * minimum, dropping semantic nodes, or best-effort reinterpreting an
 * unsupported version. Every such refusal is raised as a PlateError carrying a
 * stable machine-readable code.
 */

export type PlateErrorCode =
  | "INVALID_REQUEST"
  | "EMPTY_PHRASE"
  | "PHRASE_TOO_LONG"
  | "UNSUPPORTED_VERSION"
  | "UNKNOWN_LAYOUT"
  | "UNKNOWN_SUBSTRATE"
  | "UNKNOWN_GEOMETRY"
  | "GEOMETRY_INTEGRITY"
  | "PRINT_SAFETY"
  | "DENSITY_INFEASIBLE"
  | "OUTPUT_TOO_LARGE"
  | "EXACT_MODE_VIOLATION"
  | "CANONICAL_MUTATION"
  | "MANIFEST_TAMPERED"
  | "PRIVACY_LEAK";

export class PlateError extends Error {
  public readonly code: PlateErrorCode;
  public readonly detail: Readonly<Record<string, unknown>>;

  public constructor(
    code: PlateErrorCode,
    message: string,
    detail: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "PlateError";
    this.code = code;
    this.detail = Object.freeze({ ...detail });
  }
}

export type Severity = "info" | "warning" | "error";

export type Diagnostic = Readonly<{
  severity: Severity;
  code: string;
  message: string;
  /** Clause index when the diagnostic is positional. */
  clauseIndex?: number;
  tokenIndex?: number;
}>;

export function diagnostic(
  severity: Severity,
  code: string,
  message: string,
  position?: Readonly<{ clauseIndex?: number; tokenIndex?: number }>,
): Diagnostic {
  return Object.freeze({
    severity,
    code,
    message,
    ...(position?.clauseIndex === undefined ? {} : { clauseIndex: position.clauseIndex }),
    ...(position?.tokenIndex === undefined ? {} : { tokenIndex: position.tokenIndex }),
  });
}
