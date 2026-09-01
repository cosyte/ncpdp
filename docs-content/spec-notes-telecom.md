---
id: spec-notes-telecom
title: "Spec notes: Telecom foundation + B1 request read"
sidebar_label: Telecom foundation & B1
description: "What the Telecom reader decodes: the framing, the fixed Transaction Header, the segments and fields it names, and the safety rules around them."
---

# Spec notes: Telecom foundation + B1 request read

These notes record exactly what the `@cosyte/ncpdp/telecom` reader decodes, where the structural facts
come from, and what it deliberately does **not** do. **No NCPDP-copyrighted prose is reproduced
here.** Field/segment labels below are our own short paraphrases; the codes and field-number
designators are factual identifiers from the NCPDP Telecommunication Standard vD.0 and the NCPDP Data
Dictionary (paywalled), recorded against our own paraphrased names.

## What the reader decodes

Reads a Telecommunication transmission: the fixed Transaction Header, the control-character-framed
variable segments, and a B1/B2/B3 **request** view over the safety-relevant fields. Liberal on parse
(quirks become stable-coded warnings with byte-offset context); only structurally unrecoverable input
throws a typed Telecom fatal.

**Which version that is, and until when, is not restated here.** The version this package decodes,
the public section that adopts it and the date that adoption ends are stated once in the
[Conformance statement](./conformance). What follows is the layout and behaviour of the decode
itself.

## Framing

| Control char | NCPDP designator       | Role                                         |
| ------------ | ---------------------- | -------------------------------------------- |
| `0x1C`       | FS (Field Separator)   | separates fields within a segment            |
| `0x1D`       | GS (Group Separator)   | separates transactions within a transmission |
| `0x1E`       | RS (Segment Separator) | separates segments within a transaction      |

**Every** group-separated transaction is decoded, request and response alike. Each one is a
`transactions[n]` entry carrying its own segments, its own byte offset in the raw message and the
warnings raised decoding it, so a quirk in one transaction cannot discard or re-attribute another's
data. `segments` is the first transaction's segments, kept as the one-transaction shorthand.

Each transaction is decoded independently, which is what isolates a malformed one: a transaction
whose segment carries no `AM` field, or a field token too short to hold an id, still surfaces its own
bytes verbatim under its own warnings while the transactions around it decode untouched. Nothing
about that is fatal: `parseTelecom` stays lenient.

## Fixed Transaction Header (D.0 request, 56 bytes)

Positional, no field separators. Offsets `[name, offset, length]`:

| Field                         | Designator | Offset | Length |
| ----------------------------- | ---------- | ------ | ------ |
| BIN Number                    | 101-A1     | 0      | 6      |
| Version/Release               | 102-A2     | 6      | 2      |
| Transaction Code              | 103-A3     | 8      | 2      |
| Processor Control Number      | 104-A4     | 10     | 10     |
| Transaction Count             | 109-A9     | 20     | 1      |
| Service Provider ID Qualifier | 202-B2     | 21     | 2      |
| Service Provider ID           | 201-B1     | 23     | 15     |
| Date of Service               | 401-D1     | 38     | 8      |
| Software/Certification ID     | 110-AK     | 46     | 10     |

Values are trimmed of pad whitespace; numeric leading zeros are preserved (a BIN/PCN is an identifier,
not an arithmetic quantity).

Transaction Count (109-A9) is one byte wide here, and it is surfaced **verbatim** on
`transactionCount`: never coerced to a number, never defaulted, never reconciled against what the
body carried. `decodedTransactionCount` is the number of transactions this reader actually decoded,
and the two are separate facts. When they disagree, including when the declared value is empty or is
not a number at all, `NCPDP_TELECOM_TRANSACTION_COUNT_MISMATCH` says so and every decoded transaction
is still exposed. **No maximum is enforced**: no public artifact establishing one could be read, so
this reader reports the disagreement and never calls a count illegal.

## Segments + fields modeled

Segment Identification (111-AM) codes paraphrased, every request code this package names: `01`
Patient, `02` Pharmacy Provider, `03` Prescriber, `04` Insurance, `05` COB/Other Payments, `07`
Claim, `08` DUR/PPS, `10` Compound, `11` Pricing, `12` Prior Authorization, `13` Clinical. A
2-character code outside this set is preserved verbatim on `segment.segmentId` and warned
(`NCPDP_TELECOM_UNKNOWN_SEGMENT`); only the paraphrased name is absent.

Declared 111-AM code ranges: `01` to `16` on the request side, `20` to `28` on the response side.
Those bounds are this package's own claim of coverage and nothing more. **No artifact available to
this package establishes them**, so they ship marked unverified (`SEGMENT_CODE_RANGES`, whose
`boundsVerified` is `false` on both) and should not be read as a statement about the standard.

