# phi-scan bypass log

This file logs every `--allow-fixture <path>` bypass invocation of
`scripts/phi-scan.ts`. The scanner refuses to honor a `--allow-fixture <path>`
flag UNLESS this file contains an entry referencing the same path. The committed
log is intentionally annoying. It discourages bypass and creates an audit
trail. Prefer extending `scripts/phi-allow-list.txt` (a token-level, reviewed
declaration) over a whole-file bypass.

## What `--allow-fixture` is, and what it can never do

`--allow-fixture X` is **purely subtractive**. It removes one already-enumerated
file from a broader scan, and it is never a scan target on its own:
`pnpm phi-scan --allow-fixture X` means "scan everything in scope EXCEPT `X`".

**It subtracts BOTH copies of that path, and a reviewer must weigh it that way.**
Since all mode began reading the bytes git carries as a union with the walk, a path
has a working-tree copy and an index copy, and the override removes both. Honouring
it for only one would leave the operator with a bypass that reads as live in this
log while the gate went on refusing. So an entry here is a statement about the path,
not about the file currently on disk.

That reading is now enforced, because the scanner used to do the opposite. The
flag seeded the target set, so a bare `--allow-fixture X` built the set `[X]`,
subtracted `X`, scanned **zero files**, printed `OK: no hits` and exited 0. The
override log was the only thing standing between that and a green CI run over
nothing, and an override log is one markdown commit away from permissive.

Three rules keep the gate observable, and all three exit `2` rather than `0`:

1. The flag never seeds the target set.
2. An `--allow-fixture` path that matches no scanned file is **rejected**. An
   override that subtracts nothing reads as a live bypass while doing nothing,
   which is how a stale log drifts out of sync with the tree.
3. A scan whose target set is emptied (by overrides, or by roots that resolve to
   nothing) is **rejected**. `--staged` with nothing staged is the one legitimate
   empty scan.

Every report line also carries the denominator (`N file(s) scanned`), so an `OK`
is never read without the number it is an `OK` over.

**A scan that could not read what it enumerated also refuses, and that rule is
not negotiable.** All mode lists every scan root first and reads each file
afterwards, so a file written and deleted inside that window makes the read throw
`ENOENT` and refuse the entire sweep. `SCAN_ROOTS` includes `scripts/`, and this
repo's own suite writes violator files under `scripts/` and `test/` and removes
them again, so the transient is in-tree rather than hypothetical. **The refusal
was right and the enumeration was wrong**, so exactly one case is tolerated: a
file the walk enumerated **itself**, that git does **not track**, failing with
**`ENOENT`**. It is reported on stderr as skipped and subtracted from the
denominator, never dropped silently. A **tracked** file (the committed corpus is
what the gate promises to have observed), any non-`ENOENT` failure (`EACCES`,
`EISDIR`: a scan that failed, not a file that went away), a tolerated file back
on disk when the sweep ends, a `git` that cannot say what is tracked, and a
tracked set that comes back **empty** all still refuse. All mode also refuses
outright if it ended up observing nothing, so the tolerance cannot decay into a
clean report of a tree nothing was read from. Pre-commit (`--staged`) reads blobs
from the git index (`git show :path`), so it never depended on any of this.

**These three rules constrain the target set, not the enumerator.** A file the
enumerator never lists is invisible to all three, and the denominator counts the
files that _were_ listed, so the output still reads plausible. That is not
theoretical: `--staged` enumerated with `--diff-filter=AM`, which does not match
an `R` entry, so a fixture that was `git mv`'d and edited to add PHI in the same
commit was staged and never opened, and the pre-commit gate printed `OK` over the
remaining staged files' count. `--no-renames` fixes that one, and a second review
pass found the identical shape in `T` (typechange: a tracked symlink replaced by a
regular file carrying PHI).

Two findings of the same shape is a pattern, and the pattern is the polarity:
`--diff-filter=AM` was an **allow-list of git status letters**, so every letter it
did not name was dropped silently. It is now `--diff-filter=d`, "everything except
deletions", where an unfamiliar or future status costs a wasted scan rather than a
missed file. **Prefer an exclusion list to an allow-list anywhere the enumerator
decides what gets looked at**, and treat any change to enumeration as a change to
the gate. A third finding of the same class followed
(`PHI-SCAN-SYMLINK-BLIND-ON-BOTH-ROUTES`): a **symbolic link** under a scan root
was invisible to the walk _and_ scanned as its own target path text by `--staged`,
so it read clean on **both** enumerating routes at once. An in-scope entry that is
not a regular file now **refuses** the scan; see "Closed, and how" below for the
measurement and the bounds. The enumeration gaps we currently know of are under
"Documented limitations" below; **that section is not a closed list**, and this
document has twice claimed a complete inventory of what was left and been wrong.

