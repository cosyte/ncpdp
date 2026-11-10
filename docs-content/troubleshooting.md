---
id: troubleshooting
title: Troubleshooting and known limitations
sidebar_label: Troubleshooting
description: "What to do when a parse throws, a field reads undefined, or an emit is refused, and what the package deliberately does not do."
---

# Troubleshooting and known limitations

Each entry below is a symptom, what causes it, and what to do. [Diagnostic codes](./diagnostic-codes.md)
lists every code with what the reader did when it raised it.

## A parse throws

Only structural corruption throws, so a throw means the input is not a message this package can
read at all. Catch the two error classes at the parse boundary and read `.code`:

- **`NcpdpScriptParseError`**: `EMPTY_INPUT`, `NCPDP_SCRIPT_NOT_XML` (which includes any
  `<!DOCTYPE>` or `<!ENTITY>`, refused by design), `NCPDP_SCRIPT_NO_MESSAGE_ROOT`, or
  `NCPDP_SCRIPT_UNSUPPORTED_VERSION` (a pre-XML version). Check that you are passing the XML
  document itself, not a wrapper around it, and that it has no document type declaration.
- **`NcpdpTelecomParseError`**: `EMPTY_INPUT`, `NCPDP_TELECOM_NO_HEADER`,
  `NCPDP_TELECOM_INVALID_FRAMING`, or `NCPDP_TELECOM_UNSUPPORTED_VERSION`. The most common cause of
  `NCPDP_TELECOM_INVALID_FRAMING` is control characters lost on the way in: a transport or a text
  editor that strips bytes `0x1C` to `0x1E` leaves a body with no separators, and the reader never
  guesses one.

```ts runnable throws
import { parseTelecom } from "@cosyte/ncpdp/telecom";

const pad = (v: string, n: number) => v.padEnd(n).slice(0, n);

// A valid fixed D.0 header (vD.0, B1) followed by a body carrying no FS/GS/RS framing bytes.
const header =
  pad("999999", 6) +
  pad("D0", 2) +
  pad("B1", 2) +
  pad("PCN0000000", 10) +
  pad("1", 1) +
  pad("01", 2) +
  pad("1234567890", 15) +
  pad("20260629", 8) +
  pad("SW00000000", 10);

parseTelecom(header + "PLAINBODYNOFRAMINGBYTES");
// throws NcpdpTelecomParseError (NCPDP_TELECOM_INVALID_FRAMING): a separator is never guessed
```

If you read Telecom bytes from a file or a socket, pass the `Buffer` to `parseTelecom` (it is read
as latin1) rather than decoding it as UTF-8 yourself.

## A Telecom response is refused with `NCPDP_TELECOM_UNSUPPORTED_VERSION`

A response leads with its Version/Release at the first byte. The reader treats a transmission as a
response only when that stamp is `D0`, so a response stamped `F6` is read at the request offsets and
refused. An `F6` **request** is not refused: it parses, raises `NCPDP_TELECOM_VF6_NOT_DECODED`, and
reads no positional field. The [Conformance statement](./conformance.md) gives the outcome for each
stamp and direction, and the date the decoded version's adoption ends.

## A field reads `undefined`

- **The view does not apply.** `newRx`, `status`, `claim`, `adjudication`, and the other views return
  `undefined` for a transaction of another kind: `adjudication` on a request, `newRx` on a response.
  Check `msg.body.kind` or `t.kind` first.
- **The element or field was absent.** Look for `NCPDP_SCRIPT_MISSING_REQUIRED_ELEMENT` on a SCRIPT
  message; its position is the XPath of the gap.
- **The field is in a later transaction.** Pass the index: `claim(t, 1)`, `adjudication(t, 1)`.
- **The version stamp is recognized but not decoded.** An `F6` request reads no positional field and
  decodes no transaction.
- **A structured SIG component reads `absent`.** Five components have no grounded element name and
  always read `absent`; see [Read the structured SIG](./read-the-structured-sig.md).

## A code has no description

Reject codes, response statuses, and product qualifiers come back as the wire code, with no
description, and an unrecognized reject code carries `known: false` and
`NCPDP_TELECOM_UNKNOWN_REJECT_CODE`. That is by design: a label ships only where a public source
establishes it. Map the codes with the payer sheets or code lists you are licensed to use.

## A default profile or an error class has no effect

Each entry point (`@cosyte/ncpdp` and its four subpaths) is its own bundle, with its own copy of the
module state and the classes. Two things follow:

- **A default profile set through one entry point does not reach a parser from another.**
  `setDefaultProfile` from `@cosyte/ncpdp/profiles` does not change what `parseScript` from
  `@cosyte/ncpdp/script` attaches. Import both from the same entry point; the root exports both.
