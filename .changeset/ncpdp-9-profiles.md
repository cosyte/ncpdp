---
"@cosyte/ncpdp": patch
---

NCPDP-9 — trading-partner / companion-guide profile system, grounded in Tier-2 fixtures. Descriptive only.

- **`@cosyte/ncpdp/profiles`** — a new subpath export. `defineProfile(spec)` builds a frozen profile
  with a structured `describe()` (the `relaxes` / `adds` / `requires` buckets, the standards it touches,
  and the de-duplicated union of `expectedWarnings`). `setDefaultProfile` / `getDefaultProfile` /
  `resolveProfile` manage a process-scoped default; `partitionWarnings(warnings, profile)` splits a
  parse's warnings into expected (the profile's union) vs. unexpected.
- **Built-ins reached via the `profiles` namespace.** NCPDP spans two unrelated standards, so one
  built-in ships per standard: `profiles.surescripts` (SCRIPT — routing identifiers + version-stamp
  variance) and `profiles.pbm` (Telecom — Person Code, deeper reject-code taxonomy, response DUR/PPS).
- **Locked hard rule — no invented quirks.** Every quirk MUST cite a Tier-2 `fixture` that demonstrates
  its convention; enforced three ways — a required `fixture` field, `defineProfile()` validation
  (rejects a missing/absolute/escaping path), and a per-quirk demonstrator in `builtins.test.ts` that
  parses the cited fixture and asserts the convention is actually present. A quirk with no demonstrator
  fails the suite.
- **Descriptive only (v1).** Attaching a profile via `parseScript(xml, { profile })` /
  `parseTelecom(raw, { profile })` surfaces it as `msg.profile` / `tx.profile` and feeds
  `partitionWarnings`, but NEVER alters the parse — profile-on body, header, segments, and warnings are
  byte-identical to profile-off (asserted in `builtins.test.ts`). An explicit profile wins over the
  default; `null` opts out of the default for one call; `undefined` consults `getDefaultProfile()`.
- **Accuracy + PHI.** Provenance per quirk recorded in `docs-content/spec-notes-profiles.md`; each quirk
  names a paraphrased `sourceCategory` (no NCPDP-copyrighted prose). All cited fixtures are
  synthetic-only — no real BIN/PCN/NDC+patient, cardholder, NPI, or SPI. No new warning codes.
- **Known limitations.** v1 profiles are attribution + warning-partitioning only; they do not (yet)
  toggle stricter validation or alter leniency. One built-in per standard.
