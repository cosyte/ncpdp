/**
 * Process-scoped default profile management. A single mutable module-scoped
 * `let` — the only mutable state in the library — so `parseScript(raw)` /
 * `parseTelecom(raw)` (with no explicit profile) can consult a registered
 * default.
 *
 * `setDefaultProfile` EXISTS but is DISCOURAGED: it is scoped to the current
 * Node process, NOT shared across workers, and NOT reset between test files.
 * Tests that touch it MUST clean up in `afterEach` (`setDefaultProfile(null)`)
 * to prevent cross-test bleed.
 *
 * A default applies to BOTH standards: a `pbm` (Telecom) default attaches to a
 * SCRIPT parse too — attribution only; it never alters the parse, and a
 * standard-mismatched default simply describes Telecom conventions on a SCRIPT
 * result. Prefer the explicit per-call `{ profile }` argument.
 *
 * Zero runtime deps.
 */

import type { NcpdpProfile } from "./types.js";

/**
 * Process-scoped default. `undefined` means "unset". `setDefaultProfile(null)`
 * resets to `undefined`.
 *
 * @internal
 */
let _defaultProfile: NcpdpProfile | undefined = undefined;

/**
 * Register a process-scoped default profile. `parseScript(raw)` /
 * `parseTelecom(raw)` (no explicit profile arg) consult `getDefaultProfile()`
 * and attach the returned profile to the result. Pass `null` (or `undefined`)
 * to clear.
 *
 * Explicit args ALWAYS win — `parseTelecom(raw, { profile: myProfile })` uses
 * `myProfile` regardless of the default; `parseTelecom(raw, { profile: null })`
 * opts out of the default for a single call without changing the registered
 * default.
 *
 * **Test hygiene:** the only mutable module-scoped state in the library. Tests
 * that call this MUST clean up in `afterEach` (`setDefaultProfile(null)`).
 *
 * @example
 * ```ts
 * import { setDefaultProfile, getDefaultProfile, profiles } from "@cosyte/ncpdp/profiles";
 * import { parseTelecom } from "@cosyte/ncpdp/telecom";
 * setDefaultProfile(profiles.pbm);
 * const tx = parseTelecom(raw);
 * tx.profile?.name; // "pbm"
 * setDefaultProfile(null); // clear (or in test teardown)
 * ```
 */
export function setDefaultProfile(profile: NcpdpProfile | null): void {
  // Accept `undefined` defensively for JS callers — treat it like null.
  _defaultProfile = profile ?? undefined;
}

/**
 * Return the current default profile, or `undefined` if none is registered.
 *
 * @example
 * ```ts
 * import { getDefaultProfile } from "@cosyte/ncpdp/profiles";
 * const p = getDefaultProfile();
 * if (p !== undefined) console.log("default profile:", p.name);
 * ```
 */
export function getDefaultProfile(): NcpdpProfile | undefined {
  return _defaultProfile;
}
