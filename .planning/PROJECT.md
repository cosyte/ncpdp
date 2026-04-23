# @cosyte/ncpdp

## What This Is

An open-source, developer-focused NCPDP parser and utility library for Node.js and TypeScript, published under the Cosyte brand. It lets a developer take a real-world NCPDP transaction — the kind PBMs, pharmacies, EHRs, and ePrescribing networks actually exchange — and pull useful fields out in one line, without buying NCPDP membership or reading the (paywalled) standards.

NCPDP is two structurally unrelated standards that share a name. This package ships both under one roof via subpath exports:

- **`@cosyte/ncpdp/telecom`** — NCPDP Telecommunication Standard (vD.0 + vF6). The real-time pharmacy claim protocol used between pharmacies, switches (RelayHealth, Surescripts), and PBMs. Field-id-keyed segments, FS/GS/RS framing (`0x1C`/`0x1D`/`0x1E`), synchronous request/response. Transactions: B1 (billing), B2 (reversal), B3 (rebill), E1 (eligibility verification), D1 (predetermination), N1/N2/N3 (information reporting).
- **`@cosyte/ncpdp/script`** — NCPDP SCRIPT Standard (v2017071 + v2022011). XML-based ePrescribing between EHRs and pharmacies via Surescripts. Message types: NewRx, RxRenewalRequest/Response, CancelRx/Response, RxChangeRequest/Response, RxFill, Verify, Status, Error, Password, GetMessage, MedicationHistoryRequest/Response, Census, RxTransferRequest/Response, REMSInitiationRequest/Response.
- **`@cosyte/ncpdp/common`** — shared vocabulary layer: NDC parsing/normalization (5-4-2 ↔ 11-digit), NPI Luhn validation, DEA validation, SIG parsing helpers (best-effort free-text → FHIR-Dosage-shaped output), dispense unit / quantity qualifier lookups, prescriber ID qualifiers, Surescripts message ID conventions.

The package is both a credibility asset for Cosyte's healthcare integration practice and a production tool used internally on client projects. Sibling to `@cosyte/hl7`; same tooling, same engineering bar.

## Core Value

**A developer can parse a real-world NCPDP Telecom claim response OR a SCRIPT NewRx XML and pull useful fields out in one line — without having read either (paywalled) standard.** Everything else — typed transaction model, dot-path access, round-trip serialization, profile system for trading-partner quirks, code-list bundling — supports that north star.

Named typed helpers (`claim.patient.id`, `rx.prescriber.npi`, `rx.medication.ndc`, `rx.sig.text`) are the primary API. Raw field-ID access (Telecom `tx.get('AM01')`) and XPath-style access (SCRIPT `rx.get('Medication/DrugDescription')`) are available for power users.

## Requirements

### Validated

(None yet — ship to validate)

### Active

See `REQUIREMENTS.md` for the full categorized list with REQ-IDs.

**Top-level capabilities (v1):**

- [ ] Parse Telecom vD.0 request + response transactions (B1/B2/B3/E1/D1/N1/N2/N3) with proper FS/GS/RS framing
- [ ] Parse Telecom vF6 (XML) where semantics overlap vD.0, with the same named-helper API surface
- [ ] Parse SCRIPT v2017071 and v2022011 messages (one parser, version auto-detected from `<MessageType>` + namespace) across all supported message types
- [ ] Typed transaction/message model: header → patient → insurance → claim → pricing → DUR → COB segments (Telecom); per-message-type models (SCRIPT)
- [ ] Named helpers for common extractions: patient, prescriber, product, pricing, paid amount, reject codes, DUR warnings (Telecom); patient, prescriber, medication, SIG, refills, DAW (SCRIPT)
- [ ] Field-ID accessors (Telecom) and XPath-style dot-path accessors (SCRIPT) for structural access
- [ ] Shared common layer: NDC 5-4-2 ↔ 11-digit normalization, NPI Luhn validation, DEA validation, SIG parsing (best-effort), dispense unit + quantity qualifier code lookups
- [ ] Structured-SIG extraction for SCRIPT 2017+ (verbatim structure + best-effort flat representation, documented as lossy)
- [ ] Round-trip serialization: byte-exact-equivalent Telecom, namespace-clean XML with canonical Surescripts envelope for SCRIPT
- [ ] Lenient default parsing with stable warning codes + positional context (byte offset for Telecom, XPath for SCRIPT)
- [ ] Strict mode opt-in that escalates warnings to typed `NcpdpParseError` throws
- [ ] First-class `defineProfile()` API for trading-partner quirks (same surface for Telecom + SCRIPT)
- [ ] 5 built-in profiles: Surescripts (canonical), CVS Caremark, Express Scripts/Cigna, OptumRx, Humana Pharmacy Solutions
- [ ] Bundled versioned code lists: NCPDP reject codes, DUR conflict codes, dispense unit codes, prescriber ID qualifiers, intermediary IDs (snapshot date part of package version; no runtime fetch)
- [ ] Profile starter kit (`examples/profile-starter-kit/`) that ships publishable as-is
- [ ] Three runnable examples (Telecom B1 response parse, SCRIPT NewRx build, paid-amount + reject-reasons extraction)
- [ ] Strict TypeScript; dual ESM + CJS; Node 18+; ≤ 3 total runtime deps for the whole package (zero on the Telecom side)

