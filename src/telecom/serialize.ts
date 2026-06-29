import { D0_HEADER_FIELDS, type TelecomHeader } from "./header.js";
import type { TelecomTransaction } from "./parse.js";
import { RESPONSE_HEADER_FIELDS, type TelecomResponseHeader } from "./response-header.js";
import {
  FIELD_SEPARATOR,
  GROUP_SEPARATOR,
  SEGMENT_SEPARATOR,
  type TelecomSegment,
} from "./tokenize.js";

/**
 * Render a single positional, fixed-width header field: the value left-justified
 * and space-padded to its wire width. A value that already fits is emitted as-is;
 * one longer than the width is truncated (the {@link "./builder".buildTelecomRequest}
 * entry point refuses over-long values up front, so truncation here is only a last
 * line of defence on a hand-built model).
 */
function padField(value: string, length: number): string {
  return value.padEnd(length).slice(0, length);
}

/** Serialize the fixed 56-byte D.0 request Transaction Header. */
function serializeRequestHeader(header: TelecomHeader): string {
  return D0_HEADER_FIELDS.map(([name, , length]) => padField(header[name], length)).join("");
}

/** Serialize the fixed D.0 Response Transaction Header region. */
function serializeResponseHeader(header: TelecomResponseHeader): string {
  return RESPONSE_HEADER_FIELDS.map(([name, , length]) => padField(header[name], length)).join("");
}

/**
 * Serialize one segment to its FS-framed wire form: the Segment Identification
 * (`AM<id>`) followed by each field's `id + value`, joined by the Field Separator.
 * A segment whose id is empty (a parsed segment that lacked an `AM` field) emits
 * its fields without a leading `AM`, faithfully round-tripping that quirk.
 */
function serializeSegment(segment: TelecomSegment): string {
  const tokens: string[] = [];
  if (segment.segmentId !== "") tokens.push(`AM${segment.segmentId}`);
  for (const field of segment.fields) tokens.push(`${field.id}${field.value}`);
  return tokens.join(FIELD_SEPARATOR);
}

/** Join the transaction's segments into the RS-framed body of one transaction. */
function serializeBody(segments: readonly TelecomSegment[]): string {
  return segments.map(serializeSegment).join(SEGMENT_SEPARATOR);
}

/**
 * Serialize a {@link TelecomTransaction} back to its canonical NCPDP
 * Telecommunication vD.0 wire form. The conservative (emit) half of Postel's Law:
 * it walks the model faithfully and never warns — a model produced by
 * {@link "./parse".parseTelecom} or {@link "./builder".buildTelecomRequest} is
 * trusted as valid by construction.
 *
 * The output is **canonical**, not byte-identical to a quirky input: header
 * fields are re-padded to their fixed widths and segments are re-joined with
 * single FS/GS/RS control characters. Serializing is idempotent —
 * `serialize(parse(serialize(t)))` equals `serialize(t)` — which is the
 * round-trip contract this library guarantees (a normalizing serializer cannot
 * reproduce arbitrary whitespace or duplicate separators).
 *
 * A request emits the 56-byte fixed header immediately followed by the framed
 * body; a response emits the fixed response header, a Group Separator, then the
 * RS-framed segment body.
 *
 * @param transaction - A transaction from `parseTelecom` or `buildTelecomRequest`.
 * @returns The canonical wire string.
 *
 * @example
 * ```ts
 * import { parseTelecom, serializeTelecom } from "@cosyte/ncpdp/telecom";
 * const wire = serializeTelecom(parseTelecom(raw));
 * parseTelecom(wire); // re-parses cleanly
 * ```
 */
export function serializeTelecom(transaction: TelecomTransaction): string {
  const body = serializeBody(transaction.segments);
  if (transaction.kind === "response" && transaction.responseHeader !== undefined) {
    return serializeResponseHeader(transaction.responseHeader) + GROUP_SEPARATOR + body;
  }
  return serializeRequestHeader(transaction.header) + body;
}
