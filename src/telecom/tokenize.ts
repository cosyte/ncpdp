import { telecomPosition } from "./position.js";
import { telecomWarning, TELECOM_WARNING_CODES, type NcpdpTelecomWarning } from "./warnings.js";

/**
 * Field Separator (NCPDP "FS", ASCII 0x1C): separates fields within a segment.
 *
 * @example
 * ```ts
 * import { FIELD_SEPARATOR } from "@cosyte/ncpdp/telecom";
 * FIELD_SEPARATOR.charCodeAt(0); // 28 (0x1C)
 * ```
 */
export const FIELD_SEPARATOR = "\x1c";
/**
 * Group Separator (NCPDP "GS", ASCII 0x1D): separates transactions in a transmission.
 *
 * @example
 * ```ts
 * import { GROUP_SEPARATOR } from "@cosyte/ncpdp/telecom";
 * GROUP_SEPARATOR.charCodeAt(0); // 29 (0x1D)
 * ```
 */
export const GROUP_SEPARATOR = "\x1d";
/**
 * Segment Separator (NCPDP "RS", ASCII 0x1E): separates segments within a transaction.
 *
 * @example
 * ```ts
 * import { SEGMENT_SEPARATOR } from "@cosyte/ncpdp/telecom";
 * SEGMENT_SEPARATOR.charCodeAt(0); // 30 (0x1E)
 * ```
 */
export const SEGMENT_SEPARATOR = "\x1e";

/**
 * Segment Identification (111-AM) codes modeled by this parser, mapped to our own
 * paraphrased names. Codes are factual identifiers from the NCPDP
 * Telecommunication standard; the names are ours (no redistributed NCPDP prose).
 * A code outside this set is preserved verbatim with an undefined name.
 *
 * This map is not the whole inventory. `SEGMENT_CODE_RANGES` publishes the code
 * ranges this package declares, and `SEGMENT_ABSENCES` says why each code inside
 * one of them carries no name here, so an unnamed code can be told apart from an
 * unexplained hole.
 *
 * @example
 * ```ts
 * import { SEGMENT_NAMES } from "@cosyte/ncpdp/telecom";
 * SEGMENT_NAMES.get("07"); // "Claim"
 * SEGMENT_NAMES.get("99"); // undefined: preserved verbatim, just not labeled
 * ```
 */
export const SEGMENT_NAMES: ReadonlyMap<string, string> = new Map([
  // Request segments, inside the declared 01-16 range. Nothing this package can cite
  // fixes that bound, and SEGMENT_CODE_RANGES publishes it as unverified for exactly
  // that reason; 06, 09, 14, 15 and 16 are unnamed and carry a SEGMENT_ABSENCES record.
  ["01", "Patient"],
  ["02", "Pharmacy Provider"],
  ["03", "Prescriber"],
  ["04", "Insurance"],
  ["05", "Coordination of Benefits / Other Payments"],
  ["07", "Claim"],
  ["08", "DUR / PPS"],
  ["10", "Compound"],
  ["11", "Pricing"],
  ["12", "Prior Authorization"],
  ["13", "Clinical"],
  // Response segments, inside the declared 20-28 range, equally unverified: 27 is
  // unnamed and carries a SEGMENT_ABSENCES record. Adjudication results carry their
  // own 2x codes.
  ["20", "Response Message"],
  ["21", "Response Status"],
  ["22", "Response Claim"],
  ["23", "Response Pricing"],
  ["24", "Response DUR / PPS"],
  ["25", "Response Insurance"],
  ["26", "Response Patient"],
  ["28", "Response Coordination of Benefits / Other Payers"],
]);

/**
 * Paraphrased names for the safety-relevant B1 field identifiers this parser
 * surfaces, keyed by their 2-character field id. A field whose id is absent here
 * is still preserved verbatim: absence of a name means only that the parser has
 * not labeled it, never that the field is invalid or droppable.
 *
 * @example
 * ```ts
 * import { FIELD_NAMES } from "@cosyte/ncpdp/telecom";
 * FIELD_NAMES.get("D7"); // "Product / Service ID"
 * FIELD_NAMES.get("ZZ"); // undefined: unlabeled, still preserved verbatim
 * ```
 */
