# @cosyte/ncpdp: Project Guide for Claude

**`@cosyte/ncpdp`**: a developer-focused NCPDP parser + utility library for Node.js/TypeScript,
published under the Cosyte brand. Open-source (MIT). One of the sibling `@cosyte/*` healthcare-standard
parsers that **mirror each other's API**. `@cosyte/hl7` is the reference; this repo deliberately
copies its shape.

**North star (the archetype):** a developer can parse a real-world, vendor-quirky NCPDP message
and pull useful fields out in one line, without reading the (paywalled) spec. Liberal on parse
(quirks become warnings), conservative on emit (always spec-clean). See `documentation/conventions.md`
→ "The standard parser archetype" in the meta-repo for the full contract this repo must satisfy:
Postel's Law, the tiered tolerance model, stable warning codes, zero runtime deps, dual ESM + CJS,
immutability + explicit mutation, and the profile system.

> The shared-standard sections below (**Tech Stack**, **Engineering Guardrails**, **Standing
> disciplines**) come from the `@cosyte/*` parser scaffold and bind every parser. The
> **NCPDP-specific planning** (scope, status, architecture, standards-licensing posture, EPCS
> exclusion) is preserved further down under "NCPDP: project specifics".

## Status

- **SCRIPT read + Telecom B1 + Telecom responses + Telecom request-side depth + spec-clean serializers/builders + trading-partner profiles shipped (NCPDP-1..9).** Pre-alpha `0.0.x`, not yet
  published to npm. `@cosyte/ncpdp/script` exposes `parseScript` + `newRx`, the response spine, the
  prescription-lifecycle transactions, and the lossy structured-SIG decode over a lenient, XXE-safe XML
  read (SCRIPT `v2017071`/`v2022011`). `@cosyte/ncpdp/telecom` exposes `parseTelecom` + `claim` over the
  zero-dep Telecommunication vD.0 standard: FS/GS/RS framing, the fixed Transaction Header, and the
  field-id-keyed B1 billing-claim read (F6 recognized-but-not-decoded). NCPDP-6 adds the **response** read:
  `parseTelecom` detects a response transmission and `adjudication` lifts status + fail-safe
  disposition, pricing (`telecomMoney`, never float), and DUR alerts for B1/B2/B3/E1 responses, under
  three safety invariants (a reject always wins, money is never a float, no DUR alert is dropped). NCPDP-7
  adds **request-side depth**: `compound` (every ingredient surfaced, none dropped), `cobOtherPayments` +
  `responseCob` (coordination of benefits, every money row preserved), `requestDur` + deeper
  `responseDur`, and `priorAuthorization` (presence, never adjudicated), plus three new stable warning codes
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
  `getDefaultProfile`), and `partitionWarnings`. Built-ins are reached via the `profiles` namespace,
  one per standard, `profiles.surescripts` (SCRIPT) and `profiles.pbm` (Telecom), each grounded in a
  real Tier-2 fixture under the **locked hard rule** (no quirk without a demonstrating fixture, enforced
  by type + `defineProfile` validation + a per-quirk demonstrator). v1 profiles are **descriptive**:
  attaching one surfaces `msg.profile` / `tx.profile` and powers `partitionWarnings`, but NEVER alters
  the parse (profile-on output is byte-identical to profile-off). (The detailed multi-phase NCPDP
  roadmap is preserved below.)
