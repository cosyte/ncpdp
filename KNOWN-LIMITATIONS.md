# Known limitations & non-goals

`@cosyte/ncpdp` is built to be **correct and honest about its edges** rather than to claim more than it
delivers. Misreading a dispensed drug, a dose, a reject, or a coverage decision can cause real
financial or clinical harm, so this is the deliberate "do not over-trust" list. Everything here is a
documented, intentional boundary, not a bug. The lenient parser never silently drops or garbles data:
where a limitation applies, the raw value is preserved (usually with a stable warning), it is simply
not further decoded.

## Explicit non-goals

- **EPCS is out of scope (v1).** Electronic Prescribing of Controlled Substances requires
  DEA-regulated digital-signature verification, HSM integration, and a separate audit/certification
  posture. It belongs in a dedicated package (`@cosyte/ncpdp-epcs`), not here. This library parses and
  emits SCRIPT/Telecom structure; it performs **no** signature validation and asserts **nothing** about
  a controlled-substance prescription's legal validity.
- **The structured SIG decode is best-effort and explicitly lossy.** The free-text `SigText` is the
  **source of truth** and is always preserved verbatim; the structured `<Sig>` view is additive and
  every field is provenance-tagged (`coded` / `derived` / `absent`). An absent field is never inferred
  from the free text, an ambiguous dose is surfaced as `absent` (never guessed) with a
  `NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE` warning, and any decode flags `NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY`.
  The library does **not** generate a SIG from structure, and does **not** parse arbitrary
  natural-language directions. See `docs-content/spec-notes-structured-sig.md`.
- **Five structured-SIG components can no longer decode at all, and that is deliberate.** A component
  is read only where its XML element name can be traced to a published field label denoting that same
  component. `doseUnitOfMeasure`, `duration`, `vehicle`, `indication` and `maximumDoseRestriction` have
  no such name, so **they always report `absent`**, whatever the message carried. Ten element names
  that a previous release matched on were removed for the same reason (`Dose`, `DoseUnitOfMeasure`,
  `RouteOfAdministration`, `SiteOfAdministration`, `TimingAndDuration`, `Frequency`, `Duration`,
  `Vehicle`, `Indication`, `MaximumDoseRestriction`): **a message that used one of those names now
  decodes that component `absent` where it previously returned a value**, and a `<Sig>` whose only
  structure used them now reports `hasStructuredData` false and raises no
  `NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY`. Nothing was added or re-spelled to compensate. This is a
  narrowing in the fail-safe direction: an ungrounded name that matched the wrong element would hand a
  consumer a confidently coded wrong dose, and a wrong field position is a wrong dispense. The full
  per-component grounding table, the artifact behind each surviving name and the assumption it rests
  on are in `docs-content/spec-notes-structured-sig.md`. `sigText` is unaffected and still carries the
  directions verbatim.
- **No transport.** Surescripts / PBM connectivity, retries, and acknowledgement transport are out of
  scope. This is a parser/serializer/builder, not a communications stack.
- **A diagnostic tells you where, not what.** Warning and error messages are looked up by code in a
  frozen registry, so they never quote the input, and a position is an XPath or a byte offset built
  only from names the library recognizes. That is what makes `.warnings` safe to log whole, and it is
  the trade: to see the offending bytes you go to the input, which you already hold. Two knock-on
  bounds follow. `segment.segmentId` is two characters or empty, so an `AM` field carrying anything
  else stays in `segment.fields` (verbatim, nothing dropped) under
  `NCPDP_TELECOM_MALFORMED_SEGMENT_ID` rather than becoming the segment id; the builder refuses the
  same shape on emit. And an unmodeled SCRIPT transaction is named only when its element name is in
  `SCRIPT_TRANSACTION_NAMES`, the vocabulary published in 42 CFR 423.160, so a transaction the
  standard defines but that regulation does not name, and any vendor extension, is surfaced unnamed.
