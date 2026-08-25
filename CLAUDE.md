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
  - **Bounding a message does not close a downstream leak: keep `segment.segmentId` and
    `UnsupportedBody.transaction` bounded on the MODEL** (2 chars or empty; a closed
    `SCRIPT_TRANSACTION_NAMES`), because that is what a package like `deid` interpolates. Why:
    `#bounding-a-message-does-not-close-a-downstream-leak`.
  - **`position` is a diagnostic surface too: never `joinPath` a sender-chosen name.** The one
    survivor (`sig.ts`, ambiguous dose) is safe only because `DOSE_QUANTITY_NAMES` is closed, and a
    comment says so. Why: same section.
  - **Never edit `SCRIPT_TRANSACTION_NAMES` from memory: re-fetch 42 CFR 423.160.** A recalled draft
    invented three transfer names, got both recertification names wrong, and dropped the whole ePA and
    REMS families. Why: `#script_transaction_names-and-42-cfr-423160`.
  - **`KNOWN_SCRIPT_VERSIONS` is `2017071` + `2023011`; cite 45 CFR 170.205(b), not 42 CFR 423.160(c);
    re-fetch, never edit from memory** (provenance is a `//` comment above the list). **And when you
    correct a sourced list, go looking for what built on the wrong value** - a test or profile that
    encodes the defect is worse than the defect. Why: `#ncpdp-script-versions-and-45-cfr-170205b`.
  - **The structured SIG matches an element name only where a published FIELD label denotes that same
    component; a SEGMENT label grounds nothing, and a bare string match is not grounding** (the
    `DoseUnitOfMeasure` hit on ncpdp.org names an NCI terminology subset, not a Sig component).
    **Removal is the only permitted direction: never add or re-spell a name, and never edit the list
    from memory.** When it moves, move the serializer's emit tags and the PHI corpus with it. Why:
    `#the-structured-sig-element-names-and-what-grounds-them`.
  - **A closed list is the only shape that satisfies the gate; a length bound is not, and
    `SNIPPET_MAX` is gone and must not come back.** Why: `#closed-list-not-a-length-bound-snippet_max`.
  - **The gate is `assertNoDiagnosticPhiLeak` from `@cosyte/test-utils` (pinned `^0.0.2` - a caret on
    a `0.0.x` resolves exactly, so the pin is what selects the runner and a stale pin silently tests
    nothing).** 47 slots (17 SCRIPT, 30 Telecom) plus a slot-independent
    `w.message === WARNING_MESSAGES[w.code]` assertion. **Adding a warning code without the registry
    fails to compile; without reaching it in that corpus, fails the test. The claim to make is "these
    slots are covered", NEVER "the parser cannot leak".** Why: `#the-diagnostic-phi-gate-and-its-47-slots`.