### Out of Scope (v1)

- **EPCS (ePrescribing of Controlled Substances) digital signature verification** — DEA-regulated, HSM integration, audit trail, separate certification posture. Deserves its own `@cosyte/ncpdp-epcs` package.
- **NCPDP Manufacturer Rebate Standard, Audit Standard, Formulary & Benefit Standard** — niche, separate work, separate package if demand emerges.
- **Surescripts certification harness / test message suite** — Surescripts-controlled, not redistributable.
- **Real-time transaction orchestration over the wire** — TCP/IP for Telecom, SOAP/REST for SCRIPT. We're a parser, not transport. Future `@cosyte/ncpdp-transport` if demand warrants.
- **NCPDP Post Adjudication Standard** — separate transaction family, low demand.
- **NCPDP Batch Standard wrapping Telecom transactions** — roadmap.
- **Standalone Prior Authorization transactions beyond SCRIPT 2017/2022** — v1 covers what's inline in SCRIPT 2017071 + 2022011, no more.
- **PBM formulary file parsing** — separate spec family.
- **Drug database integrations (FDB, Medi-Span, Lexicomp)** — commercial data products, not protocols.
- **Redistribution of NCPDP-licensed standard PDFs** — NCPDP charges for the standards and is more litigious than HL7 about it. We ship code, not their copyrighted text.

## Context

- **Market gap:** Pharmacy IT teams, PBM integrations, and EHR ePrescribing teams pay a compliance tax to implement NCPDP — the standards are paywalled by NCPDP membership, and existing Node tooling is either internal/proprietary, thin wrappers around the (paywalled) spec text, or abandoned. Clearing a low DX bar is tractable.
- **Two standards, one brand:** Telecom and SCRIPT share nothing on the wire, but they share customer audience (pharmacy IT, PBM, EHR ePrescribing) and a substantial vocabulary (NDC, NPI, DEA, SIG semantics, dispense quantity codes). One package with subpath exports lets users install once and get the part they need, while keeping the common layer honest.
- **Real-world tolerance is the credibility gate:** Production NCPDP traffic from PBMs and Surescripts routinely violates the published standards (padded fields, vendor-specific reject codes, missing namespace prefixes, pre-2017 SIG free-text where structured was expected, embedded XHTML in `<DrugDescription>`). A parser that strictly enforces the spec rejects a meaningful percentage of real messages. Default mode is lenient; deviations surface as warnings with stable codes and positional context (byte offset for Telecom, XPath for SCRIPT).
- **Profiles are a growth loop:** Built-ins cover broad PBM and EHR patterns, but real production specs live at the integration level (specific PBM reject code taxonomies, Surescripts certification variants, EHR-specific SCRIPT quirks). Every published profile package is a signal of library adoption and a contribution back. The starter kit is designed so publishing a profile takes minutes.
- **Code lists are bundled, versioned, and frozen:** NCPDP reject codes, DUR conflict codes, dispense unit codes, and prescriber ID qualifiers change over time but not during a run. Ship them as snapshots with a date stamp; updates are a release event.
- **Dogfooding:** Cosyte intends to use this internally on client projects, so production hardening isn't theoretical.
- **Licensing:** MIT on our code. We do not redistribute NCPDP's copyrighted standard text. Don't copy paragraphs out of the spec PDFs into JSDoc. Parsing the wire format is fair game; reproducing NCPDP's prose is not.

## Constraints

