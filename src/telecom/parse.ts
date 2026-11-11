import { ClaimSegments, readClaim, type TelecomClaim } from "./claim.js";
import { collectCobWarnings } from "./cob.js";
import { collectCompoundWarnings } from "./compound.js";
import { collectDurWarnings } from "./dur.js";
import { NcpdpTelecomParseError, TELECOM_FATAL_CODES } from "./errors.js";
import {
  D0_HEADER_FIELDS,
  D0_HEADER_LENGTH,
  decodeD0Header,
  detectVersion,
  undecodedHeader,
  type TelecomHeader,
} from "./header.js";
import { telecomPosition } from "./position.js";
import { collectResponseWarnings } from "./response.js";
import {
  decodeResponseHeader,
  RESPONSE_HEADER_FIELDS,
  RESPONSE_HEADER_MIN_LENGTH,
  type TelecomResponseHeader,
} from "./response-header.js";
import {
  FIELD_SEPARATOR,
  GROUP_SEPARATOR,
  SEGMENT_SEPARATOR,
  decodeTransmission,
  type SegmentCollector,
  type TelecomDecodedTransaction,
  type TelecomSegment,
} from "./tokenize.js";
import { telecomWarning, TELECOM_WARNING_CODES, type NcpdpTelecomWarning } from "./warnings.js";
import { resolveProfile } from "../profiles/resolve.js";
import type { NcpdpProfile } from "../profiles/types.js";

/** Options controlling {@link parseTelecom}. */
export interface TelecomParseOptions {
  /**
   * When the input is a {@link Buffer}, the encoding used to decode it to text.
   * The Telecommunication standard is single-byte ASCII; defaults to `"latin1"`
   * so every byte maps to a code point without loss.
   */
  readonly encoding?: BufferEncoding;
  /**
   * Trading-partner profile to attach to the result for attribution (and
   * `partitionWarnings`). An explicit profile ALWAYS wins over any
   * process-scoped default; pass `null` to opt out of the default for this one
   * call; omit (or `undefined`) to consult `getDefaultProfile()`. Profiles
   * are DESCRIPTIVE: the profile is surfaced as `tx.profile` but does NOT alter
   * the lenient parse.
   */
  readonly profile?: NcpdpProfile | null;
}

/**
 * A decoded Telecom transmission: the fixed header, the transmission-level
 * segments shared by every transaction, every group-separated transaction it
 * carries (each with its own field-id-keyed segments, in wire order), the
 * header's declared transaction count beside the number actually decoded, and
 * any non-fatal warnings. Everything is frozen.
 */
export interface TelecomTransaction {
  /**
   * Whether this is a request transmission (decoded against the 56-byte request
   * header) or a response transmission (decoded against the response header).
   */
  readonly kind: "request" | "response";
  /**
   * The decoded fixed Transaction Header. For a response, the overlapping fields
   * (version, transaction code, count, service provider) are lifted from the
   * response header; request-only fields (BIN, PCN, …) are empty.
   */
  readonly header: TelecomHeader;
  /** The decoded Response Transaction Header: present only when `kind` is `"response"`. */
  readonly responseHeader?: TelecomResponseHeader;
  /**
   * Every segment the **first** transaction reads, in wire order: the
   * {@link transmissionSegments}, then `transactions[0].segments` (empty when
   * nothing decoded). For a transmission carrying one transaction this is every
   * segment in the message. A transmission may carry several transactions, so
   * this is never the whole of a multi-transaction message: {@link transactions}
   * is what carries them all.
   *
   * It is also what {@link "./serialize".serializeTelecom} writes: the first
   * `transmissionSegments.length` entries ahead of a Group Separator, the rest
   * after it.
   */
  readonly segments: readonly TelecomSegment[];
  /**
   * The transmission-level segments: those before the first Group Separator, in
   * wire order. On a request these are segments such as Patient and Insurance,
   * shared by every transaction in the transmission; they are not a transaction,
   * so they are never in {@link transactions} and never counted against the
   * declared {@link transactionCount}. Every view addressed by transaction index
   * reads them beside that transaction's own segments, and a transaction's own
   * segment wins over one here with the same Segment Identification.
   *
   * Empty when the body opens with a Group Separator, and empty when it carries no
   * Group Separator at all: such a body is read as one transaction, since nothing
   * in it marks where the transmission level ends.
   */
  readonly transmissionSegments: readonly TelecomSegment[];
  /**
   * Every decoded transaction, in wire order, each with its own segments, its own
   * byte offset and the warnings raised decoding it. A transmission carrying one
   * transaction has exactly one entry, so this is the uniform read path whatever
   * the message carried. The {@link transmissionSegments} are not in any entry.
   */
  readonly transactions: readonly TelecomDecodedTransaction[];
  /**
   * Declared number of transactions (109-A9), **verbatim from the header**: never
   * coerced to a number, never defaulted, and never reconciled against what
   * decoded. Compare it with {@link decodedTransactionCount}, which is the count
   * this reader actually decoded; when they disagree,
   * `NCPDP_TELECOM_TRANSACTION_COUNT_MISMATCH` says so and nothing is dropped.
   */
  readonly transactionCount: string;
  /**
   * The number of transactions actually decoded: `transactions.length`, surfaced
   * beside the declared {@link transactionCount} so the two are read as separate
   * facts rather than one reconciled guess.
   */
  readonly decodedTransactionCount: number;
  /**
   * Non-fatal parse warnings for the whole transmission: stable code + byte
   * offset + field id, never PHI. The warnings raised decoding the
   * {@link transmissionSegments} come first, then every transaction's in wire
   * order, then a count mismatch if there is one; `transactions[n].warnings` is
   * the per-transaction part, when a consumer needs to attribute one.
   */
  readonly warnings: readonly NcpdpTelecomWarning[];
  /**
   * The trading-partner profile in effect for this parse: either passed
   * explicitly via `options.profile` or resolved from the process-scoped
   * default. Present only when a profile applied; attribution only (profiles
   * never alter the parse).
   */
  readonly profile?: NcpdpProfile;
}