- **`instanceof` fails across entry points.** `NcpdpTelecomBuildError` from `@cosyte/ncpdp` is not the
  class a builder from `@cosyte/ncpdp/telecom` throws. Import the error class from the entry point
  the function came from, or check `err.name` and `err.code`.

## A warning fires on every message from one partner

The partner's convention is predictable, so describe it with a profile and alert only on the
warnings it does not predict. See [Triage warnings with a profile](./triage-warnings-with-profiles.md).

## An emit is refused

- **`NCPDP_SCRIPT_BUILD_UNSUPPORTED_TRANSACTION`** from `serializeScript` or `toString()`, including
  from a template literal or a log line: the body is a transaction this library does not model.
  Branch on `body.kind === "unsupported"` and relay the original bytes.
- **`NCPDP_TELECOM_BUILD_MULTI_TRANSACTION_EMIT`**: the model holds more than one decoded
  transaction, and the serializer writes one per transmission. Serialize one transaction at a time.
- Any other build code names the input rule broken; see
  [Diagnostic codes](./diagnostic-codes.md#build-codes).

## Known limitations and non-goals

- **Whole-message only: no streaming.** Both parsers read a complete message; there is no incremental
  or streaming API.
- **Telecom: which version is decoded is stated once, and the answer has a direction.** An `F6`
  stamp on a **request** is _recognized but not decoded_ (`NCPDP_TELECOM_VF6_NOT_DECODED`); the
  bytes are preserved but no positional field is lifted. The same stamp on a **response** is
  refused (`NCPDP_TELECOM_UNSUPPORTED_VERSION`), because a response leads with its Version/Release
  and that is not where this reader looks for the stamp. Which version is decoded, the outcome per
  direction, and the date that adoption ends are in the [Conformance statement](./conformance.md).
- **Telecom emit is one transaction per transmission.** Each decoded transaction is at
  `t.transactions[n]`, with the views taking that index, but `serializeTelecom` writes one, so a
  model carrying more than one decoded transaction is refused with
  `NCPDP_TELECOM_BUILD_MULTI_TRANSACTION_EMIT` rather than emitted with the rest dropped. A declared
  Transaction Count that disagrees with the number decoded raises
  `NCPDP_TELECOM_TRANSACTION_COUNT_MISMATCH`; no maximum count is enforced.
- **SCRIPT decodes the XML-era standard**; pre-XML legacy SCRIPT is a fatal, not a tolerated read.
  Which XML-era versions, and until when, is in the [Conformance statement](./conformance.md).
- **The SIG is decode-only.** The library reads a structured `<Sig>` best-effort; it does **not**
  _generate_ a SIG from structure, and does not parse arbitrary natural-language directions.
- **No bundled NCPDP code-to-meaning table.** Codes and descriptions (`<Code>`, reject codes, status
  values) are surfaced **verbatim**; the library ships no lookup of NCPDP-copyrighted descriptions.
  Recognized _code systems_ (NDC, RxNorm, and SNOMED CT through the wire qualifier) are the
  exception. Those are widely known identifiers, not copyrighted prose.
- **Profiles are descriptive, not transformative.** Attaching a trading-partner profile surfaces
  `msg.profile` or `tx.profile` and powers `partitionWarnings`, but it **never alters the parse**:
  profile-on output is identical to profile-off.
- **No `strict` mode yet.** A mode that escalates every tolerated deviation to a thrown error is not
  shipped; today the model is lenient-with-warnings only.
- **EPCS is out of scope.** Electronic Prescribing of Controlled Substances (DEA-regulated digital
  signatures, HSM integration) belongs in a separate package.
- **Not differentially tested against a reference implementation.** NCPDP redistribution limits
  exclude differential testing against a licensed reference parser; conformance is tested against
  synthetic fixtures and the structure of the standard, not an oracle. Validate against your actual
  trading partner before trusting a production interface.

The full list is in
[`KNOWN-LIMITATIONS.md`](https://github.com/cosyte/ncpdp/blob/main/KNOWN-LIMITATIONS.md).

## What the version number promises

`@cosyte/ncpdp` is on the 0.1 line, and its public API is settled. While the version is below `1.0.0`,
a breaking change ships in a new minor version, never a patch, and the changelog says what broke and
what to do instead. The **warning codes** and **fatal codes** are public API: renaming one is a
breaking change. A caret range such as `^0.1.0` takes fixes and nothing that breaks. Two surfaces are
still moving, both additively: the structured SIG view and the wire-code label tables.

## Next

- [Diagnostic codes](./diagnostic-codes.md): every code named above, with what the reader did.
- [Conformance statement](./conformance.md): what is decoded on each wire format, the section
  adopting it, and the date that adoption ends.
- [How the parser reads safely](./fail-safe-reading.md): the fail-safe rules behind the behavior
  above.
