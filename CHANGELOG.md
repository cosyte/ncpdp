# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions and publishing are managed with [Changesets](https://github.com/changesets/changesets);
this file is maintained by hand (Changesets handles the version bump and publish only).

## [Unreleased]

The first pre-alpha release (`0.0.1`) will ship the initial public API surface. The package begins
its public history at `0.0.x`, per the cosyte version ladder (`0.0.x` until first alpha).

### Security

- **Dev-dependency advisory remediation (no runtime impact — both overridden
  packages are dev/build-time only and never enter the published artifact; the
  sole runtime dep, `fast-xml-parser`, is untouched).** Added scoped
  `pnpm.overrides` pinning two transitive packages to their patched releases:
  `esbuild` (`>=0.27.3 <0.28.1` → `0.28.1`; GHSA dev-server path-traversal —
  not reachable here: the library builds via `tsup`/`vitest` and never runs
  `esbuild serve`) and the `@changesets/parse` copy of `js-yaml`
  (`>=4.0.0 <4.2.0` → `4.2.0`; GHSA-h67p-54hq-rp68 merge-key DoS). The
  `js-yaml@3.14.2` pulled by `read-yaml-file@1.1.0` (via
  `@manypkg/get-packages` → `@changesets/cli`) is **intentionally left**: it
  calls `yaml.safeLoad`, removed/throwing in js-yaml 4, so it cannot be
  force-upgraded without breaking the release tooling, and it only parses
  trusted local repo YAML at release time. This is the shared canonical
  override block, enforced suite-wide by the `@cosyte/config` drift check.

### Added

- **NCPDP-10 — release hardening.** The v1 close-out; no new parser surface, just the gates, tooling,
  and docs that make the package trustworthy to publish. A `release-dry-run` CI job (`pnpm publish
--dry-run` across the five subpath exports + `npm pack --dry-run`) proves a real release assembles
  auth-free without burning a version; a nightly `fuzz.yml` amplifies the never-throw fuzz targets —
  including a **new SCRIPT XML XXE / entity-expansion target** that hammers the `xml-load.ts`
  `<!DOCTYPE>`/`<!ENTITY>` refusal boundary — via a `fuzzRuns()` env multiplier (per-commit run
  unchanged; fast-check auto-rotates + prints its seed for replay), with a sticky-issue open/auto-close
  on failure. Docs: a task-oriented `docs-content/cookbook.md` and a `KNOWN-LIMITATIONS.md` honesty
  statement (EPCS non-support, lossy structured SIG, the NCPDP-licensing / no-redistributed-prose
  posture, and the deliberate absence of an external-oracle differential corpus); JSDoc `@example`
  completeness closed on the 12 public value-exports that lacked one. No new warning codes.
- **Trading-partner profile system** (NCPDP-9): a new `@cosyte/ncpdp/profiles` subpath. `defineProfile(spec)`
  builds a frozen profile with a structured `describe()` (the `relaxes` / `adds` / `requires` buckets, the
  standards it touches, and the de-duplicated union of `expectedWarnings`); `setDefaultProfile` /
  `getDefaultProfile` manage a process-scoped default; `partitionWarnings(warnings, profile)` splits a
  parse's warnings into expected vs. unexpected. NCPDP spans two unrelated standards, so one built-in ships
  per standard, reached via the `profiles` namespace: `profiles.surescripts` (SCRIPT — routing identifiers,
  version-stamp variance) and `profiles.pbm` (Telecom — Person Code, deeper reject-code taxonomy, response
  DUR/PPS). **Locked hard rule — no invented quirks:** every quirk MUST cite a Tier-2 `fixture` that
  demonstrates its convention, enforced by a required field, `defineProfile()` validation, and a per-quirk
  demonstrator in the suite. **Descriptive only (v1):** attach a profile via `parseScript(xml, { profile })`
  / `parseTelecom(raw, { profile })` and it surfaces as `msg.profile` / `tx.profile` and feeds
  `partitionWarnings`, but NEVER alters the parse — profile-on output is byte-identical to profile-off.
  Provenance per quirk in `docs-content/spec-notes-profiles.md`; synthetic-only fixtures; no new warning codes.
