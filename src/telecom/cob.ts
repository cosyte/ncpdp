/**
 * NCPDP Telecommunication vD.0 Coordination-of-Benefits reads.
 *
 * Two segments carry the COB chain:
 *
 *  - **Request COB / Other Payments (segment 05)** — what the pharmacy tells this
 *    payer about money other payers already paid: one block per other payer, each
 *    carrying Other Payer Amount Paid and Other Payer-Patient Responsibility rows.
 *  - **Response COB / Other Payers (segment 28)** — who the payer says to bill
 *    next: one block per other payer with its routing identifiers.
 *
 * The safety invariant is that **every other-payer block and every money row is
 * surfaced, none dropped or merged** — a mis-read COB chain mis-posts
 * secondary-payer money. Each payer block repeats on the Other Payer Coverage
 * Type (338-5C); within a block, amount rows pair a qualifier with an amount in
 * wire order. Money is decimal-safe (never float) via {@link telecomMoney}.
 */

import { telecomMoney, type TelecomMoney } from "./money.js";
import { telecomPosition } from "./position.js";
import { findSegment, fieldValue, type TelecomField, type TelecomSegment } from "./tokenize.js";
import { telecomWarning, TELECOM_WARNING_CODES, type NcpdpTelecomWarning } from "./warnings.js";
import type { TelecomTransaction } from "./parse.js";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Request COB segment id (05). */
const REQUEST_COB_SEGMENT = "05";
/** Response COB segment id (28). */
const RESPONSE_COB_SEGMENT = "28";

/** Other Payer Coverage Type (338-5C) — the per-payer block anchor. */
const F_COVERAGE_TYPE = "5C";
/** Other Payer ID Qualifier (339-6C). */
const F_PAYER_ID_QUALIFIER = "6C";
/** Other Payer ID (340-7C). */
const F_PAYER_ID = "7C";
/** Other Payer Date (443-E8). */
const F_PAYER_DATE = "E8";
/** Other Payer Amount Paid Qualifier (342-HC). */
const F_AMOUNT_PAID_QUALIFIER = "HC";
/** Other Payer Amount Paid (431-DV) — money. */
const F_AMOUNT_PAID = "DV";
/** Other Payer-Patient Responsibility Amount Qualifier (472-6E). */
const F_PATIENT_RESP_QUALIFIER = "6E";
/** Other Payer-Patient Responsibility Amount (473-7E) — money. */
const F_PATIENT_RESP_AMOUNT = "7E";
/** Coordination Of Benefits/Other Payments Count (337-4C), request side. */
const F_OTHER_PAYMENT_COUNT = "4C";
/** Other Payer Processor Control Number (991-MH), response side. */
const F_PROCESSOR_CONTROL_NUMBER = "MH";
/** Other Payer Cardholder ID (356-NU), response side. PHI. */
const F_OTHER_CARDHOLDER_ID = "NU";
/** Other Payer Group ID (992-MJ), response side. */
const F_OTHER_GROUP_ID = "MJ";
/** Other Payer ID Count (355-NT), response side. */
const F_OTHER_PAYER_ID_COUNT = "NT";

/** A single other-payer money row: a verbatim qualifier and a decimal-safe amount. */
export interface TelecomOtherPayerAmount {
  /** The amount qualifier (e.g. 342-HC / 472-6E), verbatim, when present. */
  readonly qualifier?: string;
  /** The amount, decimal-safe (never float). */
  readonly amount: TelecomMoney;
}

/**
 * One other-payer block from the **request** COB / Other Payments segment (05):
 * who the other payer is and what they paid / left as patient responsibility.
 * Every money row is preserved in wire order — none dropped.
 */
export interface TelecomOtherPayer {
  /** Other Payer Coverage Type (338-5C), verbatim, when present. */
  readonly coverageType?: string;
  /** Other Payer ID Qualifier (339-6C), verbatim, when present. */
  readonly payerIdQualifier?: string;
  /** Other Payer ID (340-7C), verbatim, when present. */
  readonly payerId?: string;
  /** Other Payer Date (443-E8), verbatim, when present. */
  readonly payerDate?: string;
  /** Every Other Payer Amount Paid (431-DV) row, in wire order — none dropped. */
  readonly amountsPaid: readonly TelecomOtherPayerAmount[];
  /** Every Other Payer-Patient Responsibility (473-7E) row, in wire order. */
  readonly patientResponsibilityAmounts: readonly TelecomOtherPayerAmount[];
}

