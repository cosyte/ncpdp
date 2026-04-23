# @cosyte/ncpdp — v1 Requirements

All requirements are user-facing behaviors a developer consuming `@cosyte/ncpdp` can verify. REQ-IDs are stable across phases and referenced from `ROADMAP.md` for traceability.

Conventions:
- **TC-*** — Telecommunication Standard (vD.0 + vF6) REQs
- **SC-*** — SCRIPT Standard (v2017071 + v2022011) REQs
- **COMMON-*** — shared vocabulary layer (NDC, NPI, DEA, SIG, code lists)
- **PROF/BIP/KIT** — profile system, built-in profiles, starter kit
- **SETUP/EX/DOC/TEST** — project-level scaffolding / examples / docs / testing

---

## v1 Requirements

### Project Setup & Build (SETUP)

- [ ] **SETUP-01** — Developer can run `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test` from a clean clone and every command exits 0 with zero warnings.
- [ ] **SETUP-02** — Package publishes as dual ESM + CJS with a correct `exports` map, including subpath exports `@cosyte/ncpdp/telecom`, `@cosyte/ncpdp/script`, and `@cosyte/ncpdp/common`; consumers on either module system resolve the right entry point for each subpath.
- [ ] **SETUP-03** — Package has ≤ 3 runtime dependencies declared in `package.json`; zero direct runtime deps are reachable when importing only `@cosyte/ncpdp/telecom` or `@cosyte/ncpdp/common`. Each runtime dep is justified in an ADR committed to the repo.
- [ ] **SETUP-04** — TypeScript consumers get full IntelliSense (types, JSDoc, `@example` tags) on every public API surface — verified by inspecting emitted `.d.ts`.
- [ ] **SETUP-05** — Repo targets Node 18+ and compiles to ES2022 with `"strict": true` and `"noUncheckedIndexedAccess": true`.
- [ ] **SETUP-06** — `pnpm lint` and `pnpm typecheck` pass with zero warnings (`--max-warnings=0`).
- [ ] **SETUP-07** — CI workflow runs install → typecheck → lint → format:check → test → build → examples on every push/PR across Node 18/20/22 matrix; coverage regression fails the build.
- [ ] **SETUP-08** — Publish workflow (workflow_dispatch-only) publishes `@cosyte/ncpdp` to npm under the correct name with `publishConfig.access: public`; tarball dry-run passes in CI before any publish.

### Shared Vocabulary Layer (COMMON)

- [ ] **COMMON-01** — `parseNdc(raw)` accepts 10-digit (5-4-2) and 11-digit NDC strings with or without dashes; returns `{ labeler, product, packageSize, normalized11 }`; invalid input returns `undefined` (no throw).
- [ ] **COMMON-02** — `formatNdc(ndc, { style: '11-digit' | '5-4-2' | 'dashed' })` emits the requested form; round-trip `parseNdc → formatNdc` preserves the value across styles.
- [ ] **COMMON-03** — `isValidNpi(value)` validates a 10-digit NPI by Luhn check digit per the CMS algorithm; returns `boolean`; `normalizeNpi` strips non-digits.
- [ ] **COMMON-04** — `isValidDea(value, { lastNameInitial })` validates a 9-character DEA number (2 letters + 7 digits) by the DEA check-digit algorithm, optionally verifying the second letter matches the prescriber's last-name initial.
- [ ] **COMMON-05** — `parseSig(text)` accepts free-text SIG strings (e.g. "Take 1 tablet by mouth twice daily for 10 days") and returns a best-effort FHIR-Dosage-shaped object (`{ verb, quantity, unit, route, frequency, duration, asNeeded }`); unparseable fields return `undefined`. JSDoc clearly labels this as lossy.
- [ ] **COMMON-06** — `flattenSig(structuredSig)` accepts a SCRIPT 2017+ structured `<Sig>` element and returns a free-text representation; JSDoc clearly labels this as lossy.
- [ ] **COMMON-07** — `lookupDispenseUnit(code)` resolves a NCPDP Dispense Unit of Measure code (e.g. `EA`, `ML`, `GM`) to `{ code, description, fhirUnit }`; unknown codes return `undefined`.
- [ ] **COMMON-08** — `lookupQuantityQualifier(code)` resolves a NCPDP quantity qualifier code to its description; unknown codes return `undefined`.
- [ ] **COMMON-09** — `lookupPrescriberIdQualifier(code)` resolves a NCPDP prescriber ID qualifier (NPI, DEA, SPI, state license, etc.) to `{ code, description, system }`; unknown codes return `undefined`.
- [ ] **COMMON-10** — `lookupRejectCode(code)` resolves an NCPDP Telecom reject code to `{ code, description, category }`; returns `undefined` for unknown codes (profiles can extend via PBM-specific taxonomies).
- [ ] **COMMON-11** — `lookupDurConflictCode(code)` and `lookupDurOutcomeCode(code)` resolve DUR Conflict and Professional Service codes to their descriptions.
- [ ] **COMMON-12** — All code-list lookups in COMMON read from bundled versioned snapshots; `@cosyte/ncpdp/common` exposes `CODE_LIST_SNAPSHOT_DATE` as a stable ISO-8601 string reflecting the snapshot date used in the current release. No runtime fetch, no dynamic import, no network.