Codes inside a declared 111-AM range that this package does not name: `06`, `09`, `14`, `15`, `16`
and `27`. Each one is published as a record in `SEGMENT_ABSENCES` with the reason `"unsourced"`,
which means no publicly readable artifact establishes what the standard defines there, so this
package neither names the code nor claims that nothing exists at it. The normative vocabulary is the
NCPDP External Code List, a purchased product this package can neither cite nor redistribute (see
the licensing note in
[`KNOWN-LIMITATIONS.md`](https://github.com/cosyte/ncpdp/blob/main/KNOWN-LIMITATIONS.md)). A hole is
therefore an accounting, never a gap in the decode: a transmission carrying one of these codes is
read in full, warned, and round-trips byte for byte, exactly like any other unnamed code.

111-AM is 2 characters wide, so an `AM` field whose value is any other length is **not** a segment
code. Rather than promote it, the reader leaves `segment.segmentId` empty, keeps the `AM` field in
`segment.fields` verbatim so no byte is lost, and warns `NCPDP_TELECOM_MALFORMED_SEGMENT_ID`. In
practice that shape means a dropped field separator has run the rest of the segment into the code,
so those bytes are claim data. A segment that does not begin with `AM` at all is
`NCPDP_TELECOM_MISSING_SEGMENT_ID`, and both round-trip byte for byte. The builder applies the same
2-character rule on emit (`NCPDP_TELECOM_BUILD_INVALID_SEGMENT_ID`).

The B1 view (`claim()`) lifts these safety-relevant field ids: `C1` Group ID, `C2` Cardholder ID, `C3`
Person Code, `C4` Date of Birth, `C5` Patient Gender Code, `D2` Rx/Service Reference Number, `EM` its
qualifier, `D3` Fill Number, `D7` Product/Service ID, `E1` Product/Service ID Qualifier, `E7` Quantity
Dispensed, `D5` Days Supply, `D8` Dispense-As-Written, `DB` Prescriber ID, `EZ` Prescriber ID
Qualifier. An unmodeled field id is still preserved verbatim. Absence of a name never means the field
is dropped.

## Safety-critical handling

- **Quantity Dispensed (442-E7)** carries an implied 3-place decimal (`9(7)v999`). It is **never**
  parsed into a float; the implied decimal is applied **string-wise** (`"30000"` → `"30.000"`) and both
  the verbatim source and the scaled value are surfaced.
- **Version safety.** The fixed offsets above are read for the decoded version and for nothing else;
  which version that is, and the dates that bound it, are in the
  [Conformance statement](./conformance). The **F6** stamp widens the leading identification field
  (8-byte IIN vs 6-byte BIN), so it is **recognized but not decoded**
  (`NCPDP_TELECOM_VF6_NOT_DECODED`) rather than read against the wrong offsets: in a **request** the
  parse succeeds, the stamp is surfaced on `header.versionRelease`, and every other positional field
  comes back empty. A **response** leads with its Version/Release, which is not where this reader
  looks for the stamp, so an F6 response is refused with `NCPDP_TELECOM_UNSUPPORTED_VERSION` rather
  than warned; the [Conformance statement](./conformance) states the outcome per direction. Any
  unrecognized stamp is `NCPDP_TELECOM_UNSUPPORTED_VERSION`.
- **Never guess framing.** A non-empty body with no FS/GS/RS bytes → `NCPDP_TELECOM_INVALID_FRAMING`.
- **Product/Service ID Qualifier (436-E1) carries no label.** The qualifier and the product id are
  both surfaced verbatim and neither is reinterpreted. No table of qualifier meanings ships, because
  no publicly-available artifact establishing the value set could be obtained: the one carried payer
  manual states two of this field's values and nothing about the rest, and a one-row table sourced to
  one payer's billing instructions was not worth the surface. `product` is `{ id, qualifier }` and
  nothing else. Absence of a meaning never means the value is invalid. Which fields do and do not
  have a label table, and on what source, is listed in
  [`KNOWN-LIMITATIONS.md`](https://github.com/cosyte/ncpdp/blob/main/KNOWN-LIMITATIONS.md).

## What the reader does NOT do

- No response (paid/rejected) decode here. The request view above covers B1/B2/B3; the payer's
  answer to any of them, and the E1 eligibility response, are read by the response side and are
  documented in [Telecom responses](./spec-notes-telecom-response).
- No compound or COB/Other-Payer detail view here. Those reads, the DUR/PPS request depth and the
  prior-authorization read are documented in
  [Compound, COB and DUR depth](./spec-notes-telecom-compound-cob).
- No serializer/builder (emit), parse only. What emit writes back, and what it refuses to write, is
  in [Serializers and builders](./spec-notes-serialize-build).
- No multi-transaction **emit**. Every transaction is read; `serializeTelecom` writes one transaction
  per transmission and refuses a model carrying more
  (`NCPDP_TELECOM_BUILD_MULTI_TRANSACTION_EMIT`) rather than dropping the rest.
- No maximum transaction count. The declared count is reported against the decoded count; a count is
  never called illegal.

## PHI

All fixtures are synthetic. Warnings and fatal errors carry only a stable code, a registry message
selected by that code, and a position (byte offset + optional 2-char field id), never a field value (cardholder id, DOB, NDC).

## Next

- [Telecom responses](./spec-notes-telecom-response): the payer's answer to any of the request
  transactions above.
- [Compound, COB and DUR depth](./spec-notes-telecom-compound-cob): the request-side reads this page
  leaves out.
- [Serializers and builders](./spec-notes-serialize-build): the emit half of the same wire layout.
- [Trading-partner profiles](./spec-notes-profiles): documenting the conventions a partner sends
  these segments under.
- [Troubleshooting and known limitations](./troubleshooting): every warning code named above, with
  what the reader did when it raised one.
