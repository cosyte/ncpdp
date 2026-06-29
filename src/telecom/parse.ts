import { claimView, type TelecomClaim } from "./claim.js";
import { NcpdpTelecomParseError, TELECOM_FATAL_CODES } from "./errors.js";
import {
  D0_HEADER_LENGTH,
  decodeD0Header,
  detectVersion,
  undecodedHeader,
  type TelecomHeader,
} from "./header.js";
import { telecomPosition } from "./position.js";
import {
  FIELD_SEPARATOR,
  GROUP_SEPARATOR,
  SEGMENT_SEPARATOR,
  tokenizeBody,
  type TelecomSegment,
} from "./tokenize.js";
import { telecomWarning, TELECOM_WARNING_CODES, type NcpdpTelecomWarning } from "./warnings.js";

/** Options controlling {@link parseTelecom}. Reserved for forward compatibility. */
export interface TelecomParseOptions {
  /**
   * When the input is a {@link Buffer}, the encoding used to decode it to text.
   * The Telecommunication standard is single-byte ASCII; defaults to `"latin1"`
   * so every byte maps to a code point without loss.
   */
  readonly encoding?: BufferEncoding;
}

/**
 * A decoded Telecom transmission: the fixed header, the variable segments of the
 * first transaction (field-id-keyed, in wire order), the header's declared
 * transaction count, and any non-fatal warnings. Everything is frozen.
 */
export interface TelecomTransaction {
  /** The decoded fixed Transaction Header. */
  readonly header: TelecomHeader;
  /** The first transaction's segments, in wire order. */
  readonly segments: readonly TelecomSegment[];
  /** Declared number of transactions (109-A9), verbatim from the header. */
  readonly transactionCount: string;
  /** Non-fatal parse warnings: stable code + byte offset + field id, never PHI. */
  readonly warnings: readonly NcpdpTelecomWarning[];
}

function hasFraming(body: string): boolean {
  return (
    body.includes(FIELD_SEPARATOR) ||
    body.includes(GROUP_SEPARATOR) ||
    body.includes(SEGMENT_SEPARATOR)
  );
}

/**
 * Parse a raw NCPDP Telecommunication-standard transmission into a frozen
 * {@link TelecomTransaction}. Lenient by contract: anything recoverable becomes a
 * warning and the underlying bytes are preserved. Only structurally unrecoverable
 * input throws {@link NcpdpTelecomParseError} with a Telecom fatal code.
 *
 * @param raw - The raw message as a string or {@link Buffer}.
 * @param opts - Optional {@link TelecomParseOptions}.
 * @returns The decoded transaction.
 * @throws NcpdpTelecomParseError on empty input, a missing fixed header,
 *   unframeable body bytes, or an untrusted version layout.
 *
 * @example
 * ```ts
 * const t = parseTelecom(rawClaim);
 * t.header.transactionCode; // "B1"
 * t.segments.length;        // number of decoded segments
 * ```
 */
export function parseTelecom(raw: string | Buffer, opts?: TelecomParseOptions): TelecomTransaction {
  const text = typeof raw === "string" ? raw : raw.toString(opts?.encoding ?? "latin1");

  if (text.trim() === "") {
    throw new NcpdpTelecomParseError(TELECOM_FATAL_CODES.EMPTY_INPUT, "Input is empty.", {
      position: telecomPosition(0),
    });
  }

  if (text.length < D0_HEADER_LENGTH) {
    throw new NcpdpTelecomParseError(
      TELECOM_FATAL_CODES.NO_HEADER,
      `Input is ${text.length} bytes, too short to contain the ${D0_HEADER_LENGTH}-byte Transaction Header.`,
      { position: telecomPosition(0) },
    );
  }

  const version = detectVersion(text);

  if (version.kind === "unsupported") {
    throw new NcpdpTelecomParseError(
      TELECOM_FATAL_CODES.UNSUPPORTED_VERSION,
      "Version stamp is neither the supported D.0 nor a recognized future stamp; byte layout cannot be trusted.",
      { position: telecomPosition(6, "A2") },
    );
  }

  const warnings: NcpdpTelecomWarning[] = [];

  if (version.kind === "f6") {
    warnings.push(
      telecomWarning(
        TELECOM_WARNING_CODES.VF6_NOT_DECODED,
        "Transmission declares the F6 version stamp; recognized but not decoded (the F6 header layout differs from D.0).",
        telecomPosition(0, "A2"),
      ),
    );
    return Object.freeze({
      header: undecodedHeader(version.stamp),
      segments: Object.freeze([] as TelecomSegment[]),
      transactionCount: "",
      warnings: Object.freeze(warnings),
    });
  }

  const header = decodeD0Header(text);
  const body = text.slice(D0_HEADER_LENGTH);

  if (body.length > 0 && !hasFraming(body)) {
    throw new NcpdpTelecomParseError(
      TELECOM_FATAL_CODES.INVALID_FRAMING,
      "Message body carries content but none of the FS/GS/RS framing control characters; a separator is never guessed.",
      { position: telecomPosition(D0_HEADER_LENGTH) },
    );
  }

  const segments = tokenizeBody(body, D0_HEADER_LENGTH, warnings);

  return Object.freeze({
    header,
    segments: Object.freeze(segments),
    transactionCount: header.transactionCount,
    warnings: Object.freeze(warnings),
  });
}

/**
 * Build the B1/B2/B3 request view over a parsed Telecom transaction.
 *
 * @param transaction - A transaction from {@link parseTelecom}.
 * @returns The {@link TelecomClaim} view, or `undefined` when no segments decoded.
 *
 * @example
 * ```ts
 * claim(parseTelecom(rawClaim))?.product?.id; // the dispensed NDC
 * ```
 */
export function claim(transaction: TelecomTransaction): TelecomClaim | undefined {
  return claimView(transaction.header.transactionCode, transaction.segments);
}
