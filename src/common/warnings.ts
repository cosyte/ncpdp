import { type ScriptPosition } from "./position.js";

/**
 * Stable warning codes for NCPDP SCRIPT parsing. Per Postel's Law, the parser is
 * lenient: anything recoverable yields a warning with one of these codes rather
 * than throwing. Codes are part of the public contract — renaming one is a
 * breaking change.
 *
 * @example
 * ```ts
 * import { SCRIPT_WARNING_CODES } from "@cosyte/ncpdp/common";
 * SCRIPT_WARNING_CODES.VERSION_ABSENT; // "NCPDP_SCRIPT_VERSION_ABSENT"
 * ```
 */
export const SCRIPT_WARNING_CODES = {
  /** No version could be determined from the message; parsed best-effort. */
  VERSION_ABSENT: "NCPDP_SCRIPT_VERSION_ABSENT",
  /** Version is a plausible SCRIPT release we don't explicitly support; tolerated. */
  UNSUPPORTED_VERSION_TOLERATED: "NCPDP_SCRIPT_UNSUPPORTED_VERSION_TOLERATED",
  /** The transaction body is a SCRIPT type this phase does not model; surfaced as unsupported. */
  UNSUPPORTED_TRANSACTION: "NCPDP_SCRIPT_UNSUPPORTED_TRANSACTION",
  /** A required element for the detected transaction was missing; left undefined. */
  MISSING_REQUIRED_ELEMENT: "NCPDP_SCRIPT_MISSING_REQUIRED_ELEMENT",
  /** A coded drug and an explicit Strength were both present; both surfaced, never reconciled. */
  STRENGTH_CODED_AND_EXPLICIT: "NCPDP_SCRIPT_STRENGTH_CODED_AND_EXPLICIT",
} as const;

/** Union of the SCRIPT warning code string literals. */
export type ScriptWarningCode = (typeof SCRIPT_WARNING_CODES)[keyof typeof SCRIPT_WARNING_CODES];

/**
 * A non-fatal SCRIPT parse warning: a stable code, a PHI-free message, and the
 * XPath-style location where it was raised. Warnings never carry field values.
 */
export interface NcpdpScriptWarning {
  /** Stable, machine-readable warning code. */
  readonly code: ScriptWarningCode;
  /** Human-readable, PHI-free description. */
  readonly message: string;
  /** XPath-style location where the condition was detected. */
  readonly position: ScriptPosition;
}

/**
 * Construct a frozen {@link NcpdpScriptWarning}.
 *
 * @param code - The stable warning code.
 * @param message - PHI-free human-readable description.
 * @param position - XPath-style location of the condition.
 * @returns A frozen warning.
 *
 * @example
 * ```ts
 * scriptWarning(
 *   SCRIPT_WARNING_CODES.VERSION_ABSENT,
 *   "No SCRIPT version found; parsed best-effort.",
 *   scriptPosition("/Message/Header"),
 * );
 * ```
 */
export function scriptWarning(
  code: ScriptWarningCode,
  message: string,
  position: ScriptPosition,
): NcpdpScriptWarning {
  return Object.freeze({ code, message, position });
}
