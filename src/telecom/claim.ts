import { decimalValue, type DecimalValue } from "../common/decimal.js";
import type { TelecomField, TelecomSegment } from "./tokenize.js";

// vocab-withdrawn: field=436-E1
// The four Product/Service ID Qualifier labels this module used to export as
// PRODUCT_QUALIFIER_MEANINGS ("Not Specified" for 00, "UPC" for 01, "HRI" for 02, "NDC"
// for 03) are WITHDRAWN as of 2026-08-25, and the export is gone with them. The normative
// source for 436-E1 is the NCPDP External Code List, a purchased product this package
// cannot cite, and no substitute that establishes the shipped set could be obtained.
//
// BE PRECISE ABOUT WHAT THE CORPUS DID SAY, because "no artifact" would be too strong
// here and a provenance record that overstates its own emptiness is the same defect as
// one that overstates its sources. The one artifact carried for this change (the eMedNY
// manual cited in response.ts on the 439-E4 table) does state two 436-E1 values in a NY
// Medicaid billing context: 03 for a national drug code and 09 for a HCPCS-coded supply
// item. That leaves 00, 01 and 02 with no artifact at all, corroborates 03 once for one
// payer, and names 09, which this package does not decode and which is not added here
// (adding a code is a separate decision). A one-row label table sourced to a single
// payer's billing instructions is not worth the surface it would ship on, so the whole
// table is withdrawn rather than reduced to its one survivor.
//
// THE FAIL-SAFE THAT CONTAINS THE GAP, and it predates this change: the qualifier and the
// product id are both surfaced verbatim and are never reinterpreted. Absence of a meaning
// never implied the value was invalid, and now there is no meaning to be absent. A
// consumer that needs qualifier text brings its own mapping, exactly as it already does
// for 440-E5 and 441-E6.

/**
 * A drug identifier from the Claim segment: the Product/Service ID (407-D7) and
 * its qualifier (436-E1), each preserved verbatim.
 *
 * The qualifier names the code system the id belongs to. This package does not
 * ship a label for it: no public artifact establishing the 436-E1 value set could
 * be obtained, so the qualifier comes back exactly as it appeared on the wire and
 * nothing else. Absence of a meaning never means the value is invalid.
 */
export interface TelecomProductCode {
  /** Product/Service ID (407-D7), verbatim: e.g. an 11-digit NDC. */
  readonly id: string;
  /** Product/Service ID Qualifier (436-E1), verbatim. */
  readonly qualifier: string;
}

/**
 * Quantity Dispensed (442-E7). On the wire this is an unsigned integer string
 * with an **implied 3-place decimal** (NCPDP format `9(7)v999`): `"30000"` means
 * `30.000`. We never parse it into a float: binary floating point would corrupt
 * the value, so we keep the verbatim source and, when it is all digits, surface
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
 * verbatim. Every field is optional: a missing segment or field yields
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
  const found = new ClaimSegments();
  found.scan(segments);
  return readClaim(transactionCode, found);
}

/**
 * The four segments a claim view reads, each the first with its Segment
 * Identification, found in one pass over one or more segment lists.
 *
 * @example
 * ```ts
 * const found = new ClaimSegments();
 * found.scan(t.transactions[0]?.segments ?? []);
 * found.scan(t.transmissionSegments); // a transaction's own segment wins
 * found.claim?.segmentId; // "07"
 * ```
 */
export class ClaimSegments {
  public insurance: TelecomSegment | undefined = undefined;
  public patient: TelecomSegment | undefined = undefined;
  public claim: TelecomSegment | undefined = undefined;
  public prescriber: TelecomSegment | undefined = undefined;

  /** Take each of the four not yet found from `segments`, first match first. */
  public scan(segments: readonly TelecomSegment[]): void {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i] as TelecomSegment;
      switch (seg.segmentId) {
        case "04":
          this.insurance ??= seg;
          break;
        case "01":
          this.patient ??= seg;
          break;
        case "07":
          this.claim ??= seg;
          break;
        case "03":
          this.prescriber ??= seg;
          break;
        default:
          break;
      }
    }
  }
}

