---
id: intro
title: Getting started
sidebar_position: 1
---

# @cosyte/ncpdp

Parse real-world, vendor-quirky NCPDP and pull fields out in one line — without reading the
(paywalled) spec. `@cosyte/ncpdp` is a TypeScript toolkit following the cosyte parser archetype: a
lenient parser, an immutable model, a spec-clean serializer, and a descriptive profile system for
vendor quirks. It mirrors the API shape of the reference parser, [`@cosyte/hl7`](https://github.com/cosyte/hl7).

> **Status:** pre-alpha, published to npm at `0.0.1` (public, on the `0.0.x` ladder until first
> alpha). The **shipped** surface is the
> SCRIPT read + serialize/build side, the Telecom read (request + response) + serialize/build side,
> the shared value vocabulary, and the trading-partner profile system. This documentation is gated to
> that surface — where the parser does not yet do a thing, this site says so rather than promising it.
> Streaming, SIG _generation_, and EPCS are explicit non-goals for v1; see
> [Troubleshooting & known limitations](./troubleshooting).

## Two standards, one package

NCPDP is two structurally unrelated standards under one brand. Each ships as its own subpath export,
so a Telecom-only or SCRIPT-only consumer stays lean:

- **`@cosyte/ncpdp/script`** — the **SCRIPT** ePrescribing standard (XML; `v2017071` / `v2022011`):
  `parseScript`, the `newRx` and lifecycle projections, the response spine, the structured-SIG decode,
  plus `serializeScript` / `buildNewRx` / `buildScriptResponse`.
- **`@cosyte/ncpdp/telecom`** — the **Telecommunication** claim standard (vD.0; fixed-field text with
  FS/GS/RS framing): `parseTelecom`, the `claim` request view, the `adjudication` response view, the
  compound / COB / DUR / prior-authorization reads, plus `serializeTelecom` / `buildTelecomRequest`.
- **`@cosyte/ncpdp/common`** — the shared value vocabulary: NDC, decimal-safe money/quantity, code
  systems, warning/fatal types.
- **`@cosyte/ncpdp/profiles`** — the descriptive trading-partner profile system.

The package root (`@cosyte/ncpdp`) re-exports the SCRIPT, Telecom, and common surfaces for
convenience; deep subpath imports are equivalent.

## Install and smoke-test

```bash
npm install @cosyte/ncpdp
```

Confirm the package resolves and its version symbol is present:

```ts runnable
import { VERSION } from "@cosyte/ncpdp";

typeof VERSION; // => "string"
```

If that resolves, the install is good — head to the [Installation](./installation) page for
prerequisites and module-system notes, then the [Quickstart](./quickstart) for a first useful result.

## The archetype in one line

The parser is **lenient by default** — vendor quirks become stable-coded `warnings` with positional
context (byte offset for Telecom, XPath for SCRIPT), not failures — while the serializer always emits
spec-clean output (Postel's Law). Only unrecoverable structural corruption throws a typed error.
Safety-critical dispositions are **fail-safe**: a failure is never quietly read as a success, and
money is never a float.

## Next

- [Installation](./installation) — prerequisites, the XML-parser dependency, module systems.
- [Quickstart](./quickstart) — parse a SCRIPT NewRx and a Telecom claim end to end.
- [Core Concepts](./spec-notes-telecom) — the implementation notes behind each read.
- [Guides](./cookbook) — task-oriented recipes for the common reads.
- The **API Reference** documents every export, generated from source.
