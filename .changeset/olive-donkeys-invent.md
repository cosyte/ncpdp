---
"@cosyte/ncpdp": minor
---

The structured SIG decoder now matches an element name only where a published field label establishes
that the name denotes that component, and every recognized name carries the artifact, URL, retrieval
date and quoted label behind it in source.

This narrows what decodes, and a consumer reading the structured view will see the difference. Ten
element names the previous release matched on (`Dose`, `DoseUnitOfMeasure`, `RouteOfAdministration`,
`SiteOfAdministration`, `TimingAndDuration`, `Frequency`, `Duration`, `Vehicle`, `Indication`,
`MaximumDoseRestriction`) had no label denoting the component they populated, so they were removed. A
message using one of them now decodes that component `absent` where it previously returned a value,
and a `<Sig>` whose only structure used those names now reports `hasStructuredData` false and raises
no `NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY`. Five components (`doseUnitOfMeasure`, `duration`, `vehicle`,
`indication`, `maximumDoseRestriction`) have no grounded name at all and now always read `absent`.

Nothing was added, re-spelled or moved to a different component; the vocabulary only narrowed. The
direction is deliberate: an ungrounded name that matched the wrong element would hand a caller a
confidently coded wrong dose, and a wrong field position is a wrong dispense, while a name that stops
matching only costs a component and leaves `sigText` carrying the directions verbatim. The evidence is
a single peer-reviewed inventory of the format's segments and fields, which studies Sig Format v1.0 on
SCRIPT 10.5 rather than the adopted 2017071 or 2023011, so every surviving name is
grounded-but-provisional and says so.

The public surface is unchanged: all ten component slots, the provenance union and both SIG warning
codes are still exported. The serializer now emits each component under its recognized name, so
parse-then-emit output still re-reads identically.
