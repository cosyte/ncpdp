/**
 * The fixed Response Transaction Header that opens an NCPDP Telecommunication
 * vD.0 **response** transmission. Unlike the 56-byte request header (which leads
 * with the routing BIN), the response header leads with the Version/Release at
 * offset 0, so the two are told apart by where the `"D0"` stamp sits: offset 6
 * for a request, offset 0 for a response.
 *
 * Only the leading positional fields are decoded here; the safety-critical
 * adjudication data (status, reject codes, money, DUR alerts) lives in the
 * control-character-framed response *segments*, not in this fixed header, so a
 * mis-sized trailing field can never misread a paid/rejected outcome.
 */

/** Field numbers/designators are NCPDP vD.0; names are our own paraphrases. */
export interface TelecomResponseHeader {
  /** 102-A2 — Version/Release, `"D0"` for the standard this reader decodes. */
  readonly versionRelease: string;
  /** 103-A3 — Transaction Code echoed from the request, e.g. `"B1"`/`"B2"`/`"E1"`. */
  readonly transactionCode: string;
  /** 109-A9 — declared number of transactions in the transmission (1 char). */
  readonly transactionCount: string;
  /**
   * 501-F1 — Header Response Status: the **transmission-level** accept/reject
   * flag (`"A"` accepted, `"R"` rejected). This is distinct from the per-claim
   * Transaction Response Status (112-AN) in the Response Status segment.
   */
  readonly headerResponseStatus: string;
  /** 202-B2 — Service Provider ID Qualifier. */
  readonly serviceProviderIdQualifier: string;
  /** 201-B1 — Service Provider ID (e.g. the pharmacy NPI). */
  readonly serviceProviderId: string;
}

/** Positional layout of the D.0 response header `[name, offset, length]`. */
export const RESPONSE_HEADER_FIELDS: ReadonlyArray<
  readonly [keyof TelecomResponseHeader, number, number]
> = [
  ["versionRelease", 0, 2],
  ["transactionCode", 2, 2],
  ["transactionCount", 4, 1],
  ["headerResponseStatus", 5, 1],
  ["serviceProviderIdQualifier", 6, 2],
  ["serviceProviderId", 8, 15],
];

/**
 * Minimum bytes needed to read the safety-relevant leading response fields.
 *
 * @example
 * ```ts
 * import { RESPONSE_HEADER_MIN_LENGTH } from "@cosyte/ncpdp/telecom";
 * RESPONSE_HEADER_MIN_LENGTH; // 6 — shorter input can't carry the response header
 * ```
 */
export const RESPONSE_HEADER_MIN_LENGTH = 6;

/**
 * Decode the fixed D.0 response header from the unframed header region (the slice
 * before the first framing control character). Each positional field is sliced
 * and trimmed of pad whitespace; a field that runs past the region is left empty
 * rather than read into the framed body.
 *
 * @param region - The unframed header region of a response transmission.
 * @returns A frozen {@link TelecomResponseHeader}.
 *
 * @example
 * ```ts
 * decodeResponseHeader("D0B11A01" + "1234567890     ").transactionCode; // "B1"
 * ```
 */
export function decodeResponseHeader(region: string): TelecomResponseHeader {
  const out: Record<string, string> = {};
  for (const [name, offset, length] of RESPONSE_HEADER_FIELDS) {
    out[name] = region.slice(offset, offset + length).trim();
  }
  return Object.freeze(out) as unknown as TelecomResponseHeader;
}
