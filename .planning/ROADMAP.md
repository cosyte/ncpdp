# @cosyte/ncpdp — Roadmap (v1)

North star: **A developer can parse a real-world NCPDP Telecom claim response OR a SCRIPT NewRx XML and pull useful fields out in one line — without having read either (paywalled) standard.**

- **Granularity:** standard (8 phases, 3–5 plans each anticipated)
- **Mode:** yolo (auto-advance enabled)
- **Parallelization:** enabled — plans within a phase may run in parallel where they touch disjoint modules
- **Coverage:** 155 / 155 v1 REQ-IDs mapped to exactly one phase

---

## Phases

- [ ] **Phase 1: Foundation & Architecture Lock-In** — Scaffold the repo, build, lint, and TypeScript toolchain; lock the one-package-vs-two architectural decision; lock the SCRIPT XML parser choice; establish the shared warning/error registry surface that every subsequent phase consumes.
- [ ] **Phase 2: Shared Vocabulary Layer** — Ship `@cosyte/ncpdp/common`: NDC parsing + normalization, NPI/DEA validation, SIG helpers, bundled versioned code lists (reject codes, DUR codes, dispense units, qualifiers), shared warning/error types. Every later phase depends on this.
- [ ] **Phase 3: Telecom Parser Core (vD.0)** — Tokenize Telecom input into header + segments + field-id-keyed fields; lenient default, strict mode, stable-coded warnings with byte-offset context, fatal errors. Typed transaction model across B1/B2/B3/E1/D1/N1/N2/N3.
- [ ] **Phase 4: Telecom Helpers, Serialization & vF6** — Ship the one-line DX for Telecom (`tx.patient`, `tx.prescriber`, `tx.product`, `tx.response.paid.amount`, `tx.response.rejects`, `tx.response.dur`); canonical serialization with round-trip; vF6 (XML) parse + round-trip reusing the named-helper surface.
- [ ] **Phase 5: SCRIPT Parser Core** — XML parsing with auto-detection of v2017071 vs v2022011; Surescripts envelope handling; typed message models across all v1 in-scope message types (NewRx, RxRenewal*, CancelRx*, RxChange*, RxFill, Verify, Status, Error, Password, GetMessage, MedicationHistory*, Census, RxTransfer*, REMSInitiation*); lenient default, strict mode, stable-coded warnings with XPath context.
- [ ] **Phase 6: SCRIPT Helpers, Structured SIG & Serialization** — Ship the one-line DX for SCRIPT (`rx.patient`, `rx.prescriber`, `rx.medication`, `rx.sig`, `rx.refills`, `rx.daw`); structured SIG + legacy free-text SIG; serialization with namespace-clean output and canonical Surescripts envelope; `buildScript()` constructor.
- [ ] **Phase 7: Profile System & Built-ins** — `defineProfile()` API with family-scoped options (telecom / script / both), extends + merge semantics, default-profile management, custom-segment + custom-element registration, PBM reject-code taxonomy overrides. 5 built-in profiles: Surescripts, CVS Caremark, Express Scripts/Cigna, OptumRx, Humana Pharmacy Solutions.
- [ ] **Phase 8: Examples, Starter Kit, Docs & Release** — 3 runnable examples, publishable profile starter kit, comprehensive README with cookbook covering both Telecom and SCRIPT, CHANGELOG + LICENSE + CONTRIBUTING, CI + publish workflows, `pnpm publish --dry-run` clean tarball.

---

## Phase Details

### Phase 1: Foundation & Architecture Lock-In
**Goal**: A developer cloning the repo can install, build, typecheck, lint, and test with a single command sequence. The load-bearing architectural decisions (one-package-vs-two, SCRIPT XML parser) are locked in ADRs before any parser code is written.
**Depends on**: Nothing (first phase)
**Requirements**: SETUP-01, SETUP-02, SETUP-03, SETUP-04, SETUP-05, SETUP-06, SETUP-07, SETUP-08
**Flagged for discuss-phase**: 
  1. **One package vs two** — subpath exports (`@cosyte/ncpdp/telecom`, `/script`, `/common`) is the lean; alternative is two packages + shared internal `@cosyte/ncpdp-common`. Must be resolved before Phase 2 begins.
  2. **SCRIPT XML parser choice** — evaluate `fast-xml-parser`, `xmldoc`, `@xmldom/xmldom`, `libxmljs2` against criteria: namespace handling, round-trip fidelity, bundle size, maintenance status, MIT/Apache license. Produce an ADR; reuse `@cosyte/ccda` decision if that project exists.
  3. **PBM reject code taxonomy depth** — scope the taxonomy bundled with each built-in PBM profile (Surescripts canonical + 4 PBM profiles). Minimal (critical codes only) vs comprehensive (every published code). Decide here so Phase 7 plans are sized correctly.
