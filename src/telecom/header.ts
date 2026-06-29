/**
 * The fixed-length Transaction Header that opens every NCPDP Telecommunication
 * request. It carries no field separators — each field is positional. Field
 * numbers/designators are from the NCPDP Telecommunication standard vD.0; the
 * names here are our own paraphrases (we do not redistribute NCPDP prose).
 *
 * Values are trimmed of pad whitespace; numeric leading zeros are preserved
 * (a BIN or PCN is an identifier, not an arithmetic quantity).
 */
export interface TelecomHeader {
  /** 101-A1 — the routing Bank Identification Number (6 chars on the wire). */
  readonly binNumber: string;
  /** 102-A2 — Version/Release, `"D0"` for the standard this reader decodes. */
  readonly versionRelease: string;
  /** 103-A3 — Transaction Code, e.g. `"B1"` (billing), `"B2"`, `"B3"`, `"E1"`. */
  readonly transactionCode: string;
  /** 104-A4 — Processor Control Number. */
  readonly processorControlNumber: string;
  /** 109-A9 — declared number of transactions in the transmission (1 char). */
  readonly transactionCount: string;
  /** 202-B2 — Service Provider ID Qualifier. */
  readonly serviceProviderIdQualifier: string;
  /** 201-B1 — Service Provider ID (e.g. the pharmacy NPI). */
  readonly serviceProviderId: string;
  /** 401-D1 — Date of Service, verbatim (`CCYYMMDD` on the wire). */
  readonly dateOfService: string;
  /** 110-AK — Software Vendor / Certification ID. */
  readonly softwareCertificationId: string;
}

/** Byte length of the fixed vD.0 request Transaction Header. */
export const D0_HEADER_LENGTH = 56;

/** Field layout of the fixed vD.0 header: `[name, offset, length]`. */
export const D0_HEADER_FIELDS: ReadonlyArray<readonly [keyof TelecomHeader, number, number]> = [
  ["binNumber", 0, 6],
  ["versionRelease", 6, 2],
  ["transactionCode", 8, 2],
  ["processorControlNumber", 10, 10],
  ["transactionCount", 20, 1],
  ["serviceProviderIdQualifier", 21, 2],
  ["serviceProviderId", 23, 15],
  ["dateOfService", 38, 8],
  ["softwareCertificationId", 46, 10],
];

/**
 * Classification of the version stamp peeked from a raw Telecom message.
 *
 * - `"d0"` — the supported D.0 standard; decode the fixed header at D.0 offsets.
 * - `"f6"` — the emerging F6 stamp; recognized but not decoded (different layout).
 * - `"unsupported"` — no recognizable version stamp; the byte layout is untrustworthy.
 */
export type TelecomVersion =
  | { readonly kind: "d0" }
  | { readonly kind: "f6"; readonly stamp: string }
  | { readonly kind: "unsupported"; readonly stamp: string };

/**
 * Peek the version stamp of a raw Telecom message without trusting the rest of
 * the header layout.
 *
 * D.0 carries `"D0"` in the Version/Release field at offset 6; F6 (which widens
 * the leading identification field) carries `"F6"` at offset 8. Both candidate
 * positions are checked. Anything else is `"unsupported"` — the offsets cannot be
 * trusted, so the caller refuses rather than guesses.
 *
 * @param raw - The raw message text.
 * @returns The {@link TelecomVersion} classification.
 *
 * @example
 * ```ts
 * detectVersion("123456D0B1…").kind; // "d0"
 * ```
 */
export function detectVersion(raw: string): TelecomVersion {
  if (raw.slice(6, 8) === "D0") return { kind: "d0" };
  if (raw.slice(8, 10) === "F6" || raw.slice(6, 8) === "F6") return { kind: "f6", stamp: "F6" };
  return { kind: "unsupported", stamp: raw.slice(6, 8) };
}

/**
 * Decode the fixed-length D.0 Transaction Header from the head of a raw message.
 * The caller guarantees `raw.length >= {@link D0_HEADER_LENGTH}`. Each positional
 * field is sliced and trimmed of pad whitespace.
 *
 * @param raw - The raw message text (length already validated by the caller).
 * @returns A frozen {@link TelecomHeader}.
 *
 * @example
 * ```ts
 * const h = decodeD0Header("610279D0B1".padEnd(56, " "));
 * h.binNumber;       // "610279"
 * h.transactionCode; // "B1"
 * ```
 */
export function decodeD0Header(raw: string): TelecomHeader {
  const out: Record<string, string> = {};
  for (const [name, offset, length] of D0_HEADER_FIELDS) {
    out[name] = raw.slice(offset, offset + length).trim();
  }
  return Object.freeze(out) as unknown as TelecomHeader;
}

/**
 * A minimal header for a recognized-but-undecoded version (F6): the version
 * stamp is surfaced and every positional field is left empty, since the layout
 * differs from D.0 and decoding it here would misalign safety-critical fields.
 *
 * @param versionStamp - The recognized version stamp, e.g. `"F6"`.
 * @returns A frozen {@link TelecomHeader} with only `versionRelease` populated.
 *
 * @example
 * ```ts
 * undecodedHeader("F6").versionRelease; // "F6"
 * ```
 */
export function undecodedHeader(versionStamp: string): TelecomHeader {
  return Object.freeze({
    binNumber: "",
    versionRelease: versionStamp,
    transactionCode: "",
    processorControlNumber: "",
    transactionCount: "",
    serviceProviderIdQualifier: "",
    serviceProviderId: "",
    dateOfService: "",
    softwareCertificationId: "",
  });
}
