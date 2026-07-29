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
both). Format is detected content-first (a Telecom message carries the NCPDP
control-char separators; a SCRIPT message is XML), so a mis-extensioned fixture is
still scanned rather than silently downgraded to the text-only pass. Hand-written
code under `src/` and `scripts/` is never parsed structurally, even when a file
embeds an example message in a JSDoc `@example`; it gets the conservative
dashed-SSN + email pass only. Under `test/` the routing is content-first rather
than absolute: a `.ts` file is text-only **in practice** (a TypeScript file does
not begin with `<` and writes the NCPDP separators as `\x1c` escapes rather than
raw bytes), but a file under `test/` that does start with `<`, or that carries a
literal `0x1C`/`0x1D`/`0x1E` byte, **is** routed structurally. That direction is
safe: all three dispatch branches also run the cross-cutting shape pass over the
full text, so structural routing only ever adds detectors, and can never suppress
a hit the text-only pass would have found.

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
  what closed that. Note the asymmetry it leaves: a `.ts` under `test/` still gets
  the conservative text pass, not the structural one, for the same reason `src/`
  does (a JSDoc `@example` carries synthetic names that must not trip the
  structural detectors). A message embedded in a `.ts` string literal is therefore
  checked for dashed SSNs and non-test emails, not for names or DOBs. Put a real
  message in a fixture file, where the structural detectors can see it.

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