**Success Criteria** (what must be TRUE):
  1. A developer can run `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test` from a clean clone and every command exits 0 with zero warnings.
  2. A developer importing `@cosyte/ncpdp/telecom`, `@cosyte/ncpdp/script`, or `@cosyte/ncpdp/common` from an ESM or CJS project resolves the correct entry through the `exports` map and receives typed intellisense for that subpath.
  3. A developer inspecting `package.json` sees ≤ 3 declared runtime dependencies, each backed by a committed ADR under `.planning/adrs/`; zero runtime deps reachable from `@cosyte/ncpdp/telecom` or `@cosyte/ncpdp/common` at import time.
  4. A developer opens `.planning/adrs/` and finds locked ADRs for: package-architecture (one vs two), SCRIPT XML parser choice, and code-list bundling strategy.
  5. A developer running the CI workflow on a push sees install → typecheck → lint → format:check → test → build → examples green across Node 18/20/22.
**Plans**: 4 plans anticipated
Plans:
- [ ] 01-PLAN-01-architecture-adr-and-scaffold.md — ADR-001 (one-vs-two), ADR-002 (SCRIPT XML parser), ADR-003 (code-list bundling); package.json with subpath exports; tsconfig (strict + noUncheckedIndexedAccess); LICENSE; .gitignore; src/{telecom,script,common}/index.ts stubs
- [ ] 01-PLAN-02-build-and-dual-entry.md — tsup.config.ts for dual ESM+CJS with .d.ts across 3 entry points; verify subpath resolution via a smoke test from both ESM and CJS consumers
- [ ] 01-PLAN-03-lint-test-format.md — ESLint flat config, Prettier, Vitest config with per-directory coverage gates (telecom/script/common/helpers ≥ 90% branches), sanity test per entry point
- [ ] 01-PLAN-04-ci-and-pipeline-smoke.md — .github/workflows/ci.yml across Node 18/20/22; .github/workflows/publish.yml (workflow_dispatch-only); run full pnpm pipeline end-to-end; commit lockfile
**UI hint**: no

### Phase 2: Shared Vocabulary Layer
**Goal**: A developer importing `@cosyte/ncpdp/common` receives production-grade NDC/NPI/DEA validation and parsing, best-effort SIG helpers, and bundled versioned code-list lookups that never fetch at runtime.
**Depends on**: Phase 1
**Requirements**: COMMON-01, COMMON-02, COMMON-03, COMMON-04, COMMON-05, COMMON-06, COMMON-07, COMMON-08, COMMON-09, COMMON-10, COMMON-11, COMMON-12
**Success Criteria** (what must be TRUE):
  1. A developer calling `parseNdc` / `formatNdc` can round-trip between 10-digit, 11-digit, and dashed forms for every NDC in the test fixture set.
  2. A developer calling `isValidNpi` and `isValidDea` receives correct validation across a test fixture of 100+ real-and-fake identifiers (positive and negative cases).
  3. A developer calling `parseSig(freeText)` receives a best-effort FHIR-Dosage-shaped object for canonical phrasings ("Take 1 tablet by mouth twice daily"), with unparseable fields returning `undefined`; JSDoc clearly labels this as lossy.
  4. A developer importing any code-list lookup (`lookupRejectCode`, `lookupDispenseUnit`, `lookupDurConflictCode`, `lookupQuantityQualifier`, `lookupPrescriberIdQualifier`) sees resolved descriptions from bundled data with no runtime fetch; `CODE_LIST_SNAPSHOT_DATE` exposes the ISO-8601 snapshot date.
  5. A developer adding a new code-list snapshot triggers a release event (documented in CONTRIBUTING), not a runtime update.
