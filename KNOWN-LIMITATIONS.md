# Known limitations & non-goals

`@cosyte/ncpdp` is built to be **correct and honest about its edges** rather than to claim more than it
delivers. Misreading a dispensed drug, a dose, a reject, or a coverage decision can cause real
financial or clinical harm, so this is the deliberate "do not over-trust" list. Everything here is a
documented, intentional boundary — not a bug. The lenient parser never silently drops or garbles data:
where a limitation applies, the raw value is preserved (usually with a stable warning), it is simply
not further decoded.

## Explicit non-goals

- **EPCS is out of scope (v1).** Electronic Prescribing of Controlled Substances requires
  DEA-regulated digital-signature verification, HSM integration, and a separate audit/certification
  posture. It belongs in a dedicated package (`@cosyte/ncpdp-epcs`), not here. This library parses and
  emits SCRIPT/Telecom structure; it performs **no** signature validation and asserts **nothing** about
  a controlled-substance prescription's legal validity.
- **The structured SIG decode is best-effort and explicitly lossy.** The free-text `SigText` is the
  **source of truth** and is always preserved verbatim; the structured `<Sig>` view is additive and
  every field is provenance-tagged (`coded` / `derived` / `absent`). An absent field is never inferred
  from the free text, an ambiguous dose is surfaced as `absent` (never guessed) with a
  `NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE` warning, and any decode flags `NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY`.
  The library does **not** generate a SIG from structure, and does **not** parse arbitrary
  natural-language directions. See `docs-content/spec-notes-structured-sig.md`.
- **No transport.** Surescripts / PBM connectivity, retries, and acknowledgement transport are out of
  scope — this is a parser/serializer/builder, not a communications stack.
- **Whole-message only.** Emit is not streaming, and only the first transaction of a multi-transaction
  Telecom transmission is decoded (the remainder is preserved and flagged
  `NCPDP_TELECOM_MULTI_TRANSACTION_TRUNCATED`).

## Version / decode boundaries

- **Telecom: vD.0 only.** Only the vD.0 fixed offsets are decoded. An **F6** stamp is _recognized but
  not decoded_ (its header layout differs) and surfaced via `NCPDP_TELECOM_VF6_NOT_DECODED`; any other
  stamp is `NCPDP_TELECOM_UNSUPPORTED_VERSION`. A separator is never guessed
  (`NCPDP_TELECOM_INVALID_FRAMING`).
- **SCRIPT: the XML era only** (`v2017071` / `v2022011`). A pre-XML legacy SCRIPT version is refused
  with `NCPDP_SCRIPT_UNSUPPORTED_VERSION`, never mis-mapped onto the XML field model.
- **Prior authorization is presence, not adjudication** — the library reports that a PA segment was
  submitted and echoes its type/number; it never decides whether a PA is valid or honored.
- **Codes and descriptions are surfaced verbatim.** The library bundles **no** NCPDP code→meaning
  table for reject codes, error codes, or DUR reasons — the wire code is returned as-is (an unknown one
  is kept with `known: false` + an `…_UNKNOWN_…` warning). This is deliberate: see licensing below.

## Standards-licensing posture — no redistributed NCPDP prose

NCPDP charges for its standards documents and is more protective of that copyright than HL7. This
package **does not redistribute NCPDP-copyrighted text**: the wire _format_ is parsed, but field-name
labels and any code descriptions in the code are paraphrased / widely-known industry terminology, never
lifted verbatim from an NCPDP PDF. Do not paste NCPDP spec prose into JSDoc, README, comments, or
fixtures.

## Conformance testing — no external-oracle differential corpus (by design)

Unlike the other cosyte parsers, `@cosyte/ncpdp` runs **no differential test against a third-party
reference implementation**. That exclusion is a direct consequence of the licensing posture above — a
differential corpus would require redistributing NCPDP-derived material we are not licensed to ship.
Conformance instead rests on: the three-tier **synthetic** corpus (spec-clean → vendor-quirk →
round-trip goldens), the `@cosyte/test-utils` property invariants (lenient never-throw, round-trip,
immutability, warning-code stability), and a nightly amplified fuzz job (Telecom byte tokenizer +
SCRIPT XML XXE/entity-expansion). **Do not assume byte-for-byte agreement with any specific vendor or
switch implementation.**

## Published, still pre-alpha

The package is **published on npm at `0.0.1`** and public, but it sits on the
`0.0.x`-until-first-alpha ladder: treat the API as pre-alpha and expect it to move before first
alpha. The SCRIPT side takes one vetted runtime dependency (`fast-xml-parser`, XXE-safe by
construction — see `docs/adr/0001-xml-parser.md`); the Telecom side is zero-dependency.

---

For the phase-by-phase surface and the exact fields each helper decodes, see the package
[`README.md`](./README.md), the [`CLAUDE.md`](./CLAUDE.md) status section, the
[Cookbook](./docs-content/cookbook.md), and the `docs-content/spec-notes-*.md` set.
