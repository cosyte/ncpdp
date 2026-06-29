---
"@cosyte/ncpdp": patch
---

NCPDP-6 — Telecom responses + B2 reversal / B3 rebill / E1 eligibility (the claim adjudication read).

- **`@cosyte/ncpdp/telecom`** — `parseTelecom` now detects a **response** transmission (it leads with the
  Version/Release at offset 0, not the routing BIN) and decodes it against the fixed Response Transaction
  Header. New `adjudication(t): TelecomAdjudication | undefined` lifts the outcome — status + disposition,
  pricing, and DUR alerts — over the same reader for B1/B2/B3/E1 responses. Granular accessors
  `responseStatus`, `responsePricing`, `responseDur`, and `decodeResponseHeader` are exported too.
- **A reject always wins (safety invariant).** `disposition` is a total function over the Transaction
  Response Status (112-AN) **and** the reject codes (511-FB) together. Any reject present ⇒ `"rejected"`,
  even when the status field claims paid — a consumer is never told a rejected claim was paid. The
  self-contradiction surfaces as `NCPDP_TELECOM_STATUS_CONFLICT` (+ `statusConflict: true`). An
  unrecognized status reads `"unknown"`, never paid (`NCPDP_TELECOM_UNKNOWN_RESPONSE_STATUS`).
- **Money is never a float (safety invariant).** New `telecomMoney` decodes the implied 2-place decimal
  (cents) and the zoned-decimal **overpunch** sign (`{`,A–I = +0–9; `}`,J–R = −0–9) **string-wise**, with
  the verbatim source authoritative and a signed zero normalized to `0.00`. Unrecognized input is kept
  with `isValid: false` and no interpreted amount — money is never guessed.
- **No DUR alert is dropped (safety invariant).** The Response DUR/PPS segment repeats its fields per
  alert; the reader splits at each counter (567-J6) **and** each new Reason For Service (439-E4) so two
  alerts are never collapsed. Unknown reject/reason codes are kept verbatim with `known: false`
  (`NCPDP_TELECOM_UNKNOWN_REJECT_CODE`).
- **Accuracy + PHI.** New property invariants — reject ⇒ never paid, money decodes to an exact 2-place
  decimal, every DUR alert preserved — plus synthetic paid/rejected/B2/E1 fixtures; the warning-code
  surface snapshot is updated (three new stable codes). Synthetic-only fixtures; warnings carry a stable
  code + byte offset + field id, never a value. Spec traceability in
  `docs-content/spec-notes-telecom-response.md`. Still parse-only — no serializer yet.
