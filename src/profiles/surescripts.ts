/**
 * Built-in `surescripts` profile: common SCRIPT ePrescribing conventions seen
 * on the Surescripts routing network, which carries the vast majority of US
 * ePrescribing traffic. Authored via the public `defineProfile()` API; use via
 * `parseScript(xml, { profile: profiles.surescripts })`.
 *
 * Every quirk is grounded in a real Tier-2 SCRIPT fixture under
 * `test/fixtures/script/`. The lenient parser already absorbs the convention:
 * `routing-identifiers` parses with zero warnings, so the profile makes the
 * convention explicit and documented rather than relying on silent leniency.
 * v1 is descriptive: attaching the profile NEVER alters the parse.
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
  description: "Surescripts SCRIPT ePrescribing conventions: routing identifiers",
  quirks: [
    {
      id: "routing-identifiers",
      standard: "script",
      effect: "adds",
      summary:
        "Header To/From carry Surescripts routing identifiers (the prescriber SPI and the receiving pharmacy NCPDP ID), present on routed traffic.",
      fixture: "script/surescripts-routing.xml",
      sourceCategory:
        "Surescripts implementation guide: message routing (To/From carry the SPI / NCPDP ID routing identifiers)",
    },
    // The `version-stamp-variance` quirk was removed when KNOWN_SCRIPT_VERSIONS
    // was corrected (NCPDP-SCRIPT-VERSIONS). Its only demonstrating fixture was
    // stamped 2023011, which 45 CFR 170.205(b)(2) adopts, so once that version
    // was modeled the fixture stopped demonstrating anything and the quirk's
    // claim ("partners stamp versions beyond the modeled set") lost its ground.
    // Re-stamping the fixture to keep the quirk alive would have meant inventing
    // a version identifier no public source backs, which the locked hard rule
    // forbids, so the quirk is deleted rather than re-grounded. The underlying
    // tolerance is unchanged and still covered: classifyVersion() reports any
    // present-but-unrecognized stamp as `tolerated`.
  ],
});
