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
 *     field claims paid: a consumer is never told a rejected claim was paid. An
 *     unrecognized status reads `"unknown"`, never paid.
 *  2. **No DUR alert is dropped.** The Response DUR/PPS segment repeats one set
 *     of fields per returned alert; every occurrence is surfaced, none collapsed.
 *
 * Money is preserved verbatim and interpreted string-wise (never float) via
 * {@link telecomMoney}. Reject and DUR codes are surfaced verbatim with a
 * recognition flag. A label ships only where a public artifact establishes it and
 * that artifact is cited in source beside the table; where none could be obtained
 * the code comes back verbatim with the flag false and no description. See
 * `KNOWN-LIMITATIONS.md` for which of these fields has a table at all.
 */

import { telecomMoney, type TelecomMoney } from "./money.js";
import { telecomPosition } from "./position.js";
import { findSegment, fieldValue, fieldValues, type TelecomSegment } from "./tokenize.js";
import { telecomWarning, TELECOM_WARNING_CODES, type NcpdpTelecomWarning } from "./warnings.js";
import type { TelecomTransaction } from "./parse.js";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * The fail-safe adjudication disposition. Derived from the Transaction Response
 * Status and the reject codes together: never from the status field alone.
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
}

/**
 * Fail-safe {@link Disposition} for each Transaction Response Status (112-AN) value
 * this parser models. A value outside this set reads `"unknown"` and is preserved
 * verbatim. This map carries **no** human-readable description: the package ships
 * no label table for 112-AN, because no public artifact establishing one could be
 * obtained. See `KNOWN-LIMITATIONS.md`.
 *
 * @example
 * ```ts
 * import { RESPONSE_STATUS_MEANINGS } from "@cosyte/ncpdp/telecom";
 * RESPONSE_STATUS_MEANINGS.get("P")?.disposition; // "paid"
 * RESPONSE_STATUS_MEANINGS.get("R")?.disposition; // "rejected"
 * ```
 */
// vocab-provenance: not-a-label-table field=112-AN
//   closed-vocabulary=paid|captured|approved|duplicate|deferred|rejected|unknown
// WHAT THIS MAP IS. A status code to fail-safe DISPOSITION mapping. The disposition
// tokens are a closed control vocabulary this library owns, not human-readable labels
// read out of a document, so this declaration is not a code-to-label table and does not
// carry a source. `test/telecom/vocab-provenance.test.ts` asserts that every string in
// this declaration is one of the tokens named above, so re-adding a `description` here
// fails the test run rather than quietly shipping an unsourced label again.
//
// vocab-withdrawn: field=112-AN
// The seven human-readable descriptions this map used to carry ("Paid", "Captured",
// "Duplicate of Paid" and so on) are WITHDRAWN as of 2026-08-25. NO PUBLIC ARTIFACT
// COULD BE OBTAINED that establishes the 112-AN value set. The NCPDP External Code List
// is a purchased product this package cannot cite, and the one artifact carried for this
// change (the eMedNY manual cited on the 439-E4 table below) states only that NY Medicaid
// returns "C" for a captured claim and "R" for a rejected one: that corroborates two
// dispositions for one payer, establishes nothing about the other five values, and is not
// normative for the standard in any case.
//
// THE FAIL-SAFE THAT CONTAINS THE GAP, unchanged by the withdrawal: the disposition is a
// total function over the status AND the reject codes together (see combineDisposition).
// A reject always wins; a status outside this map reads "unknown" and never "paid". The
// label was a display string, and losing it costs nothing on the adjudication path.
export const RESPONSE_STATUS_MEANINGS: ReadonlyMap<string, StatusMeaning> = new Map([
  ["P", { disposition: "paid" }],
  ["C", { disposition: "captured" }],
  ["A", { disposition: "approved" }],
  ["D", { disposition: "duplicate" }],
  ["Q", { disposition: "duplicate" }],
  ["F", { disposition: "deferred" }],
  ["R", { disposition: "rejected" }],
]);