- **PHI commit-gate armed on both wire formats** (`scripts/phi-scan.ts`, `pnpm phi-scan`; pre-commit
  via `simple-git-hooks --staged` and CI via `run-phi-scan: true`). Zero-dep, independent of the
  package's own `fast-xml-parser`. **SCRIPT** is a tag-scoped element-stack walk;
  **Telecom** keys off 2-char field ids so a corrupt Segment Identification cannot bypass a per-field
  detector. **A DOB field fails CLOSED.**
  Synthetic tokens go in `scripts/phi-allow-list.txt`, the only remedy that reaches a clean run. Why:
  `#phi-commit-gate-both-wire-formats`.
  - **Which scanner a file gets is decided by its BYTES, not its name**: separators mean Telecom, an
    XML document means SCRIPT, **a payload signalling both gets both** (a union, never a precedence),
    and the case-folded extension is only a fallback. **The fallback arm is load-bearing and pinned
    against deletion**. Why: `#narrowing-pnpm-phi-scan-dispatch-and-residuals`.
  - **A TARGET ENUMERATED AND NEVER READ REFUSES (exit 2), IN EVERY MODE, NAMING THE PATHS - a SET
    DIFFERENCE, NEVER A SIZE.** So **`--allow-fixture` applies to BOTH copies of a path and is
    RECORDED then REFUSED: no argv reaches exit 0**, and an override naming no target refuses too.
    **Hits print before this refusal alone. One exception: tolerated-vanish. In `all` mode with EVERY
    target withdrawn the observed-nothing floor fires FIRST**, naming the same paths. **The "every
    file excluded" invariant is GONE; `unobservedTracked` KEEPS its exemption on a REWRITTEN reason.
    Restore neither.** **Every report line carries its denominators** - never print `OK` without the
    numbers it is an `OK` over. Why: `#the-argument-driven-collapse-routes`,
    `#the-completeness-rule-enumerated-and-never-read`.
  - **Prove a change to this scanner RED on a violator seeded under a scan root** (one in a temp dir
    is never enumerated), **and prove a REFUSAL rule by MUTATING it out**, never by a green run. Why:
    same section.
  - **A scan that could not read what it enumerated refuses**, the one tolerated exception scoped hard
    (self-enumerated + untracked + `ENOENT`, on stderr, out of the denominator). **Never soften the
    rule that a sweep which observed nothing refuses.** Why: `#phi-scan-enumerate-then-read-class`.
  - **Prefer exclusion lists to allow-lists anywhere the enumerator decides what gets looked at**
    (`--diff-filter=AM` dropped `R` then `T` silently; now `--diff-filter=d` + `--no-renames`). Why:
    `#the---diff-filter-polarity-lesson`.
  - **An in-scope non-regular entry (symlink) REFUSES on both routes, exit 2, named by its own
    repo-relative path plus a closed-set kind token, NEVER the link target.** Neither route follows a
    link; explicit-paths mode still reads through one, deliberately. Why:
    `#phi-scan-symlink-blind-on-both-routes`.
  - **The refusal boundary is `isUnderScanRoot` on BOTH routes, deliberately not `isScannable`**, and
    **the gitignore exemption rests on `git check-ignore` being index-aware**; keep the force-add
    test. Why: `#the-isunderscanroot-refusal-boundary`.
  - **A SCAN ROOT IS A DECLARATION, NOT A DISCOVERY: a missing, linked (dangling or not), or
    non-directory root REFUSES (exit 2) and EVERY broken root is named.** The check is `lstatSync`,
    never `existsSync`, which FOLLOWS a link; keep the `existsSync` inside `walk`, which is now the
    subdirectory transient rather than a root check. Why:
    `#a-scan-root-is-a-declaration-not-a-discovery`.
  - **EXISTENCE IS NOT OBSERVATION, and no root check could be: an empty directory enumerates
    perfectly.** An all-mode sweep reconciles the paths it OPENED against `git ls-files` and refuses
    (exit 2) naming every tracked in-scope file it did not open. **The expected set must come from the
    INDEX, never the walk** (walk-derived agrees with the walk forever); it fails CLOSED when git
    cannot answer; `--staged` and paths mode are NOT reconciled; **never replace the `ls-files` call
    with a work-tree probe**, and do not fold it back into `walkRoot`. Why:
    `#observation-not-existence-reconciling-the-sweep-against-the-index`.
  - **A PATH SET CANNOT SEE WHAT IS AT THE PATH: the walk reads the WORKING TREE, not the committed
    corpus.** All mode reads the bytes git carries as a UNION with the walk; both numbers ride on the
    report. **Dedup on the PAIR, this path AND these bytes**: a clean checkout never invokes
    `cat-file`, and where the two copies differ **both are scanned**, the EOL axis. **NEITHER HALF OF
    THAT KEY IS OPTIONAL** - the path alone drops the EOL case, the oid alone let a decoy at another
    path cancel the index copy. **Read EVERY stage; a stage-0 entry does NOT mean the
    path is merged**, and the first `ls-files -s` record is the MERGE BASE. **`--staged` already
    refuses an unmerged path: do not re-close it.** A carried hit is exit **1**, an unanswerable git
    exit **2**. **Fixture an index with `git update-index --index-info`, never `git merge`.** Why:
    `#the-bytes-git-carries-the-index-route-a-union-with-the-walk`.
  - **Derive this scanner's exit codes here; never port a sibling's** (a regular-file root exits 1
    here, 2 in `hl7`, 1 in `terminology`). **And keep `makeScratchRepo()` in step with `SCAN_ROOTS`**
    - it omitted `src/` and was itself an instance of the defect. Why: same section.
  - **Re-derive a residual here before believing it: `test/` scope, the root SET, unmerged `U`
    entries and rename-blindness are CLOSED here**, whatever a sibling says. Why: same section.
  - **Re-measure a sibling's fix here; a remedy's prose does not port with its code.** Why:
    `#a-remedys-prose-does-not-port-with-its-code`.
  - **Never claim absoluteness here**: not "cannot be collapsed", not "one rule answers every mode",
    not an exhaustive cell map. The rules constrain the target set, not what enumeration lists. Why:
    same section.

