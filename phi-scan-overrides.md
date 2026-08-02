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
the gate. The enumeration gaps we currently know of are under "Documented
limitations" below; **that section is not a closed list**, and this document has
twice claimed a complete inventory of what was left and been wrong.

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

**This section is not a closed list.** It has twice been published as a complete
inventory of what was left and been wrong both times. Treat it as what is known.

- **Symlinks are not scanned.** `walk` tests `dirent.isFile()`, which is false for
  a symlink, so a symlinked fixture (or a symlinked directory under a scan root) is
  silently skipped in the full walk. An enumeration gap of exactly the kind the
  rename blind spot was: nothing in the target-set invariants can see it. Note the
  asymmetry now that `--staged` uses `--diff-filter=d`: replacing a tracked symlink
  with a regular file carrying PHI stages as `T` and **is** caught at pre-commit,
  and the resulting regular file is caught by the full walk too. It is the symlink
  itself, left as a symlink, that the full walk does not follow.
- **A one-file scan is a truthful near-empty scan.** The emptiness invariant fires
  at exactly zero, so `pnpm phi-scan <one-in-scope-file>` reports
  `OK: no hits (1 file(s) scanned)` and exits 0. That is correct behavior for an
  explicit request, and the denominator makes it legible, but CI must keep invoking
  the bare `pnpm phi-scan` (it does) rather than a path list. Paths mode also does
  not apply `isScannable`, so an explicitly named path outside the roots is
  scanned rather than refused.
- **`--staged` scans no `.md`.** `isScannable` excludes markdown in both modes. The
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

### Closed, and how (do not re-derive these from an older copy of this file)

Two residuals that this section carried as open were closed by
`NCPDP-PHI-SCAN-CONTENT-RESIDUALS`. Both were **verified red on `e1d9a34`** first, and
both now have a pinning test in `test/scripts/phi-scan.test.ts`; the whole change was
measured a strict superset over 216 base-vs-head probes (payload shape x extension):
**0 hit locations lost, no exit code 1 -> 0, 42 probes strictly gained**, with the
committed corpus unchanged at 120 files / 0 hits.

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