export const FIELD_NAMES: ReadonlyMap<string, string> = new Map([
  ["AM", "Segment Identification"],
  // Insurance (04)
  ["C1", "Group ID"],
  ["C2", "Cardholder ID"],
  ["C3", "Person Code"],
  // Patient (01)
  ["C4", "Date of Birth"],
  ["C5", "Patient Gender Code"],
  // Claim (07)
  ["D2", "Prescription / Service Reference Number"],
  ["EM", "Prescription / Service Reference Number Qualifier"],
  ["D3", "Fill Number"],
  ["D7", "Product / Service ID"],
  ["E1", "Product / Service ID Qualifier"],
  ["E7", "Quantity Dispensed"],
  ["D5", "Days Supply"],
  ["D8", "Dispense As Written / Product Selection Code"],
  // Prescriber (03)
  ["DB", "Prescriber ID"],
  ["EZ", "Prescriber ID Qualifier"],
  // Response Status (21)
  ["AN", "Transaction Response Status"],
  ["F3", "Authorization Number"],
  ["FA", "Reject Count"],
  ["FB", "Reject Code"],
  ["FQ", "Additional Message Information"],
  // Response Pricing (23): money fields, implied 2-place decimal.
  ["F5", "Patient Pay Amount"],
  ["F6", "Ingredient Cost Paid"],
  ["F7", "Dispensing Fee Paid"],
  ["F9", "Total Amount Paid"],
  ["FM", "Basis of Reimbursement Determination"],
  // Response Message (20)
  ["F4", "Message"],
  // Response DUR / PPS (24)
  ["J6", "DUR / PPS Response Code Counter"],
  ["E4", "Reason For Service Code"],
  ["FS", "Clinical Significance Code"],
  ["FT", "Other Pharmacy Indicator"],
  ["FU", "Previous Date Of Fill"],
  ["FV", "Quantity Of Previous Fill"],
  ["FW", "Database Indicator"],
  ["FX", "Other Prescriber Indicator"],
  ["FY", "DUR Free Text Message"],
  // DUR / PPS depth (request 08 + response 24)
  ["E5", "Professional Service Code"],
  ["E6", "Result Of Service Code"],
  ["8E", "DUR / PPS Level Of Effort"],
  ["J9", "DUR Co-Agent ID Qualifier"],
  ["H7", "DUR Co-Agent ID"],
  // Compound (10)
  ["EF", "Compound Dosage Form Description Code"],
  ["EG", "Compound Dispensing Unit Form Indicator"],
  ["EC", "Compound Ingredient Component Count"],
  ["RE", "Compound Product ID Qualifier"],
  ["TE", "Compound Product ID"],
  ["ED", "Compound Ingredient Quantity"],
  ["EE", "Compound Ingredient Drug Cost"],
  ["UE", "Compound Ingredient Basis Of Cost Determination"],
  // Coordination of Benefits / Other Payments (request 05 + response 28)
  ["4C", "Coordination Of Benefits / Other Payments Count"],
  ["5C", "Other Payer Coverage Type"],
  ["6C", "Other Payer ID Qualifier"],
  ["7C", "Other Payer ID"],
  ["E8", "Other Payer Date"],
  ["HC", "Other Payer Amount Paid Qualifier"],
  ["DV", "Other Payer Amount Paid"],
  ["6E", "Other Payer-Patient Responsibility Amount Qualifier"],
  ["7E", "Other Payer-Patient Responsibility Amount"],
  ["NT", "Other Payer ID Count"],
  ["MH", "Other Payer Processor Control Number"],
  ["NU", "Other Payer Cardholder ID"],
  ["MJ", "Other Payer Group ID"],
  // Prior Authorization (12)
  ["EU", "Prior Authorization Type Code"],
  ["EV", "Prior Authorization Number Submitted"],
]);