### Telecom — Parsing & Decomposition (TC-PARSE)

- [ ] **TC-PARSE-01** — `parseTelecom(raw)` accepts a `string` or `Buffer` containing an NCPDP Telecom vD.0 request or response and returns a `TelecomTransaction` object. A developer does not need to supply transaction code or segment layout hints.
- [ ] **TC-PARSE-02** — Parser reads the transaction header (version/release, transaction code, transaction count, service provider, prescriber, etc.) from the Telecom header bytes — not hardcoded segment-by-segment — and exposes every header field via named accessors.
- [ ] **TC-PARSE-03** — Parser decomposes the byte stream into segments using the Segment Separator (`0x1E`), fields using the Field Separator (`0x1C`), and group/record fields using the Group Separator (`0x1D`); honors custom separators when declared in the header.
- [ ] **TC-PARSE-04** — Parser handles all Telecom-defined transaction types in v1 scope: B1 (billing), B2 (reversal), B3 (rebill), E1 (eligibility verification), D1 (predetermination), N1/N2/N3 (information reporting), and reports unknown transaction codes via `NCPDP_TELECOM_UNKNOWN_TRANSACTION_CODE` warning while still structurally parsing.
- [ ] **TC-PARSE-05** — Parser preserves segments in original order, including repeating segments (e.g. multiple insurance, multiple DUR) and transmission-specific segments; `tx.allSegments()` iterates every segment in order.
- [ ] **TC-PARSE-06** — Every Telecom field is keyed by its official 3-character field ID (e.g. `AM01`, `D8`, `C8`) and accessible via `tx.get('AM01')`; also accessible via the typed named-helper layer (TC-HELP).
- [ ] **TC-PARSE-07** — Parser distinguishes present-but-empty fields from absent fields (the Telecom wire format is positional within a segment but field-id-keyed); each `TelecomField` carries an explicit `isPresent: boolean`.
- [ ] **TC-PARSE-08** — Parser accepts a UTF-8 BOM at the start of the input silently (no warning); accepts CR/LF/CRLF/mixed line endings within repeated-record blocks and normalizes internally.
- [ ] **TC-PARSE-09** — Parser accepts a `Buffer` input and handles non-ASCII field values per the Telecom character-set conventions; unknown encoding declarations warn and fall back to UTF-8.
- [ ] **TC-PARSE-10** — Parser emits a readonly `tx.segments` array and readonly `tx.fields` keyed by field ID; direct mutation on the parsed object has no effect.

### Telecom — Transaction Model & Typed Access (TC-MODEL)

- [ ] **TC-MODEL-01** — Every v1 Telecom transaction (B1/B2/B3/E1/D1/N1/N2/N3) has a typed interface exported from `@cosyte/ncpdp/telecom` (`TelecomB1Request`, `TelecomB1Response`, `TelecomB2Request`, etc.) narrowing required and optional segments per the NCPDP Transaction Header layout.
- [ ] **TC-MODEL-02** — `tx.header`, `tx.patient`, `tx.insurance[]`, `tx.claim[]`, `tx.pricing`, `tx.dur[]`, `tx.cob[]`, `tx.response` expose typed segment objects; absent optional segments return `undefined` (or empty array) rather than throw.
- [ ] **TC-MODEL-03** — Typed alias map: every field ID has a typed alias (e.g. `tx.header.versionRelease` maps to `D0`), so developers never need to memorize field IDs. Both forms are supported.
- [ ] **TC-MODEL-04** — `tx.transactionCode` returns a typed union (`'B1' | 'B2' | 'B3' | 'E1' | 'D1' | 'N1' | 'N2' | 'N3' | string`) so consumers can narrow via `if (tx.transactionCode === 'B1')`.
- [ ] **TC-MODEL-05** — `tx.get(fieldId)` returns `undefined` (not throw) when the field is absent; `tx.getAll(fieldId)` returns `[]` when none present.
- [ ] **TC-MODEL-06** — Parsed `TelecomTransaction` is immutable by default; mutation is possible only via explicit methods (`setField(fieldId, value)`, `addSegment(segmentId, fields)`, `removeSegment(segmentId, index)`); all changes reflected in subsequent reads and serialization.
- [ ] **TC-MODEL-07** — Helpers return parsed instances of typed composite value objects where applicable (e.g. NDC product info from `parseNdc`, dispense unit info from `lookupDispenseUnit`).
- [ ] **TC-MODEL-08** — `tx.version` exposes `{ major, release }` (e.g. `{ major: 'D', release: '0' }` for vD.0); developers can gate behavior on version.

