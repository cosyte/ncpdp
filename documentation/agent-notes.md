# @cosyte/ncpdp: agent notes

The narrative behind `CLAUDE.md`. Relocated here **verbatim** on 2026-08-04 under
`CLAUDE-MD-AUDIT` and the 2026-08-04 amendment to the meta-repo's
`documentation/decisions/0023-doc-budgets.md`: a submodule's `CLAUDE.md` is always-read for every
worker that enters the repo, so the cursor, the rules and the traps stay there and the _case_ for
each trap lives here, read on demand.

Nothing was deleted. Every trap in `CLAUDE.md` links to the section here that explains it, and every
section here is the original text, unedited; where a relocated paragraph has since gone stale, the
correction is a **separate, dated, self-marking annotation next to it** and the paragraph itself
stays byte-identical. Never "restore verbatim" by deleting an annotation. If you are about to touch a gate, a diagnostic surface,
a ruleset or the PHI scanner, read the matching section first: each paragraph is the record of a
defect that was measured, not an opinion.

**Do not compress these paragraphs into their own summaries.** The measurements, the shas, the counts
and the negative controls are the reason a claim here can be trusted; a summary of a measurement is
an assertion.

## Shipped phases (NCPDP-1..9)

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

**Relocated verbatim from `CLAUDE.md` on 2026-08-10 to pay for the two-file-contract trap bullet, and NOT reconciled against the dated paragraph above: this is the CURRENT subpath-by-subpath inventory, those are the phase notes as first written.**

  `@cosyte/ncpdp/script` = `parseScript` + `newRx`, the response spine, the prescription-lifecycle
  transactions and the lossy structured-SIG decode over a lenient, XXE-safe XML read (SCRIPT
  `v2017071`/`v2023011`). `/telecom` = `parseTelecom` + `claim` + `adjudication` over zero-dep
  Telecommunication vD.0 (FS/GS/RS framing, fixed Transaction Header, field-id-keyed reads; F6
  recognized-but-not-decoded), plus `compound`, `cobOtherPayments`/`responseCob`,
  `requestDur`/`responseDur` and `priorAuthorization`. `/common` = shared NDC/decimal/code-system
  vocabulary. `/profiles` = `defineProfile()`, `describe()`, `setDefaultProfile`/`getDefaultProfile`,
  `partitionWarnings`, built-ins `profiles.surescripts` (SCRIPT) + `profiles.pbm` (Telecom).

**Read that against Status (annotated 2026-08-04, the paragraph above is unedited):** "not yet
published to npm" was true when it was written and is false now; the package is published on the
`0.0.x` ladder, and the diagnostic-leak section below refers to a defect reproduced on the published
`0.0.4`. `npm view @cosyte/ncpdp version` is the only source of truth for what is published today.

## Diagnostics: the frozen registry and the no-value rule

- **Diagnostics are built from a frozen registry, and the factories take no value parameter.**
  `scriptWarning(code, position)` / `telecomWarning(code, position)` and all four typed error classes
  look their text up in `*_WARNING_MESSAGES` / `*_FATAL_MESSAGES` / `*_BUILD_MESSAGES`. **That absence
  is the safety property; do not add a value parameter back "just for this one case".** The ecosystem
  audit's single distinguishing property was exactly this: everything that leaked took a value, and
  everything genuinely prevented did not.

### PHI-WARNING-MESSAGE-LEAK

The defect it closed (`PHI-WARNING-MESSAGE-LEAK`) was reproduced on the published `0.0.4`, and the
slot table in `test/phi/diagnostic-surface.test.ts` was run red on the base commit before any fix
existed. It caught five: a SCRIPT root element name and an unmodeled SCRIPT transaction element
name, each into a `message` **and** a `position.path`; two SCRIPT fatal paths into `err.snippet`;
and a Telecom Segment Identification value into a `message`, which is where the audit's NDC and Rx
number came from, because a dropped field separator runs the rest of the segment into that field.

### Bounding a message does not close a downstream leak

**Two lessons are load-bearing and cost more than the message fix.** First, **bounding a message
does not close a downstream leak**: `segment.segmentId` and `UnsupportedBody.transaction` were
unbounded on the _model_, which is what a package like `deid` interpolates. Both are now bounded
(2 chars or empty; a closed `SCRIPT_TRANSACTION_NAMES` vocabulary), and the bound has to be kept
when either is touched. Second, `position` is a diagnostic surface too: `joinPath(bodyPath, name)`
with a sender-chosen `name` leaks exactly as much as interpolating it into the message. The one
surviving `joinPath` on an element name (`sig.ts`, the ambiguous-dose path) is safe only because
`DOSE_QUANTITY_NAMES` is closed, and there is a comment saying so.

### SCRIPT_TRANSACTION_NAMES and 42 CFR 423.160

**`SCRIPT_TRANSACTION_NAMES` is grounded in 42 CFR 423.160, not in memory, and it must stay that
way.** The first draft of that list was written from recall and the refuter caught it: three
invented transfer names, both recertification names wrong, and the whole prior-authorization and
REMS families missing, which would have silently stripped the identity off every ePA message the
library saw. The regulation is public law and publishes the transaction vocabulary and the version
ids together, so it is the license-clean source for both. **The version list has now been corrected
the same way** (`NCPDP-SCRIPT-VERSIONS`): `KNOWN_SCRIPT_VERSIONS` is `2017071` + `2023011`, and
`2022011` is gone. Two things about that fix are worth carrying.

### NCPDP-SCRIPT-VERSIONS and 45 CFR 170.205(b)

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

### The structured SIG element names and what grounds them

The structured SIG decoder matched fifteen element names across ten component slots, and nothing in
the package said who had established that those were the standard's names. That asymmetry is the
whole problem: a name that never matches yields `absent`, which is fail-safe, but a name that matches
the WRONG element yields a confident `coded` dose, which is not, and in this repo a wrong field
position is a wrong dispense.

The names were re-derived against the one artifact that can be cited here: table 1 of Liu H, Burkhart
Q, Bell DS, "Evaluation of the NCPDP Structured and Codified Sig Format for e-prescriptions", JAMIA
2011;18(5):645-651, retrieved 2026-08-25. A peer-reviewed inventory can be quoted; the Implementation
Guides that would settle the question cannot, because they are sold and membership-gated, which the
NCPDP resources page retrieved the same day corroborates. Five names survived
(`DoseDeliveryMethod`, `DoseQuantity`, `Route`, `Site`, `AdministrationTiming`) and ten were removed.
Each survivor carries a `//` provenance block above the declaration in the versions.ts style: the
retrieval, the method, a negative control, the assumption stated out loud and its fail-safe.

**The rule that did the work is that a SEGMENT label does not ground a COMPONENT name.** That is what
removed `RouteOfAdministration`, `SiteOfAdministration`, `Duration`, `Vehicle`, `Indication`,
`MaximumDoseRestriction` and `Dose`: every one of them transcribes the name of the enclosing segment,
whose field is spelled differently ("Route", "Site", "Duration numeric value", "Vehicle name",
"Indication text", "Maximum dose restriction value", "Dose quantity"). The prose of the same paper
does say "route of administration" and "vehicle" in a list of codified fields, and reading THAT as a
label would have kept four names alive. It was refused, because the prose does not distinguish
segment from field at all (it writes "indication precursor" and "site of administration" in the same
breath), so it cannot answer the question the rule turns on, and because the same sentence paraphrases
"Frequency units" as "frequency unit", which shows it is paraphrase rather than a label list.

**`DoseUnitOfMeasure` is the trap worth remembering.** The string occurs verbatim on the NCPDP
resources page, so a search for it succeeds. It is there as the name of an NCI Thesaurus terminology
SUBSET, a value space, not a Sig component element. A string match is not grounding: the label has to
denote the same component the name populates. Do not reinstate that name on the strength of the hit.

Two couplings moved with the list and would have broken quietly. The serializer's per-slot tag table
was a hand-maintained copy of "the parser's first alias", so leaving it alone would have emitted
`<RouteOfAdministration>` for a route the parser no longer reads and broken the golden round-trip; it
now derives from the recognized names, and a slot with no name is not emitted at all. And the PHI
diagnostic-surface corpus reached `SIG_AMBIGUOUS_DOSE` only through a `<Dose>` container, so the slot
would have stopped probing anything while staying green under its own assertion; it plants inside
`<DoseQuantity>` now.

`DOSE_QUANTITY_NAMES` is still the closed list the ambiguous-dose position is built from, and is now
derived from the same declaration rather than written twice. **Never add a name here from memory, and
never add one at all: the phase this came from permits removal only.** A mechanical test pins the
shipped set as a subset of the previous release's, each name on the same component, every name
carrying a provenance record, and the published per-component table agreeing with what ships. What no
test can check is whether a quoted label is really in the artifact, so re-read the committed copy
rather than trusting a green run.

### Closed list, not a length bound; SNIPPET_MAX

A closed list is the only shape that satisfies the gate here, and it is worth knowing why a length
bound is not: the kit fails any verbatim echo of four or more bytes, so any cap large enough to
hold a real element name also holds a marker. `hl7`'s `safeDerivedToken` would not pass this test.

**`SNIPPET_MAX` is gone and should not come back.** A 64-character cap bounds length, not content,
and the paths that raised it are the paths where the input is too broken to know what those
characters are. Three of the four error classes already refused a snippet; the fourth now agrees.

### The diagnostic PHI gate and its 47 slots

The gate is `assertNoDiagnosticPhiLeak` from `@cosyte/test-utils` (pinned `^0.0.2`; **a caret on a
`0.0.x` version resolves exactly, so the pin is what selects the runner**, and a stale pin silently
tests against a kit that has no runner and passes). 47 slots, 17 SCRIPT and 30 Telecom. Under it
sits a slot-independent assertion that `w.message === WARNING_MESSAGES[w.code]` for every code on
both standards, which is the only check that survives a slot nobody declared. **Adding a warning
code without adding it to the registry fails to compile; adding one without reaching it in that
corpus fails the test.** What neither reaches: an echo shorter than four bytes, a re-encoded echo
(`checkLengthInvariance` is off, and is off for a reason the kit documents), and a slot nobody
wrote down. **The claim to make is "these slots are covered", never "the parser cannot leak".**

## PHI commit-gate (both wire formats)

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
  an audit entry in `phi-scan-overrides.md` (**AMENDED 2026-08-11: it is then REFUSED anyway; see
  `#the-completeness-rule-enumerated-and-never-read`**). Runs at pre-commit (`simple-git-hooks --staged`) and in CI
  (`run-phi-scan: true`); `verify.sh` now shows `phi-scan`.

### The argument-driven collapse routes

**The argument-driven routes to collapsing this gate are closed.** They were open: `--allow-fixture X` with no
positional path seeded the target set with `[X]`, subtracted `X`, scanned **zero files**, printed
`OK: no hits` and exited 0, and the suite asserted the opposite ("the override, not an empty target
set, is what flips the next run to clean") on a temp-dir path an all-mode scan never enumerated, so
the assertion passed for the reason it denied. The only brake was that `phi-scan-overrides.md` read
`(none yet)`, which is one markdown commit from permissive. `--allow-fixture` is now purely
subtractive; an override matching no scanned file is rejected; an emptied target set is rejected
(`--staged` with nothing staged is the one legitimate empty scan); and every report line carries the
denominator, so `OK` is never printed without the number it is an `OK` over. All three exit `2`.

> **AMENDED 2026-08-11 by the completeness rule** (`#the-completeness-rule-enumerated-and-never-read`).
> "Purely subtractive" was the WEAKNESS, not the fix: a subtraction at enumeration time made "read and
> found clean" and "never opened" the same state. **A target enumerated and never read now REFUSES,
> so `--allow-fixture` reaches exit 0 in no argv**, and the third rule above (an emptied target set)
> was DELETED, because its remedy told the reader to narrow the overrides and a narrower override
> still refuses. In `paths` and `--staged` mode the completeness rule answers that state; in `all`
> mode `main`'s observed-nothing floor fires first (withdrawing every target leaves `observed === 0`)
> and names the withdrawn paths itself. Rules 1 and 2 stand exactly as written.

`SCAN_ROOTS` (`src/`, `test/`, `scripts/`) is one list serving both all-mode and `--staged`, so a
narrowing has one visible place to happen. **When you touch this scanner, prove the change red on a
seeded violator**, not merely green: the tests seed real files under a scan root, because a violator
in an OS temp dir is never enumerated and overriding it proves nothing. That is the mistake the
original suite made.

### PHI-SCAN-ENUMERATE-THEN-READ-CLASS

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
it to `ccda` alone)
[**annotated 2026-08-05, CLOSED under `PHI-SCAN-OBSERVED-NOTHING-IS-GLOBAL`: `walk()`'s
`readdirSync` is wrapped, so `ENOENT` returns silently as the documented directory-level transient
and every other error is an `InvocationError`. The same `chmod 000` reproduction exits **2** rather
than **1**. The clause above is unedited; read this correction next to it, and delete neither.**];
and "untracked" is read from the OUTER repo, so a nested git repo under a scan
root would look tolerable. All are in `phi-scan-overrides.md`. **The `git` shim technique is
the reusable part**: no sleep, no real build, throwaway repos only.

### The --diff-filter polarity lesson

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
The enumeration gaps we know of are written up in `phi-scan-overrides.md`: `pnpm phi-scan` over a
single named file truthfully reports `1 file(s) scanned`, a near-empty scan the exactly-zero
invariant does not catch. **That is not a closed list, and publishing it as one has been wrong.**
The claim to make is "these routes are closed", never "the gate is uncollapsible".

### PHI-SCAN-SYMLINK-BLIND-ON-BOTH-ROUTES

**A third enumeration finding landed, and it was blind on BOTH routes at once**
(`PHI-SCAN-SYMLINK-BLIND-ON-BOTH-ROUTES`). A **symbolic link** under a scan root read clean twice
over, by two unrelated mechanisms: `walk()` enumerates `Dirent.isFile()`, an lstat answer, so a
link is neither file nor directory and fell out of the loop (`isDirectory()` is false for a
**linked directory** too, so a whole subtree went with it); and git stores a link as its **target
path** under mode `120000`, so `git show :<path>` handed `--staged` the path text. Measured on
`6c901e8` against a name-bearing synthetic payload outside the roots: all mode `OK (2 files)`
exit 0, `--staged` `OK (1 file)` exit 0, the link named explicitly exit 1 with both hits.
**Neither route follows the link** (following reads bytes the enumeration does not control, and
git carries none of them); the enumeration is narrowed instead, so an in-scope non-regular entry
**refuses** (exit 2), naming every offender by **its own repo-relative path plus a closed-set kind
token, NEVER the link target** (working-tree text that can itself carry PHI). `--staged` reads
`git diff --cached --raw -z` for the destination mode. Explicit-paths mode still reads **through**
a link, deliberately.

### The isUnderScanRoot refusal boundary

