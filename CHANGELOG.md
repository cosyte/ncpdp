# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions and publishing are managed with [Changesets](https://github.com/changesets/changesets);
this file is maintained by hand (Changesets handles the version bump and publish only).

## [Unreleased]

The first pre-alpha release (`0.0.1`) will ship the initial public API surface. The package begins
its public history at `0.0.x`, per the cosyte version ladder (`0.0.x` until first alpha).

### Added

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

### Security

[Unreleased]: https://github.com/cosyte/ncpdp/commits/main