## How the scanner detects PHI

`scripts/phi-scan.ts` covers BOTH NCPDP wire formats and is structure-aware, not
a blind text regex. It is pure Node with zero runtime deps, deliberately NOT
reusing the package's own `fast-xml-parser`, because a safety gate must be
independent of the code it guards (a shared parse bug must not be able to blind
both).

**Format is detected from the CONTENT FIRST, at every path, and this paragraph
used to describe a gate that did not exist.** `detectFormats` (named `detectFormat`
back then, singular, because it could only ever choose one scanner) opened with a
path predicate (`test/` prefix, or a `.ncpdp` / `.xml` extension) and returned "not an
NCPDP message" for everything else, so the file NAME decided whether a message was
structurally read. Measured on the base commit, one byte-identical SCRIPT document
scored **2 hits as `.xml` and exit 0 as `.ts`, `.txt`, `.dat` and `.json`** -- and
**exit 0 as `.ncpdp`**, where the extension short-circuit routed an XML document
into the Telecom tokenizer, which finds no field ids in it. Both directions were
one defect: an extension outranking the bytes in front of it. The rule is now

1. NCPDP control-char separators in the bytes -> Telecom (very strong evidence, not
   proof: well-formed XML cannot carry them, and a PHI gate exists for malformed
   real-world bytes);
2. the payload is an XML document (a leading `<` after BOM and whitespace, plus an
   element tag) -> SCRIPT;
3. **1 and 2 are not exclusive.** A payload that signals both is scanned by BOTH,
   telecom then script. This is the answer to a precedence question and deliberately
   not a precedence: whichever signal lost would have had its PHI made unreadable.
   One stray `0x1C` in a `<Note>` used to silence a whole prescription that way;
   ranking XML first would merely have moved the hole onto a Telecom transmission
   carried inside an XML envelope;