**The refusal boundary is `isUnderScanRoot`, on BOTH routes, and that split is the second lesson
here.** It is a deliberate half-step away from `isScannable`, whose `.md` exemption is a judgement
about a file whose **bytes** could have been read; a link's **name** is no evidence about the other
side. Using one predicate for both jobs made the routes disagree about exactly one entry, and the
gate measured it: on a link named `test/fixtures/script/notes.md`, all mode refused (exit 2) while
`--staged` printed `OK: no hits (1 file(s) scanned)` and exited 0 over the same entry. Neither
route's own path scope moved: the walk still starts at `SCAN_ROOTS` and still exempts a gitignored
entry, `--staged` still **reads** only what `isScannable` admits. **The gitignore exemption rests
on `git check-ignore` being index-aware** (a tracked path is not reported ignored), which is the
only reason `git add -f` on an ignored link is not a bypass; a `--no-index` there reopens it, so
there is a force-add test.

### A remedy's prose does not port with its code

**Two things about the port are the lesson, and both were re-measured rather than copied.** The
sibling this came from had to add `T` to a `--diff-filter=AM` allow-list to make its mode check
reachable at all; this repo's filter was already `d`, and on git 2.39.5 the typechange record is
present under `d` and **absent** under `AM`, so nothing needed adding here. Its second disclosed
residual (`R`/`C` unenumerated by `--staged`) does not transfer either, because `--no-renames`
**decomposes** a rename rather than excluding it. **A remedy's prose does not port with its code.**

### A scan root is a declaration, not a discovery

**`SCAN_ROOTS` names three directories, and until this change nothing checked that any of them was
there.** `walk()` opened with `if (!existsSync(dir)) return;`, so a declared root that had gone
missing was skipped in silence while the remaining roots went on supplying a corpus, a report and a
count. **Measured on `5e2b42b` in this checkout**, with `src/` (51 tracked files) moved aside: all
mode printed `OK: no hits (71 file(s) scanned)` and exited **0**. This is
`PHI-SCAN-OBSERVED-NOTHING-IS-GLOBAL` in its local form. The sibling that found it worst had a root
that **had never existed**, so the gate printed clean over an unopened root on every run it ever
made, and nothing in the report could have said so.

**THE DENOMINATOR DID NOT SAVE IT, AND THAT IS THE POINT WORTH KEEPING.** This scanner has printed
`N file(s) scanned` on every report line since the argument-driven collapse routes were closed, and
it was printing one here: **71**, against a healthy **122**. Nothing about 71 looks wrong. **A count
is a count of the roots that DID exist, so it can never witness one that did not.** Checking the
roots is a DIFFERENT RULE and had to be written separately. Do not let the presence of a
denominator stand in for it.

**THE DANGLING-LINK CASE IS THE SHARPEST, and it is why the check is `lstatSync`.** With `src/`
replaced by a symbolic link to a path that does not exist, the output was **byte-identical**:
`OK: no hits (71 file(s) scanned)`, exit 0. `existsSync` **FOLLOWS** the link and answers false, so
`walk` returned before `readdirSync` ever ran and the non-regular-entry refusal from
`PHI-SCAN-SYMLINK-BLIND-ON-BOTH-ROUTES` never fired. That rule classifies entries found **INSIDE** a
root, and **a root is not inside itself.** Two refusals, two different filesystem calls, two closed
kind vocabularies (`direntKind` for a `Dirent`, `statsKind` for a `Stats`), and **neither ever
prints a link target**, for the reason already written down: a diagnostic about a PHI leak is itself
a PHI surface. **EVERY broken root is named**, not just the first, the same principle
`refuseUnscannable` already states.

**A root is a DECLARATION; a subdirectory found inside one is a DISCOVERY.** That distinction is the
whole design of the fix. A false declaration refuses (`walkRoot` collects, `refuseRoots` reports);
a subdirectory that vanishes between its parent's `readdirSync` and the recursion into it stays in
the tolerated-transient class (`PHI-SCAN-ENUMERATE-THEN-READ-CLASS`), which is why the `existsSync`
guard survives inside `walk` with a comment saying it is no longer a root check, and why that
function's own `readdirSync` tolerates `ENOENT` and refuses everything else. **Do not re-purpose the
`existsSync` back into a root check. It cannot do the job:** following a link is exactly how the
root went unopened.

**A SYMBOLIC LINK IS REFUSED WHETHER OR NOT IT RESOLVES.** At the moment an operator reads
`SCAN_ROOTS` the two are indistinguishable, and a resolving one would have the walk read bytes the
enumeration does not control and git does not carry. Same argument as a link inside a root. The
resolving half is the contested one and was pinned by nothing at first; it has its own test now.

**EXIT CODES WERE DERIVED HERE, NOT PORTED, and that mattered.** A root replaced by a **regular
file** never reached the missing-root branch at all: `readdirSync` threw `ENOTDIR` uncaught and the
process exited **1**, which this scanner's own contract reads as **"hits found"** for a run that
scanned nothing. The same shape exits **2** in `hl7` (its `walk` wraps `readdirSync`) and **1** in
`terminology`. Neither number was evidence about this repo. Three more uncaught-throw routes in the
same class exited 1 for the same reason and are now `InvocationError`s: an **unreadable root
directory**, an **unreadable allow-list**, and an **unreadable override log**. The third sits next
door to the second and the first survey of this class missed it, which is the argument for surveying
by shape rather than by memory.

**THE REPO'S OWN TEST HARNESS WAS AN INSTANCE OF THE DEFECT.** `makeScratchRepo()` created `scripts/`
and `test/` and no `src/`, so every all-mode sweep the suite ran against a scratch repo was reporting
OK over a tree with a declared root it never opened. It now creates every root in `SCAN_ROOTS`.
**Keep it in step with that list.**

**What was RE-DERIVED and found NOT open here, because porting a residual list is the failure this
item exists to prevent:**

- **`PHI-SCAN-WALK-ROOT-SCOPE`'s headline half is already closed in this repo.** The sibling finding
  is "walk roots cover `src/` + `test/fixtures/` only, so tracked files under `test/` are scanned by
  neither route". Here `SCAN_ROOTS` has been `src`, `test`, `scripts` since the roots were widened,
  `test/` is walked WHOLE, and `scripts/` was added on the same argument. There is no `test/`
  residual to close.
- **Widening the root SET buys nothing here, measured rather than assumed.** 22 tracked non-markdown
  files sit outside the three roots (workflows, `package.json`, `tsconfig.json`, the lockfile,
  `LICENSE`, `CODEOWNERS`). Scanning all 22 explicitly yields exactly **one** hit: the company
  contact address in `package.json`, which is deliberately public and not PHI. Widening would buy one
  allow-list entry and no coverage. **Do not widen the roots without re-running that census.**
- **The unmerged-entry residual (`U` enumerated by neither `AM` nor `AMT`) is closed here.**
  Re-measured on a real conflicted index: `--diff-filter=d` **includes** `U`, the raw record parses
  with destination mode `000000`, and `refuseUnscannable` refuses it as "a git entry with no stage-0
  blob". It is refused, not dropped, and it now has a test. This is the `--diff-filter` polarity
  lesson paying for itself a third time.
- **`PHI-SCAN-RENAME-BLIND-AT-PRECOMMIT` is closed here** and was verified rather than trusted:
  `--no-renames` decomposes a staged rename into `D` + `A`, the destination path is enumerated, and
  `catches PHI in a fixture that was RENAMED and edited` pins it.

**What this change did NOT do, stated so nobody reads it wider.** It adds **no files** to the
corpus: the healthy denominator is **122 before and 122 after**. It is a refusal, not an enumeration
widening, so the standing warning that **enumerating more files buys only the SSN/email floor** has
nothing to bite on here, and the headline recogniser residual is untouched: **a message embedded in
a `.ts` string literal is still not structurally scanned**. That is a recogniser gap, it is a
separate change, and closing the root hole did not narrow it by one byte.

**THE ROOT CHECK CERTIFIES EXISTENCE AND ENUMERABILITY. IT NEVER CERTIFIES OBSERVATION, AND NO
VERSION OF IT EVER COULD.** An empty directory enumerates perfectly. Any tracked file the
enumeration does not REACH is invisible to it, and an EMPTIED root or a root missing a whole subtree
is only the loudest shape of that. **Measured with the root check already in place:** emptying
`src/` printed `OK: no hits (71 file(s) scanned)` and exited **0** with **51 tracked files
unopened**, and deleting only `src/telecom/` printed `OK: no hits (105 file(s) scanned)` exit 0 with
**17** unopened.

**THAT HALF IS NOW CLOSED, IN A SEPARATE RULE, AND THE SPLIT IS LOAD-BEARING.** See
"Observation, not existence" below. Do not fold it back into `walkRoot`: a root check reads the
filesystem, and the filesystem is precisely the thing an emptied root has already changed.

An earlier draft of this section was wrong in both directions and is worth remembering: it said the
only survivor was the `existsSync` **race** inside `walk`, and that closing it "needs a
content-addressed sweep". A refuter measured both false. The subtree is absent BEFORE enumeration,
so `existsSync` is never consulted, and `gitTracked()` was already in hand.

**The harness makes the same weakness visible inside the earlier slice**: `makeScratchRepo()`
creates an EMPTY `src/`, so a scratch all-mode test could pass over a declared root containing
nothing. `scratchTracked()` in the new suite is the version that commits a corpus first.

## Observation, not existence: reconciling the sweep against the index

`PHI-SCAN-OBSERVED-NOTHING-IS-GLOBAL`, the emptied-root half. The missing-root half closed in `#61`;
this is the other one, and it is a different rule with a different data source.

**An all-mode sweep now RECONCILES the paths it actually opened against `git ls-files`, and REFUSES
(exit 2) naming EVERY tracked in-scope file it did not open** (`unobservedTracked` /
`refuseUnobserved` in `scripts/phi-scan.ts`).

**Measured in a local clone at `16c2fea`, root rule already in place and passing:**

| tree                                                      | before                                          | after                                 |
| --------------------------------------------------------- | ----------------------------------------------- | ------------------------------------- |
| healthy control                                           | `OK: no hits (122 file(s) scanned)`, exit **0** | unchanged, exit **0**                 |
| `src/` emptied (directory present, 51 tracked files gone) | `OK: no hits (71 file(s) scanned)`, exit **0**  | refuses, exit **2**, names all **51** |
| `src/telecom/` deleted alone (17 tracked files)           | `OK: no hits (105 file(s) scanned)`, exit **0** | refuses, exit **2**, names all **17** |
| `.git` moved aside (git cannot answer)                    | `OK: no hits`, exit **0** (see note)            | refuses, exit **2**                   |

**NOTE on the last row: no denominator is quoted, deliberately.** With `.git` gone `git check-ignore`
cannot answer either, so previously-ignored files under a scan root join the count and it moves with
whatever happens to be on disk. An earlier draft quoted `123` from a clone that had one stray ignored
artifact; a pristine clone prints `122`. The exit code is the reproducible fact, and it is the fact
the row is making.

**EXIT CODES DERIVED HERE, NOT PORTED.** Both new refusals are **2**, this scanner's own code for
"the run is not evidence either way". Pre-fix all four shapes above exited **0** under an `OK` line,
which is worse than either 1 or 2. A sibling's number is not evidence about this repo: the
regular-file-root shape exits 2 in `hl7` and 1 in `terminology`, and was 1 here before `#61`.

**A DENOMINATOR CANNOT DETECT THIS, and that is the second time it has had to be written down.** 71
next to a healthy 122 is not a number anything about the report makes look wrong, because a count
counts the files that WERE found. The remedy cannot be a better count. It has to be a comparison
against a statement of the corpus that **does not come from the walk**: the walk reads directory
entries, git reads the index, and emptying a directory on disk moves only the first. **Anything
re-derived from the walk would agree with the walk forever**, which is why the suite's load-bearing
case is the negative control that runs the SAME missing file twice, once untracked (must pass) and
once tracked (must refuse), and demands opposite verdicts.

**IT FAILS CLOSED WHEN GIT CANNOT ANSWER.** No tracked set means no independent statement of the
corpus, so all mode refuses rather than skipping the reconciliation. An unanswerable git must never
be a way to switch this rule off. `gitTracked()` already treats an EMPTY answer as no answer, and
that carries straight through here.

**`--staged` and paths mode are NOT reconciled.** Neither claims to have covered the tree: `staged`
is bounded by the index diff, `paths` by argv. Reconciling them would refuse every ordinary
pre-commit run, and a gate that cries wolf gets bypassed. Pinned.

**Scope, and each clause was a decision:**

- **`isScannable`, not `isUnderScanRoot`.** The one rule where the READ predicate is correct, because
  the question is literally "was this file read?" and a `.md` is exempt from the read by a documented
  decision. Demanding a tracked `.md` be observed would refuse every healthy run.
- **An `--allow-fixture` path is exempt here.** ~~It is ACCOUNTED FOR, not unobserved: a reviewed,
  logged subtraction.~~ **THAT REASON IS RETRACTED (2026-08-11)** -- a reviewed decision not to look
  is still not a look, and the completeness rule refuses over such a path. **The exemption itself
  SURVIVES on a narrower reason, and deleting it was measured to change no exit code**: every cell is
  already refused by a rule whose message fits it, and this rule's ("restore the working tree") does
  not fit a file that is sitting right there. See `#the-completeness-rule-enumerated-and-never-read`.
- **An UNTRACKED file is never expected.** The tolerated-vanish class is untracked by construction,
  so tolerating one can never trip this rule and the two rules stay independent.
- **EVERY unobserved path is named**, the same principle `refuseRoots` and `refuseUnscannable` state.
  The list is bounded by the corpus rather than by `SCAN_ROOTS`, so it can be long; that length is the
  honest shape of the failure and truncating it puts the reader back where the denominator left them.
- **It refuses BEFORE `report`, without printing hits first**, matching the vanished-and-back-on-disk
  branch. Exit 2 means the run is not evidence; a partial hit list underneath that invites being read
  as the finding.
- **A tracked gitlink under a scan root IS reported**, matching what `--staged` already does with
  mode `160000`: its bytes are not in this repo.

**THE NESTED-CHECKOUT SHAPE WAS MEASURED, NOT ASSUMED**, because a sibling gate elsewhere scanned
zero files and passed exactly that way. `git ls-files` runs with the scanner's cwd and reports paths
RELATIVE TO IT, which is why it composes correctly where `git rev-parse --is-inside-work-tree` (which
answers for the ENCLOSING repo) would not. All three sub-cases: a copy nested in another repo and NOT
tracked by it gets an empty answer and refuses; a copy that IS tracked by the outer repo reconciles
normally (`OK: no hits (4 file(s) scanned)`, exit 0); the same tracked copy with `src/` emptied
refuses and names the file. **The residual below uses a DIFFERENT, thinner fixture**, so its count is
not this one minus the unopened files; do not reconcile the two by subtraction. **Do not replace the `ls-files` call with a work-tree probe.**