### Telecom — Named Helpers (TC-HELP)

- [ ] **TC-HELP-01** — `tx.patient` exposes `{ id, idQualifier, firstName, lastName, dateOfBirth (Date), gender, addressLine1, city, state, zip, phoneNumber }` derived from the Patient Segment; absent fields return `undefined`.
- [ ] **TC-HELP-02** — `tx.prescriber` exposes `{ id, idQualifier, npi, dea, firstName, lastName, phoneNumber, stateLicense }` derived from the Prescriber Segment.
- [ ] **TC-HELP-03** — `tx.pharmacy` exposes `{ id, idQualifier (NPI/NCPDP ID/NABP), name }` derived from the header / service provider fields.
- [ ] **TC-HELP-04** — `tx.product` (for B1/B2/B3) exposes `{ ndc, parsedNdc, quantityDispensed, daysSupply, fillNumber, dispensingFee, compoundCode }`.
- [ ] **TC-HELP-05** — `tx.claim` on B1 exposes `{ rxNumber, rxNumberQualifier, dateOfService (Date), dawCode, priorAuthNumber, originCode, otherCoverageCode }`.
- [ ] **TC-HELP-06** — `tx.response.paid.amount` (for paid B1 responses) returns a `number` representing the total amount paid to pharmacy; `tx.response.patientPayAmount` returns patient cost-share; units documented (US cents or USD per NCPDP convention, clearly stated).
- [ ] **TC-HELP-07** — `tx.response.rejects` returns an array of `{ code, description, category }` for rejected claims; `description` resolved via `lookupRejectCode` + active profile's PBM-specific taxonomy if any.
- [ ] **TC-HELP-08** — `tx.response.dur.warnings` returns an array of DUR conflicts from the response with `{ reasonCode, reasonDescription, severity, freeText }`.
- [ ] **TC-HELP-09** — `tx.response.coordinationOfBenefits` (for paid B1 with COB) returns a typed object including OtherPayerId, OtherPayerAmountPaid, OtherPayerPatientResponsibility.
- [ ] **TC-HELP-10** — All TC-HELP accessors return `undefined` / `[]` for missing optional data and never throw.

### Telecom — Serialization & Round-Trip (TC-SER)

- [ ] **TC-SER-01** — `tx.toString()` (and `tx.toBytes()`) produces a canonical Telecom byte sequence regardless of quirks in the input (correct framing bytes, no padding beyond spec).
- [ ] **TC-SER-02** — Round-trip `parseTelecom → toBytes → parseTelecom` yields an equivalent `TelecomTransaction` for every canonical fixture (same header, segments, fields, values).
- [ ] **TC-SER-03** — `tx.toJSON()` returns a structured JSON representation of the full transaction suitable for snapshotting and cross-process transport.
- [ ] **TC-SER-04** — `tx.prettyPrint()` returns a human-readable multi-line string for logging/debugging (segment labels, field-id + aliased field names + values).
- [ ] **TC-SER-05** — `buildTelecom({ transactionCode, version, ... }).addSegment(...).toBytes()` constructs a valid outbound Telecom transaction from scratch; all required-by-transaction-type segments enforced at build time (strict mode) or warned (lenient).

### Telecom — vF6 XML Variant (TC-F6)

- [ ] **TC-F6-01** — `parseTelecomF6(raw)` accepts an NCPDP Telecom vF6 XML document (the next-gen Telecom replacement) and returns a `TelecomTransaction` (`{ version: { major: 'F', release: '6' } }`).
- [ ] **TC-F6-02** — Where vF6 field semantics overlap vD.0, the same named-helper surface (`tx.patient`, `tx.prescriber`, `tx.product`, `tx.response.paid.amount`) works transparently; developers do not branch on version for common extractions.
- [ ] **TC-F6-03** — vF6-specific fields not present in vD.0 are accessible via XPath-style dot-path (`tx.get('Header/ReceiverId')`) and documented in the cookbook.
- [ ] **TC-F6-04** — Serialization of a vF6 transaction produces namespace-clean XML per the NCPDP vF6 schema conventions.
- [ ] **TC-F6-05** — Round-trip `parseTelecomF6 → toString → parseTelecomF6` yields an equivalent transaction for canonical vF6 fixtures.

### Telecom — Real-World Tolerance (TC-TOL)

