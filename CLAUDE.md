# @cosyte/ncpdp: Project Guide for Claude

**`@cosyte/ncpdp`**: a developer-focused NCPDP parser + utility library for Node.js/TypeScript,
published under the Cosyte brand. Open-source (MIT). One of the sibling `@cosyte/*` healthcare-standard
parsers that **mirror each other's API**. `@cosyte/hl7` is the reference; this repo deliberately
copies its shape. Sibling project: `@cosyte/hl7` at `../hl7`, same tooling, same engineering bar.

**North star (the archetype):** a developer can parse a real-world, vendor-quirky NCPDP message
and pull useful fields out in one line, without reading the (paywalled) spec. Liberal on parse
(quirks become warnings), conservative on emit (always spec-clean). See `documentation/conventions.md`
→ "The standard parser archetype" in the meta-repo for the full contract this repo must satisfy:
Postel's Law, the tiered tolerance model, stable warning codes, zero runtime deps, dual ESM + CJS,
immutability + explicit mutation, and the profile system.

> The shared-standard sections (**Tech Stack**, **Engineering Guardrails**, **Standing disciplines**)
> come from the `@cosyte/*` parser scaffold and bind every parser. The **NCPDP-specific planning**
> (scope, architecture, standards-licensing posture, EPCS exclusion) is under "NCPDP: project
> specifics" further down.

> **▶ `documentation/agent-notes.md` carries the WHY behind every trap below.** Each line here is the
> imperative; the pointer goes to the incident that produced it, with its measurements, shas, counts
> and negative controls intact. **Read the pointed-to section before you touch the thing it guards**,
> and when a refuter teaches you something new, put the paragraph THERE and a one-line imperative
> HERE. Nothing in that file may be deleted: every paragraph in it cost a defect to learn, and in a
> parser that means a clinical-safety defect. (Split out 2026-08-04 under `CLAUDE-MD-AUDIT`, per the
> 2026-08-04 amendment to the meta-repo's `decisions/0023-doc-budgets.md`. Relocation, not deletion.)

## Status

- **Shipped (NCPDP-1..9): SCRIPT read, Telecom B1, Telecom responses, request-side depth, spec-clean
  serializers + builders, trading-partner profiles.** Pre-alpha on the `0.0.x` ladder. **Never quote
  the package's CURRENT version here** (a historical "reproduced on `0.0.4`" is a dated fact and is
  fine); `npm view @cosyte/ncpdp version` is the only source of truth for what is published now.
  Known limits: whole-message only (no streaming); emits the SIG given (no SIG generation).
  Per-phase detail + the subpath inventory: `documentation/agent-notes.md#shipped-phases-ncpdp-19`.

  **Invariants those phases shipped. Do not trade one away for convenience:**
  - **A reject always wins, money is never a float (`telecomMoney`), and no DUR alert is dropped.**
  - **Every compound ingredient and every COB money row is surfaced**, never silently truncated; a
    mismatch is a warning (`COMPOUND_COUNT_MISMATCH`, `COB_COUNT_MISMATCH`), not a drop.
  - **`priorAuthorization` reports presence, never adjudication.**
  - **The serializer never warns on a valid model; the builders refuse invalid-by-construction
    messages with typed build errors, never new warning codes.** Round-trip is canonical-form
    idempotent (`serialize(parse(serialize(x)))` byte-stable; golden over every fixture, both
    standards). It is NOT `serialize(parse(x)) === x`, which a lenient parser cannot promise.
  - **No profile quirk without a demonstrating fixture** (locked hard rule: type +
    `defineProfile` validation + a per-quirk demonstrator), and **v1 profiles are descriptive:
    profile-on output is byte-identical to profile-off.** A profile must never alter the parse.

- **Diagnostics are built from a frozen registry, and the factories take NO value parameter. That
  absence is the safety property; never add one back "just for this one case".**
  `scriptWarning(code, position)` / `telecomWarning(code, position)` and all four typed error classes
  look their text up in `*_WARNING_MESSAGES` / `*_FATAL_MESSAGES` / `*_BUILD_MESSAGES`.
  Why: `#diagnostics-the-frozen-registry-and-the-no-value-rule`,
  `#phi-warning-message-leak` (the `PHI-WARNING-MESSAGE-LEAK` defect, reproduced on published `0.0.4`).
  - **Keep `segment.segmentId` and `UnsupportedBody.transaction` bounded on the MODEL**, **never
    `joinPath` a sender-chosen name**, **never edit `SCRIPT_TRANSACTION_NAMES` or
    `KNOWN_SCRIPT_VERSIONS` from memory** (re-fetch 42 CFR 423.160 and 45 CFR 170.205(b)), **removal
    is the only permitted direction** for the structured SIG element names, and **the claim to make
    is "these slots are covered", NEVER "the parser cannot leak"**. Relocated 2026-09-06:
    `#the-diagnostic-traps`.

