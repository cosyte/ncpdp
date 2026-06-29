# @cosyte/ncpdp — Project Guide for Claude

**`@cosyte/ncpdp`** — a developer-focused NCPDP parser + utility library for Node.js/TypeScript,
published under the Cosyte brand. Open-source (MIT). One of the sibling `@cosyte/*` healthcare-standard
parsers that **mirror each other's API** — `@cosyte/hl7` is the reference; this repo deliberately
copies its shape.

**North star (the archetype):** a developer can parse a real-world, vendor-quirky NCPDP message
and pull useful fields out in one line — without reading the (paywalled) spec. Liberal on parse
(quirks become warnings), conservative on emit (always spec-clean). See `documentation/conventions.md`
→ "The standard parser archetype" in the meta-repo for the full contract this repo must satisfy:
Postel's Law, the tiered tolerance model, stable warning codes, zero runtime deps, dual ESM + CJS,
immutability + explicit mutation, and the profile system.

> The shared-standard sections below (**Tech Stack**, **Engineering Guardrails**, **Standing
> disciplines**) come from the `@cosyte/*` parser scaffold and bind every parser. The
> **NCPDP-specific planning** — scope, status, architecture, standards-licensing posture, EPCS
> exclusion — is preserved further down under "NCPDP — project specifics".

## Status

- **SCRIPT read + Telecom B1 + Telecom responses + Telecom request-side depth + spec-clean serializers/builders + trading-partner profiles shipped (NCPDP-1..9).** Pre-alpha `0.0.x`, not yet
  published to npm. `@cosyte/ncpdp/script` exposes `parseScript` + `newRx`, the response spine, the
  prescription-lifecycle transactions, and the lossy structured-SIG decode over a lenient, XXE-safe XML
  read (SCRIPT `v2017071`/`v2022011`). `@cosyte/ncpdp/telecom` exposes `parseTelecom` + `claim` over the
  zero-dep Telecommunication vD.0 standard: FS/GS/RS framing, the fixed Transaction Header, and the
  field-id-keyed B1 billing-claim read (F6 recognized-but-not-decoded). NCPDP-6 adds the **response** read
  — `parseTelecom` detects a response transmission and `adjudication` lifts status + fail-safe
  disposition, pricing (`telecomMoney`, never float), and DUR alerts for B1/B2/B3/E1 responses, under
  three safety invariants (a reject always wins, money is never a float, no DUR alert is dropped). NCPDP-7
  adds **request-side depth**: `compound` (every ingredient surfaced, none dropped), `cobOtherPayments` +
  `responseCob` (coordination of benefits, every money row preserved), `requestDur` + deeper
  `responseDur`, and `priorAuthorization` (presence, never adjudicated) — three new stable warning codes
  (`COMPOUND_COUNT_MISMATCH`, `COB_COUNT_MISMATCH`, `UNKNOWN_DUR_REASON`). NCPDP-8 closes the parse↔emit
  loop with **spec-clean serializers + builders** for both standards: `serializeScript` /
  `ScriptMessage#toString()` + `buildNewRx` / `buildScriptResponse` (SCRIPT), and `serializeTelecom` +
  `buildTelecomRequest` (Telecom). The serializer never warns on a valid model; the builders refuse
  invalid-by-construction messages with a typed `NcpdpScriptBuildError` / `NcpdpTelecomBuildError` (no new
  _warning_ codes). Round-trip is canonical-form idempotent (`serialize(parse(serialize(x)))` byte-stable;
  golden over every fixture both standards). Known limits: whole-message only (no streaming), emits the
  SIG given (no SIG generation). `@cosyte/ncpdp/common` ships the shared NDC/decimal/code-system
  vocabulary. NCPDP-9 adds the **trading-partner profile system** (`@cosyte/ncpdp/profiles`):
  `defineProfile()` + a structured `describe()`, a process-scoped default (`setDefaultProfile` /
  `getDefaultProfile`), and `partitionWarnings`. Built-ins are reached via the `profiles` namespace —
  one per standard, `profiles.surescripts` (SCRIPT) and `profiles.pbm` (Telecom) — each grounded in a
  real Tier-2 fixture under the **locked hard rule** (no quirk without a demonstrating fixture, enforced
  by type + `defineProfile` validation + a per-quirk demonstrator). v1 profiles are **descriptive**:
  attaching one surfaces `msg.profile` / `tx.profile` and powers `partitionWarnings`, but NEVER alters
  the parse (profile-on output is byte-identical to profile-off). (The detailed multi-phase NCPDP
  roadmap is preserved below.)

