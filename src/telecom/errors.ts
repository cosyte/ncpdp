import type { TelecomPosition } from "./position.js";

/**
 * Fatal error codes for NCPDP Telecommunication-standard parsing. A fatal is
 * reserved for structure that cannot be treated as a Telecom transmission at all
 * — input too short to hold the fixed Transaction Header, an unframeable body,
 * or a version whose byte layout this reader cannot trust. Everything
 * recoverable is a warning instead (see {@link "./warnings".TELECOM_WARNING_CODES}).
 *
 * @example
 * ```ts
 * import { TELECOM_FATAL_CODES } from "@cosyte/ncpdp/telecom";
 * TELECOM_FATAL_CODES.NO_HEADER; // "NCPDP_TELECOM_NO_HEADER"
 * ```
 */
export const TELECOM_FATAL_CODES = {
  /** Input is empty or whitespace-only. */
  EMPTY_INPUT: "EMPTY_INPUT",
  /** Input is too short to contain the fixed Transaction Header. */
  NO_HEADER: "NCPDP_TELECOM_NO_HEADER",
  /**
   * The message body carries content but none of the framing control characters
   * needed to tokenize it into segments and fields; a separator is never guessed.
   */
  INVALID_FRAMING: "NCPDP_TELECOM_INVALID_FRAMING",
  /**
   * A version stamp is present but is neither the supported D.0 nor a recognized
   * future stamp (e.g. F6); the fixed-header byte layout cannot be trusted, so
   * the message is refused rather than decoded against the wrong offsets.
   */
  UNSUPPORTED_VERSION: "NCPDP_TELECOM_UNSUPPORTED_VERSION",
} as const;

/** Union of the Telecom fatal error code string literals. */
export type TelecomFatalCode = (typeof TELECOM_FATAL_CODES)[keyof typeof TELECOM_FATAL_CODES];

/**
 * Thrown when NCPDP Telecommunication-standard input is structurally
 * unrecoverable.
 *
 * Carries a stable {@link TelecomFatalCode} and optional positional context. It
 * intentionally never carries a snippet of the offending bytes — a Telecom
 * message is PHI-dense and a byte-level snippet could leak a value — so the
 * {@link TelecomPosition} (offset + field id, never a value) is the only context.
 *
 * @example
 * ```ts
 * try {
 *   parseTelecom("");
 * } catch (err) {
 *   if (err instanceof NcpdpTelecomParseError) {
 *     err.code; // "EMPTY_INPUT"
 *   }
 * }
 * ```
 */
export class NcpdpTelecomParseError extends Error {
  /** Stable, machine-readable fatal code. */
  readonly code: TelecomFatalCode;
  /** Byte-offset context of the failure, when known. */
  readonly position?: TelecomPosition;

  /**
   * @param code - The stable fatal code.
   * @param message - Human-readable, PHI-free description.
   * @param opts - Optional positional context.
   */
  constructor(code: TelecomFatalCode, message: string, opts?: { position?: TelecomPosition }) {
    super(message);
    this.name = "NcpdpTelecomParseError";
    this.code = code;
    if (opts?.position !== undefined) this.position = opts.position;
  }
}

/**
 * Stable error codes for the Telecom **builder**. The builder is the
 * conservative (emit) half of Postel's Law: it refuses to construct a
 * message that is invalid by construction, with one of these codes, rather
 * than producing malformed wire output that a downstream system would have to
 * reject. These are distinct from the parser's {@link TELECOM_FATAL_CODES}.
 *
 * @example
 * ```ts
 * import { TELECOM_BUILD_CODES } from "@cosyte/ncpdp/telecom";
 * TELECOM_BUILD_CODES.MISSING_TRANSACTION_CODE; // "NCPDP_TELECOM_BUILD_MISSING_TRANSACTION_CODE"
 * ```
 */
export const TELECOM_BUILD_CODES = {
  /** No Transaction Code (103-A3) was supplied; a request cannot be routed without one. */
  MISSING_TRANSACTION_CODE: "NCPDP_TELECOM_BUILD_MISSING_TRANSACTION_CODE",
  /** A field separator / group separator / segment separator appeared inside supplied data. */
  EMBEDDED_CONTROL_CHARACTER: "NCPDP_TELECOM_BUILD_EMBEDDED_CONTROL_CHARACTER",
  /** A segment was supplied with no Segment Identification code. */
  MISSING_SEGMENT_ID: "NCPDP_TELECOM_BUILD_MISSING_SEGMENT_ID",
  /** A data field was supplied without a 2-character field identifier. */
  INVALID_FIELD_ID: "NCPDP_TELECOM_BUILD_INVALID_FIELD_ID",
  /** A fixed-width header field was supplied with a value longer than its wire width. */
  FIELD_TOO_LONG: "NCPDP_TELECOM_BUILD_FIELD_TOO_LONG",
} as const;

/** Union of the Telecom builder error code string literals. */
export type TelecomBuildCode = (typeof TELECOM_BUILD_CODES)[keyof typeof TELECOM_BUILD_CODES];

/**
 * Thrown when the Telecom builder is asked to construct an invalid-by-construction
 * transaction. Carries a stable {@link TelecomBuildCode}; like the parse error it
 * never carries a snippet of the offending value (Telecom data is PHI-dense).
 *
 * @example
 * ```ts
 * try {
 *   buildTelecomRequest({ header: {}, segments: [] });
 * } catch (err) {
 *   if (err instanceof NcpdpTelecomBuildError) {
 *     err.code; // "NCPDP_TELECOM_BUILD_MISSING_TRANSACTION_CODE"
 *   }
 * }
 * ```
 */
export class NcpdpTelecomBuildError extends Error {
  /** Stable, machine-readable build error code. */
  readonly code: TelecomBuildCode;

  /**
   * @param code - The stable build error code.
   * @param message - Human-readable, PHI-free description.
   */
  constructor(code: TelecomBuildCode, message: string) {
    super(message);
    this.name = "NcpdpTelecomBuildError";
    this.code = code;
  }
}