/**
 * Wire width of the Segment Identification (111-AM) code: two characters in the
 * Telecommunication standard, which both halves of this library treat as a
 * structural shape rather than a hint. The parser will not promote an AM value
 * of any other length to {@link TelecomSegment.segmentId}, and the builder
 * refuses to construct one, so the bound holds however a transaction was made.
 *
 * @example
 * ```ts
 * import { SEGMENT_ID_LENGTH } from "@cosyte/ncpdp/telecom";
 * SEGMENT_ID_LENGTH; // 2
 * ```
 */
export const SEGMENT_ID_LENGTH = 2;

/** A single decoded field: its 2-character id, verbatim value, and paraphrased name. */
export interface TelecomField {
  /** The 2-character field identifier, verbatim (empty for a malformed token). */
  readonly id: string;
  /** The field value exactly as it appeared on the wire. */
  readonly value: string;
  /** Paraphrased field name when {@link id} is recognized. */
  readonly name?: string;
  /** Byte offset of this field token in the raw message. */
  readonly byteOffset: number;
}

/** A decoded segment: its identification code, name, and ordered fields. */
export interface TelecomSegment {
  /**
   * The Segment Identification (111-AM) code, e.g. `"07"`.
   *
   * Always either exactly two characters or empty. It is empty when the segment
   * did not begin with an `AM` field (`MISSING_SEGMENT_ID`) **and** when it did
   * but that field's value was not two characters (`MALFORMED_SEGMENT_ID`); in
   * the second case the `AM` field itself is kept in {@link fields}, verbatim, so
   * no byte is lost. The bound is what makes this field safe for a consumer to
   * interpolate into its own diagnostics: `fields[].value` is not.
   */
  readonly segmentId: string;
  /** Paraphrased segment name when {@link segmentId} is recognized. */
  readonly name?: string;
  /**
   * The segment's data fields, in wire order. The `AM` field is not repeated
   * here once it has been read into {@link segmentId}; when it could not be
   * (`MALFORMED_SEGMENT_ID`), it stays in this list instead of being dropped.
   */
  readonly fields: readonly TelecomField[];
  /** Byte offset of the segment in the raw message. */
  readonly byteOffset: number;
}

/**
 * One group-separated transaction decoded out of a transmission body: its
 * position in the transmission, the absolute byte offset of its first byte, its
 * segments in wire order, and the warnings raised while decoding **it**.
 *
 * A transmission may carry several transactions (the Group Separator is what
 * divides them), and each one is decoded into its own entry with its own warning
 * list. That is what isolates a malformed transaction: a quirk in one cannot
 * discard, reorder or re-attribute the segments of another, and a consumer can
 * tell which transaction a warning belongs to without re-tokenizing the input.
 */
export interface TelecomDecodedTransaction {
  /** Zero-based position of this transaction within the transmission. */
  readonly index: number;
  /** Byte offset of this transaction's first byte in the raw message. */
  readonly byteOffset: number;
  /** This transaction's segments, in wire order. */
  readonly segments: readonly TelecomSegment[];
  /** The warnings raised decoding this transaction, in the order they were raised. */
  readonly warnings: readonly NcpdpTelecomWarning[];
}

interface Part {
  readonly text: string;
  readonly offset: number;
}

/**
 * Split a string on a single-character separator, carrying each piece's absolute
 * byte offset. Empty pieces are retained (the caller decides whether to drop the
 * leading empty that a leading separator produces).
 *
 * @param s - The string to split.
 * @param sep - The single-character separator.
 * @param base - The absolute offset of `s[0]` in the original message.
 * @returns The pieces with their absolute offsets.
 *
 * @example
 * ```ts
 * splitWithOffsets("\x1cD7123", "\x1c", 56);
 * // [{ text: "", offset: 56 }, { text: "D7123", offset: 57 }]
 * ```
 */
export function splitWithOffsets(s: string, sep: string, base: number): Part[] {
  const out: Part[] = [];
  let start = 0;
  for (let i = 0; i <= s.length; i++) {
    if (i === s.length || s[i] === sep) {
      out.push({ text: s.slice(start, i), offset: base + start });
      start = i + 1;
    }
  }
  return out;
}