**THE PINNING TEST WAS FLIPPED DELIBERATELY, AND THE ARGUMENT OUTLIVES THE ASSERTION.** `DOES NOT
certify that anything was observed under a root` asserted exit 0 and `OK: no hits` on an emptied root,
so that closing the residual would redden rather than pass unnoticed. It did exactly that. It is now
`STILL does not certify OBSERVATION on its own: the emptied root is caught downstream, not here`, and
it asserts that the ROOT refusal stays SILENT while the corpus refusal fires. **That is not a weaker
test.** `walkRoot` did not change and still certifies existence only; if a future refactor moves the
emptied-root answer back into the root check, the flipped test goes red and forces the reader back to
the distinction instead of letting one rule quietly absorb the other. **The negative-assertion regexes
are keyed on `refuseRoots`'s own phrases (`could not be enumerated`, `broken promise`), not on the
words "declared scan root", which the corpus refusal legitimately uses to explain the difference.**

**Verified RED before it was verified green. THIS PARAGRAPH NAMES NO COUNT, DELIBERATELY, AND YOU MUST
NOT ADD ONE.** A count lived here and was wrong twice inside this single slice. First draft: "8 of the
10 new cases failed, and the 3 that stayed green" - **8 + 3 = 11, not 10**, measured before the
force-add guard was added and never re-derived, in the one sentence whose entire job is to supply a
count. Corrected; then the skip-worktree case was added and the corrected figure was stale again
before the branch was even pushed. **A number that has been corrected twice gets deleted, not
corrected a third time** (the same remedy the meta-repo applied to its version list). Derive it, in
one command, never stale:

```
git stash && npx vitest run test/scripts/phi-scan.test.ts; git stash pop   # green, on this tree
# and RED against the pre-fix scanner, in a throwaway clone:
#   git show <pre-fix sha>:scripts/phi-scan.ts > scripts/phi-scan.ts && npx vitest run test/scripts/phi-scan.test.ts
```

**What is stable here is not the arithmetic but WHICH cases stay green, and why**: every one of them
asserts a PASS. Those are the healthy control, the `.md` exemption, the `--allow-fixture` exemption,
and the gitignored-force-add guard. Stated in that direction on purpose, not as a biconditional: a
case may assert a pass AND a refusal (the negative control and the `--staged`/paths case both do) and
those are correctly RED, so "asserts a pass" does not by itself predict green. The last of those is a FALSE-REFUSAL guard rather than a
regression guard for this slice, which is the distinction worth carrying: **if a case that asserts a
REFUSAL stays green against the pre-fix scanner, it is not pinning this slice and you should find out
why before trusting it.** That test survives adding or removing a case; a tally does not.

**WHAT THIS STILL DOES NOT COVER, and this list has never been closed.** It proves each tracked
in-scope file was OPENED and its bytes handed to the dispatch. It says nothing about whether the
dispatch then understood them, so **the headline recogniser residual is untouched: a message embedded
in a `.ts` string literal is still not structurally scanned.** That is a recogniser gap and a separate
change. This slice adds **no files** to the corpus either: the healthy denominator is **122 before and
122 after**. It is a refusal, not an enumeration widening.

### Relocated verbatim from `CLAUDE.md`, 2026-08-11

- **Re-derive a residual here before believing it: `test/` scope, the root SET (a census of the
  files outside them buys one non-PHI hit), unmerged `U` entries and rename-blindness are all CLOSED in this repo**,
  whatever a sibling's list says. Why: same section.

- **Re-measure a sibling's fix here rather than porting its prose: a remedy's prose does not port
  with its code.** Why: `#a-remedys-prose-does-not-port-with-its-code`.

- **Never write this up as "the gate cannot be collapsed".** The invariants constrain the target
  set, not what enumeration lists; treat an enumeration change as a gate change. The claim is
  "these routes are closed". Why: `#the---diff-filter-polarity-lesson`.

- **Prefer exclusion lists to allow-lists anywhere the enumerator decides what gets looked at.**
  `--diff-filter=AM` was an allow-list of status letters and dropped `R` then `T` silently; it is
  now `--diff-filter=d` (+ `--no-renames`). Why: `#the---diff-filter-polarity-lesson`.

- **`--allow-fixture` is purely subtractive; an override matching no scanned file, and an emptied
  target set, both refuse (exit 2); every report line carries its denominator.** Never print `OK`
  without the number it is an `OK` over. Why: `#the-argument-driven-collapse-routes`.
  **AMENDED 2026-08-11: "purely subtractive" was the weakness. The flag applies to BOTH copies of a
  path and is RECORDED then REFUSED; the emptied-target-set rule is gone.** Why:
  `#the-completeness-rule-enumerated-and-never-read`.

- **When you touch this scanner, prove the change RED on a violator seeded under a scan root**, not
  merely green: a violator in an OS temp dir is never enumerated and proves nothing. Why: same section.

- **A scan that could not read what it enumerated refuses.** The one tolerated exception is scoped
  hard (self-enumerated + untracked + `ENOENT`, reported on stderr, subtracted from the
  denominator). **Never soften the rule that an all-mode sweep which observed nothing refuses.**
  Residuals are open and the list is not closed. Why: `#phi-scan-enumerate-then-read-class`.


- **The refusal boundary is `isUnderScanRoot` on BOTH routes, deliberately not `isScannable`** (a
  link's name is no evidence about the other side). **The gitignore exemption rests on
  `git check-ignore` being index-aware**, which is the only reason `git add -f` is not a bypass;
  keep the force-add test. Why: `#the-isunderscanroot-refusal-boundary`.

independent of the package's own `fast-xml-parser`. **SCRIPT** is an element-stack walk (patient +
prescriber names, `<DateOfBirth>`, SSN / cardholder / member ids, addresses, phones, tag-scoped);
**Telecom** tokenizes on FS/GS/RS and keys off 2-char field ids (CA/CB, C4, CM, CQ, CY, C2, CC/CD)
so a corrupt Segment Identification cannot bypass a per-field detector. **A DOB field fails CLOSED.**

- **A SCAN ROOT IS A DECLARATION, NOT A DISCOVERY: a declared root that is missing, is a link
  (dangling or not), or is not a directory REFUSES (exit 2), and EVERY broken root is named.** It
  used to be skipped in silence while the other roots supplied a plausible count. **The denominator
  is not this rule and cannot be**: it counts the roots that DID exist. The check is `lstatSync`,
  never `existsSync`, which FOLLOWS a link and is how a dangling root read clean. Keep the
  `existsSync` inside `walk`: it is now the subdirectory transient, not a root check. Why:
  `#a-scan-root-is-a-declaration-not-a-discovery`.

Moved to buy the bytes for the index-route imperative below, under the ADR 0023 remedy: **relocation,
never deletion, and never a shortened claim.** The cursor left behind in `CLAUDE.md` keeps the rule
and the two traps a reader needs before touching the code; every measurement and every "why" is here.

- **THAT RULE CERTIFIES EXISTENCE, NEVER OBSERVATION, AND NO VERSION OF IT COULD: an empty
  directory enumerates perfectly.** An EMPTIED root, or one missing a subtree, passed it and still
  printed `OK` over tracked files (51 unopened, then 17). **CLOSED by a SEPARATE rule: an all-mode
  sweep reconciles the paths it OPENED against `git ls-files` and refuses (exit 2) naming every
  tracked in-scope file it did not open.** Do not fold it back into `walkRoot` - a root check reads
  the filesystem, and the filesystem is what an emptied root already changed. **The expected set
  must come from the INDEX, never from the walk**: anything re-derived from the walk agrees with the
  walk forever, so the negative control (same missing file, tracked vs untracked, opposite verdicts)
  is the load-bearing test. **A denominator could never have caught it** - 71 next to a healthy 122
  looks fine. **It fails CLOSED when git cannot answer**; `--staged` and paths mode are deliberately
  NOT reconciled. **Never replace the `ls-files` call with a work-tree probe** (that one answers for
  the ENCLOSING repo; the nested cases are measured). Why:
  `#observation-not-existence-reconciling-the-sweep-against-the-index`.

## The bytes git carries: the index route, a union with the walk

`PHI-SCAN`, the escape the class says no repo had closed. Landed 2026-08-11. This is the third and
last rule in the "CI can print `OK` over a corpus it never opened" family here, and it is the one the
first two could not reach.

**THE PREMISE THAT TURNED OUT TO BE THE WEAKNESS SHAPE, NOT THE ABSENCE SHAPE.** The class dispatch
counted 9 `ls-files` and 8 `reconcile` occurrences in `scripts/phi-scan.ts` and predicted "substantial
reconciliation already, likely a weakness". Re-measured in-repo with `rg` **and** a Node read (the
class rule: `grep -c` has reported *no match* three times in this container on files both other tools
find hits in): 9 and 10. **The prediction held, and it held harder than expected** -- of the four
escape shapes a sibling reproduced at `exit 0`, **three were already closed here and the fourth does
not exist here at all** -- two different states, and the distinction is the point: a closure is
measured, a non-existent shape is simply absent. The three are closed because this repo reconciles an
OBSERVATION set (paths whose bytes `scanTarget` actually read) rather than a path-PRESENCE set.
Measured on `2cade73`, all at **exit 2**: a tracked path occupied by a DIRECTORY carrying a decoy; a
gitlink whose working tree is absent; 51 tracked files absent from the working tree. The fourth, a
path under a walk-skip directory name at any depth, has nothing to match: **this walk has NO
skip-list of directory names.** **Do not carry a sibling's list of
open states into this repo, and do not credit a new route with a state that was already closed.**

**AND THERE WAS NO REAL UNSCANNED CORPUS, WHICH BREAKS THE RUN AND IS A RESULT.** Measured on
`2cade73`: **125 tracked in-scope non-markdown files, 125 enumerated by the walk**, healthy control
`OK: no hits (125 file(s) scanned)` exit 0, and **all 125 index blobs byte-identical to their
working-tree copies**. Zero tracked `.md` sits inside a scan root, so the `.md` read exemption
currently exempts nothing. **Reproducing the state space and finding nothing hiding is the correct
outcome, and it is recorded here so the next reader does not re-derive it.**

### What WAS open: a path set cannot see what is at the path

Every rule above `refuseUnobserved` reconciles **path sets**. `unobservedTracked` proves each tracked
in-scope path was OPENED. The walk then reads the **working tree**, and **the working tree is not the
committed corpus**. So a payload sitting in the index at a path the sweep opened was invisible to all
of it.

**Measured on `2cade73` in a local clone, with the root rule, the reconciliation and the
observed-nothing floor all in place and passing:**

| index state at a tracked in-scope path                            | before                                          | after                                              |
| ----------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| healthy control                                                   | `OK: no hits (125 file(s) scanned)`, exit **0** | unchanged, exit **0**, **0** additional blobs read |
| synthetic name + DOB payload in the index, working copy clean     | `OK: no hits (125 file(s) scanned)`, exit **0** | exit **1**, hit at `<path> (git index)`            |
| the same payload at unmerged **stage 1** (the merge base)         | `OK: no hits (125 file(s) scanned)`, exit **0** | exit **1**, hit at `<path> (git index, stage 1)`   |
| the same payload at unmerged **stage 2**                          | `OK: no hits (125 file(s) scanned)`, exit **0** | exit **1**, hit at `<path> (git index, stage 2)`   |
| the same payload at unmerged **stage 3**                          | `OK: no hits (125 file(s) scanned)`, exit **0** | exit **1**, hit at `<path> (git index, stage 3)`   |

**THE DENOMINATOR IS RIGHT IN EVERY ROW, AND THAT IS THE POINT, FOR THE THIRD TIME IN THIS FILE.**
125 is not a number anything about the report makes look wrong, and unlike the emptied-root case it is
not even a *smaller* number: **every tracked path WAS opened. The sweep opened the wrong copy.** No
count, and no path-set reconciliation, can witness that. It takes a rule whose evidence is the
**bytes**.

### The rule

**An all-mode sweep now reads the bytes git carries as a UNION with the walk, and dedups ON THE PAIR
(this path, these bytes)**
(`gitIndexEntries` / `carriedEntries` / `readBlobs` / `sweepCarriedBytes` in `scripts/phi-scan.ts`).
The report line carries a second number, so an `OK` is never read without both of the numbers it is an
`OK` over: `OK: no hits (125 file(s) scanned, 0 additional blob(s) read from the git index)`.

**DEDUP IS ON THE PAIR: THIS PATH, THESE BYTES.** The key is the path joined to git's own object
name over the bytes the walk already read (`blob <len>\0` framing, algorithm from
`git rev-parse --show-object-format`). Where the two copies of a path agree the second read is waste,
so **a clean checkout matches every index entry at its own path and never invokes `cat-file` at all**
-- pinned by a case that runs against a `git` which FAILS on `cat-file` and still exits 0. **Where
they differ, the difference IS the finding and both are scanned.** A dedup keyed on the PATH alone
would silently drop one of the two with the denominator unchanged, which is the EOL axis below.

**AND THE OBJECT NAME ALONE IS NOT ENOUGH EITHER, WHICH THIS SLICE'S OWN REFUTER MEASURED.** The
first draft keyed on the oid, on the reading that "these bytes were already scanned" is a property of
the bytes. **It is not, because `detectFormats` routes an unsignalled payload by its case-folded
EXTENSION** -- the load-bearing fallback arm that keeps a `.xml` FRAGMENT and a separator-less
`.ncpdp` field token structurally scanned. So bytes the walk read at an untracked, non-gitignored
`newrx.xml.orig` (what `git mergetool` leaves; `*.orig` is not in this repo's `.gitignore`) earned NO
structural scanner and then **CANCELLED the index copy of the identical bytes at the tracked
`newrx.xml`, which would have earned one**. Reproduced: with the decoy present, `OK: no hits (4
file(s) scanned, 0 additional blob(s) read from the git index)` exit 0; delete the decoy and the
identical index state exits 1 with the name hit. **The transferable rule: a dedup key must carry
every input the thing it is deduping depends on, and this scan depends on the path.**

**GUESSING THE HASH ALGORITHM WRONG IS SAFE, AND THAT IS WHY IT FALLS BACK RATHER THAN REFUSING.**
The dedup only ever SKIPS a blob whose content was already scanned, so a wrong algorithm matches
nothing and every index blob gets fetched and scanned instead: **strictly more coverage, never less.**
Failing closed there would buy nothing and would turn an old `git` into a red gate.

### The unmerged axis, and why EVERY stage is read

**`--staged` already refuses an unmerged path here, and this route does NOT re-close that.**
`git diff --cached --raw` gives it status `U` with destination mode `000000`, and it refuses (exit 2)
over the identical index this route reads through stage by stage. A test pins that the two routes go
on disagreeing, because a route must not be credited with a state that predates it.

**`git ls-files -s` describes the same index completely differently, and that is the trap.** The path
appears **THREE times, at stages 1, 2 and 3, each with an ORDINARY blob mode** (measured: three
`100644` records). **A route that took the first record would scan stage 1, the MERGE BASE, and label
it "as git carries it"** -- the one content neither side is proposing. That is a confident wrong
answer, not an error. So **every stage present is read**, each labelled with its own stage. All three
are pinned, one case per stage.

**THE ROUTE MUST NOT DECIDE WHICH STAGES "COUNT", AND THIS SLICE'S REFUTER MEASURED WHY.** A draft
kept only stage 0 whenever a stage-0 entry existed, on the stated rule that **a stage-0 entry means
the path is merged**. **git disagrees: an index can hold stage 0 AND stages 1/2/3 for one path, and
`git status` calls that path `UU`.** Measured with stage 0 clean and stage 3 carrying the payload:
all mode printed `OK: no hits (3 file(s) scanned, 0 additional blob(s) read from the git index)` and
exited 0, **dropping the stage-3 blob silently**, while `--staged` refused the identical index at
exit 2. Reading every stage costs nothing on a healthy tree (a merged path has exactly one entry and
it dedups against the walk) and is strictly more coverage everywhere else. **The fix for a rule about
git's index that turned out to be wrong is not a more careful version of the same rule.**

**THE FIXTURES FABRICATE THE INDEX WITH `git update-index --index-info`, NOT WITH `git merge`, AND
THAT IS NOT A SHORTCUT.** A merge needs a committer identity; a runner without one dies at **exit 128
on "Committer identity unknown" BEFORE TOUCHING THE INDEX**. **A premise assertion that accepts any
non-zero exit accepts that crash and grades nothing** -- which is how a sibling shipped a case that
scanned a one-record stage-0 index while believing it had built a conflict. `--index-info` is
deterministic, needs no identity, and produces an entry-identical unmerged index. **Every premise here
is asserted against the run's own artifact** (the `ls-files -s` records, stage by stage, and a
byte-comparison of the two copies), never against an exit code.

