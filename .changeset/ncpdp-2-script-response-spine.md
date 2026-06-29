---
"@cosyte/ncpdp": patch
---

NCPDP-2 — SCRIPT response spine: read the `Status` / `Error` / `Verify` acknowledgment transactions
via `status()`/`error()`/`verify()` (and a `disposition` accessor that can never read an `Error` as a
success), with `correlatesTo` exposing `<RelatesToMessageID>` for request↔response correlation. Codes
and descriptions are surfaced verbatim; a malformed multi-response body reports the most conservative
disposition and raises `RESPONSE_AMBIGUOUS_DISPOSITION`.