**Plans**: 4 plans anticipated
Plans:
- [ ] 02-PLAN-01-ndc-npi-dea.md — NDC parse/format/normalize (5-4-2 ↔ 11-digit ↔ dashed), NPI Luhn validation, DEA 2-letter-7-digit validation with optional last-name check
- [ ] 02-PLAN-02-sig-helpers.md — parseSig (free-text → FHIR-Dosage-shaped, best-effort, lossy), flattenSig (structured → free-text, lossy); JSDoc labeling on both
- [ ] 02-PLAN-03-code-list-bundling.md — Bundle reject codes, DUR conflict + professional-service codes, dispense unit codes, quantity qualifier codes, prescriber ID qualifier codes as frozen plain-object snapshots; CODE_LIST_SNAPSHOT_DATE export; integrity test
- [ ] 02-PLAN-04-shared-warnings-errors.md — NcpdpParseError + NcpdpParseWarning + NcpdpProfileDefinitionError class hierarchy; shared WARNING_CODES + FATAL_CODES registries used by both parsers; onWarning emitter chokepoint pattern (mirror @cosyte/hl7 Plan 02-01)
**UI hint**: no

### Phase 3: Telecom Parser Core (vD.0)
**Goal**: A developer calling `parseTelecom(raw)` on any well-formed Telecom vD.0 transaction — including vendor-quirky input — receives a structurally correct, field-id-keyed transaction model across B1/B2/B3/E1/D1/N1/N2/N3 with stable, positional warnings for every deviation.
**Depends on**: Phase 2
**Requirements**: TC-PARSE-01, TC-PARSE-02, TC-PARSE-03, TC-PARSE-04, TC-PARSE-05, TC-PARSE-06, TC-PARSE-07, TC-PARSE-08, TC-PARSE-09, TC-PARSE-10, TC-MODEL-01, TC-MODEL-02, TC-MODEL-03, TC-MODEL-04, TC-MODEL-05, TC-MODEL-06, TC-MODEL-07, TC-MODEL-08, TC-TOL-01, TC-TOL-02, TC-TOL-03, TC-TOL-04, TC-TOL-05, TC-TOL-06, TC-TOL-07, TC-TOL-08
**Success Criteria** (what must be TRUE):
  1. A developer can parse a message using FS/GS/RS framing and receive correctly decomposed segments, fields (keyed by 3-char field ID), repetitions, and transaction-type-specific structure across all 8 in-scope transaction codes.
  2. A developer parsing a message with padded fields, unknown reject codes, missing optional segments, trailing bytes, or charset fallback gets a parsed transaction in lenient mode plus `tx.warnings` entries with stable codes and byte-offset context — and receives `onWarning` callbacks as they are emitted.
  3. A developer parsing a structurally broken transaction (missing header, invalid framing, empty input, unsupported version) receives a thrown `NcpdpParseError` with stable code, byte offset, and snippet — even in lenient mode.
  4. A developer opting into `{ strict: true }` gets every Tier 2 deviation escalated to a thrown `NcpdpParseError` rather than a warning.
  5. A developer accessing `tx.transactionCode`, `tx.version`, `tx.header`, `tx.patient`, `tx.get('AM01')`, and `tx.transactionCode === 'B1'` narrowing receives typed values; immutability is enforced (direct mutation no-op).
**Plans**: 5 plans anticipated
Plans:
- [ ] 03-PLAN-01-framing-and-tokenize.md — FS/GS/RS tokenizer, header reader (version + transaction code + separator overrides), segment splitter preserving order, fatal codes (NO_HEADER / INVALID_FRAMING / UNSUPPORTED_VERSION / EMPTY_INPUT)
- [ ] 03-PLAN-02-segment-and-field-model.md — TelecomSegment + TelecomField shapes; field-id-keyed access; isPresent flag; readonly arrays; immutable mutation methods
- [ ] 03-PLAN-03-transaction-typed-interfaces.md — Typed interfaces per transaction code (TelecomB1Request/Response, B2, B3, E1, D1, N1/N2/N3); typed alias map so tx.header.versionRelease shorthand works; version narrowing
- [ ] 03-PLAN-04-tolerance-and-warnings.md — 9 Tier-2 warning codes emitted from the right chokepoints (PADDED / UNKNOWN_TRANSACTION_CODE / UNKNOWN_REJECT_CODE / UNKNOWN_DUR_CODE / MISSING_OPTIONAL_SEGMENT / UNEXPECTED_SEGMENT / FIELD_LENGTH_EXCEEDED / CHARSET_FALLBACK / TRAILING_BYTES); onWarning; strict-mode escalation chokepoint
- [ ] 03-PLAN-05-public-parsetelecom.md — public parseTelecom entry (string + Buffer); charset fallback; BOM + line-ending normalization; barrel exports from src/telecom/index.ts
**UI hint**: no

