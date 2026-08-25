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
- **An unmodeled SCRIPT transaction does not survive a parse-then-emit round trip, and never did.**
  Only the modeled transactions have a body model, so serializing an `unsupported` body emits an
  empty element: every child it carried is dropped. Where the element name was one of the names above
  it is reproduced; where it was not, the emitted tag is the fixed placeholder
  `<UnsupportedTransaction/>`, so two different unrecognized extensions emit identically. Do not
  relay an unmodeled transaction through this library: read the original bytes instead.
- **Whole-message only.** Emit is not streaming, and only the first transaction of a multi-transaction
  Telecom transmission is decoded (the remainder is preserved and flagged
  `NCPDP_TELECOM_MULTI_TRANSACTION_TRUNCATED`).

## Version / decode boundaries

- **Telecom: vD.0 only.** Only the vD.0 fixed offsets are decoded. An **F6** stamp is _recognized but
  not decoded_ (its header layout differs) and surfaced via `NCPDP_TELECOM_VF6_NOT_DECODED`; any other
  stamp is `NCPDP_TELECOM_UNSUPPORTED_VERSION`. A separator is never guessed
  (`NCPDP_TELECOM_INVALID_FRAMING`).
- **SCRIPT: the XML era only** (`v2017071` / `v2023011`). A pre-XML legacy SCRIPT version is refused
  with `NCPDP_SCRIPT_UNSUPPORTED_VERSION`, never mis-mapped onto the XML field model.
- **Prior authorization is presence, not adjudication**: the library reports that a PA segment was
  submitted and echoes its type/number; it never decides whether a PA is valid or honored.
- **Codes are surfaced verbatim, and a label ships only where a public artifact establishes it.**
  The wire code is always returned as-is; a code the library does not recognize is kept with
  `known: false` + an `…_UNKNOWN_…` warning, and never dropped. A human-readable label ships only
  when a publicly-available artifact establishes the mapping and that artifact is cited in source
  beside the table, with its retrieval date. Where no such artifact could be obtained, there is no
  table and no label: the code alone is what you get. This is deliberate, and it is narrower than it
  used to be: labels that no artifact established were withdrawn rather than left in place. See
  licensing below for why the obvious source cannot be used.

  <!-- The table below is machine-checked against the exported surface by
       test/telecom/vocab-provenance.test.ts: a row that disagrees with what the package exports
       fails the test run, in either direction. Edit the code and this table together. -->

  | Wire field                           | Label table ships? | Export                | Establishing artifact                                                                                                                                                                                                                                                                                           |
  | ------------------------------------ | ------------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 439-E4 Reason For Service Code (DUR) | yes                | `DUR_REASON_MEANINGS` | eMedNY ProDUR/ECCA Provider Manual v1.30 (New York State Department of Health, revised 2010-02-12), retrieved 2026-08-25. **Single-source**, and a claim about one state Medicaid payer rather than about the standard. 7 of the 8 values it states ship; the eighth names a code this package does not decode. |
  | 511-FB Reject Code                   | no                 | none                  | None obtainable. Eleven labels were withdrawn, and every reject code now reads `known: false`.                                                                                                                                                                                                                  |
  | 112-AN Transaction Response Status   | no                 | none                  | None obtainable. Seven descriptions were withdrawn; the status still resolves to a `disposition`, which is this library's own fail-safe vocabulary and not a decoded label.                                                                                                                                     |
  | 436-E1 Product/Service ID Qualifier  | no                 | none                  | None obtainable. Four labels were withdrawn, and `qualifierMeaning` no longer appears on a product or a compound ingredient.                                                                                                                                                                                    |

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
The license-clean route is a public payer publication, paraphrased and cited: that route reached one
of the four fields, and the caveat on it is real, not boilerplate. One payer's manual is evidence
about that payer. Where the route reached nothing, the label is gone rather than guessed, because on a
claim-adjudication surface an unsourced label is worse than no label.

## Conformance testing: no external-oracle differential corpus (by design)

Unlike the other cosyte parsers, `@cosyte/ncpdp` runs **no differential test against a third-party
reference implementation**. That exclusion is a direct consequence of the licensing posture above. A
differential corpus would require redistributing NCPDP-derived material we are not licensed to ship.
Conformance instead rests on: the three-tier **synthetic** corpus (spec-clean → vendor-quirk →
round-trip goldens), the `@cosyte/test-utils` property invariants (lenient never-throw, round-trip,
immutability, warning-code stability), and a nightly amplified fuzz job (Telecom byte tokenizer +
SCRIPT XML XXE/entity-expansion). **Do not assume byte-for-byte agreement with any specific vendor or
switch implementation.**

## Published, still pre-alpha

The package is **published on npm** and public, but it sits on the `0.0.x`-until-first-alpha
ladder: treat the API as pre-alpha and expect it to move before first alpha. The SCRIPT side takes
one vetted runtime dependency (`fast-xml-parser`, XXE-safe by construction); the Telecom side is
zero-dependency.

---

For the full decoded surface and the exact fields each helper reads, see the package
[`README.md`](./README.md), the [Cookbook](./docs-content/cookbook.md), and the
`docs-content/spec-notes-*.md` set.
