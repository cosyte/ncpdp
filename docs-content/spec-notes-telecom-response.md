---
id: spec-notes-telecom-response
title: Spec notes — Telecom responses + B2/B3/E1 (NCPDP-6)
sidebar_label: Telecom responses
---

# Spec notes — Telecom responses + B2/B3/E1 (NCPDP-6)

These notes record exactly what the `@cosyte/ncpdp/telecom` **response** reader decodes, where the
structural facts come from, and what it deliberately does **not** do. They satisfy the accuracy-gate
spec-traceability requirement for the Phase 6 slice. **No NCPDP-copyrighted prose is reproduced here** —
field/segment labels below are our own short paraphrases; the codes and field-number designators are
factual identifiers from the NCPDP Telecommunication Standard vD.0 and the NCPDP Data Dictionary
(paywalled), verified and recorded with our paraphrased names (the Field-ID gate).

## What this slice does

Reads a vD.0 Telecommunication **response** transmission: the fixed Response Transaction Header and the
control-character-framed response segments, and lifts an adjudication view (status + disposition,
pricing, DUR alerts). The same reader serves a B1 billing-claim response, a **B2** reversal, a **B3**
rebill, and an **E1** eligibility response — the response shape is identical; only the echoed
Transaction Code differs. Liberal on parse; only structurally unrecoverable input throws a typed fatal.

## Detecting a response vs a request

A request header leads with the routing BIN (101-A1) at offset 0 and carries the Version/Release
(`"D0"`) at offset 6. A response header leads with the Version/Release at offset 0. The two are told
apart by where `"D0"` sits — the request shape is checked first so a request is never mistaken for a
response. The fixed header region is then sliced up to the first **structural** framing char (GS/RS); the
Field Separator (FS) is excluded because it appears *within* a segment and never marks the
header→body boundary.

## Fixed Response Transaction Header (D.0)

Positional, leading fields only — the safety-critical adjudication data lives in the framed segments,
not the header, so a mis-sized trailing field can never misread a paid/rejected outcome. Offsets
`[name, offset, length]`:

| Field | Designator | Offset | Length |
|---|---|---|---|
| Version/Release | 102-A2 | 0 | 2 |
| Transaction Code | 103-A3 | 2 | 2 |
| Transaction Count | 109-A9 | 4 | 1 |
| Header Response Status | 501-F1 | 5 | 1 |
| Service Provider ID Qualifier | 202-B2 | 6 | 2 |
| Service Provider ID | 201-B1 | 8 | 15 |

Header Response Status (501-F1) is the **transmission-level** accept/reject flag (`A`/`R`), distinct
from the per-claim Transaction Response Status (112-AN) in the Response Status segment.

## Response segments + fields modeled this phase

Segment Identification (111-AM) codes paraphrased: `20` Response Message, `21` Response Status, `22`
Response Claim, `23` Response Pricing, `24` Response DUR/PPS, `25` Response Insurance, `26` Response
Patient, `28` Response Coordination of Benefits. A code outside this set is preserved verbatim and warned
(`NCPDP_TELECOM_UNKNOWN_SEGMENT`).

- **Response Status (21):** `AN` Transaction Response Status (112-AN), `FA` Reject Count (510-FA), `FB`
  Reject Code (511-FB, repeating), `F3` Authorization Number (503-F3), `FQ` Additional Message
  Information (526-FQ).
- **Response Pricing (23):** `F5` Patient Pay Amount (505-F5), `F9` Total Amount Paid (509-F9), `F6`
  Ingredient Cost Paid (506-F6), `F7` Dispensing Fee Paid (507-F7), `FM` Basis of Reimbursement
  Determination (522-FM).
- **Response DUR/PPS (24):** `J6` DUR/PPS Response Code Counter (567-J6), `E4` Reason For Service Code
  (439-E4), `FS` Clinical Significance Code (528-FS), `FU` Previous Date Of Fill (530-FU), `FV` Quantity
  Of Previous Fill (531-FV), `FY` DUR Free Text Message (544-FY).

## Safety-critical handling

- **A reject always wins.** The disposition is a total function over the Transaction Response Status
  (112-AN) **and** the reject codes. Any reject present ⇒ `"rejected"`, even when the status field claims
  paid; the conflict is surfaced (`NCPDP_TELECOM_STATUS_CONFLICT`, `statusConflict: true`). An
  unrecognized status reads `"unknown"`, **never** paid (`NCPDP_TELECOM_UNKNOWN_RESPONSE_STATUS`). A
  declared positive Reject Count with no codes still resolves to rejected.
- **Money is never a float.** Dollar fields carry an implied 2-place decimal (cents) and an optional
  zoned-decimal **overpunch** sign on the final character (the EBCDIC-derived convention NCPDP inherits:
  `{`,A–I = +0–9; `}`,J–R = −0–9). Both are interpreted **string-wise** with the verbatim source kept; a
  signed zero normalizes to a non-negative `0.00`. Unrecognized input is preserved with `isValid: false`
  and no interpreted amount — money is never guessed or recomputed.
- **No DUR alert is dropped.** The DUR/PPS segment repeats its fields once per returned alert; the reader
  splits at each counter (567-J6) **and** at each new Reason For Service (439-E4) so two alerts are never
  collapsed into one. An unrecognized reject or reason code is preserved verbatim with `known: false`.

## What this slice does NOT do

- No serializer/builder (emit) — parse only.
- No COB/Other-Payer adjudication detail beyond preserving the segment verbatim.
- The DUR/PPS "other pharmacy / database / other prescriber" indicator fields (`FT`/`FW`/`FX`) are
  tokenized and preserved verbatim on the raw segment but are **not** lifted onto the `TelecomDurAlert`
  view this phase — read them from `segment.fields` if needed. Nothing is dropped at the parse layer.
- Only the first transaction in a multi-transaction transmission is decoded.
- DUR free text (544-FY) may be operationally PHI-adjacent; it is surfaced verbatim but never logged.

## PHI

All fixtures are synthetic. Warnings and fatal errors carry only a stable code, a PHI-free message, and
a position (byte offset + optional 2-char field id) — never a field value.