/**
 * One other-payer block from the **response** COB / Other Payers segment (28):
 * the routing identifiers the payer says to use when billing the next payer.
 */
export interface TelecomResponseOtherPayer {
  /** Other Payer Coverage Type (338-5C), verbatim, when present. */
  readonly coverageType?: string;
  /** Other Payer ID Qualifier (339-6C), verbatim, when present. */
  readonly payerIdQualifier?: string;
  /** Other Payer ID (340-7C), verbatim, when present. */
  readonly payerId?: string;
  /** Other Payer Processor Control Number (991-MH), verbatim, when present. */
  readonly processorControlNumber?: string;
  /** Other Payer Cardholder ID (356-NU), verbatim, when present. PHI. */
  readonly cardholderId?: string;
  /** Other Payer Group ID (992-MJ), verbatim, when present. */
  readonly groupId?: string;
}

/** Pair amount qualifiers with amounts in wire order: a qualifier applies to the next amount. */
function readAmountRows(
  fields: readonly TelecomField[],
  qualifierId: string,
  amountId: string,
): readonly TelecomOtherPayerAmount[] {
  const rows: TelecomOtherPayerAmount[] = [];
  let pendingQualifier: string | undefined;
  for (const field of fields) {
    if (field.id === qualifierId) {
      pendingQualifier = field.value;
    } else if (field.id === amountId) {
      const row: Mutable<TelecomOtherPayerAmount> = { amount: telecomMoney(field.value) };
      if (pendingQualifier !== undefined) row.qualifier = pendingQualifier;
      rows.push(Object.freeze(row));
      pendingQualifier = undefined;
    }
  }
  return Object.freeze(rows);
}

/**
 * Split a COB segment's fields into per-other-payer blocks at each Other Payer
 * Coverage Type (338-5C). The segment-level other-payer count (`countFieldId`,
 * 337-4C on the request / 355-NT on the response) is metadata, not payer data, so
 * it is skipped rather than seeding a spurious leading block. Any *other* fields
 * before the first coverage type still form a block (some senders omit the leading
 * coverage type), so no payer data is lost.
 */
function splitPayerBlocks(
  seg: TelecomSegment,
  countFieldId: string,
): readonly (readonly TelecomField[])[] {
  const blocks: TelecomField[][] = [];
  let current: TelecomField[] | undefined;
  for (const field of seg.fields) {
    if (field.id === countFieldId) continue;
    if (field.id === F_COVERAGE_TYPE || current === undefined) {
      current = [];
      blocks.push(current);
    }
    current.push(field);
  }
  return blocks;
}

/**
 * Build the **request** COB / Other Payments (05) view: every other-payer block
 * with its amount-paid and patient-responsibility money rows. Returns an empty
 * array when no segment 05 is present. No block and no money row is ever dropped.
 *
 * @param transaction - A transaction from {@link parseTelecom}.
 * @returns Every other-payer block, in wire order.
 *
 * @example
 * ```ts
 * const payers = cobOtherPayments(parseTelecom(rawSecondaryClaim));
 * payers[0]?.amountsPaid[0]?.amount.amount; // first other payer's paid amount
 * ```
 */
export function cobOtherPayments(transaction: TelecomTransaction): readonly TelecomOtherPayer[] {
  const seg = findSegment(transaction.segments, REQUEST_COB_SEGMENT);
  if (seg === undefined) return Object.freeze([]);

  const payers = splitPayerBlocks(seg, F_OTHER_PAYMENT_COUNT).map((fields) => {
    const out: Mutable<TelecomOtherPayer> = {
      amountsPaid: readAmountRows(fields, F_AMOUNT_PAID_QUALIFIER, F_AMOUNT_PAID),
      patientResponsibilityAmounts: readAmountRows(
        fields,
        F_PATIENT_RESP_QUALIFIER,
        F_PATIENT_RESP_AMOUNT,
      ),
    };
    assignFirst(out, "coverageType", fields, F_COVERAGE_TYPE);
    assignFirst(out, "payerIdQualifier", fields, F_PAYER_ID_QUALIFIER);
    assignFirst(out, "payerId", fields, F_PAYER_ID);
    assignFirst(out, "payerDate", fields, F_PAYER_DATE);
    return Object.freeze(out);
  });
  return Object.freeze(payers);
}

