/**
 * Built-in `pbm` profile — common PBM / pharmacy-claim-clearinghouse
 * conventions over the NCPDP Telecommunication standard (vD.0). Authored via
 * the public `defineProfile()` API; use via
 * `parseTelecom(raw, { profile: profiles.pbm })`.
 *
 * Every quirk is grounded in a real Tier-2 Telecom fixture under
 * `test/fixtures/telecom/`. The lenient parser already absorbs these
 * conventions — `person-code-required` and `response-dur-segment` parse with
 * zero warnings, `reject-code-depth` raises exactly
 * `NCPDP_TELECOM_UNKNOWN_REJECT_CODE` for a code outside the modeled core set —
 * so the profile makes the convention explicit and documented rather than
 * relying on silent leniency. v1 is descriptive: attaching the profile NEVER
 * alters the parse.
 */

import { defineProfile } from "./define.js";

/**
 * Built-in PBM / clearinghouse Telecom profile. See the file header for
 * grounding; use via `parseTelecom(raw, { profile: profiles.pbm })`.
 *
 * @example
 * ```ts
 * import { parseTelecom } from "@cosyte/ncpdp/telecom";
 * import { profiles, partitionWarnings } from "@cosyte/ncpdp/profiles";
 * const tx = parseTelecom(raw, { profile: profiles.pbm });
 * const { unexpected } = partitionWarnings(tx.warnings, profiles.pbm);
 * ```
 */
export const pbm = defineProfile({
  name: "pbm",
  description:
    "PBM / clearinghouse Telecommunication (vD.0) claim conventions — Person Code, deeper reject-code taxonomy, response DUR/PPS",
  quirks: [
    {
      id: "person-code-required",
      standard: "telecom",
      effect: "requires",
      summary:
        "Insurance segment carries a Person Code (303-C3) distinguishing cardholder from dependent on a family policy.",
      fixture: "telecom/pbm-person-code.ncpdp",
      sourceCategory:
        "NCPDP Telecommunication vD.0 — Person Code (303-C3); PBM payer sheets commonly require it",
    },
    {
      id: "reject-code-depth",
      standard: "telecom",
      effect: "adds",
      summary:
        "Response Status returns reject codes (511-FB) beyond the modeled core set; PBMs use a deep reject-code taxonomy.",
      fixture: "telecom/pbm-reject-unknown.ncpdp",
      sourceCategory:
        "NCPDP Telecommunication vD.0 — Reject Code (511-FB); PBM payer sheets enumerate partner-specific reject codes",
      expectedWarnings: ["NCPDP_TELECOM_UNKNOWN_REJECT_CODE"],
    },
    {
      id: "response-dur-segment",
      standard: "telecom",
      effect: "adds",
      summary:
        "A paid response carries an additional Response DUR/PPS segment (clinical alert) alongside the Response Status.",
      fixture: "telecom/pbm-response-dur.ncpdp",
      sourceCategory:
        "NCPDP Telecommunication vD.0 — Response DUR/PPS segment; PBMs return clinical alerts on adjudication",
    },
  ],
});