// vocab-withdrawn: field=511-FB
// The eleven Reject Code labels this module used to export as REJECT_CODE_MEANINGS
// ("Prior Authorization Required" for 75, "Refill Too Soon" for 79, and nine more) are
// WITHDRAWN as of 2026-08-25, and the export is gone with them. NO PUBLIC ARTIFACT COULD
// BE OBTAINED that establishes any of them. The NCPDP External Code List, which is the
// normative source for 511-FB, is a purchased product. The payer manual carried for this
// change (cited on the 439-E4 table below) has an "NCPDP REJECT CODES" heading with no
// list under it and states only two reject codes in prose, 13 and 83, neither of which
// this package shipped a label for. Other payer publications that carry a reject list
// were located but could not be opened by anything in this pipeline, and an artifact
// nobody can read establishes nothing.
//
// THE FAIL-SAFE THAT CONTAINS THE GAP: the verbatim-code path was always the fail-safe
// here and is untouched. Every 511-FB value is still surfaced exactly as it appeared on
// the wire, still in wire order, still never dropped, and still carries the `known` flag;
// the flag now reads false for every code and the description is absent. A reject still
// always wins, so the disposition a consumer acts on does not depend on this table and
// never did. Consumers that need reject text bring their own mapping, which is the same
// posture 440-E5 and 441-E6 have always had.

/**
 * Short labels for the DUR Reason For Service codes (439-E4) that a public artifact
 * establishes. A code outside this set is preserved verbatim with `known: false`
 * and no description: absence of a label never means the code is invalid.
 *
 * The establishing artifact, its retrieval date and the single-source caveat that
 * travels with it are recorded in source immediately above this declaration, and
 * summarized for consumers in `KNOWN-LIMITATIONS.md`. Read the caveat before
 * relying on a label: it is corroborated by one state Medicaid payer manual, which
 * is not the NCPDP External Code List.
 *
 * @example
 * ```ts
 * import { DUR_REASON_MEANINGS } from "@cosyte/ncpdp/telecom";
 * DUR_REASON_MEANINGS.get("DD"); // "Drug-Drug Interaction"
 * DUR_REASON_MEANINGS.get("MC"); // undefined: kept verbatim with known: false
 * ```
 */
// vocab-provenance: label-table field=439-E4 single-source=true
// artifact: "ProDUR/ECCA Provider Manual", version 1.30, revision date 2010-02-12,
//   published by the New York State Department of Health eMedNY program, at
//   emedny.org/ProviderManuals/Pharmacy/. Carried into this change as a file rather
//   than cited as a bare URL, so the bytes the labels were derived from are pinned.
// retrieved: 2026-08-25
// sha256: 2f0720cf60cad67b31aeaf924c45bb42d8bcb54b95691379a4245666b11be9dd
//   (1520729 bytes, windows-1252 Word HTML; read it with `grep -a` or the tooling
//   treats it as binary and silently returns nothing)
// method: the manual's "Drug Conflict Code (439-E4)" section states the values that may
//   be returned, one "<code> = <phrase>" line per value. Those lines were read off that
//   section directly and each label written as a short paraphrase of the phrase on its
//   line. The labels were DELIBERATELY NOT copied forward from this table's previous
//   contents: five of the seven below changed as a result (ER, HD, LD, PG and PA), which
//   is the evidence the derivation ran against the document and not against the code. ER
//   is the divergence that mattered: this table used to read "Early Refill", and the
//   artifact states a drug-overuse alert, so the label now agrees with the artifact.
//   A code the manual states but this package does not decode (DC) is NOT added here:
//   adding a code flips a recognition flag from false to true and is a separate decision
//   with its own consumers.
// negative-control: the same extraction was re-run for the three codes this table used to
//   carry and no longer does. It finds "<code> = <phrase>" lines for TD, DD, DC, PG, PA,
//   LD and HD and finds no such line for ID, LR or MC; MC and LR do not occur anywhere in
//   the file at all, at any position, in any casing. So a miss here is a real absence in
//   the artifact rather than a broken reader: the pass that misses those three is the same
//   pass that hits the seven that ship.
// caveat: SINGLE-SOURCE, and it is a claim about one payer, not about the standard. A
//   state Medicaid payer manual is normative for what THAT payer returns in 439-E4. It is
//   not the NCPDP External Code List, which no artifact available here can stand in for.
//   Treat every label below as corroborated once, by one payer, in a 2010 document.
export const DUR_REASON_MEANINGS: ReadonlyMap<string, string> = new Map([
  ["TD", "Therapeutic Duplication"],
  ["ER", "Drug Overuse Alert"],
  ["DD", "Drug-Drug Interaction"],
  ["PG", "Drug Pregnancy Alert"],
  ["PA", "Drug Age Precaution"],
  ["LD", "Low Dose Alert"],
  ["HD", "High Dose Alert"],
]);