- [ ] **TC-TOL-01** — Default parse mode is lenient; `{ strict: true }` option escalates every Tier 2 warning to a thrown `NcpdpParseError`.
- [ ] **TC-TOL-02** — Tier 3 fatal errors throw `NcpdpParseError` with stable codes even in lenient mode: `NCPDP_TELECOM_NO_HEADER`, `NCPDP_TELECOM_INVALID_FRAMING`, `NCPDP_TELECOM_UNSUPPORTED_VERSION`, `EMPTY_INPUT`. Each error carries `{ message, code, byteOffset, snippet }`.
- [ ] **TC-TOL-03** — Parser emits Tier 2 warnings with stable codes and positional context (`byteOffset`, `segmentIndex`, `fieldId`) for defined scenarios including: `NCPDP_TELECOM_FIELD_PADDED`, `NCPDP_TELECOM_UNKNOWN_TRANSACTION_CODE`, `NCPDP_TELECOM_UNKNOWN_REJECT_CODE`, `NCPDP_TELECOM_UNKNOWN_DUR_CODE`, `NCPDP_TELECOM_MISSING_OPTIONAL_SEGMENT`, `NCPDP_TELECOM_UNEXPECTED_SEGMENT`, `NCPDP_TELECOM_FIELD_LENGTH_EXCEEDED`, `NCPDP_TELECOM_CHARSET_FALLBACK`, `NCPDP_TELECOM_TRAILING_BYTES`.
- [ ] **TC-TOL-04** — `tx.warnings` is always an array of `NcpdpParseWarning` objects (possibly empty) on a parsed transaction.
- [ ] **TC-TOL-05** — `onWarning` callback option is invoked for every warning as it is emitted.
- [ ] **TC-TOL-06** — Parser tolerates padded fields (leading/trailing whitespace per vendor convention) and emits `NCPDP_TELECOM_FIELD_PADDED` only when the padded content was non-empty.
- [ ] **TC-TOL-07** — Unknown reject codes, DUR codes, or dispense unit codes do not throw in lenient mode; they surface as warnings with the raw value preserved.
- [ ] **TC-TOL-08** — Strict mode option at `parseTelecom(raw, { strict: true })` escalates every Tier 2 warning to a thrown error with positional context intact.

### SCRIPT — Parsing & Version Detection (SC-PARSE)

- [ ] **SC-PARSE-01** — `parseScript(raw)` accepts a `string` or `Buffer` containing a SCRIPT XML document and returns a typed `ScriptMessage` narrowed to the specific message type.
- [ ] **SC-PARSE-02** — Parser auto-detects the SCRIPT version from the XML namespace and `<MessageType>` element; supports v2017071 and v2022011 with a common message shell.
- [ ] **SC-PARSE-03** — Parser accepts the Surescripts envelope wrapper (added on top of raw SCRIPT) and exposes both the envelope (`msg.envelope`) and the inner message (`msg.body`) cleanly.
- [ ] **SC-PARSE-04** — Parser handles all v1 in-scope message types: NewRx, RxRenewalRequest, RxRenewalResponse, CancelRx, CancelRxResponse, RxChangeRequest, RxChangeResponse, RxFill, Verify, Status, Error, Password, GetMessage, MedicationHistoryRequest, MedicationHistoryResponse, Census, RxTransferRequest, RxTransferResponse, REMSInitiationRequest, REMSInitiationResponse.
- [ ] **SC-PARSE-05** — `msg.messageType` returns a typed union of the in-scope message types; developers narrow via `if (msg.messageType === 'NewRx')`.
- [ ] **SC-PARSE-06** — Parser preserves element order within repeating groups (e.g. multiple `<Observation>` in MedicationHistoryResponse) and exposes arrays in original order.
- [ ] **SC-PARSE-07** — Parser preserves default namespace and any explicit prefix bindings from the source document for round-trip fidelity; accessors are namespace-agnostic for the developer.
- [ ] **SC-PARSE-08** — Parser tolerates missing namespace prefixes (real-world trading-partner deviation) with an `NCPDP_SCRIPT_MISSING_NAMESPACE` warning and still produces a structurally correct parse.
- [ ] **SC-PARSE-09** — Parser accepts embedded XHTML in `<DrugDescription>` (a known real-world deviation) and exposes both the raw XHTML and a stripped plain-text form.

### SCRIPT — Message Models & Typed Access (SC-MODEL)

- [ ] **SC-MODEL-01** — Every v1 in-scope SCRIPT message type has a typed interface exported from `@cosyte/ncpdp/script` (`NewRxMessage`, `RxRenewalRequestMessage`, `CancelRxMessage`, etc.) narrowing required and optional elements per the SCRIPT schema.
- [ ] **SC-MODEL-02** — `msg.header` exposes `{ to, from, messageId, sentTime (Date), relatesToMessageId? }` derived from the SCRIPT header, consistent across all message types.
- [ ] **SC-MODEL-03** — `msg.get(xpath)` supports XPath-style dot-path access (`msg.get('Medication.DrugDescription')`, `msg.get('Observation[0].Code')`); returns `undefined` for missing paths rather than throwing.
- [ ] **SC-MODEL-04** — `msg.getAll(xpath)` returns an array for repeating elements (e.g. `msg.getAll('Observation')`).
- [ ] **SC-MODEL-05** — Parsed `ScriptMessage` is immutable by default; mutation only via explicit methods (`setElement`, `addElement`, `removeElement`); all changes reflected in subsequent reads and serialization.
- [ ] **SC-MODEL-06** — `msg.version` exposes `{ release }` (e.g. `{ release: '2017071' }` or `'2022011' }`); developers can gate behavior on version.
- [ ] **SC-MODEL-07** — Date/dateTime elements parse to JS `Date` with the raw string always accessible; unparseable values return `undefined` for the `Date` getter.
- [ ] **SC-MODEL-08** — Quantity elements parse to `{ value: number, codeListQualifier, unitOfMeasure }` with the raw source always accessible.

