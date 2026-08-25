---
id: spec-notes-telecom
title: "Spec notes: Telecom foundation + B1 request read"
sidebar_label: Telecom foundation & B1
---

# Spec notes: Telecom foundation + B1 request read

These notes record exactly what the `@cosyte/ncpdp/telecom` reader decodes, where the structural facts
come from, and what it deliberately does **not** do. **No NCPDP-copyrighted prose is reproduced
here.** Field/segment labels below are our own short paraphrases; the codes and field-number
designators are factual identifiers from the NCPDP Telecommunication Standard vD.0 and the NCPDP Data
Dictionary (paywalled), recorded against our own paraphrased names.

## What the reader decodes

Reads a vD.0 Telecommunication transmission: the fixed Transaction Header, the control-character-framed
variable segments, and a B1/B2/B3 **request** view over the safety-relevant fields. Liberal on parse
(quirks become stable-coded warnings with byte-offset context); only structurally unrecoverable input
throws a typed Telecom fatal.

## Framing

| Control char | NCPDP designator | Role |
|---|---|---|
| `0x1C` | FS (Field Separator) | separates fields within a segment |
| `0x1D` | GS (Group Separator) | separates transactions within a transmission |
| `0x1E` | RS (Segment Separator) | separates segments within a transaction |

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

| Field | Designator | Offset | Length |
|---|---|---|---|
| BIN Number | 101-A1 | 0 | 6 |
| Version/Release | 102-A2 | 6 | 2 |
| Transaction Code | 103-A3 | 8 | 2 |
| Processor Control Number | 104-A4 | 10 | 10 |
| Transaction Count | 109-A9 | 20 | 1 |
| Service Provider ID Qualifier | 202-B2 | 21 | 2 |
| Service Provider ID | 201-B1 | 23 | 15 |
| Date of Service | 401-D1 | 38 | 8 |
| Software/Certification ID | 110-AK | 46 | 10 |

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

Segment Identification (111-AM) codes paraphrased: `01` Patient, `02` Pharmacy Provider, `03`
Prescriber, `04` Insurance, `05` COB/Other Payments, `07` Claim, `08` DUR/PPS, `10` Compound, `11`
Pricing, `13` Clinical. A 2-character code outside this set is preserved verbatim on
`segment.segmentId` and warned (`NCPDP_TELECOM_UNKNOWN_SEGMENT`); only the paraphrased name is
absent.

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
- **Version safety.** Only D.0 is decoded against the fixed offsets. The **F6** stamp widens the leading
  identification field (8-byte IIN vs 6-byte BIN), so it is **recognized but not decoded**
  (`NCPDP_TELECOM_VF6_NOT_DECODED`) rather than read against the wrong offsets. Any other stamp →
  `NCPDP_TELECOM_UNSUPPORTED_VERSION`.
- **Never guess framing.** A non-empty body with no FS/GS/RS bytes → `NCPDP_TELECOM_INVALID_FRAMING`.

## What the reader does NOT do

- No response (paid/rejected) decode here. The request view above covers B1/B2/B3; the payer's
  answer to any of them, and the E1 eligibility response, are read by the response side and are
  documented in [Telecom responses](./spec-notes-telecom-response.md).
- No compound or COB/Other-Payer detail view.
- No serializer/builder (emit), parse only.
- No multi-transaction **emit**. Every transaction is read; `serializeTelecom` writes one transaction
  per transmission and refuses a model carrying more
  (`NCPDP_TELECOM_BUILD_MULTI_TRANSACTION_EMIT`) rather than dropping the rest.
- No maximum transaction count. The declared count is reported against the decoded count; a count is
  never called illegal.

## PHI

All fixtures are synthetic. Warnings and fatal errors carry only a stable code, a registry message
selected by that code, and a position (byte offset + optional 2-char field id), never a field value (cardholder id, DOB, NDC).
