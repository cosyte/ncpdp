# Changelog

## 0.0.13

### Patch Changes

- b0999b2: Strengthen this repository's PHI commit-gate so a full sweep reads the bytes git carries as well as
  the files on disk. No runtime behaviour, public API, parsed output, or emitted diagnostic changes.

  The sweep previously proved that every tracked, in-scope path had been opened, and then read each one
  from the working tree. A working tree is not the committed corpus, so a payload held in the index at
  a path the sweep had opened was reported clean, with a file count that was entirely correct. The
  sweep now reads both, as a union.

  Duplicate reads are skipped on the pair of a path and git's own object name for its content, so an
  unmodified checkout matches every index entry without fetching anything, and where a path's two
  copies differ both are scanned. A conflicted path is read at every stage it holds, each reported with
  its stage, so the merge base is never mistaken for what git carries.

  Every report line now carries both the number of files scanned and the number of additional blobs
  read, so neither number can be read without the other. Content found in a carried blob exits 1, the
  same as content found on disk; a git command that cannot answer exits 2 rather than reporting a pass.

- 2cade73: Add a repository check that keeps this project's two-file contributor guidance in step, so a rule
  can no longer point at reasoning that has quietly stopped existing. It verifies that the narrative
  document is tracked, that no section has been emptied down to its heading, and that every anchor
  pointing into it resolves.

  No runtime behaviour, public API, parsed output, or emitted diagnostic changes.

## 0.0.12

### Patch Changes

- b041427: An all-mode PHI sweep now reconciles the files it actually opened against `git ls-files` and refuses
  when a tracked in-scope file went unread, so an emptied scan root can no longer read as clean on that
  route. Internal repo tooling only: no published API, type, warning code or parse-result change.

  The root check shipped previously certifies that each declared scan root EXISTS and is ENUMERABLE. It
  never certified that anything was OBSERVED under one, and no version of it could: an empty directory
  enumerates perfectly. Measured in a clone at `16c2fea` with that check in place, emptying `src/` (51
  tracked files, the directory left in place) printed `OK: no hits (71 file(s) scanned)` and exited 0;
  deleting `src/telecom/` alone printed `OK: no hits (105 file(s) scanned)` exit 0 with 17 unopened;
  the healthy control printed 122.

  A denominator cannot detect either shape, which is the second time that has had to be recorded here:
  71 next to a healthy 122 is not a number anything about the report makes look wrong, because a count
  counts the files that WERE found. The sweep now refuses (exit 2) naming every tracked in-scope file
  it did not open. The expected set comes from the index, never from the walk, because anything
  re-derived from the walk would agree with the walk forever.

  Fails closed when git cannot say what is tracked (pre-fix that case printed `OK: no hits` and
  exited 0; no denominator is quoted, because with `.git` gone `git check-ignore` cannot answer either
  and the count moves with whatever ignored files happen to be on disk). `--staged` and paths mode are deliberately not reconciled, since
  neither claims to have covered the tree. Exit codes were derived in this repo rather than ported from
  a sibling.

- df05854: `CHANGELOG.md` is now written by the release rather than by hand, so the copy inside every published tarball stops describing already-shipped code as something still to come.

  The file is listed in `package.json#files`, so it ships with the package. For the whole of this package's published history `.changeset/config.json` set `"changelog": false`, which meant no release ever wrote a version heading into it and nothing ever rolled its single hand-maintained `[Unreleased]` heading over. Its preamble went on describing the first pre-alpha release in the future tense, as a thing still to come, inside tarballs that had already carried the API surface it named for several versions.

  The mechanism changed rather than the sentence: `changelog` now names the default Changesets generator, so each release writes its own version heading and the changeset summary becomes the entry a reader sees. Correcting the preamble by hand would have left in place the mechanism that wrote it, to write it again on the next release.

  The hand-written history is preserved verbatim, moved under a new `Released before this file was generated` heading with generated sections above it. No entry was reworded, re-ordered, re-wrapped or re-sorted: the archived text is byte identical to what the repository already held. What was dropped was scaffolding for the workflow that no longer runs, together with the preamble it belonged to: the `[Unreleased]` heading, its link definition at the foot of the file, three empty section stubs, and the future-tense paragraph itself.

  The release's Prettier pass is left on, which is derived from this package having no `.prettierignore` and a format check that covers root markdown: with it off, generated output would fail that check on a file nobody edited.

  No runtime code, public API, type, warning code or parse result changed.

- 2978d94: The README lockup now links to cosyte.com (`ASSETS`).

  The `<picture>` block above the H1 is wrapped in an anchor to https://cosyte.com, per the founder
  requirement of 2026-08-06. Nothing inside the block moved: the `<source>`, the `<img>`, the alt text
  and both tile URLs are byte-identical.

  What the anchor does was measured on both surfaces by `fhir`, not assumed, because fourteen READMEs
  carry this shape. On GitHub the anchor works and the colour-scheme switch keeps working, because the
  `<img>` stays a direct child of `<picture>`, which is the condition the HTML spec puts on `<source>`
  applying at all. On an npm package page the anchor is lost: npm wraps a README image in its own
  anchor to the image file, a nested anchor is not representable, so the parser closes ours early and
  the image ends up linked to the image file rather than to cosyte.com. Shipped anyway by founder
  decision of 2026-08-07: on npm that is no worse than the unlinked lockup it replaces, and GitHub is
  where these READMEs are read.

## Released before this file was generated

