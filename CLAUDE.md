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
  read (SCRIPT `v2017071`/`v2023011`). `@cosyte/ncpdp/telecom` exposes `parseTelecom` + `claim` over the
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
- **Diagnostics are built from a frozen registry, and the factories take no value parameter.**
  `scriptWarning(code, position)` / `telecomWarning(code, position)` and all four typed error classes
  look their text up in `*_WARNING_MESSAGES` / `*_FATAL_MESSAGES` / `*_BUILD_MESSAGES`. **That absence
  is the safety property; do not add a value parameter back "just for this one case".** The ecosystem
  audit's single distinguishing property was exactly this: everything that leaked took a value, and
  everything genuinely prevented did not.

  The defect it closed (`PHI-WARNING-MESSAGE-LEAK`) was reproduced on the published `0.0.4`, and the
  slot table in `test/phi/diagnostic-surface.test.ts` was run red on the base commit before any fix
  existed. It caught five: a SCRIPT root element name and an unmodeled SCRIPT transaction element
  name, each into a `message` **and** a `position.path`; two SCRIPT fatal paths into `err.snippet`;
  and a Telecom Segment Identification value into a `message`, which is where the audit's NDC and Rx
  number came from, because a dropped field separator runs the rest of the segment into that field.

  **Two lessons are load-bearing and cost more than the message fix.** First, **bounding a message
  does not close a downstream leak**: `segment.segmentId` and `UnsupportedBody.transaction` were
  unbounded on the _model_, which is what a package like `deid` interpolates. Both are now bounded
  (2 chars or empty; a closed `SCRIPT_TRANSACTION_NAMES` vocabulary), and the bound has to be kept
  when either is touched. Second, `position` is a diagnostic surface too: `joinPath(bodyPath, name)`
  with a sender-chosen `name` leaks exactly as much as interpolating it into the message. The one
  surviving `joinPath` on an element name (`sig.ts`, the ambiguous-dose path) is safe only because
  `DOSE_QUANTITY_NAMES` is closed, and there is a comment saying so.

  **`SCRIPT_TRANSACTION_NAMES` is grounded in 42 CFR 423.160, not in memory, and it must stay that
  way.** The first draft of that list was written from recall and the refuter caught it: three
  invented transfer names, both recertification names wrong, and the whole prior-authorization and
  REMS families missing, which would have silently stripped the identity off every ePA message the
  library saw. The regulation is public law and publishes the transaction vocabulary and the version
  ids together, so it is the license-clean source for both. **The version list has now been corrected
  the same way** (`NCPDP-SCRIPT-VERSIONS`): `KNOWN_SCRIPT_VERSIONS` is `2017071` + `2023011`, and
  `2022011` is gone. Two things about that fix are worth carrying.

  First, **the regulation to cite for the version pair is 45 CFR 170.205(b), not 42 CFR 423.160(c)**,
  and the backlog item got this subtly wrong. 423.160(b)(1) requires compliance with "a standard in
  45 CFR 170.205(b)" and (c) merely incorporates the two guides by reference; the operative adoption,
  including the sentence "the Secretary's adoption of this standard expires on January 1, 2028" that
  applies to `2017071` only, lives in 170.205(b)(1). Both were re-fetched from the eCFR versioner API
  and the Cornell mirror on 2026-08-01, and the absence of `2022011` was measured with a negative
  control rather than asserted. Provenance is in a `//` comment above the list. **Re-fetch; never
  edit that list from memory.**

  Second, **the wrong version had grown a second home that looked deliberate.** The `surescripts`
  built-in profile shipped a `version-stamp-variance` quirk whose only demonstrating fixture was
  stamped `2023011` and which asserted that stamp was beyond the modeled set. That made the defect
  read as an intentional, fixture-grounded trading-partner convention. The quirk was deleted, not
  re-stamped: keeping it alive required inventing a version identifier no public source backs, which
  the locked hard rule forbids. When you correct a sourced list here, **go looking for the places
  that built on the wrong value**, because a test or a profile that encodes the defect is worse than
  the defect.

  A closed list is the only shape that satisfies the gate here, and it is worth knowing why a length
  bound is not: the kit fails any verbatim echo of four or more bytes, so any cap large enough to
  hold a real element name also holds a marker. `hl7`'s `safeDerivedToken` would not pass this test.

  **`SNIPPET_MAX` is gone and should not come back.** A 64-character cap bounds length, not content,
  and the paths that raised it are the paths where the input is too broken to know what those
  characters are. Three of the four error classes already refused a snippet; the fourth now agrees.

  The gate is `assertNoDiagnosticPhiLeak` from `@cosyte/test-utils` (pinned `^0.0.2`; **a caret on a
  `0.0.x` version resolves exactly, so the pin is what selects the runner**, and a stale pin silently
  tests against a kit that has no runner and passes). 47 slots, 17 SCRIPT and 30 Telecom. Under it
  sits a slot-independent assertion that `w.message === WARNING_MESSAGES[w.code]` for every code on
  both standards, which is the only check that survives a slot nobody declared. **Adding a warning
  code without adding it to the registry fails to compile; adding one without reaching it in that
  corpus fails the test.** What neither reaches: an echo shorter than four bytes, a re-encoded echo
  (`checkLengthInvariance` is off, and is off for a reason the kit documents), and a slot nobody
  wrote down. **The claim to make is "these slots are covered", never "the parser cannot leak".**