/**
 * Tokenize the variable body of a Telecom transmission (everything after the
 * fixed header) into **every** group-separated transaction it carries, in wire
 * order. Within a transaction, segments are segment-separator delimited and
 * fields are field-separator delimited; the first field of each segment is the
 * Segment Identification (`AM`).
 *
 * Each transaction is decoded independently, into its own segment list and its
 * own warning sink, so a malformed transaction cannot cost the transmission the
 * transactions that decoded around it. No maximum is enforced: this reader has
 * no citable authority for one, so it reports what it decoded and never refuses
 * a count (see {@link "./warnings".TELECOM_WARNING_CODES.TRANSACTION_COUNT_MISMATCH}).
 *
 * @param body - The raw message body (the portion after the fixed header).
 * @param base - The absolute offset of `body[0]` in the raw message.
 * @returns One {@link TelecomDecodedTransaction} per transaction, in wire order.
 *
 * @example
 * ```ts
 * import { tokenizeTransactions } from "@cosyte/ncpdp/telecom";
 * const decoded = tokenizeTransactions("AM07\x1cD2RX1\x1dAM04", 56);
 * decoded.length;                 // 2: both transactions decoded
 * decoded[1]?.segments[0]?.segmentId; // "04"
 * ```
 */
export function tokenizeTransactions(body: string, base: number): TelecomDecodedTransaction[] {
  const groups = splitWithOffsets(body, GROUP_SEPARATOR, base).filter((g) => g.text.length > 0);
  return groups.map((group, index) => {
    // One sink per transaction: the isolation is structural, not a convention.
    const warnings: NcpdpTelecomWarning[] = [];
    const segments = splitWithOffsets(group.text, SEGMENT_SEPARATOR, group.offset)
      .filter((seg) => seg.text.length > 0)
      .map((seg) => decodeSegment(seg, warnings));
    return Object.freeze({
      index,
      byteOffset: group.offset,
      segments: Object.freeze(segments),
      warnings: Object.freeze(warnings),
    });
  });
}

/**
 * Tokenize the variable body of a Telecom transmission into the segments of its
 * **first** group-separated transaction, pushing that transaction's warnings into
 * the supplied sink.
 *
 * This is the single-transaction view of {@link tokenizeTransactions}, kept for
 * callers that hold one transaction's worth of body. A transmission may carry
 * more than one transaction, and this function reads only the first, so
 * `tokenizeTransactions` (or `parseTelecom`, which uses it) is the route that
 * reads them all.
 *
 * It says **nothing** about the transactions it did not read: the sink receives
 * the first transaction's warnings and no others, and no warning is raised to
 * report the ones past it. Hand a multi-transaction body to this function and
 * the answer is a partial one that looks whole, so reach for
 * `tokenizeTransactions` whenever the body might carry more than one.
 *
 * @param body - The raw message body (the portion after the fixed header).
 * @param base - The absolute offset of `body[0]` in the raw message.
 * @param warnings - Sink that collects non-fatal warnings.
 * @returns The decoded segments of the first transaction, in wire order.
 *
 * @example
 * ```ts
 * const warnings: NcpdpTelecomWarning[] = [];
 * const segs = tokenizeBody("\x1cAM07\x1cD2RX1", 56, warnings);
 * segs[0]?.segmentId; // "07"
 * ```
 */
export function tokenizeBody(
  body: string,
  base: number,
  warnings: NcpdpTelecomWarning[],
): TelecomSegment[] {
  const first = tokenizeTransactions(body, base)[0];
  if (first === undefined) return [];
  warnings.push(...first.warnings);
  return [...first.segments];
}