Every release section above this heading is written by
[Changesets](https://github.com/changesets/changesets) from the changesets in `.changeset/`, newest
release first. The release writes its own version heading, so nothing above this line is maintained
by hand: a change is recorded by adding a changeset, and that changeset's summary is the entry a
reader sees here.

Everything below this heading was maintained by hand. It sat under a single `[Unreleased]` heading
that no release ever rolled over, and the preamble that stood above it described the first pre-alpha
release in the future tense, as something still to come, inside tarballs that had already carried
the API surface it named for several published versions. The entries are left as they were written
rather than re-sorted into version sections: the file never recorded which release each entry went
out in, and re-sorting would rewrite text that published tarballs already carry. They are byte
identical to what this repository held before the generator was turned on, which is also what
installed copies hold, apart from any entry written after the last release and not yet shipped. No
entry was reworded, re-ordered or re-wrapped.

What was dropped was scaffolding for the hand-written workflow that no longer runs, together with
the preamble that scaffolding belonged to: the `[Unreleased]` heading itself, its link definition at
the foot of the file, the three empty section stubs that existed to receive the next hand-written
entry, and the future-tense paragraph, which the text above replaces.

The entries below follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the generated
sections above use the format Changesets writes, which is a version heading and a list of the
changes that release consumed. Versions follow the cosyte pre-alpha ladder, `0.0.x` until first
alpha, rather than [Semantic Versioning](https://semver.org/spec/v2.0.0.html) alone.

### Fixed

- **PHI-SCAN-OBSERVED-NOTHING-IS-GLOBAL (the emptied-root half): the PHI gate certified that its scan
  roots EXISTED, never that anything under them was OBSERVED, so an emptied root printed OK over 51
  unopened tracked files.** Internal repo tooling only: no published API, type, warning code or
  parse-result change.

  **An empty directory enumerates perfectly**, so the root check shipped in the previous entry passes
  it completely. Measured in a clone at `16c2fea`, with that check in place: emptying `src/` (51
  tracked files, directory left in place) printed `OK: no hits (71 file(s) scanned)` and exited **0**;
  deleting `src/telecom/` alone printed `OK: no hits (105 file(s) scanned)` exit 0 with **17**
  unopened; the healthy control printed `122 file(s) scanned`.

  **A DENOMINATOR CANNOT DETECT THIS, for the second time in this file.** 71 next to a healthy 122 is
  not a number anything about the report makes look wrong, because a count counts the files that WERE
  found. The remedy cannot be a better count. An all-mode sweep now **reconciles the paths it actually
  opened against `git ls-files`** and refuses (**exit 2**) naming EVERY tracked in-scope file it did
  not open. The expected set comes from the INDEX and never from the walk: the walk reads directory
  entries, git reads the index, and emptying a directory on disk moves only the first, so anything
  re-derived from the walk would agree with the walk forever.

  **It fails CLOSED when git cannot answer** (pre-fix, with `.git` moved aside: `OK: no hits`, exit
  0), because an unanswerable git must not be a way to switch the rule off. No denominator is quoted
  for that shape: with `.git` gone `git check-ignore` cannot answer either, so the count moves with
  whatever ignored files are on disk. The exit code is the reproducible part.
  `--staged` and paths mode are deliberately NOT reconciled: neither claims to have covered the tree.
  A tracked `.md` is exempt (it is exempt from the read), an `--allow-fixture` path counts as
  accounted for, and an untracked file is never expected.

  **Exit codes derived here, not ported.** Both refusals are 2, this scanner's code for "the run is
  not evidence"; pre-fix every shape above exited 0 under an `OK` line. The same regular-file-root
  shape exits 2 in a sibling and 1 in another, and was 1 here before the previous entry.

  The pinning test that asserted the residual was live has been flipped **with its argument written
  down**: it now asserts the ROOT refusal stays silent while the corpus refusal fires, so folding the
  two rules together goes red. The suite was verified RED against the pre-fix scanner before it was
  verified green, and **every case that stayed green is one asserting a PASS** (healthy
  control, `.md` exemption, `--allow-fixture` exemption, gitignored-force-add guard). No tally is
  quoted here on purpose: one was written down and was wrong twice within this change, so it was
  deleted rather than corrected a third time. Its load-bearing case is a negative control that runs
  the same missing file twice, tracked and untracked, demanding opposite verdicts.

  **Residuals, stated rather than implied closed.** A message embedded in a string literal is still
  not structurally scanned (a recogniser gap, untouched). The fail-closed test is `tracked.size > 0`,
  a PRESENCE test and not a COVERAGE one, so a checkout with no `.git` of its own nested in a repo
  that tracks almost nothing reconciles against that thin index (measured: `OK: no hits (3 file(s)
scanned)` exit 0 with two files unopened); not live for this repo, which has its own `.git`. And
  `git status` does NOT reveal a file hidden by a sparse checkout or a `skip-worktree` bit, which is
  why the rule reads the index rather than the status. No files were added to the corpus (122 scanned
  before, 122 after).

- **PHI-SCAN-OBSERVED-NOTHING-IS-GLOBAL: a declared scan root the PHI gate could not enumerate was
  skipped in silence, and the sweep reported OK over a directory it never opened.** Internal repo
  tooling only: no published API, type, warning code or parse-result change.

  **`scripts/phi-scan.ts` names three scan roots and walked each behind `existsSync`**, so a missing
  one made `walk()` return without a word while the remaining roots supplied a corpus, a report and a
  count. Measured on `5e2b42b` with `src/` (51 tracked files) moved aside: `OK: no hits (71 file(s)
scanned)`, exit **0**, against 122 files on a healthy tree.

  **The denominator did not save it, and that is the part worth keeping.** Every report line has
  carried a file count since the argument-driven collapse routes were closed, and one was printed
  here. 71 is not a number anything about the report makes look wrong, because **a count is a count
  of the roots that DID exist and can never witness one that did not.** Checking the roots is a
  different rule and had to be written separately.

  **The dangling-link case is the sharpest, and it is why the check is `lstatSync` and not
  `existsSync`.** With the same root replaced by a symbolic link to a path that does not exist, the
  output was byte-identical: `OK: no hits (71 file(s) scanned)`, exit 0. `existsSync` **follows** a
  link and answers false, so the walk returned before `readdirSync` ran and the existing
  non-regular-entry refusal never fired. That refusal classifies entries found **inside** a root, and
  a root is not inside itself. The two refusals now read the filesystem through different calls and
  keep separate closed-set kind vocabularies (`direntKind`, `statsKind`), and **neither ever prints a
  link target**, because a diagnostic about a leak is itself a disclosure surface.

  **A root is a DECLARATION; a subdirectory found inside one is a DISCOVERY.** A false declaration
  now refuses with exit 2, naming the root and a closed-set kind token; a subdirectory that vanishes
  between its parent's listing and the recursion into it stays in the tolerated-transient class, so
  the `existsSync` guard survives inside `walk` with a comment saying it is no longer a root check.

  **Exit codes were derived here, not ported, and it mattered.** A root replaced by a regular file
  never reached the missing-root branch at all: `readdirSync` threw `ENOTDIR` uncaught and the process
  exited **1**, which this scanner's own contract reads as "hits found" for a run that scanned
  nothing. The same shape exits 2 in `hl7` and 1 in `terminology`; neither was evidence about this
  repo. Three more uncaught-throw routes measured in the same class exited 1 for the same reason and are now
  `InvocationError`s: an unreadable root directory, and a present-but-unreadable allow-list (the
  _missing_ allow-list was already handled; its unreadable twin was not).

  **The repository's own test harness was an instance of the defect.** `makeScratchRepo()` created
  two of the three roots and no `src/`, so every all-mode sweep run against a scratch repo was
  reporting OK over a tree with a declared root it never opened. It now creates every root in
  `SCAN_ROOTS`. Twelve cases pin the behaviour, nine of them verified **red** against the previous
  scanner while the control passed on it, so the refusal is demonstrably conditional. The three
  `EACCES` cases **skip** under a privileged uid rather than assert an error that uid cannot produce,
  because a test reporting PASS over something it never ran is the shape this whole suite refuses.

  **THE RULE CERTIFIES EXISTENCE AND ENUMERABILITY. IT NEVER CERTIFIES OBSERVATION, and this item is
  NOT closed without residual.** ANY tracked file the enumeration does not reach is invisible to it, and an emptied root or a root missing a whole subtree is only the loudest shape of that. Deleting one tracked file reports `OK: no hits (121 file(s) scanned)` exit 0 on base and head alike. Such a root satisfies every
  check `walkRoot` makes and the sweep still reports clean over files git tracks. Measured on
  `e039229` with the check already in place: emptying `src/` printed
  `OK: no hits (71 file(s) scanned)` and exited 0 with **51 tracked files unopened**, and deleting
  only `src/telecom/` printed `OK: no hits (105 file(s) scanned)` exit 0 with **17** unopened. That is
  `PHI-SCAN-OBSERVED-NOTHING-IS-GLOBAL`'s headline observable, still live, recorded as open in both
  ledgers and pinned by a test that reddens the day it is closed. **It is not the enumerate-then-read
  race and needs no content-addressed sweep**: the subtree is gone before enumeration, and `main()`
  already holds `gitTracked()`, so the closing rule is a reconciliation of the observed set against
  the tracked scannable set. An earlier draft of this entry asserted both and both were measured false
  before it shipped. It also contradicts an invariant this gate already states, that a **tracked** file
  which cannot be **read** refuses the sweep, while the same file absent one syscall earlier is
  skipped.

  Three further refusal routes closed alongside it, all the same class: a present-but-unreadable
  **override log** (a third uncaught-throw route next door to the allow-list twin, exiting 1 for a run
  that scanned nothing); **every** broken root now named rather than the first, matching the principle
  the non-regular-entry refusal already states; and a root that is a symbolic link to a **real**
  directory, which was the contested half of the decision and was pinned by no test.

  **Three residuals were re-derived here rather than ported, and all three are already closed in this
  package** (`PHI-SCAN-WALK-ROOT-SCOPE`, whose headline half does not reproduce here): the roots have
  covered the whole of `test/` and `scripts/` since they were widened, so there is no `test/` gap; a
  census of the 22 tracked non-markdown files outside the roots yields exactly one hit, the
  deliberately public company contact address in `package.json`, so widening the root set would buy
  an allow-list entry and no coverage; and an unmerged (`U`) index entry is refused rather than
  dropped, re-measured against a real conflicted index, because `--diff-filter=d` includes it.
  `PHI-SCAN-RENAME-BLIND-AT-PRECOMMIT` is likewise closed here, by `--no-renames`.

  **This adds no files to the corpus.** The healthy count is 122 before and 122 after, so it is a
  refusal rather than a wider enumeration, and the standing recogniser gap is untouched: a message
  embedded in a `.ts` string literal is still not structurally scanned. That is a separate change.

- **CI-REQUIRED-CHECKS: `test-selection` is now genuinely a required check on `main`, and the
  workflow has stopped claiming it already was.** Internal CI and repo tooling only: no published
  API, type, warning code or parse-result change.

  **The check existed, went green on every pull request it ran on, and blocked no
  merge.** `.github/workflows/test-selection.yml` asserted in prose that repository ruleset
  `19841505` required the `test-selection` context. Measured against the API on 2026-08-03 and again
  on 2026-08-04 immediately before the change, the required set held seven contexts and that was not
  one of them. By the workflow's own words, a check that cannot fail is documentation; a green check
  that cannot block a merge is the same thing wearing a tick, and it is worse, because the file
  said otherwise.

  **Fixed in the required order, which is the half that is easy to get backwards.** A context is
  added to a ruleset only after its workflow has completed on `main`, never before, because
  requiring a context nothing has emitted leaves every pull request pending and unmergeable rather
  than red. This workflow had completed on `main` on the `push` trigger, repeatedly and
  successfully, so the context was added to the existing `ci-required-checks` ruleset in place,
  pinned to the GitHub Actions app (`integration_id: 15368`), and read back from the API rather than
  from the payload. It was scoped to `cosyte/ncpdp` alone, confirmed by a negative control: the same
  assertion run against `hl7`, `x12`, `ccda` and `mllp` fails on all four.

  **The price was measured rather than assumed, and it was zero.** Requiring a new context blocks
  any open pull request whose branch predates the workflow, because that branch carries no such
  check run. Exactly one open dependabot pull request here was in that state, and it was **already
  blocked**: its head sha carries four check runs and was already missing three contexts required
  before this change (`codeql / analyze (javascript-typescript)`, `no-emdash`, `no-internal-refs`).
  Nothing was newly blocked. A rebase clears it either way, and a bypass actor is never the answer.

  **Nothing in this repository currently observes its own ruleset, and that is a gap rather than a
  law.** The workflow comment now carries the `gh api` command instead of a claim. It also records
  what the first draft of this change got wrong: it said nothing inside the repository _could_
  observe the ruleset, and that is false. `cosyte/ncpdp` is public and the rulesets endpoint answers
  an unauthenticated request, measured 2026-08-04 returning HTTP 200 with the whole
  `required_status_checks` array under the anonymous `x-ratelimit-limit: 60`. A CI step could
  therefore assert its own context is still required, with no secret and no extra permission. That
  step is deliberately not built yet, and the reasons are recorded rather than the possibility
  denied: the anonymous quota is 60/hour per IP and GitHub-hosted runners share egress addresses, so
  its flakiness needs answering before it may block a merge, and whether the Actions `GITHUB_TOKEN`
  is accepted for that endpoint is unverified.

  Three further corrections to `scripts/check-test-selection.ts`, all documentation, none a change
  to what the gate enforces:
  - **`trackedFiles()` is recorded as reviewed by a person, not by the gate.** It is the one
    enumeration every other rule derives from, and no self-test seeds it, so a filter added inside
    it would drop those files from the name rule, from `modulesUnder` and from the PHI rule at once,
    leave them selected by vitest, and pass all three self-tests. Measured with a `test/telecom/`
    filter patched in: exit 0, all three self-tests green. One counter still moves, so it is a blind
    spot rather than a silent one: those files read as selected-but-untracked, and the OK line's
    trailing untracked note appeared and read 8.
  - **The config-branches-on-its-own-invocation hole is now measured rather than described**, so a
    port cannot re-assert that asking vitest for its resolved selection catches it. On `47d87d4` an
    `include` reading `process.argv` served the gate all 26 resolved files at exit 0 with `OK`
    printed, while the branch CI takes resolved to 7. Nineteen suites stop running with the gate and
    every required check green.
  - **The stale present-tense totals in the subject description are corrected.** The header read
    "4 of this repo's 24 test files" and "20 of 24" long after the total reached 26. The OK line is
    now named as the place to read them. It does **not** print the four-file figure or its
    complement, and the header no longer implies it does. Two further `of 24` figures survive on
    purpose, in the
    account of the defect that produced them; they are relabelled as a record of that measurement
    rather than a claim about the tree today.

  Two known holes stay open and are deliberately deferred rather than half-closed, each because it
  needs a decision this change is not the place to make. The `.test.`/`.spec.` rename hole is closed
  only by deriving more subjects from workflows, since widening the name pattern and hand-listing
  "files that are really tests" are both refused by the gate's own design rules, and today only the
  fuzz workflow names a test path. The strip-and-plant residual on the PHI subject is closed only by
  keying on an import specifier, which does not apply while that suite spawns the scanner as a
  subprocess instead of importing it.

- **NCPDP-VERSION-DRIFT-TEST: the sanity suite now pins the exported `VERSION` to `package.json`**,
  so a release that skipped `scripts/sync-version.mjs` goes red instead of publishing a constant that
  lies about the release it shipped in. Test-only: no published API, type, warning code or parse
  result changes.

  **The sync mechanism here was already correct, and was verified rather than assumed.** `changeset
version` rewrites `package.json` alone; the `version` script runs `changeset version && node
scripts/sync-version.mjs`, so the bump and the constant land in the same commit. The published
  `0.0.8` tarball was unpacked and carries `VERSION = "0.0.8"` in both `dist/index.mjs` and
  `dist/index.cjs`. What was missing was the **guard on the guard**: `test/sanity.test.ts` asserted
  only that `VERSION` was a non-empty, semver-shaped string, so removing, reordering or silently
  failing the sync step would have published a wrong constant with the suite still green.

  That failure mode is measured, not hypothetical. A sibling `@cosyte` package carrying the same sync
  script but not this assertion shipped `VERSION = "0.0.0"` on **three consecutive releases**
  (`0.0.2`, `0.0.3`, `0.0.4`), each confirmed by unpacking the published tarball, while an assertion
  pair identical to this repo's stayed green throughout.

  `expect(VERSION).toBe(manifestVersion(pkg))` compares against the manifest, never a hardcoded
  literal, so a bump still needs no edit here. `manifestVersion` narrows the parsed `package.json`
  from `unknown` **without an `as` cast**, so the sanity test cannot lie about its own input. The
  release flow opens a version bump as a pull request and CI runs on `pull_request`, so this reds at
  the moment the drift would be introduced.

  **Demonstrated red in both directions before landing.** With the constant reset to `"0.0.0"`
  against a `0.0.8` manifest: `AssertionError: expected '0.0.0' to be '0.0.8'`. With the manifest
  bumped to `0.0.9` and the sync step skipped: `AssertionError: expected '0.0.8' to be '0.0.9'`. In
  **both** runs the two pre-existing shape-only assertions, which were the entire content of the old
  test, **passed**. That is the measurement that justifies the slice.

  Also deletes a stale comment claiming `VERSION` is `"0.0.0"` "at this stage". It was false at
  `0.0.8`, and it is what made the weak assertion read as deliberate.

  **Scope is one question, on purpose.** The assertion asks only whether the exported constant equals
  the version being released. It does **not** also assert that `sync-version.mjs` is still named in
  the `version` script: that is a second question, and one predicate serving two is exactly how this
  repo's PHI gate went half-blind when root-scope and the `.md` exemption shared a test predicate.
  All **six** other test files matching a `VERSION` grep were checked, not the two the port was
  scoped against: every one of them references **SCRIPT protocol version** codes
  (`NCPDP_SCRIPT_UNSUPPORTED_VERSION`, `VERSION_ABSENT`, `UNSUPPORTED_VERSION_TOLERATED`,
  `KNOWN_SCRIPT_VERSIONS`), and `test/sanity.test.ts` remains the only test that imports the package
  constant at all. None encodes an assumption this change falsifies, and this change alters no value.

- **PHI-SCAN-SYMLINK-BLIND-ON-BOTH-ROUTES: a symbolic link under a scan root read clean on BOTH of
  the PHI gate's enumerating routes**, so a link pointing at a PHI-bearing file passed the gate
  twice over. Repo tooling only: no published API, type, warning code or parse result changes.

  Two unrelated mechanisms produced the same silence. `walk()` enumerates `Dirent.isFile()`, which
  is an **lstat** answer, so a link is neither a file nor a directory and fell out of the loop with
  no branch of its own; `isDirectory()` is false for a linked **directory** too, so a whole subtree
  disappeared the same way. And `git show :<path>` is how `--staged` reads content, while git stores
  a symbolic link as its **target path** under mode `120000`, so that route (this repo's pre-commit
  hook) was handed the path text and never the target's bytes.

  **Measured on `6c901e8`** with a synthetic name-bearing SCRIPT payload written outside the scan
  roots and a link to it under `test/fixtures/script/`: all mode printed
  `OK: no hits (2 file(s) scanned)` and exited **0**; `--staged` printed
  `OK: no hits (1 file(s) scanned)` and exited **0** after `git add`; naming the link explicitly
  exited **1** with both name hits. The payload was always detectable; the two enumerating routes
  never looked at it.

  **Neither route is made to follow the link.** Following would read bytes the enumeration does not
  control (outside the repo, a loop, a device, a FIFO that blocks the gate forever), and git does
  not carry those bytes anyway, so a hit on them would be a claim about something no commit
  contains. The **enumeration** is narrowed instead: an in-scope entry that is not a regular file
  **refuses the scan (exit 2)**, naming **every** offender rather than the first. `--staged` now
  reads `git diff --cached --raw -z` so the destination mode is visible, refuses anything that is
  not `100644`/`100755`, and refuses an unparseable `--raw` record rather than scanning a list that
  may be short.

  A refusal names the entry's **own repo-relative path** and a token from a closed engine-owned set.
  **It never reports the link target**, which is working-tree text that can itself carry PHI: a
  diagnostic about a PHI leak is itself a PHI surface.

  The refusal boundary is "under a scan root", on **both** routes, and that is a deliberate
  half-step away from the predicate that decides what gets **read**. The `.md` exemption inside the
  read predicate is a judgement about a file whose bytes the scan could have opened, and a link's
  **name** is no evidence at all about what is on the other side; using one predicate for both jobs
  made the two routes disagree about exactly one entry. **Measured** on a link named
  `test/fixtures/script/notes.md`: all mode refused (exit 2) while `--staged` printed
  `OK: no hits (1 file(s) scanned)` and exited **0** over the same entry. Neither route's own path
  scope moved: the walk still starts at the same roots and still exempts a gitignored entry, and
  `--staged` still reads only what it read before.

  **Ported from `terminology#37`, with both of its stated conclusions re-measured rather than
  copied.** That sibling had to admit status `T` to a `--diff-filter=AM` allow-list to make its mode
  check reachable at all; this repo's filter was already `--diff-filter=d`, and on git 2.39.5
  replacing a tracked regular file with a link emits `:100644 120000 <sha> <sha> T` under `d` and
  **nothing at all** under `AM`, so nothing needed adding here. Its other disclosed residual does
  not transfer either: `R`/`C` go unenumerated by its `--staged`, whereas `--no-renames` here
  **decomposes** a rename into `D` + `A` and the destination is scanned.

  **Deliberately not covered:** explicit-paths mode still reads **through** a link, because
  `statSync` and `readFileSync` both follow and a human naming one path is asking for that file; a
  gitlink is refused only where the in-scope predicate reaches it; and `walk()`'s own `existsSync`
  then `readdirSync` race still exits `1`, a separate pre-existing defect logged in
  `phi-scan-overrides.md`.

  **16 cases pin this, 11 of them measured red on `6c901e8`.** The 5 that stay green are the ones
  that should: the gitignore exemption, a corpus of ordinary regular files, a staged regular file
  still being scanned and caught, a staged regular markdown file still not being read, and a control
  on which package's scanner the suite is exercising. The payload behind every link is
  **name-bearing**, and one case names the link explicitly first to prove the bytes on the other side
  are exactly what the gate catches, so no case can pass for want of a detectable fixture.

- **ATTW-FALSE-GREEN-PORT: the `attw` publish gate exited 0 on an untyped pack, so a build that
  produced no type declarations passed it.** `attw --pack .` prints "This package does not contain
  types." and exits **0**: `getExitCode.js` in `@arethetypeswrong/cli@0.18.4` opens with
  `if (!analysis.types) return 0`, returning before the problem list is read, so no `--profile`,
  `--ignore-rules` or config setting can reach it. For a package that ships types that means the
  declarations were not in the tarball, which is a broken publish reported as a pass. Repo tooling
  only: no published API, type, warning code or parse result changes.

  `"attw"` now runs `node scripts/attw.mjs`, a wrapper with two nets. A **preflight** checks that
  every relative artifact path the manifest promises (`main`, `module`, `types`, `typings`, every
  string leaf of `exports`, and every string leaf of `typesVersions`) exists and is non-empty before
  `attw` runs, and names the missing file. A **post-check** promotes attw's untyped sentence to a
  failure. Ported from `terminology#28`; `scripts/verify.sh` was not touched, and no lock, lease or
  build queue was added, because the gate's job is to report that its own inputs were missing
  whatever removed them.

  **Reproduced here with zero concurrency**, and the numbers are this package's own rather than the
  sibling's. Two reproducers hand back a false green on the old invocation and exit 1 on the new
  one: deleting all 20 declaration files from `dist/`, and `rm -rf dist`. The trigger is that `tsup`
  emits JS before declarations, measured on a clean build of this package by polling `dist/`: first
  JS at 3407 ms, first declaration at 7855 ms, a **4448 ms window** in every build where `dist/`
  holds `.mjs`/`.cjs` and no declarations.

  **`analysis.types` is a fact about the whole tarball, not about entrypoints**, and the preflight
  therefore claims no counterfactual. `checkPackage.js` computes it as `pkg.containsTypes()`, which
  is `listFiles("/").some(ts.hasTSFileExtension)`, before any entrypoint is resolved. A clean build
  here emits 20 declaration files, 10 entry and 10 shared-chunk, all packed by `files: ["dist"]`.
  So deleting just `dist/index.d.ts` and `dist/index.d.cts` exits 1 here, where the equivalent
  reproduces the false green in a single-entrypoint package; and deleting all 10 entry declarations
  while the chunks survive **also** exits 1. The preflight reds all of these and names the missing
  file, but says nothing about what attw would have done, because from the manifest alone it cannot
  know.

  Six blinding routes were measured **in this repo** against an untyped pack, each restoring the
  exact false green by hiding the sentence while exiting 0: `--quiet`, `-q`, `--format json`,
  `-fjson`, and a `.attw.json` setting `quiet` or `format` (`readConfig()` applies it after argv).
  All are refused, along with `--config-path` by inference. The refusal is by option name,
  wholesale, not by value, and for short forms by any letter in the cluster: attw drives
  `commander` with `_combineFlagAndOptionalValue`, so `-fjson` is a single argv token that a
  whole-token match does not catch.

  `test/scripts/attw-gate.test.ts` pins both nets against the real binary, including attw's own
  exit-0, a negative control on a well-formed package, and that a real attw failure still fails.
  **18 of its 21 cases were demonstrated red against the old bare invocation**; the 3 that stay
  green are exactly the ones that should (attw's own exit-0, transparency on a real attw failure,
  and the negative control).

- **PHI-SCAN-ENUMERATE-THEN-READ-CLASS: a file that vanished between enumeration and read refused
  the whole PHI sweep with exit 2.** All mode lists every scan root first and reads each file
  afterwards, so a transient written and deleted inside that window threw `ENOENT` and aborted the
  sweep. Repo tooling only: no published API, type, warning code or parse result changes. Ported
  from `ccda#80`, which is where this class was found; neither `NCPDP-PHI-SCAN-DISPATCH` (`#47`) nor
  `NCPDP-PHI-SCAN-CONTENT-RESIDUALS` (`#48`) touched the enumerate-then-read shape, and neither is
  altered here.

  **Reachability was measured, not read off the code, and the measurement is narrower than the
  survey's phrasing.** The org survey flagged `ncpdp` on the grounds that `SCAN_ROOTS` includes
  `scripts/` and this repo's own suite seeds violator files there. Both halves check out, and the
  consequence was reproduced:
  - **Deterministic, on `d205efc`'s scanner:** in a throwaway repo, a `git` shim first on `PATH`
    deletes an untracked `scripts/zz-phi-scan-seed.txt` the walk had already enumerated, and the
    unmodified scanner exits **2** with `could not read ... ENOENT`. Negative control: the same shim
    deleting a file outside every scan root exits **0**. After this change the same run exits **0**,
    reports the skip on stderr, and the denominator drops by exactly one.
  - **On this checkout:** a concurrent all-mode `pnpm phi-scan` really does enumerate those
    transients. Across **459** probe sweeps run against a live `test/scripts/phi-scan.test.ts`, 63
    observed a seed present (`scripts/zz-phi-scan-seed.txt` 6, `test/scripts/zz-phi-scan-seed-outside.xml`
    22, `test/fixtures/zz-phi-scan-seed-fixtures.xml` 35).
  - **What was NOT observed: the unassisted interleaving.** Zero of those 459 sweeps refused. The
    window is narrow here: measured on `d205efc`, which makes exactly one `git` call, the read
    phase after it is **48-57 ms** (three runs) against a transient lifetime of **519-577 ms** (the
    suite's own scanner subprocess). That figure is the read phase only, and this change adds a
    second `git` call (`ls-files`, ~9 ms) inside the window it narrows, so the window is now
    slightly wider than the number above even as what a vanished file costs is smaller.
    So this is a live defect on a real in-tree transient, and it is **not** the sibling's situation,
    where the same shape blocked an actual publish. Nothing in `pnpm test` alone races: the only
    all-mode sweeps come from the same test file that writes the seeds, and vitest serialises within
    a file. It takes a second command on the same checkout.
  - **The sibling's exact trigger is absent, by scope and by measurement.** `test/docs-content.test.ts`
    runs `pnpm build` while another worker sweeps, which is the coupling that fired in `ccda`, but
    `tsup` writes its transient at the repo **root** and `SCAN_ROOTS` is `src` + `test` + `scripts`.
    Polled throughout a full `pnpm build`: no file appeared under any scan root.

  **The refusal was correct; the enumeration was unsound**, so the refuse-a-scan-that-observed-
  nothing rule is untouched and nothing here softens it. Exactly one case is tolerated: a file the
  walk enumerated **itself**, that git does **not track**, failing with **`ENOENT`**. It is reported
  on stderr as skipped and **subtracted from the printed denominator**, so `N file(s) scanned` never
  counts a file nothing was read from.

  Everything else still refuses (exit 2): a **tracked** file that cannot be read; any non-`ENOENT`
  failure (`EACCES` / `EISDIR` is a scan that failed, not a file that went away); a tolerated file
  **back on disk** when the sweep ends; a `git` that cannot report the tracked set; a tracked set
  that comes back **empty** (a removed `.git/index` exits 0 with no output, which the `size > 0`
  guard catches; a corrupt one exits 128 and was already caught); and an all-mode sweep that
  **observed no files**, which is the read-side twin of the existing empty-target-set refusal and
  keeps the tolerance from decaying into a clean report of nothing.

  **Which of the new tests were red on base, stated exactly.** Eight cases were added and all eight
  run; **two were red on `d205efc`** and six were green there **by construction**, because base
  refuses everything and five of the six assert a refusal. The two red ones are the tolerance itself
  and the `observed no files` message (base reaches that state and reports `could not read` instead).
  The six green ones are regression pins, not evidence of a fix. Measured by checking out
  `d205efc:scripts/phi-scan.ts` over the working file and running the block: 2 failed, 6 passed.

  **The technique, which is the reusable part: no sleep and no real build.** The scanner runs `git`
  between the walk and the first read, so a `git` shim first on `PATH` is a deterministic hook into
  exactly that gap. Every case runs against a throwaway git repo, so no decoy is ever written into
  this checkout and a parallel worker cannot see one.

  **Known residuals, recorded rather than closed** (scanner docblock + `phi-scan-overrides.md`),
  and that list is not published as complete:
  - the post-sweep re-check is keyed on the enumerated **path**, not on content, so an untracked
    file _renamed_ inside the window goes unread under a clean report. Bounded: committing it means
    `git add`, after which it is tracked and untolerable, and pre-commit reads the index either way.
  - the **back-on-disk re-check is an unguarded bound**, and the first draft of this entry described
    it wrongly. It said losing that branch "would cost the re-check, never the tolerance's bounds".
    The refuter measured the opposite: delete the `back` block and the same input that refuses with
    `vanished mid-scan and is present again` (exit 2) prints `OK: no hits` and exits **0**, with the
    file on disk and its bytes never read. It is unguarded because nothing calls `git` after the
    reads, so there is no deterministic hook; the only reproductions found are timing-dependent (a
    backgrounded re-create against a deliberately large tree), and a load-sensitive sleep guarding a
    load-dependent race is the failure that race teaches. **Treat the branch as load-bearing.**
  - `PRE-EXISTING`, and byte-identical here: `walk()` has the same shape one phase earlier. It does
    `existsSync(dir)` then `readdirSync(dir)`, so a directory removed or unreadable in that window
    throws a plain `SystemError` that `main()`'s `InvocationError` filter does not convert, and Node
    exits **1**, the code this scanner's own contract reserves for "hits found". Reproduced with
    `chmod 000` on a subdirectory under `test/`. It fails closed (non-zero), so it cannot print a
    false `OK`, and it is **not** fixed here. The org survey scoped this residual to the sibling
    repo alone; that scoping is wrong, and it is open here too.
  - the tolerance reads "untracked" from the OUTER repo's `git ls-files`, so a **nested** git repo
    under a scan root (the stray agent-worktree gitlink shape) would make its committed files look
    untracked and therefore tolerable. Not present in this repo today; reproduced in a scratch tree.
    Worth knowing before this remedy is ported to the other scanners.

  Untouched on purpose: `--staged` reads blobs from the git index (`git show :path`) and never
  depended on any of this, so the pre-commit path is unchanged and takes no new `git` call; the
  content-first dispatch and the both-formats union are byte-identical; and the extension fallback
  arm stays pinned against deletion. The residual where one content signal suppresses that fallback
  is **not** addressed here and remains filed as its own decision.

- **NCPDP-PHI-SCAN-CONTENT-RESIDUALS: one stray separator byte silenced the PHI commit-gate over a
  whole prescription, and the extension fallback would not answer to `.XML`.** Both were measured by
  `NCPDP-PHI-SCAN-DISPATCH` below, found identical on its base, and left open there. Repo tooling
  only: no published API, type, warning code or parse result changes.

  **The sharper one, measured red on `e1d9a34` before any fix.** `detectFormat` tested the Telecom
  separators _instead of_ the XML-document test rather than alongside it, so a file satisfying both
  went to the Telecom tokenizer, which finds no field ids in XML. A complete, well-formed SCRIPT
  document carrying `<LastName>`, `<FirstName>`, `<DateOfBirth>` and `<AddressLine1>`, plus a single
  `0x1C` inside an unrelated `<Note>`, scored **0 hits at every extension, `.xml` included**, and the
  gate printed `OK`; the identical document without that byte scored 4 at every extension. One byte
  of corruption, in an element the patient block does not touch, silenced the whole gate, and
  content-first dispatch did not help because the content test itself was what mis-fired.

  **Fixed as a union, not as a precedence.** `detectFormats` now returns every format the content
  signals, and a payload signalling both is scanned by both (telecom, then script). Choosing a winner
  would only have moved the hole: ranking the XML signal first takes the field-id scan off a Telecom
  transmission carried inside an XML envelope, which is now its own pinning test. No target is handed
  a scanner its own content did not signal, so the catch is bought without widening the
  false-positive surface, which is the constraint that deleted the path predicate in the first place.
  The cross-cutting shape pass moved up into `scanTarget` so it still runs exactly once per target,
  rather than once per structural scanner.

  **The second: the extension fallback now folds case**, as `isScannable`'s own `.md` test already
  did. Measured on `e1d9a34`: a `.xml` fragment scored 1 hit where `.XML` and `.Xml` scored 0, and a
  separator-less `.ncpdp` field token scored 1 where `.NCPDP` scored 0. **The fallback arm itself was
  not removed to get there.** It is what keeps a `.xml` fragment fixture and a separator-less
  `.ncpdp` token structurally scanned; deleting it would have made this a trade instead of a
  superset, and it is pinned against exactly that.

  Proven as a differential rather than asserted: 216 probes across 18 payload shapes and 12
  extensions, base vs head, **zero hit locations lost, no exit code going 1 to 0, no duplicated hit
  line, and 42 probes strictly gained**, with the committed corpus unchanged at 120 files / 0 hits.
  **Trust the invariants, not the integers**, for the same reason the entry below says so: that probe
  harness is ad hoc and not in the tree, so the counts record one run while _zero lost_ and _no exit
  going 1 to 0_ are the properties.

  **Both residuals now have pinning tests, which was as much the deliverable as the fix**, and the
  inventory is still not a closed list. **Read both fixes against their bound: they close wherever
  the two content tests AGREE about a payload, and what is open is where they disagree.** The union
  covers the class where both tests claim a payload (a well-formed SCRIPT document); the case fold
  covers the class where both decline it, which is every payload the fallback governs. One content
  signal still
  suppresses the extension fallback entirely, so a `.xml` _fragment_ (leading prose, so not a
  document) carrying `<LastName>` plus one `0x1C` scores 0 hits where the identical fragment without
  that byte scores 1, **measured identical on `e1d9a34` and on this commit**. That is the
  stray-separator downgrade surviving one level down, on the payload class the document test cannot
  claim: it is now written down and pinned rather than implied closed, and unioning the fallback in
  as well would close it, as a further decision with its own false-positive weighing. Two narrower
  residuals are likewise newly executable: the fallback matches a whole suffix, so a fragment named
  `.xml.bak` or `.ncpdp.orig` gets the text pass; and a separator-less Telecom payload is reachable
  only through that fallback, so one named neither `.ncpdp` nor `.xml` is invisible to the field-id
  scan. The embedded-in-a-string-literal gap below is unchanged and still deliberate. This is a
  missed catch in a commit gate over synthetic-only fixtures: no shipped parse behavior was involved
  in either defect.

- **NCPDP-PHI-SCAN-DISPATCH: the PHI commit-gate picked its scanner from the file NAME, so a real
  prescription in a file with the wrong extension was never read.** `detectFormat` in
  `scripts/phi-scan.ts` opened with a path predicate (`test/` prefix, or a `.ncpdp` / `.xml`
  extension) and returned "not an NCPDP message" for everything else, dropping the file to the
  conservative dashed-SSN + email pass. Repo tooling only: no published API, type, warning code or
  parse result changes.

  **Measured on `1cfe029` before any fix: one byte-identical SCRIPT document scored 2 hits as
  `.xml` and exit 0 as `.ts`, `.txt`, `.dat` and `.json`.** It also scored **exit 0 as `.ncpdp`**,
  where the extension short-circuit routed an XML document into the Telecom tokenizer, which finds
  no field ids in it. Both directions are one defect: an extension outranking the bytes in front
  of it.

  Detection is now content-first at every path, in this order: NCPDP control-char separators mean
  Telecom; an XML document (leading `<` after BOM and whitespace, plus an element tag) means
  SCRIPT; and **only then** the extension, as a fallback for a payload that says nothing about
  itself. That last arm is deliberate, not leftover: it is what keeps a `.xml` fragment fixture
  (leading prose, so not a document) structurally scanned, and it is what makes this a strict
  superset rather than a trade. Proven as a differential rather than asserted: 77 probes across 7
  payload shapes and 11 extensions, base vs head, **22 hits to 188 with zero lost and no exit code
  going 1 to 0**, with the committed corpus unchanged at 120 files / 0 hits. **Trust the invariants,
  not the integers.** That probe harness is ad hoc and is not in the tree, so the two counts are not
  reproducible from anything committed and are a record of one run; _zero lost_ and _no exit going 1
  to 0_ are the properties, and they reproduced on two independently-built corpora during review
  (1,014 probes and 99 probes), which the counts did not and cannot.

  **The path predicate was deleted rather than widened, and the residuals it leaves are
  deliberate.** The headline one: a message _embedded_ in a string literal (a SCRIPT fragment inside
  a `.ts` test, or a JSDoc `@example` under `src/`) is still not structurally scanned anywhere,
  because the payload as a whole is not a document; it is checked for dashed SSNs and non-test
  emails, not for names or DOBs. Sniffing NCPDP messages out of arbitrary TypeScript is a separate
  job with its own false-positive surface, and a PHI gate that cries wolf gets bypassed, which is
  worse than a known gap. That gap is now **executable**: `test/scripts/phi-scan.test.ts` pins it,
  so a later change that moves it reds a test.

  **It is not the only one, and the inventory is not a closed list.** Two more, both measured
  identical on `1cfe029` and so untouched here rather than introduced: a single stray `0x1C` /
  `0x1D` / `0x1E` byte anywhere in an otherwise well-formed SCRIPT document routes the WHOLE
  document to the Telecom tokenizer, which finds no field ids in it, so a complete prescription
  scores **0 hits at every extension including `.xml`**; and the extension fallback matches
  case-sensitively, so a fragment fixture named `.XML` gets the text-only pass where `.xml` gets the
  structural one. Both are written up in `phi-scan-overrides.md`. Neither is fixed here: precedence
  between two content signals, and extension normalization, are their own decisions and this slice
  had already spent its widening.

  **A test asserted the opposite of its own title, which is why this read as covered.** "scans a
  mis-extensioned XML fixture by content (still catches PHI)" asserted exit 0, with a comment
  explaining why nothing was caught: a faithful description of the code and a false description of
  the gate. The assertion was corrected to match the title, not the reverse.

  **What was demonstrated, and how, stated precisely rather than as a round number.** Three of the
  new or corrected tests were run RED against the previous scanner itself: the corrected
  mis-extensioned test, and the same-bytes-every-extension differentials for SCRIPT and for Telecom
  (which assert _sameness_, so within their extension lists they red on a name-keyed gate whatever
  shape it takes, for any self-identifying payload; those lists are finite, and a gate keyed on a
  name outside them is invisible to both). The remaining two could not be, and saying they
  were would be the same species of defect this entry is about. The `.xml`-fragment test
  characterizes coverage the previous scanner ALREADY had, so it is green on both trees by
  construction; it was instead demonstrated red against a seeded head scanner with the two extension
  fallback arms deleted, which is the regression it exists to catch. The embedded-literal residual
  test pins behaviour this slice deliberately did not change, so it is green on both trees on
  purpose; its companion assertion (a dashed SSN in the same embedded literal IS caught) is what
  keeps it from being vacuous.

### Changed

- **NCPDP-SCRIPT-VERSIONS: `KNOWN_SCRIPT_VERSIONS` is now `2017071` + `2023011`** (it was
  `2017071` + `2022011`). US federal regulation names exactly two SCRIPT Implementation Guide
  versions for electronic prescribing: **45 CFR 170.205(b)** adopts `2017071` at (b)(1) and
  `2023011` at (b)(2), and **42 CFR 423.160** requires compliance with a standard in that paragraph
  at (b)(1) and incorporates both guides by reference at (c)(2) and (c)(3). `2022011` is named in
  neither, so the package modeled a version the rule does not adopt while treating an adopted one as
  unrecognized.

  **Consumer-observable, in both directions.** A `2023011` message now classifies as `known` and no
  longer raises `NCPDP_SCRIPT_UNSUPPORTED_VERSION_TOLERATED`; a `2022011` message now raises it
  where it did not before. Neither is refused: a present-but-unrecognized stamp has always been read
  best-effort and still is, so no parse result changes shape. `KnownScriptVersion` is derived from
  the list, so a TypeScript consumer annotating a value with it can no longer assign `"2022011"` and
  can now assign `"2023011"`.

  This degrades on a date, not on a defect: 45 CFR 170.205(b)(1) states the Secretary's adoption of
  `2017071` **expires on January 1, 2028**, after which `2023011` is the only version that paragraph
  adopts.

  **The list was re-derived, not copied from the report that flagged it.** Both sections were
  re-fetched on 2026-08-01 from two separately-retrieved publications of the CFR text (the eCFR
  versioner API, title 45 issue date 2026-07-24 and title 42 issue date 2026-07-20; and the Cornell
  LII mirror). Those are two independent retrievals rather than two independent derivations, since
  Cornell republishes the same underlying OFR/GPO data, so their agreement rules out a fetch or
  transcription error and nothing more. The absence of
  `2022011` was measured by extracting every 7-digit version token from the fetched section text with
  a passing negative control, because asserting a version is absent needs the same evidence as
  asserting it is present. The provenance is recorded in a source comment above the list. The
  neighbouring `SCRIPT_TRANSACTION_NAMES` list was re-checked against the same fetched text and is
  unchanged: all 36 names still match 42 CFR 423.160(b)(1)(i)(A) through (Z) exactly and in order.

  Note for anyone citing this later: the operative adoption is **45 CFR 170.205(b)**, not
  42 CFR 423.160(c). The latter incorporates the guides by reference; the former is what adopts them
  and what carries the 2028 expiry.

- **The `surescripts` built-in profile loses its `version-stamp-variance` quirk.** The quirk claimed
  trading partners stamp SCRIPT versions beyond the explicitly-modeled set, and the only fixture
  grounding it was stamped `2023011`. Once that version is modeled the fixture demonstrates nothing,
  and re-stamping it would have meant inventing a version identifier no public source backs, which
  the locked no-invented-quirks rule forbids, so the quirk was deleted rather than re-grounded.
  `profiles.surescripts.describe()` now reports one quirk instead of two and drops
  `NCPDP_SCRIPT_UNSUPPORTED_VERSION_TOLERATED` from its `expectedWarnings` union, so
  `partitionWarnings` sorts that code into `unexpected` for that profile; the profile `description`
  changed to match. The underlying tolerance is unchanged and still covered by `classifyVersion`.
  The fixture is kept and renamed `surescripts-version-2023011.xml`, now serving as the end-to-end
  guard that a `2023011` message parses with no version warning. Three unrelated SCRIPT fixtures
  that happened to carry the `2022011` stamp (`error-response.xml`, `newrx-coded-and-strength.xml`,
  `newrx-sig-disagreement.xml`) were re-stamped `2023011` so they keep measuring what they were
  written to measure rather than silently acquiring a version warning.

- **PHI-WARNING-MESSAGE-LEAK: warning and error messages now come from a frozen registry, and
  the factories that build them take no value argument at all.** `scriptWarning(code, position)`
  and `telecomWarning(code, position)` lost their `message` parameter; `NcpdpScriptParseError`,
  `NcpdpTelecomParseError`, `NcpdpScriptBuildError` and `NcpdpTelecomBuildError` lost theirs
  too. Text comes from `SCRIPT_WARNING_MESSAGES`, `TELECOM_WARNING_MESSAGES`,
  `SCRIPT_FATAL_MESSAGES`, `TELECOM_FATAL_MESSAGES`, `SCRIPT_BUILD_MESSAGES` and
  `TELECOM_BUILD_MESSAGES`, all exported and all frozen. **Breaking for anyone calling those
  constructors directly**; `code` and `position` are unchanged, so consumers reading warnings are
  not affected beyond the wording.

  The defect this closes was reproduced against the published `0.0.4`, not inferred. Five slots
  echoed consumer-controlled input into a diagnostic: a SCRIPT root element name and an unmodeled
  SCRIPT transaction element name each reached a `message` **and** a `position.path`; two SCRIPT
  fatal paths reached `err.snippet`; and a Telecom Segment Identification value reached a
  `message`, which is where an NDC and a prescription number were reproduced, because a dropped
  field separator runs the rest of the segment into that field. Six more messages interpolated a
  count or a caller-supplied field id.

- **Two structural identifiers on the model are now bounded, which is the half a message fix does
  not reach.** A diagnostic-surface fix protects your diagnostics; it does not protect a package
  that reads your model and builds its own. `TelecomSegment.segmentId` is now always exactly two
  characters or empty: an `AM` field whose value is not a Segment Identification code is left in
  `segment.fields`, verbatim and byte-for-byte round-trippable, and raises the new
  `NCPDP_TELECOM_MALFORMED_SEGMENT_ID`. `UnsupportedBody.transaction` is now optional and is
  populated only from the new closed `SCRIPT_TRANSACTION_NAMES` vocabulary, so a sender-chosen
  element name is never copied onto the model; the serializer emits a fixed
  `<UnsupportedTransaction/>` for an unnamed one and stays idempotent. That vocabulary is the
  transaction list published in **42 CFR 423.160**, verbatim, which is public law rather than the
  paywalled standard. The first draft of it was written from memory: it invented three transfer
  names and both recertification names and omitted the entire prior-authorization and REMS
  families, which would have silently stripped the identity off every ePA message.
- **`NcpdpScriptParseError.snippet` is removed.** It was capped at 64 characters and documented as
  a redaction boundary, but the cap bounded length and said nothing about content, and it was only
  ever raised on paths where the input is too broken to say where those characters came from.
  `NcpdpScriptBuildError` and both Telecom errors had already refused a snippet for exactly that
  reason; this makes the four agree. Nothing in the package carries a raw-input snippet now.
- **Telecom fatal and builder messages no longer quote an input length or a caller-supplied field
  id.** `NcpdpTelecomBuildError` gains `headerField`, typed `keyof TelecomHeader`, so a
  header-scoped rejection still says which of the nine slots it was without quoting the value.
- **`buildTelecomRequest` now enforces the same 2-character Segment Identification bound the parser
  does**, with the new `NCPDP_TELECOM_BUILD_INVALID_SEGMENT_ID`. Without it the `segmentId` bound
  held on the parse path only while the model documented it unconditionally, and a downstream
  package cannot tell a parsed transaction from a built one. `SEGMENT_ID_LENGTH` is exported.
- **PUBLIC-SURFACE-HYGIENE: internal project bookkeeping removed from every surface a
  consumer reads, and a gate added under it.** The gate raises the floor rather than
  sealing the category: it catches identifiers, ADR references, phase-plus-token forms,
  meta-repo paths and traceability markers, but `phase` ending a clause ("decoded this
  phase.") is a stated residual it does not cover, and prose about our process stays a
  reviewer's catch. Founder directive, 2026-07-27: a
  README, a docs page, an npm description, a JSDoc block or a warning message says what the
  software does and what changed, never which internal item or phase produced it. Swept,
  re-measured on `34315b5` with the final rule set: **38** violating lines across the public
  markdown surface (`docs-content/spec-notes-*.md` titles and headings carrying
  `NCPDP-4`..`NCPDP-9`, "Phase N" framing, "what this slice does" headings, the
  "accuracy-gate spec-traceability requirement" / "Field-ID gate" process commentary, and
  three ADR citations written as file paths; plus `KNOWN-LIMITATIONS.md` and `README.md`),
  **19** `src/` doc-comment lines that compile into `dist/*.d.ts` and render in a consumer's
  editor (the built `dist/index.d.ts` went from 33 such lines to 0), and **6** runtime
  warning messages that reached a consumer's log saying a code was "not modeled this phase".
  Two stale public claims were corrected in passing: `spec-notes-telecom.md` still listed
  response decode as something the library does not do, and **four** status lines pinned a
  published version (`0.0.1`) that the registry had moved past. An earlier draft of this
  entry said 35 and three; both were counted before the ADR rule was widened, and they are
  corrected here rather than left standing.
- **Two doc comments corrected while being de-jargoned.** `@cosyte/ncpdp/script`'s module
  documentation described only a NewRx structural read, omitting the response and
  prescription-lifecycle transactions, the structured SIG view, the serializer and the
  builders it has exported for some time.

### Added

- **A diagnostic-surface PHI gate covering every position a sender controls in both wire formats,
  built on `assertNoDiagnosticPhiLeak` from `@cosyte/test-utils` (bumped to `^0.0.2`; a caret on a
  `0.0.x` version resolves exactly, so the pin bump is what selects the runner).**
  `test/phi/diagnostic-surface.test.ts` declares 47 slots, 17 SCRIPT and 30 Telecom: element,
  transaction and outcome names; attribute values; `<Code>` values; the fixed Transaction Header
  fields; segment ids and field ids; NDC, prescription-number, cardholder, group, prescriber,
  prior-authorization, processor-control-number and reject/DUR/status slots; and the fatal paths.
  Each slot names the diagnostic code it must reach, and the runner fails a slot whose code never
  appeared, so a probe that quietly misses its branch is a red rather than a pass. It was run
  against the unfixed parser first and caught five leaks; the table, not the fix, is the artifact.
  Alongside it, a slot-independent assertion that every warning message is byte-identical to its
  registry entry, over a corpus that reaches **every** code on both standards.
- **`SCRIPT_TRANSACTION_NAMES`**, the closed vocabulary of SCRIPT transaction element names this
  parser will repeat. Being incomplete is safe by design: an unlisted transaction is surfaced as
  unmodeled and unnamed.
- **The Cosyte lockup at the top of `README.md`, in a light cut and a dark cut.** The
  package README had no image at all; it now opens with a `<picture>` block serving
  `cosyte-lockup-tile-on-dark-1200x300.png` to viewers reporting
  `prefers-color-scheme: dark` and `cosyte-lockup-tile-on-light-1200x300.png` to everyone
  else, both from `https://cosyte.com/tile/`. The markup and both URLs were copied
  programmatically out of `@cosyte/hl7`'s README and diffed byte for byte against it rather
  than retyped, because a single wrong character in either URL is a broken image on a public
  package page; both were confirmed `200 image/png` before this landed. The `# @cosyte/ncpdp`
  heading and the summary line under it are untouched: the artwork reads "Cosyte" and the
  heading names the package, so the two say different things and nothing is duplicated. On
  npmjs.com the `<img>` is hoisted out of the `<picture>` by the site's own anchor wrapper, so
  the light cut renders there, which is the correct one because npmjs.com has no dark mode.
  No documentation text, no API surface and no behaviour changed.
- **`pnpm check:test-selection` (`scripts/check-test-selection.ts`) plus its own required
  CI check (`test-selection`).** No published-package change; this is a development gate
  and is not in the tarball. A required _job_ gates its _steps_, not what those steps
  _select_, and the entire test suite of this repo hung off one repo-local `include` glob
  in `vitest.config.ts`: the shared `@cosyte/vitest-config` supplies no `include` of its
  own and spreads this repo's `test` block last. Narrowing that line to `test/script` and
  `test/telecom` would have stopped running `test/scripts/phi-scan.test.ts` and the whole
  `test/property` fuzz layer while every required check stayed green, and **coverage could
  not backstop it**, because coverage is measured over `src/**/*.ts` only, so dropping
  either costs approximately zero coverage percent. That is what made it silent rather than
  merely risky. The gate compares the test files that **exist** (`git ls-files`) against
  the test files vitest would actually **run** (`vitest list --filesOnly`) and reds on any
  shortfall **in its subject**, which is three sets unioned and is not every test file. Only
  `test/property` and the PHI suite are watched by a name-independent rule; the other 20 of
  24 test files are watched by the `.test.`/`.spec.` filename shape alone, so
  `git mv test/sanity.test.ts test/sanity.checks.ts` stops that suite running and the gate
  still prints OK. That is the largest known hole, it is stated in the header's limits, and
  the OK line now prints how many tracked `test/**` modules no rule is watching (today 3, all
  of them real helpers under `test/_helpers/`) so a rename that stays under `test/` is visible
  to a reviewer even though nothing reds. That tripwire is bounded, not universal: a rename
  that also leaves `test/` drops out of the subject and out of the count together. Closing it means deriving more subjects from workflows,
  never widening the name pattern. Four shape decisions are load-bearing. It observes the **resolved** selection
  rather than parsing the globs, so an `exclude` and a `projects` split written into the
  config are caught alongside a narrowed `include`. A config body that **branches on its
  own invocation** is _not_ caught, and an earlier draft of this entry wrongly claimed it
  was: the gate resolves the config under `vitest list` while CI runs it under
  `vitest run`, so an `include` keyed on `process.argv` can answer the two differently. It
  separately checks **the invocation**, because `vitest list` resolves the config and
  cannot see the command line. That rule **does not parse**: the `test` and `test:coverage`
  bodies must equal one of two exact strings (`vitest run`, `vitest run --coverage`), so a
  path filter, an alternate `--config`, a `--project`, a `--shard`, a wrapper and a
  delegation to another script are all simply not one of those two strings. Three
  successive parsing versions each shipped an evasion a refuter found, because analysing a
  shell string is unbounded; the exact-match rule has no spelling to miss. Its two headline
  subjects are **derived from committed files that exist for their own reasons**, the fuzz
  workflow that names `test/property` in order to run it and `run-phi-scan: true` in the CI
  caller, so a subject can only leave the gate's scope by a visible edit to a reviewed
  workflow. Under a derived path the subject is **every module regardless of filename, with
  no exemption at all**; a helper may not live under one, and this repo's single helper moved
  to `test/_helpers/fuzz-config.ts` to satisfy that. The PHI rule likewise requires **every**
  tracked `test/**` module referencing the scanner to be selected. Both rules previously
  matched text and both were forgeable by collision, all measured green: the helper exemption
  (named `_*` **and** imported by something that runs) was a bare substring search over the
  concatenated text of every selected file, so the XXE suite renamed to `_helpers.ts` passed
  (15 of 24 selected suites contain that substring) as did a `_`-prefixed directory
  (`_x/parse.ts`; `parse` appears in 21 of 24); and the PHI rule, inverted to avoid reddening
  on a comment, was satisfied by a rename to `phi-scan-suite.ts` plus a planted comment while
  the suite no longer ran. Deleting the exemption rather than narrowing it a third time is the
  move the invocation rule already made. One **residual is stated rather than closed**: the PHI
  subject is still text-derived, so stripping the reference from a renamed suite _and_ planting
  one in a running file still passes; matching an import specifier would close it, and does not
  apply yet because this PHI suite spawns the scanner instead of importing it. It also
  **demonstrates its own redness on every run**: three self-tests seed the removals it exists
  to catch, one resolving a genuinely narrowed vitest config through real vitest, and it exits
  non-zero if its own rules fail to red. Self-test A drops each protected file **one at a
  time**, leaving the others selected; hiding them all at once, as it used to, exercises only
  the collision-free case, which is why the two substring rules passed their own self-test
  while blind. Confirmed red by seeding each route separately: a narrowed `include`; an added
  `exclude`; deleting `test/property`; positional filters written as `vitest run <p>` and
  `vitest --run <p>`; `--config=`, `--project=`, `--dir=`, `--shard=`; a body that never names
  vitest at all (`pnpm run test:unit`, `node node_modules/vitest/vitest.mjs run <p>`,
  `sh -c '...'`); renaming a fuzz suite to `.spec.ts`, `_xxe.ts`, `_helpers.ts` and
  `_x/parse.ts`, and the PHI suite to `.checks.ts` and to `phi-scan-suite.ts` with a planted
  comment elsewhere; flipping `run-phi-scan` to `false`; and deleting the PHI suite. Removing
  every workflow mention of the fuzz path makes it **refuse to report** rather than pass
  vacuously. **These routes are closed, which is not the same as the selection being
  uncollapsible**: the gate does not see which script the shared pipeline elects to invoke, nor
  package scripts other than those two, nor anything a workflow runs inline, nor a config that
  branches on its own invocation, and selection is necessary but never sufficient.
- **`pnpm check:no-internal-refs` (`scripts/check-no-internal-refs.sh`) plus its own CI
  workflow**, ported from the `hl7` reference gate and re-derived for NCPDP. Six rules
  (item identifier, phase/wave language, ADR reference, internal jargon, meta-repo path,
  traceability marker) over four passes: the public markdown surface line by line and
  paragraph-joined (so a violation that straddles a hard wrap cannot hide), the `src/` doc
  comments that reach `dist/`, and -- new here, not in the `hl7` copy -- the `src/` string
  literals that reach a consumer as warning-message text. The identifier rule keys on known
  project prefixes and **never on the `WORD-N` shape**, which matters more in this package
  than anywhere else: `NCPDP-7` is ours but `NCPDP-SCRIPT`, `NCPDP-D.0`, `439-E4`, `511-FB`
  and the `SYNTH-MSG-0001` example ids are the reference material the docs exist to
  provide. Every one of those is asserted in a negative self-test that refuses to let the
  rules be widened into the trap.

### Security

- **PHI-SCAN-EMPTIABLE: the PHI commit-gate could be collapsed to scanning
  nothing while printing `OK`, and the repo's own test asserted that was
  impossible.** No published-package change; `scripts/phi-scan.ts` is a
  development gate and is not in the tarball. `pnpm phi-scan --allow-fixture X`
  with **no positional path** seeded `scanPaths` from `allowFixtures`, which
  flipped `mode` to `"paths"`, so the target set became `[X]` and was then
  subtracted, leaving an **empty scan that reported `OK: no hits` and exited
  0**. Reproduced before the fix: a seeded violator fixture went from exit 1 on
  a direct scan to exit 0 under the bare flag. The only thing making it
  unreachable in practice was that `phi-scan-overrides.md` read `(none yet)`
  under `## Entries`, so `--allow-fixture` exited 2 for a different reason
  entirely: one markdown commit removes that, so the safety was incidental,
  not designed.
  **Three invariants now close the argument-driven routes to that**, all exiting
  2: `--allow-fixture` is purely subtractive
  and never seeds the target set; an `--allow-fixture` path that matches no
  scanned file is refused (an inert override reads as a live bypass while doing
  nothing, which is how a stale log drifts); and a target set emptied by
  overrides or by roots resolving to nothing is refused, with `--staged` and
  nothing staged the one legitimate empty scan. Every report line now carries
  the **denominator** (`N file(s) scanned`), so an `OK` cannot be read without
  the number it is an `OK` over.
  **The false assertion is deleted, which was the more dangerous half.**
  `test/scripts/phi-scan.test.ts` claimed "the override, not an empty target
  set, is what flips the next run to clean" while exercising a violator written
  to an **OS temp directory** that an all-mode scan never enumerates, so the
  test passed for exactly the reason it denied. The replacement seeds real
  violators under a scan root, overrides one, and asserts the **other is still
  caught**, plus the denominator. Every new test was confirmed **red** against a
  re-seeded version of the defect it covers, so the suite now observes the bugs
  it used to certify away. The file went from 34 tests to **44**.
  **The second narrowing is closed too:** the scan roots were hardcoded to
  `test/fixtures/` and `src/`, leaving all of `test/` outside `fixtures/`
  unscanned. They are now a single `SCAN_ROOTS` list (`src/`, `test/`,
  `scripts/`) shared by both the full walk and the `--staged` filter, so a
  narrowing has exactly one visible place to happen. The corpus went from **85**
  to **118** files scanned, 33 more, and surfaced **one** hit to triage: a
  literal non-test email address inside the scanner's own test file, used as a
  deliberate violator. It is now assembled from parts at runtime, the way that
  file's digit sentinels already were, rather than allow-listed, which would
  have defeated the test that uses it.
  **A third collapse route, found by the refuter on this slice, is fixed with
  it.** `--staged` enumerated with `git diff --cached --diff-filter=AM`, which
  does not match an `R` entry, and git detects renames by default. So a fixture
  that was `git mv`'d **and** edited to add real PHI in the same commit was
  staged and never opened, and the pre-commit hook printed `OK` over the count
  of the _other_ staged files: a plausible denominator over an unobserved file.
  Now enumerated with `--no-renames`, which decomposes the rename into `D` + `A`
  so the destination path is listed. A second review pass found the same shape
  again in `T` (typechange: a tracked symlink replaced by a regular file
  carrying PHI), and that repetition is the actual finding: `--diff-filter=AM`
  was an **allow-list of git status letters**, the wrong polarity for a safety
  gate, because every letter it did not name was dropped silently. It is now
  `--diff-filter=d`, "everything except deletions", so an unfamiliar or future
  status costs a wasted scan instead of a missed file. `--staged` also had no
  test coverage at all, the mode the pre-commit hook uses; it now has five, run
  against a throwaway git repo rather than this repo's index, and the rename and
  typechange tests each assert git actually produced that status before
  asserting the scanner caught the PHI.
  **Claims corrected rather than defended.** An earlier draft of this entry said
  the gate "cannot report success over an unobserved corpus" and that the corpus
  went from 40 files; the first is false in the direction the rename bug proves
  (the invariants constrain the target set, not what the enumerator lists) and
  the second was never measured (the base roots scanned 85). Residuals are now
  written down in `phi-scan-overrides.md` rather than implied away: symlinked
  fixtures are still skipped (`walk` tests `isFile()`), a one-file scan is a
  truthful near-empty scan, and a `.ts` under `test/` gets the conservative text
  pass, so a message embedded in a string literal is checked for dashed SSNs and
  emails but not for names or DOBs. That list is explicitly **not** closed: a
  first draft published a complete inventory of what was left, the typechange
  finding proved it incomplete, and the documents now say so instead of
  reasserting it. `pnpm phi-scan` remains a **floor, not the gate**.
- **`fast-xml-parser` advisory remediation (runtime dependency; affects
  published consumers).** Raised the sole runtime dependency
  `fast-xml-parser` from `^5.9.3` to `^5.10.1` and regenerated the lockfile so
  it resolves to `5.10.1`, remediating **GHSA-8r6m-32jq-jx6q** (HIGH: a
  DOCTYPE entity-expansion counter that was not reset between parses, fixed in
  `5.10.1`). The floor is bumped, not just the lock, so a future lockfile
  regeneration cannot fall back to a vulnerable `5.9.x`. This is an in-range
  patch under the ratified XML-parser choice (ADR 0001) with no API or
  behavioral change. The full test suite is unchanged and green, and the
  package's own XXE hardening (entity resolution disabled) already mitigated
  the vector; this closes it at the dependency. `pnpm audit --prod
--audit-level high` is clean again.
- **PHI commit-gate armed (both wire formats).** A zero-dep, NCPDP-shape-aware
  scanner (`scripts/phi-scan.ts`, `pnpm phi-scan`) refuses fixtures / `src/`
  carrying real-PHI-shaped tokens, so a developer cannot commit a real-looking
  NCPDP message by accident. **SCRIPT (XML)** is scanned by an element-stack walk
  (case- + namespace-insensitive) covering patient AND prescriber
  `<LastName>`/`<FirstName>`/`<MiddleName>`, `<DateOfBirth>`, `<SocialSecurity>` /
  `<CardholderID>` / member-id elements, address lines, and phones, tag-scoped, so
  `<BusinessName>` / `<DrugDescription>` never trip a name detector. **Telecom
  Standard** is tokenized on the NCPDP separators (FS/GS/RS) and keyed off the
  self-identifying 2-char field ids (Patient name CA/CB, DOB C4, Street Address CM,
  Phone CQ, Patient ID CY, Cardholder ID C2, Cardholder name CC/CD), so a corrupt
  Segment Identification cannot bypass a per-field detector; a DOB field fails
  **closed** (a date the normalizer cannot read is still flagged). Dashed SSN and
  non-test email are caught anywhere. The scanner is deliberately independent of the
  package's own `fast-xml-parser`. A safety gate must not share a parser bug with
  the code it guards. Synthetic tokens are positively declared in
  `scripts/phi-allow-list.txt` (same allow-list model as `@cosyte/hl7` /
  `@cosyte/x12` / `@cosyte/dicom`); a whole-file bypass needs `--allow-fixture`
  **and** an audit entry in `phi-scan-overrides.md`. Runs at pre-commit
  (`simple-git-hooks --staged`) and in CI (`run-phi-scan: true`); the `verify.sh`
  summary now shows `phi-scan`. Tooling + tests only: no runtime or public-API
  change, and no NCPDP-copyrighted spec prose (wire field ids + paraphrased labels
  only).
- **Dev-dependency advisory remediation (no runtime impact: both overridden
  packages are dev/build-time only and never enter the published artifact; the
  sole runtime dep, `fast-xml-parser`, is untouched).** Added scoped
  `pnpm.overrides` pinning two transitive packages to their patched releases:
  `esbuild` (`>=0.27.3 <0.28.1` → `0.28.1`; GHSA dev-server path-traversal,
  not reachable here: the library builds via `tsup`/`vitest` and never runs
  `esbuild serve`) and the `@changesets/parse` copy of `js-yaml`
  (`>=4.0.0 <4.2.0` → `4.2.0`; GHSA-h67p-54hq-rp68 merge-key DoS). The
  `js-yaml@3.14.2` pulled by `read-yaml-file@1.1.0` (via
  `@manypkg/get-packages` → `@changesets/cli`) is **intentionally left**: it
  calls `yaml.safeLoad`, removed/throwing in js-yaml 4, so it cannot be
  force-upgraded without breaking the release tooling, and it only parses
  trusted local repo YAML at release time. This is the shared canonical
  override block, enforced suite-wide by the `@cosyte/config` drift check.

### Added

- **Em-dash gate wired into CI (`EMDASH-CONFORMANCE`).** The brand rule (founder
  directive 2026-07-24; `knowledgebase/06-brand/voice-and-tone.md`, "No em dashes.
  Ever.") bans `U+2014` outright across every cosyte surface and names commit
  messages explicitly, and the meta-repo's `documentation/conventions.md` has stated
  the rule is CI-gated. It now actually is, here: `scripts/check-no-emdash.sh`
  (`pnpm check:no-emdash`) plus a dedicated `.github/workflows/no-emdash.yml` job
  that scans **both** halves the rule covers, the tracked files **and** the PR title,
  body, and commit messages. The workflow carries the non-default `edited` pull-request
  trigger, which is load-bearing: this repo squash-merges, so the PR title and body are
  the message that lands on `main`, and without `edited` a description changed after the
  last push would never be re-checked. It is a separate workflow rather than a job in
  `ci.yml` because that trigger would otherwise re-run the whole Node 22 + 24 matrix and
  the publish dry-run on every typo fix, and because the shared `cosyte/.github` pipeline
  runs no arbitrary repo script.
  **No content changed.** ncpdp was measured clean before the port (byte-level,
  2026-07-27): 0 of 25 markdown files and 0 of 160 tracked files carried an em dash in
  any matched form. The gate exists purely to stop a regression, which is the only
  reason to add one to a clean repo. The script is the **text-only** variant, taken from
  `knowledgebase` (PR #12, `f4b42f5`) and matching `hl7`, `fhir`, and `pathways`: it
  deliberately omits `grep -I`, which is safe only because no tracked file here holds a
  NUL byte and every one decodes as UTF-8 (both measured, not assumed). Omitting `-I`
  makes a future binary a loud false positive rather than a silent skip: fail closed, not
  open. The 31 `.xml` and 3 `.ncpdp` fixtures are confirmed **read** by the scan, not
  classified out of it, proved by seeding a real fixture of each extension with an em
  dash and watching the gate go red.
  A gate that prints OK when it did not read its input is worse than no gate, so eight
  routes by which a dead scan could still report green are each checked red: a corrupt
  git index, an unreadable tracked file, a tracked file named `-q`, a C-quoted non-ASCII
  path, a mis-encoded text file, an empty tracked-file list, a tracked file named `-`,
  and a tracked symlink to a directory.
  The last two are **fixes to the shared script shape**, found by the refuter pass on
  this slice and not present in the four copies this was ported from, so they should be
  carried back. A bare `-` operand is read by `grep` as standard input, which `xargs`
  points at `/dev/null`, so `--` alone stopped it being parsed as an option but left the
  file unread: the gate printed OK and exited 0 over a live em dash. Every path is now
  prefixed `./`, which closes it. `-d skip` was likewise the one fail-open flag in the
  pipeline (a tracked symlink to a directory was skipped with no stderr, so the run went
  green); it is dropped, and `-H` is added so a hit in a single-file `xargs` batch still
  names its file.
  Known limits are documented in the script header and inherited knowingly from the
  shared shape rather than patched in this copy alone: encoded-form matching is literal
  (so `&#x2014` without the semicolon, and lowercase `%e2%80%94`, pass), stderr capture
  binds to the scanning `grep` rather than the filters ahead of it, an em dash encoded in
  a non-UTF-8 charset is not matched, and the scan reads file **contents** only, so a
  tracked path that itself carries an em dash passes. Tooling only: no runtime,
  public-API, or parse-behavior change, and no NCPDP-copyrighted spec prose.
- **Full canonical Diátaxis docs spine (DOCS-CONTENT-P3).** `docs-content/` grows from the two-item
  sidebar (`intro`, `cookbook`) to the canonical spine every `@cosyte/*` package shares: Overview →
  **Installation** → **Quickstart** → **Core Concepts** → **Guides** → API Reference (resolver-injected)
  → **Troubleshooting**. The six previously orphaned `spec-notes-*` pages are wired into **Core
  Concepts** (each given `id` / `title` / `sidebar_label` frontmatter), `cookbook.md` into **Guides**,
  and three new pages are authored: **Installation** (prerequisites, the single XXE-safe XML dep,
  subpaths), **Quickstart** (a SCRIPT NewRx and a Telecom B1 claim end to end), and **Troubleshooting &
  known limitations** (the fatal-code tables, the fail-safe rules, and the honest v1 non-goals: no
  streaming, decode-only SIG, descriptive-only profiles, EPCS out of scope). Depth is gated to the
  shipped surface with an honest status banner; no unshipped API is documented. Runnable snippets are
  gated by the shared doc/code-agreement harness (`docSnippetSuite`, `@cosyte/vitest-config/snippets`,
  new `test/docs-content.test.ts`), so a documented example can never drift from the built package; the
  `intro.md` scaffold snippet that referenced a non-existent `parseNcpdp` export is corrected to the real
  subpath surface. Bumps the `@cosyte/vitest-config` devDependency to `^0.0.2` for its `/snippets`
  export. Synthetic-only fixtures throughout. Docs and tests only: no runtime or public-API change.

- **Trademark notice (`TRADEMARKS.md`).** This package names third-party systems to describe what it
  interoperates with; the notice records that cosyte is not affiliated with, endorsed by, or
  sponsored by any of them, that every reference is descriptive, and that the built-in profiles are
  authored from public sources only. Added to `files` so it ships inside the published tarball, not
  just on GitHub. Documentation only: no runtime or API change.

- **NCPDP-10: release hardening.** The v1 close-out; no new parser surface, just the gates, tooling,
  and docs that make the package trustworthy to publish. A `release-dry-run` CI job (`pnpm publish
--dry-run` across the five subpath exports + `npm pack --dry-run`) proves a real release assembles
  auth-free without burning a version; a nightly `fuzz.yml` amplifies the never-throw fuzz targets
  (including a **new SCRIPT XML XXE / entity-expansion target** that hammers the `xml-load.ts`
  `<!DOCTYPE>`/`<!ENTITY>` refusal boundary) via a `fuzzRuns()` env multiplier (per-commit run
  unchanged; fast-check auto-rotates + prints its seed for replay), with a sticky-issue open/auto-close
  on failure. Docs: a task-oriented `docs-content/cookbook.md` and a `KNOWN-LIMITATIONS.md` honesty
  statement (EPCS non-support, lossy structured SIG, the NCPDP-licensing / no-redistributed-prose
  posture, and the deliberate absence of an external-oracle differential corpus); JSDoc `@example`
  completeness closed on the 12 public value-exports that lacked one. No new warning codes.
- **Trading-partner profile system** (NCPDP-9): a new `@cosyte/ncpdp/profiles` subpath. `defineProfile(spec)`
  builds a frozen profile with a structured `describe()` (the `relaxes` / `adds` / `requires` buckets, the
  standards it touches, and the de-duplicated union of `expectedWarnings`); `setDefaultProfile` /
  `getDefaultProfile` manage a process-scoped default; `partitionWarnings(warnings, profile)` splits a
  parse's warnings into expected vs. unexpected. NCPDP spans two unrelated standards, so one built-in ships
  per standard, reached via the `profiles` namespace: `profiles.surescripts` (SCRIPT: routing identifiers,
  version-stamp variance) and `profiles.pbm` (Telecom: Person Code, deeper reject-code taxonomy, response
  DUR/PPS). **Locked hard rule, no invented quirks:** every quirk MUST cite a Tier-2 `fixture` that
  demonstrates its convention, enforced by a required field, `defineProfile()` validation, and a per-quirk
  demonstrator in the suite. **Descriptive only (v1):** attach a profile via `parseScript(xml, { profile })`
  / `parseTelecom(raw, { profile })` and it surfaces as `msg.profile` / `tx.profile` and feeds
  `partitionWarnings`, but NEVER alters the parse. Profile-on output is byte-identical to profile-off.
  Provenance per quirk in `docs-content/spec-notes-profiles.md`; synthetic-only fixtures; no new warning codes.
- **Spec-clean serializers + builders + round-trip, both standards** (NCPDP-8): closes the parse↔emit
  loop. `@cosyte/ncpdp/script` adds `serializeScript(message)` (and `ScriptMessage#toString()`) →
  canonical SCRIPT XML, plus `buildNewRx(input)` and `buildScriptResponse(input)` to construct a NewRx or
  a `<Status>`/`<Error>`/`<Verify>` response. `@cosyte/ncpdp/telecom` adds `serializeTelecom(transaction)`
  → canonical vD.0 wire form (56-byte fixed header + FS/GS/RS-framed body, or response header + GS +
  segments) and `buildTelecomRequest(input)`. **Conservative on emit (Postel's Law):** the serializer
  never warns on a valid model; the builders refuse a message invalid by construction with a typed error,
  `NcpdpScriptBuildError` (`MISSING_MEDICATION`, `MISSING_RESPONSE_CODE`, `INVALID_CHARACTER`) and
  `NcpdpTelecomBuildError` (`MISSING_TRANSACTION_CODE`, `MISSING_SEGMENT_ID`, `INVALID_FIELD_ID`,
  `EMBEDDED_CONTROL_CHARACTER`, `FIELD_TOO_LONG`), rather than emitting malformed output. The read is
  lossy, so the contract is **canonical-form idempotence**: `serialize(parse(serialize(x)))` is
  byte-identical to `serialize(x)` and `parse(serialize(x))` is structurally equal to `x`; verified by a
  golden round-trip over every parseable fixture (both standards) and a `roundTripProperty` property test,
  with builder output re-parsing with zero warnings. SCRIPT emit escapes `& < >` (and `"` in attributes);
  because the XXE-safe loader resolves no entities, a raw `& < >` round-trips only when entity-free (the
  corpus is), and the builder refuses XML-1.0 control characters up front. No new warning codes. The
  parser warning surface is unchanged; build errors carry a stable code and never echo the (PHI-dense)
  value. Spec traceability in `docs-content/spec-notes-serialize-build.md`. Known limitations:
  whole-message only (no streaming emit), the SCRIPT builder emits the SIG it is given (no SIG generation
  from structure), and lossy fields the parser does not model are not reproduced.
- **Telecom request-side depth: compound + COB + DUR/PPS request + prior-auth** (`@cosyte/ncpdp/telecom`):
  five new reads over a parsed transaction: `compound(t)` (multi-ingredient compound detail, segment 10),
  `cobOtherPayments(t)` (request Coordination of Benefits / Other Payments, segment 05), `responseCob(t)`
  (response COB / Other Payers next-payer routing, segment 28), `requestDur(t)` (submitted DUR/PPS
  interactions, segment 08), and `priorAuthorization(t)` (segment 12); `responseDur` also gains
  professional-service / result-of-service / level-of-effort depth. Two safety invariants govern the
  collections: **every compound ingredient is surfaced, none dropped or merged**: a new ingredient begins
  at each Compound Product ID Qualifier (488-RE) **or** Compound Product ID (489-TE), and a declared
  component count (447-EC) that disagrees never drops/pads data (`NCPDP_TELECOM_COMPOUND_COUNT_MISMATCH`);
  **every COB money row is preserved with its amount**: each other-payer block repeats on Other Payer
  Coverage Type (338-5C), the segment-level count (337-4C / 355-NT) is metadata and never seeds a spurious
  block, amount rows pair a qualifier with the next amount in wire order, and a declared count that
  disagrees surfaces `NCPDP_TELECOM_COB_COUNT_MISMATCH`. Money stays decimal-safe (compound drug cost
  449-EE and the COB amounts via `telecomMoney`; ingredient quantity 448-ED via the implied 3-place
  decimal). An unknown DUR Reason For Service (439-E4) is kept verbatim with `reasonKnown: false`
  (`NCPDP_TELECOM_UNKNOWN_DUR_REASON`). Prior authorization is **presence, not adjudication**. Adds the
  three stable warning codes above; warnings carry a stable code + byte offset + field id, never a value
  (PHI-safe). Spec traceability in `docs-content/spec-notes-telecom-compound-cob.md`. Still parse-only; no
  serializer yet.
- **Telecom responses + B2/B3/E1** (`@cosyte/ncpdp/telecom`): `parseTelecom` now detects a **response**
  transmission (it leads with the Version/Release at offset 0, not the routing BIN) and decodes it against
  the fixed Response Transaction Header. `adjudication(t)` lifts the outcome (status + disposition,
  pricing, and DUR alerts) over the same reader for B1/B2 reversal/B3 rebill/E1 eligibility responses;
  `responseStatus`, `responsePricing`, `responseDur`, `telecomMoney`, and `decodeResponseHeader` are
  exported too. Three safety invariants govern it: **a reject always wins**: `disposition` is a total
  function over Transaction Response Status (112-AN) **and** reject codes (511-FB), so any reject present
  forces `"rejected"` even when the status claims paid (`NCPDP_TELECOM_STATUS_CONFLICT`), and an
  unrecognized status reads `"unknown"`, never paid (`NCPDP_TELECOM_UNKNOWN_RESPONSE_STATUS`); **money is
  never a float**: `telecomMoney` decodes the implied 2-place decimal and the zoned-decimal overpunch
  sign (`{`,A–I = +0–9; `}`,J–R = −0–9) string-wise with the verbatim source authoritative, keeping
  unrecognized input as `isValid: false`; **no DUR alert is dropped**: the repeating Response DUR/PPS
  fields split at each counter (567-J6) and each new Reason For Service (439-E4), and unknown
  reject/reason codes are kept verbatim with `known: false` (`NCPDP_TELECOM_UNKNOWN_REJECT_CODE`). Adds
  the three stable warning codes above; warnings carry a stable code + byte offset + field id, never a
  value (PHI-safe). Spec traceability in `docs-content/spec-notes-telecom-response.md`. Still parse-only;
  no serializer yet.
- **Telecom foundation + B1 billing-claim read** (`@cosyte/ncpdp/telecom`): opens the second,
  **zero-dep** standard. `parseTelecom(raw: string | Buffer, opts?)` validates the FS/GS/RS
  (`0x1C`/`0x1D`/`0x1E`) control-character framing, decodes the fixed 56-byte vD.0 Transaction Header
  (BIN, Version/Release, Transaction Code, PCN, Transaction Count, Service Provider ID + Qualifier, Date
  of Service, Software/Cert ID: leading zeros preserved, pad trimmed), and tokenizes the
  Segment-Identification (`AM`)-keyed, field-id-keyed variable segments. `claim(t)` lifts a B1/B2/B3
  **request** view: Patient (DOB, gender), Insurance (group, cardholder, person code), Claim (Rx
  reference + qualifier, fill, product, quantity, days supply, DAW) and Prescriber (id + qualifier).
  **Quantity Dispensed is never a float**: the implied 3-place decimal (`9(7)v999`) is applied
  string-wise (`"30000"` → `"30.000"`) alongside the verbatim source. Fail-safe: missing header →
  `NCPDP_TELECOM_NO_HEADER`, unframeable body → `NCPDP_TELECOM_INVALID_FRAMING` (a separator is never
  guessed), untrusted version → `NCPDP_TELECOM_UNSUPPORTED_VERSION`, empty → `EMPTY_INPUT`; the **F6**
  stamp is recognized-but-not-decoded (`NCPDP_TELECOM_VF6_NOT_DECODED`, its header layout differs from
  D.0); unknown segments/fields, a missing `AM`, malformed tokens, and extra (truncated) transactions
  all warn and preserve verbatim. Warnings carry a stable code + byte offset + field id, never a value
  (PHI-safe). Spec traceability in `docs-content/spec-notes-telecom.md`. Responses, B2/B3, E1, compound,
  and COB land in later phases; no serializer yet.
- **SCRIPT structured SIG decode** (`@cosyte/ncpdp/script`): `medication.sig` exposes a `StructuredSig`:
  a best-effort, **lossy** decode of the SCRIPT `<Sig>` into typed dosing components
  (`doseDeliveryMethod`, `dose`, `doseUnitOfMeasure`, `route`, `siteOfAdministration`,
  `administrationTiming`, `duration`, `vehicle`, `indication`, `maximumDoseRestriction`). The free-text
  `SigText` is preserved **verbatim** and remains the source of truth; the structured view is additive
  and never reconciled against it. When they disagree, both are surfaced. Every component is a
  `SigField` tagged `coded`/`derived`/`absent`; a `coded` field keeps its qualifier verbatim and resolves
  the system (SNOMED CT / NCI / NDC / RxNorm / ICD-10, else `UNKNOWN`), giving route/site/method/unit
  provenance. An ambiguous dose (a dose structure with no readable quantity) is surfaced as `absent`
  rather than guessed, raising the new `NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE`; any structured decode raises the
  new `NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY` to flag the lossy view. Decode-only (no SIG generation, no
  natural-language parsing); element-name tolerance for the membership-gated IG nesting is documented in
  `docs-content/spec-notes-structured-sig.md`. Covers SCRIPT `v2017071` + `v2022011`.
- **SCRIPT prescription-lifecycle transactions** (`@cosyte/ncpdp/script`): reads the six renewal /
  change / cancel transactions (`RxRenewalRequest`/`RxRenewalResponse`,
  `RxChangeRequest`/`RxChangeResponse`, `CancelRx`/`CancelRxResponse`) via
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
- **SCRIPT response spine** (`@cosyte/ncpdp/script`): reads the three acknowledgment transactions,
  `Status` (positive), `Error` (negative), `Verify`, exposed via `status()`/`error()`/`verify()`
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
  `ScriptMessage` and `newRx(msg)` projects the NewRx body: header (version/messageId/to/from/
  sentTime), patient, pharmacy, prescriber, and medication (coded drug + explicit strength surfaced
  side-by-side, never reconciled), with XPath-positioned tolerance warnings. Lenient by default:
  vendor quirks become `SCRIPT_WARNING_CODES`; only unrecoverable structural corruption throws a
  typed `NcpdpScriptParseError` (`SCRIPT_FATAL_CODES`). XXE-safe by construction (DOCTYPE/ENTITY
  payloads are refused). Supports SCRIPT `v2017071` + `v2022011`.
- **Shared `@cosyte/ncpdp/common` vocabulary**: `decimalValue` (float-free decimal validity),
  `ndcValue` (NDC segmentation classification), `recognizeCodeSystem`/`codedValue` (NDC/RXNORM/
  SNOMED/NCI/ICD10 qualifier mapping), and XPath position helpers.
- Runtime dependency on [`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser)
  for safe, namespace-aware XML parsing on the SCRIPT side, ratified in
  [`docs/adr/0001-xml-parser.md`](./docs/adr/0001-xml-parser.md). The Telecom side remains zero-dep.

### Changed

- Replaced the `VERSION`-only archetype stub surface with the real SCRIPT + common public API.

### Fixed

- **Published-status drift corrected across the public docs.** The Docusaurus docs
  (`docs-content/intro.md`, `docs-content/installation.md`) and `KNOWN-LIMITATIONS.md` still claimed
  `@cosyte/ncpdp` was "not yet published to npm" / sat at `0.0.0` / was "gated on the coordinated
  public launch." It is published on npm at `0.0.1` and public; the status lines now read as
  published, public, and still pre-alpha on the `0.0.x` ladder, the install command is described as
  live, and the "Not yet published" limitation becomes a "Published, still pre-alpha" note. The
  capability prose beneath each was already accurate and is unchanged. Documentation only: no runtime
  or API change.
- **README status line corrected: the package is published.** The README status blockquote still
  claimed `@cosyte/ncpdp` was "not yet published to npm." It is published on npm at `0.0.1` and
  public; the line now reads as published, public, and still pre-alpha on the `0.0.x` ladder. The
  capability prose beneath it was already accurate and is unchanged. Documentation only: no runtime
  or API change.
- **The release can actually bump the version.** `package.json` had no `version` script, so the
  shared pipeline's `pnpm run version` failed with `Command "version" not found` and the release
  aborted before opening a "Version Packages" PR. Adds `scripts/sync-version.mjs` (the `hl7`
  reference, retargeted at `src/index.ts`) and the `version` script that runs it after
  `changeset version`, so the bump and the `VERSION` constant land in the same commit.
- **`VERSION` is no longer typed as a string literal.** It was declared `export const VERSION =
"0.0.0"`, giving it the literal type `"0.0.0"`, so the exported type would change on every
  release, making each version bump a breaking type change. Now annotated `: string`, matching the
  `hl7` reference. Type-only; the runtime value is unchanged. Done now because the package is
  unpublished. After the first publish this would itself be a breaking change.

- **The Release workflow can actually start.** `.github/workflows/release.yml` calls the shared
  `cosyte/.github` pipeline, which requests `contents`/`id-token`/`pull-requests: write`, but declared
  no `permissions:` of its own, so it inherited the repo default of `contents: read`. A called
  workflow may only downgrade the caller's `GITHUB_TOKEN`, never escalate it, so GitHub rejected the
  workflow at startup (~1s, no jobs, no logs). Every Release run from June 2026 until now failed this
  way, unnoticed, because a `startup_failure` produces no logs to read. The caller job now declares
  the three scopes explicitly. CI-only: no runtime or API change.
