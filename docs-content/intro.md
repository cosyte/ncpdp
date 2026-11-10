---
id: intro
title: Overview
sidebar_label: Overview
description: "What @cosyte/ncpdp reads and writes, how its subpath exports split the two NCPDP standards, and where to start."
---

# @cosyte/ncpdp

`@cosyte/ncpdp` is our TypeScript parser, serializer, and builder for the two NCPDP standards a
pharmacy system meets: **SCRIPT**, the XML ePrescribing standard, and **Telecommunication**, the
fixed-field pharmacy claim standard. It reads real-world, vendor-quirky messages into an immutable
model you can pull fields from in one line, without reading the purchased implementation guides,
and it writes spec-clean messages back.

It is for developers building pharmacy, prescribing, and claims software in Node.js. It is not a
switch, a claims clearinghouse, or a terminology service: it reads and writes messages, and leaves
routing, adjudication, and code meanings to the systems that own them.

> **Status:** on the 0.1 line, published to npm. While the version is below `1.0.0`, a breaking
> change ships in a new minor version, never a patch, and the changelog says so. Streaming, SIG
> _generation_, and EPCS are out of scope; see [Troubleshooting](./troubleshooting.md#known-limitations-and-non-goals).

## Two standards, one package

NCPDP is two structurally unrelated standards under one name. Each ships as its own subpath export,
so a Telecom-only or SCRIPT-only consumer stays lean:

- **`@cosyte/ncpdp/script`**, the **SCRIPT** ePrescribing standard (XML): `parseScript`, the
  `newRx` and lifecycle projections, the response spine, the structured-SIG decode, and
  `serializeScript`, `buildNewRx`, and `buildScriptResponse`.
- **`@cosyte/ncpdp/telecom`**, the **Telecommunication** claim standard (fixed-field text with
  FS/GS/RS framing): `parseTelecom`, the `claim` request view, the `adjudication` response view,
  the compound, COB, DUR, and prior-authorization reads, and `serializeTelecom` and
  `buildTelecomRequest`.
- **`@cosyte/ncpdp/common`**, the shared value vocabulary: NDC, decimal-safe money and quantity,
  code systems, dates, and the warning and fatal types.
- **`@cosyte/ncpdp/profiles`**, the descriptive trading-partner profile system.

The package root (`@cosyte/ncpdp`) re-exports every export of all four subpaths: SCRIPT, Telecom,
common, and profiles. Import from the root, or from a subpath to keep a Telecom-only or SCRIPT-only
consumer lean.

**Which version of each standard is decoded, and for how long, is one document.** The version, the
section of public law that adopts it, the date that adoption ends, and the fact that no third party
has tested this package are stated once in the [Conformance statement](./conformance.md) and are not
restated on this page.

## How it reads and writes

The parser is **lenient by default**: vendor quirks become stable-coded `warnings` with positional
context (a byte offset for Telecom, an XPath for SCRIPT), not failures. The serializer always emits
spec-clean output. Only unrecoverable structural corruption throws a typed error. Safety-critical
dispositions are **fail-safe**: a failure is never quietly read as a success, and money is never a
float. [How the parser reads safely](./fail-safe-reading.md) explains each of those rules.

## Where to go next

- [Installation](./installation.md): prerequisites, the one runtime dependency, and module systems.
- [Quickstart](./quickstart.md): read a SCRIPT NewRx and a Telecom claim end to end.
- [Bill a claim and read the answer](./bill-a-claim-and-read-the-answer.md): a tutorial from an
  empty file to a paid and a rejected claim.
- The how-to guides, one task each: [read a NewRx](./read-a-newrx.md),
  [read a SCRIPT response](./read-script-responses.md),
  [read renewals, changes, and cancels](./read-renewals-changes-and-cancels.md),
  [read the structured SIG](./read-the-structured-sig.md),
  [read a Telecom claim](./read-a-telecom-claim.md),
  [read a PBM response](./read-a-pbm-response.md),
  [read compounds, other payers, DUR, and prior authorization](./read-compound-cob-and-dur.md),
  [build and serialize messages](./build-and-serialize-messages.md),
  [convert dates](./convert-dates.md), and
  [triage warnings with a profile](./triage-warnings-with-profiles.md).
- [Diagnostic codes](./diagnostic-codes.md): every fatal, warning, and build code.
- [Troubleshooting](./troubleshooting.md): symptoms, their causes, and the known limitations.
- The [API reference](./api/README.md), generated from the TSDoc comments in the source.
- [Testing and quality](./testing-and-quality.md) and [Performance](./performance.md): how we test
  the package and what we measure.
