---
"@cosyte/ncpdp": patch
---

NCPDP-4 — SCRIPT structured SIG decode (lossy, labeled) with route/site/method provenance.

- **`@cosyte/ncpdp/script`** — `medication.sig` now exposes a `StructuredSig`: a best-effort decode of
  the SCRIPT `<Sig>` into typed dosing components (`doseDeliveryMethod`, `dose`, `doseUnitOfMeasure`,
  `route`, `siteOfAdministration`, `administrationTiming`, `duration`, `vehicle`, `indication`,
  `maximumDoseRestriction`), present only when a `<Sig>` element exists.
- **The free text stays the source of truth.** `sig.sigText` (the `<SigText>`) is preserved verbatim;
  the structured view is **additive and explicitly lossy** and is never reconciled against the free
  text. When the two disagree, both are surfaced as-is.
- **Per-field provenance.** Every component is a `SigField` tagged `coded` / `derived` / `absent`. A
  `coded` field keeps its source qualifier verbatim and resolves the system (SNOMED CT / NCI / NDC /
  RxNorm / ICD-10, else `UNKNOWN`) so route/site/method/unit provenance is auditable. An `absent` field
  is never inferred from the free text.
- **Ambiguous doses are never guessed.** A dose structure with no readable quantity is surfaced as
  `absent` and raises the new `NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE`; whenever any structured component
  decodes, the new `NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY` flags the additive lossy view. Both codes are
  additive; the warning-code surface is snapshotted.
- **Decode-only**, with element-name tolerance for the membership-gated IG nesting documented in
  `docs-content/spec-notes-structured-sig.md`. Covers SCRIPT `v2017071` + `v2022011`. Synthetic-only
  fixtures; warnings remain a stable code + XPath position, never a field value (PHI-safe).
