---
id: limitations
title: Limitations and non-goals
sidebar_label: Limitations
description: "What @cosyte/ncpdp does not do, by design: the boundaries of reading, writing, code labels and conformance, each with what a caller does instead."
---

# Limitations and non-goals

This is the one list of what `@cosyte/ncpdp` does not do. Each entry is a documented, intentional
boundary, not a bug. Where a limitation applies, the lenient parser keeps the raw value, usually
with a stable warning, and does not decode it further. Read this list as the "do not over-trust"
list for a pharmacy claims surface, where a misread drug, dose, reject or coverage decision does
real harm.

Which versions are decoded, and until when, is stated once, in the
[Conformance statement](./conformance.md), and not here.

## Scope

- **EPCS is out of scope.** Electronic Prescribing of Controlled Substances needs DEA-regulated
  digital-signature verification, HSM integration and its own audit posture. The package performs
  no signature validation and asserts nothing about a controlled-substance prescription's legal
  validity.
- **No transport.** Surescripts and PBM connectivity, retries and acknowledgement transport are
  out of scope. This is a parser, serializer and builder, not a communications stack.
- **Whole message only, no streaming.** Both parsers read a complete message and the emit side
  builds a complete message in memory. There is no incremental API in either direction.
- **No `strict` mode.** The model is lenient with warnings. A mode that escalates every tolerated
  deviation to a thrown error is not shipped.

## Reading

- **Telecom: a version stamp outside the decoded set is never read against the wrong offsets.** An
  `F6` stamp on a request is recognized but not decoded (`NCPDP_TELECOM_VF6_NOT_DECODED`): the
  bytes are kept and no positional field is lifted. The same stamp on a response is refused
  (`NCPDP_TELECOM_UNSUPPORTED_VERSION`), because a response leads with its Version/Release. A
  separator is never guessed (`NCPDP_TELECOM_INVALID_FRAMING`). The outcome per direction is in
  the [Conformance statement](./conformance.md).
- **SCRIPT decodes the XML-era standard.** A pre-XML legacy version is refused with
  `NCPDP_SCRIPT_UNSUPPORTED_VERSION`, never mapped onto the XML field model.
- **Transmission-level segments are found by position.** The segments before the first Group
  Separator are read as the transmission level and are never counted as a transaction; a body with
  no Group Separator is read as one transaction. A sender that writes its first transaction without
  the separator and a later one with it has that first group read as transmission-level segments,
  and `NCPDP_TELECOM_TRANSACTION_COUNT_MISMATCH` says so.
- **No maximum transaction count is enforced.** The declared count (109-A9) is surfaced on
  `transactionCount` beside the number decoded on `decodedTransactionCount`; a disagreement
  raises the count-mismatch warning and every decoded transaction stays exposed. No public
  artifact establishing a maximum could be read, so the package does not call a count illegal.
- **Prior authorization is presence, not adjudication.** The package reports that a PA segment
  was submitted and echoes its type and number. It never decides whether a PA is valid or honored.
- **A diagnostic tells you where, not what.** Messages come from a frozen registry by code and
  never quote the input, and a position is an XPath or byte offset built only from recognized
  names. To see the offending bytes, go to the input you already hold. Two bounds follow:
  `segment.segmentId` is two characters or empty, so an `AM` field carrying anything else stays in
  `segment.fields` under `NCPDP_TELECOM_MALFORMED_SEGMENT_ID`; and an unmodeled SCRIPT transaction
  is named only when its element name is in `SCRIPT_TRANSACTION_NAMES`, the vocabulary published
  in 42 CFR 423.160, so any other is surfaced unnamed.
- **Profiles are descriptive, not transformative.** A trading-partner profile surfaces
  `msg.profile` or `tx.profile` and powers `partitionWarnings`, but never alters the parse.

## The structured SIG

- **Decode-only and lossy.** The free-text `SigText` is the source of truth and is kept verbatim.
  The structured `<Sig>` view is additive, every field carries its provenance (`coded`, `derived`
  or `absent`), and any decode raises `NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY`. An absent field is never
  inferred from the free text, and an ambiguous dose is `absent` with
  `NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE`.
- **No SIG generation and no natural-language parsing.** The package does not build a SIG from
  structure and does not parse arbitrary directions. The builder emits the SIG it is given.
