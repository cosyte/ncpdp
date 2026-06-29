# ADR 0001 — XML parser for NCPDP SCRIPT

- **Status:** Accepted — ratified when the SCRIPT parse layer landed (NCPDP-1).
- **Date:** 2026-06-29

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

**`fast-xml-parser`** is the chosen runtime XML parser for the SCRIPT side, added as the package's
single runtime dependency. The Telecom side remains zero-dependency.

The earlier lean was `@xmldom/xmldom` (a standards-based W3C DOM). When the SCRIPT layer was actually
built, `fast-xml-parser` won on the factor that dominates for parsing untrusted, externally-sourced
healthcare XML — **security posture** — and on dependency footprint:

- **XXE / entity-expansion safety (deciding factor).** `fast-xml-parser` does not resolve
  `<!DOCTYPE>` / `<!ENTITY>` declarations or fetch external entities at all — there is no XXE vector,
  no billion-laughs amplification, and no network I/O by construction. The SCRIPT loader adds a
  pre-parse scan that refuses any input containing a DOCTYPE/ENTITY declaration outright (treated as
  `NCPDP_SCRIPT_NOT_XML`), so malicious entity payloads never reach the parser. `@xmldom/xmldom` is a
  fuller DOM implementation with a correspondingly larger surface and a history of
  entity-handling advisories.
- **Dependency footprint.** `fast-xml-parser` pulls **zero transitive dependencies**, keeping the
  whole package at one runtime dep — well under the ≤ 3 cap.
- **API fit.** SCRIPT needs a namespace-aware *structural* read, not a live W3C DOM. With
  `preserveOrder: true` the parser yields an ordered element tree that we transform into our own
  immutable `XmlElement` model (namespace prefixes stripped), which is exactly the shape the
  `header` / `newRx` extractors consume.

Rejected alternatives: `@xmldom/xmldom` (larger attack surface, heavier DOM than we need); `sax` /
`saxes` (streaming SAX is unnecessary for the bounded, in-memory SCRIPT messages we parse and would
add hand-rolled tree-building).

Constraints that hold regardless of which parser wins:

- The dependency is scoped to the **SCRIPT** side only (`@cosyte/ncpdp/script`); **Telecom stays
  zero-dep**.
- Total runtime deps for the whole package stay **≤ 3**, each justified in an ADR.
- The Postel's-Law contract is unchanged: lenient parse with stable warning codes (XPath positional
  context for SCRIPT), conservative spec-clean serialize.

## Consequences

- The package now ships **one** runtime dependency (`fast-xml-parser`), scoped in use to the SCRIPT
  side; Telecom code imports nothing from it and stays zero-dep. The ≤ 3-dep budget has two slots
  left, each of which would need its own ADR.
- The SCRIPT loader owns the security boundary: a DOCTYPE/ENTITY pre-scan plus `fast-xml-parser`'s
  no-entity-resolution default. Any future parser swap must preserve both properties — this is a
  one-way door precisely because that guarantee is load-bearing for PHI-grade input.
- Docs-follow-code for this change: `package.json` (`dependencies`), `CHANGELOG.md`, the meta-repo
  `documentation/repos/ncpdp.md` + `ecosystem-map.md`.