- **An unmodeled SCRIPT transaction cannot be emitted, and emit now says so instead of guessing.**
  Only the modeled transactions have a body model, so there is nothing under an `unsupported` body
  for the serializer to reproduce. Rather than write a well-formed, re-parseable document whose
  transaction body has been deleted, **every emit route refuses**: `serializeScript(message)` and
  `ScriptMessage#toString()` both throw `NcpdpScriptBuildError` with
  `NCPDP_SCRIPT_BUILD_UNSUPPORTED_TRANSACTION` and return no string. The error carries the code and
  the frozen registry sentence for it, and quotes nothing from the document.
  **What to do instead.** Branch before you emit: `message.body.kind === "unsupported"` is public,
  typed and never throws, so a relay can test for it and fall back to forwarding the **original
  bytes**, which are the only faithful representation this library can offer for a transaction it
  does not model. Reading is unaffected: the message still parses, still carries
  `NCPDP_SCRIPT_UNSUPPORTED_TRANSACTION` at the body, and every modeled transaction serializes
  exactly as before.
  **Changed behaviour, and where it can surface.** In earlier releases emit returned a document
  with an empty transaction element: the element name where it was one of the names above,
  and a fixed `<UnsupportedTransaction/>` placeholder where it was not, which made two different
  unrecognized extensions emit identically. That placeholder is deleted rather than replaced. Because
  `toString()` is the message object's own string conversion, the refusal can surface from an
  implicit coercion (a template literal, string concatenation, a log line) where the calling code
  contains no visible serialize call.
- **Whole-message only.** Emit is not streaming, and only the first transaction of a multi-transaction
  Telecom transmission is decoded (the remainder is preserved and flagged
  `NCPDP_TELECOM_MULTI_TRANSACTION_TRUNCATED`).

## Version / decode boundaries

- **Which versions are decoded, and until when, is one document.** The version this package decodes
  on each wire format, the public section that adopts it, the date that adoption ends, and the
  recognized-but-not-decoded stamp are stated once in the
  [conformance statement](./docs-content/conformance.md) and are deliberately not restated here, so
  the two cannot drift apart. What belongs on this page is the behaviour at the boundary, below.
- **Telecom: a stamp outside the decoded set is never read against the wrong offsets.** In a
  **request**, an **F6** stamp is _recognized but not decoded_ (its header layout differs) and
  surfaced via `NCPDP_TELECOM_VF6_NOT_DECODED` with every positional field empty. **A response
  carrying that stamp is refused, not warned**: a response leads with its Version/Release, which is
  not where this reader looks for the stamp, so it is `NCPDP_TELECOM_UNSUPPORTED_VERSION` like any
  other unrecognized stamp. The [conformance statement](./docs-content/conformance.md) states that
  outcome per direction; do not plan an F6 cutover around a graceful degrade on the response leg. A
  separator is never guessed (`NCPDP_TELECOM_INVALID_FRAMING`).
- **SCRIPT: a pre-XML legacy version is refused**, with `NCPDP_SCRIPT_UNSUPPORTED_VERSION`, never
  mis-mapped onto the XML field model.
- **Prior authorization is presence, not adjudication**: the library reports that a PA segment was
  submitted and echoes its type/number; it never decides whether a PA is valid or honored.