- **Five components cannot decode.** A component is read only where its XML element name traces to
  a published field label for that component. `doseUnitOfMeasure`, `duration`, `vehicle`,
  `indication` and `maximumDoseRestriction` have no such name and always report `absent`. A
  message that used one of ten earlier-matched element names (`Dose`, `DoseUnitOfMeasure`,
  `RouteOfAdministration`, `SiteOfAdministration`, `TimingAndDuration`, `Frequency`, `Duration`,
  `Vehicle`, `Indication`, `MaximumDoseRestriction`) now decodes that component `absent`, and a
  `<Sig>` whose only structure used them reports `hasStructuredData` false. The grounding table is
  in [Structured SIG decode](./spec-notes-structured-sig.md).
- **Recognized-name tolerance is an approximation** of the gated implementation guide nesting.
- **No terminology lookup.** Route, site and unit codes carry their claimed system and are not
  validated or expanded against SNOMED CT or NCI.

## Writing

- **Telecom emit is one transaction per transmission.** A model holding more than one decoded
  transaction is refused with `NcpdpTelecomBuildError`
  `NCPDP_TELECOM_BUILD_MULTI_TRANSACTION_EMIT`, and the later transactions are never dropped
  silently. Serialize one transaction at a time; a transmission-level segment alongside one
  transaction is written, not refused.
- **The Telecom builder writes no transmission-level segments.** `buildTelecomRequest` puts every
  segment it is given in one transaction, so its output has no Group Separator.
- **An unmodeled SCRIPT transaction cannot be emitted.** `serializeScript` and
  `ScriptMessage#toString()` throw `NcpdpScriptBuildError`
  `NCPDP_SCRIPT_BUILD_UNSUPPORTED_TRANSACTION`, including from a template literal or a log line.
  Branch on `message.body.kind === "unsupported"` and relay the original bytes. Reading still
  works and raises `NCPDP_SCRIPT_UNSUPPORTED_TRANSACTION`.
- **Fields the parser does not model are not reproduced.** Serializing reflects the model, not
  the original document.

## Code labels

- **A label ships only where a public artifact establishes it.** Wire codes are always returned
  as received; a code the package does not recognize is kept with `known: false` and an
  `..._UNKNOWN_...` warning. A label ships only when a public artifact establishes the mapping and
  is cited in source beside the table, with its retrieval date. Labels that no carried artifact
  established were withdrawn, and so were partial tables, because a table that recognizes some
  codes and not others is harder to read correctly than none.
- **Per field.** The 439-E4 Reason For Service (DUR) table ships, single-sourced to one state
  Medicaid payer manual. No table ships for 511-FB Reject Code, 112-AN Transaction Response
  Status or 436-E1 Product/Service ID Qualifier, and none has ever shipped for 440-E5
  Professional Service Code or 441-E6 Result Of Service Code. A product or compound ingredient
  carries no `qualifierMeaning`. The SCRIPT side bundles no table for `<Code>`,
  `<DescriptionCode>` or `<Description>`. The sources, the retrieval dates and the machine-checked
  table are in
  [`KNOWN-LIMITATIONS.md`](https://github.com/cosyte/ncpdp/blob/main/KNOWN-LIMITATIONS.md) at the
  repository root.
- **The Segment Identification (111-AM) inventory declares wider ranges than it names.**
  `SEGMENT_CODE_RANGES` are this package's own claim of coverage and their bounds are not
  established (`boundsVerified` is `false`). `SEGMENT_NAMES` names the codes a public artifact
  establishes, and `SEGMENT_ABSENCES` records each remaining code inside a range with the reason
  `"unsourced"`. None of this changes a decode: an unnamed code is kept verbatim with
  `NCPDP_TELECOM_UNKNOWN_SEGMENT`.
- **No redistributed NCPDP prose.** NCPDP charges for its standards documents. The package parses
  the wire format, and its labels are paraphrases or widely known terminology, never text lifted
  from an NCPDP document. Recognized code systems (NDC, RxNorm, and SNOMED CT through the wire
  qualifier) are widely known identifiers and are the exception to "no lookup".

## Conformance

- **No differential test against a reference implementation.** The licensing posture above rules
  out the corpus a differential test needs. Conformance rests on synthetic fixtures, property
  invariants and a nightly fuzz job, not on an oracle. Do not assume byte-for-byte agreement with
  any vendor or switch, and validate against your own trading partner before trusting a
  production interface. The statement per wire format is in the
  [Conformance statement](./conformance.md).

## Next

- [Troubleshooting](./troubleshooting.md): the symptoms these boundaries show up as, and what to do.
- [How the parser reads safely](./fail-safe-reading.md): why the boundaries sit where they do.
- [Diagnostic codes](./diagnostic-codes.md): every code named above.