/** A reject code (511-FB) surfaced verbatim with a recognition flag. */
export interface TelecomRejectCode {
  /** The reject code exactly as it appeared on the wire. */
  readonly code: string;
  /**
   * Whether this package recognizes {@link code}. Currently `false` for every
   * reject code: no public artifact establishing a 511-FB label could be obtained,
   * so the package ships no table to recognize a code against. The flag is kept on
   * every occurrence so the shape a consumer reads does not change.
   */
  readonly known: boolean;
}

/**
 * The Response Status (21) view: the adjudication outcome with its fail-safe
 * {@link disposition}, the verbatim reject codes (never dropped), and the
 * authorization number when paid.
 */
export interface TelecomResponseStatus {
  /** Transaction Response Status (112-AN), verbatim. */
  readonly transactionResponseStatus: string;
  /**
   * The fail-safe disposition over status **and** reject codes. `"rejected"`
   * whenever any reject is present, regardless of the status field; `"unknown"`
   * for an unrecognized status: never silently `"paid"`.
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
  /** Every Reject Code (511-FB) returned, in wire order: none dropped. */
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
  /** Reason For Service Code (439-E4), verbatim: the alert type. */
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

// No 511-FB label table ships (see the withdrawal record above), so nothing recognizes a
// reject code and `known` is false for all of them. The flag is computed rather than
// hard-coded so that a future sourced table restores recognition here and nowhere else.
function isKnownRejectCode(_code: string): boolean {
  return false;
}

function rejectCode(code: string): TelecomRejectCode {
  return Object.freeze({ code, known: isKnownRejectCode(code) });
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
  /** Every returned DUR alert (24), in wire order: never dropped. */
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
 * Emit the response safety warnings into a parse-time sink: an unrecognized reject
 * code, an unrecognized status, and the paid-with-rejects conflict. Pure with
 * respect to the segments; called by {@link parseTelecom} on the response path so
 * these signals live on `transaction.warnings` rather than only in a derived view.
 *
 * Because the package ships no 511-FB label table, **every** reject code present is
 * unrecognized and raises the unknown-reject warning: one per code, position only,
 * never the code value itself.
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
    warnings.push(telecomWarning(TELECOM_WARNING_CODES.UNKNOWN_RESPONSE_STATUS, at));
  }

  for (const code of rejectValues) {
    if (!isKnownRejectCode(code)) {
      warnings.push(
        telecomWarning(
          TELECOM_WARNING_CODES.UNKNOWN_REJECT_CODE,
          telecomPosition(seg.byteOffset, "FB"),
        ),
      );
    }
  }

  const { conflict } = combineDisposition(statusCode, hasRejects);
  if (conflict) {
    warnings.push(telecomWarning(TELECOM_WARNING_CODES.STATUS_CONFLICT, at));
  }
}
