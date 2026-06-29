import { NcpdpTelecomBuildError, TELECOM_BUILD_CODES } from "./errors.js";
import { D0_HEADER_FIELDS, type TelecomHeader } from "./header.js";
import type { TelecomTransaction } from "./parse.js";
import {
  FIELD_SEPARATOR,
  GROUP_SEPARATOR,
  SEGMENT_SEPARATOR,
  SEGMENT_NAMES,
  FIELD_NAMES,
  type TelecomField,
  type TelecomSegment,
} from "./tokenize.js";

/** True when a value carries any FS/GS/RS framing control character. */
function hasControlChar(value: string): boolean {
  return (
    value.includes(FIELD_SEPARATOR) ||
    value.includes(GROUP_SEPARATOR) ||
    value.includes(SEGMENT_SEPARATOR)
  );
}

/** Fixed-width header field widths, keyed by header property, from the parser layout. */
const HEADER_WIDTHS: ReadonlyMap<keyof TelecomHeader, number> = new Map(
  D0_HEADER_FIELDS.map(([name, , length]) => [name, length]),
);

/** A single field to build: its 2-character id and verbatim value. */
export interface TelecomFieldInput {
  /** The 2-character field identifier, e.g. `"D7"`. */
  readonly id: string;
  /** The field value, emitted verbatim. */
  readonly value: string;
}

/** A segment to build: its Segment Identification code and ordered fields. */
export interface TelecomSegmentInput {
  /** The Segment Identification (111-AM) code, e.g. `"07"`. */
  readonly segmentId: string;
  /** The segment's data fields, in wire order. */
  readonly fields: readonly TelecomFieldInput[];
}

/** The fixed Transaction Header fields to build. Only `transactionCode` is required. */
export interface TelecomHeaderInput {
  /** 101-A1 — routing BIN. */
  readonly binNumber?: string;
  /** 102-A2 — Version/Release; defaults to `"D0"`. */
  readonly versionRelease?: string;
  /** 103-A3 — Transaction Code; required (a request cannot route without one). */
  readonly transactionCode: string;
  /** 104-A4 — Processor Control Number. */
  readonly processorControlNumber?: string;
  /** 109-A9 — transaction count; defaults to `"1"`. */
  readonly transactionCount?: string;
  /** 202-B2 — Service Provider ID Qualifier. */
  readonly serviceProviderIdQualifier?: string;
  /** 201-B1 — Service Provider ID. */
  readonly serviceProviderId?: string;
  /** 401-D1 — Date of Service (`CCYYMMDD`). */
  readonly dateOfService?: string;
  /** 110-AK — Software Vendor / Certification ID. */
  readonly softwareCertificationId?: string;
}

/** The whole request to build: the fixed header and the variable segments. */
export interface TelecomRequestInput {
  /** The fixed Transaction Header fields. */
  readonly header: TelecomHeaderInput;
  /** The request segments, in wire order. */
  readonly segments: readonly TelecomSegmentInput[];
}

function buildHeader(input: TelecomHeaderInput): TelecomHeader {
  const transactionCode = input.transactionCode.trim();
  if (transactionCode === "") {
    throw new NcpdpTelecomBuildError(
      TELECOM_BUILD_CODES.MISSING_TRANSACTION_CODE,
      "A Transaction Code (103-A3) is required to build a request.",
    );
  }

  const header: TelecomHeader = {
    binNumber: input.binNumber ?? "",
    versionRelease: input.versionRelease ?? "D0",
    transactionCode,
    processorControlNumber: input.processorControlNumber ?? "",
    transactionCount: input.transactionCount ?? "1",
    serviceProviderIdQualifier: input.serviceProviderIdQualifier ?? "",
    serviceProviderId: input.serviceProviderId ?? "",
    dateOfService: input.dateOfService ?? "",
    softwareCertificationId: input.softwareCertificationId ?? "",
  };

  for (const [name, width] of HEADER_WIDTHS) {
    const value = header[name];
    if (hasControlChar(value)) {
      throw new NcpdpTelecomBuildError(
        TELECOM_BUILD_CODES.EMBEDDED_CONTROL_CHARACTER,
        `Header field ${name} carries an FS/GS/RS control character, which would corrupt the framing.`,
      );
    }
    if (value.length > width) {
      throw new NcpdpTelecomBuildError(
        TELECOM_BUILD_CODES.FIELD_TOO_LONG,
        `Header field ${name} is ${value.length} chars but its fixed wire width is ${width}.`,
      );
    }
  }

  return Object.freeze(header);
}

