import type { ScriptPosition } from "./position.js";

/**
 * Fatal error codes for NCPDP SCRIPT parsing. A fatal is reserved for
 * unrecoverable structural corruption — input that cannot be treated as a
 * SCRIPT message at all. Everything recoverable is a warning instead (see
 * {@link "./warnings".SCRIPT_WARNING_CODES}).
 *
 * @example
 * ```ts
 * import { SCRIPT_FATAL_CODES } from "@cosyte/ncpdp/common";
 * SCRIPT_FATAL_CODES.NOT_XML; // "NCPDP_SCRIPT_NOT_XML"
 * ```
 */
export const SCRIPT_FATAL_CODES = {
  /** Input is empty or whitespace-only. */
  EMPTY_INPUT: "EMPTY_INPUT",
  /** Input is not well-formed XML, or carries a forbidden DOCTYPE/ENTITY. */
  NOT_XML: "NCPDP_SCRIPT_NOT_XML",
  /** Well-formed XML, but the root element is not a SCRIPT `<Message>`. */
  NO_MESSAGE_ROOT: "NCPDP_SCRIPT_NO_MESSAGE_ROOT",
  /** The declared SCRIPT version predates the XML SCRIPT era and is unsupported. */
  UNSUPPORTED_VERSION: "NCPDP_SCRIPT_UNSUPPORTED_VERSION",
} as const;

/** Union of the SCRIPT fatal error code string literals. */
export type ScriptFatalCode = (typeof SCRIPT_FATAL_CODES)[keyof typeof SCRIPT_FATAL_CODES];

/**
 * Thrown when NCPDP SCRIPT input is structurally unrecoverable.
 *
 * Carries a stable {@link ScriptFatalCode}, optional positional context, and an
 * optional bounded snippet. The snippet is capped at 64 characters and is the
 * documented consumer-redaction boundary — it may, by necessity, include a
 * fragment of the offending input, so callers logging it must redact.
 *
 * @example
 * ```ts
 * try {
 *   parseScript("not xml");
 * } catch (err) {
 *   if (err instanceof NcpdpScriptParseError) {
 *     err.code; // "NCPDP_SCRIPT_NOT_XML"
 *   }
 * }
 * ```
 */
export class NcpdpScriptParseError extends Error {
  /** Stable, machine-readable fatal code. */
  readonly code: ScriptFatalCode;
  /** XPath-style location of the failure, when known. */
  readonly position?: ScriptPosition;
  /** Bounded (≤ 64-char) snippet of the offending input; redact before logging. */
  readonly snippet?: string;

  /**
   * @param code - The stable fatal code.
   * @param message - Human-readable, PHI-free description.
   * @param opts - Optional positional context and bounded snippet.
   */
  constructor(
    code: ScriptFatalCode,
    message: string,
    opts?: { position?: ScriptPosition; snippet?: string },
  ) {
    super(message);
    this.name = "NcpdpScriptParseError";
    this.code = code;
    if (opts?.position !== undefined) this.position = opts.position;
    if (opts?.snippet !== undefined) this.snippet = clampSnippet(opts.snippet);
  }
}

const SNIPPET_MAX = 64;

function clampSnippet(raw: string): string {
  const oneLine = raw.replace(/\s+/g, " ").trim();
  return oneLine.length > SNIPPET_MAX ? `${oneLine.slice(0, SNIPPET_MAX)}…` : oneLine;
}

/**
 * Stable error codes for the SCRIPT **builder**. The builder is the conservative
 * (emit) half of Postel's Law: it refuses to construct a message that is invalid
 * by construction — with one of these codes — rather than emitting XML a
 * downstream system would reject. Distinct from the parser's
 * {@link SCRIPT_FATAL_CODES}.
 *
 * @example
 * ```ts
 * import { SCRIPT_BUILD_CODES } from "@cosyte/ncpdp/common";
 * SCRIPT_BUILD_CODES.MISSING_RESPONSE_CODE; // "NCPDP_SCRIPT_BUILD_MISSING_RESPONSE_CODE"
 * ```
 */
export const SCRIPT_BUILD_CODES = {
  /** A `<Status>`/`<Error>`/`<Verify>` response was built without a `<Code>`. */
  MISSING_RESPONSE_CODE: "NCPDP_SCRIPT_BUILD_MISSING_RESPONSE_CODE",
  /** A NewRx was built with no prescribed medication (a drug description is required). */
  MISSING_MEDICATION: "NCPDP_SCRIPT_BUILD_MISSING_MEDICATION",
  /** A supplied value carries a character that is illegal in XML 1.0 text. */
  INVALID_CHARACTER: "NCPDP_SCRIPT_BUILD_INVALID_CHARACTER",
} as const;

/** Union of the SCRIPT builder error code string literals. */
export type ScriptBuildCode = (typeof SCRIPT_BUILD_CODES)[keyof typeof SCRIPT_BUILD_CODES];

/**
 * Thrown when the SCRIPT builder is asked to construct an invalid-by-construction
 * message. Carries a stable {@link ScriptBuildCode}. Unlike the parse error it
 * never carries a snippet — builder input is caller-supplied and PHI-dense.
 *
 * @example
 * ```ts
 * try {
 *   buildScriptResponse({ kind: "Status" });
 * } catch (err) {
 *   if (err instanceof NcpdpScriptBuildError) {
 *     err.code; // "NCPDP_SCRIPT_BUILD_MISSING_RESPONSE_CODE"
 *   }
 * }
 * ```
 */
export class NcpdpScriptBuildError extends Error {
  /** Stable, machine-readable build error code. */
  readonly code: ScriptBuildCode;

  /**
   * @param code - The stable build error code.
   * @param message - Human-readable, PHI-free description.
   */
  constructor(code: ScriptBuildCode, message: string) {
    super(message);
    this.name = "NcpdpScriptBuildError";
    this.code = code;
  }
}
