/**
 * Build the structured {@link "./types.js".NcpdpProfileDescription} returned by
 * `profile.describe()`. Like x12 (and unlike hl7's formatted string), NCPDP
 * returns DATA — the "relaxes / adds / requires" buckets, the standards the
 * profile touches, and the union of expected warnings — so downstream tooling
 * can consume it programmatically. This record is published with the package.
 *
 * @internal
 */

import { collectExpectedWarnings, collectStandards } from "./validate.js";
import type { NcpdpProfileDescription, NcpdpProfileQuirk } from "./types.js";

/**
 * Local mutable-during-assembly helper — honours `exactOptionalPropertyTypes`
 * by conditionally assigning the optional `description` rather than writing
 * `description: undefined`.
 *
 * @internal
 */
type Mutable<T> = { -readonly [K in keyof T]?: T[K] };

/**
 * Assemble the structured description from a fully-merged profile. Buckets
 * quirks by `effect` in their merged order; `standards` and `expectedWarnings`
 * are the sorted, de-duplicated unions across all quirks.
 *
 * @internal
 */
export function buildDescribe(profile: {
  readonly name: string;
  readonly description?: string;
  readonly lineage: readonly string[];
  readonly quirks: readonly NcpdpProfileQuirk[];
}): NcpdpProfileDescription {
  const relaxes: NcpdpProfileQuirk[] = [];
  const adds: NcpdpProfileQuirk[] = [];
  const requires: NcpdpProfileQuirk[] = [];
  for (const q of profile.quirks) {
    if (q.effect === "relaxes") relaxes.push(q);
    else if (q.effect === "adds") adds.push(q);
    else requires.push(q);
  }
  const out: Mutable<NcpdpProfileDescription> = {
    name: profile.name,
    lineage: profile.lineage,
    standards: collectStandards(profile.quirks),
    relaxes: Object.freeze(relaxes),
    adds: Object.freeze(adds),
    requires: Object.freeze(requires),
    expectedWarnings: collectExpectedWarnings(profile.quirks),
  };
  if (profile.description !== undefined) out.description = profile.description;
  return Object.freeze(out) as NcpdpProfileDescription;
}