### Phase 4: Telecom Helpers, Serialization & vF6
**Goal**: A developer fulfills the Telecom-side north star — one-line extraction of patient, prescriber, product, paid amount, reject reasons, and DUR warnings — and can round-trip a parsed transaction back to canonical bytes. vF6 (XML) parsing shares the same named-helper surface.
**Depends on**: Phase 3
**Requirements**: TC-HELP-01, TC-HELP-02, TC-HELP-03, TC-HELP-04, TC-HELP-05, TC-HELP-06, TC-HELP-07, TC-HELP-08, TC-HELP-09, TC-HELP-10, TC-SER-01, TC-SER-02, TC-SER-03, TC-SER-04, TC-SER-05, TC-F6-01, TC-F6-02, TC-F6-03, TC-F6-04, TC-F6-05
**Success Criteria** (what must be TRUE):
  1. A developer can read `tx.patient.id`, `tx.prescriber.npi`, `tx.product.ndc`, `tx.claim.rxNumber`, `tx.response.paid.amount`, `tx.response.rejects`, and `tx.response.dur.warnings` on any transaction with the corresponding segments; absent fields return `undefined` and never throw.
  2. A developer calling `tx.toString()` / `tx.toBytes()` on any parsed transaction receives canonical NCPDP output; `parseTelecom(tx.toBytes())` yields an equivalent transaction for every fixture.
  3. A developer calling `buildTelecom({ transactionCode: 'B1', version: 'D.0', ... }).addSegment(...).toBytes()` constructs a valid outbound B1 request from scratch; required-by-type segments enforced in strict mode, warned in lenient.
  4. A developer calling `parseTelecomF6(xml)` receives a `TelecomTransaction` with `tx.version === { major: 'F', release: '6' }`; the same named-helper accessors work where field semantics overlap vD.0; vF6-specific fields accessible via XPath-style path.
  5. A developer can round-trip `parseTelecomF6 → toString → parseTelecomF6` on canonical vF6 fixtures with structural equivalence.
**Plans**: 4 plans anticipated
Plans:
- [ ] 04-PLAN-01-helpers-patient-prescriber-pharmacy-product-claim.md — tx.patient / tx.prescriber / tx.pharmacy / tx.product / tx.claim named helpers with cache; never-throws sweep
- [ ] 04-PLAN-02-helpers-response-paid-rejects-dur-cob.md — tx.response.paid / rejects / dur.warnings / coordinationOfBenefits with profile-aware lookups
- [ ] 04-PLAN-03-serialization-and-build.md — tx.toString / toBytes / toJSON / prettyPrint + buildTelecom constructor with required-field enforcement + round-trip sweep
- [ ] 04-PLAN-04-vf6-xml-variant.md — parseTelecomF6 XML parser; named-helper reuse adaptor (translate vF6 element paths to the shared helper surface); vF6-specific XPath accessors; vF6 serialization; vF6 round-trip
**UI hint**: no

