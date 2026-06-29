# @cosyte/ncpdp

> NCPDP parser, serializer, and builder for Node.js and TypeScript — **lenient on parse,
> spec-clean on emit**.

[![npm version](https://img.shields.io/npm/v/@cosyte/ncpdp.svg)](https://www.npmjs.com/package/@cosyte/ncpdp)
[![CI](https://img.shields.io/github/actions/workflow/status/cosyte/ncpdp/ci.yml?branch=main&label=CI)](https://github.com/cosyte/ncpdp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)

`@cosyte/ncpdp` is a TypeScript toolkit that follows the cosyte parser archetype: a lenient
parser that turns real-world, vendor-quirky input into **warnings** rather than failures, paired with
a serializer that always emits spec-clean output (Postel's Law). It mirrors the API shape of the
reference parser, [`@cosyte/hl7`](https://github.com/cosyte/hl7).

NCPDP is two structurally unrelated standards under one brand, shipped via subpath exports:

- `@cosyte/ncpdp/script` — **SCRIPT** (XML ePrescribing, v2017071 + v2022011)
- `@cosyte/ncpdp/telecom` — **Telecommunication** claim standard (vD.0) — _planned_
- `@cosyte/ncpdp/common` — shared vocabulary (NDC, decimal, code systems, warning/fatal codes)

> **Status:** pre-alpha (`0.0.x`), not yet published to npm. The SCRIPT side currently delivers a
> structural read of the **NewRx** transaction, the **response spine** (`Status` / `Error` /
> `Verify` + correlation), and the **prescription-lifecycle** transactions (renewal / change /
> cancel, request + response); the Telecom side and a serializer land in later phases.

## Install

```bash
npm install @cosyte/ncpdp
```

## Parse a SCRIPT NewRx

```ts
import { parseScript, newRx } from "@cosyte/ncpdp/script";

const msg = parseScript(xml);

msg.header.messageId; // routing/correlation header
msg.warnings; // stable, XPath-positioned tolerance warnings (never throws on quirks)

const rx = newRx(msg); // the NewRx body, or undefined for other transactions
rx?.patient?.name?.lastName;
rx?.medication?.description;
rx?.medication?.coded?.productCode?.system; // "NDC" | "RXNORM" | …
```

The parser is **lenient by default** — vendor quirks become warnings, not failures. Only
unrecoverable structural corruption (empty input, non-XML, a non-`<Message>` root, or a pre-XML
legacy version) throws a typed `NcpdpScriptParseError`.

## Read a SCRIPT response (Status / Error / Verify)

Every SCRIPT transaction is answered. The response spine reads the three acknowledgment
transactions and exposes the disposition without ever reading an `Error` as a success.

```ts
import { parseScript, status, error, verify } from "@cosyte/ncpdp/script";

const msg = parseScript(responseXml);

msg.disposition; // "success" (Status) | "error" (Error) | "verify" (Verify) | undefined
msg.correlatesTo; // the answered request's MessageID (<RelatesToMessageID>)

error(msg)?.code; // the Error code, verbatim — never reformatted or looked up
status(msg)?.description; // the positive-ack description, verbatim
verify(msg)?.code;
```

- **An `Error` never reads as success.** `disposition` is derived only from the response body kind,
  so a failure cannot be coerced to `"success"`. If a malformed message carries more than one
  response body, the most conservative disposition (`Error` first) wins and a
  `NCPDP_SCRIPT_RESPONSE_AMBIGUOUS_DISPOSITION` warning is raised.
- **Codes and descriptions are surfaced verbatim** — `<Code>`, `<DescriptionCode>`, and
  `<Description>` are read as-is; the library bundles no NCPDP code→meaning table.

## Read a SCRIPT lifecycle transaction (renewal / change / cancel)

A prescription has a lifecycle after the NewRx: the pharmacy can ask to renew or change it, the
prescriber can cancel it, and each request is answered. The lifecycle reader projects the request
bodies and reads the prescriber's decision **fail-safe** — a denial can never be mistaken for an
approval.

```ts
import { parseScript, rxRenewalResponse, approvalOf } from "@cosyte/ncpdp/script";

const msg = parseScript(responseXml);

const resp = rxRenewalResponse(msg); // or rxChangeResponse / cancelRxResponse
resp?.outcome; // "approved" | "approvedWithChanges" | "denied" | "deniedNewToFollow" | "replace" | "validated" | "unknown"
approvalOf(resp!.outcome); // "affirmative" | "negative" | "indeterminate"

// On an approvedWithChanges, this is the CHANGED medication — dispense this, not the request.
resp?.medicationPrescribed?.description;
resp?.reason?.code; // denial/reason code, verbatim
```

- **A `<Denied>` is never read as an approval.** `outcome` is detected only from the `<Response>`
  choice element; an unrecognized or absent outcome reads as `"unknown"` (never assumed approved,
  raising `NCPDP_SCRIPT_LIFECYCLE_OUTCOME_UNRECOGNIZED`), and a malformed response carrying more than
  one outcome resolves **denial-first** and raises `NCPDP_SCRIPT_LIFECYCLE_AMBIGUOUS_OUTCOME`.
- **`approvedWithChanges` carries the changed medication** — read `medicationPrescribed` to dispense
  the change rather than the original request. It is found whether it sits beside `<Response>` or is
  nested inside the outcome element.
- Request bodies (`rxRenewalRequest`/`rxChangeRequest`/`cancelRx`) project patient, pharmacy,
  prescriber, and medication with the same semantics as NewRx.

## Decode the structured SIG (lossy, labeled)

A medication's directions can arrive as free text **and** as a structured `<Sig>`. The structured
decode is **best-effort and explicitly lossy** — the free-text `SigText` stays the source of truth and
is always preserved verbatim; the structured view is additive and every field is provenance-tagged.

```ts
import { parseScript, newRx } from "@cosyte/ncpdp/script";

const sig = newRx(parseScript(xml))?.medication?.sig;

sig?.sigText; // the free-text directions, verbatim — ALWAYS authoritative
sig?.hasStructuredData; // false when the <Sig> carried only free text

sig?.route.provenance; // "coded" | "derived" | "absent"
sig?.route.code?.system; // "SNOMED" | "NCI" | … when coded
sig?.route.text; // verbatim text when present
sig?.dose.text; // the dose quantity, string-preserved (never a float, never guessed)
```

- **The free text is never overwritten or reconciled.** When the structured dose and the free text
  disagree, **both** are surfaced as-is — the library never collapses the disagreement into one answer.
- **Per-field provenance.** Every component (`doseDeliveryMethod`, `dose`, `doseUnitOfMeasure`, `route`,
  `siteOfAdministration`, `administrationTiming`, `duration`, `vehicle`, `indication`,
  `maximumDoseRestriction`) is tagged `coded` / `derived` / `absent`. An absent field is **not** inferred
  from the free text.
- **Ambiguous doses are never guessed.** If a dose structure is present but no unambiguous quantity can
  be read, the dose is surfaced as `absent` and `NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE` is raised. Whenever any
  structured component decodes, `NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY` flags the additive, lossy view.
- **Decode-only.** v1 does not _generate_ a SIG from structure, and does not parse arbitrary
  natural-language directions. See `docs-content/spec-notes-structured-sig.md`.

### Safety and PHI

- **XXE-safe by construction.** The SCRIPT loader refuses any input carrying a `<!DOCTYPE>`/`<!ENTITY>`
  declaration and disables entity resolution — no external-entity or billion-laughs vector.
- **Warnings never carry field values.** Each warning carries a stable code and an XPath position
  (e.g. `/Message/Body/NewRx/MedicationPrescribed`) only — never patient or drug data.

### A note on dependencies

The Telecom side is **zero-dependency** (Node stdlib only). The SCRIPT side takes a single, vetted
runtime dependency — [`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser) —
for safe, namespace-aware XML parsing, ratified in [`docs/adr/0001-xml-parser.md`](./docs/adr/0001-xml-parser.md).

## The cosyte parser archetype

- **Postel's Law** — liberal parser (lenient default + warnings), conservative serializer (always
  spec-clean), so quirks don't propagate downstream on round-trip.
- **Tiered tolerance** — Tier 0/1 silent, Tier 2 warning + recovery (escalates in strict mode),
  Tier 3 fatal always.
- **Stable warning codes** — warnings carry stable string codes + positional context; consumers
  branch on `w.code`, so renaming a code is a breaking change.
- **Zero runtime dependencies** — Node stdlib only (healthcare integrations vet every dependency).
- **Dual ESM + CJS** — built with `tsup`, validated with `attw`.
- **Immutability** — parsed models are immutable; mutation is via explicit methods.
- **Profile system** — a `defineProfile()` API for vendor quirks (to be added), with built-in
  profiles authored through the same public API.

## License

MIT © Cosyte
