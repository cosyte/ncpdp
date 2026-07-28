---
"@cosyte/ncpdp": patch
---

Documentation, JSDoc and warning-message text no longer describe internal build phases.
Six warning messages that told a reader a code was "not modeled this phase" now say "not
modeled by this parser"; the doc comments that render in an editor and the pages on the
docs site drop the same framing. Two stale claims were corrected with them: the Telecom
spec notes still listed response decode among the things the library does not do, and
three status lines pinned a published version the registry had moved past. The
`@cosyte/ncpdp/script` module documentation described only a NewRx read, omitting the
response and prescription-lifecycle transactions, the structured SIG view, the serializer
and the builders it already exports.

Internal detail, for the record and not for the release note: this is the ncpdp share of
PUBLIC-SURFACE-HYGIENE (founder directive, 2026-07-27). Measured on `34315b5`, 35 lines of
public markdown carried item identifiers `NCPDP-4`..`NCPDP-9`, "Phase N" framing, "what
this slice does" headings, or accuracy-gate and Field-ID-gate process commentary; 19 `src/`
doc-comment lines carried the same into `dist/*.d.ts`; 6 runtime warning messages carried
it into a consumer's log. `pnpm check:no-internal-refs` plus its own CI workflow now gate
all of it across four passes, including one the `hl7` reference gate does not have: the
`src/` string literals that reach a consumer as warning-message text. The identifier rule
keys on known project prefixes and never on the `WORD-N` shape, so `NCPDP-SCRIPT`,
`NCPDP-D.0`, `439-E4`, `511-FB` and the synthetic example message ids survive it, with
negative self-tests that refuse to let that be widened away.
