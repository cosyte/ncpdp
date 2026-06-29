/**
 * The labeler/product/package segmentation hint for an NDC. Real-world NDCs
 * arrive in several digit groupings; we surface the detected shape rather than
 * forcing a normalization the consumer may not want.
 */
export type NdcSegmentation =
  | "5-4-2"
  | "5-4-1"
  | "5-3-2"
  | "4-4-2"
  | "11-digit"
  | "10-digit"
  | "unknown";

/**
 * A National Drug Code preserved verbatim, with a best-effort segmentation hint.
 * We do not rewrite or zero-pad the value — the original is authoritative.
 */
export interface NdcValue {
  /** The NDC exactly as it appeared, including any hyphens. */
  readonly value: string;
  /** Best-effort segmentation classification of {@link value}. */
  readonly segmentation: NdcSegmentation;
}

/**
 * Classify an NDC string into a {@link NdcSegmentation} hint. Hyphenated forms
 * are matched by their digit groups; bare digit strings are classified by total
 * length. Anything else is `"unknown"`.
 *
 * @param raw - The NDC value as it appeared on the wire.
 * @returns A frozen {@link NdcValue}.
 *
 * @example
 * ```ts
 * ndcValue("0002-8215-01").segmentation; // "4-4-2"
 * ndcValue("00002821501").segmentation;  // "11-digit"
 * ```
 */
export function ndcValue(raw: string): NdcValue {
  return Object.freeze({ value: raw, segmentation: classify(raw) });
}

function classify(raw: string): NdcSegmentation {
  const m = /^(\d+)-(\d+)-(\d+)$/.exec(raw);
  if (m && m[1] && m[2] && m[3]) {
    const shape = `${m[1].length}-${m[2].length}-${m[3].length}`;
    switch (shape) {
      case "5-4-2":
        return "5-4-2";
      case "5-4-1":
        return "5-4-1";
      case "5-3-2":
        return "5-3-2";
      case "4-4-2":
        return "4-4-2";
      default:
        return "unknown";
    }
  }
  if (/^\d{11}$/.test(raw)) return "11-digit";
  if (/^\d{10}$/.test(raw)) return "10-digit";
  return "unknown";
}