4. only if NEITHER content signal fires, the extension, as a fallback for a payload
   that says nothing about itself: `.ncpdp` -> Telecom, `.xml` -> SCRIPT, matched
   **case-insensitively** (like `isScannable`'s own `.md` test). That arm is what
   keeps a `.xml` fragment fixture (leading prose, so not a document) and a
   separator-less `.ncpdp` field token structurally scanned, which is what makes each
   of these changes a strict superset rather than a trade. **Do not delete it.**

The widening direction is safe by construction: the cross-cutting shape pass runs on
every target whatever the structural dispatch found (once, in `scanTarget`, which is
where it moved when a target became able to earn two scanners), so structural routing
only ever ADDS detectors and can never suppress a hit the text-only pass would have
found. Verified as a differential rather than asserted, twice: 77 probes across 7
payload shapes and 11 extensions for the content-first change (**22 hits -> 188, zero
lost, no exit code going 1 -> 0**), then 216 probes across 18 payload shapes and 12
extensions for the union + case fold (**0 lost, 42 probes strictly gained, no
duplicated hit line**). The committed corpus is unchanged at 120 files / 0 hits
across both.

What this does NOT do is parse a message **embedded** in a string literal (a SCRIPT
fragment inside a `.ts` test, or a JSDoc `@example` under `src/`). The payload as a
whole is not a document, so it gets the conservative dashed-SSN + email pass only.
That gap is deliberate and is covered below, along with the narrower ones the routing
still has. **The list below is not a closed one**, for the same reason the enumeration
list further down is not.

### SCRIPT (XML, ePrescribing)

An element-stack walk yields each leaf element with its own tag and its parent's
tag (both lower-cased, namespace-prefix stripped, so `sig:LastName` and `LASTNAME`
are matched). Detection is tag-scoped, so `<BusinessName>Synthetic Community
Pharmacy</BusinessName>`, `<DrugDescription>`, and `<To>`/`<From>` routing ids
never trip a name detector.

| Category      | Where it looks                                                                                                       | Rule                                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Person names  | `<LastName>`, `<FirstName>`, `<MiddleName>` (patient AND prescriber)                                                 | each significant name token must be in the `NAME` allow-list. Single Latin initials skipped; single CJK kept; degree/suffix codes (MD, JR, …) ignored. |
| Date of birth | `<DateOfBirth>` (and its child `<Date>`)                                                                             | the normalized `YYYYMMDD` / `YYYYMM` / `YYYY` must be in the `DOB` allow-list. A written/sent `<Date>` under any other parent is NOT treated as a DOB. |
| SSN / ids     | `<SocialSecurity>`, `<CardholderID>`, `<MemberID>`, `<MedicaidNumber>`, `<MedicareNumber>`, `<PatientAccountNumber>` | a bare numeric (≥6-digit) id must be in the `ID` allow-list. Prefixed synthetic shapes (`SYNTH…`) pass.                                                |
| Address       | `<AddressLine1>`, `<AddressLine2>`, `<AddressLine>`                                                                  | a `<number> <word>` street line must be in the `ADDR` allow-list.                                                                                      |
| Phone         | `<Number>` under `<CommunicationNumber>`, `<PhoneNumber>`, `<Telephone>`                                             | a ≥10-digit number lacking the `555` fake-exchange convention is a hit.                                                                                |

### Telecom Standard (control-char framed, pharmacy claims)

The message is tokenized on the NCPDP separators (FS `0x1C` / GS `0x1D` / RS
`0x1E`); each token is a self-identifying `<2-char field id><value>` pair. Detection
keys off the field id, which is globally unique in the standard, so a corrupt or
missing Segment Identification (`AM`) field cannot route a PHI value away from its
detector (a deliberate contrast with segment-scoped detection). The fixed routing
header (no separators, so one token) carries no PHI field id and is ignored.

| Category               | Field id(s)               | Rule                                                                    |
| ---------------------- | ------------------------- | ----------------------------------------------------------------------- |
| Patient name           | `CA` (First), `CB` (Last) | each name token must be in the `NAME` allow-list.                       |
| Cardholder name        | `CC` (First), `CD` (Last) | each name token must be in the `NAME` allow-list.                       |
| Date of birth          | `C4` (304-C4)             | the normalized date must be in the `DOB` allow-list.                    |
| Cardholder / member id | `C2` (302-C2)             | a bare numeric id must be in the `ID` allow-list; prefixed shapes pass. |
| Patient id             | `CY` (332-CY)             | a bare numeric / SSN-shaped id must be in the `ID` allow-list.          |
| Address                | `CM` (322-CM)             | a `<number> <word>` street line must be in the `ADDR` allow-list.       |
| Phone                  | `CQ` (326-CQ)             | a ≥10-digit number lacking the `555` convention is a hit.               |

### Cross-cutting (both formats + hand-written code)

| Category | Rule                                                                    |
| -------- | ----------------------------------------------------------------------- |
| SSN      | a dashed `\d{3}-\d{2}-\d{4}` anywhere is always a hit.                  |
| Email    | an email whose domain is not an `EMAILDOMAIN` (reserved/test) is a hit. |

## Documented limitations

- **Scan scope is `src/` + `test/` + `scripts/`** (the `SCAN_ROOTS` list in
  `scripts/phi-scan.ts`, which is also the `--staged` filter, so there is exactly
  one place a narrowing can happen). `.md` files are skipped as documentation. A
  real NCPDP message committed outside those trees (repo root, a future
  `examples/` / starter-kit, `docs-content/`) is still NOT scanned; sample
  messages belong under `test/fixtures/`.

  The roots used to stop at `test/fixtures/`, which meant every test **outside**
  `fixtures/` was invisible to the gate, and this repo builds Telecom and SCRIPT
  messages as inline string literals in exactly those files. Widening `test/` is
  what closed that.

- **A NON-REGULAR index mode that appears ONLY at an unmerged stage is not read.**
  All mode reads the bytes git carries as a union with the walk, and that route
  reads regular blob modes only: a `120000` blob's content is the LINK TARGET PATH,
  which this scanner refuses to read or print anywhere else, and a `160000` gitlink
  names a commit in another repository and has no blob at all. Both already refuse
  in all mode when the walk can see them (`refuseUnscannable`, `refuseUnobserved`),
  and `--staged` refuses them by mode. A link or gitlink living only at stage 1, 2
  or 3 of a conflicted path is visible to none of those.

  **Left open deliberately.** A refusal there would red-lock an ordinary conflicted
  merge involving a symbolic link, and this class's own rule is that an exemption is
  a literal path and a refusal is a measured decision, never a shape guessed at.
  Closing it needs a real conflicted-link fixture and a measurement of what it costs
  a developer mid-merge, which is a different change.

- **The path SCOPE is unchanged by the index route.** Reading the bytes git carries
  widens WHICH BYTES are read at an in-scope path; it does not widen `SCAN_ROOTS` or
  the `.md` exemption. Re-derived 2026-08-11: **44 tracked files sat outside every
  walk root on `2cade73`, and scanning all of them buys exactly ONE non-PHI hit**, a
  company contact address in `package.json`. The figure moves with `.changeset/`
  (this slice's own changeset makes it 45 and a release consumes it back), so
  re-derive it rather than reading it off this line. A "non-changeset" qualifier on
  44 was wrong and was cut: the non-changeset count is 41 and does not move. Widening the roots remains a separate decision with its
  own measurement, and this is that measurement, not an argument either way.

- **A message EMBEDDED in a string literal is not structurally scanned**, anywhere:
  a SCRIPT fragment inside a `.ts` test, or one inside a JSDoc `@example` under
  `src/`. The detector asks whether the payload **as a whole** is an NCPDP message,
  and a TypeScript source is not one however much XML it quotes. Such a message is
  therefore checked for dashed SSNs and non-test emails, not for names or DOBs. Put
  a real message in a fixture file, where the structural detectors can see it.

  **This one was left open on purpose, and the reasoning is the point.** Sniffing
  XML out of arbitrary TypeScript is a separate job with its own false-positive
  surface, and a PHI gate that cries wolf gets bypassed, which is worse than a known
  gap. So the remedy was to delete the path predicate rather than grow a wider one:
  the boundary moved from "what is this file called" to "what is this payload",
  which is a question with an answer. The gap is **executable** rather than merely
  written down here (`test/scripts/phi-scan.test.ts` pins it, alongside a
  same-bytes-every-extension differential), so a later change that narrows or widens
  it reds a test instead of silently moving the gate.

- **The fallback matches the WHOLE suffix only.** A fragment named `.xml.bak`,
  `.xml.txt` or `.ncpdp.orig` does not end in `.xml` or `.ncpdp`, so it gets the
  conservative text pass. The case fold below widened which **names** match, not
  which **shape** does, and a match-anywhere test would route on any name merely
  containing `.xml`: the same false-positive argument that deleted the path predicate
  applies. Pinned in `test/scripts/phi-scan.test.ts`.

- **A separator-less Telecom payload is reached only through the fallback.** A single
  field token (`CB<name>`, no FS/GS/RS) has no content signal at all, so one named
  neither `.ncpdp` nor `.xml` is invisible to the field-id scan. This is the arm the
  extension fallback exists for, which is why deleting that arm would be a trade
  rather than a simplification. Also pinned.

- **ONE content signal suppresses the extension fallback entirely, so the
  stray-separator downgrade survives on a payload that is not a document.** The
  fallback is reached only when NEITHER content test fires, so a `.xml` FRAGMENT
  (leading prose) carrying `<LastName>` plus one stray `0x1C` is claimed by the
  separator test, declined by the document test, and never routed by its extension:
  **0 hits**, where the identical fragment without that byte scores 1. Measured
  identical on `e1d9a34` and after the union below, so the union closed this for a
  well-formed SCRIPT **document** (the case that was filed) and not for the cross
  case. Unioning the fallback in as well would close it, and is a further decision
  with its own false-positive weighing rather than a tidy-up. Pinned.

- **The vanished-file re-check is keyed on the PATH, not on content.** An untracked
  file **renamed** inside the enumerate-then-read window is `ENOENT` at the old path
  and was never enumerated under the new one, so its bytes go unscanned under a
  clean report. It is bounded: the file has to be untracked, so committing it means
  `git add`, after which it is tracked and untolerable, and pre-commit reads the
  index either way. Closing it needs a content-addressed sweep, a different design
  rather than a wider bound. The stderr line says the file was **gone**, never that
  it was deleted, for exactly this reason.

- **The back-on-disk re-check is an UNGUARDED BOUND, and it is the most dangerous
  line in the tolerance.** Every other bound has a test; this one does not, because
  nothing in the scanner calls `git` after the reads, so there is no deterministic
  hook there. The only reproductions found are timing-dependent (a backgrounded
  re-create raced against a deliberately large tree), and a load-sensitive sleep in
  the suite guarding a load-dependent race is the failure that race teaches.

  **Do not read "unpinned" as "low stakes", and an earlier draft of this bullet said
  exactly that and was wrong.** It claimed a regression here "can only turn a
  tolerated skip back into a refusal". It cannot. Deleting the `back` block was
  measured: the same input that refuses with `vanished mid-scan and is present
again` (exit 2) instead prints `OK: no hits` and exits **0**, with the file sitting
  on disk and its bytes never read. That is a clean pass over an unread file that
  exists in the tree, which is the one outcome this gate exists to prevent. **Treat
  this branch as load-bearing and unguarded: if you touch it, drive it by hand.**

- **~~`walk()` has the SAME enumerate-then-read shape one phase earlier, and it exits
  `1`.~~ CLOSED.** It did `existsSync(dir)` then `readdirSync(dir)`, so a directory
  removed or made unreadable in that window threw a plain `SystemError` that
  `main()`'s `InvocationError` filter did not convert, and Node exited **1**, the code
  this scanner's own contract reserves for "hits found". Reproduced with `chmod 000` on
  a subdirectory under `test/`. It failed closed, so it could never print a false `OK`.
  `walk()`'s `readdirSync` is now wrapped: `ENOENT` returns silently (the documented
  directory-level transient, the same class the tolerance above covers) and every other
  error is an `InvocationError`, so the `EACCES` case exits **2**. Measured on the
  same `chmod 000` reproduction: exit 1 before, exit 2 after. **The org-level survey
  scoped this one to the sibling repo alone, and that scoping was wrong: it was open
  here.** The `ENOENT` tolerance is silent and, unlike the file-level tolerance, makes
  no tracked/untracked discrimination; that is unchanged from the `existsSync` guard it
  replaces.

- **"Untracked" is read from the OUTER repo.** A nested git repo under a scan root
  (the stray agent-worktree gitlink shape) is not listed by the outer
  `git ls-files`, so its committed files look untracked and become tolerable. Not
  present in this repo today; reproduced in a scratch tree. Worth knowing before this
  remedy is carried to a sibling scanner.

**This section is not a closed list.** It has twice been published as a complete
inventory of what was left and been wrong both times. Treat it as what is known.

- **Explicit-paths mode reads THROUGH a link, and that is deliberate.** `statSync`
  and `readFileSync` both follow, so `pnpm phi-scan <link>` scans the target's real
  bytes. It is the two routes that enumerate on their own that were narrowed (see
  the closed list below); a human naming one path is asking for that file.
- **A non-regular entry is refused, not diagnosed.** The scan says an entry cannot
  be accounted for and stops; it does not say whether what is on the other side
  carries PHI, because it never reads it. A repo that legitimately needs a link
  under a scan root has no bypass short of `.gitignore` (the walk's existing
  exemption, which `--staged` does not share) or removing the entry.
- **The kind token is from `lstat`/the git mode, not from a follow.** A link to a
  link, or a link to a path that does not exist, both report `a symbolic link`. The
  refusal is the same either way, which is the point: the scan does not distinguish
  cases it would have to follow the link to distinguish.
- **A one-file scan is a truthful near-empty scan.** The emptiness invariant fires
  at exactly zero, so `pnpm phi-scan <one-in-scope-file>` reports
  `OK: no hits (1 file(s) scanned)` and exits 0. That is correct behavior for an
  explicit request, and the denominator makes it legible, but CI must keep invoking
  the bare `pnpm phi-scan` (it does) rather than a path list. Paths mode also does
  not apply `isScannable`, so an explicitly named path outside the roots is
  scanned rather than refused.
- **`--staged` READS no `.md`.** `isScannable` excludes markdown from the READ set
  in both modes. It does NOT exempt markdown from the non-regular-entry refusal,
  which is keyed on `isUnderScanRoot`: a link NAMED `notes.md` is refused on both
  routes, because its name says nothing about the other side. The
  staged filter previously admitted `.md` under `test/fixtures/`, so this is a
  narrowing, taken deliberately to make staged mode and the full walk agree (the
  full walk always skipped markdown). There are no markdown fixtures.
- **A dashed SSN cannot be allow-listed.** `scanCommonShapes` consults no
  allow-list, so a synthetic dashed SSN written into `scripts/phi-allow-list.txt`
  itself (now in scope) is an unfixable hit short of `--allow-fixture` on the
  allow-list. Write synthetic SSNs undashed.
- **Free-text names.** SCRIPT `<Note>` / `<SigText>` / `<Directions>` and Telecom
  free-text message fields are scanned for identifier _shapes_ (dashed SSN, email)
  but NOT for free-text personal names. A name in prose is not reliably separable
  from clinical vocabulary without NLP. A reviewer still owns clinical narrative;
  the structured name fields (the tables above) are the hard gate. Same limitation
  as `@cosyte/hl7`.
- **Common-name masking (residual, inherent).** The `NAME` allow-list contains
  common placeholder tokens the synthetic corpus uses (DOE, TEST, PATIENT, …). A
  real patient whose name is entirely common allow-listed tokens is invisible to
  the name detector, a structural consequence of a token allow-list, shared by the
  sibling parsers. The DOB / SSN / member-id / address gates remain the backstop.
- **Provider identifiers (NPI / DEA) are not gated.** A pharmacy / prescriber NPI
  (SCRIPT `<NPI>`, Telecom 201-B1 / 411-DB) is an organizational routing id, not a
  patient identifier, and is not flagged, matching `@cosyte/hl7`'s treatment of
  routing metadata. Patient / cardholder ids ARE gated.
- **Telecom header positional fields.** The fixed routing header (BIN, PCN, service
  provider id, date of service) is not decoded. It carries no patient PHI. The
  patient DOB (304-C4) lives in the field-id-keyed Patient segment and IS detected.
- **Alphanumeric member ids.** A bare numeric member id is flagged (the real shape);
  a real but _alphanumeric_ member id is indistinguishable from a synthetic prefixed
  id and is not flagged. The name / DOB / SSN gates are the backstop.
- **Phone `555` accept rule.** A ≥10-digit number containing `555` anywhere is
  treated as the fictional-exchange convention and accepted, matching the sibling
  parsers. A real DID containing `555` would pass.

- **THE ROOT CHECK CERTIFIES EXISTENCE, NEVER OBSERVATION. That half is now CLOSED,
  by a separate rule, and the split is deliberate.** `walkRoot` refuses a declared
  root that is missing, is a link, or is not a directory; an **emptied** root, or one
  missing a whole subtree, satisfies every one of those checks, because an empty
  directory enumerates perfectly. Measured on `e039229` and again in a clone at
  `16c2fea`: emptying `src/` printed `OK: no hits (71 file(s) scanned)` exit 0 with
  **51 tracked files unopened**; deleting only `src/telecom/` printed
  `OK: no hits (105 file(s) scanned)` exit 0 with **17** unopened. An all-mode sweep
  now **reconciles the paths it OPENED against `git ls-files`** and refuses (**exit
  2**) naming every tracked in-scope file it did not open, so both shapes exit 2 and
  the healthy control still prints `122 file(s) scanned` exit 0. **A denominator could
  never have caught it**: 71 next to 122 looks fine, because a count counts the files
  that WERE found. The expected set therefore comes from the INDEX, never from the
  walk. Full write-up, including the fail-closed behaviour when git cannot answer and
  the measured nested-checkout cases: `documentation/agent-notes.md`
  ("Observation, not existence"). **The pinning test was flipped with an argument, not
  silently**: it now asserts the ROOT refusal stays silent while the corpus refusal
  fires, so folding the two rules together goes red.
- **What that rule does NOT cover.** It proves each tracked in-scope file was OPENED,
  not that the dispatch understood it. The recogniser residual below (a message
  embedded in a `.ts` string literal) is untouched, and this slice added **no files**
  to the corpus: 122 scanned before, 122 after. Two further bounds, measured: the
  fail-closed test is `tracked.size > 0`, a **presence** test and not a **coverage**
  one, so a checkout with no `.git` of its own nested inside a repo that tracks almost
  nothing will reconcile against that thin index (`OK: no hits (3 file(s) scanned)`
  exit 0 with two files unopened) - not live here, this repo has its own `.git`. And
  **`git status` does not reveal a file hidden by a sparse checkout or a
  `skip-worktree` bit** (both measured clean while the file was absent), which is why
  the rule reads the index and why the refusal says so.
- **A subdirectory removed mid-walk is still skipped.** `walk` keeps an `existsSync`
  guard, and now tolerates `ENOENT` from its own `readdirSync`, for a directory that
  vanishes between its parent's listing and the recursion into it. That is the
  directory-level face of the tolerated transient, and it is deliberately NOT the root
  check.
- **A scan root that is a symbolic link to a REAL directory now refuses**, in addition
  to a dangling one. Both are refused because at declaration time they are
  indistinguishable, and a resolving one would read bytes git does not carry. Anyone
  who needs a linked root has to make it a real directory. Both halves have a test;
  the resolving one is the contested half and was pinned by nothing at first.

### Closed, and how (do not re-derive these from an older copy of this file)

Residuals this section once carried as open, and the item that closed each. **Two
kinds, and they are not interchangeable.** Two are **dispatch** residuals, closed by
`NCPDP-PHI-SCAN-CONTENT-RESIDUALS` (which scanner a payload earns); one is an
**enumeration** residual, closed by `PHI-SCAN-SYMLINK-BLIND-ON-BOTH-ROUTES` (whether
the entry is looked at at all). Each was verified red on the commit named in its own
bullet before any fix existed, and each has a pinning test in
`test/scripts/phi-scan.test.ts`. **Read each strike-through against the bound stated
in its own bullet, not as a general claim about the gate.**

The two DISPATCH entries were **verified red on `e1d9a34`**, and that change was
measured a strict superset over 216 base-vs-head probes (payload shape x extension):
**0 hit locations lost, no exit code 1 -> 0, 42 probes strictly gained**, with the
committed corpus unchanged at 120 files / 0 hits. They close wherever the two content
tests AGREE about a payload, and each owns one of those
classes: the union covers a payload both tests claim (a well-formed SCRIPT document),
the case fold covers a payload both decline, which is every payload the fallback
governs. The cross case, where one content test claims a payload and the other cannot,
is open and is in the list above: a
`.xml` fragment plus a stray separator still scores 0, on `e1d9a34` and after. A
strike-through here is a measurement, not a slogan, and this document has twice been
wrong by reading wider than what was run.

- **~~One stray separator byte downgrades a whole SCRIPT document.~~** Telecom was
  tested _instead of_ SCRIPT rather than alongside it, so a file satisfying BOTH
  content tests went to the Telecom tokenizer, which finds no field ids in an XML
  document. Measured on `e1d9a34`: a complete, well-formed prescription carrying
  `<LastName>`, `<FirstName>`, `<DateOfBirth>` and an `<AddressLine1>` plus a single
  `0x1C` inside a `<Note>` scored **0 hits at every extension, `.xml` included**, and
  the gate printed `OK`; the identical document without that byte scored 4 at every
  extension. **Fixed as a UNION, not a flipped precedence:** a payload that signals
  both formats is scanned by both, in the order telecom-then-script. Flipping the
  order would only have moved the hole (a Telecom transmission inside an XML envelope
  would have lost its field-id scan), which is the direction the second pinning test
  covers. The union hands no target a scanner its own content did not signal, so it
  buys the catch without widening the false-positive surface. The cross-cutting shape
  pass moved up into `scanTarget` at the same time, so a two-scanner target reports
  each dashed SSN once rather than twice.

- **~~A symlink under a scan root is skipped by the full walk, and its target path
  is what `--staged` scans.~~** Closed by `PHI-SCAN-SYMLINK-BLIND-ON-BOTH-ROUTES`,
  and it was **both** enumerating routes rather than one. Measured on `6c901e8`
  with a name-bearing synthetic SCRIPT payload written outside the scan roots and a
  link to it at `test/fixtures/script/leak.xml`: all mode printed
  `OK: no hits (2 file(s) scanned)` and exited **0**; `--staged` printed
  `OK: no hits (1 file(s) scanned)` and exited **0** after `git add`; naming the
  link explicitly exited **1** with both name hits. The payload was always
  detectable. Two mechanisms: `walk()` enumerates `Dirent.isFile()`, an lstat
  answer, so a link is neither a file nor a directory and fell out of the loop with
  no branch of its own (`isDirectory()` is false for a **linked directory** too, so
  a whole subtree went the same way); and `git show :<path>` hands back a link's
  **target path text** under mode `120000`, which is what the pre-commit route
  scanned.

  **Neither route follows the link.** Following would read bytes the enumeration
  does not control (outside the repo, a loop, a device, a FIFO that blocks the gate
  forever), and git does not carry those bytes anyway. The **enumeration** is
  narrowed instead: an in-scope entry that is not a regular file **refuses**
  (exit 2), naming **every** offender by its own repo-relative path plus a token
  from a closed engine-owned set. **A refusal never echoes the link target**, which
  is working-tree text that can itself carry PHI; a test asserts that, with the
  synthetic surname in the target filename so the assertion is observable.
  `--staged` now reads `git diff --cached --raw -z` so the destination mode is
  visible, refuses anything that is not `100644`/`100755`, and refuses an
  unparseable `--raw` record rather than scanning a list that may be short.

  **The refusal boundary is `isUnderScanRoot`, on both routes**, a deliberate
  half-step away from `isScannable`: the `.md` exemption inside `isScannable` is a
  judgement about a file whose BYTES could have been read, and a link's NAME is no
  evidence about the other side. Using one predicate for both jobs made the routes
  disagree about exactly one entry -- measured on a link named
  `test/fixtures/script/notes.md`, all mode refused (exit 2) while `--staged`
  printed `OK: no hits (1 file(s) scanned)` and exited 0. Neither route's own path
  scope moved: the walk still starts at `SCAN_ROOTS` and still exempts a gitignored
  entry, and `--staged` still READS only what `isScannable` admits. Two things are
  deliberately **not** covered: explicit-paths mode still reads through a link, and
  a gitlink is refused only where the path scope reaches it (`test/fixtures/nested`
  yes, a repo-root entry no).

  **The gitignore exemption rests on a git DEFAULT, and that is now pinned.**
  `git check-ignore` is index-aware, so a TRACKED path is not reported as ignored
  even when a pattern matches it, which is the only reason `git add -f` on an
  ignored link cannot buy a bypass. Adding `--no-index` to that call, or a git
  default change, would reopen the hole on the walk with nothing else going red. A
  test force-adds an ignored symlink and asserts the refusal.

  **Do NOT copy the sibling scanner's account of this.** The port reference
  (`terminology`) had to add `T` to `--diff-filter=AM` because an allow-list of
  status letters deleted the typechange record before any mode could be read. This
  repo already used `--diff-filter=d`; re-measured on git 2.39.5, replacing a
  tracked regular file with a link emits `:100644 120000 <sha> <sha> T` under `d`
  and **nothing at all** under `AM`, so the mode check is reachable here for an
  already-tracked path and no filter change was needed. Its other disclosed
  residual does not transfer either: `R`/`C` are not enumerated by its `--staged`,
  whereas `--no-renames` here **decomposes** a rename into `D` + `A` and the
  destination is scanned (pinned by an existing test). 11 of the 16 new cases were
  measured red on `6c901e8`; the 5 that stayed green are named individually rather
  than counted, because a label is not a category: the gitignore exemption, a corpus
  of ordinary regular files, a staged regular file still scanned and caught, a
  staged regular markdown file still not read, and the package-identity control.

- **~~The extension fallback matches case-sensitively.~~** Measured on `e1d9a34`: a
  `.xml` fragment scored 1 hit and `.XML` / `.Xml` scored 0; a separator-less
  `.ncpdp` field token scored 1 and `.NCPDP` scored 0. The fallback now folds case,
  exactly as `isScannable`'s own `.md` test already did. **The arm itself was not
  removed to close this** - it is what keeps a `.xml` fragment fixture and a
  separator-less `.ncpdp` token structurally scanned, and removing it would have made
  the change a trade instead of a superset.

## Format

Each entry is a markdown subsection:

```
### <path>

- **Date:** <YYYY-MM-DD>
- **Reason:** <one-line justification>
- **Approved by:** <committer name>
- **Expires:** <YYYY-MM-DD or "permanent">
```

## Entries

(none yet)
