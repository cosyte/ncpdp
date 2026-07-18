---
"@cosyte/ncpdp": patch
---

Add a repo-side PHI commit-gate (`scripts/phi-scan.ts`, `pnpm phi-scan`).

A zero-dep, NCPDP-shape-aware scanner refuses fixtures / `src/` carrying real-PHI-shaped tokens across
**both** wire formats, so a developer cannot commit a real-looking NCPDP message by accident. It is
pure Node and deliberately does NOT reuse the package's own `fast-xml-parser` — a safety gate must be
independent of the code it guards.

- **SCRIPT (XML)** — an element-stack walk (case- and namespace-insensitive) flags patient AND
  prescriber `<LastName>` / `<FirstName>` / `<MiddleName>`, `<DateOfBirth>`, `<SocialSecurity>` /
  `<CardholderID>` / member-id elements, address lines, and phones. Tag-scoped, so `<BusinessName>`
  and `<DrugDescription>` never trip a name detector.
- **Telecom Standard (delimited)** — tokenizes on the NCPDP separators (FS/GS/RS) and keys off the
  self-identifying 2-char field ids (Patient First/Last Name CA/CB, DOB C4, Patient Street Address CM,
  Patient Phone CQ, Patient ID CY, Cardholder ID C2, Cardholder name CC/CD), so a corrupt Segment
  Identification cannot bypass a per-field detector. A DOB field fails **closed** — a date the
  normalizer cannot read (non-year-first renderings) is still flagged, never silently accepted.
- **Cross-cutting** — dashed SSN and non-test email anywhere.

Synthetic tokens are positively declared in `scripts/phi-allow-list.txt` (neither format can carry an
inline synthetic header — the same allow-list model as `@cosyte/hl7` / `@cosyte/x12` / `@cosyte/dicom`);
a whole-file bypass needs `--allow-fixture` **and** an audit entry in `phi-scan-overrides.md`. Runs at
pre-commit (`simple-git-hooks --staged`) and in CI (`run-phi-scan: true`); the `verify.sh` summary now
shows `phi-scan`. Tooling + tests only — no runtime or public-API change; the sole runtime dep is
untouched. No NCPDP-copyrighted spec prose is added (wire field ids + paraphrased labels only).
