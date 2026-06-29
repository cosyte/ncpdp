---
"@cosyte/ncpdp": patch
---

NCPDP-7 — Telecom request-side depth: compound, coordination of benefits, DUR/PPS request depth, and prior-authorization presence.

- **`@cosyte/ncpdp/telecom`** — five new reads over a parsed transaction: `compound(t)` (multi-ingredient
  compound detail, segment 10), `cobOtherPayments(t)` (request COB / Other Payments, segment 05),
  `responseCob(t)` (response COB / Other Payers routing, segment 28), `requestDur(t)` (submitted DUR/PPS
  interactions, segment 08), and `priorAuthorization(t)` (segment 12). The response DUR alert
  (`responseDur`) also gains professional-service / result-of-service / level-of-effort depth.
- **Every compound ingredient is surfaced, none dropped or merged (safety invariant).** A new ingredient
  begins at each Compound Product ID Qualifier (488-RE) **or** Compound Product ID (489-TE), so an
  ingredient is recognized even when the qualifier is omitted. A declared component count (447-EC) that
  disagrees with the decoded count never drops or pads data — every ingredient is kept and the
  disagreement surfaces as `NCPDP_TELECOM_COMPOUND_COUNT_MISMATCH`.
- **Every COB money row is preserved with its amount (safety invariant).** Each other-payer block repeats
  on Other Payer Coverage Type (338-5C); the segment-level count (337-4C / 355-NT) is metadata and never
  seeds a spurious block. Amount rows pair a qualifier with the next amount in wire order so two payments
  are never collapsed. A declared other-payer count that disagrees surfaces as
  `NCPDP_TELECOM_COB_COUNT_MISMATCH`; all decoded blocks are kept.
- **Money is never a float.** Compound drug cost (449-EE) and the COB amount fields decode through the
  same `telecomMoney` path (implied 2-place decimal + zoned-decimal overpunch). Compound ingredient
  quantity (448-ED) uses the implied 3-place decimal string-wise.
- **An unknown DUR reason is kept, never dropped.** A Reason For Service code (439-E4) outside the
  recognized set is preserved verbatim with `reasonKnown: false` and surfaces as
  `NCPDP_TELECOM_UNKNOWN_DUR_REASON`.
- **Prior authorization is presence, not adjudication.** `priorAuthorization` reports the segment was
  submitted and echoes the type/number verbatim — it never decides whether a PA is valid or honored.
- **Accuracy + PHI.** Three new stable warning codes (`COMPOUND_COUNT_MISMATCH`, `COB_COUNT_MISMATCH`,
  `UNKNOWN_DUR_REASON`); the warning-code surface snapshot is updated. New property invariants (every
  ingredient / COB amount row preserved) plus synthetic compound + secondary-claim fixtures.
  Synthetic-only fixtures; warnings carry a stable code + byte offset + field id, never a value. Spec
  traceability in `docs-content/spec-notes-telecom-compound-cob.md`. Still parse-only — no serializer yet.
