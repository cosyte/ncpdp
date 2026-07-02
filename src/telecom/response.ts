/**
 * NCPDP Telecommunication vD.0 response reads: the adjudication results a pharmacy
 * gets back from a PBM/payer for a B1 billing claim, a B2 reversal, a B3 rebill,
 * or an E1 eligibility request.
 *
 * Two safety invariants govern this module:
 *
 *  1. **A reject always wins.** The disposition is a total function over the
 *     Transaction Response Status (112-AN) and the reject codes (511-FB). If any
 *     reject is present the disposition is `"rejected"`, even when the status
 *     field claims paid — a consumer is never told a rejected claim was paid. An
 *     unrecognized status reads `"unknown"`, never paid.
 *  2. **No DUR alert is dropped.** The Response DUR/PPS segment repeats one set
 *     of fields per returned alert; every occurrence is surfaced, none collapsed.
 *
 * Money is preserved verbatim and interpreted string-wise (never float) via
 * {@link telecomMoney}. Reject and DUR codes are surfaced verbatim with a
 * `known` flag; descriptions are our own short paraphrases (no NCPDP prose).
 */

import { telecomMoney, type TelecomMoney } from "./money.js";
import { telecomPosition } from "./position.js";
import { findSegment, fieldValue, fieldValues, type TelecomSegment } from "./tokenize.js";
import { telecomWarning, TELECOM_WARNING_CODES, type NcpdpTelecomWarning } from "./warnings.js";
import type { TelecomTransaction } from "./parse.js";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * The fail-safe adjudication disposition. Derived from the Transaction Response
 * Status and the reject codes together — never from the status field alone.
 */
export type Disposition =
  | "paid"
  | "captured"
  | "approved"
  | "duplicate"
  | "deferred"
  | "rejected"
  | "unknown";

interface StatusMeaning {
  readonly disposition: Disposition;
  readonly description: string;
}

/**
 * Paraphrased meanings + dispositions for the Transaction Response Status (112-AN)
 * values this phase recognizes. Codes are factual NCPDP identifiers; the
 * descriptions are our own short labels (no redistributed NCPDP prose). A value
 * outside this set reads `"unknown"` and is preserved verbatim.
 *
 * @example
 * ```ts
 * import { RESPONSE_STATUS_MEANINGS } from "@cosyte/ncpdp/telecom";
 * RESPONSE_STATUS_MEANINGS.get("P")?.disposition; // "paid"
 * RESPONSE_STATUS_MEANINGS.get("R")?.disposition; // "rejected"
 * ```
 */
export const RESPONSE_STATUS_MEANINGS: ReadonlyMap<string, StatusMeaning> = new Map([
  ["P", { disposition: "paid", description: "Paid" }],
  ["C", { disposition: "captured", description: "Captured" }],
  ["A", { disposition: "approved", description: "Approved" }],
  ["D", { disposition: "duplicate", description: "Duplicate of Paid" }],
  ["Q", { disposition: "duplicate", description: "Duplicate of Captured" }],
  ["F", { disposition: "deferred", description: "Prior Authorization Deferred" }],
  ["R", { disposition: "rejected", description: "Rejected" }],
]);

/**
 * Paraphrased meanings for the most common Reject Codes (511-FB). Codes are
 * factual NCPDP identifiers; the labels are short industry-common paraphrases (no
 * redistributed NCPDP prose). A code outside this set is preserved verbatim with
 * `known: false`.
 *
 * @example
 * ```ts
 * import { REJECT_CODE_MEANINGS } from "@cosyte/ncpdp/telecom";
 * REJECT_CODE_MEANINGS.get("75"); // "Prior Authorization Required"
 * REJECT_CODE_MEANINGS.get("ZZ"); // undefined — kept verbatim with known: false
 * ```
 */
