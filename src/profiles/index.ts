/**
 * Public barrel for the `@cosyte/ncpdp` profile subsystem (Phase 9). Assembles
 * the `profiles` namespace object and re-exports the public profile API:
 * `defineProfile`, `setDefaultProfile`, `getDefaultProfile`,
 * `partitionWarnings`, the `NcpdpProfileError` class, and the supporting types.
 *
 * Contract (mirrors x12/hl7): individual built-ins are NOT top-level named
 * exports — consumers reach them via `profiles.surescripts`, `profiles.pbm`.
 *
 * **NCPDP spans two unrelated standards**, so the registry holds one profile
 * per standard: `profiles.surescripts` (SCRIPT) and `profiles.pbm` (Telecom).
 * A profile is descriptive in v1 — it attaches to a parse result for
 * attribution (`msg.profile` / `tx.profile`) and powers `partitionWarnings`,
 * but NEVER alters the lenient parse.
 *
 * **Shipped built-ins are intentionally few.** Per the locked hard rule, a
 * built-in profile may only ship quirks grounded in a real Tier-2 fixture
 * demonstrating the convention. New built-ins land as the corpus accrues.
 */

export { defineProfile } from "./define.js";
export { setDefaultProfile, getDefaultProfile } from "./default.js";
export { partitionWarnings } from "./apply.js";
export type { NcpdpWarningPartition } from "./apply.js";
export { NcpdpProfileError } from "./errors.js";
export type {
  NcpdpProfile,
  NcpdpProfileDescription,
  NcpdpProfileEffect,
  NcpdpProfileQuirk,
  NcpdpProfileSpec,
  NcpdpStandard,
  NcpdpWarningCode,
} from "./types.js";

import { pbm } from "./pbm.js";
import { surescripts } from "./surescripts.js";

/**
 * Namespace object exposing the shipped built-in profiles, one per NCPDP
 * standard. Each is authored via the public `defineProfile()` API and grounded
 * in a real Tier-2 fixture.
 *
 * @example
 * ```ts
 * import { parseTelecom } from "@cosyte/ncpdp/telecom";
 * import { profiles } from "@cosyte/ncpdp/profiles";
 * const tx = parseTelecom(raw, { profile: profiles.pbm });
 * tx.profile?.name; // "pbm"
 * ```
 */
export const profiles = Object.freeze({
  surescripts,
  pbm,
}) as {
  readonly surescripts: typeof surescripts;
  readonly pbm: typeof pbm;
};
