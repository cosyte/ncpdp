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
> structural read of the **NewRx** transaction plus the **response spine** (`Status` / `Error` /
> `Verify` + correlation); the Telecom side and a serializer land in later phases.

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