- **Language:** TypeScript strict (`"strict": true`, `"noUncheckedIndexedAccess": true`). No `any`, no unjustified `as` casts.
- **Target:** ES2022, dual package (ESM + CJS) via `tsup`. Node 18+.
- **Runtime deps:** Zero on the Telecom side (it's delimited bytes, like HL7 v2). Deps allowed on the SCRIPT side (XML parsing + namespace handling is not something to hand-roll). Each runtime dep must be actively maintained, broadly trusted, MIT/Apache-licensed, and justified in an ADR. **Target ≤ 3 total runtime deps for the whole package.**
- **Package manager:** pnpm. Package name: `@cosyte/ncpdp`. License: MIT.
- **Test coverage:** ≥ 90% line coverage on `src/telecom/`, `src/script/`, `src/common/`, `src/helpers/`.
- **No console logging in library code.** Throw typed errors or return results.
- **Immutable transactions/messages by default.** Mutation only through explicit methods.
- **Postel's Law:** parsers are liberal (lenient default + warnings with stable codes and positional context); serializers are conservative (always emit canonical NCPDP-conformant output).
- **No NCPDP standard text in source.** Parse the format; do not reproduce the prose.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| One package, two parser families, shared common layer via subpath exports (`@cosyte/ncpdp/telecom`, `/script`, `/common`) | Brand is unified; common layer (NDC/NPI/DEA/SIG) is real; single install surface matches how customers think about "NCPDP." Alternative (two packages + shared internal `@cosyte/ncpdp-common`) revisited in Phase 1 discuss-phase before lock-in. | — Pending (Phase 1) |
| Lenient default parsing; strict mode opt-in | Production PBM + Surescripts traffic routinely violates the spec. Strict-by-default would reject real traffic. Strict exists for validators/CI. | — Pending |
| Warnings carry stable string codes + positional context | Developers need to programmatically react to specific deviations. Examples: `NCPDP_TELECOM_FIELD_PADDED`, `NCPDP_TELECOM_UNKNOWN_REJECT_CODE`, `NCPDP_SCRIPT_MISSING_NAMESPACE`, `NCPDP_SCRIPT_LEGACY_SIG_FORMAT`, `NCPDP_SCRIPT_VERSION_MISMATCH`. Byte offset for Telecom, XPath for SCRIPT. | — Pending |
| Fatal errors only for unrecoverable structural corruption | Telecom: `NCPDP_TELECOM_NO_HEADER`, `NCPDP_TELECOM_INVALID_FRAMING`, `EMPTY_INPUT`. SCRIPT: `NCPDP_SCRIPT_NOT_XML`, `NCPDP_SCRIPT_NO_MESSAGE_ROOT`, `NCPDP_SCRIPT_UNSUPPORTED_VERSION`, `EMPTY_INPUT`. Everything else is a warning. | — Pending |
| Named typed helpers are the primary API; field IDs / XPath are power-user access | `claim.patient.id` beats `tx.get('CM01')` for the 90% case. Raw access always available. | — Pending |
| Serializer always emits canonical NCPDP output regardless of what was parsed | Postel's Law. Parser is liberal; emitter is conservative. Prevents vendor quirks from propagating downstream. Telecom: byte-exact-equivalent framing; SCRIPT: namespace-clean XML + canonical Surescripts envelope. | — Pending |
| Profiles are plain data produced by `defineProfile()` — same surface for Telecom + SCRIPT, built-ins + user-authored are equal citizens | Mirrors `@cosyte/hl7`. Anything shipped must be expressible through the public API. | — Pending |
| Immutable transactions/messages by default | Mutation only via explicit methods. Keeps the threading story simple. | — Pending |
| Code lists bundled as versioned snapshots; snapshot date part of package version | Reject codes, DUR codes, dispense unit codes, prescriber ID qualifiers, intermediary IDs change over time but not during a run. Runtime fetch would be a supply-chain + outage liability. Updates are a release event. | — Pending |
| SIG parsing is best-effort, clearly labeled lossy | Structured SIG (SCRIPT 2017+) exposed verbatim; flattener that produces free text is documented as lossy. Free-text SIG → structured output helper is best-effort, labeled. | — Pending |
| SCRIPT XML parser choice deferred to Phase 1 discuss-phase | Candidates: `fast-xml-parser`, `xmldoc`, `@xmldom/xmldom`, `libxmljs2`. Namespace handling + round-trip fidelity + bundle size + maintenance status + license all matter. Reuse `@cosyte/ccda` decision if that project exists; otherwise lock in ADR at Phase 1. | — Pending (Phase 1) |
| EPCS (controlled substance e-prescribing with digital signatures) is OUT of v1 | DEA regulations require HSM integration, audit trail, different certification posture. Deserves its own `@cosyte/ncpdp-epcs` package. | — Pending |
| Do NOT redistribute NCPDP-copyrighted standard text | NCPDP is more litigious than HL7 about this. We ship code, not their prose. | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-22 — project initialized via `/gsd-new-project`.*