### Phase 5: SCRIPT Parser Core
**Goal**: A developer calling `parseScript(raw)` on any well-formed SCRIPT v2017071 or v2022011 message — with or without a Surescripts envelope — receives a typed, version-aware, element-addressable message model across all v1 in-scope message types, with stable, XPath-positioned warnings for every deviation.
**Depends on**: Phase 2
**Requirements**: SC-PARSE-01, SC-PARSE-02, SC-PARSE-03, SC-PARSE-04, SC-PARSE-05, SC-PARSE-06, SC-PARSE-07, SC-PARSE-08, SC-PARSE-09, SC-MODEL-01, SC-MODEL-02, SC-MODEL-03, SC-MODEL-04, SC-MODEL-05, SC-MODEL-06, SC-MODEL-07, SC-MODEL-08, SC-TOL-01, SC-TOL-02, SC-TOL-03, SC-TOL-04, SC-TOL-05, SC-TOL-06, SC-TOL-07
**Success Criteria** (what must be TRUE):
  1. A developer passing XML in either supported SCRIPT version, with or without the Surescripts envelope, receives a `ScriptMessage` whose `messageType` and `version` are correctly narrowed; `msg.envelope` and `msg.body` are exposed independently when the envelope is present.
  2. A developer can access every in-scope message type (NewRx, RxRenewal*, CancelRx*, RxChange*, RxFill, Verify, Status, Error, Password, GetMessage, MedicationHistory*, Census, RxTransfer*, REMSInitiation*) through its typed interface; `msg.get(path)` and `msg.getAll(path)` resolve dot-path access with `undefined`/`[]` for misses (no throw).
  3. A developer parsing SCRIPT with missing namespace prefixes, version/namespace mismatch, embedded XHTML in `<DrugDescription>`, unknown message type, or missing Surescripts envelope fields gets warnings in lenient mode with XPath context and receives thrown `NcpdpParseError` in strict mode.
  4. A developer parsing malformed input (`NCPDP_SCRIPT_NOT_XML`, `NCPDP_SCRIPT_NO_MESSAGE_ROOT`, `NCPDP_SCRIPT_UNSUPPORTED_VERSION`, `EMPTY_INPUT`) receives a thrown `NcpdpParseError` with stable code and positional context even in lenient mode.
  5. A developer can rely on immutability: direct mutation on a parsed `ScriptMessage` has no effect; explicit `setElement`, `addElement`, `removeElement` methods are the only mutation path.
**Plans**: 5 plans anticipated
Plans:
- [ ] 05-PLAN-01-xml-parser-integration-and-shell.md — Integrate chosen XML parser (per Phase 1 ADR-002); ScriptMessage shell; version auto-detection from namespace + <MessageType>; 4 fatal codes
- [ ] 05-PLAN-02-envelope-and-message-shapes.md — Surescripts envelope splitter (msg.envelope vs msg.body); typed interfaces per in-scope message type; msg.header common accessor
- [ ] 05-PLAN-03-xpath-access-and-immutability.md — msg.get / getAll XPath-style resolver with []-indexed repeats; immutability; explicit mutation methods
- [ ] 05-PLAN-04-typed-primitives.md — Date/dateTime parsing (accept both declared SCRIPT formats + ISO fallback with warning); Quantity typed object; raw-string always accessible
- [ ] 05-PLAN-05-tolerance-and-strict-mode.md — 8 Tier-2 warning codes with XPath context (MISSING_NAMESPACE / LEGACY_SIG_FORMAT / VERSION_MISMATCH / EMBEDDED_XHTML / UNKNOWN_MESSAGE_TYPE / MISSING_ENVELOPE_FIELD / UNEXPECTED_ELEMENT / DATE_FALLBACK_FORMAT); onWarning; strict-mode escalation; public parseScript entry + barrel
**UI hint**: no

### Phase 6: SCRIPT Helpers, Structured SIG & Serialization
**Goal**: A developer fulfills the SCRIPT-side north star — one-line extraction of patient, prescriber, medication, SIG, refills, DAW — and can round-trip a parsed message back to namespace-clean XML with canonical Surescripts envelope. Structured and legacy free-text SIG are both exposed with clear labeling.
**Depends on**: Phase 5
**Requirements**: SC-HELP-01, SC-HELP-02, SC-HELP-03, SC-HELP-04, SC-HELP-05, SC-HELP-06, SC-HELP-07, SC-HELP-08, SC-SIG-01, SC-SIG-02, SC-SIG-03, SC-SIG-04, SC-SER-01, SC-SER-02, SC-SER-03, SC-SER-04, SC-SER-05
**Success Criteria** (what must be TRUE):
  1. A developer reads `rx.patient.lastName`, `rx.prescriber.npi`, `rx.medication.drugDescription`, `rx.medication.ndc`, `rx.sig.text`, `rx.refills.allowed`, `rx.daw`, and the rest of the named-helper contract on every applicable message; absent fields return `undefined` and never throw.
  2. A developer accessing `rx.sig.structured` on a SCRIPT 2017+ message carrying structured SIG receives the verbatim element tree; `rx.sig.flat` (calling `flattenSig`) returns a lossy free-text rendering clearly labeled as such; pre-2017 free-text messages surface `NCPDP_SCRIPT_LEGACY_SIG_FORMAT` and populate `rx.sig.text`.
  3. A developer calling `msg.toString()` receives namespace-clean XML; `parseScript(msg.toString())` yields an equivalent `ScriptMessage` for every fixture including envelope-wrapped ones.
  4. A developer calling `buildScript({ messageType: 'NewRx', version: '2022011', header: {...}, body: {...} }).toString()` constructs a valid outbound NewRx that round-trips; required elements per SCRIPT schema enforced in strict mode, warned in lenient.
  5. A developer calling `msg.toJSON()` receives a structured JSON representation with message-type discriminator; `msg.prettyPrint()` returns indented namespace-clean XML suitable for logging.
