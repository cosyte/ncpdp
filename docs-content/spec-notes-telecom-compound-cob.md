---
id: spec-notes-telecom-compound-cob
title: Spec notes — Telecom compound + COB + DUR depth + prior-auth (NCPDP-7)
sidebar_label: Compound, COB & DUR depth
---

# Spec notes — Telecom compound + COB + DUR depth + prior-auth (NCPDP-7)

These notes record exactly what the `@cosyte/ncpdp/telecom` **request-side depth** readers added in
Phase 7 decode, where the structural facts come from, and what they deliberately do **not** do. They
satisfy the accuracy-gate spec-traceability requirement for this slice. **No NCPDP-copyrighted prose is
reproduced here** — field/segment labels below are our own short paraphrases; the codes and
field-number designators are factual identifiers from the NCPDP Telecommunication Standard vD.0 and the
NCPDP Data Dictionary (paywalled), recorded with our paraphrased names (the Field-ID gate).

## What this slice does

Adds four reads over an already-parsed transaction — three on the request side, one spanning both:

- **Compound (segment 10)** — `compound(t)`: the multi-ingredient detail of a compounded claim, every
  ingredient surfaced and none dropped or merged.
- **Coordination of Benefits / Other Payments (request segment 05)** — `cobOtherPayments(t)`: each prior
  payer with its amount-paid and patient-responsibility money rows.
- **Response COB / Other Payers (response segment 28)** — `responseCob(t)`: the next-payer routing blocks
  the payer returns.
- **DUR/PPS request depth (segment 08)** — `requestDur(t)`: the submitted DUR/PPS interactions; plus the
  response DUR alert (segment 24) gains professional-service / result / level-of-effort depth.
- **Prior Authorization (segment 12)** — `priorAuthorization(t)`: presence + submitted type/number,
  **presence only — never adjudicated**.

All are lenient reads over the existing tokenizer; no new fatal conditions are introduced.

## Segments + fields modeled this phase

Segment Identification (111-AM) codes paraphrased: `05` Coordination of Benefits/Other Payments, `08`
DUR/PPS, `10` Compound, `12` Prior Authorization, `28` Response COB. A code outside the recognized set
is preserved verbatim and warned (`NCPDP_TELECOM_UNKNOWN_SEGMENT`).

- **Compound (10):** `EF` Dosage Form Description Code (450-EF), `EG` Dispensing Unit Form Indicator
  (451-EG), `EC` Compound Ingredient Component Count (447-EC); then per ingredient, repeating: `RE`
  Compound Product ID Qualifier (488-RE), `TE` Compound Product ID (489-TE), `ED` Compound Ingredient
  Quantity (448-ED, implied 3-place decimal), `EE` Compound Ingredient Drug Cost (449-EE, money), `UE`
  Compound Ingredient Basis of Cost Determination (490-UE).
- **Request COB / Other Payments (05):** `4C` Coordination of Benefits/Other Payments Count (337-4C);
  then per other payer, repeating: `5C` Other Payer Coverage Type (338-5C), `6C` Other Payer ID
  Qualifier (339-6C), `7C` Other Payer ID (340-7C), `E8` Other Payer Date (443-E8), and the money rows
  `HC` Other Payer Amount Paid Qualifier (342-HC) / `DV` Other Payer Amount Paid (431-DV), `6E` Other
  Payer-Patient Responsibility Amount Qualifier (472-6E) / `7E` Other Payer-Patient Responsibility
  Amount (473-7E).
- **Response COB / Other Payers (28):** `NT` Other Payer ID Count (355-NT); then per other payer: `5C`
  Other Payer Coverage Type (338-5C), `6C` Other Payer ID Qualifier (339-6C), `7C` Other Payer ID
  (340-7C), `MH` Other Payer Processor Control Number (991-MH), `NU` Other Payer Cardholder ID (356-NU),
  `MJ` Other Payer Group ID (992-MJ).
- **DUR/PPS request (08):** per interaction, splitting on `E4` Reason For Service Code (439-E4): `E5`
  Professional Service Code (440-E5), `E6` Result of Service Code (441-E6), `8E` DUR/PPS Level of Effort
  (474-8E), `J9` DUR Co-Agent ID Qualifier (475-J9), `H7` DUR Co-Agent ID (476-H7).
- **Response DUR/PPS (24) depth:** the existing alert reader now also lifts `E5` Professional Service
  Code, `E6` Result of Service Code, and `8E` Level of Effort onto each alert.
- **Prior Authorization (12):** `EU` Prior Authorization Type Code (461-EU), `EV` Prior Authorization
  Number Submitted (462-EV).

## Safety-critical handling

- **Every compound ingredient is surfaced, none dropped or merged.** A new ingredient begins at each
  Compound Product ID Qualifier (488-RE) **or** Compound Product ID (489-TE), so an ingredient is
  recognized even when a sender omits the qualifier. When the declared component count (447-EC) disagrees
  with the number of decoded ingredients, the count is **not** trusted to drop or pad data — every
  decoded ingredient is kept and the disagreement surfaces as
  `NCPDP_TELECOM_COMPOUND_COUNT_MISMATCH`.
- **Every COB money row is preserved with its amount.** Each other-payer block repeats on the Other
  Payer Coverage Type (338-5C); the segment-level count field (337-4C / 355-NT) is metadata and does not
  seed a spurious block. Within a block, amount rows pair a qualifier with the next amount in wire order,
  so two payments are never collapsed. A declared other-payer count that disagrees with the decoded block
  count surfaces as `NCPDP_TELECOM_COB_COUNT_MISMATCH`; all decoded blocks are kept.
- **Money is never a float.** Compound drug cost (449-EE) and the COB amount fields decode through the
  same `telecomMoney` path as the response pricing reader: implied 2-place decimal + zoned-decimal
  overpunch sign, interpreted string-wise with the verbatim source authoritative; unrecognized input is
  kept with `isValid: false`. Compound ingredient quantity (448-ED) uses the implied 3-place decimal
  string-wise (leading zeros stripped from the whole part, consistent with the money decode).
- **An unknown DUR reason is kept, never dropped.** A Reason For Service code (439-E4) outside the
  recognized set is preserved verbatim with `reasonKnown: false` and surfaces as
  `NCPDP_TELECOM_UNKNOWN_DUR_REASON`. Professional-service / result codes are preserved verbatim with no
  bundled description (the standard's code list is paywalled — consumers bring their own).
- **Prior authorization is presence, not adjudication.** `priorAuthorization` reports that the segment
  was submitted and echoes the type/number verbatim; it never decides whether a PA is valid, active, or
  honored — that is the payer's adjudication, returned in the response, not the request.

## What this slice does NOT do

- No serializer/builder (emit) — parse only.
- No clinical interpretation of DUR/PPS codes beyond the bundled Reason-For-Service descriptions; the
  professional-service, result-of-service, and level-of-effort code meanings are not bundled.
- No cross-segment reconciliation of the COB chain against the response pricing (e.g. verifying that
  other-payer amounts sum to a coordinated total).
- Only the first transaction in a multi-transaction transmission is decoded.

## PHI

All fixtures are synthetic — no real BIN/PCN/NDC/cardholder/payer identifiers. Other Payer Cardholder ID
(356-NU) is PHI-adjacent and is surfaced verbatim but never logged. Warnings and fatal errors carry only
a stable code, a PHI-free message, and a position (byte offset + optional 2-char field id) — never a
field value.
