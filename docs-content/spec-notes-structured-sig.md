---
id: spec-notes-structured-sig
title: "Spec notes: structured SIG decode"
sidebar_label: Structured SIG decode
---

# Spec notes: structured SIG decode

These notes record exactly what the `@cosyte/ncpdp/script` structured-SIG decoder reads, where the
mapping comes from, and what it deliberately does **not** do. No NCPDP-copyrighted prose is
reproduced here.

## What the decoder does

Decodes the SCRIPT `<Sig>` element into a typed `StructuredSig` of dosing components, surfaced on
`medication.sig`. The decode is **best-effort and explicitly lossy**: the free-text `<SigText>` is the
source of truth and is always preserved verbatim (`sig.sigText`), and the structured view is additive.

## Component model

`StructuredSig` exposes one uniform `SigField` per component, always present and tagged with a
`provenance` of `coded` | `derived` | `absent`:

| Field                    | NCPDP Structured-and-Codified-Sig component | Decodes?        |
| ------------------------ | ------------------------------------------- | --------------- |
| `doseDeliveryMethod`     | Dose delivery method (verb)                 | yes             |
| `dose`                   | Dose quantity (numeric amount)              | yes             |
| `doseUnitOfMeasure`      | Dose unit of measure                        | always `absent` |
| `route`                  | Route of administration                     | yes             |
| `siteOfAdministration`   | Site of administration                      | yes             |
| `administrationTiming`   | Administration timing                       | yes             |
| `duration`               | Duration of therapy                         | always `absent` |
| `vehicle`                | Vehicle / diluent                           | always `absent` |
| `indication`             | Clinical indication                         | always `absent` |
| `maximumDoseRestriction` | Maximum-dose restriction                    | always `absent` |

The last column is the consequence of element-name grounding, below: a component decodes only where
this release can trace its element name to a published field label.

`provenance` semantics:

- `coded`: the structured element carried a `<Code>` (with an optional `<Qualifier>`/`<CodeSystem>` or
  `Qualifier`/`CodeSystem` attribute). The code keeps its source qualifier verbatim; the recognized
  system is exposed via the shared `codedValue` mapping (SNOMED CT, NCI Thesaurus, NDC, RxNorm, ICD-10,
  else `UNKNOWN`).