**Plans**: 4 plans anticipated
Plans:
- [ ] 06-PLAN-01-helpers-patient-prescriber-pharmacy.md — rx.patient / rx.prescriber / rx.pharmacy named helpers with cache; shared resolver for SCRIPT-wide entity shapes; never-throws sweep
- [ ] 06-PLAN-02-helpers-medication-sig-refills-daw.md — rx.medication / rx.sig (text + structured + flat) / rx.refills / rx.daw helpers; structured SIG verbatim passthrough; flattenSig integration with lossy-label enforcement
- [ ] 06-PLAN-03-serialization-and-envelope.md — msg.toString / toJSON / prettyPrint with namespace preservation + canonical Surescripts envelope; round-trip fixture sweep across all in-scope message types × both versions
- [ ] 06-PLAN-04-buildscript-constructor.md — buildScript({ messageType, version, header, body }) with required-element enforcement per message-type schema; round-trip tests per message type
**UI hint**: no

### Phase 7: Profile System & Built-ins
**Goal**: A developer defines, extends, and composes trading-partner profiles (PBMs, Surescripts variants, EHR-specific quirks) via a first-class public API that works identically for Telecom and SCRIPT, and relies on 5 ready-made profiles that reduce warnings against realistic fixtures.
**Depends on**: Phase 3, Phase 4, Phase 5, Phase 6
**Requirements**: PROF-01, PROF-02, PROF-03, PROF-04, PROF-05, PROF-06, PROF-07, PROF-08, PROF-09, BIP-01, BIP-02, BIP-03, BIP-04, BIP-05, BIP-06
**Success Criteria** (what must be TRUE):
  1. A developer calling `defineProfile({ name, family, ... })` with valid input receives a readonly `Profile` object exposing all documented fields and `describe()`; invalid input throws `NcpdpProfileDefinitionError` with an actionable message.
  2. A developer using `extends: parentProfile` or `extends: [p1, p2]` receives a merged profile whose semantics match the documented merge rules (scalars last-wins, arrays concat+dedupe, record options deep-merge, `onWarning` chain); lineage is preserved.
  3. A developer calling `parseTelecom(raw, profile)` or `parseScript(raw, profile)` sees `tx.profile?.name` / `msg.profile?.name` populated; custom Telecom segments and custom SCRIPT elements registered on the profile are accessible by declared name; PBM-specific reject-code descriptions replace the baseline where overridden; re-serialization produces canonical NCPDP output.
  4. A developer calling `setDefaultProfile(p)` / `getDefaultProfile()` / `setDefaultProfile(null)` manages a process-scoped default; explicit argument overrides; `parseTelecom(raw, { profile: null })` opts out for a single call.
  5. A developer importing `profiles.surescripts`, `profiles.cvsCaremark`, `profiles.expressScripts`, `profiles.optumRx`, or `profiles.humanaPharmacy` and parsing a realistic fixture with the profile sees fewer warnings than parsing the same fixture in lenient mode without a profile; each built-in is defined through the public `defineProfile()` API.
