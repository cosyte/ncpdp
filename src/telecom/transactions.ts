import type { TelecomTransaction } from "./parse.js";
import type { TelecomSegment } from "./tokenize.js";

const NO_SEGMENTS: readonly TelecomSegment[] = Object.freeze([]);

/**
 * Resolve the segments of one decoded transaction inside a parsed transmission.
 *
 * Every view over a Telecom transmission (the B1 request view, the adjudication
 * views, compound, coordination of benefits, DUR, prior authorization) reads one
 * transaction's segments, and a transmission may carry several. This is the one
 * place that turns an index into a segment list, so all of them address
 * transaction N the same way and none of them can quietly answer about a
 * different one.
 *
 * Out-of-range and negative indexes read as an empty segment list rather than
 * throwing, in keeping with the lenient contract: a view over a transaction that
 * is not there is empty or `undefined`, never an exception.
 *
 * @param transaction - A transmission from `parseTelecom` or `buildTelecomRequest`.
 * @param index - Zero-based transaction index; defaults to the first.
 * @returns That transaction's segments in wire order, or an empty list.
 *
 * @example
 * ```ts
 * transactionSegments(parsed);    // the first transaction's segments
 * transactionSegments(parsed, 2); // the third transaction's segments
 * ```
 */
export function transactionSegments(
  transaction: TelecomTransaction,
  index = 0,
): readonly TelecomSegment[] {
  return transaction.transactions[index]?.segments ?? NO_SEGMENTS;
}
