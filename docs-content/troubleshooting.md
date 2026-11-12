---
id: troubleshooting
title: Troubleshooting
sidebar_label: Troubleshooting
description: "What to do when a parse throws, a field reads undefined, or an emit is refused, and where the package's limits are listed."
---

# Troubleshooting

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
  `@cosyte/ncpdp/script` attaches. Only the package root exports both `setDefaultProfile` and a
  parser, so import them together from `@cosyte/ncpdp`; `/script` and `/telecom` do not export
  `setDefaultProfile`. With a parser from a subpath, pass `{ profile }` on each call.
- **`instanceof` fails across entry points.** `NcpdpTelecomBuildError` from `@cosyte/ncpdp` is not the
  class a builder from `@cosyte/ncpdp/telecom` throws. `/telecom` exports both Telecom error classes,
  so import a Telecom function and its error class from the same one of `/telecom` or the root.
  `/script` exports no error class, and the classes from the root and `/common` fail `instanceof`
  against what a `/script` function throws: check `err.name` and `err.code`, or import the SCRIPT
  function and its error class together from the root.

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

## Limits of the package

What the package does not do, by design, is one list: [Limitations and non-goals](./limitations.md).
A symptom above that traces to a boundary there is not a bug.

## What the version number promises

While the version is below `1.0.0`, every release is a patch. A breaking or narrowing change ships
as a patch whose changelog entry states the change and what a caller must do. The **warning codes**
and **fatal codes** are public API: renaming one is a breaking change and is released that way.
Because a patch can carry a break, a caret range such as `^0.1.0` does not protect you: pin the exact
version, and read the changelog entry before you raise it. Two surfaces are still moving, both
additively: the structured SIG view and the wire-code label tables.

## Next

- [Diagnostic codes](./diagnostic-codes.md): every code named above, with what the reader did.
- [Conformance statement](./conformance.md): what is decoded on each wire format, the section
  adopting it, and the date that adoption ends.
- [How the parser reads safely](./fail-safe-reading.md): the fail-safe rules behind the behavior
  above.
