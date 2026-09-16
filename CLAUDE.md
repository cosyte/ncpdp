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

Relocated whole and unchanged to [`documentation/tech-stack.md`](./documentation/tech-stack.md):
the toolchain summary, the one-runtime-dependency rule and the `attw` wrapper note.

## Required checks on `main`

The context list is a snapshot and the API is the evidence, so the whole section is relocated whole
and unchanged to [`documentation/required-checks.md`](./documentation/required-checks.md). Read the
live set back with `gh api repos/cosyte/ncpdp/rulesets/19841505` before you trust any copy of it.

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

Four disciplines, each with a gate behind it: documentation follows code, a Changeset per
meaningful change, the crew and knowledgebase loop, and no internal project bookkeeping on a public
surface. Relocated whole and unchanged to
[`documentation/standing-disciplines.md`](./documentation/standing-disciplines.md); read it before
you write a changeset or touch `README.md` or `docs-content/`.

---

# NCPDP: project specifics

_The original NCPDP planning notes, preserved. These define the package's scope, architecture, and
the NCPDP-specific disciplines (standards licensing, EPCS) on top of the shared standard above._

Every section of this half is relocated whole and unchanged to
[`documentation/ncpdp-project-specifics.md`](./documentation/ncpdp-project-specifics.md), which
sits beside the narrative file. Relocation, not deletion.

## Project (scope)

The north star and the three subpaths:
[`ncpdp-project-specifics.md`](./documentation/ncpdp-project-specifics.md#project-scope).

## Roadmap

[`ncpdp-project-specifics.md`](./documentation/ncpdp-project-specifics.md#roadmap).

## Architecture (locked in NCPDP-1)

ONE package, subpath exports, and the alternative it beat:
[`ncpdp-project-specifics.md`](./documentation/ncpdp-project-specifics.md#architecture-locked-in-ncpdp-1).

## NCPDP-specific guardrails

Positional context, the fatal-code sets and the coverage target:
[`ncpdp-project-specifics.md`](./documentation/ncpdp-project-specifics.md#ncpdp-specific-guardrails).

## Standards Licensing: Important

**We do NOT redistribute NCPDP-copyrighted text.** The whole rule, and what it costs the test
strategy:
[`ncpdp-project-specifics.md`](./documentation/ncpdp-project-specifics.md#standards-licensing-important).

## EPCS: Out of Scope for v1

[`ncpdp-project-specifics.md`](./documentation/ncpdp-project-specifics.md#epcs-out-of-scope-for-v1).