- **PHI commit-gate armed on both wire formats** (`scripts/phi-scan.ts`, `pnpm phi-scan`; pre-commit
  via `simple-git-hooks --staged` and CI via `run-phi-scan: true`). Zero-dep, independent of the
  package's own `fast-xml-parser`. **SCRIPT** is a tag-scoped element-stack walk;
  **Telecom** keys off 2-char field ids so a corrupt Segment Identification cannot bypass a per-field
  detector. **A DOB field fails CLOSED.**
  Synthetic tokens go in `scripts/phi-allow-list.txt`, the only remedy that reaches a clean run. Why:
  `#phi-commit-gate-both-wire-formats`.
  - **Which scanner a file gets is decided by its BYTES, not its name.** **A TARGET ENUMERATED AND
    NEVER READ REFUSES (exit 2), IN EVERY MODE, NAMING THE PATHS.** **EXISTENCE IS NOT OBSERVATION**,
    so an all-mode sweep reconciles what it opened against `git ls-files` and reads the bytes git
    carries as a UNION with the walk. **Prove a change RED on a violator seeded under a scan root,
    and prove a REFUSAL rule by MUTATING it out.** **Prefer exclusion lists to allow-lists.**
    **Derive this scanner's exit codes here; never port a sibling's**, **re-derive a residual here
    before believing it**, and **never claim absoluteness here**. Every trap with its measurements,
    relocated 2026-09-06: `#the-phi-scanner-traps`.

- **A wire-code label ships with the artifact that establishes it recorded beside it, or it does not
  ship.** **Derive a label from the document, never from the table you are replacing**, **never
  claim a green run means no unsourced label can ship**, **a negative control is evidence only if
  the SAME pass reaches every label it vouches for**, and **read the TABLES, not only the prose**.
  Why: `#wire-code-labels-source-it-or-delete-it`. The corpus, the three mutation proofs and both
  sub-traps, relocated 2026-09-06: `#the-wire-code-label-traps`.
- **A 111-AM code inside a range this package DECLARES is either named or carries an absence record,
  and a hole is explained, never filled.** `SEGMENT_CODE_RANGES` + `SEGMENT_ABSENCES` publish the
  ranges and the six unnamed in-range codes (`06`, `09`, `14`, `15`, `16`, `27`), all `unsourced`.
  **Never name one of them from memory or a secondary source**; the Implementation Guide and the
  External Code List are purchased and nothing public settles them. Both ranges ship
  `boundsVerified: false` and a `segment-range-source:` record is what may flip one. The rule is
  "named or accounted for", NOT "unnamed is fine", so a WITHDRAWN name reds until a record replaces
  it. Prove a change by mutating the real tree. Why: `#the-111-am-inventory-and-its-holes`.
- **The decoded version set is written down ONCE, on `docs-content/conformance.md`, and that page
  is gated.** It states per wire format the decoded version, the public section adopting it, the
  date that adoption ends, the recognized-but-undecoded stamp and the absence of any third-party
  record. `test/conformance-statement.test.ts` DERIVES the decoded set from `KNOWN_SCRIPT_VERSIONS`
  and from probing `detectVersion`, never from a copy, and reds in BOTH directions: **adding or
  retiring a version without editing that page fails.** **Never restate the version set on another
  published page** (`README.md`, `KNOWN-LIMITATIONS.md`, `docs-content/`) - the sweep has no
  exclusion list and a second copy is the defect it exists to stop. The citation set is CLOSED
  (three CFR sections, two public URLs, files in this repo) because the Implementation Guides are
  purchased products. **The overclaim rule is a BOUNDED matcher, not an entailment checker: never
  read a green run as "no overclaim can ship".** Prove a change here by MUTATING a rule out. Why:
  `#the-conformance-statement-and-the-version-set-gate`.
  - **The sweep is EMPHASIS-BLIND because it once was not.** **A behavioural promise carries a
    DIRECTION, and it is checked by PARSING, not by reading.** **SCRIPT has THREE outcome classes,
    not two.** **A STILL-TRUE SENTENCE GOES WRONG WHEN THE SURFACE UNDER IT GROWS.** Each with the
    page it shipped wrong on, relocated 2026-09-06: `#the-conformance-statement-traps`.
