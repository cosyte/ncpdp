/**
 * Built-in `surescripts` profile — common SCRIPT ePrescribing conventions seen
 * on the Surescripts routing network, which carries the vast majority of US
 * ePrescribing traffic. Authored via the public `defineProfile()` API; use via
 * `parseScript(xml, { profile: profiles.surescripts })`.
 *
 * Every quirk is grounded in a real Tier-2 SCRIPT fixture under
 * `test/fixtures/script/`. The lenient parser already absorbs these conventions
 * — `routing-identifiers` parses with zero warnings, `version-stamp-variance`
 * raises exactly `NCPDP_SCRIPT_UNSUPPORTED_VERSION_TOLERATED` — so the profile
 * makes the convention explicit and documented rather than relying on silent
 * leniency. v1 is descriptive: attaching the profile NEVER alters the parse.
 */

import { defineProfile } from "./define.js";

/**
 * Built-in Surescripts SCRIPT profile. See the file header for grounding; use
 * via `parseScript(xml, { profile: profiles.surescripts })`.
 *
 * @example
 * ```ts
 * import { parseScript } from "@cosyte/ncpdp/script";
 * import { profiles } from "@cosyte/ncpdp/profiles";
 * const msg = parseScript(xml, { profile: profiles.surescripts });
 * msg.profile?.describe().adds.map((q) => q.id);
 * ```
 */
export const surescripts = defineProfile({
  name: "surescripts",
  description:
    "Surescripts SCRIPT ePrescribing conventions — routing identifiers and version-stamp variance",
  quirks: [
    {
      id: "routing-identifiers",
      standard: "script",
      effect: "adds",
      summary:
        "Header To/From carry Surescripts routing identifiers (the prescriber SPI and the receiving pharmacy NCPDP ID), present on routed traffic.",
      fixture: "script/surescripts-routing.xml",
      sourceCategory:
        "Surescripts implementation guide — message routing (To/From carry the SPI / NCPDP ID routing identifiers)",
    },
    {
      id: "version-stamp-variance",
      standard: "script",
      effect: "relaxes",
      summary:
        "Trading partners stamp SCRIPT versions beyond the explicitly-modeled set (e.g. a newer yearly release); the message is still well-formed XML and parses best-effort.",
      fixture: "script/surescripts-version-variance.xml",
      sourceCategory:
        "Surescripts version matrix — SCRIPT version stamps evolve per the published partner matrix",
      expectedWarnings: ["NCPDP_SCRIPT_UNSUPPORTED_VERSION_TOLERATED"],
    },
  ],
});
