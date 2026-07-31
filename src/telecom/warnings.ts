import type { TelecomPosition } from "./position.js";

/**
 * Stable warning codes for NCPDP Telecommunication-standard parsing. Per Postel's
 * Law, the parser is lenient: anything recoverable yields a warning with one of
 * these codes rather than throwing, and the underlying bytes are always preserved
 * verbatim so nothing is silently dropped. Codes are part of the public contract.
 * Renaming one is a breaking change.
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
   * A segment's identification code is not one this parser models. The segment and
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
   * A segment led with an `AM` field whose value is not a 2-character Segment
   * Identification code. Off-shape bytes there are almost always a framing
   * failure (a dropped field separator runs the rest of the segment into the
   * code), so the value is **not** promoted to `segment.segmentId`: it stays in
   * the segment's `fields` as the `AM` field, verbatim and nothing dropped, and
   * the segment id reads empty. Keeping it out of the id also keeps unbounded
   * wire bytes off a structural identifier a downstream package would build a
   * diagnostic from.
   */
  MALFORMED_SEGMENT_ID: "NCPDP_TELECOM_MALFORMED_SEGMENT_ID",
  /**
   * The transmission carried more than one group-separator-delimited transaction.
   * The parser decodes the **first** transaction's segments only and surfaces
   * this warning so additional transactions are never silently ignored.
   */
  MULTI_TRANSACTION_TRUNCATED: "NCPDP_TELECOM_MULTI_TRANSACTION_TRUNCATED",
  /**
   * A response declared a paid/captured/approved Transaction Response Status
   * (112-AN) **while also carrying one or more reject codes**. The two disagree;
   * the library resolves the disposition to **rejected** (a reject always wins:
   * a consumer must never be told a rejected claim was paid) and raises this so
   * the conflict is visible, never silent.
   */
  STATUS_CONFLICT: "NCPDP_TELECOM_STATUS_CONFLICT",
  /**
   * A Reject Code (511-FB) value is not one this parser recognizes. The code is
   * preserved verbatim and surfaced with `known: false`; only the human-readable
   * description is absent. The reject is never dropped or reinterpreted.
   */
  UNKNOWN_REJECT_CODE: "NCPDP_TELECOM_UNKNOWN_REJECT_CODE",
  /**
   * A Transaction Response Status (112-AN) value is not one this parser models.
   * The status is preserved verbatim and the disposition reads `"unknown"`:
   * never assumed paid, so an unrecognized status can never imply payment.
   */
  UNKNOWN_RESPONSE_STATUS: "NCPDP_TELECOM_UNKNOWN_RESPONSE_STATUS",
  /**
   * A Compound segment declared an ingredient count (447-EC) that disagrees with
   * the number of ingredient occurrences actually decoded. Every ingredient is
   * still surfaced verbatim; this flags a possible truncated/over-stuffed compound
   * so a missing or extra ingredient is never silent (a compound with a missing
   * ingredient is, clinically, a different medication).
   */
  COMPOUND_COUNT_MISMATCH: "NCPDP_TELECOM_COMPOUND_COUNT_MISMATCH",
  /**
   * A Coordination-of-Benefits segment declared an other-payer/other-payment count
   * (337-4C request, 355-NT response) that disagrees with the number of other-payer
   * blocks decoded. Every block is still surfaced; this flags a possible mis-read
   * COB chain so secondary-payer money is never silently dropped or duplicated.
   */
  COB_COUNT_MISMATCH: "NCPDP_TELECOM_COB_COUNT_MISMATCH",
  /**
   * A request DUR/PPS Reason For Service code (439-E4) is not one this parser
   * recognizes. The code is preserved verbatim and surfaced; only the
   * human-readable description is absent. The interaction is never dropped.
   */
  UNKNOWN_DUR_REASON: "NCPDP_TELECOM_UNKNOWN_DUR_REASON",
} as const;

/** Union of the Telecom warning code string literals. */
export type TelecomWarningCode = (typeof TELECOM_WARNING_CODES)[keyof typeof TELECOM_WARNING_CODES];

/**
 * The frozen message registry: one fixed sentence per Telecom warning code, and
 * the **only** source a warning's `message` can come from.
 *
 * This is the mechanism, not a convention. {@link telecomWarning} takes no value
 * parameter at all, so there is no interpolation site for wire bytes to reach.
 * A Telecom transmission is PHI-dense in almost every field, and a message that
 * quoted so much as a segment code could quote an NDC or a prescription number
 * instead the moment a field separator went missing. What a consumer needs to
 * locate the problem travels in the `code` and the {@link TelecomPosition}: a
 * byte offset and, when known, a 2-character field identifier.
 *
 * @example
 * ```ts
 * import { TELECOM_WARNING_CODES, TELECOM_WARNING_MESSAGES } from "@cosyte/ncpdp/telecom";
 * TELECOM_WARNING_MESSAGES[TELECOM_WARNING_CODES.UNKNOWN_SEGMENT];
 * // "The segment at this offset declares a code this parser does not model; preserved verbatim."
 * ```
 */
