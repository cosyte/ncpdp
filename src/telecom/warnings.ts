import type { TelecomPosition } from "./position.js";

/**
 * Stable warning codes for NCPDP Telecommunication-standard parsing. Per Postel's
 * Law, the parser is lenient: anything recoverable yields a warning with one of
 * these codes rather than throwing, and the underlying bytes are always preserved
 * verbatim so nothing is silently dropped. Codes are part of the public contract
 * — renaming one is a breaking change.
 *
 * @example
 * ```ts
 * import { TELECOM_WARNING_CODES } from "@cosyte/ncpdp/telecom";
 * TELECOM_WARNING_CODES.UNKNOWN_SEGMENT; // "NCPDP_TELECOM_UNKNOWN_SEGMENT"
 * ```
 */
export const TELECOM_WARNING_CODES = {
  /**
   * The message declares the emerging F6 version stamp. F6 changes the fixed
   * header layout (an 8-byte IIN replaces the 6-byte BIN, among other changes),
   * so this D.0 reader **recognizes but does not decode** it: the version is
   * surfaced and the body is left untokenized rather than read against the wrong
   * offsets.
   */
  VF6_NOT_DECODED: "NCPDP_TELECOM_VF6_NOT_DECODED",
  /**
   * A segment's identification code is not one this phase models. The segment and
   * its fields are preserved verbatim (keyed by their field ids) and surfaced;
   * only the human-readable segment name is left undefined.
   */
  UNKNOWN_SEGMENT: "NCPDP_TELECOM_UNKNOWN_SEGMENT",
  /**
   * A field token was too short to carry a 2-character field identifier. It is
   * preserved verbatim (with an empty id) rather than dropped.
   */
  MALFORMED_FIELD: "NCPDP_TELECOM_MALFORMED_FIELD",
  /**
   * A segment's first field was not the Segment Identification (`AM`). The
   * segment is still surfaced with its fields preserved, but its segment id is
   * left empty since it could not be read from the expected position.
   */
  MISSING_SEGMENT_ID: "NCPDP_TELECOM_MISSING_SEGMENT_ID",
  /**
   * The transmission carried more than one group-separator-delimited transaction.
   * This phase decodes the **first** transaction's segments only and surfaces
   * this warning so additional transactions are never silently ignored.
   */
  MULTI_TRANSACTION_TRUNCATED: "NCPDP_TELECOM_MULTI_TRANSACTION_TRUNCATED",
} as const;

/** Union of the Telecom warning code string literals. */
export type TelecomWarningCode = (typeof TELECOM_WARNING_CODES)[keyof typeof TELECOM_WARNING_CODES];

/**
 * A non-fatal Telecom parse warning: a stable code, a PHI-free message, and the
 * byte-offset location where it was raised. Warnings never carry field values.
 */
export interface NcpdpTelecomWarning {
  /** Stable, machine-readable warning code. */
  readonly code: TelecomWarningCode;
  /** Human-readable, PHI-free description. */
  readonly message: string;
  /** Byte-offset location where the condition was detected. */
  readonly position: TelecomPosition;
}

/**
 * Construct a frozen {@link NcpdpTelecomWarning}.
 *
 * @param code - The stable warning code.
 * @param message - PHI-free human-readable description.
 * @param position - Byte-offset location of the condition.
 * @returns A frozen warning.
 *
 * @example
 * ```ts
 * telecomWarning(
 *   TELECOM_WARNING_CODES.UNKNOWN_SEGMENT,
 *   "Segment code 99 is not modeled; preserved verbatim.",
 *   telecomPosition(56, "AM"),
 * );
 * ```
 */
export function telecomWarning(
  code: TelecomWarningCode,
  message: string,
  position: TelecomPosition,
): NcpdpTelecomWarning {
  return Object.freeze({ code, message, position });
}