/**
 * The one empty segment list any parse path returns when nothing decoded.
 *
 * A parsed model is frozen all the way down, so the fallback has to be frozen
 * too: a bare `[]` here would hand a consumer a mutable `segments` on exactly
 * the transmissions that carried no transaction. Written once and shared by
 * every zero-transaction path (request, response, and the undecoded vF6 shape)
 * so those paths cannot drift apart again.
 */
const NO_SEGMENTS: readonly TelecomSegment[] = Object.freeze([]);

function hasFraming(body: string): boolean {
  return (
    body.includes(FIELD_SEPARATOR) ||
    body.includes(GROUP_SEPARATOR) ||
    body.includes(SEGMENT_SEPARATOR)
  );
}

/**
 * Index of the first **structural** framing control char: a Group (GS) or
 * Segment (RS) separator, or -1 if there is none. The Field Separator (FS) is
 * deliberately excluded: it appears *within* a segment, so it never marks the
 * boundary between the fixed response header and the framed segment body. A D.0
 * response introduces its transaction with a GS (and separates segments with RS),
 * so the first GS/RS is the end of the fixed header.
 */
function firstStructuralIndex(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === GROUP_SEPARATOR || ch === SEGMENT_SEPARATOR) return i;
  }
  return -1;
}

/**
 * A response transmission leads with the Version/Release (`"D0"`) at offset 0,
 * where a request leads with the routing BIN and carries `"D0"` at offset 6. The
 * request shape is checked first so a request is never mistaken for a response.
 */
function isResponse(text: string): boolean {
  return text.slice(6, 8) !== "D0" && text.slice(0, 2) === "D0";
}

/**
 * Byte offset of a fixed-header field, read from the layout table rather than
 * written down twice: the count-mismatch warning points at the Transaction Count
 * slot, and a hard-coded offset here would drift the day a layout moves.
 */
function headerFieldOffset(
  fields: ReadonlyArray<readonly [string, number, number]>,
  name: string,
): number {
  /* v8 ignore next -- both callers ask for "transactionCount", which both header layout tables list */
  return fields.find(([field]) => field === name)?.[1] ?? 0;
}

/** 109-A9, the Transaction Count field identifier. A name this library closed, never wire data. */
const TRANSACTION_COUNT_FIELD_ID = "A9";

/**
 * Raise `TRANSACTION_COUNT_MISMATCH` when the declared Transaction Count (109-A9)
 * disagrees with the number of transactions decoded.
 *
 * The comparison is string-wise against the decoded count, so an empty,
 * non-numeric or padded declaration disagrees rather than being coerced into
 * agreement, and the declared bytes are never touched. **No maximum is
 * enforced**: no artifact establishing one could be read, so a declared count of
 * any size is reported against what decoded and never called illegal.
 *
 * Nothing is raised when the body decoded nothing at all, neither a transaction
 * nor a transmission-level segment: a transmission carrying no body reads exactly
 * as it always has. Transmission-level segments with no transaction behind them
 * are a body, so a declared count there is compared against zero.
 */
function collectTransactionCountWarning(
  declared: string,
  decoded: DecodedBody,
  countOffset: number,
  warnings: NcpdpTelecomWarning[],
): void {
  if (decoded.transactions.length === 0 && decoded.transmissionSegments.length === 0) return;
  if (declared === String(decoded.transactions.length)) return;
  warnings.push(
    telecomWarning(
      TELECOM_WARNING_CODES.TRANSACTION_COUNT_MISMATCH,
      telecomPosition(countOffset, TRANSACTION_COUNT_FIELD_ID),
    ),
  );
}