- **PHI commit-gate armed (both wire formats).** A zero-dep, NCPDP-shape-aware scanner
  (`scripts/phi-scan.ts`, `pnpm phi-scan`) refuses fixtures / `src/` carrying real-PHI-shaped tokens.
  **SCRIPT** (XML) is scanned by a case-/namespace-insensitive element-stack walk (patient + prescriber
  names, `<DateOfBirth>`, SSN / cardholder / member ids, address lines, phones, tag-scoped so
  `<BusinessName>` / `<DrugDescription>` don't trip it); **Telecom** is tokenized on the FS/GS/RS
  separators and keyed off the 2-char field ids (Patient name CA/CB, DOB C4, address CM, phone CQ,
  Patient ID CY, Cardholder ID C2, Cardholder name CC/CD), so a corrupt Segment Identification can't
  bypass a per-field detector; a DOB field fails **closed**. Dashed SSN + non-test email caught
  anywhere. The gate is deliberately independent of the package's own `fast-xml-parser`. Synthetic
  tokens are declared in `scripts/phi-allow-list.txt`; a whole-file bypass needs `--allow-fixture` **and**
  an audit entry in `phi-scan-overrides.md`. Runs at pre-commit (`simple-git-hooks --staged`) and in CI
  (`run-phi-scan: true`); `verify.sh` now shows `phi-scan`.

- **Em-dash brand gate armed.** `scripts/check-no-emdash.sh` (`pnpm check:no-emdash`) plus
  `.github/workflows/no-emdash.yml` enforce the founder directive banning `U+2014` outright
  (`knowledgebase/06-brand/voice-and-tone.md`, "No em dashes. Ever."). It scans **both** halves the
  rule covers: every tracked file, **and** the PR title, body, and commit messages, on the
  non-default `edited` trigger so retitling a PR re-checks it (this repo squash-merges, so the PR
  title and body are the message that lands). It is the **text-only** script variant, shared with
  `hl7` / `fhir` / `pathways` / `knowledgebase`, and it deliberately omits `grep -I`. That is safe
  only while every tracked file is NUL-free and UTF-8 (both true, measured; re-measure before
  vendoring any binary, and take `website`'s NUL-partition variant instead if you do). ncpdp was
  already clean when this landed, so the gate changed no content. When it goes red the fix is never
  to re-encode the character: rewrite with a period, colon, comma, or parentheses. Known limits are
  written down in the script header and are shared across all five copies, so fix them there, not
  here. Two shape bugs found by this slice's refuter **are** fixed here and should be carried back
  to the other four copies: a tracked file named `-` was read as stdin and never opened (paths are
  now `./`-prefixed), and `-d skip` silently passed a tracked symlink to a directory (dropped).

## Tech Stack (the shared `@cosyte/*` standard)

This repo inherits the canonical toolchain by depending on the published `@cosyte/*` config packages,
not by copying files. The source of truth is the meta-repo's `documentation/conventions.md`. This is
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
  immutability, warning-code stability). The format-specific arbitraries stay in this repo.
- **CI/CD:** thin callers of the reusable `cosyte/.github` workflows.
- **Runtime deps:** **One.** NCPDP Telecom (fixed-field text) stays zero-dep, like `@cosyte/hl7`.
  NCPDP SCRIPT (XML) takes a single, vetted XML parser, allowed **per an ADR** (the conventions
  carve out `ccda`/`ncpdp` for XML), capped at ≤ 3 total. That one-way-door choice is **ratified**
  as [`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser) (zero transitive
  deps, namespace-aware, XXE-safe with entity resolution disabled) in `docs/adr/0001-xml-parser.md`
  (Accepted, 2026-06-29). `@xmldom/xmldom` was the earlier lean; it was rejected for a larger API
  surface. **Do not add further runtime deps without a new ADR.**
- **License:** MIT.

## Engineering Guardrails

- No `any`. No unjustified `as` casts. Use `unknown` and narrow.
- JSDoc (with `@example`) on every public export. The JSDoc lint rule is an **error** on public
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

Mirrors the three disciplines in the meta-repo's `documentation/conventions.md`. They bind here too:

1. **Documentation follows code**. A change to the public surface/stack/status isn't done until the
   docs are: this repo's docs content (`README.md`, `docs-content/`), the meta-repo
   `documentation/repos/ncpdp.md` (bump its "last verified" date), and the `ecosystem-map.md`
   status table.
2. **Version + changelog**: a Changeset (`patch` on the `0.0.x` ladder) + a `CHANGELOG.md`
   `[Unreleased]` entry per meaningful change. Renaming a stable warning code is a **breaking change**.
3. **Crew + knowledgebase loop**: if this parser's public API or warning codes change, flag/update
   the matching `crew` healthcare skill (`ncpdp-script-handler`) + the KB product doc.
4. **No internal project bookkeeping on a public surface** (founder directive, 2026-07-27). What a
   consumer reads (`README.md`, `KNOWN-LIMITATIONS.md`, `docs-content/`, the npm `description`, a
   release body) says what the software does and what changed. Item identifiers (`NCPDP-7`), phase
   and wave language, ADR numbers, meta-repo paths and "how this got built" commentary belong in the
   changeset, `CHANGELOG.md`, the commit, the PR and the roadmap. It is a **translation** at the
   boundary, not a deletion, and when you strip an identifier off the front of a line, repair the
   head: a fragment reads worse than the text it replaced. Gated by `pnpm check:no-internal-refs`.
   The gate keys on known project prefixes, so **a new programme prefix has to be added to it by
   hand**; and it catches identifiers, not English sentences about our process, so the reviewer still
   owns half the rule.

   **This is the repo where the WORD-N trap bites hardest**, because the token the identifier rule
   strips is the name of the standard the package parses. `NCPDP-7` is ours; `NCPDP-SCRIPT`,
   `NCPDP-TELECOM` and `NCPDP-D.0` are reference material, as are the field references that open with
   a digit (`439-E4`, `511-FB`) and the `SYNTH-MSG-0001` example ids in every runnable sample. Never
   re-key the rule on the `WORD-N` shape, and never "resync" the prefix list with a sibling repo's
   copy without re-reading why `SYNTH` is absent from this one.

   **Three source surfaces, three different answers.** `/** */` doc comments compile into
   `dist/*.d.ts` and render in a consumer's editor, so they are **gated**. String literals reach a
   consumer as warning-message text, so they are **gated too** (a pass `hl7` does not have; six
   warning messages were saying "not modeled this phase" until it landed). `//` and plain `/* */`
   comments are **not gated** and identifiers are **welcome** in them. **Do not justify that by
   saying they "do not reach `dist`" -- they do.** They stay out of `dist/*.d.ts` and `dist/*.js`,
   but tsup emits source maps, `dist` is `files[0]`, and `dist/index.mjs.map` carries every tracked
   source byte verbatim in `sourcesContent`. The real line is what a consumer is **shown** (JSDoc on
   hover, a warning in their log) versus what a maintainer goes looking for in a devtools pane. Two
   consequences: a doc comment is not
   the place for "which phase added this" framing, and **removing a doc comment to satisfy the gate
   is a regression**, not a fix (JSDoc with `@example` on every public export is a hard guardrail
   above, and neither lint nor coverage will catch its loss). What the gate cannot do is read
   `dist/` itself: `dist/` is untracked build output, so this is a gate on the source of the
   published text, not on the published text.

---

# NCPDP: project specifics

_The original NCPDP planning notes, preserved. These define the package's scope, architecture, and
the NCPDP-specific disciplines (standards licensing, EPCS) on top of the shared standard above._

Sibling project: `@cosyte/hl7` at `../hl7`, same tooling, same engineering bar.

## Project (scope)

**North star:** A developer can parse a real-world NCPDP Telecom claim response OR a SCRIPT NewRx XML
and pull useful fields out in one line, without having read either (paywalled) standard.

NCPDP is two structurally unrelated standards under one brand. We ship both via subpath exports:

- `@cosyte/ncpdp/telecom`: Telecommunication Standard (vD.0 + vF6), pharmacy claim protocol; field-id-keyed segments; FS/GS/RS framing
- `@cosyte/ncpdp/script`: SCRIPT Standard (v2017071 + v2022011), XML ePrescribing via Surescripts
- `@cosyte/ncpdp/common`: shared vocabulary (NDC, NPI, DEA, SIG, dispense units, code lists)

## Roadmap

- **Phase 0: Initialized.** (Now: scaffolded onto the `@cosyte/*` standard.)
- Roadmap: 8 phases, 155 v1 requirements mapped.

## Architecture (locked in NCPDP-1)

ONE package, subpath exports (`@cosyte/ncpdp/telecom`, `/script`, `/common`), chosen over the
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

## Standards Licensing: Important

NCPDP charges for the standards documents and is more litigious about copyright than HL7. **We do NOT redistribute NCPDP-copyrighted text.**

- The wire format is fair game to parse.
- The code is ours; ship code, not their prose.
- Do not copy paragraphs out of NCPDP spec PDFs into JSDoc, README, or comments.
- Field-name labels and code descriptions in our code lists must be paraphrased / widely-known industry terminology, not lifted verbatim from NCPDP source.

If a contribution introduces material that looks copy-pasted from a paywalled NCPDP standard, treat it as a blocker until rephrased.

(Note: this is also why differential testing against a reference implementation is **excluded for
`ncpdp`** in the shared test strategy: NCPDP redistribution limits.)

## EPCS: Out of Scope for v1

Electronic Prescribing of Controlled Substances (EPCS) requires DEA-regulated digital signature verification, HSM integration, and a different audit/certification posture. EPCS belongs in a separate `@cosyte/ncpdp-epcs` package. Do not add EPCS work to v1.