/**
 * Build the **response** COB / Other Payers (28) view: every other-payer routing
 * block the payer returned. Returns an empty array when no segment 28 is present.
 * No block is dropped.
 *
 * @param transaction - A transaction from {@link parseTelecom}.
 * @returns Every response other-payer block, in wire order.
 *
 * @example
 * ```ts
 * const next = responseCob(parseTelecom(rawResponse));
 * next[0]?.payerId; // the next payer to bill
 * ```
 */
export function responseCob(transaction: TelecomTransaction): readonly TelecomResponseOtherPayer[] {
  const seg = findSegment(transaction.segments, RESPONSE_COB_SEGMENT);
  if (seg === undefined) return Object.freeze([]);

  const payers = splitPayerBlocks(seg, F_OTHER_PAYER_ID_COUNT).map((fields) => {
    const out: Mutable<TelecomResponseOtherPayer> = {};
    assignFirst(out, "coverageType", fields, F_COVERAGE_TYPE);
    assignFirst(out, "payerIdQualifier", fields, F_PAYER_ID_QUALIFIER);
    assignFirst(out, "payerId", fields, F_PAYER_ID);
    assignFirst(out, "processorControlNumber", fields, F_PROCESSOR_CONTROL_NUMBER);
    assignFirst(out, "cardholderId", fields, F_OTHER_CARDHOLDER_ID);
    assignFirst(out, "groupId", fields, F_OTHER_GROUP_ID);
    return Object.freeze(out);
  });
  return Object.freeze(payers);
}

function assignFirst<T extends object>(
  out: Mutable<T>,
  key: keyof T,
  fields: readonly TelecomField[],
  fieldId: string,
): void {
  const value = fields.find((f) => f.id === fieldId)?.value;
  if (value !== undefined) out[key] = value as T[keyof T];
}

function checkCobCount(
  seg: TelecomSegment | undefined,
  countFieldId: string,
  warnings: NcpdpTelecomWarning[],
): void {
  if (seg === undefined) return;
  const declaredRaw = fieldValue(seg, countFieldId);
  if (declaredRaw === undefined) return;
  const declared = Number.parseInt(declaredRaw, 10);
  if (!Number.isFinite(declared)) return;

  const actual = splitPayerBlocks(seg, countFieldId).length;
  if (declared !== actual) {
    warnings.push(
      telecomWarning(
        TELECOM_WARNING_CODES.COB_COUNT_MISMATCH,
        `Coordination-of-benefits declared ${declared} other-payer block(s) but ${actual} were decoded; all decoded blocks are preserved verbatim.`,
        telecomPosition(seg.byteOffset, countFieldId),
      ),
    );
  }
}

/**
 * Raise `NCPDP_TELECOM_COB_COUNT_MISMATCH` when a COB segment declares an
 * other-payer count (337-4C on the request 05, 355-NT on the response 28) that
 * disagrees with the number of decoded other-payer blocks. Checks whichever COB
 * segment(s) are present; safe to call on either parse path. No block is dropped.
 *
 * @param segments - The decoded segments.
 * @param warnings - The parse warning sink.
 *
 * @example
 * ```ts
 * const warnings: NcpdpTelecomWarning[] = [];
 * collectCobWarnings(transaction.segments, warnings);
 * ```
 */
export function collectCobWarnings(
  segments: readonly TelecomSegment[],
  warnings: NcpdpTelecomWarning[],
): void {
  checkCobCount(findSegment(segments, REQUEST_COB_SEGMENT), F_OTHER_PAYMENT_COUNT, warnings);
  checkCobCount(findSegment(segments, RESPONSE_COB_SEGMENT), F_OTHER_PAYER_ID_COUNT, warnings);
}