/** A decoded body: its transmission-level part and its transactions, each with its warnings. */
interface DecodedBody {
  readonly transmissionSegments: readonly TelecomSegment[];
  readonly transmissionWarnings: readonly NcpdpTelecomWarning[];
  readonly transactions: readonly TelecomDecodedTransaction[];
}

const NO_BODY: DecodedBody = Object.freeze({
  transmissionSegments: NO_SEGMENTS,
  transmissionWarnings: Object.freeze([]),
  transactions: Object.freeze([]),
});

/**
 * Decode a body's transmission-level segments and every group-separated
 * transaction, then run the collectors over each part's own segments, once, so a
 * COB chain or a DUR code is attributed to the part that carried it. The flat
 * transmission warning list is these lists concatenated in wire order.
 */
function decodeBody(body: string, base: number, collect: SegmentCollector): DecodedBody {
  return decodeTransmission(body, base, collect);
}

/** Every warning a decoded body raised, in wire order: the transmission level first, into `out`. */
function bodyWarnings(
  decoded: DecodedBody,
  out: NcpdpTelecomWarning[] = [],
): NcpdpTelecomWarning[] {
  for (const warning of decoded.transmissionWarnings) out.push(warning);
  for (const transaction of decoded.transactions) {
    for (const warning of transaction.warnings) out.push(warning);
  }
  return out;
}

/**
 * The segments the first transaction reads: the transmission-level segments, then
 * its own, in wire order. Shared by the request and response paths so the
 * `segments` field means the same thing on both.
 */
function firstTransactionView(decoded: DecodedBody): readonly TelecomSegment[] {
  const own = decoded.transactions[0]?.segments ?? NO_SEGMENTS;
  if (decoded.transmissionSegments.length === 0) return own;
  return Object.freeze([...decoded.transmissionSegments, ...own]);
}

function parseResponse(text: string, profile: NcpdpProfile | undefined): TelecomTransaction {
  if (text.length < RESPONSE_HEADER_MIN_LENGTH) {
    throw new NcpdpTelecomParseError(TELECOM_FATAL_CODES.NO_HEADER, {
      position: telecomPosition(0),
    });
  }

  const sep = firstStructuralIndex(text);
  const region = sep === -1 ? text : text.slice(0, sep);
  const responseHeader = decodeResponseHeader(region);

  const decoded =
    sep === -1
      ? NO_BODY
      : decodeBody(text.slice(sep), sep, (segments, sink) => {
          collectResponseWarnings(segments, sink);
          collectCobWarnings(segments, sink);
        });
  const warnings = bodyWarnings(decoded);
  collectTransactionCountWarning(
    responseHeader.transactionCount,
    decoded,
    headerFieldOffset(RESPONSE_HEADER_FIELDS, "transactionCount"),
    warnings,
  );

  const header: TelecomHeader = Object.freeze({
    binNumber: "",
    versionRelease: responseHeader.versionRelease,
    transactionCode: responseHeader.transactionCode,
    processorControlNumber: "",
    transactionCount: responseHeader.transactionCount,
    serviceProviderIdQualifier: responseHeader.serviceProviderIdQualifier,
    serviceProviderId: responseHeader.serviceProviderId,
    dateOfService: "",
    softwareCertificationId: "",
  });

  return Object.freeze({
    kind: "response",
    header,
    responseHeader,
    segments: firstTransactionView(decoded),
    transmissionSegments: decoded.transmissionSegments,
    transactions: decoded.transactions,
    transactionCount: responseHeader.transactionCount,
    decodedTransactionCount: decoded.transactions.length,
    warnings: Object.freeze(warnings),
    ...(profile !== undefined ? { profile } : {}),
  });
}

/**
 * Parse a raw NCPDP Telecommunication-standard transmission into a frozen
 * {@link TelecomTransaction}. Lenient by contract: anything recoverable becomes a
 * warning and the underlying bytes are preserved. Only structurally unrecoverable
 * input throws {@link NcpdpTelecomParseError} with a Telecom fatal code.
 *
 * **Every** group-separated transaction is decoded, request and response alike,
 * each into its own entry on `transactions` with its own segments and warnings; a
 * malformed one costs only itself. The segments before the first Group Separator
 * belong to the transmission, not to a transaction: they are surfaced on
 * `transmissionSegments`, shared by every transaction's views, and never counted.
 * The declared Transaction Count is surfaced verbatim beside the number decoded
 * and no maximum is enforced.
 *
 * @param raw - The raw message as a string or {@link Buffer}.
 * @param opts - Optional {@link TelecomParseOptions}.
 * @returns The decoded transmission.
 * @throws NcpdpTelecomParseError on empty input, a missing fixed header,
 *   unframeable body bytes, or an untrusted version layout.
 *
 * @example
 * ```ts
 * const t = parseTelecom(rawClaim);
 * t.header.transactionCode;      // "B1"
 * t.transactions.length;         // every transaction the transmission carried
 * t.transactionCount;            // "3": what the header declared, verbatim
 * t.decodedTransactionCount;     // 3: what actually decoded
 * t.transactions[2]?.segments;   // the third transaction's segments
 * ```
 */