### SCRIPT — Named Helpers (SC-HELP)

- [ ] **SC-HELP-01** — `rx.patient` (on NewRx/CancelRx/RxRenewal/RxChange/RxFill/MedicationHistoryResponse/Census/RxTransfer) exposes `{ firstName, lastName, dateOfBirth (Date), gender, addressLine1, city, state, zip, phoneNumber, email, identifier, identifierQualifier }`.
- [ ] **SC-HELP-02** — `rx.prescriber` exposes `{ firstName, lastName, npi, dea, spi, stateLicense, practitionerAgent?, pharmacistClinicianStatus?, clinicName, clinicAddress, phoneNumber }`.
- [ ] **SC-HELP-03** — `rx.pharmacy` exposes `{ ncpdpId, npi, name, phoneNumber, addressLine1, city, state, zip }`.
- [ ] **SC-HELP-04** — `rx.medication` exposes `{ drugDescription, drugDbCode, drugDbQualifier, ndc, parsedNdc, strengthValue, strengthUnit, quantity, quantityUnitOfMeasure, daysSupply, dosageForm }`.
- [ ] **SC-HELP-05** — `rx.refills` exposes `{ quantityQualifier, quantity }` (typed) and `rx.refills.allowed` returns a `number` representing the refill count (P → 99 per SCRIPT convention).
- [ ] **SC-HELP-06** — `rx.daw` returns the DAW (Dispense As Written) code as a typed enum `0|1|2|3|4|5|6|7|8|9` with a `rx.daw.description` human description.
- [ ] **SC-HELP-07** — `rx.sig.text` returns the free-text SIG instruction string; `rx.sig.structured` (on SCRIPT 2017+ messages carrying structured SIG) returns the verbatim structured SIG object. `rx.sig.flat` invokes `flattenSig` and is documented as lossy.
- [ ] **SC-HELP-08** — All SC-HELP accessors return `undefined` / `[]` for missing optional data and never throw.

### SCRIPT — Structured SIG (SC-SIG)

- [ ] **SC-SIG-01** — `msg.sig` on a message carrying SCRIPT 2017+ structured SIG exposes the verbatim element tree (no information loss vs. the source document).
- [ ] **SC-SIG-02** — `flattenSig(structuredSig)` produces a developer-readable free-text rendering; JSDoc explicitly labels this as lossy and recommends the structured form for anything downstream-clinical.
- [ ] **SC-SIG-03** — Messages carrying pre-2017 free-text SIG where structured SIG was expected surface `NCPDP_SCRIPT_LEGACY_SIG_FORMAT` warning and still expose `rx.sig.text` populated from the free-text content.
- [ ] **SC-SIG-04** — `parseSig(freeText)` (from `@cosyte/ncpdp/common`) is exposed as a helper for integrators who want to promote free-text to best-effort structure; JSDoc labels it as lossy.

### SCRIPT — Serialization & Envelope (SC-SER)

- [ ] **SC-SER-01** — `msg.toString()` emits namespace-clean XML with canonical Surescripts envelope conventions when the parsed source had one, and raw SCRIPT otherwise.
- [ ] **SC-SER-02** — Round-trip `parseScript → toString → parseScript` yields an equivalent `ScriptMessage` for every canonical fixture (same message type, header, body elements, repeating groups in order).
- [ ] **SC-SER-03** — `msg.toJSON()` returns a structured JSON representation with message-type discriminator.
- [ ] **SC-SER-04** — `msg.prettyPrint()` returns indented namespace-clean XML suitable for logging/debugging (not a canonical representation).
- [ ] **SC-SER-05** — `buildScript({ messageType, version, header, body }).toString()` constructs a valid outbound SCRIPT message; required elements per message-type schema enforced in strict mode or warned in lenient mode.

### SCRIPT — Real-World Tolerance (SC-TOL)

