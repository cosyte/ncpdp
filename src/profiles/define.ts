/**
 * `defineProfile()` — public factory for building {@link
 * "./types.js".NcpdpProfile} objects with validation + a structured
 * `describe()` attached. Mirrors the x12/hl7 flow: validate name → validate
 * keys → validate self quirks → merge `extends` → re-validate the merged set →
 * assemble + freeze.
 *
 * Zero runtime deps. Boundary freeze is top-level only (the nested `quirks` /
 * `lineage` arrays are `readonly` at the type level; frozen at runtime by the
 * merge helpers).
 */

import { buildDescribe } from "./describe.js";
import { mergeDescription, mergeLineage, mergeQuirks, normaliseParents } from "./merge.js";
import type { NcpdpProfile, NcpdpProfileSpec } from "./types.js";
import { validateOptionKeys, validateProfileName, validateQuirks } from "./validate.js";

/**
 * Build a readonly {@link NcpdpProfile} from a validated spec. Invalid input
 * throws {@link "./errors.js".NcpdpProfileError} with an actionable message:
 * missing/empty name, unknown option key (with a typo hint), or a quirk that
 * violates the locked hard rule (missing `fixture`, bad `standard`/`effect`,
 * unknown `expectedWarnings` code).
 *
 * `extends` composes parent profiles: lineage flattens + dedupes, quirks merge
 * by id (child wins on collision, non-colliding parent quirks survive), and
 * `description` is last-wins.
 *
 * @example
 * ```ts
 * import { defineProfile } from "@cosyte/ncpdp/profiles";
 * const pbm = defineProfile({
 *   name: "pbm",
 *   description: "PBM / clearinghouse Telecom claim conventions",
 *   quirks: [
 *     {
 *       id: "person-code-required",
 *       standard: "telecom",
 *       effect: "requires",
 *       summary: "Insurance segment carries a Person Code (303-C3).",
 *       fixture: "telecom/pbm-person-code.ncpdp",
 *       sourceCategory: "NCPDP Telecommunication vD.0 — Person Code (303-C3)",
 *     },
 *   ],
 * });
 * pbm.name;                    // "pbm"
 * pbm.lineage;                 // ["pbm"]
 * pbm.describe().requires;     // [{ id: "person-code-required", ... }]
 * ```
 */
export function defineProfile(opts: NcpdpProfileSpec): NcpdpProfile {
  // Fail-fast: name first so downstream throws can name the offending profile.
  validateProfileName(opts);
  validateOptionKeys(opts);

  // Pre-merge: validate self quirks in isolation so a hard-rule violation
  // surfaces with the offending profile's own name (not the composed lineage).
  const selfQuirks = opts.quirks ?? [];
  validateQuirks(selfQuirks, opts.name);

  // Compose `extends`.
  const parents = normaliseParents(opts.extends);
  const lineage = mergeLineage(parents, opts.name);
  const quirks = mergeQuirks(parents, selfQuirks);
  const description = mergeDescription(parents, opts.description);

  // Post-merge re-validation — catches a rogue parent (a hand-crafted
  // NcpdpProfile bypassing defineProfile whose quirks violate the rules) and
  // id collisions introduced by the merge.
  validateQuirks(quirks, opts.name);

  // exactOptionalPropertyTypes: conditionally assign optional `description`.
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const profile: Mutable<NcpdpProfile> = {
    name: opts.name,
    lineage,
    quirks,
  };
  if (description !== undefined) profile.description = description;

  // `describe()` closes over the assembled profile so it always reflects the
  // fully-merged state.
  const finalised = profile as NcpdpProfile;
  profile.describe = () => buildDescribe(finalised);

  return Object.freeze(profile) as NcpdpProfile;
}