- **A wire-code label ships with the artifact that establishes it recorded beside it, or it does not
  ship.** `test/telecom/vocab-provenance.test.ts` enumerates every `export const X: ReadonlyMap<...>
= new Map([...])` under `src/` with no exclusion list and requires a `vocab-provenance:` record on
  each: `label-table` (artifact + ISO retrieval date + sha256 + method + a negative control + the
  single-source caveat) or `not-a-label-table` (which must declare the closed control vocabulary its
  values come from). It also fails on drift between `KNOWN-LIMITATIONS.md` and the exported surface
  **in either direction**, and bounds a label to a short phrase. **Derive a label from the document,
  never from the table you are replacing** (that is how `ER` stayed "Early Refill" against an artifact
  saying drug overuse), **never add a code the package does not already decode while sourcing one**,
  and **never claim a green run means no unsourced label can ship**: one declaration shape is
  enumerated, module-private maps and non-`Map` shapes are not. Prove a change here by MUTATING a rule
  out, never by a green run. Why, with the corpus and the three mutation proofs:
  `#wire-code-labels-source-it-or-delete-it`.
  - **A negative control is evidence only if the SAME pass reaches every label it vouches for.**
    Strip tags BEFORE matching this Word HTML: a markup-anchored shape cannot see `ER` at all, and
    that was the one label the artifact was carried to settle. Record what the pass RETURNED, and
    scope the claim to it. Why: `#a-negative-control-is-evidence-only-if-the-same-pass-reaches-every-label-it-vouches-for`.
  - **Say "token" when you mean token, and read the TABLES, not only the prose.** `MC`/`LR` occur as
    substrings (`MCO`, `MCCP`, "already") and not as words; section 16.0 is a 52-row reject-code
    table, not the empty heading a record once claimed. **Over-precision in a provenance record is
    the same defect class as under-precision**, and a record whose conclusion is right while its
    stated reason is refuted by its own artifact is still the defect. Why: same section.
- **A 111-AM code inside a range this package DECLARES is either named or carries an absence record,
  and a hole is explained, never filled.** `SEGMENT_CODE_RANGES` + `SEGMENT_ABSENCES` publish the
  ranges and the six unnamed in-range codes (`06`, `09`, `14`, `15`, `16`, `27`), all `unsourced`.
  **Never name one of them from memory or a secondary source**; the Implementation Guide and the
  External Code List are purchased and nothing public settles them. Both ranges ship
  `boundsVerified: false` and a `segment-range-source:` record is what may flip one. The rule is
  "named or accounted for", NOT "unnamed is fine", so a WITHDRAWN name reds until a record replaces
  it. Prove a change by mutating the real tree. Why: `#the-111-am-inventory-and-its-holes`.