export const REJECT_CODE_MEANINGS: ReadonlyMap<string, string> = new Map([
  ["25", "Missing/Invalid Prescriber ID"],
  ["41", "Submit Bill To Other Processor Or Primary Payer"],
  ["54", "Non-Matched Product/Service ID Number"],
  ["65", "Patient Is Not Covered"],
  ["70", "Product/Service Not Covered"],
  ["75", "Prior Authorization Required"],
  ["76", "Plan Limitations Exceeded"],
  ["79", "Refill Too Soon"],
  ["88", "DUR Reject Error"],
  ["AG", "Days Supply Limitation For Product/Service"],
  ["M1", "Patient Not Covered"],
]);

/**
 * Paraphrased meanings for the most common DUR Reason For Service codes (439-E4).
 * Codes are factual NCPDP identifiers; labels are short paraphrases (no NCPDP
 * prose). A code outside this set is preserved verbatim with `known: false`.
 *
 * @example
 * ```ts
 * import { DUR_REASON_MEANINGS } from "@cosyte/ncpdp/telecom";
 * DUR_REASON_MEANINGS.get("DD"); // "Drug-Drug Interaction"
 * ```
 */
export const DUR_REASON_MEANINGS: ReadonlyMap<string, string> = new Map([
  ["DD", "Drug-Drug Interaction"],
  ["TD", "Therapeutic Duplication"],
  ["ID", "Ingredient Duplication"],
  ["HD", "High Dose"],
  ["LD", "Low Dose"],
  ["ER", "Early Refill"],
  ["LR", "Late Refill / Underutilization"],
  ["MC", "Drug-Disease Contraindication"],
  ["PG", "Pregnancy Precaution"],
  ["PA", "Drug-Age Precaution"],
]);

/** A reject code (511-FB) surfaced verbatim with a recognition flag. */
export interface TelecomRejectCode {
  /** The reject code exactly as it appeared on the wire. */
  readonly code: string;
  /** True when {@link code} is in {@link REJECT_CODE_MEANINGS}. */
  readonly known: boolean;
  /** Short paraphrased description, when {@link known}. */
  readonly description?: string;
}

/**
 * The Response Status (21) view: the adjudication outcome with its fail-safe
 * {@link disposition}, the verbatim reject codes (never dropped), and the
 * authorization number when paid.
 */
export interface TelecomResponseStatus {
  /** Transaction Response Status (112-AN), verbatim. */
  readonly transactionResponseStatus: string;
  /** Paraphrased status description, when recognized. */
  readonly statusDescription?: string;
  /**
   * The fail-safe disposition over status **and** reject codes. `"rejected"`
   * whenever any reject is present, regardless of the status field; `"unknown"`
   * for an unrecognized status — never silently `"paid"`.
   */
  readonly disposition: Disposition;
  /**
   * True when the status field claimed a positive outcome (paid/captured/
   * approved/duplicate) yet reject codes were present. The disposition is forced
   * to `"rejected"`; this flags that the source disagreed with itself.
   */
  readonly statusConflict: boolean;
  /** Reject Count (510-FA), verbatim, when present. */
  readonly rejectCount?: string;
  /** Every Reject Code (511-FB) returned, in wire order — none dropped. */
  readonly rejectCodes: readonly TelecomRejectCode[];
  /** Authorization Number (503-F3), when present (typically on a paid response). */
  readonly authorizationNumber?: string;
  /** Additional Message Information (526-FQ), verbatim, when present. */
  readonly additionalMessage?: string;
}

/** The Response Pricing (23) view: the adjudicated dollar amounts, never float. */
export interface TelecomPricing {
  /** Patient Pay Amount (505-F5). */
  readonly patientPayAmount?: TelecomMoney;
  /** Total Amount Paid (509-F9). */
  readonly totalAmountPaid?: TelecomMoney;
  /** Ingredient Cost Paid (506-F6). */
  readonly ingredientCostPaid?: TelecomMoney;
  /** Dispensing Fee Paid (507-F7). */
  readonly dispensingFeePaid?: TelecomMoney;
  /** Basis of Reimbursement Determination (522-FM), verbatim. */
  readonly basisOfReimbursement?: string;
}