**A CONSEQUENCE WORTH KNOWING BEFORE IT SURPRISES SOMEONE.** During a genuine conflicted merge this
route reads the MERGE BASE as well, so a payload living only in stage 1 is a hit at exit 1 over
content **no side is proposing**, and no edit to the working file clears it. That is correct on this
scanner's own terms (a commit does contain those bytes) and it is loud rather than silent, but the
remedy is to finish or abort the merge, not to edit the file. It is not reachable on a clean corpus,
because every stage of an ordinary conflict here carries clean content.

### The positive control runs over this repo's real corpus, and mutates nothing

**A suite that has never been seen red is indistinguishable from one that cannot go red**, and every
mechanism case above runs against a four-file scratch repo. So one case runs the real sweep over this
checkout's real tracked corpus and proves the route fires on it. **It mutates nothing:**
`GIT_INDEX_FILE` points git at a COPY of the index, and `GIT_OBJECT_DIRECTORY` /
`GIT_ALTERNATE_OBJECT_DIRECTORIES` put the marker blob in a temp object store. The real index, the
real object database and the working tree are all untouched, so a parallel worker on the same checkout
cannot observe anything -- which matters because this suite's own header records that **mutating THIS
repo's index from a test is not an acceptable way to get one**, and it is not an acceptable way to get
a positive control either.

**ITS NEGATIVE HALF ASSERTS A DIFFERENCE, NOT A ZERO, AND THAT IS A LESSON RATHER THAN A DETAIL.**
The obvious form is "an undoctored run reads 0 index blobs". **It is wrong here: this checkout is only
byte-clean between commits**, so a developer mid-slice has edited working copies whose index blobs
legitimately differ and legitimately get read. A hard `0` would red the suite on every run with
unstaged work, including the run that develops the file. The control therefore asserts
`carried(doctored) === carried(undoctored) + 1`. **The deterministic zero is asserted where it IS
deterministic**, in the scratch repo, against the `cat-file`-failing `git`.

### Exit codes, derived here and never ported

**A hit in a blob git carries is a HIT: exit 1**, the same code a working-tree hit gets, because a
commit does contain those bytes. **A `git` that cannot answer is exit 2, fail closed** --
`ls-files -s`, `cat-file`, an unparseable record, a blob shorter than its declared size, or a read
past the batch buffer. That is the same choice `gitTracked` already makes, for the same reason: with
no statement of the carried bytes the sweep cannot show it read them.

### What this route deliberately does NOT read, and the list is open

- **A non-regular index mode.** A `120000` blob's content is the **link target path**, working-tree
  text this scanner refuses to read or print anywhere else, and a `160000` gitlink names a commit in
  another repository with no blob at all. Both already refuse in all mode when the walk can see them.
  **A non-regular mode appearing ONLY at an unmerged stage is visible to neither route and is an OPEN
  RESIDUAL**, logged in `phi-scan-overrides.md`. It is left open deliberately: a refusal there would
  red-lock an ordinary conflicted merge involving a link, and this class's rule is that an exemption
  is a literal path and a refusal is a measured decision, never a shape guessed at.
- **Anything outside `isScannable`**, so the `.md` exemption and the `SCAN_ROOTS` boundary are exactly
  the walk's. **This route widens WHICH BYTES are read at an in-scope path; it does not widen the path
  scope.** That is a separate decision with its own measurement, **re-derived on `2cade73` rather than
  inherited: 44 tracked files sat outside every walk root on `2cade73`, and scanning all of them
  buys exactly ONE non-PHI hit -- a company contact address in `package.json`.** The earlier record of
  this census read 22 non-markdown files and one non-PHI hit; **that is a different denominator from
  this one and the two must not be subtracted** -- the comparable figure today is 23. **The figure
  moves with `.changeset/`, so re-derive it against a named ref rather than reading it off this
  line**: this slice's own changeset makes it 45, and a release consumes EVERY pending changeset at
  once -- two at this head -- so it lands BELOW 44 rather than back on it. **A "non-changeset"
  qualifier on 44 was
  wrong and was cut** -- the non-changeset count is 41 and does not move at all, which is the whole
  reason the raw number needed a ref rather than a filter.
- **An `--allow-fixture` path**, in either copy. The flag is a statement about a PATH, so withdrawing
  one copy and reading the other would make one flag mean two things at one path. **The sentence that
  used to justify this ("an override that reads as live while the gate refuses anyway") is retracted:
  under the completeness rule the run refuses whatever this filter does**, so the filter no longer
  decides whether a bypass is honoured, only that the refusal names one withdrawn path once.

**And the headline recogniser residual is still untouched**: a message embedded in a `.ts` string
literal is not structurally scanned, in either copy. **This slice adds no files to the corpus**: the
healthy denominator is **125 before and 125 after**, plus a second number that is **0** on a clean
checkout.

## The completeness rule: enumerated and never read

`PHI-SCAN`, second half. Landed 2026-08-11, the same day as the index-route union above, and the two
shipped separately on purpose: the union closed "the sweep opened the wrong copy", and this closes
"the sweep did not open it at all and said so as `OK`". The item was reported closed after the first
half; that was half the truth.

**THE DEFECT, MEASURED BY SOMETHING OUTSIDE THIS REPO.** `cosyte/config`'s drift check runs a
**capability probe** rather than a regex over this scanner's source (`config#67`; the reasoning is in
that file, and it is the right reasoning -- this campaign has now recorded a run of defects that lived
in a prose carrier while the code was right). The probe builds a throwaway repository holding one
synthetic violator and one clean decoy, logs a bypass for the decoy, and runs
`phi-scan <violator> <decoy> --allow-fixture <decoy>`. Both paths are **enumerated**; the decoy is
then **withdrawn**. Its verdict on this repo, before this slice:

> phi-scan reported only its HITS code (1) over a run that withdrew
> `test/fixtures/phi-scan-probe-decoy.txt` after enumerating it: the unread target is not refused, so
> the same argv over a corpus whose ONLY violator is withdrawn reports clean.

**The last clause is the finding, not a hypothetical**, and it was reproduced here rather than taken
on trust: with the rule mutated out and the argv changed only in which path the flag names, this
scanner printed `[phi-scan] OK: no hits (1 file(s) scanned)` and exited **0** over a corpus carrying a
live dashed SSN. In all mode it printed `OK: no hits (5 file(s) scanned, 0 additional blob(s) read
from the git index)` and exited 0 over the same violator. **A denominator was present and plausible in
both**, which is the third time that has had to be written down in this file.

### The rule

**A TARGET THIS RUN ENUMERATED AND NEVER READ REFUSES (exit 2), IN EVERY MODE, NAMING THE PATHS.**
A scan that did not open a file has no clean verdict to give about it, so the only true thing left to
say is that the scan is incomplete.

- **A SET DIFFERENCE, NEVER A SIZE.** A count counts the targets that DID get read, so `n of m` hides
  exactly the paths that did not. `unreadTargets` differences `enumerated` against the paths
  `scanTarget` actually read; `refuseUnread` names every offender.
- **The withdrawal moved from enumeration time to read time.** `enforceObservation` used to RETURN
  `enumerated` minus `allowed`, which left no evidence the run had ever claimed the file: by the time
  anything counted, "read and found clean" and "never opened" were the same state. The read loop now
  skips a withdrawn target and leaves it in the enumerated set.
- **`--allow-fixture` therefore cannot reach exit 0 in any argv.** The flag, the override log and the
  rejection gate all stay, so an attempt is **recorded and then refused** rather than silently
  honoured. `scripts/phi-allow-list.txt` is the only remedy that reaches a clean run, and the hit
  footer no longer advertises the flag: **a printed remedy that leads to exit 2 is the same defect as
  one that leads to a false green, with the sign flipped.**
- **Hits are printed BEFORE this refusal, and this is the ONLY refusal in the file that does that.**
  The reason is structural rather than stylistic: every other refusal fires with reads still to come
  (the index reconciliation runs BEFORE `sweepCarriedBytes`), so its hit list is not the run's final
  one, and a partial list under an exit 2 invites being read as the finding. This one fires after the
  LAST read. **`config`'s probe also depends on it** -- a graded run that printed no marker is graded
  `inconclusive`, which is not a pass.

### The one exception, and the cell map

**THE TOLERATED-VANISH CLASS IS THE ONLY EXCEPTION**, and it is passed into `unreadTargets` rather
than inferred there so it cannot widen. It is already bounded hard (self-enumerated + untracked +
`ENOENT`), announced on stderr, subtracted from the denominator and re-checked at sweep end; a file
that came back is a refusal, not a tolerance. The two rules meet exactly here, so the TOCTOU case in
the suite now asserts both verdicts in one place.

**WHICH RULE NAMES A LOGGED WITHDRAWAL DEPENDS ON THE PATH AND THE MODE.** Measured, every cell
exiting 2, over a tree the run CAN enumerate:

| the path is | refused by | when |
|---|---|---|
| a target of this run: positional, staged, or a walk entry that SURVIVED the gitignore filter | the completeness rule | after the hits print |
| the same, but `all` mode and EVERY target was withdrawn | the observed-nothing floor | before any hit can exist |
| NOT a target of this run: tracked but absent from the tree, untracked and gitignored, a `.md`, outside `SCAN_ROOTS` | `enforceObservation`'s inert-override check | before any read |

No cell reaches 0. **A FORCE-ADDED GITIGNORED FILE IS IN THE FIRST ROW, NOT THE SECOND**, and a draft
of this table put it in the second: `git check-ignore` is index-aware and does not report a tracked
path as ignored, so the walk lists it and the completeness rule is what refuses. That index-awareness
is the same fact the force-add test in the reconciliation suite already rests on.

**THE TABLE ANSWERS "WHICH RULE NAMES THE WITHDRAWAL", NEVER "WHAT REFUSES THIS RUN AT ALL", and a
draft that called it exhaustive was refuted with a third rule.** `refuseRoots`, `refuseUnscannable`,
the unreadable-allow-list and override-log refusals and the unanswerable-`git` refusals all fire
earlier and know nothing about the flag: measured, a **symbolic link** under a scan root refuses
under `refuseUnscannable` from inside `buildTargetsForAll`, before `enforceObservation` looks at the
flag at all, and `refuseUnobserved` and the vanished-and-back-on-disk branch do the same for a tree
that is short of a tracked file. So a tree the run cannot account for refuses under those, whatever
argv it was given, and the table applies to a tree it CAN enumerate.

### Two things this slice nearly got wrong, both caught by measuring