- **PHI commit-gate armed (both wire formats).** A zero-dep, NCPDP-shape-aware scanner
  (`scripts/phi-scan.ts`, `pnpm phi-scan`) refuses fixtures / `src/` carrying real-PHI-shaped tokens.
  **SCRIPT** (XML) is scanned by a case-/namespace-insensitive element-stack walk (patient + prescriber
  names, `<DateOfBirth>`, SSN / cardholder / member ids, address lines, phones, tag-scoped so
  `<BusinessName>` / `<DrugDescription>` don't trip it); **Telecom** is tokenized on the FS/GS/RS
  separators and keyed off the 2-char field ids (Patient name CA/CB, DOB C4, address CM, phone CQ,
  Patient ID CY, Cardholder ID C2, Cardholder name CC/CD), so a corrupt Segment Identification can't
  bypass a per-field detector; a DOB field fails **closed**. Dashed SSN + non-test email caught
  anywhere. **Which of the two scanners a file gets is decided by its BYTES, not its name**: NCPDP
  separators mean Telecom, an XML document means SCRIPT, **a payload signalling both gets both**, and
  the extension is only a fallback for a payload that says nothing about itself, matched
  case-insensitively (which is what keeps a `.xml` / `.XML` fragment fixture scanned). The
  gate is deliberately independent of the package's own `fast-xml-parser`. Synthetic
  tokens are declared in `scripts/phi-allow-list.txt`; a whole-file bypass needs `--allow-fixture` **and**
  an audit entry in `phi-scan-overrides.md`. Runs at pre-commit (`simple-git-hooks --staged`) and in CI
  (`run-phi-scan: true`); `verify.sh` now shows `phi-scan`.

  **The argument-driven routes to collapsing this gate are closed.** They were open: `--allow-fixture X` with no
  positional path seeded the target set with `[X]`, subtracted `X`, scanned **zero files**, printed
  `OK: no hits` and exited 0, and the suite asserted the opposite ("the override, not an empty target
  set, is what flips the next run to clean") on a temp-dir path an all-mode scan never enumerated, so
  the assertion passed for the reason it denied. The only brake was that `phi-scan-overrides.md` read
  `(none yet)`, which is one markdown commit from permissive. `--allow-fixture` is now purely
  subtractive; an override matching no scanned file is rejected; an emptied target set is rejected
  (`--staged` with nothing staged is the one legitimate empty scan); and every report line carries the
  denominator, so `OK` is never printed without the number it is an `OK` over. All three exit `2`.
  `SCAN_ROOTS` (`src/`, `test/`, `scripts/`) is one list serving both all-mode and `--staged`, so a
  narrowing has one visible place to happen. **When you touch this scanner, prove the change red on a
  seeded violator**, not merely green: the tests seed real files under a scan root, because a violator
  in an OS temp dir is never enumerated and overriding it proves nothing. That is the mistake the
  original suite made.

  **A scan that could not read what it enumerated also refuses, and the ONE tolerated exception is
  scoped hard** (`PHI-SCAN-ENUMERATE-THEN-READ-CLASS`). All mode lists every root, then reads each
  file, so a transient written and deleted inside that window threw `ENOENT` and refused the whole
  sweep with exit 2. **The refusal was right and the enumeration was wrong**, so what changed is the
  enumeration: a file the walk enumerated **itself**, **untracked by git**, failing with **`ENOENT`**
  is skipped, reported on stderr, and **subtracted from the denominator**. A tracked file, any
  non-`ENOENT` failure, a tolerated file back on disk at sweep end, a `git` that cannot answer, an
  **empty** tracked set, and an all-mode sweep that **observed nothing** all still refuse. **Never
  soften that last one.** `--staged` reads blobs from the index and never depended on any of this.
  Reachability here was **measured, not inferred**: a `git` shim first on `PATH` is a deterministic
  hook into the gap (the scanner runs `git` between the walk and the first read), and it reproduces
  the refusal on `d205efc` against an untracked `scripts/` transient of exactly the shape this suite
  seeds; but **459 probe sweeps against the live suite never hit it unassisted** (window 48-57 ms
  against a ~545 ms transient lifetime), and `tsup`'s root-level transient is outside `SCAN_ROOTS`,
  measured. **Residuals stay open and the list is not closed**: the re-check is path-keyed so a
  mid-window **rename** goes unread; the back-on-disk branch is an **unguarded bound**, and deleting
  it was measured to turn an exit-2 refusal into `OK` over a file on disk nothing read, so do not
  read "unpinned" as "low stakes"; `walk()`'s own `existsSync`->`readdirSync` race still exits **1**,
  the code reserved for "hits found" (`PRE-EXISTING`, fails closed, and the org survey wrongly scoped
  it to `ccda` alone); and "untracked" is read from the OUTER repo, so a nested git repo under a scan
  root would look tolerable. All are in `phi-scan-overrides.md`. **The `git` shim technique is
  the reusable part**: no sleep, no real build, throwaway repos only.

  **Do not upgrade any of that into "the gate cannot be collapsed."** The three invariants constrain
  the _target set_; they say nothing about what enumeration lists in the first place, and a file the
  enumerator never lists is invisible to all three while the denominator still reads plausible. That
  is not hypothetical: the refuter on this very slice found `--staged` used `--diff-filter=AM`, which
  does not match an `R` entry, so a fixture that was `git mv`'d **and** edited to add real PHI was
  staged and never opened, and the pre-commit gate printed `OK` over the other staged files' count.
  Fixed with `--no-renames` (which decomposes the rename into `D` + `A`) and a test that first asserts
  git actually scored a rename. The refuter's **second** pass then found the same shape again in `T`
  (typechange: a tracked symlink replaced by a regular file carrying PHI), which is the real lesson:
  `--diff-filter=AM` was an **allow-list of status letters**, the wrong polarity for a safety gate,
  because every letter it does not name is dropped silently. It is now `--diff-filter=d`
  ("everything except deletions"), so an unknown or future status costs a wasted scan, never a missed
  one. **Prefer exclusion lists to allow-lists anywhere the enumerator decides what gets looked at.**
  The enumeration gaps we know of are written up in `phi-scan-overrides.md`: `walk` tests `isFile()`,
  so a **symlinked** fixture is skipped, and `pnpm phi-scan <one-file>` truthfully reports
  `1 file(s) scanned`, a near-empty scan the exactly-zero invariant does not catch. **That is not a
  closed list, and publishing it as one has now been wrong twice.** The claim to make is "these
  routes are closed", never "the gate is uncollapsible".

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
  (per-condition types: `.d.ts` for `import`, `.d.cts` for `require`). The `attw` script is
  **`node scripts/attw.mjs`, not the bare CLI**, because the CLI reports a missing `dist/` as "does
  not contain types" and **exits 0**. See the guardrail below before changing it.
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

Three branch rulesets protect `main`. Only one is editable from this repo.

- **`ci-required-checks`** (repository-level, id `19841505`). This repo's own ruleset, and the one to
  extend. It requires the repo's check-run contexts, every one pinned to the GitHub Actions app
  (`integration_id: 15368`): `ci / verify (22, ubuntu-latest)`, `ci / verify (24, ubuntu-latest)`,
  `ci / actionlint`, `codeql / analyze (javascript-typescript)`, `release-dry-run`, `no-emdash`,
  `no-internal-refs`, `test-selection`. **Read the live set back rather than trusting this list**
  (`gh api repos/cosyte/ncpdp/rulesets/19841505`); a hardcoded count here has gone stale before, and
  the list is prose that no test can check.
- **`baseline-branch-protection`** and **`parser-ci-required-checks`** (both organization-level,
  sourced from `cosyte`). They supply the pull-request requirement, linear history, the deletion and
  force-push bans, and a subset of the CI contexts above. A `PUT` against either returns 404 from
  this repo even though a `GET` returns 200, so they are read-only here: change them in the org,
  never by copying them into the repo ruleset.

**One repository ruleset, extended in place, is the whole convention.** Do not add a second one for
the next gate. `no-emdash` and `no-internal-refs` each arrived as its own single-context ruleset, and
because the base ruleset was correctly pinned the repo looked protected while both newcomers pinned
nothing at all. That matters because **an unpinned required context can be satisfied by any actor
with write access posting a commit status of that name, without the workflow ever running.** A repo
is not pinned because one of its rulesets is.

Pin against the **real check-run context**, verified on an actual `pull_request` run, never against a
workflow `name:`. The context is `<job id>` for a workflow in this repo (`no-emdash`, not
`Em-dash gate / no-emdash`) and `<caller job> / <called job>` for a reusable one. Requiring a context
no workflow emits blocks every pull request permanently.

Things that silently detach or hollow out a required check:

- **Renaming a job.** The ruleset keeps requiring a context nothing emits. Rename the job id and the
  required context together, or neither.
- **Splitting a step into its own job.** A required job gates all of its steps, so moving one out
  quietly un-requires it.
- **Narrowing `include` in `vitest.config.ts`.** `pnpm test` takes no path arguments, so that single
  glob is the sole selector for everything `ci / verify` runs. Coverage does not backstop it:
  coverage is measured over `src/**/*.ts` only, so dropping `test/scripts/phi-scan.test.ts` or
  `test/property/` costs zero coverage percent and reds nothing.

  **This one is now gated.** `scripts/check-test-selection.ts` (`pnpm check:test-selection`, required
  context `test-selection`) compares the test files that **exist** against the test files vitest
  would actually **run**, and reds on any shortfall **in its subject**. Read that scope before you
  trust it: only `test/property` (workflow-derived) and the PHI suite are watched by a
  name-independent rule. The other 20 of 24 test files are watched by the `.test.`/`.spec.` filename
  shape alone, and `test/_helpers/` is watched by nothing, so `git mv <suite>.test.ts <suite>.checks.ts`
  or moving a real suite into `test/_helpers/` stops it running with the gate still green. **That is
  the largest known hole in this gate.** It is why the OK line prints the count of tracked `test/**`
  modules no rule watches (today 3). Closing it means **deriving more subjects from workflows**, not
  widening the name pattern and not hand-listing "files that are really tests", which would be a
  second lever on the gate's own scope. Four things about its shape are deliberate and should be
  preserved if you port it.
  1. It asks vitest for its **resolved** selection (`vitest list --filesOnly`) instead of reading the
     globs, so an `exclude` and a `projects` split in the config are caught alongside a narrowed
     `include`. **A config body that branches on its own invocation is not caught**, and an earlier
     draft of this line wrongly said it was: the gate resolves under `vitest list` while CI runs
     `vitest run`, so an `include` keyed on `process.argv` can answer the two differently.
  2. **The config is not the only selector; the invocation is one too**, and `vitest list` cannot
     see it. That rule **does not parse the script body**: `test` and `test:coverage` must equal
     one of two exact strings (`vitest run`, `vitest run --coverage`). This is the half the refuter
     broke **three times**, each time in the remedy for the last: keying on the literal `vitest run`
     let `vitest --run <path>` past; looking only for bare tokens made every `--flag=value`
     narrowing invisible; and tokenising after a whole-word `vitest` failed closed on arguments but
     **open on the invocation**, so `"test": "pnpm run test:unit"` had no `vitest` token, produced
     no arguments, and was reported as passing. **Analysing a shell string is unbounded and each
     round bought one more spelling.** If you port this, port the exact-match rule, not a parser.
  3. Its two headline subjects are **derived from files that exist for their own reasons**, the fuzz
     workflow that names `test/property` in order to run it, and the PHI-scan switch being on in
     `ci.yml`, so dropping a subject means visibly editing a workflow. Under a derived path the
     subject is **every module whatever it is called, with no exemption at all**: a helper may not
     live there, and this repo's one helper moved to `test/_helpers/fuzz-config.ts` to satisfy that.
     **Both exemptions this rule used to offer were walked through by a rename**, and both were
     measured green. The `_` prefix alone let `git mv <xxe suite> _xxe.ts` drop the XXE refusal
     suite. Adding "**and** something that runs imports it" did not fix it, because that test was a
     bare substring search over the concatenated text of every selected file: `_helpers.ts` passed
     (15 of 24 selected suites contain it, from `../_helpers/load-fixture`), as did a `_`-prefixed
     directory (`_x/parse.ts`; `parse` appears in 21 of 24). **Same lesson as the invocation rule:
     stop interpreting.** The PHI rule likewise requires **every** tracked `test/**` module
     referencing the scanner to be selected; the briefly-inverted form ("does anything that runs
     exercise it") traded a loud false red for a silent hole and was measured green on
     `git mv phi-scan.test.ts phi-scan-suite.ts` plus a planted comment. Its **residual is open**:
     the subject is text-derived, so stripping the reference from the renamed suite _and_ planting
     one in a running file still passes. Matching an import specifier would close it, and does not
     apply yet because this PHI suite spawns the scanner rather than importing it.
  4. It **re-proves itself on every run**: three self-tests seed the removals it exists to catch,
     one of them resolving a genuinely narrowed vitest config through real vitest, and it exits
     non-zero if its own rules fail to red. Cover every rule with one, **and seed the colliding
     direction**. The first version self-tested only the rules that were already sound; the second
     hid _every_ protected file at once, which exercises only the collision-free case, which is
     exactly why the two substring rules above passed their own self-test while blind. Self-test A
     now drops each protected file **one at a time**, leaving the others selected.

  Demonstrated red by seeding, one at a time: a narrowed `include`; an added `exclude`; deleting
  `test/property`; a positional filter written both as `vitest run <p>` and `vitest --run <p>`;
  `--config=`, `--project=`, `--dir=`, `--shard=`; a body that never names vitest at all
  (`pnpm run test:unit`, `node node_modules/vitest/vitest.mjs run <p>`, `sh -c '...'`); renaming a
  fuzz suite to `.spec.ts`, `_xxe.ts`, and the colliding `_helpers.ts` / `_x/parse.ts`; the PHI
  suite to `.checks.ts` and to `phi-scan-suite.ts` with a comment planted elsewhere; flipping
  `run-phi-scan` to `false`; and deleting the PHI suite. Removing every workflow mention of the fuzz
  path makes it **refuse to report** rather than pass vacuously. The last three renames were
  **measured green on the previous version** and are why it was cut back.
  **These routes are closed; that is not the same as the selection being uncollapsible**, and
  writing it up as the latter has been the recurring mistake in this repo. What the gate does not
  reach is in its header: it does not see which script the shared pipeline in `cosyte/.github`
  chooses to invoke, nor package scripts other than those two, nor anything a workflow runs inline;
  and selection is necessary but never sufficient, so a selected test that asserts nothing useful is
  still the refuter's problem and coverage's.

- **Narrowing `pnpm phi-scan`.** It is a floor, not a gate, and it still moves without a workflow
  edit: `scripts/phi-allow-list.txt` and an entry in `phi-scan-overrides.md` both widen what passes.
  The two worst narrowings are closed: the roots are `SCAN_ROOTS` in `scripts/phi-scan.ts` (`src/`,
  `test/`, `scripts/`, one list shared with `--staged`) rather than a hardcoded `test/fixtures/`
  that left `test/` unscanned, and the scan now refuses (exit 2) any invocation whose target set is
  empty rather than reporting `OK` over nothing. What remains narrowable is the allow-list, the
  override log, and anything that changes what the **enumerator lists** (the roots, the `--staged`
  git flags, `isFile()` vs symlinks): the first two are reviewed commits, the third is the class the
  rename blind spot came from, so treat an enumeration change as a gate change. **Dispatch is
  content-first at every path** (`NCPDP-PHI-SCAN-DISPATCH`): `detectFormat` used to open with a path
  predicate, so one byte-identical SCRIPT document scored 2 hits as `.xml` and exit 0 as `.ts`,
  `.txt`, `.dat` and `.json`, plus exit 0 as `.ncpdp`, where the extension routed XML into the Telecom
  tokenizer. **And the two content signals are not exclusive** (`NCPDP-PHI-SCAN-CONTENT-RESIDUALS`):
  `detectFormats` returns every format the bytes signal and a payload signalling both is scanned by
  both, because testing separators _instead of_ the XML-document test let ONE stray `0x1C` in a
  `<Note>` route a complete prescription to the Telecom tokenizer, scoring 0 hits at every extension
  including `.xml`, where the identical document without that byte scored 4. **That was fixed as a
  union, not a precedence** (ranking XML first only moves the hole onto a Telecom transmission inside
  an XML envelope), and the extension fallback now folds case, which is the other residual that slice
  closed. **The fallback arm is load-bearing and neither fix removed it**: it is what keeps a `.xml`
  fragment fixture and a separator-less `.ncpdp` field token structurally scanned, and it is pinned
  against deletion. **Read both fixes against their bound: they close wherever the two content tests
  AGREE about a payload** (the union where both claim it, the case fold where both decline it, which
  is every payload the fallback governs), **and what is open is where they disagree.** One content
  signal still suppresses the fallback entirely,
  so a `.xml` **fragment** (leading prose, not a document) plus one `0x1C` still scores 0 where the
  same fragment without it scores 1, measured identical on `e1d9a34` and after. **Residuals survive,
  and that list is not closed.** The headline one is deliberate: a message **embedded** in a string
  literal is still not structurally scanned anywhere, because the payload as a whole is not a
  document, so it is checked for dashed SSNs and emails but not for names or DOBs. Two narrower ones:
  the fallback matches a whole suffix (`.xml.bak` gets the text pass), and a separator-less Telecom
  payload is reachable only through that fallback. All are in `phi-scan-overrides.md`, and **all four
  are now executable** in `test/scripts/phi-scan.test.ts`.
- **Requiring a workflow with no `pull_request` trigger.** `fuzz`, `scorecard` and `release` are
  schedule, push or dispatch only. Requiring any of them strands every pull request forever, which is
  why they are excluded on purpose.
- **Requiring `CodeQL` (the Advanced Security check, app `57789`) instead of
  `codeql / analyze (javascript-typescript)`.** The former reports alert state, not whether the
  analysis ran.

Finally, and it is the part no test can tell you: **nothing inside this repository can observe its
own ruleset.** Delete the ruleset and every test still passes, every gate still prints OK, and this
file still says `main` is protected. A ruleset makes a red check block a merge; it does not make the
check correct. The only way to know the protection is real is to read it back from the API
(`gh api "repos/cosyte/ncpdp/rulesets?includes_parents=true"`), and a green suite is not evidence.

## Engineering Guardrails

- **`attw` SAYS "does not contain types" AND EXITS 0, SO THE `attw` SCRIPT IS A WRAPPER, NOT THE
  BARE CLI** (`ATTW-FALSE-GREEN-PORT`). `getExitCode.js` in `@arethetypeswrong/cli@0.18.4` opens
  with `if (!analysis.types) return 0`, so the problem list is never consulted and no `--profile`,
  `--ignore-rules` or config setting reaches that early return. An untyped package is a legitimate
  npm package, so "no types at all" is a description to `attw`; for a package that ships types it
  means the declarations were **not in the tarball**. A false red costs an hour; a false green
  merges. **The race only supplies the condition**: reproduced here with zero concurrency by
  deleting all 20 declaration files, and by `rm -rf dist`, both exit 0 on the bare CLI. `tsup` emits
  JS before declarations, measured on a clean build of this package at a **4448 ms window** (first
  JS 3407 ms, first declaration 7855 ms), so a concurrent build or `clean` in the same tree lands
  `attw` in it. The answer is **not** a lock, lease or build queue: the gate must be able to say its
  own inputs were missing, whatever removed them. `scripts/verify.sh` needs no change.

  `scripts/attw.mjs` carries **two nets that catch different things, so keep both**: a preflight
  that every relative path `package.json` promises (`main`, `module`, `types`, `typings`, every
  string leaf of `exports`, **and every string leaf of `typesVersions`**) exists and is non-empty,
  which catches the race and _names the missing file_; and a post-check on attw's untyped sentence,
  which catches what the preflight structurally cannot, declarations present on disk but excluded
  from the tarball by `files`/`.npmignore`. **No instance of that second case has occurred here**,
  and the manifest is not currently arranged to allow it (`files[0]` is `dist`, no `.npmignore`),
  but that is a fact about today's manifest, not a property of the build.

  **▶ `analysis.types` IS NOT A FACT ABOUT ENTRYPOINTS, AND THE FIRST DRAFT OF THIS SLICE SHIPPED
  THAT ERROR INTO THE GATE'S OWN MESSAGE. ITS REFUTER CAUGHT IT BY MEASUREMENT.** `checkPackage.js`
  computes it as `pkg.containsTypes()` and **returns before resolving a single entrypoint**;
  `createPackage.js` defines that as `listFiles("/").some(ts.hasTSFileExtension)`, so it is **any
  file in the tarball with a TS extension, anywhere**. A clean build here emits **20** declaration
  files: 10 entry declarations (5 entries by 2 formats) and **10 shared-chunk declarations**
  (`decimal-*.d.ts`, `warnings-*.d.cts` and friends), and `files: ["dist"]` packs all 20. Three
  consequences, each measured:
  - Deleting just `dist/index.d.ts` + `dist/index.d.cts` **exits 1** here, where the same deletion
    reproduces the false green in a single-entrypoint sibling. Do not import that sentence.
  - Deleting **all 10 entry declarations** and leaving the chunks **also exits 1**, because the
    chunks keep `containsTypes()` true. The first draft branched on exactly "every declared
    declaration path is missing" and announced `attw would have ... EXITED 0` on that tree. It
    would not have.
  - The false green needs the tarball to carry **no TS-extension file at all**.

  So **the preflight now claims no counterfactual whatsoever**: it sees the manifest, never the
  tarball, so it cannot know, and it says only that a promised file is absent. The one place the
  exit-0 behaviour is asserted is the post-check, where it is not a counterfactual at all because
  attw has just printed the sentence and returned 0. A test pins that no "EXITED 0" appears on
  either the partial-loss or the surviving-chunk tree, so restoring the branch reds.

  **The post-check reads a string, so what would hide that string is refused**, not tolerated. Six
  routes were measured **in this repo** against an untyped pack, each restoring the exact false
  green: `--quiet`, `-q`, `--format json`, **`-fjson`**, and a `.attw.json` setting `quiet` or
  `format` (`readConfig()` applies it after argv). `--config-path` is refused too, but **by
  inference, not measurement**. `-fjson` is why **short forms need a cluster rule, not a
  whole-token match**: attw drives `commander` with `_combineFlagAndOptionalValue`, so a short flag
  swallows its value into the same argv token, and a draft matching tokens against a set of option
  names let it through at exit 0. The refusal is **by option name, wholesale, not by value**, and
  for short forms **by any letter in the cluster**: `--format table` was measured to still print
  the sentence and is refused anyway, which is the deliberate trade against value-parsing them. A
  manifest declaring **no** relative artifact path is also refused rather than passed, on the same
  rule as the PHI scanner's empty-target-set refusal: never report a pass from a check that read no
  files. And **`main`/`module`/`types`/`typings` are checked without requiring a `./` prefix**
  (`"types": "dist/index.d.ts"` is legal); an early draft ran them through the `exports`-only rule
  and dropped such a path silently while still reporting it had checked.

  `test/scripts/attw-gate.test.ts` pins both nets against the real binary, **including the upstream
  exit-0 itself**, so an `attw` upgrade that reworks the wording or fixes the exit code reds the
  suite instead of letting the net go quietly slack. It also pins a **negative control** on a
  well-formed package and that a real `attw` failure still fails: a gate that only ever fails is not
  a gate, and one that swallows the status is not one either. **18 of its 21 cases were demonstrated
  red against the old bare invocation**; the 3 that stayed green are exactly the ones that should
  (attw's own exit-0, transparency on a real failure, and the negative control). **Re-derive that
  split if you add a case**; the remedy for this slice's own refutation added four tests and left
  the number reading 14, which the next pass caught by arithmetic (14 + 3 does not make 21).

  **This is a per-repo script.** Siblings that still invoke the CLI directly carry the same defect,
  including `config/scripts/parser-template/`, which new parsers are minted from. Do not write the
  repo count down here; derive it:
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
   comments are **not gated** and identifiers are **welcome** in them, because **the convention says
   source comments are a place identifiers belong**. That is the whole reason. **Do not justify this
   boundary from what reaches `dist/` -- two attempts to and both were false.** Measured: `dist` is
   `files[0]`, there is no `.npmignore`, the emitted bundles carry `//` comments verbatim, and
   `dist/*.map` carries every tracked source byte in `sourcesContent`, so **everything in `src/` is
   in the tarball**. The line is therefore not what reaches a consumer's disk (all of it does) but
   what a consumer is **shown**: JSDoc their editor renders on hover, and message text their log
   prints. Two consequences: a doc comment is not
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
- `@cosyte/ncpdp/script`: SCRIPT Standard (v2017071 + v2023011), XML ePrescribing via Surescripts
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