/** One returned DUR/PPS alert from the Response DUR/PPS (24) segment. */
export interface TelecomDurAlert {
  /** DUR/PPS Response Code Counter (567-J6) for this occurrence, when present. */
  readonly counter?: string;
  /** Reason For Service Code (439-E4), verbatim — the alert type. */
  readonly reasonForServiceCode?: string;
  /** True when {@link reasonForServiceCode} is in {@link DUR_REASON_MEANINGS}. */
  readonly reasonKnown: boolean;
  /** Short paraphrased reason description, when known. */
  readonly reasonDescription?: string;
  /** Clinical Significance Code (528-FS), verbatim, when present. */
  readonly clinicalSignificanceCode?: string;
  /** Professional Service Code (440-E5), verbatim, when present (description BYO). */
  readonly professionalServiceCode?: string;
  /** Result Of Service Code (441-E6), verbatim, when present (description BYO). */
  readonly resultOfServiceCode?: string;
  /** DUR/PPS Level Of Effort (474-8E), verbatim, when present. */
  readonly levelOfEffort?: string;
  /** Previous Date Of Fill (530-FU), verbatim, when present. */
  readonly previousDateOfFill?: string;
  /** Quantity Of Previous Fill (531-FV), verbatim, when present. */
  readonly quantityOfPreviousFill?: string;
  /** DUR Free Text Message (544-FY), verbatim, when present. May be PHI-adjacent. */
  readonly freeText?: string;
}

function isPositive(d: Disposition): boolean {
  return d === "paid" || d === "captured" || d === "approved" || d === "duplicate";
}

/**
 * Combine a Transaction Response Status code with the presence of reject codes
 * into a fail-safe {@link Disposition}. A reject always wins; an unrecognized
 * status is never assumed paid.
 */
function combineDisposition(
  statusCode: string,
  hasRejects: boolean,
): { readonly disposition: Disposition; readonly conflict: boolean } {
  const base = RESPONSE_STATUS_MEANINGS.get(statusCode)?.disposition ?? "unknown";
  if (hasRejects) {
    return { disposition: "rejected", conflict: isPositive(base) };
  }
  return { disposition: base, conflict: false };
}

function rejectCode(code: string): TelecomRejectCode {
  const description = REJECT_CODE_MEANINGS.get(code);
  const out: Mutable<TelecomRejectCode> = { code, known: description !== undefined };
  if (description !== undefined) out.description = description;
  return Object.freeze(out);
}

function countDeclared(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0;
}

/**
 * Build the {@link TelecomResponseStatus} view from a parsed response. Returns
 * `undefined` when no Response Status (21) segment is present.
 *
 * @param transaction - A transaction from {@link parseTelecom}.
 * @returns The status view, or `undefined`.
 *
 * @example
 * ```ts
 * responseStatus(parseTelecom(rawResponse))?.disposition; // "paid" | "rejected" | …
 * ```
 */
export function responseStatus(transaction: TelecomTransaction): TelecomResponseStatus | undefined {
  const seg = findSegment(transaction.segments, "21");
  if (seg === undefined) return undefined;

  const statusCode = fieldValue(seg, "AN") ?? "";
  const rejectCodes = fieldValues(seg, "FB").map(rejectCode);
  const rejectCount = fieldValue(seg, "FA");
  const hasRejects = rejectCodes.length > 0 || countDeclared(rejectCount);
  const { disposition, conflict } = combineDisposition(statusCode, hasRejects);

  const out: Mutable<TelecomResponseStatus> = {
    transactionResponseStatus: statusCode,
    disposition,
    statusConflict: conflict,
    rejectCodes: Object.freeze(rejectCodes),
  };
  const desc = RESPONSE_STATUS_MEANINGS.get(statusCode)?.description;
  if (desc !== undefined) out.statusDescription = desc;
  if (rejectCount !== undefined) out.rejectCount = rejectCount;
  const auth = fieldValue(seg, "F3");
  if (auth !== undefined) out.authorizationNumber = auth;
  const msg = fieldValue(seg, "FQ");
  if (msg !== undefined) out.additionalMessage = msg;
  return Object.freeze(out);
}