- [ ] **SC-TOL-01** — Default parse mode is lenient; `{ strict: true }` option escalates every Tier 2 warning to a thrown `NcpdpParseError`.
- [ ] **SC-TOL-02** — Tier 3 fatal errors throw `NcpdpParseError` with stable codes even in lenient mode: `NCPDP_SCRIPT_NOT_XML`, `NCPDP_SCRIPT_NO_MESSAGE_ROOT`, `NCPDP_SCRIPT_UNSUPPORTED_VERSION`, `EMPTY_INPUT`. Each error carries `{ message, code, xpath?, lineNumber?, snippet }`.
- [ ] **SC-TOL-03** — Parser emits Tier 2 warnings with stable codes and XPath positional context for scenarios including: `NCPDP_SCRIPT_MISSING_NAMESPACE`, `NCPDP_SCRIPT_LEGACY_SIG_FORMAT`, `NCPDP_SCRIPT_VERSION_MISMATCH`, `NCPDP_SCRIPT_EMBEDDED_XHTML`, `NCPDP_SCRIPT_UNKNOWN_MESSAGE_TYPE`, `NCPDP_SCRIPT_MISSING_ENVELOPE_FIELD`, `NCPDP_SCRIPT_UNEXPECTED_ELEMENT`, `NCPDP_SCRIPT_DATE_FALLBACK_FORMAT`.
- [ ] **SC-TOL-04** — `msg.warnings` is always an array of `NcpdpParseWarning` objects (possibly empty) on a parsed message.
- [ ] **SC-TOL-05** — `onWarning` callback option is invoked for every warning as it is emitted.
- [ ] **SC-TOL-06** — A message declaring `<MessageType>` that doesn't match the namespaced version parses in lenient mode with `NCPDP_SCRIPT_VERSION_MISMATCH` (preferring the namespace as authoritative); strict mode throws.
- [ ] **SC-TOL-07** — Missing required Surescripts envelope fields (when the envelope is present) surface `NCPDP_SCRIPT_MISSING_ENVELOPE_FIELD` warnings in lenient mode and throw in strict mode.

### Profile System (PROF)

- [ ] **PROF-01** — `defineProfile({ name, family: 'telecom' | 'script' | 'both', ...options })` returns a readonly `Profile` object exposing `name`, `description`, `family`, `customSegments?`, `customElements?`, `rejectCodeOverrides?`, `warningOverrides?`, `lineage`; name is required.
- [ ] **PROF-02** — `defineProfile()` throws `NcpdpProfileDefinitionError` for invalid input: unknown option keys, conflicting family declarations, malformed segment IDs, duplicate field/element names within a segment, invalid reject-code keys.
- [ ] **PROF-03** — `extends: parentProfile` and `extends: [p1, p2]` inherit and compose options; merge semantics match `@cosyte/hl7`: scalars overwrite (last-wins), arrays concat+dedupe, record-typed options deep-merge per key, `onWarning` handlers chain.
- [ ] **PROF-04** — `profile.describe()` returns a non-empty human-readable summary containing the profile name and family.
- [ ] **PROF-05** — `parseTelecom(raw, profile)` and `parseScript(raw, profile)` apply profile behavior to the parse; `tx.profile?.name` and `msg.profile?.name` are set on the result.
- [ ] **PROF-06** — Profiles can register custom Telecom segments (Z-segment equivalents) and custom SCRIPT elements; when registered, parsed transactions/messages expose them by declared name (`tx.segments('ZRX')[0].get('someField')`, `msg.get('Extension/SomeElement')`).
- [ ] **PROF-07** — Profiles can register PBM-specific reject-code taxonomy overrides; `tx.response.rejects[0].description` and `tx.response.rejects[0].category` reflect the profile's taxonomy when present, falling back to the NCPDP baseline from `lookupRejectCode` otherwise.
- [ ] **PROF-08** — `setDefaultProfile(p)` / `getDefaultProfile()` / `setDefaultProfile(null)` manage a process-scoped default; explicit argument to parse function overrides; `parseTelecom(raw, { profile: null })` opts out for one call.
- [ ] **PROF-09** — Round-trip with a custom profile: a transaction parsed with a profile and re-serialized produces canonical NCPDP output (profile quirks affect parsing, not serialization).

### Built-in Profiles (BIP)

- [ ] **BIP-01** — `profiles.surescripts` ships (family: `both`; canonical Surescripts envelope + common vendor quirks) and is authored via the public `defineProfile()` API.
- [ ] **BIP-02** — `profiles.cvsCaremark` ships (family: `telecom`; CVS Caremark PBM-specific reject taxonomy + padding conventions) via the public API.
- [ ] **BIP-03** — `profiles.expressScripts` ships (family: `telecom`; Express Scripts / Cigna PBM-specific reject taxonomy) via the public API.
- [ ] **BIP-04** — `profiles.optumRx` ships (family: `telecom`; OptumRx PBM-specific reject taxonomy) via the public API.
- [ ] **BIP-05** — `profiles.humanaPharmacy` ships (family: `telecom`; Humana Pharmacy Solutions reject taxonomy) via the public API.
- [ ] **BIP-06** — Each built-in profile reduces warning count on a realistic vendor-shape fixture versus lenient mode without a profile (verified in the test suite).

### Profile Starter Kit (KIT)

