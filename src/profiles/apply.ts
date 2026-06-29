/**
 * `partitionWarnings()` — the one behavioural hook a v1 NCPDP profile carries.
 *
 * The lenient parser absorbs most conventions with zero warnings, so a profile
 * is primarily descriptive. Where a convention DOES surface a warning, a profile
 * lets a consumer separate the warnings it expects (because a known partner
 * convention produces them — e.g. a PBM's deeper reject-code taxonomy raising
 * `NCPDP_TELECOM_UNKNOWN_REJECT_CODE`) from the ones it does not, so an
 * integration can alert only on the genuinely unexpected. The split is driven by
 * the union of each quirk's `expectedWarnings` (see `describe().expectedWarnings`).
 *
 * Generic over the warning type so it serves both `NcpdpScriptWarning[]` and
 * `NcpdpTelecomWarning[]` without widening their `code`. Pure function, zero
 * deps. NEVER mutates the input warnings.
 */

import { collectExpectedWarnings } from "./validate.js";
import type { NcpdpProfile, NcpdpWarningCode } from "./types.js";

/**
 * The result of {@link partitionWarnings}: warnings split into those a profile
 * leads you to EXPECT and those it does not. Preserves the input warning type.
 *
 * @example
 * ```ts
 * import type { NcpdpWarningPartition } from "@cosyte/ncpdp/profiles";
 * import type { NcpdpTelecomWarning } from "@cosyte/ncpdp/telecom";
 * declare const p: NcpdpWarningPartition<NcpdpTelecomWarning>;
 * p.unexpected.length; // alert only on these
 * ```
 */
export interface NcpdpWarningPartition<W extends { readonly code: NcpdpWarningCode }> {
  readonly expected: readonly W[];
  readonly unexpected: readonly W[];
}

/**
 * Split a parse's warnings against a profile's expected-warning union. A
 * warning whose `code` is in the profile's `expectedWarnings` lands in
 * `expected`; everything else lands in `unexpected`. Order within each bucket
 * preserves the input order.
 *
 * @example
 * ```ts
 * import { parseTelecom } from "@cosyte/ncpdp/telecom";
 * import { partitionWarnings, profiles } from "@cosyte/ncpdp/profiles";
 * const tx = parseTelecom(raw, { profile: profiles.pbm });
 * const { expected, unexpected } = partitionWarnings(tx.warnings, profiles.pbm);
 * if (unexpected.length > 0) flagForReview(unexpected);
 * ```
 */
export function partitionWarnings<W extends { readonly code: NcpdpWarningCode }>(
  warnings: readonly W[],
  profile: NcpdpProfile,
): NcpdpWarningPartition<W> {
  const expectedCodes = new Set<NcpdpWarningCode>(collectExpectedWarnings(profile.quirks));
  const expected: W[] = [];
  const unexpected: W[] = [];
  for (const w of warnings) {
    if (expectedCodes.has(w.code)) expected.push(w);
    else unexpected.push(w);
  }
  return Object.freeze({
    expected: Object.freeze(expected),
    unexpected: Object.freeze(unexpected),
  });
}