/** The first value of each field a claim view reads, gathered in one pass per segment. */
class ClaimValues {
  public groupId: string | undefined = undefined;
  public cardholderId: string | undefined = undefined;
  public personCode: string | undefined = undefined;
  public dateOfBirth: string | undefined = undefined;
  public genderCode: string | undefined = undefined;
  public referenceNumber: string | undefined = undefined;
  public referenceQualifier: string | undefined = undefined;
  public fillNumber: string | undefined = undefined;
  public dispenseAsWritten: string | undefined = undefined;
  public productId: string | undefined = undefined;
  public productQualifier: string | undefined = undefined;
  public quantity: string | undefined = undefined;
  public daysSupply: string | undefined = undefined;
  public prescriberId: string | undefined = undefined;
  public prescriberIdQualifier: string | undefined = undefined;

  public insurance(seg: TelecomSegment): void {
    const fields = seg.fields;
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i] as TelecomField;
      if (f.id === "C1") this.groupId ??= f.value;
      else if (f.id === "C2") this.cardholderId ??= f.value;
      else if (f.id === "C3") this.personCode ??= f.value;
    }
  }

  public patient(seg: TelecomSegment): void {
    const fields = seg.fields;
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i] as TelecomField;
      if (f.id === "C4") this.dateOfBirth ??= f.value;
      else if (f.id === "C5") this.genderCode ??= f.value;
    }
  }

  public claim(seg: TelecomSegment): void {
    const fields = seg.fields;
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i] as TelecomField;
      switch (f.id) {
        case "D2":
          this.referenceNumber ??= f.value;
          break;
        case "EM":
          this.referenceQualifier ??= f.value;
          break;
        case "D3":
          this.fillNumber ??= f.value;
          break;
        case "D8":
          this.dispenseAsWritten ??= f.value;
          break;
        case "D7":
          this.productId ??= f.value;
          break;
        case "E1":
          this.productQualifier ??= f.value;
          break;
        case "E7":
          this.quantity ??= f.value;
          break;
        case "D5":
          this.daysSupply ??= f.value;
          break;
        default:
          break;
      }
    }
  }

  public prescriber(seg: TelecomSegment): void {
    const fields = seg.fields;
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i] as TelecomField;
      if (f.id === "DB") this.prescriberId ??= f.value;
      else if (f.id === "EZ") this.prescriberIdQualifier ??= f.value;
    }
  }
}

/**
 * Build the claim view from the four segments it reads: one pass over each
 * segment's fields, every value read where that pass found it.
 *
 * @param transactionCode - Transaction Code (103-A3) from the header.
 * @param found - The insurance, patient, claim and prescriber segments.
 * @returns The frozen claim view.
 *
 * @example
 * ```ts
 * const found = new ClaimSegments();
 * found.scan(t.segments);
 * readClaim(t.header.transactionCode, found).product?.id; // the NDC
 * ```
 */
export function readClaim(transactionCode: string, found: ClaimSegments): TelecomClaim {
  const v = new ClaimValues();
  if (found.insurance !== undefined) v.insurance(found.insurance);
  if (found.patient !== undefined) v.patient(found.patient);
  if (found.claim !== undefined) v.claim(found.claim);
  if (found.prescriber !== undefined) v.prescriber(found.prescriber);

  const out: Mutable<TelecomClaim> = { transactionCode };
  assign(out, "groupId", v.groupId);
  assign(out, "cardholderId", v.cardholderId);
  assign(out, "personCode", v.personCode);
  assign(out, "dateOfBirth", v.dateOfBirth);
  assign(out, "genderCode", v.genderCode);
  assign(out, "prescriptionReferenceNumber", v.referenceNumber);
  assign(out, "prescriptionReferenceQualifier", v.referenceQualifier);
  assign(out, "fillNumber", v.fillNumber);
  assign(out, "dispenseAsWritten", v.dispenseAsWritten);
  assign(out, "prescriberId", v.prescriberId);
  assign(out, "prescriberIdQualifier", v.prescriberIdQualifier);

  if (v.productId !== undefined || v.productQualifier !== undefined) {
    out.product = Object.freeze({ id: v.productId ?? "", qualifier: v.productQualifier ?? "" });
  }
  if (v.quantity !== undefined) out.quantityDispensed = telecomQuantity(v.quantity);
  if (v.daysSupply !== undefined) out.daysSupply = decimalValue(v.daysSupply);

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