- [ ] **KIT-01** — `examples/profile-starter-kit/` exists and contains every scaffolded file needed to publish a standalone profile package (package.json, tsconfig, tsup.config.ts, vitest.config.ts, eslint.config.js, `.prettierrc.json`, sample `src/index.ts`, sample `test/profile.test.ts`, sample fixture, CI + publish workflows, README, CUSTOMIZING.md, LICENSE).
- [ ] **KIT-02** — Running `pnpm install && pnpm test` inside the starter kit succeeds against its sample fixture.
- [ ] **KIT-03** — `pnpm build` inside the starter kit produces a `dist/` with correct entry points matching `package.json` exports.
- [ ] **KIT-04** — `.github/workflows/ci.yml` and `publish.yml` inside the kit are syntactically valid (verified by `actionlint`).
- [ ] **KIT-05** — Starter kit `package.json` has correct `peerDependencies` on `@cosyte/ncpdp`, `publishConfig.access: public`, `files` allow-list, and working `build`/`test`/`lint` scripts.
- [ ] **KIT-06** — `CUSTOMIZING.md` walks through rename → choose family (telecom/script/both) → extend base profile → define custom segments or elements → register PBM reject overrides → write fixtures → publish.
- [ ] **KIT-07** — Starter kit README uses `{{YOUR_ORG}}` / `{{PROFILE_NAME}}` placeholders consistently.

### Examples (EX)

- [ ] **EX-01** — `examples/parse-telecom-b1-response.ts` runs end-to-end, parses a realistic B1 paid response, and demonstrates `tx.response.paid.amount`, `tx.response.patientPayAmount`, and `tx.response.rejects`.
- [ ] **EX-02** — `examples/build-script-newrx.ts` runs end-to-end and demonstrates `buildScript({ messageType: 'NewRx', ... })` constructing a valid outbound NewRx from scratch, round-trip parseable.
- [ ] **EX-03** — `examples/extract-paid-and-rejects.ts` runs end-to-end on a batch of mixed paid/rejected fixtures and demonstrates the one-line extraction north star for the Telecom side.

### Documentation (DOC)

- [ ] **DOC-01** — README renders cleanly on GitHub and npm with a one-sentence value prop as the first line, followed by badges.
- [ ] **DOC-02** — README contains a 30-second quickstart (install + parse Telecom B1 + extract paid amount, plus install + parse SCRIPT NewRx + extract prescriber NPI) in copy-pasteable blocks.
- [ ] **DOC-03** — README has a feature list (8–10 bullets) highlighting the Telecom + SCRIPT developer-centric wins.
- [ ] **DOC-04** — README has an "NCPDP in 90 seconds" orientation section explaining that NCPDP is two standards (Telecom vs SCRIPT) that share a name, a common vocabulary, and nothing else on the wire.
- [ ] **DOC-05** — README documents the subpath-exports layout (`@cosyte/ncpdp/telecom`, `/script`, `/common`) and what each exports.
- [ ] **DOC-06** — README Cookbook contains recipes for: parse a Telecom B1 response, handle a Telecom B2 reversal, read eligibility (E1), extract PBM-specific reject reasons via profile, parse a SCRIPT NewRx, build a SCRIPT NewRx from scratch, handle structured SIG vs legacy free-text SIG, use the Surescripts envelope, extract medication history from a MedicationHistoryResponse, publish your own PBM profile, publish your own EHR profile, strip Surescripts envelope wrapper, detect SCRIPT version, handle unknown reject codes.
- [ ] **DOC-07** — README has a top-level "Profiles" section (not buried in API reference) covering authoring, extending, merge semantics, built-in profiles, and publishing via the starter kit.
- [ ] **DOC-08** — README "Real-World Tolerance" section explains the 3-tier deviation model (silent normalization / Tier 2 warnings / Tier 3 fatal errors) with a compact table and runnable warnings-iteration example.
- [ ] **DOC-09** — README "Error Handling" section covers `NcpdpParseError`, `NcpdpParseWarning`, `NcpdpProfileDefinitionError` with examples.
- [ ] **DOC-10** — README "Contributing" section points to CONTRIBUTING.md and invites PBM-specific profile contributions, vendor-quirk fixtures, and standalone profile packages.
- [ ] **DOC-11** — README ends with "Built by [Cosyte](https://cosyte.com)" and a license link.
- [ ] **DOC-12** — README Roadmap/stretch-goals section documents v2 candidates: EPCS (controlled substance e-prescribing, separate package), transport (`@cosyte/ncpdp-transport`), Batch Standard, Post Adjudication Standard, Formulary & Benefit, Rebate, Audit, typed transaction overlays with conditional-type field narrowing, streaming parser for N-type batch reports.
- [ ] **DOC-13** — README "Publishing Your Profile" recipe links directly to `examples/profile-starter-kit/` and references `CUSTOMIZING.md`.
- [ ] **DOC-14** — CHANGELOG.md exists in Keep-a-Changelog format with `[Unreleased]` section.
- [ ] **DOC-15** — LICENSE (MIT) at repo root. README and CONTRIBUTING.md explicitly state that this package does not redistribute NCPDP-copyrighted standard text.

