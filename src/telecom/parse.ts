import { claimView, type TelecomClaim } from "./claim.js";
import { collectCobWarnings } from "./cob.js";
import { collectCompoundWarnings } from "./compound.js";
import { collectDurWarnings } from "./dur.js";
import { NcpdpTelecomParseError, TELECOM_FATAL_CODES } from "./errors.js";
import {
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
  RESPONSE_HEADER_MIN_LENGTH,
  type TelecomResponseHeader,
} from "./response-header.js";
import {
  FIELD_SEPARATOR,
  GROUP_SEPARATOR,
  SEGMENT_SEPARATOR,
  tokenizeBody,
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
   * are DESCRIPTIVE — the profile is surfaced as `tx.profile` but does NOT alter
   * the lenient parse.
   */
  readonly profile?: NcpdpProfile | null;
}

/**
 * A decoded Telecom transmission: the fixed header, the variable segments of the
 * first transaction (field-id-keyed, in wire order), the header's declared
 * transaction count, and any non-fatal warnings. Everything is frozen.
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
  /** The decoded Response Transaction Header — present only when `kind` is `"response"`. */
  readonly responseHeader?: TelecomResponseHeader;
  /** The first transaction's segments, in wire order. */
  readonly segments: readonly TelecomSegment[];
  /** Declared number of transactions (109-A9), verbatim from the header. */
  readonly transactionCount: string;
  /** Non-fatal parse warnings: stable code + byte offset + field id, never PHI. */
  readonly warnings: readonly NcpdpTelecomWarning[];
  /**
   * The trading-partner profile in effect for this parse — either passed
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
 * Index of the first **structural** framing control char — a Group (GS) or
 * Segment (RS) separator — or -1 if there is none. The Field Separator (FS) is
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

function parseResponse(text: string, profile: NcpdpProfile | undefined): TelecomTransaction {
  if (text.length < RESPONSE_HEADER_MIN_LENGTH) {
    throw new NcpdpTelecomParseError(
      TELECOM_FATAL_CODES.NO_HEADER,
      `Input is ${text.length} bytes, too short to contain the response header.`,
      { position: telecomPosition(0) },
    );
  }

  const sep = firstStructuralIndex(text);
  const region = sep === -1 ? text : text.slice(0, sep);
  const responseHeader = decodeResponseHeader(region);
  const warnings: NcpdpTelecomWarning[] = [];

  const segments = sep === -1 ? [] : tokenizeBody(text.slice(sep), sep, warnings);
  collectResponseWarnings(segments, warnings);
  collectCobWarnings(segments, warnings);

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
    segments: Object.freeze(segments),
    transactionCount: responseHeader.transactionCount,
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
  const profile = resolveProfile(opts?.profile);

  if (text.trim() === "") {
    throw new NcpdpTelecomParseError(TELECOM_FATAL_CODES.EMPTY_INPUT, "Input is empty.", {
      position: telecomPosition(0),
    });
  }

  if (isResponse(text)) {
    return parseResponse(text, profile);
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
      kind: "request",
      header: undecodedHeader(version.stamp),
      segments: Object.freeze([] as TelecomSegment[]),
      transactionCount: "",
      warnings: Object.freeze(warnings),
      ...(profile !== undefined ? { profile } : {}),
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
  collectCompoundWarnings(segments, warnings);
  collectCobWarnings(segments, warnings);
  collectDurWarnings(segments, warnings);

  return Object.freeze({
    kind: "request",
    header,
    segments: Object.freeze(segments),
    transactionCount: header.transactionCount,
    warnings: Object.freeze(warnings),
    ...(profile !== undefined ? { profile } : {}),
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
