import { claimView, type TelecomClaim } from "./claim.js";
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
import { transactionSegments } from "./transactions.js";
import {
  FIELD_SEPARATOR,
  GROUP_SEPARATOR,
  SEGMENT_SEPARATOR,
  tokenizeTransactions,
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
   * call; omit (or `undefined`) to consult `getDefaultProfile()`. v1 profiles
   * are DESCRIPTIVE: the profile is surfaced as `tx.profile` but does NOT alter
   * the lenient parse.
   */
  readonly profile?: NcpdpProfile | null;
}

/**
 * A decoded Telecom transmission: the fixed header, every group-separated
 * transaction it carries (each with its own field-id-keyed segments, in wire
 * order), the header's declared transaction count beside the number actually
 * decoded, and any non-fatal warnings. Everything is frozen.
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
   * The **first** decoded transaction's segments, in wire order (empty when
   * nothing decoded). A transmission may carry several transactions, so this is
   * a convenience alias for `transactions[0].segments`, never the whole message:
   * {@link transactions} is what carries them all.
   */
  readonly segments: readonly TelecomSegment[];
  /**
   * Every decoded transaction, in wire order, each with its own segments, its own
   * byte offset and the warnings raised decoding it. A transmission carrying one
   * transaction has exactly one entry, so this is the uniform read path whatever
   * the message carried.
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
   * offset + field id, never PHI. Every transaction's warnings appear here in
   * wire order; `transactions[n].warnings` is the same set, split per
   * transaction, when a consumer needs to attribute one.
   */
  readonly warnings: readonly NcpdpTelecomWarning[];
  /**
   * The trading-partner profile in effect for this parse: either passed
   * explicitly via `options.profile` or resolved from the process-scoped
   * default. Present only when a profile applied; attribution only (v1 profiles
   * never alter the parse).
   */
  readonly profile?: NcpdpProfile;
}

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
 * Nothing is raised when no transaction decoded at all: there is no decoded
 * count to disagree with, and a transmission carrying no body reads exactly as it
 * always has.
 */
function collectTransactionCountWarning(
  declared: string,
  decoded: number,
  countOffset: number,
  warnings: NcpdpTelecomWarning[],
): void {
  if (decoded === 0) return;
  if (declared === String(decoded)) return;
  warnings.push(
    telecomWarning(
      TELECOM_WARNING_CODES.TRANSACTION_COUNT_MISMATCH,
      telecomPosition(countOffset, TRANSACTION_COUNT_FIELD_ID),
    ),
  );
}

/**
 * Decode every group-separated transaction in a body, then run the per-transaction
 * collectors over each one's own segments so a count mismatch, a COB chain or a
 * DUR code is attributed to the transaction that carried it. The flat
 * transmission-level warning list is these lists concatenated in wire order.
 */
function decodeTransactions(
  body: string,
  base: number,
  collect: (segments: readonly TelecomSegment[], warnings: NcpdpTelecomWarning[]) => void,
): TelecomDecodedTransaction[] {
  return tokenizeTransactions(body, base).map((decoded) => {
    const warnings = [...decoded.warnings];
    collect(decoded.segments, warnings);
    return Object.freeze({
      index: decoded.index,
      byteOffset: decoded.byteOffset,
      segments: decoded.segments,
      warnings: Object.freeze(warnings),
    });
  });
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
  const warnings: NcpdpTelecomWarning[] = [];

  const transactions =
    sep === -1
      ? []
      : decodeTransactions(text.slice(sep), sep, (segments, sink) => {
          collectResponseWarnings(segments, sink);
          collectCobWarnings(segments, sink);
        });
  for (const decoded of transactions) warnings.push(...decoded.warnings);
  collectTransactionCountWarning(
    responseHeader.transactionCount,
    transactions.length,
    headerFieldOffset(RESPONSE_HEADER_FIELDS, "transactionCount"),
    warnings,
  );
  const segments = transactions[0]?.segments ?? [];

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
    segments,
    transactions: Object.freeze(transactions),
    transactionCount: responseHeader.transactionCount,
    decodedTransactionCount: transactions.length,
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
 * malformed one costs only itself. The declared Transaction Count is surfaced
 * verbatim beside the number decoded and no maximum is enforced.
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
      segments: Object.freeze([] as TelecomSegment[]),
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

  const transactions = decodeTransactions(body, D0_HEADER_LENGTH, (segments, sink) => {
    collectCompoundWarnings(segments, sink);
    collectCobWarnings(segments, sink);
    collectDurWarnings(segments, sink);
  });
  for (const decoded of transactions) warnings.push(...decoded.warnings);
  collectTransactionCountWarning(
    header.transactionCount,
    transactions.length,
    headerFieldOffset(D0_HEADER_FIELDS, "transactionCount"),
    warnings,
  );

  return Object.freeze({
    kind: "request",
    header,
    segments: transactions[0]?.segments ?? Object.freeze([] as TelecomSegment[]),
    transactions: Object.freeze(transactions),
    transactionCount: header.transactionCount,
    decodedTransactionCount: transactions.length,
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
  return claimView(transaction.header.transactionCode, transactionSegments(transaction, index));
}
