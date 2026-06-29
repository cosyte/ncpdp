import { decimalValue, type DecimalValue } from "../common/decimal.js";
import { findSegment, fieldValue, type TelecomSegment } from "./tokenize.js";

/**
 * Paraphrased meanings for the Product/Service ID Qualifier (436-E1) values this
 * phase recognizes. The codes are factual identifiers from the NCPDP
 * Telecommunication standard; the meanings are our own short labels (no
 * redistributed NCPDP prose). A qualifier outside this set is preserved verbatim
 * with an undefined meaning — absence of a label never means the value is invalid.
 */
export const PRODUCT_QUALIFIER_MEANINGS: ReadonlyMap<string, string> = new Map([
  ["00", "Not Specified"],
  ["01", "UPC"],
  ["02", "HRI"],
  ["03", "NDC"],
]);

/**
 * A drug identifier from the Claim segment: the Product/Service ID (407-D7) and
 * its qualifier (436-E1), each preserved verbatim. The qualifier names the code
 * system (e.g. NDC); we surface a paraphrased meaning when we recognize it but
 * never reinterpret the id itself.
 */
export interface TelecomProductCode {
  /** Product/Service ID (407-D7), verbatim — e.g. an 11-digit NDC. */
  readonly id: string;
  /** Product/Service ID Qualifier (436-E1), verbatim. */
  readonly qualifier: string;
  /** Paraphrased qualifier meaning when recognized this phase (e.g. `"NDC"`). */
  readonly qualifierMeaning?: string;
}

/**
 * Quantity Dispensed (442-E7). On the wire this is an unsigned integer string
 * with an **implied 3-place decimal** (NCPDP format `9(7)v999`): `"30000"` means
 * `30.000`. We never parse it into a float — binary floating point would corrupt
 * the value — so we keep the verbatim source and, when it is all digits, surface
 * the implied decimal applied **string-wise**.
 */
export interface TelecomQuantity {
  /** The quantity exactly as it appeared on the wire. */
  readonly source: string;
  /** True when {@link source} is a non-empty run of digits. */
  readonly isValid: boolean;
  /** {@link source} with the implied 3-place decimal inserted, when valid. */
  readonly impliedDecimal?: string;
}

/**
 * A B1/B2/B3 request view over a decoded Telecom transaction: the safety-relevant
 * fields a biller needs, lifted from their field-id-keyed segments and preserved
 * verbatim. Every field is optional — a missing segment or field yields
 * `undefined` rather than a throw, in keeping with the lenient parse contract.
 */
export interface TelecomClaim {
  /** Transaction Code (103-A3) from the header, e.g. `"B1"`. */
  readonly transactionCode: string;
  /** Group ID (301-C1) from the Insurance segment. */
  readonly groupId?: string;
  /** Cardholder ID (302-C2) from the Insurance segment. PHI. */
  readonly cardholderId?: string;
  /** Person Code (303-C3) from the Insurance segment. */
  readonly personCode?: string;
  /** Date of Birth (304-C4) from the Patient segment, verbatim (`CCYYMMDD`). PHI. */
  readonly dateOfBirth?: string;
  /** Patient Gender Code (305-C5) from the Patient segment. */
  readonly genderCode?: string;
  /** Prescription/Service Reference Number (402-D2) from the Claim segment. */
  readonly prescriptionReferenceNumber?: string;
  /** Prescription/Service Reference Number Qualifier (455-EM). */
  readonly prescriptionReferenceQualifier?: string;
  /** Fill Number (403-D3) from the Claim segment. */
  readonly fillNumber?: string;
  /** Product/Service ID + qualifier (407-D7 / 436-E1), when present. */
  readonly product?: TelecomProductCode;
  /** Quantity Dispensed (442-E7) with its implied 3-place decimal. */
  readonly quantityDispensed?: TelecomQuantity;
  /** Days Supply (405-D5), preserved as a decimal-safe value. */
  readonly daysSupply?: DecimalValue;
  /** Dispense As Written / Product Selection Code (408-D8), verbatim. */
  readonly dispenseAsWritten?: string;
  /** Prescriber ID (411-DB) from the Prescriber segment. */
  readonly prescriberId?: string;
  /** Prescriber ID Qualifier (466-EZ) from the Prescriber segment. */
  readonly prescriberIdQualifier?: string;
}

const DIGITS_RE = /^\d+$/;

