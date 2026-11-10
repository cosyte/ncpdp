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
 * The list is that transaction's own segments followed by the transmission's
 * `transmissionSegments` (Patient and Insurance, for example), which every
 * transaction shares. Own segments come first so a view's first-match read takes
 * the transaction's own segment over a shared one with the same Segment
 * Identification.
 *
 * Out-of-range and negative indexes read as an empty segment list rather than
 * throwing, in keeping with the lenient contract: a view over a transaction that
 * is not there is empty or `undefined`, never an exception. The shared segments
 * are not returned for a transaction that is not there.
 *
 * @param transaction - A transmission from `parseTelecom` or `buildTelecomRequest`.
 * @param index - Zero-based transaction index; defaults to the first.
 * @returns That transaction's segments, then the shared ones, or an empty list.
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
  const own = transaction.transactions[index]?.segments;
  if (own === undefined) return NO_SEGMENTS;
  const shared = transaction.transmissionSegments;
  return shared.length === 0 ? own : [...own, ...shared];
}