- `derived`: a value was read from uncoded structure (a `<Text>` child, or the element's own text).
- `absent`: the element was missing or empty. **An absent field is never inferred from the free text.**

## Element-name recognition, and what grounds it

The precise nesting of the NCPDP Structured and Codified Sig Format is defined in the NCPDP SCRIPT
Implementation Guide, which is **membership-gated**, and the nesting varies across the SCRIPT
releases this package decodes. Rather than hard-code one rigid XPath that a real trading partner's variant could
silently miss, the decoder matches each component by its **recognized local element name as a
descendant of `<Sig>`**. Recognized names are declared in `src/script/sig.ts`
(`SIG_COMPONENT_NAMES`), each with a provenance record in `SIG_NAME_PROVENANCE`.

**A name is recognized only if a published artifact carries a field label that the name transcribes,
and that label denotes the same component the name populates here.** A name that merely looks like the
right spelling is not enough: reading the wrong element does not produce a missing field, it produces a
confidently coded wrong one, and in a dispensing pipeline that is the expensive failure. A label naming
the enclosing **segment** does not ground a component name either, since a segment is the container for
the field rather than another spelling of it.

The artifact behind every name below is table 1 of Liu H, Burkhart Q, Bell DS, "Evaluation of the NCPDP
Structured and Codified Sig Format for e-prescriptions", JAMIA 2011;18(5):645-651
(<https://pmc.ncbi.nlm.nih.gov/articles/PMC3168301/>), retrieved 2026-08-25. It is a peer-reviewed
inventory of the format's 13 segments and their fields, which is why these labels can be quoted at all
while the standard itself stays behind membership and purchase.

**The assumption, and its fail-safe.** That inventory gives conceptual field labels in title case and
prose; this decoder matches XML element _local names_. Those coincide only insofar as the standard's
schema spells each label as its closed-up element name, and nothing public confirms that, because the
Implementation Guides are paywalled. If the assumption is wrong for a given name, that name simply
never matches: the component reads `absent`, nothing is inferred from the free text, and `sigText`
still carries the directions verbatim.

**One qualification, worth reading before relying on any of it.** That artifact is a **single source**,
and it studies Sig Format v1.0 as implemented in **SCRIPT 10.5**, which is not one of the federally
adopted releases this package decodes (they are named in the
[Conformance statement](./conformance)). NCPDP's own release summary records that the later of those
two adopted releases carries modifications to the Structured and Codified Sig structure format. So
the inventory is evidence about the format's
fields and is **not normative** for the adopted releases. Treat every name below as
grounded-but-provisional.

### Recognized element names, per component

| Component                | Recognized element name(s) | Field label it transcribes                   |
| ------------------------ | -------------------------- | -------------------------------------------- |
| `doseDeliveryMethod`     | `DoseDeliveryMethod`       | "Dose delivery method" (dose segment)        |
| `dose`                   | `DoseQuantity`             | "Dose quantity" (dose segment)               |
| `doseUnitOfMeasure`      | none                       | no field label denotes it                    |
| `route`                  | `Route`                    | "Route" (route of administration segment)    |
| `siteOfAdministration`   | `Site`                     | "Site" (site of administration segment)      |
| `administrationTiming`   | `AdministrationTiming`     | "Administration timing" (Sig timing segment) |
| `duration`               | none                       | no field label denotes it                    |
| `vehicle`                | none                       | no field label denotes it                    |
| `indication`             | none                       | no field label denotes it                    |
| `maximumDoseRestriction` | none                       | no field label denotes it                    |

**A component with no recognized name always decodes `absent`**, whatever element the message carried.
Five of the ten slots are in that position. They stay on the type, tagged `absent`, rather than
disappearing: a consumer can tell "this release cannot read that" apart from "that component no longer
exists".

### Element names this release removed

Each of these was recognized previously and matched nothing in the artifact that denotes the component
it populated, so it was removed. **A message using one of these names now decodes that component
`absent`.** Nothing was added or re-spelled to replace them; the vocabulary only narrowed.

| Removed name             | Component it populated | Why it is not grounded                                                                                                             |
| ------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Dose`                   | dose                   | names the enclosing dose segment, not the quantity field                                                                           |
| `DoseUnitOfMeasure`      | doseUnitOfMeasure      | no such field label; the same string names an NCI Thesaurus terminology subset, which is a value space rather than a Sig component |
| `RouteOfAdministration`  | route                  | names the enclosing route of administration segment                                                                                |
| `SiteOfAdministration`   | siteOfAdministration   | names the enclosing site of administration segment                                                                                 |
| `TimingAndDuration`      | administrationTiming   | no such label, and it spans two different segments                                                                                 |
| `Frequency`              | administrationTiming   | the frequency fields are neighbours of administration timing, not that component                                                   |
| `Duration`               | duration               | names the enclosing duration segment                                                                                               |
| `Vehicle`                | vehicle                | names the enclosing vehicle segment                                                                                                |
| `Indication`             | indication             | names the enclosing indication segment                                                                                             |
| `MaximumDoseRestriction` | maximumDoseRestriction | names the enclosing maximum dose restriction segment                                                                               |

The serializer emits each component under its recognized name, so what this library writes is what it
reads back. A component with no recognized name is not emitted at all, since it can never hold a value.

## Fail-safe behavior

- **Never a confident dose from an ambiguous SIG.** If a dose structure is present but no unambiguous
  quantity can be read, `dose` is surfaced as `absent` and `NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE` is raised.
  The parser does not guess a number.
- **Never reconciled.** Structured dosing and the free text are surfaced independently. When they
  disagree, both are returned as-is; the library does not pick a winner.
- **Lossy flag.** Whenever any structured component decodes, `NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY` is
  raised once, signaling that `SigText` is authoritative.

## Known limitations (cumulative)

- **Decode-only.** v1 does not _generate_ a SIG from structure (a future builder emits what it is given).
- **No natural-language parsing** of arbitrary free-text directions: only the structured `<Sig>` is
  decoded; `<Directions>` / `<SigText>` stay verbatim.
- **No terminology lookup.** Route/site/unit codes are surfaced with their claimed system (provenance),
  not validated or expanded against SNOMED/NCI.
- **Recognized-name tolerance** (above) is a known approximation of the gated IG nesting.
