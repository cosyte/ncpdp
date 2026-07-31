import { type ScriptPosition } from "./position.js";

/**
 * Stable warning codes for NCPDP SCRIPT parsing. Per Postel's Law, the parser is
 * lenient: anything recoverable yields a warning with one of these codes rather
 * than throwing. Codes are part of the public contract: renaming one is a
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
  /** The transaction body is a SCRIPT type this parser does not model; surfaced as unsupported. */
  UNSUPPORTED_TRANSACTION: "NCPDP_SCRIPT_UNSUPPORTED_TRANSACTION",
  /** A required element for the detected transaction was missing; left undefined. */
  MISSING_REQUIRED_ELEMENT: "NCPDP_SCRIPT_MISSING_REQUIRED_ELEMENT",
  /** A coded drug and an explicit Strength were both present; both surfaced, never reconciled. */
  STRENGTH_CODED_AND_EXPLICIT: "NCPDP_SCRIPT_STRENGTH_CODED_AND_EXPLICIT",
  /**
   * More than one response transaction (`<Status>`/`<Error>`/`<Verify>`) was
   * present in one body; the most conservative disposition (error first) is
   * reported so a failure is never masked by a co-present success.
   */
  RESPONSE_AMBIGUOUS_DISPOSITION: "NCPDP_SCRIPT_RESPONSE_AMBIGUOUS_DISPOSITION",
  /**
   * A lifecycle response (`RxRenewalResponse`/`RxChangeResponse`/`CancelRxResponse`)
   * carried more than one outcome choice (e.g. both `<Approved>` and `<Denied>`);
   * the most conservative outcome (a denial before an approval) is reported so an
   * approval can never mask a denial.
   */
  LIFECYCLE_AMBIGUOUS_OUTCOME: "NCPDP_SCRIPT_LIFECYCLE_AMBIGUOUS_OUTCOME",
  /**
   * A lifecycle response carried no recognized outcome choice; the outcome is
   * surfaced as `"unknown"` rather than being assumed to be an approval.
   */
  LIFECYCLE_OUTCOME_UNRECOGNIZED: "NCPDP_SCRIPT_LIFECYCLE_OUTCOME_UNRECOGNIZED",
  /**
   * A structured `<Sig>` was decoded into typed dosing components. The decode is
   * **best-effort and lossy**; the free-text `SigText` remains the source of
   * truth and is preserved verbatim. Raised once per medication carrying any
   * structured component so a consumer never mistakes the additive structured
   * view for an authoritative one.
   */
  SIG_STRUCTURED_LOSSY: "NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY",
  /**
   * A structured dose element was present but no unambiguous dose quantity could
   * be derived from it. The dose is surfaced as **absent** (provenance
   * `"absent"`) rather than a guessed value, so an ambiguous SIG never yields a
   * confident dose.
   */
  SIG_AMBIGUOUS_DOSE: "NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE",
} as const;

/** Union of the SCRIPT warning code string literals. */
export type ScriptWarningCode = (typeof SCRIPT_WARNING_CODES)[keyof typeof SCRIPT_WARNING_CODES];

/**
 * The frozen message registry: one fixed sentence per SCRIPT warning code, and
 * the **only** source a warning's `message` can come from.
 *
 * This is the mechanism, not a convention. {@link scriptWarning} takes no value
 * parameter at all, so there is no interpolation site for a document-derived
 * string to reach: a message is a table lookup or it does not exist. Everything
 * a consumer needs to locate the problem travels in the `code` and the
 * {@link ScriptPosition}, whose path is built from element names this parser
 * recognizes rather than from names a sender chose.
 *
 * @example
 * ```ts
 * import { SCRIPT_WARNING_CODES, SCRIPT_WARNING_MESSAGES } from "@cosyte/ncpdp/common";
 * SCRIPT_WARNING_MESSAGES[SCRIPT_WARNING_CODES.VERSION_ABSENT];
 * // "No SCRIPT version declared; parsed best-effort."
 * ```
 */
export const SCRIPT_WARNING_MESSAGES: Readonly<Record<ScriptWarningCode, string>> = Object.freeze({
  [SCRIPT_WARNING_CODES.VERSION_ABSENT]: "No SCRIPT version declared; parsed best-effort.",
  [SCRIPT_WARNING_CODES.UNSUPPORTED_VERSION_TOLERATED]:
    "SCRIPT version is not explicitly supported; parsed best-effort.",
  [SCRIPT_WARNING_CODES.UNSUPPORTED_TRANSACTION]:
    "The transaction at this location is not modeled by this parser; surfaced as unsupported.",
  [SCRIPT_WARNING_CODES.MISSING_REQUIRED_ELEMENT]:
    "A required element for the detected transaction is missing; left undefined.",
  [SCRIPT_WARNING_CODES.STRENGTH_CODED_AND_EXPLICIT]:
    "Both a coded drug and an explicit Strength are present; both are surfaced and are not reconciled.",
  [SCRIPT_WARNING_CODES.RESPONSE_AMBIGUOUS_DISPOSITION]:
    "More than one response transaction is present; reporting the most conservative disposition.",
  [SCRIPT_WARNING_CODES.LIFECYCLE_AMBIGUOUS_OUTCOME]:
    "More than one lifecycle response outcome is present; reporting by fail-safe precedence (a denial is never masked by a co-present approval).",
  [SCRIPT_WARNING_CODES.LIFECYCLE_OUTCOME_UNRECOGNIZED]:
    "This lifecycle response carried no recognized outcome; surfaced as unknown rather than approved.",
  [SCRIPT_WARNING_CODES.SIG_STRUCTURED_LOSSY]:
    "Structured SIG decoded as a best-effort, lossy view; the free-text SigText is authoritative and preserved verbatim.",
  [SCRIPT_WARNING_CODES.SIG_AMBIGUOUS_DOSE]:
    "A structured dose element was present but no unambiguous quantity could be read; surfaced as absent, not guessed.",
});

/**
 * A non-fatal SCRIPT parse warning: a stable code, its registry message, and the
 * XPath-style location where it was raised.
 *
 * **What is and is not guaranteed.** `message` is always the
 * {@link SCRIPT_WARNING_MESSAGES} entry for `code`, byte for byte, so no part of
 * a parsed document can appear in it. `position.path` is assembled only from
 * element names this parser recognizes, so a sender-chosen name never reaches it
 * either. A warning is therefore safe to log whole. That is a property of the
 * construction, not a promise about the document.
 */
export interface NcpdpScriptWarning {
  /** Stable, machine-readable warning code. */
  readonly code: ScriptWarningCode;
  /** The {@link SCRIPT_WARNING_MESSAGES} entry for {@link code}, verbatim. */
  readonly message: string;
  /** XPath-style location where the condition was detected. */
  readonly position: ScriptPosition;
}

/**
 * Construct a frozen {@link NcpdpScriptWarning} from a code and a position.
 *
 * There is deliberately **no value parameter**. That absence is the whole
 * safety property: a factory that accepts a value grows interpolation sites,
 * and every parser in this family that leaked patient data into a log line did
 * so through one.
 *
 * @param code - The stable warning code, which selects the message.
 * @param position - XPath-style location of the condition.
 * @returns A frozen warning.
 *
 * @example
 * ```ts
 * scriptWarning(SCRIPT_WARNING_CODES.VERSION_ABSENT, scriptPosition("/Message"));
 * ```
 */
export function scriptWarning(
  code: ScriptWarningCode,
  position: ScriptPosition,
): NcpdpScriptWarning {
  return Object.freeze({ code, message: SCRIPT_WARNING_MESSAGES[code], position });
}