export const TELECOM_WARNING_MESSAGES: Readonly<Record<TelecomWarningCode, string>> = Object.freeze(
  {
    [TELECOM_WARNING_CODES.VF6_NOT_DECODED]:
      "Transmission declares the F6 version stamp; recognized but not decoded (the F6 header layout differs from D.0).",
    [TELECOM_WARNING_CODES.UNKNOWN_SEGMENT]:
      "The segment at this offset declares a code this parser does not model; preserved verbatim.",
    [TELECOM_WARNING_CODES.MALFORMED_FIELD]:
      "Field token too short to carry a 2-character identifier; preserved verbatim.",
    [TELECOM_WARNING_CODES.MISSING_SEGMENT_ID]:
      "Segment does not begin with a Segment Identification (AM) field; fields preserved, segment id left empty.",
    [TELECOM_WARNING_CODES.MALFORMED_SEGMENT_ID]:
      "The AM field at this offset does not carry a 2-character Segment Identification; it is preserved verbatim as a field and the segment id is left empty.",
    [TELECOM_WARNING_CODES.MULTI_TRANSACTION_TRUNCATED]:
      "Transmission carries more than one group-separated transaction; only the first is decoded.",
    [TELECOM_WARNING_CODES.STATUS_CONFLICT]:
      "Response declared a positive status while carrying reject codes; disposition resolved to rejected (a reject always wins).",
    [TELECOM_WARNING_CODES.UNKNOWN_REJECT_CODE]:
      "Reject Code is not recognized by this parser; preserved verbatim with known:false, never dropped.",
    [TELECOM_WARNING_CODES.UNKNOWN_RESPONSE_STATUS]:
      "Transaction Response Status is not modeled by this parser; preserved verbatim, disposition reads unknown (never paid).",
    [TELECOM_WARNING_CODES.COMPOUND_COUNT_MISMATCH]:
      "The Compound segment's declared ingredient count disagrees with the number decoded; all decoded ingredients are preserved verbatim.",
    [TELECOM_WARNING_CODES.COB_COUNT_MISMATCH]:
      "The coordination-of-benefits declared other-payer count disagrees with the number of blocks decoded; all decoded blocks are preserved verbatim.",
    [TELECOM_WARNING_CODES.UNKNOWN_DUR_REASON]:
      "Request DUR/PPS Reason For Service code is not recognized by this parser; preserved verbatim, never dropped.",
  },
);

/**
 * A non-fatal Telecom parse warning: a stable code, its registry message, and
 * the byte-offset location where it was raised.
 *
 * **What is and is not guaranteed.** `message` is always the
 * {@link TELECOM_WARNING_MESSAGES} entry for `code`, byte for byte, so no part
 * of a transmission can appear in it. `position` carries a byte offset and, when
 * known, a field identifier this parser named itself. A warning is therefore
 * safe to log whole. That is a property of the construction, not a promise about
 * the transmission: the segment and field **values** on the model are wire data
 * and are exactly as sensitive as the claim they came from.
 */
export interface NcpdpTelecomWarning {
  /** Stable, machine-readable warning code. */
  readonly code: TelecomWarningCode;
  /** The {@link TELECOM_WARNING_MESSAGES} entry for {@link code}, verbatim. */
  readonly message: string;
  /** Byte-offset location where the condition was detected. */
  readonly position: TelecomPosition;
}

/**
 * Construct a frozen {@link NcpdpTelecomWarning} from a code and a position.
 *
 * There is deliberately **no value parameter**. That absence is the whole safety
 * property: a factory that accepts a value grows interpolation sites, and every
 * parser in this family that leaked patient data into a log line did so through
 * one.
 *
 * @param code - The stable warning code, which selects the message.
 * @param position - Byte-offset location of the condition.
 * @returns A frozen warning.
 *
 * @example
 * ```ts
 * telecomWarning(TELECOM_WARNING_CODES.UNKNOWN_SEGMENT, telecomPosition(56, "AM"));
 * ```
 */
export function telecomWarning(
  code: TelecomWarningCode,
  position: TelecomPosition,
): NcpdpTelecomWarning {
  return Object.freeze({ code, message: TELECOM_WARNING_MESSAGES[code], position });
}
