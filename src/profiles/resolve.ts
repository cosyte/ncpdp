/**
 * Shared profile resolution used by both `parseScript` and `parseTelecom` so
 * the precedence rule lives in one place: an explicit `profile` option always
 * wins; `null` opts out of any default for that one call; `undefined` consults
 * the process-scoped default.
 *
 * @internal
 */

import { getDefaultProfile } from "./default.js";
import type { NcpdpProfile } from "./types.js";

/**
 * Resolve the profile in effect for a single parse from the caller's option.
 * Returns `undefined` when no profile applies (so the result omits the
 * attribute rather than carrying `profile: undefined`).
 *
 * @internal
 */
export function resolveProfile(option: NcpdpProfile | null | undefined): NcpdpProfile | undefined {
  if (option === null) return undefined;
  return option ?? getDefaultProfile();
}