**Plans**: 5 plans anticipated
Plans:
- [ ] 07-PLAN-01-defineprofile-core-and-validation.md — defineProfile() core + 5 NcpdpProfileDefinitionError throw paths + describe() + readonly shape; Profile type with family:'telecom'|'script'|'both'
- [ ] 07-PLAN-02-extends-merge-semantics.md — extends single + array; merge rules (scalars / arrays / record options / onWarning chain); lineage; rogue-parent re-check
- [ ] 07-PLAN-03-custom-segments-elements-and-reject-overrides.md — Custom Telecom Z-segment registration + runtime access; custom SCRIPT element registration + runtime access; PBM reject-code taxonomy override resolution in tx.response.rejects
- [ ] 07-PLAN-04-default-profile-and-parse-dispatch.md — setDefaultProfile / getDefaultProfile / opt-out; parseTelecom / parseScript dispatch with profile discrimination; round-trip profile-agnostic serialization
- [ ] 07-PLAN-05-five-builtin-profiles.md — surescripts (both), cvsCaremark (telecom), expressScripts (telecom), optumRx (telecom), humanaPharmacy (telecom) via public defineProfile() API; handcrafted fixtures per built-in; BIP-06 warning-reduction test sweep
**UI hint**: no

### Phase 8: Examples, Starter Kit, Docs & Release
**Goal**: A developer landing on the README goes from zero to parsing both a real Telecom response and a real SCRIPT NewRx in under two minutes, finds a recipe for every common task across both standards, can copy the profile starter kit into a new directory to publish their own PBM or EHR profile package in minutes, and sees a clean `pnpm publish --dry-run` under `@cosyte/ncpdp`.
**Depends on**: Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, Phase 7
**Requirements**: KIT-01, KIT-02, KIT-03, KIT-04, KIT-05, KIT-06, KIT-07, EX-01, EX-02, EX-03, DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, DOC-06, DOC-07, DOC-08, DOC-09, DOC-10, DOC-11, DOC-12, DOC-13, DOC-14, DOC-15, TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07, TEST-08
**Success Criteria** (what must be TRUE):
  1. A developer running `tsx examples/parse-telecom-b1-response.ts`, `examples/build-script-newrx.ts`, and `examples/extract-paid-and-rejects.ts` sees each example execute end-to-end and print its documented output.
  2. A developer copying `examples/profile-starter-kit/` into a new directory runs `pnpm install && pnpm test && pnpm build` with success against the sample fixture; `dist/` matches `package.json` exports; CI + publish workflows pass `actionlint`; `CUSTOMIZING.md` walks through rename → choose family → extend base profile → define custom segments/elements → register PBM reject overrides → fixtures → publish; `{{YOUR_ORG}}` / `{{PROFILE_NAME}}` placeholders consistent.
  3. A developer reading the README finds: one-sentence value prop + badges; NCPDP-in-90-seconds section explaining the two-standards reality; 30-second quickstart blocks for both Telecom and SCRIPT; subpath-exports layout; 8–10 bullet feature list; full cookbook covering both standards; top-level Profiles section with starter-kit link; 3-tier Real-World Tolerance section with table + runnable warning-iteration example; Error Handling section; Contributing section with explicit invite for PBM-specific and EHR-specific profile contributions; "Built by Cosyte" footer with license link.
  4. A developer checking `CHANGELOG.md` sees Keep-a-Changelog format with `[Unreleased]`; `LICENSE` (MIT) at repo root; README and CONTRIBUTING.md state explicitly that the package does not redistribute NCPDP-copyrighted standard text.
  5. A developer running `pnpm test --coverage` sees ≥ 90% line coverage on `src/telecom/`, `src/script/`, `src/common/`, `src/helpers/`; vendor-quirk fixtures cover every Tier 2 warning code; malformed fixtures cover every Tier 3 fatal code in both lenient and strict mode; built-in profile fixtures demonstrate warning reduction per profile.
  6. A developer running `pnpm publish --dry-run` in CI sees a clean tarball under `@cosyte/ncpdp` with `publishConfig.access: public` enforced.
