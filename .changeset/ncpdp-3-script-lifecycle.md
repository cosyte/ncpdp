---
"@cosyte/ncpdp": patch
---

NCPDP-3 — SCRIPT prescription-lifecycle transactions: read the renewal / change / cancel pairs.

- **`@cosyte/ncpdp/script`** — reads `RxRenewalRequest`/`RxRenewalResponse`,
  `RxChangeRequest`/`RxChangeResponse`, and `CancelRx`/`CancelRxResponse` via the
  `rxRenewalRequest()`/`rxRenewalResponse()`/`rxChangeRequest()`/`rxChangeResponse()`/`cancelRx()`/
  `cancelRxResponse()` accessors (and `ScriptMessage#asLifecycleRequest`/`asLifecycleResponse`).
  Requests project patient, pharmacy, prescriber, and the prescribed medication with the same
  semantics as NewRx.
- **Fail-safe outcome reading.** A response exposes an `outcome` of
  `approved`/`approvedWithChanges`/`denied`/`deniedNewToFollow`/`replace`/`validated`/`unknown`. A
  `<Denied>` is **never** read as an approval; an unrecognized or absent outcome reads as `unknown`
  (never assumed approved) and raises `LIFECYCLE_OUTCOME_UNRECOGNIZED`; a malformed response carrying
  more than one outcome choice resolves **denial-first** and raises `LIFECYCLE_AMBIGUOUS_OUTCOME`.
  `approvalOf(outcome)` gives a coarse, one-directional `affirmative`/`negative`/`indeterminate` read.
- **`approvedWithChanges` carries the changed medication.** The `medicationPrescribed` on the response
  is the **changed** drug — surfaced whether it sits as a sibling of `<Response>` or is nested inside
  the outcome element — so a consumer dispenses the change, not the original request. Reason fields
  (`code`/`referenceNumber`/`denialReason`/`note`) are surfaced verbatim.
- Covers SCRIPT `v2017071` + `v2022011`. Warnings remain a stable code + XPath position only, never a
  field value (PHI-safe). Two new warning codes are additive; the warning-code surface is snapshotted.
