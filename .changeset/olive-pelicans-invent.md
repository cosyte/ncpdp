---
"@cosyte/ncpdp": patch
---

`KNOWN_SCRIPT_VERSIONS` is now `2017071` + `2023011`. It was `2017071` + `2022011`.

US federal regulation names exactly two NCPDP SCRIPT Implementation Guide versions for electronic
prescribing: 45 CFR 170.205(b) adopts `2017071` at (b)(1) and `2023011` at (b)(2), and 42 CFR
423.160 requires compliance with a standard in that paragraph and incorporates both guides by
reference at (c)(2) and (c)(3). `2022011` is named in neither section, so the package was modeling a
version the rule does not adopt while treating an adopted one as unrecognized.

**What changes for a consumer, in both directions.** A message stamped `2023011` now classifies as
`known` and no longer raises `NCPDP_SCRIPT_UNSUPPORTED_VERSION_TOLERATED`; anyone alerting on that
warning will see it stop firing for that traffic. A message stamped `2022011` now raises it, where
it previously did not. Neither message is refused and neither parse result changes shape: an
unrecognized but present version stamp has always been read best-effort, and still is. TypeScript
consumers see one more effect, because `KnownScriptVersion` is derived from the list: a value
annotated `KnownScriptVersion` and assigned `"2022011"` no longer compiles, and `"2023011"` now
does.

This matters on a date rather than on a defect. 45 CFR 170.205(b)(1) states that the Secretary's
adoption of `2017071` expires on January 1, 2028, after which `2023011` is the only SCRIPT version
that paragraph adopts.

The `surescripts` built-in profile loses its `version-stamp-variance` quirk. That quirk claimed
partners stamp versions beyond the modeled set, and the fixture grounding it was stamped `2023011`,
which is adopted, so once the list was corrected the fixture no longer demonstrated the claim.
Re-stamping it would have meant inventing a version identifier no public source backs, so the quirk
was removed rather than re-grounded. Consequences: `profiles.surescripts.describe()` reports one
quirk instead of two and no longer lists `NCPDP_SCRIPT_UNSUPPORTED_VERSION_TOLERATED` under
`expectedWarnings`, so `partitionWarnings` now sorts that code into `unexpected` for that profile.
The profile's `description` changed to match. Parsing is unaffected, as profiles remain descriptive.

Scope worth stating: this pins the list to what those two CFR sections name, checked against the
eCFR versioner API and the Cornell mirror on 2026-08-01. It is not a claim about which SCRIPT
versions NCPDP has published, which is not something a public source settles, and it is not a
conformance claim about the rest of the SCRIPT read.
