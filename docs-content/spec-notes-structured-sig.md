# Spec notes — structured SIG decode (NCPDP-4)

These notes record exactly what the `@cosyte/ncpdp/script` structured-SIG decoder reads, where the
mapping comes from, and what it deliberately does **not** do. They satisfy the accuracy-gate
spec-traceability requirement for the Phase 4 slice. No NCPDP-copyrighted prose is reproduced here.

## What this slice does

Decodes the SCRIPT `<Sig>` element into a typed `StructuredSig` of dosing components, surfaced on
`medication.sig`. The decode is **best-effort and explicitly lossy**: the free-text `<SigText>` is the
source of truth and is always preserved verbatim (`sig.sigText`), and the structured view is additive.

## Component model

`StructuredSig` exposes one uniform `SigField` per component, always present and tagged with a
`provenance` of `coded` | `derived` | `absent`:

| Field | NCPDP Structured-and-Codified-Sig component |
|---|---|
| `doseDeliveryMethod` | Dose delivery method (verb) |
| `dose` | Dose quantity (numeric amount) |
| `doseUnitOfMeasure` | Dose unit of measure |
| `route` | Route of administration |
| `siteOfAdministration` | Site of administration |
| `administrationTiming` | Administration timing / frequency |
| `duration` | Duration of therapy |
| `vehicle` | Vehicle / diluent |
| `indication` | Clinical indication |
| `maximumDoseRestriction` | Maximum-dose restriction |

`provenance` semantics:

- `coded` — the structured element carried a `<Code>` (with an optional `<Qualifier>`/`<CodeSystem>` or
  `Qualifier`/`CodeSystem` attribute). The code keeps its source qualifier verbatim; the recognized
  system is exposed via the shared `codedValue` mapping (SNOMED CT, NCI Thesaurus, NDC, RxNorm, ICD-10,
  else `UNKNOWN`).
- `derived` — a value was read from uncoded structure (a `<Text>` child, or the element's own text).
- `absent` — the element was missing or empty. **An absent field is never inferred from the free text.**

## Element-name recognition (and why it is tolerant)

The precise nesting of the NCPDP Structured and Codified Sig Format is defined in the NCPDP SCRIPT
Implementation Guide, which is **membership-gated**, and the nesting varies across SCRIPT releases
(2017071 / 2022011). Rather than hard-code one rigid XPath that a real trading partner's variant could
silently miss, the decoder matches each component by its **recognized local element name as a
descendant of `<Sig>`**. Recognized names (aliases tried widest-first) are declared in
`src/script/sig.ts` (`COMPONENT_NAMES`, `DOSE_QUANTITY_NAMES`). This mirrors the package's Postel's-Law
tolerance posture and keeps the decode robust to nesting variance.

This is a deliberate, documented trade-off: the decoder favors **recall with honest labeling** over a
brittle exact-path read, and the whole structured view is flagged lossy so a consumer never over-trusts
it. When the licensed IG element paths are confirmed, the recognized-name set can be tightened without a
public-API change.

## Fail-safe behavior

- **Never a confident dose from an ambiguous SIG.** If a dose structure is present but no unambiguous
  quantity can be read, `dose` is surfaced as `absent` and `NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE` is raised —
  the parser does not guess a number.
- **Never reconciled.** Structured dosing and the free text are surfaced independently. When they
  disagree, both are returned as-is; the library does not pick a winner.
- **Lossy flag.** Whenever any structured component decodes, `NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY` is
  raised once, signaling that `SigText` is authoritative.

## Known limitations (cumulative)

- **Decode-only.** v1 does not *generate* a SIG from structure (a future builder emits what it is given).
- **No natural-language parsing** of arbitrary free-text directions — only the structured `<Sig>` is
  decoded; `<Directions>` / `<SigText>` stay verbatim.
- **No terminology lookup.** Route/site/unit codes are surfaced with their claimed system (provenance),
  not validated or expanded against SNOMED/NCI.
- **Recognized-name tolerance** (above) is a known approximation of the gated IG nesting.