**Plans**: 5 plans anticipated
Plans:
- [ ] 08-PLAN-01-examples.md — 3 runnable example scripts (parse Telecom B1 response, build SCRIPT NewRx, extract paid + rejects) + fixtures + README per example + pnpm examples script
- [ ] 08-PLAN-02-profile-starter-kit.md — examples/profile-starter-kit/ subtree (configs + sample profile covering both telecom and script families + test + fixtures + ci.yml + publish.yml + README + CUSTOMIZING.md + LICENSE) with {{YOUR_ORG}} / {{PROFILE_NAME}} placeholders
- [ ] 08-PLAN-03-readme-and-cookbook.md — Comprehensive README.md (value prop + badges + NCPDP-in-90-seconds + quickstarts × 2 + subpath-exports layout + feature list + three access patterns + full cookbook × both standards + Profiles section + Tolerance section + Error Handling + Contributing + footer)
- [ ] 08-PLAN-04-changelog-contributing-license-and-no-redistribute.md — CHANGELOG.md (Keep-a-Changelog + [Unreleased]) + CONTRIBUTING.md + LICENSE verify + explicit "no-redistribute" statement in README + CONTRIBUTING
- [ ] 08-PLAN-05-test-hardening-and-publish-verify.md — TEST-01..08 closure (coverage gate + canonical + edge-case + malformed + vendor-quirks + built-in-profile fixtures + profile-authoring + code-list integrity); pnpm publish --dry-run validation; end-to-end pipeline smoke
**UI hint**: no

---

## Parallelization Notes

Within each phase, plans that touch disjoint modules may run in parallel; plans that share a module serialize. Concrete expectations:

- **Phase 1:** ADR drafting, package scaffold, build config, and lint/test configs can start in parallel; CI pipeline plan depends on everything else and runs last.
- **Phase 2:** NDC/NPI/DEA validators and SIG helpers are mutually independent and parallelizable. Code-list bundling plan is independent of validators. Shared error/warning registry is a common dependency for both downstream parsers — finish it before Phase 3 and Phase 5 begin in parallel.
- **Phase 3:** Framing/tokenize is a serial dependency for segment/field model, which is a serial dependency for typed transaction interfaces. Tolerance+warnings plan can develop in parallel once tokenize is done. Public `parseTelecom` entry is a capstone.
- **Phase 4:** Patient/prescriber/pharmacy/product/claim helpers are mostly disjoint and parallelizable. Response helpers (paid/rejects/dur/cob) are independent of the request helpers. Serialization+buildTelecom is independent of helpers. vF6 XML variant starts in parallel once the XML parser integration is in place (Phase 5 Plan 1 can share its landing with this plan).
- **Phase 5:** XML parser integration + shell is a hard serial dependency; envelope handling, typed message shapes, and XPath access can then parallelize. Tolerance+strict-mode is a capstone.
- **Phase 6:** Helpers subdivide into patient/prescriber/pharmacy (one plan) and medication/SIG/refills/DAW (another plan) — disjoint. Serialization+envelope and `buildScript` are independent of helpers.
- **Phase 7:** `defineProfile` core is first; extends + merge and default-profile can then parallelize. Custom-segment/custom-element registration is independent. 5 built-in profiles are mutually independent and all parallelizable once the API stabilizes.
- **Phase 8:** Examples, starter kit, and README sub-plans (quickstarts + feature list, three access patterns, cookbook, profiles section, tolerance section, error handling, contributing/footer) are largely disjoint and parallel. Test hardening + publish verify is a capstone.

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Architecture Lock-In | 0/4 | Not started | — |
| 2. Shared Vocabulary Layer | 0/4 | Not started | — |
| 3. Telecom Parser Core (vD.0) | 0/5 | Not started | — |
| 4. Telecom Helpers, Serialization & vF6 | 0/4 | Not started | — |
| 5. SCRIPT Parser Core | 0/5 | Not started | — |
| 6. SCRIPT Helpers, Structured SIG & Serialization | 0/4 | Not started | — |
| 7. Profile System & Built-ins | 0/5 | Not started | — |
| 8. Examples, Starter Kit, Docs & Release | 0/5 | Not started | — |

**v1 milestone:** 0/8 phases complete. Next: `/gsd-discuss-phase 1` to resolve the three load-bearing decisions (one-package-vs-two, SCRIPT XML parser, PBM reject-code taxonomy depth) before planning begins.

---

*Last updated: 2026-04-22 — initial roadmap via `/gsd-new-project`. 155 v1 REQ-IDs mapped across 8 phases, 36 anticipated plans.*