- **The two-file contract is gated** (`pnpm check:agent-notes`, in `pnpm check`): it BLOCKS via
  `test/scripts/agent-notes.test.ts`, riding the required `ci / verify` contexts, not a fourth
  workflow. Narrative file tracked; every section has a body (a container's is its subsections);
  every pointer resolves. **TWO matchers, and the BARE one is what this repo runs on**: qualified
  form in EVERY tracked file, backticked bare anchors in `CLAUDE.md` and the narrative file only.
  **Zero from EITHER REFUSES (exit 2)**, as does a NUL-bearing file: corpus is `git ls-files`, **no
  exclusion list**. **Not a universal. Never clear a red by deleting the pointer or
  the heading.** Why, and where the misses are: `#the-two-file-contract-gate`.

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
  (`gh api repos/cosyte/ncpdp/rulesets/19841505`). It is prose no test can check, and it has been
  stale before: it named `test-selection` as required for days while the ruleset did not, so the gate
  blocked nothing. **The only evidence is the API; a green suite is no evidence.** Why:
  `#test-selection-became-genuinely-required-2026-08-04`.
- **Add a required context only AFTER the workflow has completed on `main`.** Requiring a context
  nothing has emitted leaves every PR pending and unmergeable rather than red. Measure the price on
  open PRs; a bypass actor is never the answer. Why: same section.
- **One repository ruleset, extended in place, is the whole convention. Do not add a second one for
  the next gate**, and **pin every context to the GitHub Actions app (`integration_id: 15368`)**: an
  unpinned required context can be satisfied by any actor with write access posting a commit status
  of that name, with the workflow never running. Why: `#one-repository-ruleset-extended-in-place`.
- **Pin against the real check-run context verified on an actual `pull_request` run, never a workflow
  `name:`** (`<job id>` here, `<caller job> / <called job>` for a reusable workflow). Why: same section.
- **`baseline-branch-protection` and `parser-ci-required-checks` are organization-level and read-only
  from here** (`PUT` 404s while `GET` 200s). Change them in the org, never by copying them into the
  repo ruleset. Why: `#the-organization-level-rulesets`.
- **Never rename a job without renaming the required context in the same change**, and **never split a
  step out of a required job** (a required job gates all of its steps; moving one out un-requires it).
  Why: `#what-silently-detaches-a-required-check`.
- **Never narrow `include` in `vitest.config.ts`.** `pnpm test` takes no path arguments, so that glob
  is the sole selector for everything `ci / verify` runs, and coverage does not backstop it. Gated by
  `scripts/check-test-selection.ts` (`pnpm check:test-selection`, context `test-selection`) - **read
  its scope before trusting it. Its largest known hole is that most test files are watched by the
  `.test.`/`.spec.` filename shape alone**, so a rename or a move into `test/_helpers/` stops a suite
  running with the gate green. **Close it by deriving more subjects from workflows, never by widening
  the name pattern or hand-listing files.** Its four deliberate shapes (resolved selection, exact-match
  script rule, workflow-derived subjects with no exemptions, self-tests that seed one removal at a
  time) must survive any port, and **the script rule must never become a parser**: analysing a shell
  string is unbounded and bought one more spelling per round. Why: `#the-test-selection-gate-in-detail`.
- **`pnpm phi-scan` is a floor, not a gate, and it still moves without a workflow edit** (allow-list,
  override log, and anything changing what the enumerator lists). **Treat an enumeration change as a
  gate change.** Residuals are open, executable in `test/scripts/phi-scan.test.ts`, and logged in
  `phi-scan-overrides.md`; the headline one is that a message embedded in a string literal is not
  structurally scanned anywhere. Why: `#narrowing-pnpm-phi-scan-dispatch-and-residuals`.
- **Never require `fuzz`, `scorecard` or `release`** (schedule/push/dispatch only - requiring one
  strands every PR forever), and **never require `CodeQL` (app `57789`) in place of
  `codeql / analyze (javascript-typescript)`** (the former reports alert state, not whether the
  analysis ran). Why: `#unrequirable-workflows-and-the-wrong-codeql-context`.
- **Nothing in this repository observes its own ruleset**: delete it and every test still passes and
  this file still says `main` is protected. Read it back from the API
  (`gh api "repos/cosyte/ncpdp/rulesets?includes_parents=true"`). **That is a GAP, not a law** - the
  endpoint answers unauthenticated, so a CI step could assert it; two open questions (anonymous 60/hr
  per shared runner IP, and whether the Actions token is accepted) are why it is not built yet.
  **Do not restate the gap as an impossibility to avoid answering them.** Why:
  `#nothing-here-observes-its-own-ruleset-a-gap-not-a-law`.

## Engineering Guardrails

- **`attw` SAYS "does not contain types" AND EXITS 0, SO THE `attw` SCRIPT IS A WRAPPER, NOT THE
  BARE CLI** (`ATTW-FALSE-GREEN-PORT`). A false red costs an hour; a false green merges a broken
  publish. Why, with every measurement: `#attw-false-green-port`.
  - **Keep BOTH nets in `scripts/attw.mjs`**: the preflight that every relative path `package.json`
    promises (`main`, `module`, `types`, `typings`, every string leaf of `exports` **and of
    `typesVersions`**) exists and is non-empty, and the post-check on attw's untyped sentence. They
    catch different things (a missing build vs. declarations excluded from the tarball by
    `files`/`.npmignore`).
  - **The preflight must claim NO counterfactual.** It sees the manifest, never the tarball, so it
    cannot know what attw would have done; `analysis.types` is "any TS-extension file anywhere in the
    tarball", not a fact about entrypoints. A test pins that no "EXITED 0" wording returns.
  - **Refuse anything that would hide the sentence the post-check reads: by option NAME, wholesale,
    not by value, and for short forms by ANY LETTER IN THE CLUSTER** (`commander` lets a value ride on
    the token, so `-fjson` walked past a whole-token guard). A `.attw.json` applies after argv, so it
    is refused too. **Do not tidy that back to a set of exact tokens.**
  - **A manifest declaring no relative artifact path is refused, not passed** - same rule as the PHI
    scanner's empty target set: never report a pass from a check that read no files. And
    `main`/`module`/`types`/`typings` are checked without requiring a `./` prefix.
  - **`test/scripts/attw-gate.test.ts` pins both nets against the real binary, including attw's own
    exit-0, plus a negative control and a real-failure case.** If you add a case, **re-derive the
    18-of-21 red split by arithmetic** rather than copying the number forward.
  - **This is a per-repo script and siblings still carry the defect** (including the parser template
    new repos are minted from). Do not write the repo count down; derive it:
    `/usr/bin/grep -rl '"attw":' --include=package.json --exclude-dir=node_modules /workspace`.
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
   - **This is the repo where the WORD-N trap bites hardest**, because the stripped token is the name
     of the standard we parse. `NCPDP-7` is ours; `NCPDP-SCRIPT`, `NCPDP-TELECOM`, `NCPDP-D.0`, the
     digit-leading field references (`439-E4`, `511-FB`) and the `SYNTH-MSG-0001` sample ids are
     reference material. **Never re-key the rule on the `WORD-N` shape, and never resync the prefix
     list with a sibling repo's copy without re-reading why `SYNTH` is absent here.** Why:
     `#the-word-n-trap`.
   - **Three source surfaces, three different answers.** `/** */` doc comments are GATED (a
     consumer's editor renders them); string literals are GATED too (they reach a consumer as
     warning-message text); `//` and plain `/* */` comments are NOT gated and identifiers are
     WELCOME in them, because the convention says source comments are a place identifiers belong.
     **Do not justify that boundary from what reaches `dist/` - two attempts did and both were
     measurably false** (everything in `src/` ships, via bundle comments and `sourcesContent`). The
     line is what a consumer is _shown_. **Removing a doc comment to satisfy the gate is a
     regression, not a fix.** The gate reads the source of the published text, not `dist/` itself.
     Why: `#three-source-surfaces-three-different-answers`.

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
