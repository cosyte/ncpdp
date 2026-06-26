# ADR 0001 — XML parser for NCPDP SCRIPT

- **Status:** Pending — to be ratified when the SCRIPT parse layer lands.
- **Date:** 2026-06-26 (placeholder)

## Context

`@cosyte/ncpdp` covers two structurally unrelated NCPDP standards:

- **Telecommunication Standard** (claims; vD.0 + vF6) — a fixed-field, field-id-keyed text
  protocol with FS/GS/RS framing. This parses with Node stdlib only, exactly like the reference
  `@cosyte/hl7` parser. **It stays zero-dependency.**
- **SCRIPT Standard** (ePrescribing; v2017071 + v2022011) — **XML** over Surescripts. A correct,
  namespace-aware XML parse is not something to hand-roll; this layer will need a real XML parser.

The cosyte default is **zero runtime dependencies** (every dependency is a supply-chain gate). The
shared conventions carve out an explicit exception: `ccda`/`ncpdp` may take an XML-parser dependency
for their XML formats, **decided per an ADR** (see `documentation/conventions.md` → "Zero (or
near-zero) runtime dependencies"). This is that ADR slot.

## Decision

**Deferred.** Adding an XML-parser runtime dependency is a one-way door, so it is **not** taken at
bootstrap. The scaffolded `src/index.ts` stub (`VERSION`, the `parseNcpdp` stub, and the
`WARNING_CODES` / `FATAL_CODES` registries) is and remains **zero-dependency**.

The choice will be ratified here when the SCRIPT parse layer is actually built. Current lean:
**`@xmldom/xmldom`** (standards-based DOM, no native build, actively maintained), with the
alternatives (`fast-xml-parser`, `sax`, `saxes`) to be weighed at that time on bundle size,
namespace handling, streaming need, and security posture (XXE/entity-expansion).

Constraints that hold regardless of which parser wins:

- The dependency is scoped to the **SCRIPT** side only (`@cosyte/ncpdp/script`); **Telecom stays
  zero-dep**.
- Total runtime deps for the whole package stay **≤ 3**, each justified in an ADR.
- The Postel's-Law contract is unchanged: lenient parse with stable warning codes (XPath positional
  context for SCRIPT), conservative spec-clean serialize.

## Consequences

- Until this ADR is ratified, the SCRIPT layer is not implemented and the package ships zero runtime
  dependencies — the drift check and the `dependencies: {}` in `package.json` reflect that.
- When the SCRIPT layer lands: add the chosen parser as a runtime dependency, update this ADR to
  **Accepted** with the rationale, update `package.json` + `CHANGELOG.md`, and update the meta-repo
  `documentation/repos/ncpdp.md` + `ecosystem-map.md` (docs follow code).
