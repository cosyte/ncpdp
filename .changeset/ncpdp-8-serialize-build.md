---
"@cosyte/ncpdp": patch
---

NCPDP-8 — spec-clean serializers + builders + round-trip, both standards. Closes the parse↔emit loop.

- **`@cosyte/ncpdp/script`** — `serializeScript(message)` (and `ScriptMessage#toString()`) emits a
  parsed or built message as canonical SCRIPT XML; `buildNewRx(input)` and `buildScriptResponse(input)`
  construct a NewRx or a `<Status>`/`<Error>`/`<Verify>` response from a structured input.
- **`@cosyte/ncpdp/telecom`** — `serializeTelecom(transaction)` emits a parsed or built transaction as
  canonical vD.0 wire form (56-byte fixed header + FS/GS/RS-framed body, or the response header + GS +
  segments); `buildTelecomRequest(input)` constructs a vD.0 request transaction.
- **Conservative on emit (Postel's Law).** The serializer never warns on a valid model. The builders
  refuse a message invalid by construction with a typed error rather than emitting malformed output:
  `NcpdpScriptBuildError` (`MISSING_MEDICATION`, `MISSING_RESPONSE_CODE`, `INVALID_CHARACTER`) and
  `NcpdpTelecomBuildError` (`MISSING_TRANSACTION_CODE`, `MISSING_SEGMENT_ID`, `INVALID_FIELD_ID`,
  `EMBEDDED_CONTROL_CHARACTER`, `FIELD_TOO_LONG`).
- **Canonical-form round-trip, not byte-identity.** The read is lossy, so the contract is
  canonical-form idempotence: `serialize(parse(serialize(x)))` is byte-identical to `serialize(x)`, and
  `parse(serialize(x))` is structurally equal to `x`. Golden round-trip over every parseable
  Tier-1+Tier-2 fixture (both standards) plus a `roundTripProperty` property test; builder output
  re-parses with zero warnings.
- **XML escaping + XXE boundary (SCRIPT).** Emit escapes `& < >` (and `"` in attributes). Because the
  loader resolves no entities, a raw `& < >` round-trips only when entity-free (the corpus is); the
  builder refuses XML-1.0 control characters up front.
- **Accuracy + PHI.** Spec traceability in `docs-content/spec-notes-serialize-build.md`. Synthetic-only
  fixtures; build errors carry a stable code and never echo the offending (PHI-dense) value. No new
  warning codes — the parser warning surface is unchanged.
- **Known limitations.** Whole-message only (no streaming emit); the SCRIPT builder emits the SIG it is
  given (no SIG generation from structure); lossy fields the parser does not model are not reproduced.