- **The two-file contract is gated** (`pnpm check:agent-notes`, in `pnpm check`): it BLOCKS via
  `test/scripts/agent-notes.test.ts`, riding the required `ci / verify` contexts, not a fourth
  workflow. Narrative file tracked; every section has a body (a container's is its subsections);
  every pointer resolves. **TWO matchers, and the BARE one is what this repo runs on**: qualified
  form in EVERY tracked file, backticked bare anchors in `CLAUDE.md` and the narrative file only.
  **Zero from EITHER REFUSES (exit 2)**, as does a NUL-bearing file: corpus is `git ls-files`, **no
  exclusion list**. **Not a universal. Never clear a red by deleting the pointer or
  the heading.** Why, and where the misses are: `#the-two-file-contract-gate`.

- **The release caller's four token grants are gated** (`test/scripts/release-caller.test.ts`).
  **Never drop `actions: read`**, **never stop delegating to the shared pipeline**, and **never put
  an `environment:` key on the calling job**: granting less than the callee declares is an
  ELEVATION, and GitHub refuses the whole workflow at STARTUP. Why:
  `#the-release-callers-grant-gate`. Relocated 2026-09-06: `#the-release-caller-traps`.

- **Em-dash brand gate armed.** `scripts/check-no-emdash.sh` (`pnpm check:no-emdash`) +
  `.github/workflows/no-emdash.yml` ban `U+2014` outright, across **both** every tracked file **and**
  the PR title, body and commit messages (this repo squash-merges). **When it goes red, rewrite with a
  period, colon, comma or parentheses; never re-encode the character.** It is the shared text-only
  variant (`hl7`/`fhir`/`pathways`/`knowledgebase`), safe only while every tracked file is NUL-free
  and UTF-8: **re-measure before vendoring any binary.** Two shape fixes here should be carried back
  to the other four copies. Why: `#em-dash-brand-gate`.

## Tech Stack (the shared `@cosyte/*` standard)

This repo inherits the canonical toolchain by depending on the published `@cosyte/*` config packages,
not by copying files. The source of truth is the meta-repo's `documentation/conventions.md`. This is
a summary.

- **Language:** TypeScript (strict, full rigor set incl. `noUncheckedIndexedAccess`) via
  `@cosyte/tsconfig`. **Target ES2023**, `NodeNext`. TypeScript 5.9.x, exact-pinned.
- **Build:** dual ESM + CJS + `.d.ts` via `tsup` (`@cosyte/tsup-config`); `attw` is a publish gate
  (per-condition types: `.d.ts` for `import`, `.d.cts` for `require`). The `attw` script is
  **`node scripts/attw.mjs`, not the bare CLI** - see the guardrail below.
- **Node:** **>= 22** (CI matrix 22 + 24).
- **Package manager:** `pnpm@10`.
- **Lint/format:** **ESLint 10** + unified `typescript-eslint` (type-checked) via
  `@cosyte/eslint-config`; Prettier via `@cosyte/prettier-config`. Lint at `--max-warnings=0`.
- **Testing:** **Vitest 4** + v8 coverage (`@cosyte/vitest-config`), per-directory >= 90 gates; the
  property-based conformance invariants come from `@cosyte/test-utils` (round-trip, lenient-mode,
  immutability, warning-code stability). The format-specific arbitraries stay in this repo.
- **CI/CD:** thin callers of the reusable `cosyte/.github` workflows. Which of their jobs actually
  block a merge is a branch-ruleset fact, not a repo fact: see "Required checks on `main`" below.
- **Runtime deps:** **One.** NCPDP Telecom (fixed-field text) stays zero-dep, like `@cosyte/hl7`.
  NCPDP SCRIPT (XML) takes a single, vetted XML parser, allowed **per an ADR** (the conventions
  carve out `ccda`/`ncpdp` for XML), capped at ≤ 3 total. That one-way-door choice is **ratified**
  as [`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser) (zero transitive
  deps, namespace-aware, XXE-safe with entity resolution disabled) in `docs/adr/0001-xml-parser.md`
  (Accepted, 2026-06-29). `@xmldom/xmldom` was the earlier lean; it was rejected for a larger API
  surface. **Do not add further runtime deps without a new ADR.**
- **License:** MIT.

## Required checks on `main`

Three branch rulesets protect `main`; only `ci-required-checks` (repository-level, id `19841505`) is
editable from here. Its contexts today: `ci / verify (22, ubuntu-latest)`, `ci / verify (24,
ubuntu-latest)`, `ci / actionlint`, `codeql / analyze (javascript-typescript)`, `release-dry-run`,
`no-emdash`, `no-internal-refs`, `test-selection`. Background:
`#required-checks-on-main`.

- **Read the live set back from the API rather than trusting that list**
  (`gh api repos/cosyte/ncpdp/rulesets/19841505`); **the only evidence is the API; a green suite is
  no evidence.** **Add a required context only AFTER the workflow has completed on `main`.** **One
  repository ruleset, extended in place, is the whole convention**, **pin every context to the
  GitHub Actions app (`integration_id: 15368`)**, and **never rename a job without renaming the
  required context in the same change.** **Never narrow `include` in `vitest.config.ts`.** **Never
  require `fuzz`, `scorecard` or `release`.** **Nothing in this repository observes its own
  ruleset**, and that is **a GAP, not a law**. Relocated 2026-09-06: `#the-required-checks-traps`.

## Engineering Guardrails

- **`attw` SAYS "does not contain types" AND EXITS 0, SO THE `attw` SCRIPT IS A WRAPPER, NOT THE
  BARE CLI** (`ATTW-FALSE-GREEN-PORT`). A false red costs an hour; a false green merges a broken
  publish. Why, with every measurement: `#attw-false-green-port`.
  - **Keep BOTH nets in `scripts/attw.mjs`**, **the preflight must claim NO counterfactual**,
    **refuse by option NAME anything that would hide the sentence the post-check reads**, **a
    manifest declaring no relative artifact path is refused, not passed**, and **siblings still
    carry the defect**. Relocated 2026-09-06: `#the-attw-wrapper-traps`.
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
2. **Version + changelog**: a Changeset (`patch` on the `0.0.x` ladder) per meaningful change. **The
   changeset summary IS the entry; `CHANGELOG.md` is generated output. Never hand-edit it or restore
   an `[Unreleased]` heading; the Prettier pass stays ON, derived here, never ported.** Why:
   `#the-changelog-generator`. Renaming a stable warning code is a **breaking change**.
3. **Crew + knowledgebase loop**: if this parser's public API or warning codes change, flag/update
   the matching `crew` healthcare skill (`ncpdp-script-handler`) + the KB product doc.
4. **No internal project bookkeeping on a public surface** (founder directive, 2026-07-27). Item
   identifiers (`NCPDP-7`), phase and wave language, ADR numbers, meta-repo paths and "how this got
   built" commentary belong in the commit, the PR and the roadmap, NOT in a changeset's first
   sentence - never in what a consumer reads. **An UNREGISTERED prefix in that sentence REFUSES the
   release BODY; a LATER paragraph is ungated and ships in the tarball's `CHANGELOG.md`.** It is a
   **translation** at the boundary, not a deletion: when you
   strip an identifier off the front of a line, **repair the head**. Gated by
   `pnpm check:no-internal-refs`, which keys on known project prefixes, so **a new programme prefix
   has to be added by hand**, and it catches identifiers rather than English sentences about our
   process, so the reviewer still owns half the rule. Why:
   `#no-internal-project-bookkeeping-on-a-public-surface`.
   - **This is the repo where the WORD-N trap bites hardest**, because the stripped token is the
     name of the standard we parse. **Three source surfaces, three different answers**: doc comments
     and string literals are GATED, `//` and plain `/* */` comments are NOT. Relocated 2026-09-06:
     `#the-public-surface-traps`.

---

# NCPDP: project specifics

_The original NCPDP planning notes, preserved. These define the package's scope, architecture, and
the NCPDP-specific disciplines (standards licensing, EPCS) on top of the shared standard above._

## Project (scope)

**North star:** A developer can parse a real-world NCPDP Telecom claim response OR a SCRIPT NewRx XML
and pull useful fields out in one line, without having read either (paywalled) standard.

NCPDP is two structurally unrelated standards under one brand. We ship both via subpath exports:

- `@cosyte/ncpdp/telecom`: Telecommunication Standard (vD.0 + vF6), pharmacy claim protocol; field-id-keyed segments; FS/GS/RS framing
- `@cosyte/ncpdp/script`: SCRIPT Standard (v2017071 + v2023011), XML ePrescribing via Surescripts
- `@cosyte/ncpdp/common`: shared vocabulary (NDC, NPI, DEA, SIG, dispense units, code lists)

## Roadmap

8 phases, 155 v1 requirements mapped; NCPDP-1..9 shipped (see Status). Original wording:
`documentation/agent-notes.md#roadmap-as-originally-written`.

## Architecture (locked in NCPDP-1)

ONE package, subpath exports (`@cosyte/ncpdp/telecom`, `/script`, `/common`), chosen over the
two-package alternative and shipped in Phase 1. All three subpaths are live. The subpath types
resolve under both `node16` and legacy `node10` (via `typesVersions`). Original wording and the
alternative it beat: `documentation/agent-notes.md#architecture-locked-in-ncpdp-1`.

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
