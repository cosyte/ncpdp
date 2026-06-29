---
"@cosyte/ncpdp": patch
---

NCPDP-1 — SCRIPT foundation + NewRx structural read, plus the shared `@cosyte/ncpdp/common`
vocabulary. First real public surface, replacing the `VERSION`-only archetype stub.

- **`@cosyte/ncpdp/script`** — `parseScript(xml)` returns an immutable `ScriptMessage`; `newRx(msg)`
  projects the NewRx body (patient, pharmacy, prescriber, medication). A coded drug and an explicit
  strength are surfaced side-by-side and **never reconciled** — the collision raises
  `STRENGTH_CODED_AND_EXPLICIT` instead. Lenient by default: vendor quirks become XPath-positioned
  `SCRIPT_WARNING_CODES`; only unrecoverable structural corruption throws a typed
  `NcpdpScriptParseError` (`SCRIPT_FATAL_CODES`). **XXE-safe by construction** — any `<!DOCTYPE>`/
  `<!ENTITY>` payload is refused and entity resolution is disabled. Supports SCRIPT `v2017071` +
  `v2022011`; an unknown 7-digit version is tolerated with a warning, a legacy dotted version is fatal.
- **`@cosyte/ncpdp/common`** — `decimalValue` (float-free decimal validity), `ndcValue` (NDC
  segmentation classification), `recognizeCodeSystem`/`codedValue` (NDC/RXNORM/SNOMED/NCI/ICD10
  qualifier mapping), and XPath position helpers.
- **Warnings never carry field values** — each warning is a stable code + an XPath position only,
  never patient or drug data (PHI-safe).
- Adds a single runtime dependency, [`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser),
  for safe namespace-aware XML parsing on the SCRIPT side — ratified in `docs/adr/0001-xml-parser.md`.
  The Telecom side remains zero-dependency.