- **Codes are surfaced verbatim, and a label ships only where a public artifact establishes it.**
  The wire code is always returned as-is; a code the library does not recognize is kept with
  `known: false` + an `…_UNKNOWN_…` warning, and never dropped. A human-readable label ships only
  when a publicly-available artifact establishes the mapping and that artifact is cited in source
  beside the table, with its retrieval date. Where no such artifact could be obtained, there is no
  table and no label: the code alone is what you get. This is deliberate, and it is narrower than it
  used to be. Labels the carried corpus did not establish were withdrawn rather than left in place,
  and where it established only part of a field's vocabulary the partial table was withdrawn too: a
  table that recognizes some of a field's codes and not others is harder to read correctly than no
  table at all. See licensing below for why the obvious source cannot be used.

  <!-- The table below is machine-checked against the exported surface by
       test/telecom/vocab-provenance.test.ts: a row that disagrees with what the package exports
       fails the test run, in either direction. Edit the code and this table together. -->

  | Wire field                           | Label table ships? | Export                | Establishing artifact                                                                                                                                                                                                                                                                                                                                                                                                                           |
  | ------------------------------------ | ------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 439-E4 Reason For Service Code (DUR) | yes                | `DUR_REASON_MEANINGS` | eMedNY ProDUR/ECCA Provider Manual v1.30 (New York State Department of Health, revised 2010-02-12), retrieved 2026-08-25. **Single-source**, and a claim about one state Medicaid payer rather than about the standard. 7 of the 8 values it states ship; the eighth names a code this package does not decode.                                                                                                                                 |
  | 511-FB Reject Code                   | no                 | none                  | Not shipped, and not for want of a document: the carried eMedNY manual's section 16.0 is a 52-row reject-code table, with seven of the eleven withdrawn labels among its rows (25, 41, 65, 70, 75, 76, 88) and four absent from it (54, 79, AG, M1). Sourcing it would recognize seven of eleven and leave four unknown, so the whole table went instead. Every reject code now reads `known: false`. Reasoning in `src/telecom/response.ts`.   |
  | 112-AN Transaction Response Status   | no                 | none                  | No value-set artifact. The carried manual states only that this payer returns `C` for an accepted or pending claim and `R` for a rejected one: two of the seven values this parser models, nothing about the other five. Seven descriptions were withdrawn; the status still resolves to a `disposition`, which is this library's own fail-safe vocabulary and not a decoded label.                                                             |
  | 436-E1 Product/Service ID Qualifier  | no                 | none                  | No value-set artifact. The carried manual does state two values for this field, `03` for a national drug code and `09` for a HCPCS-coded supply item, leaving `00`, `01` and `02` with nothing and naming one code this package does not decode. A one-row table sourced to one payer's billing instructions was not worth the surface, so all four labels went and `qualifierMeaning` no longer appears on a product or a compound ingredient. |

  Two other Telecom code lists, 440-E5 Professional Service Code and 441-E6 Result Of Service Code,
  have never had a table here and still do not. The SCRIPT side bundles no code-to-meaning table for
  `<Code>` / `<DescriptionCode>` / `<Description>` either.

## Standards-licensing posture: no redistributed NCPDP prose

NCPDP charges for its standards documents and is more protective of that copyright than HL7. This
package **does not redistribute NCPDP-copyrighted text**: the wire _format_ is parsed, but field-name
labels and any code descriptions in the code are paraphrased / widely-known industry terminology, never
lifted verbatim from an NCPDP PDF. Do not paste NCPDP spec prose into JSDoc, README, comments, or
fixtures.

This is also why the table above is mostly empty. The normative vocabulary for these fields is the
NCPDP External Code List, which is a purchased product this package can neither cite nor redistribute.
The license-clean route is a public payer publication, paraphrased and cited: one such manual was
carried, and it establishes a whole field's stated value set for exactly one of the four. One payer's
manual is evidence about that payer, so the caveat on the table that did ship is real, not
boilerplate. Where the route reached nothing, or reached only part of a field, the label is gone
rather than guessed: on a claim-adjudication surface an unsourced label, or a table that recognizes
some of a field's codes and not others, is worse than no label.

## Conformance testing: no external-oracle differential corpus (by design)

Unlike the other cosyte parsers, `@cosyte/ncpdp` runs **no differential test against a third-party
reference implementation**. That exclusion is a direct consequence of the licensing posture above. A
differential corpus would require redistributing NCPDP-derived material we are not licensed to ship.
Conformance instead rests on: the three-tier **synthetic** corpus (spec-clean → vendor-quirk →
round-trip goldens), the `@cosyte/test-utils` property invariants (lenient never-throw, round-trip,
immutability, warning-code stability), and a nightly amplified fuzz job (Telecom byte tokenizer +
SCRIPT XML XXE/entity-expansion). **Do not assume byte-for-byte agreement with any specific vendor or
switch implementation.**

The same absence stated per wire format, with what the NCPDP Certification Program actually
certifies and what the ONC/NIST testing tool actually targets, is in the
[conformance statement](./docs-content/conformance.md).

## Published, still pre-alpha

The package is **published on npm** and public, but it sits on the `0.0.x`-until-first-alpha
ladder: treat the API as pre-alpha and expect it to move before first alpha. The SCRIPT side takes
one vetted runtime dependency (`fast-xml-parser`, XXE-safe by construction); the Telecom side is
zero-dependency.

---

For the full decoded surface and the exact fields each helper reads, see the package
[`README.md`](./README.md), the [Cookbook](./docs-content/cookbook.md), and the
`docs-content/spec-notes-*.md` set.