/**
 * Build the {@link TelecomPricing} view from a parsed response. Returns
 * `undefined` when no Response Pricing (23) segment is present. Every dollar
 * amount is preserved verbatim and interpreted string-wise, never as a float.
 *
 * @param transaction - A transaction from {@link parseTelecom}.
 * @returns The pricing view, or `undefined`.
 *
 * @example
 * ```ts
 * responsePricing(parseTelecom(rawResponse))?.patientPayAmount?.amount; // "10.00"
 * ```
 */
export function responsePricing(transaction: TelecomTransaction): TelecomPricing | undefined {
  const seg = findSegment(transaction.segments, "23");
  if (seg === undefined) return undefined;

  const out: Mutable<TelecomPricing> = {};
  assignMoney(out, "patientPayAmount", fieldValue(seg, "F5"));
  assignMoney(out, "totalAmountPaid", fieldValue(seg, "F9"));
  assignMoney(out, "ingredientCostPaid", fieldValue(seg, "F6"));
  assignMoney(out, "dispensingFeePaid", fieldValue(seg, "F7"));
  const basis = fieldValue(seg, "FM");
  if (basis !== undefined) out.basisOfReimbursement = basis;
  return Object.freeze(out);
}

function assignMoney(
  out: Mutable<TelecomPricing>,
  key: "patientPayAmount" | "totalAmountPaid" | "ingredientCostPaid" | "dispensingFeePaid",
  raw: string | undefined,
): void {
  if (raw !== undefined) out[key] = telecomMoney(raw);
}

/**
 * Build the DUR/PPS alert list from a parsed response. The Response DUR/PPS (24)
 * segment repeats its fields once per alert; this splits at each counter (567-J6)
 * **and** at each new Reason For Service (439-E4) so no alert is ever collapsed
 * into another. Returns an empty array when no DUR/PPS segment is present.
 *
 * @param transaction - A transaction from {@link parseTelecom}.
 * @returns Every returned DUR alert, in wire order.
 *
 * @example
 * ```ts
 * responseDur(parseTelecom(rawResponse)).length; // number of returned alerts
 * ```
 */
export function responseDur(transaction: TelecomTransaction): readonly TelecomDurAlert[] {
  const seg = findSegment(transaction.segments, "24");
  if (seg === undefined) return Object.freeze([]);

  const alerts: TelecomDurAlert[] = [];
  let current: Mutable<TelecomDurAlert> | undefined;

  const flush = (): void => {
    if (current !== undefined) {
      const reason = current.reasonForServiceCode;
      const description = reason === undefined ? undefined : DUR_REASON_MEANINGS.get(reason);
      current.reasonKnown = description !== undefined;
      if (description !== undefined) current.reasonDescription = description;
      alerts.push(Object.freeze(current));
    }
  };

  for (const field of seg.fields) {
    const startsNewAlert =
      field.id === "J6" || (field.id === "E4" && current?.reasonForServiceCode !== undefined);
    if (startsNewAlert || current === undefined) {
      flush();
      current = { reasonKnown: false };
    }
    switch (field.id) {
      case "J6":
        current.counter = field.value;
        break;
      case "E4":
        current.reasonForServiceCode = field.value;
        break;
      case "FS":
        current.clinicalSignificanceCode = field.value;
        break;
      case "E5":
        current.professionalServiceCode = field.value;
        break;
      case "E6":
        current.resultOfServiceCode = field.value;
        break;
      case "8E":
        current.levelOfEffort = field.value;
        break;
      case "FU":
        current.previousDateOfFill = field.value;
        break;
      case "FV":
        current.quantityOfPreviousFill = field.value;
        break;
      case "FY":
        current.freeText = field.value;
        break;
      default:
        break;
    }
  }
  flush();
  return Object.freeze(alerts);
}

/**
 * The full adjudication view over a parsed response: the per-claim status (with
 * its fail-safe disposition), the adjudicated pricing, and every DUR alert.
 */
