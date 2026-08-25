/**
 * The Segment Identification (111-AM) inventory this package publishes: the code
 * ranges it declares, and one record per code inside a declared range that carries
 * no name in `SEGMENT_NAMES`.
 *
 * WHY THIS MODULE EXISTS. `SEGMENT_NAMES` used to declare two ranges in a source
 * comment and fill neither of them, so a consumer meeting `06` could not tell
 * "no such segment exists" from "this library did not model it" from "nobody has
 * read an artifact that would settle it". A hole is now a published record with a
 * reason attached, and a test fails when a code inside a declared range is neither
 * named nor recorded. Nothing here changes how a segment decodes: an unnamed code
 * is preserved verbatim with the unknown-segment warning, exactly as before.
 */

/**
 * Which half of a transmission a declared 111-AM code range covers. Both tokens
 * are this package's own vocabulary, not a decoded label.
 */
export type SegmentGroup = "request" | "response";

/**
 * Why a code inside a declared 111-AM range carries no name in this package.
 *
 * `"unsourced"`: no publicly readable artifact establishes what the standard
 * defines at this code, so the package neither names it nor claims that nothing
 * exists there. The normative vocabulary is the NCPDP External Code List, a
 * purchased product this package can neither cite nor redistribute. A transmission
 * carrying such a code is still decoded in full and warned, never dropped.
 */
export type SegmentAbsenceReason = "unsourced";

/**
 * A run of 111-AM codes this package declares that it covers, and whether an
 * artifact fixes the bounds.
 */
export interface SegmentCodeRange {
  /** The half of the transmission this range covers. */
  readonly group: SegmentGroup;
  /** First code in the range, 2 characters. */
  readonly first: string;
  /** Last code in the range, 2 characters, inclusive. */
  readonly last: string;
  /**
   * Whether a publicly readable artifact establishes these bounds. `false` on
   * every range declared today: the bounds are this package's own working
   * assumption, carried forward from an unsourced source comment, and are NOT
   * presented as a fact about the standard.
   */
  readonly boundsVerified: boolean;
}

/** The published accounting for one unnamed code inside a declared range. */
export interface SegmentAbsence {
  /** Why this code carries no name here. */
  readonly reason: SegmentAbsenceReason;
}

/**
 * The 111-AM code ranges this package declares. Neither range's bounds are
 * established by any artifact this package can cite (`boundsVerified` is `false`
 * on both), so read them as the extent of this package's own claim of coverage
 * and not as the extent of the standard.
 *
 * Every code inside a declared range is either named by `SEGMENT_NAMES` or carries
 * a `SEGMENT_ABSENCES` record; `test/telecom/segment-inventory.test.ts` fails when
 * one is neither.
 *
 * @example
 * ```ts
 * import { SEGMENT_CODE_RANGES } from "@cosyte/ncpdp/telecom";
 * SEGMENT_CODE_RANGES[0]?.group; // "request"
 * SEGMENT_CODE_RANGES.every((r) => r.boundsVerified); // false: nothing sources them
 * ```
 */
export const SEGMENT_CODE_RANGES: readonly SegmentCodeRange[] = [
  // The bounds below are the ones this file's own comments have asserted since the
  // ranges were first written down, with no artifact behind either of them. They are
  // published with boundsVerified false rather than narrowed to the codes actually
  // named, because a consumer reading a `14` off a wire is better served by "inside
  // the range we claim, and unnamed for this reason" than by silence. Flipping one to
  // true means writing a `segment-range-source:` record beside this declaration, in
  // the shape the vocabulary tables use; the inventory test fails a range that claims
  // to be verified without one.
  { group: "request", first: "01", last: "16", boundsVerified: false },
  { group: "response", first: "20", last: "28", boundsVerified: false },
];

/**
 * Why each unnamed code inside a declared range has no name here, keyed by the
 * 2-character 111-AM code. A code that is absent from this map and from
 * `SEGMENT_NAMES` is simply outside every range this package declares (`99`, say):
 * it decodes identically, and the inventory makes no claim about it either way.
 *
 * Absence of a name is never absence of data. The segment and every one of its
 * fields survive verbatim, in wire order, with `NCPDP_TELECOM_UNKNOWN_SEGMENT`.
 *
 * @example
 * ```ts
 * import { SEGMENT_ABSENCES } from "@cosyte/ncpdp/telecom";
 * SEGMENT_ABSENCES.get("06")?.reason; // "unsourced"
 * SEGMENT_ABSENCES.get("07"); // undefined: 07 is named
 * ```
 */
// vocab-provenance: not-a-label-table field=111-AM closed-vocabulary=unsourced
// WHAT THIS MAP IS. A code to REASON mapping, where the reason tokens are a closed
// control vocabulary this library owns rather than human-readable labels read out of
// a document. It is not a code-to-label table and carries no source, and the
// enumeration in test/telecom/vocab-provenance.test.ts asserts that every string in
// this declaration is one of the tokens named above, so a segment name cannot be
// smuggled in here under a field called something else.
//
// WHY EVERY REASON IS THE SAME TOKEN TODAY. What fixes the vD.0 segment inventory is
// an open research question in this package's roadmap: the Implementation Guide and
// the External Code List are purchased products, and no public artifact reached so
// far names a segment at 06, 09, 14, 15, 16 or 27, or establishes that none exists.
// So the honest record for all six is the same one, and inventing a name for any of
// them on a PHI-carrying claim surface is precisely the confident wrong answer this
// package's fail-safe posture exists to prevent. A future artifact moves a code into
// SEGMENT_NAMES (with the provenance record a label needs) or grows this vocabulary
// with a token that says the standard defines nothing there. Neither is guesswork.
export const SEGMENT_ABSENCES: ReadonlyMap<string, SegmentAbsence> = new Map([
  ["06", { reason: "unsourced" }],
  ["09", { reason: "unsourced" }],
  ["14", { reason: "unsourced" }],
  ["15", { reason: "unsourced" }],
  ["16", { reason: "unsourced" }],
  ["27", { reason: "unsourced" }],
]);
