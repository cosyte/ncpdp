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