export interface TelecomAdjudication {
  /** Transaction Code (103-A3) echoed by the response, e.g. `"B1"`/`"E1"`. */
  readonly transactionCode: string;
  /** The Response Status (21) view, when present. */
  readonly status?: TelecomResponseStatus;
  /** The Response Pricing (23) view, when present. */
  readonly pricing?: TelecomPricing;
  /** Every returned DUR alert (24), in wire order — never dropped. */
  readonly dur: readonly TelecomDurAlert[];
}

/**
 * Build the bundled {@link TelecomAdjudication} view over a parsed Telecom
 * **response** transmission. Returns `undefined` when the transaction is not a
 * response (no response header) or carries no segments.
 *
 * @param transaction - A transaction from {@link parseTelecom}.
 * @returns The adjudication view, or `undefined` for a non-response.
 *
 * @example
 * ```ts
 * const a = adjudication(parseTelecom(rawResponse));
 * a?.status?.disposition;             // "paid" | "rejected" | …
 * a?.pricing?.patientPayAmount?.amount; // "10.00"
 * a?.dur.length;                      // returned DUR alert count
 * ```
 */
export function adjudication(transaction: TelecomTransaction): TelecomAdjudication | undefined {
  if (transaction.kind !== "response" || transaction.segments.length === 0) return undefined;
  const out: Mutable<TelecomAdjudication> = {
    transactionCode: transaction.header.transactionCode,
    dur: responseDur(transaction),
  };
  const status = responseStatus(transaction);
  if (status !== undefined) out.status = status;
  const pricing = responsePricing(transaction);
  if (pricing !== undefined) out.pricing = pricing;
  return Object.freeze(out);
}

/**
 * Emit the response safety warnings into a parse-time sink: an unknown reject
 * code, an unrecognized status, and the paid-with-rejects conflict. Pure with
 * respect to the segments; called by {@link parseTelecom} on the response path so
 * these signals live on `transaction.warnings` rather than only in a derived view.
 *
 * @param segments - The decoded response segments.
 * @param warnings - The parse warning sink.
 *
 * @example
 * ```ts
 * const warnings: NcpdpTelecomWarning[] = [];
 * collectResponseWarnings(segments, warnings);
 * warnings.map((w) => w.code); // e.g. ["NCPDP_TELECOM_STATUS_CONFLICT"]
 * ```
 */
export function collectResponseWarnings(
  segments: readonly TelecomSegment[],
  warnings: NcpdpTelecomWarning[],
): void {
  const seg = findSegment(segments, "21");
  if (seg === undefined) return;

  const statusCode = fieldValue(seg, "AN") ?? "";
  const rejectValues = fieldValues(seg, "FB");
  const hasRejects = rejectValues.length > 0 || countDeclared(fieldValue(seg, "FA"));
  const at = telecomPosition(seg.byteOffset, "AN");

  if (statusCode !== "" && !RESPONSE_STATUS_MEANINGS.has(statusCode)) {
    warnings.push(
      telecomWarning(
        TELECOM_WARNING_CODES.UNKNOWN_RESPONSE_STATUS,
        "Transaction Response Status is not modeled this phase; preserved verbatim, disposition reads unknown (never paid).",
        at,
      ),
    );
  }

  for (const code of rejectValues) {
    if (!REJECT_CODE_MEANINGS.has(code)) {
      warnings.push(
        telecomWarning(
          TELECOM_WARNING_CODES.UNKNOWN_REJECT_CODE,
          "Reject Code is not recognized this phase; preserved verbatim with known:false, never dropped.",
          telecomPosition(seg.byteOffset, "FB"),
        ),
      );
    }
  }

  const { conflict } = combineDisposition(statusCode, hasRejects);
  if (conflict) {
    warnings.push(
      telecomWarning(
        TELECOM_WARNING_CODES.STATUS_CONFLICT,
        "Response declared a positive status while carrying reject codes; disposition resolved to rejected (a reject always wins).",
        at,
      ),
    );
  }
}
