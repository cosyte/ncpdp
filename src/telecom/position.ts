/**
 * Positional context attached to NCPDP Telecommunication-standard warnings and
 * fatal errors.
 *
 * The Telecommunication standard is a byte-oriented, control-character-framed
 * format, so position is a **byte offset** into the raw message — optionally
 * narrowed to the 2-character field identifier where the condition was detected.
 * It never carries a field *value*: a consumer learns *where* a problem is
 * without the library echoing cardholder, patient, or drug data, keeping
 * diagnostics PHI-safe.
 */
export interface TelecomPosition {
  /** Zero-based byte offset into the raw message. */
  readonly byteOffset: number;
  /** The 2-character field identifier in scope, when known. Never a value. */
  readonly fieldId?: string;
}

/**
 * Build a {@link TelecomPosition} from a byte offset and an optional field id.
 *
 * @param byteOffset - Zero-based byte offset into the raw message.
 * @param fieldId - The 2-character field identifier in scope, if any.
 * @returns A frozen positional context.
 *
 * @example
 * ```ts
 * telecomPosition(56).byteOffset;          // 56
 * telecomPosition(72, "D7").fieldId;       // "D7"
 * ```
 */
export function telecomPosition(byteOffset: number, fieldId?: string): TelecomPosition {
  return Object.freeze(fieldId === undefined ? { byteOffset } : { byteOffset, fieldId });
}