function decodeSegment(seg: Part, warnings: NcpdpTelecomWarning[]): TelecomSegment {
  const tokens = splitWithOffsets(seg.text, FIELD_SEPARATOR, seg.offset).filter(
    (t) => t.text.length > 0,
  );
  const fields = tokens.map((t) => decodeField(t, warnings));

  const head = fields[0];
  let segmentId = "";
  let dataFields: TelecomField[] = fields;
  if (head === undefined || head.id !== "AM") {
    warnings.push(
      telecomWarning(TELECOM_WARNING_CODES.MISSING_SEGMENT_ID, telecomPosition(seg.offset)),
    );
  } else if (head.value.length === SEGMENT_ID_LENGTH) {
    segmentId = head.value;
    dataFields = fields.slice(1);
  } else {
    // The AM field is present but its value is not a Segment Identification
    // code. Almost always a dropped field separator has run the rest of the
    // segment into it, so those bytes are claim data (an NDC, a prescription
    // number) and not an identifier. They stay where they belong, in `fields`
    // as the AM field, verbatim: nothing is dropped, and nothing unbounded is
    // promoted onto `segmentId`, which downstream packages read as a locus.
    warnings.push(
      telecomWarning(TELECOM_WARNING_CODES.MALFORMED_SEGMENT_ID, telecomPosition(seg.offset, "AM")),
    );
  }

  const name = SEGMENT_NAMES.get(segmentId);
  if (segmentId !== "" && name === undefined) {
    warnings.push(
      telecomWarning(TELECOM_WARNING_CODES.UNKNOWN_SEGMENT, telecomPosition(seg.offset, "AM")),
    );
  }

  const out: Mutable<TelecomSegment> = {
    segmentId,
    fields: Object.freeze(dataFields),
    byteOffset: seg.offset,
  };
  if (name !== undefined) out.name = name;
  return Object.freeze(out);
}

function decodeField(token: Part, warnings: NcpdpTelecomWarning[]): TelecomField {
  if (token.text.length < 2) {
    warnings.push(
      telecomWarning(TELECOM_WARNING_CODES.MALFORMED_FIELD, telecomPosition(token.offset)),
    );
    return Object.freeze({ id: "", value: token.text, byteOffset: token.offset });
  }
  const id = token.text.slice(0, 2);
  const value = token.text.slice(2);
  const name = FIELD_NAMES.get(id);
  const out: Mutable<TelecomField> = { id, value, byteOffset: token.offset };
  if (name !== undefined) out.name = name;
  return Object.freeze(out);
}

/**
 * Find the first segment with a given identification code.
 *
 * @param segments - The decoded segments.
 * @param code - The 2-character Segment Identification code, e.g. `"07"`.
 * @returns The first matching segment, or `undefined`.
 *
 * @example
 * ```ts
 * findSegment(t.segments, "07")?.name; // "Claim"
 * ```
 */
export function findSegment(
  segments: readonly TelecomSegment[],
  code: string,
): TelecomSegment | undefined {
  return segments.find((s) => s.segmentId === code);
}

/**
 * Read the verbatim value of the first field with a given id within a segment.
 *
 * @param segment - The segment to read, or `undefined`.
 * @param fieldId - The 2-character field id, e.g. `"D7"`.
 * @returns The field value, or `undefined` when the segment or field is absent.
 *
 * @example
 * ```ts
 * fieldValue(findSegment(t.segments, "07"), "D7"); // the Product/Service ID
 * ```
 */
export function fieldValue(
  segment: TelecomSegment | undefined,
  fieldId: string,
): string | undefined {
  return segment?.fields.find((f) => f.id === fieldId)?.value;
}

/**
 * Read **every** value for a given field id within a segment, in wire order. A
 * Telecom segment can repeat a field (e.g. multiple Reject Codes in a Response
 * Status segment); collapsing the repeats to the first match would silently drop
 * a reject code or a DUR alert, so callers that must not lose data use this.
 *
 * @param segment - The segment to read, or `undefined`.
 * @param fieldId - The 2-character field id, e.g. `"FB"`.
 * @returns Every matching value in wire order (empty array when none/absent).
 *
 * @example
 * ```ts
 * fieldValues(findSegment(t.segments, "21"), "FB"); // ["70", "88"]: all rejects
 * ```
 */
export function fieldValues(
  segment: TelecomSegment | undefined,
  fieldId: string,
): readonly string[] {
  return segment?.fields.filter((f) => f.id === fieldId).map((f) => f.value) ?? [];
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
