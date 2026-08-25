import type { ScriptPosition } from "./position.js";

/**
 * Fatal error codes for NCPDP SCRIPT parsing. A fatal is reserved for
 * unrecoverable structural corruption: input that cannot be treated as a
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
 * The frozen message registry for SCRIPT fatals: one fixed sentence per code,
 * and the only source an {@link NcpdpScriptParseError}'s `message` can come from.
 *
 * @example
 * ```ts
 * import { SCRIPT_FATAL_CODES, SCRIPT_FATAL_MESSAGES } from "@cosyte/ncpdp/common";
 * SCRIPT_FATAL_MESSAGES[SCRIPT_FATAL_CODES.EMPTY_INPUT]; // "SCRIPT input is empty."
 * ```
 */
export const SCRIPT_FATAL_MESSAGES: Readonly<Record<ScriptFatalCode, string>> = Object.freeze({
  [SCRIPT_FATAL_CODES.EMPTY_INPUT]: "SCRIPT input is empty.",
  [SCRIPT_FATAL_CODES.NOT_XML]:
    "SCRIPT input is not usable XML: it is not well-formed, carries no element, or carries a DOCTYPE/ENTITY declaration, which is refused.",
  [SCRIPT_FATAL_CODES.NO_MESSAGE_ROOT]: "SCRIPT root element is not <Message>.",
  [SCRIPT_FATAL_CODES.UNSUPPORTED_VERSION]:
    "SCRIPT version predates the XML SCRIPT standard and is unsupported.",
});

/**
 * Thrown when NCPDP SCRIPT input is structurally unrecoverable.
 *
 * Carries a stable {@link ScriptFatalCode} and optional positional context, and
 * **nothing else**. `message` is the {@link SCRIPT_FATAL_MESSAGES} entry for the
 * code, so the error, including its `stack`, is safe to log and safe to forward
 * to an error reporter.
 *
 * It carries no snippet of the offending input. An earlier version did, capped
 * at 64 characters and documented as a redaction boundary; the cap bounded the
 * length and nothing about the content, and the paths that raised it are exactly
 * the paths where the input is too broken to say where in it those characters
 * came from. `NcpdpScriptBuildError` and both Telecom errors had already refused
 * a snippet for that reason. This one now agrees with them.
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

  /**
   * @param code - The stable fatal code, which selects the message.
   * @param opts - Optional positional context.
   */
  constructor(code: ScriptFatalCode, opts?: { position?: ScriptPosition }) {
    super(SCRIPT_FATAL_MESSAGES[code]);
    this.name = "NcpdpScriptParseError";
    this.code = code;
    if (opts?.position !== undefined) this.position = opts.position;
  }
}

/**
 * Stable error codes for the SCRIPT **emit** side: the builder and the
 * serializer. Emit is the conservative half of Postel's Law: it refuses to
 * construct, or to write out, a message it cannot render honestly (with one of
 * these codes) rather than emitting XML a downstream system would reject or, in
 * the unmodeled-transaction case, XML that looks correct and is not. Distinct
 * from the parser's {@link SCRIPT_FATAL_CODES}.
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
  /**
   * Serializing was asked for a transaction this library does not model (an
   * `unsupported` body). Nothing under such a transaction is modeled, so the
   * only document emit could write is one with the transaction body deleted.
   */
  UNSUPPORTED_TRANSACTION: "NCPDP_SCRIPT_BUILD_UNSUPPORTED_TRANSACTION",
} as const;

/** Union of the SCRIPT builder error code string literals. */
export type ScriptBuildCode = (typeof SCRIPT_BUILD_CODES)[keyof typeof SCRIPT_BUILD_CODES];

/**
 * The frozen message registry for SCRIPT builder errors: one fixed sentence per
 * code, and the only source an {@link NcpdpScriptBuildError}'s `message` can come
 * from.
 *
 * @example
 * ```ts
 * import { SCRIPT_BUILD_CODES, SCRIPT_BUILD_MESSAGES } from "@cosyte/ncpdp/common";
 * SCRIPT_BUILD_MESSAGES[SCRIPT_BUILD_CODES.MISSING_MEDICATION];
 * ```
 */
export const SCRIPT_BUILD_MESSAGES: Readonly<Record<ScriptBuildCode, string>> = Object.freeze({
  [SCRIPT_BUILD_CODES.MISSING_RESPONSE_CODE]: "A SCRIPT response requires a <Code>.",
  [SCRIPT_BUILD_CODES.MISSING_MEDICATION]:
    "A NewRx requires a prescribed medication with a drug description.",
  [SCRIPT_BUILD_CODES.INVALID_CHARACTER]:
    "A supplied value carries a character that is illegal in XML 1.0 text.",
  [SCRIPT_BUILD_CODES.UNSUPPORTED_TRANSACTION]:
    "A SCRIPT transaction this library does not model cannot be emitted: emitting it would drop every element it carried.",
});

/**
 * Thrown when the SCRIPT emit side is asked for a message it cannot render
 * honestly: an invalid-by-construction message handed to the builder, or a
 * transaction this library does not model handed to the serializer. Carries a
 * stable {@link ScriptBuildCode}, and its `message` is that code's
 * {@link SCRIPT_BUILD_MESSAGES} entry: emit input is caller-supplied and
 * PHI-dense, so none of it is quoted back. The error carries the code and
 * nothing else, so it, including its `stack`, is safe to log whole.
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
   * @param code - The stable build error code, which selects the message.
   */
  constructor(code: ScriptBuildCode) {
    super(SCRIPT_BUILD_MESSAGES[code]);
    this.name = "NcpdpScriptBuildError";
    this.code = code;
  }
}
