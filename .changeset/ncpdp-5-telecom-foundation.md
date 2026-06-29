---
"@cosyte/ncpdp": patch
---

NCPDP-5 — Telecom foundation + B1 billing-claim read (the second, zero-dep standard).

- **`@cosyte/ncpdp/telecom`** — opens the Telecommunication Standard (vD.0) claim side with
  `parseTelecom(raw: string | Buffer, opts?): TelecomTransaction` and a `claim(t): TelecomClaim | undefined`
  B1/B2/B3 request view. Zero runtime deps, mirroring `@cosyte/hl7`.
- **Framing + fixed header.** Validates the FS/GS/RS (0x1C/0x1D/0x1E) control-character framing and
  decodes the fixed 56-byte Transaction Header (BIN, Version/Release, Transaction Code, PCN, Transaction
  Count, Service Provider ID + Qualifier, Date of Service, Software/Cert ID). Identifier leading zeros
  are preserved; pad whitespace is trimmed.
- **Field-id-keyed segments.** Tokenizes the Segment-Identification-keyed (`AM`) variable segments and
  surfaces a B1 view: Patient (DOB, gender), Insurance (group, cardholder, person code), Claim
  (Rx reference + qualifier, fill, product, quantity, days supply, DAW) and Prescriber (id + qualifier).
- **Quantity Dispensed is never a float.** The implied 3-place decimal (NCPDP `9(7)v999`) is applied
  **string-wise** — `"30000"` surfaces as `"30.000"` alongside the verbatim source; days supply is a
  decimal-safe value.
- **Fail-safe by contract.** Missing header → `NCPDP_TELECOM_NO_HEADER`; unframeable body →
  `NCPDP_TELECOM_INVALID_FRAMING` (a separator is never guessed); an untrusted version stamp →
  `NCPDP_TELECOM_UNSUPPORTED_VERSION`; empty input → `EMPTY_INPUT`. The **F6** stamp is recognized but
  **not decoded** (its header layout differs from D.0), surfaced via `NCPDP_TELECOM_VF6_NOT_DECODED`.
  Unknown segments/fields, a missing `AM`, malformed tokens, and extra (truncated) transactions all
  **warn and preserve verbatim** — nothing is dropped.
- **Accuracy + PHI.** Round-trip/lenient/byte-fuzz #1 property tests plus synthetic Tier-1 B1 fixtures;
  warning + fatal code surfaces snapshotted. Synthetic-only fixtures; warnings carry a stable code +
  byte offset + field id, never a field value (PHI-safe). Spec traceability in
  `docs-content/spec-notes-telecom.md`. Responses, B2/B3 views, E1, compound, and COB land in later
  phases; no serializer yet.