**`unobservedTracked` KEEPS its `--allow-fixture` exemption, and the reason was rewritten rather than
the code.** The exemption's old justification -- "an override is a reviewed, logged subtraction, so it
is accounted for rather than unobserved" -- **is retracted**: a reviewed decision not to look is still
not a look. The first draft of this slice therefore deleted the exemption and claimed it had closed a
hole for a tracked path absent from the working tree. **Measured: that is false.** The inert-override
check already refuses that cell, because the walk never listed the path. Deleting the exemption
changed **no exit code in any cell of the table above**; all it did was make the corpus-reconciliation message ("restore the
working tree") answer an argv the caller chose, about a file sitting right there. **So the exemption is
not a hole. Do not delete it for the retracted reason, and do not restore the retracted reason.**

**The third argument-driven invariant is GONE, deliberately.** `enforceObservation` used to refuse a
run whose targets were ALL withdrawn, telling the reader to *narrow the overrides*. Under this rule a
narrower override still refuses, so that was **a printed remedy leading to exit 2**. **Do not restore
it.**

**WHICH rule answers that state depends on the MODE, and the first draft of this slice got it wrong
in five carriers at once** (this file, the scanner header, the `enforceObservation` docblock,
`phi-scan-overrides.md`, `CLAUDE.md` and the changeset) by saying "the completeness rule, which names
the paths" for all three modes. Its refuter measured the counter-case: in `all` mode, withdrawing
every target leaves `observed === 0`, so **`main`'s observed-nothing floor fires first and always
will** -- and that floor used to name nothing at all, which made the diagnostic in that one cell
**strictly worse than the invariant the slice deleted** (which at least printed a count). The floor
now names the withdrawn paths, from `unreadTargets`, the same difference the completeness rule takes,
so the two can never disagree about which paths they are. `paths` and `--staged` mode are answered by
the completeness rule as written.

### The control is proved by mutation, and the mutation is committed

`#70` proved its control by neutering `sweepCarriedBytes` behind an env switch in a throwaway
worktree. This one goes further, because the probe that found the defect is a capability probe and the
same standard should apply in-repo: **`test/scripts/phi-scan.test.ts` writes a MUTANT copy of the
shipped scanner** with the single line that applies the rule replaced, runs it over the probe's own
corpus shape, and asserts **both** symptoms return -- exit 1 for the graded argv, and `OK: no hits` at
exit 0 when the withdrawn path is the only violator. The pinned line is asserted to occur **exactly
once** before the replacement, so a rename reddens there rather than quietly turning the mutant back
into the shipped scanner. An assertion nobody has seen fail is indistinguishable from one that cannot.

### What this slice did NOT change

**No path-scope change** (the 44-tracked-files-outside-the-roots census is untouched, and still buys
exactly one non-PHI hit), **no change to the walk, the roots, the dispatch or any detector**, and the
healthy denominator is **125 before and 125 after**. The open residuals are unchanged: a non-regular
index mode appearing only at an unmerged stage is read by neither route, and **a message embedded in a
`.ts` string literal is still not structurally scanned**. `phi-scan-overrides.md` carries no live
entry, so nothing in the committed tree was withdrawn by this rule.

## The two-file contract gate

Landed 2026-08-10. `scripts/check-agent-notes.ts` (`pnpm check:agent-notes`, also reached by
`pnpm check`), enforced by `test/scripts/agent-notes.test.ts`. **It lives in the TEST SUITE rather
than in a fourth workflow**, which is what makes it block: this repo's required contexts include
`ci / verify` on both Node versions, and that job runs `pnpm test:coverage`, so the gate rides a
context that already exists. A fourth workflow would have had to be added to the ruleset by hand,
after a run on `main`, and would have blocked nothing until someone did. The reference shape is
`ccda`'s; the scoping discipline is `mllp`'s.

**What it asserts, and nothing more.** The narrative file must be tracked; every section must have a
body, where a container's body is its subsections; every pointer at it that the gate matched must
resolve to a heading GitHub would actually mint. Exit 0 is the contract holding, exit 1 is a finding
a human acts on, and exit 2 is a REFUSAL, meaning believe nothing the run said. Collapsing 1 and 2
would turn a broken scanner into a list of false findings, which reads as actionable and is worse
than a crash.

**▶ IT IS NOT A UNIVERSAL, AND A GATE ASSERTING OTHERWISE WOULD BE AN OVERCLAIM.** Measured
2026-08-06 on the umbrella's checkout: `config`, `hl7`, `workflow`, `crew`, `knowledgebase`,
`.github` and `claude-containers` carry no narrative file at all. The honest outcome for those is a
written exemption, not an invented file, and it is not for a script inside one package to decide.
So this gate is named for what it checks and claims nothing about any sibling. Porting it means
copying the SHAPE and re-deriving the scan surface, which in this repo was not a formality.

### Two pointer forms, and why a copied matcher would have seen almost none of them

**THE ANCHOR OF A SWEEP IS PART OF ITS CLAIM.** `mllp`'s copy matches one shape, the path-qualified
`<basename>` followed by `#` and the slug. Run against this tree with that matcher alone it finds a
single-figure number of pointers, all in `CLAUDE.md`. This repo's dominant form is the BARE one, an
inline code span holding nothing but `#` and the slug, written after a `Why:`, and there is an
order of magnitude more of them. A gate ported verbatim would have printed `all resolving` while
saying nothing about the large majority of the pointers on the tree, with a perfectly healthy
looking reconciliation underneath it. So there are two matchers:

- **QUALIFIED**: matched in EVERY opened file, no filename scope. A pointer at the narrative file is
  a pointer wherever it is written.
- **BARE**: matched in `CLAUDE.md` and in the narrative file ONLY. Outside the pair the shape is
  genuinely ambiguous rather than merely noisy, and that is measured: `CHANGELOG.md` carries
  backticked pull-request references and `src/script/xml-load.ts` carries the XML text-node key,
  which is byte-identical to a bare pointer and points at nothing. Widening this matcher to the
  whole corpus turns those into findings, and so do this gate's own source and tests, which carry
  the shape as sample data. **Do not keep a count of them here**: the first version of this
  sentence said "two" and was already stale in the commit that wrote it. The cost is disclosed
  rather than hidden: a bare anchor written into a README or a workflow is never read as a
  pointer, so **write the qualified form outside the pair**.

A bare anchor of DIGITS ONLY is an issue or pull-request reference, not a section anchor, and the
narrative file uses it that way. Those are counted and printed on the OK line rather than dropped in
silence. The disclosed cost is that a heading whose text is only digits would be unreachable through
the bare form; the qualified form still reaches it.

**▶ A MALFORMED POINTER CAN GO GREEN THROUGH EITHER MATCHER, AND NEITHER ROUTE IS THE SAFE ONE.**
Two drafts of this paragraph got the direction wrong, each in the other direction, so read the two
routes rather than a summary of them. The **bare** matcher needs the closing backtick immediately
after the anchor run, so a span holding a percent escape, a trailing period or a space is not
matched **at all**: not a hit the gate then declines the way a digits-only reference is, so there
is nothing to count. The **qualified** matcher stops early at the offending character, which reds
only when the truncated prefix is not itself a heading slug; **when it is, the broken pointer is
reported as resolving.** Both routes end in a green run over a link that resolves to nothing, and
both are pinned green in `test/scripts/agent-notes.test.ts` so that closing either is a deliberate
change. **The remedy is to write the pointer properly, not to widen the matchers**: an anchor class
that admits arbitrary text then has to tell a malformed pointer from ordinary prose, and getting
that wrong reds a working document.

**ZERO FROM EITHER FORM IS A REFUSAL, AND IT IS PER FORM RATHER THAN COMBINED.** Both forms are in
use here today, so neither going to zero can be a clean tree. A combined count would let one matcher
die silently behind the other, which is exactly how this gate would come to report on a handful of
pointers while its arithmetic still read healthy. If the tree is ever deliberately converted to one
form, re-derive that refusal; do not route around it.

### No exclusion list, so a NUL-bearing file REFUSES rather than being skipped

The corpus is `git ls-files -s -z`, in full, with **no exclusion list of any kind**, and the OK line
reconciles opened paths against it as SETS rather than counters. A pair of counters incremented once
per iteration can only sum to the number of iterations, so comparing that sum to the corpus size is
a tautology; sets catch a path enumerated twice and a path no branch reached. The property that
actually prevents the `observed nothing` defect is structural though, not arithmetic: **there is no
declared root to be wrong about**, which is the same lesson this repo's PHI scanner paid for when it
printed `OK` over an emptied scan root.

**`mllp` skips a NUL-bearing file and discloses it as a miss; this copy REFUSES instead, and the
difference is deliberate.** `mllp` vendors a compressed tarball that cannot be read as markdown and
cannot be edited to clear a red. This repo vendors nothing of the kind: measured over every tracked
path, none carries a NUL byte and none fails to round-trip as UTF-8, and
`scripts/check-no-emdash.sh` here is the text-only variant that already depends on that. A sibling
gate re-added exactly such a skip on the very file another sweep had once silently missed, while
three copies of its prose still claimed no exclusion list. **There is no skip here to describe
wrongly, which is the cheapest way not to have that defect.** If a NUL-bearing tracked file ever
lands, a human decides the partition; do not add a silent skip to get green.

### The encoding limit, measured in both directions

One real pointer was encoded with `iconv` and run through the matcher. Three different outcomes, so
do not round them off to "non-UTF-8 is not read":

- **Windows-1252 IS matched.** The pointer's own bytes are ASCII there, and a stray high byte
  elsewhere on the line only becomes U+FFFD. A dangling pointer in such a file is a real finding.
- **EBCDIC (IBM037) and UTF-7 are read and never match**, a silent miss in both cases. The UTF-7
  reason is not the obvious one: `iconv` escapes `#` itself as `+ACM-`, so the pointer does not
  survive even though the rest of the line is plain ASCII. A draft of this paragraph claimed UTF-7
  matched, for exactly that obvious-looking reason, and the measurement said otherwise.
- **UTF-16 and UTF-32 REFUSE**, because they carry NUL bytes. That is what the no-skip rule above
  buys: what would have been a silent miss is an exit 2.

### What it cannot see, and the controls that proved it can see anything at all

Every disclosed miss is listed in the script header, and the marking says what stands behind it:
[PINNED] means a case in `test/scripts/agent-notes.test.ts` exercises it in the direction it fails,
[SCOPE] means there is nothing to execute, and [MEASURED, NOT PINNED] means it was reproduced by
hand with no case behind it. That third marking exists because a draft stretched [PINNED] across an
entry whose halves were not all covered. The markings are per BULLET wherever an entry has halves
that differ. **A disclosure that names a test must name one that exists.** The ones that matter
most to a reader of `CLAUDE.md`, without keeping a count of them here:

- **A section with a body is not a section with the RIGHT body.** This gate proves a pointer lands
  somewhere non-empty. It cannot prove the prose there grounds the rule that cited it. That half
  stays human.
- **An ATX heading inside an HTML COMMENT mints a phantom anchor**, so a pointer at commented-out
  narrative passes while GitHub resolves nothing. A FALSE GREEN, disclosed rather than closed: the
  fence tracker is not an HTML-comment tracker and this gate will not grow into a markdown parser.
  Reachability is the honest reason it stays open, the narrative file carries no HTML comment. If
  one ever lands, comment the POINTER out along with the section.
- **A pointer split across a line wrap is not rejoined**, so it reds. `mllp` carries a join;
  it is deliberately absent here because every pointer on this tree sits inside an inline code span,
  a span cannot be split by a wrap, and `@cosyte/prettier-config` sets `proseWrap: preserve`. The
  direction of that miss is FALSE RED, which is the safe one, and the remedy is to unwrap the
  pointer rather than to widen the matcher.

**A detector zero is not a clearance until the detector has been watched to fail.** Four positive
controls were run against the REAL tree, not only against throwaway fixtures: a dangling bare
pointer, a dangling qualified pointer, a section emptied down to its heading, and the narrative file
renamed away. Each exited 1 and named the finding; the tree exited 0 before and after each one, by
file copy rather than by `git checkout --`. The fixture suite adds the refusals a real tree cannot
be put into safely: an empty index, a non-repository, zero pointers from either form separately, a
NUL-bearing tracked file, a duplicate contract basename, a symlink, a missing path, a directory and
a FIFO.

**Never clear a red by deleting the pointer or the heading.** Deleting the pointer deletes the
grounding for the rule that cited it, which is the whole thing this pair exists to keep.

### Prettier must never touch this file, and `.prettierignore` is why

Relocation is byte-verbatim, and this gate resolves pointers by GitHub heading slug, so the
indentation and block structure here are load-bearing bytes rather than style. Prettier
renormalises both. `documentation/` was already outside `package.json`'s `format` globs, which was
not enough: running `prettier --write` on the path EXPLICITLY stripped the two-space indent off a
block relocated minutes earlier, in this very slice, which is the defect the shared conventions
warn about in the abstract. `.prettierignore` now closes it and carries the reason in a comment. It was
checked BY HAND on 2026-08-10 (write to the path, diff for zero change) and NO STANDING TEST
repeats that, so treat it as a measurement on a date rather than a gate. **If a red ever traces back to
this file's formatting, restore the bytes; do not accept the reformat.** It is recorded here
rather than in `CLAUDE.md` because that file is at its ceiling with six bytes to spare, and ADR
0023's remedy for that is relocation, never deleting something else to make room.

## Em-dash brand gate

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

## Required checks on `main`

Three branch rulesets protect `main`. Only one is editable from this repo.

- **`ci-required-checks`** (repository-level, id `19841505`). This repo's own ruleset, and the one to
  extend. It requires the repo's check-run contexts, every one pinned to the GitHub Actions app
  (`integration_id: 15368`): `ci / verify (22, ubuntu-latest)`, `ci / verify (24, ubuntu-latest)`,
  `ci / actionlint`, `codeql / analyze (javascript-typescript)`, `release-dry-run`, `no-emdash`,
  `no-internal-refs`, `test-selection`. **Read the live set back rather than trusting this list**
  (`gh api repos/cosyte/ncpdp/rulesets/19841505`); a hardcoded count here has gone stale before, and
  the list is prose that no test can check.

### test-selection became genuinely required (2026-08-04)

**`test-selection` was added to that set on 2026-08-04, and this list named it before the ruleset
did.** From the day the workflow landed the required set held the other seven and not this one, so
on every pull request the gate ran on it went green and blocked nothing, while both this file and
the workflow's own header said it was required. That is the whole argument for the sentence above: **the only evidence is the API**, a
green suite is not evidence, and prose that no test can check is the exact shape that was wrong
here for as long as anyone read it. It was added in the required order, after the workflow had
completed on `main` on the `push` trigger, never before; requiring a context nothing has emitted
leaves every pull request pending and unmergeable rather than red.

**The price was measured rather than assumed, and it was zero.** Adding a required context blocks
any open pull request whose branch predates the workflow. Exactly one here was in that state (a
dependabot branch from 2026-07-17) and it was **already blocked**, missing three contexts that were
required before this change (`codeql / analyze (javascript-typescript)`, `no-emdash`,
`no-internal-refs`). So nothing was newly blocked. A rebase clears it either way, and a bypass
actor is never the answer.

### The organization-level rulesets

- **`baseline-branch-protection`** and **`parser-ci-required-checks`** (both organization-level,
  sourced from `cosyte`). They supply the pull-request requirement, linear history, the deletion and
  force-push bans, and a subset of the CI contexts above. A `PUT` against either returns 404 from
  this repo even though a `GET` returns 200, so they are read-only here: change them in the org,
  never by copying them into the repo ruleset.

### One repository ruleset, extended in place

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

### What silently detaches a required check

Things that silently detach or hollow out a required check:

- **Renaming a job.** The ruleset keeps requiring a context nothing emits. Rename the job id and the
  required context together, or neither.
- **Splitting a step into its own job.** A required job gates all of its steps, so moving one out
  quietly un-requires it.
- **Narrowing `include` in `vitest.config.ts`.** `pnpm test` takes no path arguments, so that single
  glob is the sole selector for everything `ci / verify` runs. Coverage does not backstop it:
  coverage is measured over `src/**/*.ts` only, so dropping `test/scripts/phi-scan.test.ts` or
  `test/property/` costs zero coverage percent and reds nothing.

### The test-selection gate in detail

**This one is now gated.** `scripts/check-test-selection.ts` (`pnpm check:test-selection`, required
context `test-selection`) compares the test files that **exist** against the test files vitest
would actually **run**, and reds on any shortfall **in its subject**. Read that scope before you
trust it: only `test/property` (workflow-derived) and the PHI suite are watched by a
name-independent rule. Every other test file is watched by the `.test.`/`.spec.` filename
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
   `vitest run` in a different job, so an `include` keyed on `process.argv` can answer the two
   differently. **Measured on `47d87d4`, so do not let a port re-assert it is caught**: such an
   `include` served the gate all 26 resolved files at exit 0 with `OK` printed, while the branch
   CI takes resolved to 7. Nineteen suites stop running with the gate and every required check
   green. Closing it needs a **different observation channel** (resolve under the invocation CI
   actually uses), not a tightening of this rule.
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
   (15 of the 24 suites selected **at that time** contained it, from `../_helpers/load-fixture`),
   as did a `_`-prefixed directory (`_x/parse.ts`; `parse` appeared in 21 of those same 24; both
   figures are a record of the measurement that found the defect, not of the tree today, and
   neither has been re-measured). **Same lesson as the invocation rule:
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

### Narrowing pnpm phi-scan: dispatch and residuals

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

### Unrequirable workflows and the wrong CodeQL context

- **Requiring a workflow with no `pull_request` trigger.** `fuzz`, `scorecard` and `release` are
  schedule, push or dispatch only. Requiring any of them strands every pull request forever, which is
  why they are excluded on purpose.
- **Requiring `CodeQL` (the Advanced Security check, app `57789`) instead of
  `codeql / analyze (javascript-typescript)`.** The former reports alert state, not whether the
  analysis ran.

### Nothing here observes its own ruleset (a GAP, not a law)

Finally, and it is the part no test currently tells you: **nothing in this repository observes its
own ruleset.** Delete the ruleset and every test still passes, every gate still prints OK, and this
file still says `main` is protected. A ruleset makes a red check block a merge; it does not make the
check correct. So read it back from the API
(`gh api "repos/cosyte/ncpdp/rulesets?includes_parents=true"`), and treat a green suite as no
evidence at all.

**That is a GAP, not a law, and the earlier wording here ("nothing _can_ observe it") was measurably
false.** `cosyte/ncpdp` is public and the rulesets endpoint answers an **unauthenticated** request:
measured 2026-08-04, `env -u GITHUB_TOKEN -u GH_TOKEN curl -sS
https://api.github.com/repos/cosyte/ncpdp/rulesets/19841505` returns **HTTP 200** with the whole
`required_status_checks` array, `integration_id` included, under `x-ratelimit-limit: 60` (the
anonymous quota, which is what proves no token was sent). A CI step could therefore assert its own
context is still required, with no secret and no extra permission. **It is deliberately not built
yet**, for two reasons worth knowing before someone builds it: the anonymous quota is 60/hour **per
IP** and GitHub-hosted runners share egress addresses, so a naive curl gate has a flakiness question
to answer before it may block a merge; and whether the Actions `GITHUB_TOKEN` is accepted for this
endpoint is **unverified** (no `administration` scope is granted). Both are answerable. **Do not
restate the gap as an impossibility** to avoid answering them.

### The release caller's grant gate

**The `Release` workflow on this repo was refused at STARTUP on every push to `main` from June 2026
until 2026-08-25, and no gate here noticed.** Not one of them looks at the caller's `permissions:`
block, and a startup refusal has nothing else to look at: GitHub rejects the workflow before any job
or step runs, so the run lasts about a second, writes no log, emits no annotation, and reports
`startup_failure` with an empty body. Every required check on `main` stayed green throughout,
because none of them is that workflow. What found it was a fleet-wide CI sweep from outside this
repository, on the anchor `ci:ncpdp:Release`, weeks after the fact.

**THE MECHANISM, WHICH IS THE PART WORTH CARRYING.** `.github/workflows/release.yml` here is a thin
caller of the org's shared release pipeline, `cosyte/.github/.github/workflows/release.yml`. A called
workflow's `GITHUB_TOKEN` **can only be downgraded by the callee, never elevated**. So a calling job
that pins a `permissions:` block granting less than the callee declares is asking for an ELEVATION,
and GitHub refuses the whole workflow rather than reporting it. A calling job with NO `permissions:`
block is not safer, it is the same defect by another route: it inherits the repository default, and
where that default is the restricted one it is `contents: read` and every grant the callee declares
is an elevation. The callee added `actions: read` (it reads the caller's environment protection with
it); this caller kept the three it already had; the arithmetic went one grant short and the workflow
stopped starting. The repair is commit `43b8cc25f`, "Release: grant `actions: read` to the
shared-workflow caller".

**WHAT THE CALLEE DECLARES, READ 2026-08-28** from `cosyte/.github`,
`.github/workflows/release.yml` on its default branch: `contents: write` (tags and the GitHub
release), `id-token: write` (npm provenance), `pull-requests: write` (the "Version Packages" PR) and
`actions: read`. Its release job runs in the caller's `release` environment, which is where the
human approval on npm publish lives, so **the delegation is the only caller-side carrier of that
gate**: a caller that stops delegating loses the human approval on publish silently, with no line
anywhere saying it did.

**THE GATE IS `test/scripts/release-caller.test.ts`, and it rides `pnpm test`**, which means the
required `ci / verify` contexts, rather than a fourth workflow nothing requires. It reads the caller
structurally (two-space indentation, three depths, no YAML dependency, the same text-shaped reading
`scripts/check-test-selection.ts` does on workflows) and reds when: a declared grant is missing or
downgraded; the caller delegates anywhere other than the shared pipeline, or stops delegating; the
calling job pins an `environment:` key of its own, which a job that calls a reusable workflow does
not take. **It refuses, naming the file, rather than reporting clean** when the workflow is absent,
empty, comment-only, has no `jobs:` block, opens `permissions:` with nothing under it, indents with
a tab, carries a grant level or an inline `permissions:` spelling it does not know, or has two jobs
delegating to the pipeline. That refusal list is the same discipline as the PHI scanner's: a check
that reports OK over a corpus it never read is the defect it was built to catch.

**MEASURED, and both controls are how a change to this suite gets proved.** Deleting
`actions: read` from the REAL workflow file reds **11 of the 26 cases**, and the first failure names
the grant: "job `release` does not request `actions: read` (it grants `actions: none`)". Disabling
the empty-file refusal reds **1** and the empty file still produces a named finding, from the
`jobs:` rule behind it. **Prove a rule here by mutating it out, never by a green run**, and the
mutation helper asserts that its edit actually changed the text, so a mutation that silently stopped
applying fails loudly instead of testing nothing.

**WHAT A GREEN RUN HERE DOES NOT MEAN, and do not restate this as more than it is.** The four grants
are **RECORDED from a dated read of the callee, not fetched**: nothing in this repository can see
that file. If the shared pipeline declares a FIFTH grant, this suite stays green and the next push
to `main` is refused at startup exactly as before. The shared pipeline's own caller-side note is
what announces that, and a human reading it is what acts on it. Nor does a green run mean the
release SUCCEEDS: a run that starts is normally HELD at the `release` environment for an approver,
which is the designed control and not a defect. Observed 2026-08-28, the newest `Release` run on
`main` reports status `waiting` with no conclusion, at head `43b8cc25f`. **A `waiting` run is not a
red one**, and reading it as one is how this workflow would get retired for working correctly.

## ATTW-FALSE-GREEN-PORT

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

## Wire-code labels: source it or delete it

`REJECT_CODE_MEANINGS.get("75")` returned "Prior Authorization Required" and nothing in the tree
said where that sentence came from. Four Telecom tables asserted 32 code meanings between them
(11 reject codes, 10 DUR reasons, 7 response statuses, 4 product qualifiers), every one of them
documented as "our own short labels", none of them carrying a source, on a wire format whose
normative vocabulary is a purchased product. `KNOWN-LIMITATIONS.md` told the same consumer the
library bundled no such table at all, which was flatly untrue of the same commit. That is the
defect this section exists for, and the rule that came out of it is: **a label ships with the
artifact that establishes it recorded beside it, or the label does not ship.**

### What was actually establishable, and what the corpus could not settle

One artifact could be obtained and read: the eMedNY ProDUR/ECCA Provider Manual v1.30 (New York
State Department of Health, revised 2010-02-12), retrieved 2026-08-25, pinned by sha256 in the
record above `DUR_REASON_MEANINGS`. It states eight Drug Conflict Code values for 439-E4. Seven of
them are codes this package decodes and they kept a label; `ID`, `LR` and `MC` appear nowhere in
it and were withdrawn. `DC` appears in it and is NOT in this package, and was NOT added: **adding
a code flips a recognition flag from false to true, which is a separate decision with its own
consumers, and a sourcing pass is not the place to make it.**

**Deriving the labels from the document rather than from the table being replaced is the whole
method, and it is checkable.** Five of the seven labels changed wording as a result. The one that
mattered is `ER`: the table read "Early Refill" and the document describes a drug-overuse alert.
A label that disagrees with the only artifact establishing it is not established by it, so the
label moved. Reading the old table first and looking for confirmation would have preserved that
error, which is the same failure `#ncpdp-script-versions-and-45-cfr-170205b` records for
`KNOWN_SCRIPT_VERSIONS`. **Re-derive; never confirm.**

511-FB, 112-AN and 436-E1 all had their labels withdrawn, along with two exports. **Be precise about
the difference between "no artifact", "an artifact that establishes part of a field" and "an
artifact that establishes nothing useful", because a provenance record that overstates its own
emptiness is the same defect as one that overstates its sources.** The first pass got this wrong for
511-FB and the gate caught it. Section 16.0 of that manual is not the heading-with-no-list the
record claimed: it is a 52-row CODE / DESCRIPTION / MEVS CODE table, followed by prose clarifying
five of those codes (`22`, `EV`, `83`, `84`, `DQ`). Seven of the eleven labels this package used to
ship are rows in that table and its wording for them matches almost word for word (`25`, `41`, `65`,
`70`, `75`, `76`, `88`); four are absent from it entirely (`54`, `79`, `AG`, `M1`). The withdrawal
did not move and the stated reason had to: sourcing that table would recognize seven of eleven and
leave four unknown, a payer-shaped partition of the reject vocabulary on the surface a consumer
reads to decide what to tell a pharmacist. **A record whose CONCLUSION is right and whose STATED
REASON its own cited artifact refutes is still the defect this section exists for.** For 436-E1 the
manual DOES state two values, `03` and `09`, in a NY Medicaid billing context: that leaves three of
the four shipped values with no artifact at all, corroborates one, and names one this package does
not decode, so the whole table went rather than shrinking to a single row sourced to one payer's
billing instructions. For 112-AN it states only `C` and `R`, behaviourally, two of the seven modeled
values. Each record in source says exactly that rather than "no artifact found", and
`KNOWN-LIMITATIONS.md` now says the same thing in the consumer's words rather than a flatter "None
obtainable" that the source record beside the code already refused. Other publications carrying
reject lists were located and could not be opened by anything in the pipeline: **an artifact nobody
can open establishes nothing.**

### A negative control is evidence only if the SAME pass reaches every label it vouches for

The first pass's control over 439-E4 asserted that "the pass that misses `ID`, `LR` and `MC` is the
same pass that hits the seven that ship". It was not. The extraction was anchored on markup,
`[A-Z][A-Z]</b> = [A-Za-z-]+`, which matches `TD DD DC PG PA LD HD` and CANNOT match `ER`: this
Word-generated HTML keeps the trailing space inside the bold run and puts the `=` in a following
`<span>`, so `ER</b> = ` never occurs anywhere in the file. `ER` is the single label the artifact was
carried to settle. **A control that provably cannot see the label it vouches for is not a control**,
and the identity between the pass that hits and the pass that misses is the control's entire
evidentiary value.

**Strip tags before matching, and record what the pass returned rather than what you want it to
prove.** The reader that replaced it joins lines, deletes `<...>`, then matches
`\b[A-Z][A-Z] *= *[A-Za-z][A-Za-z -]*`: twelve matches over exactly eight distinct codes, every
shipped code hit at least once including `ER`, and no line at all for `ID`, `LR` or `MC`. It is
still markup-sensitive, and the record says so: the manual lists this field three times and the pass
reads two of those listings fully. The claim it supports is "each shipped code is found at least
once and no withdrawn code is found anywhere", never "these are all the lines in the file".

**Say "token" when you mean token.** The same record claimed `MC` and `LR` "do not occur anywhere in
the file at all, at any position, in any casing". As a substring claim that is false: `MC` occurs
inside `MCO` and `MCCP`, `LR` inside "already". As a whole-word claim it is true, and it is the claim
that matters, `grep -a -o -i -E "\b(MC|LR)\b"` returning nothing across 1520729 bytes.
**Over-precision in a provenance record is the same class of defect as under-precision**: both
assert more than the run supports.

**And read the whole artifact before writing that a section of it is empty.** Both misstatements came
from reading a section by the shape of its markup rather than by its content. This file is 25850
lines of Word HTML in windows-1252: `grep -a`, never plain `grep`, and look at the TABLES, not only
the prose.

### The caveat travels with the label, in the source and not just in a note

A state Medicaid payer manual is normative for what THAT payer returns and is not the NCPDP
External Code List. Every label it grounds is single-source as a claim about the standard, and the
record says so in the file a reader lands in. Recording the caveat only in a planning document and
shipping the label unqualified is how a corroborated-once fact turns into a standard citation two
readers later.

### The guard, and what a green run from it does and does not mean

`test/telecom/vocab-provenance.test.ts` makes all of this mechanical rather than a review habit.
It enumerates `export const X: ReadonlyMap<...> = new Map([...])` across every file under `src/`,
with no exclusion list, and requires each one to carry a `vocab-provenance:` record beside it:
either `label-table` (which must then name the artifact, an ISO retrieval date, a sha256, the
derivation method, a negative control that was run, and the caveat where single-source) or
`not-a-label-table` (which must declare the closed control vocabulary its values come from, so the
escape hatch cannot be used to ship a label under another name). It parses the vocabulary table in
`KNOWN-LIMITATIONS.md` and fails on drift in EITHER direction: a claimed table that is absent or
empty, and a shipped table the document denies. It bounds a shipped label to a short phrase, so
the standing rule against redistributing NCPDP prose has a test rather than a reviewer behind it.

**It seeds every one of those failures on every run** and requires itself to catch them, because a
guard whose parser has silently stopped matching passes quietly forever otherwise. Beyond that, all
three rules were proved red by MUTATING THEM OUT against the real tree, not against a fixture:
deleting the `vocab-provenance:` header from the live 439-E4 record, flipping the 511-FB row in
`KNOWN-LIMITATIONS.md` to `yes`, and re-adding `description: "Paid"` to `RESPONSE_STATUS_MEANINGS`
each turned it red with a message naming the thing. **Prove a change to this guard the same way.**

**Never read a green run as "no unsourced label can ship."** The enumerator sees one declaration
shape. A table shipped as a frozen object literal, built at runtime, or read from a data file is
not enumerated at all, and neither is a module-private `const`: `src/common/code-system.ts` has one
that maps a SCRIPT qualifier onto a closed normalized-system union, left out on scope grounds and
still a hole in the sweep. `SEGMENT_NAMES` and `FIELD_NAMES` are enumerated and then deferred by
name, with the reason recorded in the test; a deferral that stops matching a declaration is itself
a failure, so the list cannot rot into an allow-list nobody reads. The claim to make is "no
declaration of this shape ships an unsourced label", never "the package cannot ship one".

### The withdrawal is a public-surface change and cost a release to say so

The four tables were public exports of a published package. Once a release ships with the labels
gone, a downstream consumer that rendered `description` in a pharmacy UI renders a bare code, and a
published version cannot be unpublished. That was the intended outcome (on a claim-adjudication
surface an unsourced label is worse than no label), and the changeset spells out per export what a
consumer receives instead. One knock-on worth knowing: with no 511-FB table left, EVERY reject code
is unrecognized, so `NCPDP_TELECOM_UNKNOWN_REJECT_CODE` now fires once per reject on every rejected
response. That is the honest reading of `known: false` and not an extra defect, but it is a real
change in warning volume. **The fail-safe invariants were deliberately untouched**: a reject still
always wins, an unmodeled status still reads `unknown` and never paid, no DUR alert is dropped, and
the disposition is still derived from the status and the rejects rather than from any label.

## The conformance statement and the version-set gate

A consumer deciding whether this package can carry their pharmacy traffic, and for how long, could
not learn either from the package. What was decoded lived in `src/script/versions.ts` and
`src/telecom/header.ts`; what was not decoded lived in `KNOWN-LIMITATIONS.md`; and the dates on
which the decoded Telecom version stops being the adopted one lived NOWHERE IN THE TREE. Four
published pages carried a partial version claim and none of them carried a date: `versions.ts`
recorded the SCRIPT 2028-01-01 expiry in a source comment, and nothing anywhere recorded that
45 CFR 162.1102 leaves F6 as the only adopted claim standard on 2028-04-14. **D.0 is the expiring
standard, not the standing one, and the package said nothing about that at all.**

`docs-content/conformance.md` is the answer and it is ONE document: per wire format the decoded
version, the public section that adopts it, the date that adoption ends, the
recognized-but-undecoded stamp, and the absence of a third-party record. It is linked from
`README.md` and from `docs-content/sidebars.json`, which is what "one hop from the published entry
points" means here.

### The set is DERIVED, and the gate reds in both directions

`test/conformance-statement.test.ts` never reads a copy of the version list. The SCRIPT half comes
from `KNOWN_SCRIPT_VERSIONS`; the Telecom half comes from offering `detectVersion` all 1296
two-character stamps at both candidate offsets it reads and recording which kind comes back. That
is the difference between a statement that is checked and one that is merely written: **a version
added to or retired from the code without editing that page fails, and so does a version the page
names that the code does not decode.** Three mutation proofs were run on 2026-08-25 rather than a
green run being taken as evidence: deleting the `2023011` row reddened with
`SCRIPT 2023011: the package decodes it and the statement does not`; adding `2099001` to
`KNOWN_SCRIPT_VERSIONS` reddened the same way; and making `detectVersion` return `d0` for an `E5`
stamp reddened with `Telecom E5: the package decodes it and the statement does not` AND with the
derivation self-test, which is the one that proves the probe still sees its subject.

### What the rules deliberately cannot see, said rather than claimed away

- **The overclaim rule is a bounded matcher, not an entailment checker.** It rejects a listed
  affirmative shape (certified, conformance-tested, verified by a third party, byte-for-byte
  parity with a named vendor or switch) in a sentence carrying no earlier negation, which is what
  lets the statement DENY each of those in plain English. A sentence that opens with a negation and
  then asserts the opposite walks past it. **Never read a green run as "no overclaim can ship."**
- **The restatement sweep keys on the SET, not on a mention.** Two distinct shipped SCRIPT version
  identifiers in one prose unit, or a Telecom decode-scope phrase from the closed list, is a
  restatement; a single version named in passing (the version a fixture is stamped with, the
  release a cited artifact studies) is not, and `docs-content/spec-notes-profiles.md` still carries
  one deliberately. The sweep runs over every markdown file on the published surface with NO
  exclusion list, and fenced code blocks are stripped first because a version identifier inside a
  sample message is data.
- **The dates are asserted, not derived.** They are not in the code to derive from. Each is pinned
  in the test beside the section that sets it and must appear beside that section in the same prose
  unit, so moving one without the other fails.

### The citation set is closed because the standards are purchased

The NCPDP Telecommunication and SCRIPT Implementation Guides are purchased products. Every version
identifier and date on that page comes from public law for exactly that reason: 45 CFR 170.205 for
SCRIPT, 45 CFR 162.1102 for the claim, 45 CFR 162.1202 for the eligibility inquiry. The gate closes
the set to those three sections, two public URLs (the NCPDP Certification Program FAQs and the ONC
blog post about the electronic prescribing testing tool) and files in this repository. **A citation
drifting outside that set is the route by which prose we may not redistribute arrives**, which is
why it is a test and not a convention.

### Two things carrying the word "certification" are not a conformance record

The NCPDP Certification Program certifies PEOPLE: an exam, a post-nominal designation, an embossed
certificate and a lapel pin, with no published registry of certified organizations or systems. The
one software conformance instrument, the ONC/NIST electronic prescribing testing tool now
stewarded by NCPDP, tests SCRIPT v10.6, which is precisely the legacy dotted shape
`classifyVersion` refuses with a typed fatal. **A pass that finds the word "certification" and
stops has found the opposite of what it was looking for.** The statement says so, names the
synthetic corpus, the `@cosyte/test-utils` invariants, the nightly fuzz job and the coverage gates
as what stands in, and repeats that there is no differential corpus and no byte-for-byte agreement
to assume.

### The shape hid behind two asterisks

The first version of the restatement sweep shipped with three published pages still asserting the
Telecom decode scope and the gate green over all of them. `README.md` and `docs-content/cookbook.md`
carried the same sentence verbatim, and `docs-content/troubleshooting.md` carried the claim written
from the other side:

```
- **Versions are not guessed.** Only **vD.0** is decoded against the fixed offsets. An **F6** stamp is
| `NCPDP_TELECOM_UNSUPPORTED_VERSION` | A version stamp other than vD.0 (and not the recognized-but-not-decoded F6). |
```

The closed list led with `/\bonly\s+(?:the\s+)?v?D\.0\b/i`, which after `only ` needs `D.0`, and
what actually sat there was two asterisks. **The sweep missed the shape by the width of the
emphasis markers.**

Two fixes, and BOTH were needed: the pages were repointed at the statement, AND the matcher now
normalizes markdown emphasis and code markers away before matching (`normalizeEmphasis`, which
deletes `*` and backticks and the `_` of `_emphasis_` while leaving the `_` inside
`NCPDP_TELECOM_VF6_NOT_DECODED` alone). A fixed page with an unfixed matcher leaves the gate blind
to the next author who writes the same sentence. The exclusion shape (`other than vD.0`,
`apart from`, `except`, `besides`) is in the list for the same reason: **a page that says which
stamp is refused has said which one is decoded.**

**The list still bounds SHAPES, not English**, and that limit is honest rather than a defect to
close by widening. What must never happen instead is an exclusion list of pages: the sweep runs over
every markdown file on the published surface, and the moment a page is exempted the second copy is
back. Seeded counterexamples for both shapes, and for the normalizer not welding two version
identifiers into one token, are in `test/conformance-statement.test.ts`.

### A promise about behaviour has a direction

`docs-content/conformance.md` said, without qualification, what a message carrying `F6` does: "the
parse succeeds, `header.versionRelease` carries the stamp, ... the warning
`NCPDP_TELECOM_VF6_NOT_DECODED` is raised ... the original bytes are still yours to forward."
**That is true of a REQUEST and false of a RESPONSE.** `isResponse()` in `src/telecom/parse.ts`
routes on `text.slice(6, 8) !== "D0" && text.slice(0, 2) === "D0"`, so a response stamped anything
but `D0` falls through to the request path, where `detectVersion` reads offsets 6-8 and 8-10 and
never looks at offset 0. An `F6` response therefore throws the typed fatal
`NCPDP_TELECOM_UNSUPPORTED_VERSION`, which the statement's own table assigns to "any other version
stamp, refused". A consumer planning an F6 cutover around a graceful degrade would have got a throw
on the leg that carries adjudication money.

**The remedy was documentation, not behaviour**: decoding `F6` was out of scope and remains out of
scope. What changed is that the promise is now made per direction, on the statement and on every
page that repeats any part of it, and **it is CHECKED BY PARSING RATHER THAN BY READING**. Rule 7
parses an `F6` request and an `F6` response, records what came back, and requires the statement to
state that outcome in that direction; rule 7b then sweeps the published surface and fails any page
that names the warning without naming the direction it holds in. Rule 7b derives its own relevance:
if the package ever raised that warning in both directions the qualifier would carry no
information, so the rule switches itself off, while rule 7a reds until the page says the new thing.

**Never state what a version stamp does without saying which direction it does it in**, here or on
any published page. A statement of behaviour that no test parses is one edit from being false again.

### SCRIPT has a third outcome and it is tolerated

The statement's SCRIPT rows carried two of three real outcomes: adopted versions decoded, pre-XML
dotted versions refused. **A present-but-unrecognized XML-era version is neither**:
`classifyVersion` returns `tolerated` for it, and the document is parsed against the same field
model with `NCPDP_SCRIPT_UNSUPPORTED_VERSION_TOLERATED` raised. `"2099001"` parses; `"10.6"` throws.
That is Postel's Law working as designed, and it was invisible on the page, so a reader who learned
from the Telecom rows that an unadopted stamp is refused would carry that inference to SCRIPT and be
wrong. The row is now there with status `tolerated`, and rule 8 samples three version shapes through
`classifyVersion` and requires each class it lands in to have a row status. **Three samples are not
a partition proof** and the rule says so; the `absent` class is deliberately unsampled, because a
missing version attribute is not a version stamp and that table is a table of version stamps.

### A true sentence goes false when the surface underneath it grows

The statement said an `F6` request gets "no segments are returned". That sentence was written while
`segments` was the whole decode surface, and it was exactly true then. It was still exactly true the
day every group-separated transaction became reachable on `transactions`, with `segments` demoted in
its own JSDoc to "a convenience alias for `transactions[0].segments`, never the whole message". **A
sentence that is still true can still have gone wrong**: a reader who has learned from `README.md`
that every transaction is decoded, and reads only "no segments", concludes the transactions are
there and the alias is merely empty. They are not there. Nothing about the statement changed and
nothing about it was false, and the inference it supported reversed underneath it.

That is why the branch carrying this statement was not merged by resolving its text conflicts.
`main` had moved the subject the statement asserts, so the merge was re-read claim by claim against
what the tree now does, by parsing rather than by reading: the `F6` request and response outcomes,
the SCRIPT classes, and `grep -ri batch src/` for the Batch row. One claim needed correcting and it
is this one.

**Rule 9 is that correction made mechanical.** It parses ONE two-transaction body under `D0` and
under `F6` and requires the statement to state the count the `F6` leg returned, keyed on
`decodedTransactionCount` and the backticked number rather than on a sentence about transactions,
which is unbounded English. **It has no self-disabling branch, deliberately**: the obvious one, "go
quiet when the two legs agree", would have left a page saying `0` standing on the day an `F6`
request started decoding two, which is the failure mode rules 7a and 7b exist to prevent and would
have re-imported it one rule over. The count is required whatever it is. Proved by mutating the real
tree in both currencies: restoring the shipped "no segments are returned" paragraph reds naming
`` `0` ``, and decoding the body on the `f6` branch of `parseTelecom` reds naming `` `2` ``. The one
refusal is a probe whose `D0` control decoded nothing, which measured nothing and says so instead of
passing.

**When a sibling change lands under a published claim, re-derive the claim rather than re-reading
it.** A claim about behaviour is only as current as the last time something parsed a message to
check it.

## The 111-AM inventory and its holes

`SEGMENT_NAMES` named 19 Segment Identification codes and asserted, in a `//` comment no consumer
ever sees, that it covered a request range of 01 to 16 and a response range of 20 to 28. It filled
neither. The six codes inside those ranges with no name (`06`, `09`, `14`, `15`, `16`, `27`) were
indistinguishable to a caller from three different situations: no such segment exists, this library
did not model one, or nobody has read an artifact that would settle it. On a claim surface those are
not the same fact, and only the third was true.

**The remedy is an accounting of absence, never an extension of the table.** `SEGMENT_CODE_RANGES`
and `SEGMENT_ABSENCES` in `src/telecom/segment-inventory.ts` publish the ranges and one record per
unnamed in-range code, each carrying the reason token `unsourced`. What fixes the vD.0 segment
inventory is an open question: the Implementation Guide and the External Code List are purchased
products, and no public artifact reached so far names a segment at any of the six or establishes
that none exists. **Do not name one of those codes from memory, from a vendor page, or from a
plausible-looking secondary source.** A name here would be a confident wrong answer on a
PHI-carrying wire format, which is the class of defect this package's whole posture exists to
prevent. A future artifact moves a code into `SEGMENT_NAMES` with the provenance record a label
needs, or grows the reason vocabulary with a token that says the standard defines nothing there.

**The bounds are unverified too, and the data says so rather than a comment.** Both ranges ship
`boundsVerified: false`, because nothing citable fixes either one; they were carried forward from
that same unsourced comment. Flipping one to `true` requires a `segment-range-source:` record beside
the declaration, in the shape the vocabulary tables use, and `test/telecom/segment-inventory.test.ts`
fails a range that claims verified bounds without one. The ranges were deliberately NOT narrowed to
the codes actually named: a caller reading a `14` off a wire is better served by "inside the range we
claim, unnamed for this reason" than by a range that quietly excludes it.

**`test/telecom/segment-inventory.test.ts` is the mechanical part, and its rules are pure functions
with a seeded counterexample each.** The load-bearing one is the withdrawal case: a check keyed on
"is this code unnamed" goes quiet the moment a name is REMOVED, so the rule is "every code inside a
declared range is named or accounted for", which reports a withdrawn name as unaccounted until a
record replaces it. Four rules were proved red by MUTATING THE REAL TREE, not a fixture: deleting
`12` from `docs-content/spec-notes-telecom.md` (the drift that was actually shipped), deleting the
`06` absence record, deleting `["13", "Clinical"]` from `SEGMENT_NAMES`, and flipping the request
range to `boundsVerified: true`. Each named the thing. **Prove a change here the same way.**

**The doc pass keys on the house phrasing plus a scope clause**, so a page that enumerates codes
declares whether it is complete for a side (`every request code this package names`, `every response
code this package names`) or topical (`only those this page uses`), and a complete block must equal
the inventory exactly. That distinction is not optional: `spec-notes-telecom-compound-cob.md`
legitimately lists five codes and would be broken by a rule that demanded all nineteen everywhere. A
backticked 2-digit code followed by a capitalized word OUTSIDE any declared block is itself a
finding, which is what keeps a new page from enumerating codes in a shape of its own and escaping.
**Read a green run as "no document of these shapes disagrees", never as "no document can disagree".**

**`SEGMENT_ABSENCES` is deliberately a `ReadonlyMap` declared in the one shape
`test/telecom/vocab-provenance.test.ts` enumerates**, carrying a `not-a-label-table` record with a
closed vocabulary, so that guard mechanically forbids a segment name from arriving here as a `note`
or a `description`. Shipping it as an array of frozen objects would have slipped through that guard's
known hole. If you add a table to this module, keep it in a shape the guard can see.

## No internal project bookkeeping on a public surface

4. **No internal project bookkeeping on a public surface** (founder directive, 2026-07-27). What a
   consumer reads (`README.md`, `KNOWN-LIMITATIONS.md`, `docs-content/`, the npm `description`, a
   release body) says what the software does and what changed. Item identifiers (`NCPDP-7`), phase
   and wave language, ADR numbers, meta-repo paths and "how this got built" commentary belong in the
   commit, the PR and the roadmap. **This list used to name the changeset and `CHANGELOG.md` too,
   and that was correct only while `"changelog": false`. It is not a safe place any more:** the
   summary's first sentence becomes a release bullet, and since `df05854` the generator writes the
   WHOLE summary into the `CHANGELOG.md` that `package.json#files` ships inside the tarball. An id in
   a LATER paragraph is not caught by anything - `check-no-internal-refs.sh` excludes `.changeset/`
   and `CHANGELOG.md`, and the org renderer only ever sees the first sentence - so it ships. **An
   UNREGISTERED prefix in the FIRST sentence is the one shape that fails loudly**, by refusing
   `release-notes.mjs prepare` on the version commit. Detail, with the measurements:
   `#release-notesmjs-and-an-unregistered-item-id-prefix`. It is a **translation** at the
   boundary, not a deletion, and when you strip an identifier off the front of a line, repair the
   head: a fragment reads worse than the text it replaced. Gated by `pnpm check:no-internal-refs`.
   The gate keys on known project prefixes, so **a new programme prefix has to be added to it by
   hand**; and it catches identifiers, not English sentences about our process, so the reviewer still
   owns half the rule.

### The WORD-N trap

**This is the repo where the WORD-N trap bites hardest**, because the token the identifier rule
strips is the name of the standard the package parses. `NCPDP-7` is ours; `NCPDP-SCRIPT`,
`NCPDP-TELECOM` and `NCPDP-D.0` are reference material, as are the field references that open with
a digit (`439-E4`, `511-FB`) and the `SYNTH-MSG-0001` example ids in every runnable sample. Never
re-key the rule on the `WORD-N` shape, and never "resync" the prefix list with a sibling repo's
copy without re-reading why `SYNTH` is absent from this one.

### Three source surfaces, three different answers

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

## The changelog generator

**The defect.** `CHANGELOG.md` is in `package.json#files`, so it is inside every published tarball.
`.changeset/config.json` set `"changelog": false` for this package's whole published history, which
means no release ever wrote a version heading into it and nothing ever rolled `[Unreleased]` over.
The file was hand-maintained under that one heading, and its preamble described the first pre-alpha
release in the future tense as a thing still to come, listing an API surface the tarball carrying
that sentence had already shipped several versions earlier. **Correcting the sentence was refused as
the fix** (founder call, 2026-08-05): the prose is an output of the mechanism, so a hand fix leaves
the mechanism and the file drifts again on the next release. The flag is the fix.

**What changed.** `changelog` now names `@changesets/cli/changelog`, the hand-written history moved
under `## Released before this file was generated`, and `test/scripts/changelog-generation.test.ts`
holds both down against the real `changeset version` in throwaway git repos. **9 cases red on the
parent tree.** Quote the 9, not a fraction: the denominator moves with the number of pending
changesets, because one case is generated per changeset.

**One claim to keep honest, because a refuter caught it here.** The archived text is byte identical
to what this repository held at the parent commit. That is **not** the same as "byte identical to
what installed copies have on disk", which is the sentence the first draft of the preamble shipped:
the published `0.0.11` tarball is 94,168 bytes to the parent's 98,036, because the entry added after
the `0.0.11` version commit had not been released yet. Measure a claim about a tarball **against the
registry**, never against `git`.

### Only one line may sit above generated output

Changesets prepends a release by **replacing the first newline in the document**. So exactly one
line can sit above generated output, and the rule this repo asserts is **"nothing but the H1 sits
above the first heading"**. A preamble on line 3, which is the shape this file used to have, means
every future release is spliced **between the H1 and the preamble**, and the preamble then reads as
part of that release. The negative control in the test reproduces exactly that on the old shape,
so the rule is demonstrated rather than asserted.

**Do not state the rule as "the archive heading comes second."** The first real release puts
`## <version>` exactly there, so that assertion wedges the release it was written to enable. And
`prepublishOnly` runs the suite under `changeset publish`, which means a Version PR merged without a
green run fails the publish **after** the changeset has been consumed on `main`.

### `## 0.0.1` is a substring of `## 0.0.10`

This package is past `0.0.10`, so any `indexOf` or substring `toContain` over a version heading
answers TRUE for a heading the document does not have. **Compare whole headings.** The test proves
the collision on real generator output rather than asserting it, and every version-heading
comparison in the file is an exact match against a list of whole lines for that reason. The same
reasoning applies to the archive heading: a changeset summary can quote it, and the quoted copy
lands **above** the real one, so both helpers locate it as a whole line.

### The Prettier pass stays ON here, and that is derived, not ported

**▶ PREMISE CORRECTED IN PLACE 2026-08-10, and the corrected sentence is bolded below.** This
repo gained a `.prettierignore` with the two-file-contract gate; it covers `documentation/` and
NOT `CHANGELOG.md`, so the conclusion here never moved. The paragraph is edited rather than
annotated because it is live prose authored here, not relocated: this file's byte-verbatim rule
covers relocated paragraphs only, and a first draft of this correction cited it wrongly. **The
discriminator was too wide and has been narrowed at the one place it was executable**
(`test/scripts/changelog-generation.test.ts` now asks Prettier via `--file-info` whether
`CHANGELOG.md` is ignored, rather than whether any `.prettierignore` exists). The published
`CHANGELOG.md` entry for `0.0.12` carries the OLD premise and is deliberately LEFT ALONE:
released history is not rewritten.

Changesets reformats the whole document it writes through Prettier unless `"prettier": false` turns
the pass off, and **the right value differs per repo. It goes wrong in both directions.** The
discriminator is the repo's own markdown-formatting scope. **`format:check` globs `"*.{json,md,yml}"` and
nothing excludes `CHANGELOG.md`**, so it is inside this repo's own formatting
gate and the archived history is already Prettier-canonical (`prettier --check CHANGELOG.md` exits
0 on the committed file). Both arms were measured here, on the real tool:

- **ON** (no `"prettier"` key, the default): the document opens
  `# Changelog` / blank / `## 0.0.12` / blank / `### Patch Changes` / blank / `- <sha>: <summary>`.
  `format:check` accepts it, and the archived history comes through **byte identical**.
- **OFF**: the document opens `## 0.0.12` and `### Patch Changes` on **adjacent lines with no blank
  line between them**, which this repo's Prettier config rejects, so **every Version PR would open
  red on a file no human touched.** The archived history is byte identical in this arm too.

So the trade is one-sided here: leaving it on costs nothing and turning it off costs CI. **A sibling
whose `.prettierignore` lists `*.md` needs the opposite value**, because there the pass rewrites
already-published text instead of tidying nothing, and one such rewrite ate the spaces around a
backticked literal inside a bold span. **Never resync this value between repos.** The assertion that
makes this a measurement rather than a preference is the byte-identity check on the archived
history, which is what would catch a Prettier pass silently rewriting published text.

### A changeset summary must not open a line at column 0 with an ATX heading

`getReleaseLine` indents every summary line after the first by **two spaces**, which is exactly the
content column of the `- ` bullet it writes. So a `## ...` line inside a summary is a real ATX
heading nested in that list item, and it renders as a **second heading inside the release section,
permanently, once published.** Write the divider as an inline code span instead. The test's probe
deliberately does the unsafe thing, because the helpers have to survive a changeset that does it by
accident.

**This repo now checks it mechanically, which no sibling does**: the suite reads every changeset
**pending right now** and refuses a summary line that the release would turn into a heading. **Name
that check for what it checks, never "a changeset cannot smuggle a heading".** A refuter reproduced
**two bypasses** of the first column-0-only draft, end to end on real generator output, and the
class is open:

- **A leading space.** `/^#{1,6} /` reads column 0 only, so ` ## x` walked straight past it. It is
  still a heading: CommonMark admits up to three leading spaces, the generator indents the line to
  column 3, and the **Prettier pass then normalises it back to the bullet's content column**. The
  rule is `{0,3}` leading spaces, which is CommonMark's own.
- **A setext underline.** `Smuggled` over `========` contains no `#` at all, so no ATX rule could
  ever see it, and **Prettier rewrites it into `# Smuggled`**, an H1 nested in the release section.
  Look for the underline, not for a `#`. It is only a heading when the line above is text: after a
  blank line, `---` is a thematic break and `- item` is a list.

Neither shape is visible to `shapeViolation` or `headings()`, and **that is deliberate** rather than
a hole in them: those two read a whole document, where a heading at column 0 is the only kind that
can move the archive.

### A release that publishes with an unchanged changelog is a write failure

Changesets wraps the changelog write in a try/catch that only `console.warn`s. Reproduced while
building this: a tree whose declared Prettier config cannot be resolved **bumps the version,
consumes the changeset, and writes no changelog at all**, with a warning as the only signal. So a
publish whose changelog did not move is that failure, **not a flag that quietly reverted.** Do not
diagnose it as the flag. There is no guard for this in any repo; it belongs in the shared release
pipeline rather than here.

### `release-notes.mjs` and an unregistered item id prefix

The public release body is composed from `.changeset/*.md`, and the renderer translates a leading
item id **only when it matches a registered project prefix**. An item named after its defect rather
than after a repo is not one. **What happens to it then CHANGED under this repo on 2026-08-06, and
the change reversed the failure mode**, so read the date on any claim here before acting on it:

- **Before `cosyte/.github#37`** an unregistered id was neither translated nor detected, so it
  **rendered whole into the published release body** and the notes gate passed it by design.
- **From `cosyte/.github#37` (`5597138`, now its `main`, and therefore what `release.yml` actually
  calls)** it is a `CONTENT_RULES` detector named `UNREGISTERED_ID` - a detector only, deliberately
  NOT a translation rule - so `prepare` **REFUSES** and nothing publishes.

**Run the real `release-notes.mjs prepare` and read what it renders, rather than reading the
changeset.** That is still the only check that sees any of this, and it is the check to re-run rather
than trusting this section: the rule lives in a repo this one does not own and moved once already.

**The rule's shape, read off `5597138` rather than described from memory:**
`/\b[A-Z]{2,}(?:-[A-Z]{2,}){2,}\b/` - three or more hyphen-joined runs of two or more UPPERCASE
`A-Z`. The uppercase requirement is what keeps `cool-ducks-repeat` and `docs-content/` out of it, and
a digit or a lone letter breaks a run, which is what keeps `NCPDP-7`, `SYNTH-MSG-0001`, `NCPDP-D.0`
and `A-BB-CC` out. **Do not shorten that to "no digit anywhere", which a draft of this note did and
which is false:** the match is a SUBSTRING, so `X12-EDI-FOO-BAR` is caught, on `EDI-FOO-BAR`.

**A REFUSAL IS NOT CHEAPER THAN THE LEAK, IT IS MORE EXPENSIVE, BECAUSE OF WHEN IT LANDS.** `prepare`
runs **on the version commit**, so the refusal arrives after the "Version Packages" pull request has
already merged and consumed the changeset, and the price is the revert dance in that script's
`RECOVERY`: recover the text from `<version-commit>^`, revert the version commit, reword, let
Changesets open a fresh pull request. **While the changeset is still PENDING the same fix is one
sentence and nothing else.** So an unregistered id is a defect under both pipelines, and the only
cheap moment to fix it is while the changeset is unconsumed.

**Measured end to end here, on the two changesets pending for `0.0.11` to `0.0.12`**, each time by
building a simulated version commit (reword committed first, then `changeset version`, then commit)
and running the real script against it:

- at `90936ea`, before #37: `PHI-SCAN-OBSERVED-NOTHING-IS-GLOBAL` rendered whole into a release
  bullet, and `assert` then reported `no banned content. OK to publish.` on those exact bytes;
- at `5597138`, the same unreworded summary: `prepare` exits 1 naming the line and the match, and
  writes no body at all;
- at `5597138` with the summary reworded: `prepare` writes a 638-byte body carrying both bullets, and
  `assert --expect-package @cosyte/ncpdp --expect-version 0.0.12` passes.

**Simulate the version commit in the right ORDER or you measure the wrong tree.** `prepare` reads the
consumed changesets from `<version-commit>^`, so a reword left uncommitted in the working tree is
invisible to it: a first attempt at the third row above reproduced the refusal exactly, because the
parent commit still held the original text. Commit the reword, then version, then render.

**`--expect-package` is no longer a no-op on its own.** #37 moved it onto its own arm, so
`assert --file <another repo's notes> --expect-package @cosyte/ncpdp` now refuses instead of falling
through. **Pass both flags anyway**, which is what `release.yml` does: only the pair proves the body
is about this package AT this version, rather than merely mentioning one of them.

**CUT IT OUT OF THE FIRST SENTENCE - AND WITH THE GENERATOR ON, PREFER CUTTING IT OUT OF THE
CHANGESET.** Only the opening sentence becomes a release bullet, and `check-no-internal-refs.sh` does
not scan `.changeset/` or `CHANGELOG.md`, which is why this repo's convention has put an id in a
later paragraph. **That exclusion is marked "contested, queued" in the gate itself, and it is no
longer free:** `CHANGELOG.md` is in `package.json#files` and the generator was turned on in
`df05854`, so the WHOLE summary, later paragraphs included, now ships inside the tarball. Measured
2026-08-06 against the PUBLISHED `0.0.11` tarball rather than the tree, `package/CHANGELOG.md`
already carries **15** lines under the gate's own project-prefix rule, **18** under `UNREGISTERED_ID`
alone, and **25** under the union. **Quote a count only with BOTH the pattern and the artifact that
produced it.** An earlier draft of this note said "18" bare; a later one called that unreproducible,
which was wrong twice over - it is exactly the `UNREGISTERED_ID` figure, and the same three patterns
give 15 / 19 / 26 against the working tree, so naming the artifact matters as much as naming the
pattern. **Cutting the first sentence stops the release BODY and nothing else; the tarball half is
open and no gate here closes it.**

**AND THE REWORD IS ITSELF A CLAIM, WHICH THE `routes are closed` RULE BINDS.** Pass 1 of this very
change replaced the id with "so a scan root emptied of its contents can no longer report a clean
result", and a refuter reproduced it FALSE in one tree: all-mode refused (exit 2), while `--staged`,
which is the pre-commit route a developer actually walks, and paths mode both still printed
`OK: no hits` and exited 0. **A release bullet is read standalone, so an unqualified consequence
clause reads as the whole gate.** Bind the consequence to the route, exactly as the rule above the
scanner already demands.

**NO LOCAL GUARD WAS ADDED FOR THIS, AND NONE SHOULD BE.** The general fix landed org-side in
`cosyte/.github#37`, which is where the renderer lives and where every caller repo gets it at once. A
copy of `UNREGISTERED_ID` here would be a second source of truth for a rule this repo does not own,
and the two would drift the way the prefix list already does (see the trap on that above). What is
missing locally is not a guard but the **pending-changeset** lint filed in that script's own README:
something that reads `.changeset/*.md` before the Version PR merges, which is the only moment the fix
is one sentence. That belongs there too, for the same reason.

## Roadmap (as originally written)

- **Phase 0: Initialized.** (Now: scaffolded onto the `@cosyte/*` standard.)
- Roadmap: 8 phases, 155 v1 requirements mapped.

## Architecture (locked in NCPDP-1)

ONE package, subpath exports (`@cosyte/ncpdp/telecom`, `/script`, `/common`), chosen over the
two-package alternative (`@cosyte/ncpdp-telecom` + `@cosyte/ncpdp-script` + shared
`@cosyte/ncpdp-common`) and shipped in Phase 1. `/script` and `/common` are live; `/telecom` is
planned. The subpath types resolve under both `node16` and legacy `node10` (via `typesVersions`).

**Read that against Status:** `/telecom` shipped in NCPDP-5..8, so all three subpaths are live
today. The paragraph above is preserved as written when the architecture was locked.

## Standards licensing and EPCS

Both are **rules, not narrative**, so they stayed in `CLAUDE.md` in full: see
"Standards Licensing: Important" and "EPCS: Out of Scope for v1" there. Nothing about either was
relocated.