## Tech Stack (the shared `@cosyte/*` standard)

This repo inherits the canonical toolchain by depending on the published `@cosyte/*` config packages,
not by copying files. The source of truth is the meta-repo's `documentation/conventions.md` — this is
a summary.

- **Language:** TypeScript (strict, full rigor set incl. `noUncheckedIndexedAccess`) via
  `@cosyte/tsconfig`. **Target ES2023**, `NodeNext`. TypeScript 5.9.x, exact-pinned.
- **Build:** dual ESM + CJS + `.d.ts` via `tsup` (`@cosyte/tsup-config`); `attw` is a publish gate
  (per-condition types: `.d.ts` for `import`, `.d.cts` for `require`).
- **Node:** **>= 22** (CI matrix 22 + 24).
- **Package manager:** `pnpm@10`.
- **Lint/format:** **ESLint 10** + unified `typescript-eslint` (type-checked) via
  `@cosyte/eslint-config`; Prettier via `@cosyte/prettier-config`. Lint at `--max-warnings=0`.
- **Testing:** **Vitest 4** + v8 coverage (`@cosyte/vitest-config`), per-directory >= 90 gates; the
  property-based conformance invariants come from `@cosyte/test-utils` (round-trip, lenient-mode,
  immutability, warning-code stability) — the format-specific arbitraries stay in this repo.