- **Spec-clean serializers + builders + round-trip, both standards** (NCPDP-8): closes the parse↔emit
  loop. `@cosyte/ncpdp/script` adds `serializeScript(message)` (and `ScriptMessage#toString()`) →
  canonical SCRIPT XML, plus `buildNewRx(input)` and `buildScriptResponse(input)` to construct a NewRx or
  a `<Status>`/`<Error>`/`<Verify>` response. `@cosyte/ncpdp/telecom` adds `serializeTelecom(transaction)`
  → canonical vD.0 wire form (56-byte fixed header + FS/GS/RS-framed body, or response header + GS +
  segments) and `buildTelecomRequest(input)`. **Conservative on emit (Postel's Law):** the serializer
  never warns on a valid model; the builders refuse a message invalid by construction with a typed error
  — `NcpdpScriptBuildError` (`MISSING_MEDICATION`, `MISSING_RESPONSE_CODE`, `INVALID_CHARACTER`) and
  `NcpdpTelecomBuildError` (`MISSING_TRANSACTION_CODE`, `MISSING_SEGMENT_ID`, `INVALID_FIELD_ID`,
  `EMBEDDED_CONTROL_CHARACTER`, `FIELD_TOO_LONG`) — rather than emitting malformed output. The read is
  lossy, so the contract is **canonical-form idempotence**: `serialize(parse(serialize(x)))` is
  byte-identical to `serialize(x)` and `parse(serialize(x))` is structurally equal to `x`; verified by a
  golden round-trip over every parseable fixture (both standards) and a `roundTripProperty` property test,
  with builder output re-parsing with zero warnings. SCRIPT emit escapes `& < >` (and `"` in attributes);
  because the XXE-safe loader resolves no entities, a raw `& < >` round-trips only when entity-free (the
  corpus is), and the builder refuses XML-1.0 control characters up front. No new warning codes — the
  parser warning surface is unchanged; build errors carry a stable code and never echo the (PHI-dense)
  value. Spec traceability in `docs-content/spec-notes-serialize-build.md`. Known limitations:
  whole-message only (no streaming emit), the SCRIPT builder emits the SIG it is given (no SIG generation
  from structure), and lossy fields the parser does not model are not reproduced.
- **Telecom request-side depth: compound + COB + DUR/PPS request + prior-auth** (`@cosyte/ncpdp/telecom`):
  five new reads over a parsed transaction — `compound(t)` (multi-ingredient compound detail, segment 10),
  `cobOtherPayments(t)` (request Coordination of Benefits / Other Payments, segment 05), `responseCob(t)`
  (response COB / Other Payers next-payer routing, segment 28), `requestDur(t)` (submitted DUR/PPS
  interactions, segment 08), and `priorAuthorization(t)` (segment 12); `responseDur` also gains
  professional-service / result-of-service / level-of-effort depth. Two safety invariants govern the
  collections: **every compound ingredient is surfaced, none dropped or merged** — a new ingredient begins
  at each Compound Product ID Qualifier (488-RE) **or** Compound Product ID (489-TE), and a declared
  component count (447-EC) that disagrees never drops/pads data (`NCPDP_TELECOM_COMPOUND_COUNT_MISMATCH`);
  **every COB money row is preserved with its amount** — each other-payer block repeats on Other Payer
  Coverage Type (338-5C), the segment-level count (337-4C / 355-NT) is metadata and never seeds a spurious
  block, amount rows pair a qualifier with the next amount in wire order, and a declared count that
  disagrees surfaces `NCPDP_TELECOM_COB_COUNT_MISMATCH`. Money stays decimal-safe (compound drug cost
  449-EE and the COB amounts via `telecomMoney`; ingredient quantity 448-ED via the implied 3-place
  decimal). An unknown DUR Reason For Service (439-E4) is kept verbatim with `reasonKnown: false`
  (`NCPDP_TELECOM_UNKNOWN_DUR_REASON`). Prior authorization is **presence, not adjudication**. Adds the
  three stable warning codes above; warnings carry a stable code + byte offset + field id, never a value
  (PHI-safe). Spec traceability in `docs-content/spec-notes-telecom-compound-cob.md`. Still parse-only; no
  serializer yet.
- **Telecom responses + B2/B3/E1** (`@cosyte/ncpdp/telecom`): `parseTelecom` now detects a **response**
  transmission (it leads with the Version/Release at offset 0, not the routing BIN) and decodes it against
  the fixed Response Transaction Header. `adjudication(t)` lifts the outcome — status + disposition,
  pricing, and DUR alerts — over the same reader for B1/B2 reversal/B3 rebill/E1 eligibility responses;
  `responseStatus`, `responsePricing`, `responseDur`, `telecomMoney`, and `decodeResponseHeader` are
  exported too. Three safety invariants govern it: **a reject always wins** — `disposition` is a total
  function over Transaction Response Status (112-AN) **and** reject codes (511-FB), so any reject present
  forces `"rejected"` even when the status claims paid (`NCPDP_TELECOM_STATUS_CONFLICT`), and an
  unrecognized status reads `"unknown"`, never paid (`NCPDP_TELECOM_UNKNOWN_RESPONSE_STATUS`); **money is
  never a float** — `telecomMoney` decodes the implied 2-place decimal and the zoned-decimal overpunch
  sign (`{`,A–I = +0–9; `}`,J–R = −0–9) string-wise with the verbatim source authoritative, keeping
  unrecognized input as `isValid: false`; **no DUR alert is dropped** — the repeating Response DUR/PPS
  fields split at each counter (567-J6) and each new Reason For Service (439-E4), and unknown
  reject/reason codes are kept verbatim with `known: false` (`NCPDP_TELECOM_UNKNOWN_REJECT_CODE`). Adds
  the three stable warning codes above; warnings carry a stable code + byte offset + field id, never a
  value (PHI-safe). Spec traceability in `docs-content/spec-notes-telecom-response.md`. Still parse-only;
  no serializer yet.
- **Telecom foundation + B1 billing-claim read** (`@cosyte/ncpdp/telecom`): opens the second,
  **zero-dep** standard. `parseTelecom(raw: string | Buffer, opts?)` validates the FS/GS/RS
  (`0x1C`/`0x1D`/`0x1E`) control-character framing, decodes the fixed 56-byte vD.0 Transaction Header
  (BIN, Version/Release, Transaction Code, PCN, Transaction Count, Service Provider ID + Qualifier, Date
  of Service, Software/Cert ID — leading zeros preserved, pad trimmed), and tokenizes the
  Segment-Identification (`AM`)-keyed, field-id-keyed variable segments. `claim(t)` lifts a B1/B2/B3
  **request** view: Patient (DOB, gender), Insurance (group, cardholder, person code), Claim (Rx
  reference + qualifier, fill, product, quantity, days supply, DAW) and Prescriber (id + qualifier).
  **Quantity Dispensed is never a float** — the implied 3-place decimal (`9(7)v999`) is applied
  string-wise (`"30000"` → `"30.000"`) alongside the verbatim source. Fail-safe: missing header →
  `NCPDP_TELECOM_NO_HEADER`, unframeable body → `NCPDP_TELECOM_INVALID_FRAMING` (a separator is never
  guessed), untrusted version → `NCPDP_TELECOM_UNSUPPORTED_VERSION`, empty → `EMPTY_INPUT`; the **F6**
  stamp is recognized-but-not-decoded (`NCPDP_TELECOM_VF6_NOT_DECODED`, its header layout differs from
  D.0); unknown segments/fields, a missing `AM`, malformed tokens, and extra (truncated) transactions
  all warn and preserve verbatim. Warnings carry a stable code + byte offset + field id, never a value
  (PHI-safe). Spec traceability in `docs-content/spec-notes-telecom.md`. Responses, B2/B3, E1, compound,
  and COB land in later phases; no serializer yet.
- **SCRIPT structured SIG decode** (`@cosyte/ncpdp/script`): `medication.sig` exposes a `StructuredSig`
  — a best-effort, **lossy** decode of the SCRIPT `<Sig>` into typed dosing components
  (`doseDeliveryMethod`, `dose`, `doseUnitOfMeasure`, `route`, `siteOfAdministration`,
  `administrationTiming`, `duration`, `vehicle`, `indication`, `maximumDoseRestriction`). The free-text
  `SigText` is preserved **verbatim** and remains the source of truth; the structured view is additive
  and never reconciled against it — when they disagree, both are surfaced. Every component is a
  `SigField` tagged `coded`/`derived`/`absent`; a `coded` field keeps its qualifier verbatim and resolves
  the system (SNOMED CT / NCI / NDC / RxNorm / ICD-10, else `UNKNOWN`), giving route/site/method/unit
  provenance. An ambiguous dose (a dose structure with no readable quantity) is surfaced as `absent`
  rather than guessed, raising the new `NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE`; any structured decode raises the
  new `NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY` to flag the lossy view. Decode-only (no SIG generation, no
  natural-language parsing); element-name tolerance for the membership-gated IG nesting is documented in
  `docs-content/spec-notes-structured-sig.md`. Covers SCRIPT `v2017071` + `v2022011`.
- **SCRIPT prescription-lifecycle transactions** (`@cosyte/ncpdp/script`): reads the six renewal /
  change / cancel transactions — `RxRenewalRequest`/`RxRenewalResponse`,
  `RxChangeRequest`/`RxChangeResponse`, `CancelRx`/`CancelRxResponse` — via
  `rxRenewalRequest()`/`rxRenewalResponse()`/`rxChangeRequest()`/`rxChangeResponse()`/`cancelRx()`/
  `cancelRxResponse()` accessors (and `ScriptMessage#asLifecycleRequest`/`asLifecycleResponse`).
  Requests project patient, pharmacy, prescriber, and the prescribed medication with the same
  semantics as NewRx. Responses expose a **fail-safe** `outcome`
  (`approved`/`approvedWithChanges`/`denied`/`deniedNewToFollow`/`replace`/`validated`/`unknown`):
  a `<Denied>` is **never** read as an approval, an unrecognized or absent outcome reads as
  `unknown` (never assumed approved, raising `LIFECYCLE_OUTCOME_UNRECOGNIZED`), and a malformed
  response carrying multiple outcome choices resolves denial-first and raises
  `LIFECYCLE_AMBIGUOUS_OUTCOME`. `approvalOf(outcome)` gives a coarse, one-directional
  `affirmative`/`negative`/`indeterminate` read. For `approvedWithChanges` the **changed**
  `medicationPrescribed` is surfaced (whether a sibling of `<Response>` or nested inside the outcome
  element) so a consumer dispenses the change, not the original. Reason fields
  (`code`/`referenceNumber`/`denialReason`/`note`) are verbatim. Covers SCRIPT `v2017071` +
  `v2022011`.
- **SCRIPT response spine** (`@cosyte/ncpdp/script`): reads the three acknowledgment transactions —
  `Status` (positive), `Error` (negative), `Verify` — exposed via `status()`/`error()`/`verify()`
  accessors (and `ScriptMessage#asStatus`/`asError`/`asVerify`). `Code`, `DescriptionCode`, and
  `Description` are surfaced **verbatim** (no bundled NCPDP code→meaning table). A `disposition`
  accessor (`"success"`/`"error"`/`"verify"`/`undefined`) is derived only from the body kind, so an
  `Error` can **never** be read as a success; a malformed message carrying multiple response bodies
  reports the most conservative disposition (`Error` first) and raises the new
  `RESPONSE_AMBIGUOUS_DISPOSITION` warning. `correlatesTo` exposes `<RelatesToMessageID>` so a
  response can be tied back to its request. Covers SCRIPT `v2017071` + `v2022011`.
- Project scaffold from the shared `@cosyte/*` parser template: the canonical toolchain (TypeScript
  ES2023 + strict rigor via `@cosyte/tsconfig`, ESLint 10 + type-checked `typescript-eslint` via
  `@cosyte/eslint-config`, Prettier via `@cosyte/prettier-config`, Vitest 4 + v8 coverage via
  `@cosyte/vitest-config`, dual ESM + CJS build via `tsup` + `@cosyte/tsup-config`, `attw` publish
  gate), thin callers of the reusable `cosyte/.github` CI/release workflows, Changesets on the
  `0.0.x` ladder, and the property-based conformance harness from `@cosyte/test-utils`.
- **SCRIPT NewRx structural read** (`@cosyte/ncpdp/script`): `parseScript(xml)` returns an immutable
  `ScriptMessage` and `newRx(msg)` projects the NewRx body — header (version/messageId/to/from/
  sentTime), patient, pharmacy, prescriber, and medication (coded drug + explicit strength surfaced
  side-by-side, never reconciled), with XPath-positioned tolerance warnings. Lenient by default:
  vendor quirks become `SCRIPT_WARNING_CODES`; only unrecoverable structural corruption throws a
  typed `NcpdpScriptParseError` (`SCRIPT_FATAL_CODES`). XXE-safe by construction (DOCTYPE/ENTITY
  payloads are refused). Supports SCRIPT `v2017071` + `v2022011`.
- **Shared `@cosyte/ncpdp/common` vocabulary**: `decimalValue` (float-free decimal validity),
  `ndcValue` (NDC segmentation classification), `recognizeCodeSystem`/`codedValue` (NDC/RXNORM/
  SNOMED/NCI/ICD10 qualifier mapping), and XPath position helpers.
- Runtime dependency on [`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser)
  for safe, namespace-aware XML parsing on the SCRIPT side — ratified in
  [`docs/adr/0001-xml-parser.md`](./docs/adr/0001-xml-parser.md). The Telecom side remains zero-dep.

### Changed

- Replaced the `VERSION`-only archetype stub surface with the real SCRIPT + common public API.

### Deprecated

### Removed

### Fixed

- **The Release workflow can actually start.** `.github/workflows/release.yml` calls the shared
  `cosyte/.github` pipeline, which requests `contents`/`id-token`/`pull-requests: write`, but declared
  no `permissions:` of its own — so it inherited the repo default of `contents: read`. A called
  workflow may only downgrade the caller's `GITHUB_TOKEN`, never escalate it, so GitHub rejected the
  workflow at startup (~1s, no jobs, no logs). Every Release run from June 2026 until now failed this
  way, unnoticed, because a `startup_failure` produces no logs to read. The caller job now declares
  the three scopes explicitly. CI-only — no runtime or API change.

### Security

[Unreleased]: https://github.com/cosyte/ncpdp/commits/main