### Testing & Fixtures (TEST)

- [ ] **TEST-01** — `pnpm test --coverage` reports ≥ 90% line coverage on `src/telecom/`, `src/script/`, `src/common/`, and `src/helpers/`.
- [ ] **TEST-02** — Canonical Telecom fixtures exist and round-trip losslessly for: B1 request + paid response, B1 request + rejected response, B2 reversal request + response, B3 rebill, E1 eligibility request + response, D1 predetermination, at least one N-type information-reporting transaction, at least one vF6 fixture.
- [ ] **TEST-03** — Canonical SCRIPT fixtures exist and round-trip losslessly for each in-scope message type across v2017071 and v2022011 (paired sample per version where semantics differ); at least one fixture per message type carries a Surescripts envelope.
- [ ] **TEST-04** — Malformed-input fixtures cover each Tier 3 fatal code (Telecom + SCRIPT) and the corresponding test sweep asserts `NcpdpParseError` is thrown with stable code + positional context in both lenient and strict mode.
- [ ] **TEST-05** — Vendor-quirk fixtures (`test/fixtures/vendor-quirks/`) contain at least one fixture per Tier 2 warning code across Telecom and SCRIPT; each one parses in lenient mode with the expected warning code and throws in strict mode.
- [ ] **TEST-06** — Built-in profile fixtures: at least one fixture per built-in profile (Surescripts, CVS Caremark, Express Scripts, OptumRx, Humana) demonstrates fewer warnings with the profile than without.
- [ ] **TEST-07** — Profile-authoring test suite covers: valid `defineProfile`; `NcpdpProfileDefinitionError` paths; `extends` single + array; merge semantics; default-profile set/get/opt-out; custom-segment / custom-element registration + access; PBM reject-code-override resolution; round-trip with custom profile.
- [ ] **TEST-08** — Code-list integrity test suite asserts every bundled code list is a frozen plain object, has a snapshot date in its header comment matching `CODE_LIST_SNAPSHOT_DATE`, and never mutates across runs.

---

## v2 Requirements (Deferred)

- EPCS (Electronic Prescribing of Controlled Substances) — digital signature verification, HSM integration, DEA-compliant audit trail. Separate package: `@cosyte/ncpdp-epcs`.
- Transport layer — TCP/IP Telecom client, SOAP/REST SCRIPT client over Surescripts certified gateways. Separate package: `@cosyte/ncpdp-transport`.
- NCPDP Batch Standard wrapping Telecom transactions for N-type information reporting at scale.
- NCPDP Post Adjudication Standard — separate transaction family.
- NCPDP Formulary & Benefit Standard, Rebate Standard, Audit Standard — separate spec families.
- Typed transaction/message overlays with conditional-type field narrowing at call site (`msg.is('NewRx')` narrows to `NewRxMessage` with exhaustive field typing).
- Streaming parser for large batch Telecom N-type payloads.
- JSON Schema / Zod emission for `toJSON()` output.
- Surescripts certification test-suite harness (if/when Surescripts opens it to third parties).

## Out of Scope

- **EPCS digital signature verification** — DEA-regulated; different certification posture; future `@cosyte/ncpdp-epcs`.
- **Network transport** — we're a parser, not a wire client; future `@cosyte/ncpdp-transport`.
- **PBM formulary file parsing** — separate spec family.
- **Drug database integrations (FDB, Medi-Span, Lexicomp)** — commercial data products, not NCPDP protocols.
- **Redistribution of NCPDP standards text** — NCPDP owns their copyright; we parse the wire format, we do not reproduce their prose in source or docs.

---

## Traceability

Every v1 REQ-ID maps to exactly one phase in `ROADMAP.md`. Total: 155 REQ-IDs.

Detailed phase mapping is maintained in the Traceability section of ROADMAP.md and reflected here at each phase transition.

| REQ-ID Prefix | Primary Phase |
|---------------|---------------|
| SETUP-* | Phase 1 — Foundation & Architecture |
| COMMON-* | Phase 2 — Shared Vocabulary Layer |
| TC-PARSE-*, TC-MODEL-*, TC-TOL-* | Phase 3 — Telecom Parser Core |
| TC-HELP-*, TC-SER-*, TC-F6-* | Phase 4 — Telecom Helpers, Serialization & vF6 |
| SC-PARSE-*, SC-MODEL-*, SC-TOL-* | Phase 5 — SCRIPT Parser Core |
| SC-HELP-*, SC-SIG-*, SC-SER-* | Phase 6 — SCRIPT Helpers, SIG & Envelope |
| PROF-*, BIP-* | Phase 7 — Profile System & Built-ins |
| KIT-*, EX-*, DOC-*, TEST-* | Phase 8 — Examples, Starter Kit, Docs & Release |

**Coverage:** 155 / 155 v1 REQ-IDs mapped (no orphans, no duplicates).

*Last updated: 2026-04-22 — initial requirements definition via `/gsd-new-project`.*