/**
 * Apply the NCPDP implied 3-place decimal to an integer digit string, string-wise
 * (never via float). Returns `undefined` for non-digit input.
 *
 * @param digits - The verbatim integer string from the wire.
 * @returns The value with a 3-place fraction, or `undefined` if not all digits.
 *
 * @example
 * ```ts
 * impliedThreeDecimal("30000"); // "30.000"
 * impliedThreeDecimal("5");     // "0.005"
 * ```
 */
export function impliedThreeDecimal(digits: string): string | undefined {
  if (!DIGITS_RE.test(digits)) return undefined;
  const padded = digits.padStart(4, "0");
  const whole = padded.slice(0, -3).replace(/^0+(?=\d)/, "");
  return `${whole}.${padded.slice(-3)}`;
}

/**
 * Wrap a verbatim Quantity Dispensed value as a {@link TelecomQuantity}, applying
 * the implied 3-place decimal string-wise when the value is all digits.
 *
 * @param source - The quantity exactly as it appeared on the wire.
 * @returns A frozen {@link TelecomQuantity}.
 *
 * @example
 * ```ts
 * telecomQuantity("30000").impliedDecimal; // "30.000"
 * ```
 */
export function telecomQuantity(source: string): TelecomQuantity {
  const implied = impliedThreeDecimal(source);
  const out: Mutable<TelecomQuantity> = { source, isValid: implied !== undefined };
  if (implied !== undefined) out.impliedDecimal = implied;
  return Object.freeze(out);
}

function product(claimSeg: TelecomSegment | undefined): TelecomProductCode | undefined {
  const id = fieldValue(claimSeg, "D7");
  const qualifier = fieldValue(claimSeg, "E1");
  if (id === undefined && qualifier === undefined) return undefined;
  const out: Mutable<TelecomProductCode> = { id: id ?? "", qualifier: qualifier ?? "" };
  const meaning = PRODUCT_QUALIFIER_MEANINGS.get(out.qualifier);
  if (meaning !== undefined) out.qualifierMeaning = meaning;
  return Object.freeze(out);
}

/**
 * Build the B1/B2/B3 request view over a decoded Telecom transaction. Returns
 * `undefined` only when the transaction carries no segments at all; otherwise it
 * surfaces whatever safety-relevant fields are present, each optional.
 *
 * @param transactionCode - Transaction Code (103-A3) from the header.
 * @param segments - The decoded segments in wire order.
 * @returns The claim view, or `undefined` when there are no segments to read.
 *
 * @example
 * ```ts
 * const t = parseTelecom(raw);
 * claimView(t.header.transactionCode, t.segments)?.product?.id; // the NDC
 * ```
 */
export function claimView(
  transactionCode: string,
  segments: readonly TelecomSegment[],
): TelecomClaim | undefined {
  if (segments.length === 0) return undefined;

  const insurance = findSegment(segments, "04");
  const patient = findSegment(segments, "01");
  const claimSeg = findSegment(segments, "07");
  const prescriber = findSegment(segments, "03");

  const out: Mutable<TelecomClaim> = { transactionCode };
  assign(out, "groupId", fieldValue(insurance, "C1"));
  assign(out, "cardholderId", fieldValue(insurance, "C2"));
  assign(out, "personCode", fieldValue(insurance, "C3"));
  assign(out, "dateOfBirth", fieldValue(patient, "C4"));
  assign(out, "genderCode", fieldValue(patient, "C5"));
  assign(out, "prescriptionReferenceNumber", fieldValue(claimSeg, "D2"));
  assign(out, "prescriptionReferenceQualifier", fieldValue(claimSeg, "EM"));
  assign(out, "fillNumber", fieldValue(claimSeg, "D3"));
  assign(out, "dispenseAsWritten", fieldValue(claimSeg, "D8"));
  assign(out, "prescriberId", fieldValue(prescriber, "DB"));
  assign(out, "prescriberIdQualifier", fieldValue(prescriber, "EZ"));

  const prod = product(claimSeg);
  if (prod !== undefined) out.product = prod;

  const qty = fieldValue(claimSeg, "E7");
  if (qty !== undefined) out.quantityDispensed = telecomQuantity(qty);

  const days = fieldValue(claimSeg, "D5");
  if (days !== undefined) out.daysSupply = decimalValue(days);

  return Object.freeze(out);
}

function assign<K extends keyof TelecomClaim>(
  out: Mutable<TelecomClaim>,
  key: K,
  value: string | undefined,
): void {
  if (value !== undefined) out[key] = value as TelecomClaim[K];
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