function buildField(input: TelecomFieldInput): TelecomField {
  if (input.id.length !== 2) {
    throw new NcpdpTelecomBuildError(
      TELECOM_BUILD_CODES.INVALID_FIELD_ID,
      `Field id ${JSON.stringify(input.id)} is not a 2-character identifier.`,
    );
  }
  if (hasControlChar(input.id) || hasControlChar(input.value)) {
    throw new NcpdpTelecomBuildError(
      TELECOM_BUILD_CODES.EMBEDDED_CONTROL_CHARACTER,
      `Field ${input.id} carries an FS/GS/RS control character, which would corrupt the framing.`,
    );
  }
  const name = FIELD_NAMES.get(input.id);
  const field: { id: string; value: string; name?: string; byteOffset: number } = {
    id: input.id,
    value: input.value,
    byteOffset: 0,
  };
  if (name !== undefined) field.name = name;
  return Object.freeze(field);
}

function buildSegment(input: TelecomSegmentInput): TelecomSegment {
  if (input.segmentId.trim() === "") {
    throw new NcpdpTelecomBuildError(
      TELECOM_BUILD_CODES.MISSING_SEGMENT_ID,
      "A segment must carry a Segment Identification (111-AM) code.",
    );
  }
  if (hasControlChar(input.segmentId)) {
    throw new NcpdpTelecomBuildError(
      TELECOM_BUILD_CODES.EMBEDDED_CONTROL_CHARACTER,
      "Segment id carries an FS/GS/RS control character, which would corrupt the framing.",
    );
  }
  const fields = Object.freeze(input.fields.map(buildField));
  const name = SEGMENT_NAMES.get(input.segmentId);
  const segment: {
    segmentId: string;
    name?: string;
    fields: readonly TelecomField[];
    byteOffset: number;
  } = { segmentId: input.segmentId, fields, byteOffset: 0 };
  if (name !== undefined) segment.name = name;
  return Object.freeze(segment);
}

/**
 * Build a spec-clean NCPDP Telecommunication vD.0 **request** transaction from a
 * structured model. The conservative (emit) half of Postel's Law: it refuses to
 * construct a message that is invalid by construction — a missing Transaction
 * Code, a missing Segment Identification, a non-2-character field id, an embedded
 * FS/GS/RS control character, or an over-long fixed-header field — throwing a
 * typed {@link NcpdpTelecomBuildError} rather than producing malformed wire output
 * a downstream processor would have to reject.
 *
 * The returned transaction is frozen and ready for
 * {@link "./serialize".serializeTelecom}; the round trip
 * `parseTelecom(serializeTelecom(buildTelecomRequest(input)))` re-parses with zero
 * warnings.
 *
 * @param input - The header fields and segments to build.
 * @returns A frozen, valid-by-construction {@link TelecomTransaction}.
 * @throws NcpdpTelecomBuildError when the input cannot form a spec-clean message.
 *
 * @example
 * ```ts
 * import { buildTelecomRequest, serializeTelecom } from "@cosyte/ncpdp/telecom";
 * const t = buildTelecomRequest({
 *   header: { transactionCode: "B1", binNumber: "999999" },
 *   segments: [{ segmentId: "07", fields: [{ id: "D2", value: "RX0000001" }] }],
 * });
 * serializeTelecom(t); // canonical wire string
 * ```
 */
export function buildTelecomRequest(input: TelecomRequestInput): TelecomTransaction {
  const header = buildHeader(input.header);
  const segments = Object.freeze(input.segments.map(buildSegment));
  return Object.freeze({
    kind: "request",
    header,
    segments,
    transactionCount: header.transactionCount,
    warnings: Object.freeze([]),
  });
}
