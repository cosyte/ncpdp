# phi-scan bypass log

This file logs every `--allow-fixture <path>` bypass invocation of
`scripts/phi-scan.ts`. The scanner refuses to honor a `--allow-fixture <path>`
flag UNLESS this file contains an entry referencing the same path. The committed
log is intentionally annoying — it discourages bypass and creates an audit
trail. Prefer extending `scripts/phi-allow-list.txt` (a token-level, reviewed
declaration) over a whole-file bypass.

## How the scanner detects PHI

`scripts/phi-scan.ts` covers BOTH NCPDP wire formats and is structure-aware, not
a blind text regex. It is pure Node with zero runtime deps — deliberately NOT
reusing the package's own `fast-xml-parser`, because a safety gate must be
independent of the code it guards (a shared parse bug must not be able to blind
both). Format is detected content-first (a Telecom message carries the NCPDP
control-char separators; a SCRIPT message is XML), so a mis-extensioned fixture is
still scanned rather than silently downgraded to the text-only pass. `src/` is
never parsed structurally (even when a file embeds an example message in a JSDoc
`@example`) — it gets the conservative dashed-SSN + email pass only.

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
keys off the field id, which is globally unique in the standard — so a corrupt or
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

### Cross-cutting (both formats + `src/`)

| Category | Rule                                                                    |
| -------- | ----------------------------------------------------------------------- |
| SSN      | a dashed `\d{3}-\d{2}-\d{4}` anywhere is always a hit.                  |
| Email    | an email whose domain is not an `EMAILDOMAIN` (reserved/test) is a hit. |

## Documented limitations

- **Scan scope is `test/fixtures/` + `src/`.** In every mode the scanner only walks
  the fixture tree and `src/` (and, for `--staged`, only staged paths under those
  roots); `.md` files are skipped as documentation. A real NCPDP message committed
  outside those trees (repo root, a future `examples/` / starter-kit, `docs-content/`)
  is NOT scanned. This matches the sibling parsers' design (`@cosyte/hl7` /
  `@cosyte/x12` walk the same two roots) and keeps the gate fast + false-positive
  free on prose docs — but the pre-commit / CI wiring guards the fixture corpus, not
  the whole repo. Sample messages belong under `test/fixtures/`.
- **Free-text names.** SCRIPT `<Note>` / `<SigText>` / `<Directions>` and Telecom
  free-text message fields are scanned for identifier _shapes_ (dashed SSN, email)
  but NOT for free-text personal names — a name in prose is not reliably separable
  from clinical vocabulary without NLP. A reviewer still owns clinical narrative;
  the structured name fields (the tables above) are the hard gate. Same limitation
  as `@cosyte/hl7`.
- **Common-name masking (residual, inherent).** The `NAME` allow-list contains
  common placeholder tokens the synthetic corpus uses (DOE, TEST, PATIENT, …). A
  real patient whose name is entirely common allow-listed tokens is invisible to
  the name detector — a structural consequence of a token allow-list, shared by the
  sibling parsers. The DOB / SSN / member-id / address gates remain the backstop.
- **Provider identifiers (NPI / DEA) are not gated.** A pharmacy / prescriber NPI
  (SCRIPT `<NPI>`, Telecom 201-B1 / 411-DB) is an organizational routing id, not a
  patient identifier, and is not flagged — matching `@cosyte/hl7`'s treatment of
  routing metadata. Patient / cardholder ids ARE gated.
- **Telecom header positional fields.** The fixed routing header (BIN, PCN, service
  provider id, date of service) is not decoded — it carries no patient PHI. The
  patient DOB (304-C4) lives in the field-id-keyed Patient segment and IS detected.
- **Alphanumeric member ids.** A bare numeric member id is flagged (the real shape);
  a real but _alphanumeric_ member id is indistinguishable from a synthetic prefixed
  id and is not flagged — the name / DOB / SSN gates are the backstop.
- **Phone `555` accept rule.** A ≥10-digit number containing `555` anywhere is
  treated as the fictional-exchange convention and accepted — matching the sibling
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
