import type { TelecomTransaction } from "./parse.js";
import type { TelecomSegment } from "./tokenize.js";

/**
 * The first segment with Segment Identification `code` that transaction `index`
 * reads inside a parsed transmission.
 *
 * Every view over a Telecom transmission (the B1 request view, the adjudication
 * views, compound, coordination of benefits, DUR, prior authorization) reads one
 * transaction's segments, and a transmission may carry several. This is the one
 * place that turns an index into a segment, so all of them address transaction
 * N the same way and none of them can quietly answer about a different one.
 *
 * A transaction reads its own segments, then the transmission's
 * `transmissionSegments` (Patient and Insurance, for example), which every
 * transaction shares. Own segments are searched first, so a view takes the
 * transaction's own segment over a shared one with the same Segment
 * Identification. Neither list is copied to search them.
 *
 * Out-of-range and negative indexes read as no segment rather than throwing, in
 * keeping with the lenient contract: a view over a transaction that is not there
 * is empty or `undefined`, never an exception. The shared segments are not read
 * for a transaction that is not there.
 *
 * @param transaction - A transmission from `parseTelecom` or `buildTelecomRequest`.
 * @param index - Zero-based transaction index.
 * @param code - The 2-character Segment Identification code, e.g. `"07"`.
 * @returns The first matching segment, or `undefined`.
 *
 * @example
 * ```ts
 * transactionSegment(parsed, 1, "07")?.byteOffset; // the second transaction's Claim segment
 * ```
 */
export function transactionSegment(
  transaction: TelecomTransaction,
  index: number,
  code: string,
): TelecomSegment | undefined {
  const own = transaction.transactions[index]?.segments;
  if (own === undefined) return undefined;
  return findIn(own, code) ?? findIn(transaction.transmissionSegments, code);
}

/**
 * How many segments transaction `index` reads, its own and the shared ones,
 * counted without building the list.
 *
 * @param transaction - A transmission from `parseTelecom` or `buildTelecomRequest`.
 * @param index - Zero-based transaction index.
 * @returns The segment count, 0 for a transaction that is not there.
 *
 * @example
 * ```ts
 * transactionSegmentCount(parsed, 0); // 4 for two own segments and two shared ones
 * ```
 */
export function transactionSegmentCount(transaction: TelecomTransaction, index: number): number {
  const own = transaction.transactions[index]?.segments;
  return own === undefined ? 0 : own.length + transaction.transmissionSegments.length;
}

function findIn(segments: readonly TelecomSegment[], code: string): TelecomSegment | undefined {
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i] as TelecomSegment;
    if (segment.segmentId === code) return segment;
  }
  return undefined;
}
