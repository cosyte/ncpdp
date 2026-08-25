import type { TelecomHeader } from "./header.js";
import type { TelecomPosition } from "./position.js";

/**
 * Fatal error codes for NCPDP Telecommunication-standard parsing. A fatal is
 * reserved for structure that cannot be treated as a Telecom transmission at all:
 * input too short to hold the fixed Transaction Header, an unframeable body,
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
 * The frozen message registry for Telecom fatals: one fixed sentence per code,
 * and the only source an {@link NcpdpTelecomParseError}'s `message` can come from.
 *
 * The two length-related entries name the parser's own fixed header widths
 * rather than the input's length. A byte count is a number and could not carry a
 * value on its own, but it is also nothing a caller cannot measure from the
 * input it just passed in, and dropping it is what lets a test assert that a
 * message equals its registry entry exactly.
 *
 * @example
 * ```ts
 * import { TELECOM_FATAL_CODES, TELECOM_FATAL_MESSAGES } from "@cosyte/ncpdp/telecom";
 * TELECOM_FATAL_MESSAGES[TELECOM_FATAL_CODES.EMPTY_INPUT]; // "Input is empty."
 * ```
 */
export const TELECOM_FATAL_MESSAGES: Readonly<Record<TelecomFatalCode, string>> = Object.freeze({
  [TELECOM_FATAL_CODES.EMPTY_INPUT]: "Input is empty.",
  [TELECOM_FATAL_CODES.NO_HEADER]:
    "Input is too short to contain the fixed Transaction Header (56 bytes for a D.0 request, 23 for a D.0 response).",
  [TELECOM_FATAL_CODES.INVALID_FRAMING]:
    "Message body carries content but none of the FS/GS/RS framing control characters; a separator is never guessed.",
  [TELECOM_FATAL_CODES.UNSUPPORTED_VERSION]:
    "Version stamp is neither the supported D.0 nor a recognized future stamp; byte layout cannot be trusted.",
});

/**
 * Thrown when NCPDP Telecommunication-standard input is structurally
 * unrecoverable.
 *
 * Carries a stable {@link TelecomFatalCode} and optional positional context, and
 * nothing else. `message` is the {@link TELECOM_FATAL_MESSAGES} entry for the
 * code, and it intentionally carries no snippet of the offending bytes: a
 * Telecom message is PHI-dense, so the {@link TelecomPosition} (offset + field
 * id, never a value) is the only context.
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
   * @param code - The stable fatal code, which selects the message.
   * @param opts - Optional positional context.
   */
  constructor(code: TelecomFatalCode, opts?: { position?: TelecomPosition }) {
    super(TELECOM_FATAL_MESSAGES[code]);
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
  /**
   * A segment was supplied with a Segment Identification (111-AM) code that is
   * not exactly 2 characters. The builder refuses it for the same reason the
   * parser refuses to promote one: 111-AM is 2 characters on the wire, and a
   * longer value would put unbounded caller data on `segment.segmentId`, which
   * the model documents as bounded and safe for a consumer to interpolate.
   */
  INVALID_SEGMENT_ID: "NCPDP_TELECOM_BUILD_INVALID_SEGMENT_ID",
  /** A fixed-width header field was supplied with a value longer than its wire width. */
  FIELD_TOO_LONG: "NCPDP_TELECOM_BUILD_FIELD_TOO_LONG",
  /**
   * A model carrying more than one decoded transaction was handed to the
   * serializer. Emit is whole-message, one transaction per transmission, so the
   * only two honest answers are to write every transaction or to refuse: writing
   * the first and dropping the rest would turn a complete read into a silently
   * partial message. The reader decodes them all; the writer says it cannot yet
   * express them all.
   */
  MULTI_TRANSACTION_EMIT: "NCPDP_TELECOM_BUILD_MULTI_TRANSACTION_EMIT",
} as const;

/** Union of the Telecom builder error code string literals. */
export type TelecomBuildCode = (typeof TELECOM_BUILD_CODES)[keyof typeof TELECOM_BUILD_CODES];

/**
 * The frozen message registry for Telecom builder errors.
 *
 * Every entry names the **rule** that was broken, never the offending value. A
 * caller who supplied the value knows what it was; the library quoting it back
 * is how a cardholder id ends up in a log line. Where the rejection is about one
 * fixed-header slot, the slot travels as
 * {@link NcpdpTelecomBuildError.headerField}, which is typed closed.
 *
 * @example
 * ```ts
 * import { TELECOM_BUILD_CODES, TELECOM_BUILD_MESSAGES } from "@cosyte/ncpdp/telecom";
 * TELECOM_BUILD_MESSAGES[TELECOM_BUILD_CODES.INVALID_FIELD_ID];
 * ```
 */
export const TELECOM_BUILD_MESSAGES: Readonly<Record<TelecomBuildCode, string>> = Object.freeze({
  [TELECOM_BUILD_CODES.MISSING_TRANSACTION_CODE]:
    "A Transaction Code (103-A3) is required to build a request.",
  [TELECOM_BUILD_CODES.EMBEDDED_CONTROL_CHARACTER]:
    "A supplied header field, field id, or field value carries an FS/GS/RS control character, which would corrupt the framing.",
  [TELECOM_BUILD_CODES.MISSING_SEGMENT_ID]:
    "A segment must carry a Segment Identification (111-AM) code.",
  [TELECOM_BUILD_CODES.INVALID_FIELD_ID]: "A data field id must be exactly 2 characters.",
  [TELECOM_BUILD_CODES.INVALID_SEGMENT_ID]:
    "A Segment Identification (111-AM) code must be exactly 2 characters.",
  [TELECOM_BUILD_CODES.FIELD_TOO_LONG]:
    "A supplied fixed-width header field is longer than its wire width.",
  [TELECOM_BUILD_CODES.MULTI_TRANSACTION_EMIT]:
    "This serializer emits one transaction per transmission; a model carrying more than one decoded transaction is refused rather than emitted with the others dropped.",
});

/**
 * Thrown when the Telecom builder is asked to construct an invalid-by-construction
 * transaction. Carries a stable {@link TelecomBuildCode}, and its `message` is
 * that code's {@link TELECOM_BUILD_MESSAGES} entry; like the parse error it never
 * quotes the offending value (Telecom data is PHI-dense).
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
   * Which fixed-header field the builder rejected, when the rejection was about
   * one. Typed as `keyof TelecomHeader`, so it can only ever be one of this
   * parser's own nine header field names: it names the **slot**, never anything
   * the caller supplied. Absent for rejections that are not header-field-scoped.
   */
  readonly headerField?: keyof TelecomHeader;

  /**
   * @param code - The stable build error code, which selects the message.
   * @param headerField - The fixed-header slot at fault, when applicable.
   */
  constructor(code: TelecomBuildCode, headerField?: keyof TelecomHeader) {
    super(TELECOM_BUILD_MESSAGES[code]);
    this.name = "NcpdpTelecomBuildError";
    this.code = code;
    if (headerField !== undefined) this.headerField = headerField;
  }
}
