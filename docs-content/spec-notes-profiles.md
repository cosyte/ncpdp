---
id: spec-notes-profiles
title: "Spec notes: trading-partner profile system"
sidebar_label: Trading-partner profiles
---

# Spec notes: trading-partner profile system

These notes record exactly what the **profile system** does, where each built-in quirk's convention
is documented, and what the system deliberately does **not** do. **No NCPDP-copyrighted prose is
reproduced here.** Every field/segment/element label below is our own short paraphrase; the
field-number designators (`303-C3`, `511-FB`, …) are factual identifiers from the NCPDP
Telecommunication Standard vD.0 and the SCRIPT Standard (paywalled), recorded against our own
paraphrased names.

## What the profile system does

A profile is a **descriptive** bundle of trading-partner / companion-guide conventions. v1 profiles
attach attribution and drive `partitionWarnings`. They do **not** change how a message parses.

- **`defineProfile(spec)`**: validates the spec and returns a frozen `NcpdpProfile` with a structured
  `describe()`: the `relaxes` / `adds` / `requires` buckets (quirks in merged order), the `standards`
  the profile touches, and the sorted de-duplicated union of `expectedWarnings`. `extends` composes
  parents (lineage flattens + dedupes, quirks merge by id with the child winning on collision while
  non-colliding parent quirks survive, `description` is last-wins).
- **`setDefaultProfile` / `getDefaultProfile` / `resolveProfile`**: a single process-scoped default.
  Precedence: an explicit profile wins; `null` opts out of the default for that one call; `undefined`
  consults the default.
- **`partitionWarnings(warnings, profile)`**: splits a parse's warnings into `expected` (in the
  profile's `expectedWarnings` union) vs. `unexpected`. The intended workflow: attach the partner's
  profile, then alert only on the `unexpected` set.
- **`profiles`**: the frozen namespace holding the built-ins. NCPDP spans two unrelated standards, so
  one built-in ships per standard: `profiles.surescripts` (SCRIPT) and `profiles.pbm` (Telecom).

## Descriptive only: a profile never alters the parse

v1 is intentionally inert on the parse path. `parseScript(xml, { profile })` and
`parseTelecom(raw, { profile })` surface the resolved profile as `msg.profile` / `tx.profile`, but the
body, header, segments, and warning list are **byte-identical** to a parse with no profile. This is
asserted directly in `test/profiles/builtins.test.ts` (profile-on vs. profile-off divergence). The
value of a v1 profile is **documentation + attribution + warning triage**, not stricter validation.

## The locked hard rule: no invented quirks

Every quirk MUST cite a Tier-2 `fixture` (a relative path under `test/fixtures/`) that demonstrates its
convention. This is enforced three independent ways:

1. **Type**: `fixture` is a required field on `NcpdpProfileQuirk`.
2. **Validation**: `defineProfile()` rejects a missing, absolute, or parent-escaping fixture path.
3. **Demonstrator**: `builtins.test.ts` holds a per-quirk demonstrator keyed `${profile}/${quirk.id}`
   that loads the cited fixture, parses it on the right standard, and asserts the convention is
   **actually present**. A quirk with no demonstrator fails the suite, so a real-but-irrelevant fixture
   cannot satisfy a generic exists-and-parses check.

## Built-in provenance

### `profiles.surescripts` (SCRIPT)

| Quirk | Effect | Convention (paraphrased) | Documented in | Fixture |
|---|---|---|---|---|
| `routing-identifiers` | adds | Header `To`/`From` carry Surescripts routing identifiers (the prescriber SPI and the receiving pharmacy NCPDP ID) on routed traffic. | Surescripts implementation guide: message routing | `script/surescripts-routing.xml` |

A second quirk, `version-stamp-variance`, shipped in earlier `0.0.x` releases and has been removed.
It claimed that partners stamp SCRIPT versions beyond the modeled set, and its only demonstrating
fixture was stamped `2023011`. That version is federally adopted and is now modeled, so the fixture
no longer demonstrates the claim. Keeping the quirk would have meant re-stamping the fixture with a
version identifier no public source backs. Note that the fixture rule stated above would technically
have been satisfied by such a re-stamp, since it asks only that a quirk cite a demonstrating fixture.
What forbids it is the broader convention the rule exists to serve: a trading-partner quirk is
encoded only when a real document grounds it, never invented. So the quirk was deleted instead. Nothing about the parse changed: an unrecognized version stamp is still read
best-effort and still raises `NCPDP_SCRIPT_UNSUPPORTED_VERSION_TOLERATED`. What changed is that
`profiles.surescripts` no longer lists that code in its `expectedWarnings`, so `partitionWarnings`
now sorts it into `unexpected` rather than `expected`.

### `profiles.pbm` (Telecom vD.0)

| Quirk | Effect | Convention (paraphrased) | Documented in | Fixture |
|---|---|---|---|---|
| `person-code-required` | requires | Insurance segment carries a Person Code (`303-C3`) distinguishing cardholder from dependent on a family policy. | NCPDP Telecom vD.0: Person Code (`303-C3`); PBM payer sheets commonly require it. | `telecom/pbm-person-code.ncpdp` |
| `reject-code-depth` | adds | Response Status returns reject codes (`511-FB`) beyond the modeled core set; a code outside it raises `NCPDP_TELECOM_UNKNOWN_REJECT_CODE` and is preserved verbatim with `known:false`. | NCPDP Telecom vD.0: Reject Code (`511-FB`); PBM payer sheets enumerate partner-specific codes. | `telecom/pbm-reject-unknown.ncpdp` |
| `response-dur-segment` | adds | A paid response carries an additional Response DUR/PPS segment (clinical alert) alongside the Response Status. | NCPDP Telecom vD.0: Response DUR/PPS segment; PBMs return clinical alerts on adjudication. | `telecom/pbm-response-dur.ncpdp` |

The lenient parser already absorbs every one of these conventions; the profile makes the convention
**explicit and documented** rather than relying on silent leniency. `person-code-required` and
`response-dur-segment` parse with zero warnings; `reject-code-depth` raises exactly
`NCPDP_TELECOM_UNKNOWN_REJECT_CODE`.

## What the profile system does NOT do

- It does **not** change leniency, validation strictness, or output for any message. v1 is descriptive.
- It does **not** ship a quirk that lacks a demonstrating fixture (the hard rule).
- It does **not** reproduce NCPDP-copyrighted spec prose. Labels are paraphrases; `sourceCategory`
  names where a convention is documented, not its text.
- It does **not** ship more than one built-in per standard in v1.

## PHI posture

Every cited fixture is synthetic: no real BIN/PCN, no real NDC+patient combination, no real
cardholder / member ID, NPI, or SPI. Profile source and tests embed only paraphrased field labels, no
message bodies.