- **CI/CD:** thin callers of the reusable `cosyte/.github` workflows.
- **Runtime deps:** **One.** NCPDP Telecom (fixed-field text) stays zero-dep, like `@cosyte/hl7`.
  NCPDP SCRIPT (XML) takes a single, vetted XML parser — allowed **per an ADR** (the conventions
  carve out `ccda`/`ncpdp` for XML), capped at ≤ 3 total. That one-way-door choice is **ratified**
  as [`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser) — zero transitive
  deps, namespace-aware, XXE-safe with entity resolution disabled — in `docs/adr/0001-xml-parser.md`
  (Accepted, 2026-06-29). `@xmldom/xmldom` was the earlier lean; it was rejected for a larger API
  surface. **Do not add further runtime deps without a new ADR.**
- **License:** MIT.

## Engineering Guardrails

- No `any`. No unjustified `as` casts. Use `unknown` and narrow.
- JSDoc (with `@example`) on every public export — the JSDoc lint rule is an **error** on public
  exports, so this is enforced, not optional.
- Immutable by default. Mutation only via explicit methods.
- No `console.*` in library code. Throw typed errors or return results.
- Short, testable functions over big parsing blobs.
- Postel's Law: parser is liberal (lenient default + warnings), serializer is conservative (always
  emits spec-clean output).
- Fatal errors only for unrecoverable structural corruption (Tier-3 codes). Everything else is a
  warning with a stable code + positional context.
- Coverage: per-directory >= 90% (lines/branches/functions/statements), enforced by
  `pnpm test:coverage`.

## Standing disciplines (every change)

Mirrors the three disciplines in the meta-repo's `documentation/conventions.md` — they bind here too:

1. **Documentation follows code** — a change to the public surface/stack/status isn't done until the
   docs are: this repo's docs content (`README.md`, `docs-content/`), the meta-repo
   `documentation/repos/ncpdp.md` (bump its "last verified" date), and the `ecosystem-map.md`
   status table.
2. **Version + changelog** — a Changeset (`patch` on the `0.0.x` ladder) + a `CHANGELOG.md`
   `[Unreleased]` entry per meaningful change. Renaming a stable warning code is a **breaking change**.
3. **Crew + knowledgebase loop** — if this parser's public API or warning codes change, flag/update
   the matching `crew` healthcare skill (`ncpdp-script-handler`) + the KB product doc.

---

# NCPDP — project specifics

_The original NCPDP planning notes, preserved. These define the package's scope, architecture, and
the NCPDP-specific disciplines (standards licensing, EPCS) on top of the shared standard above._

Sibling project: `@cosyte/hl7` at `../hl7` — same tooling, same engineering bar.

## Project (scope)

**North star:** A developer can parse a real-world NCPDP Telecom claim response OR a SCRIPT NewRx XML
and pull useful fields out in one line — without having read either (paywalled) standard.

NCPDP is two structurally unrelated standards under one brand. We ship both via subpath exports:

- `@cosyte/ncpdp/telecom` — Telecommunication Standard (vD.0 + vF6) — pharmacy claim protocol; field-id-keyed segments; FS/GS/RS framing
- `@cosyte/ncpdp/script` — SCRIPT Standard (v2017071 + v2022011) — XML ePrescribing via Surescripts
- `@cosyte/ncpdp/common` — shared vocabulary: NDC, NPI, DEA, SIG, dispense units, code lists

## Roadmap

- **Phase 0 — Initialized.** (Now: scaffolded onto the `@cosyte/*` standard.)
- Roadmap: 8 phases, 155 v1 requirements mapped.

## Architecture (locked in NCPDP-1)

ONE package, subpath exports (`@cosyte/ncpdp/telecom`, `/script`, `/common`) — chosen over the
two-package alternative (`@cosyte/ncpdp-telecom` + `@cosyte/ncpdp-script` + shared
`@cosyte/ncpdp-common`) and shipped in Phase 1. `/script` and `/common` are live; `/telecom` is
planned. The subpath types resolve under both `node16` and legacy `node10` (via `typesVersions`).

## NCPDP-specific guardrails

These add to the shared Engineering Guardrails above:

- Postel's Law positional context is **byte offset for Telecom, XPath for SCRIPT**.
- Fatal errors only for unrecoverable structural corruption. Telecom: `NCPDP_TELECOM_NO_HEADER`, `NCPDP_TELECOM_INVALID_FRAMING`, `NCPDP_TELECOM_UNSUPPORTED_VERSION`, `EMPTY_INPUT`. SCRIPT: `NCPDP_SCRIPT_NOT_XML`, `NCPDP_SCRIPT_NO_MESSAGE_ROOT`, `NCPDP_SCRIPT_UNSUPPORTED_VERSION`, `EMPTY_INPUT`. Everything else is a warning.
- SIG parsing is best-effort and clearly labeled lossy (JSDoc).
- Code lists are bundled versioned snapshots; snapshot date is part of the package version. No runtime fetch.
- Coverage target: ≥ 90% on `src/telecom/`, `src/script/`, `src/common/`, `src/helpers/`.

## Standards Licensing — Important

NCPDP charges for the standards documents and is more litigious about copyright than HL7. **We do NOT redistribute NCPDP-copyrighted text.**

- The wire format is fair game to parse.
- The code is ours; ship code, not their prose.
- Do not copy paragraphs out of NCPDP spec PDFs into JSDoc, README, or comments.
- Field-name labels and code descriptions in our code lists must be paraphrased / widely-known industry terminology, not lifted verbatim from NCPDP source.

If a contribution introduces material that looks copy-pasted from a paywalled NCPDP standard, treat it as a blocker until rephrased.

(Note: this is also why differential testing against a reference implementation is **excluded for
`ncpdp`** in the shared test strategy — NCPDP redistribution limits.)

## EPCS — Out of Scope for v1

Electronic Prescribing of Controlled Substances (EPCS) requires DEA-regulated digital signature verification, HSM integration, and a different audit/certification posture. EPCS belongs in a separate `@cosyte/ncpdp-epcs` package. Do not add EPCS work to v1.