export function parseTelecom(raw: string | Buffer, opts?: TelecomParseOptions): TelecomTransaction {
  const text = typeof raw === "string" ? raw : raw.toString(opts?.encoding ?? "latin1");
  const profile = resolveProfile(opts?.profile);

  if (text.trim() === "") {
    throw new NcpdpTelecomParseError(TELECOM_FATAL_CODES.EMPTY_INPUT, {
      position: telecomPosition(0),
    });
  }

  if (isResponse(text)) {
    return parseResponse(text, profile);
  }

  if (text.length < D0_HEADER_LENGTH) {
    throw new NcpdpTelecomParseError(TELECOM_FATAL_CODES.NO_HEADER, {
      position: telecomPosition(0),
    });
  }

  const version = detectVersion(text);

  if (version.kind === "unsupported") {
    throw new NcpdpTelecomParseError(TELECOM_FATAL_CODES.UNSUPPORTED_VERSION, {
      position: telecomPosition(6, "A2"),
    });
  }

  const warnings: NcpdpTelecomWarning[] = [];

  if (version.kind === "f6") {
    warnings.push(telecomWarning(TELECOM_WARNING_CODES.VF6_NOT_DECODED, telecomPosition(0, "A2")));
    return Object.freeze({
      kind: "request",
      header: undecodedHeader(version.stamp),
      segments: NO_SEGMENTS,
      transmissionSegments: NO_SEGMENTS,
      transactions: Object.freeze([] as TelecomDecodedTransaction[]),
      transactionCount: "",
      decodedTransactionCount: 0,
      warnings: Object.freeze(warnings),
      ...(profile !== undefined ? { profile } : {}),
    });
  }

  const header = decodeD0Header(text);
  const body = text.slice(D0_HEADER_LENGTH);

  if (body.length > 0 && !hasFraming(body)) {
    throw new NcpdpTelecomParseError(TELECOM_FATAL_CODES.INVALID_FRAMING, {
      position: telecomPosition(D0_HEADER_LENGTH),
    });
  }

  const decoded = decodeBody(body, D0_HEADER_LENGTH, (segments, sink) => {
    collectCompoundWarnings(segments, sink);
    collectCobWarnings(segments, sink);
    collectDurWarnings(segments, sink);
  });
  bodyWarnings(decoded, warnings);
  collectTransactionCountWarning(
    header.transactionCount,
    decoded,
    headerFieldOffset(D0_HEADER_FIELDS, "transactionCount"),
    warnings,
  );

  return Object.freeze({
    kind: "request",
    header,
    segments: firstTransactionView(decoded),
    transmissionSegments: decoded.transmissionSegments,
    transactions: decoded.transactions,
    transactionCount: header.transactionCount,
    decodedTransactionCount: decoded.transactions.length,
    warnings: Object.freeze(warnings),
    ...(profile !== undefined ? { profile } : {}),
  });
}

/**
 * Build the B1/B2/B3 request view over one decoded transaction of a parsed
 * Telecom transmission.
 *
 * A transmission may carry several claims for the same patient, so the view is
 * addressed by transaction index: `index` defaults to the first transaction and
 * every decoded transaction is reachable, not just the leading one. An index past
 * the last decoded transaction reads `undefined` rather than throwing.
 *
 * Each view reads its transaction's own segments and the transmission-level ones
 * (Patient and Insurance, for example) that every transaction shares; when both
 * carry a segment with the same Segment Identification, the transaction's own
 * wins.
 *
 * @param transaction - A transmission from {@link parseTelecom}.
 * @param index - Zero-based transaction index; defaults to the first.
 * @returns The {@link TelecomClaim} view, or `undefined` when that transaction
 *   decoded no segments.
 *
 * @example
 * ```ts
 * const t = parseTelecom(rawClaim);
 * claim(t)?.product?.id;    // the first transaction's dispensed NDC
 * claim(t, 1)?.product?.id; // the second transaction's, when the message carried one
 * ```
 */
export function claim(transaction: TelecomTransaction, index = 0): TelecomClaim | undefined {
  const own = transaction.transactions[index]?.segments;
  if (own === undefined) return undefined;
  const shared = transaction.transmissionSegments;
  if (own.length + shared.length === 0) return undefined;
  // Own segments first, so a transaction's own segment wins over a shared one.
  const found = new ClaimSegments();
  found.scan(own);
  found.scan(shared);
  return readClaim(transaction.header.transactionCode, found);
}
