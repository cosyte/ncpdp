---
id: build-and-serialize-messages
title: Build and serialize messages
sidebar_label: Build and serialize messages
description: "Build a SCRIPT NewRx, a SCRIPT response, or a Telecom request from plain objects, serialize it spec-clean, and handle what the builders refuse."
---

# Build and serialize messages

Each standard has builders that construct a message from plain objects and a serializer that writes
it out. A builder refuses input that could not be sent, with a typed error whose `code` names the
rule; it never writes a malformed message. A serializer never warns on a valid model.

## Build a SCRIPT NewRx

`buildNewRx` takes the header, the parties, and the medication, and returns a `ScriptMessage`.
`serializeScript(message)` and `message.toString()` both write the XML.

```ts runnable
import { buildNewRx, newRx, parseScript, serializeScript } from "@cosyte/ncpdp/script";

const message = buildNewRx({
  header: { version: "2017071", messageId: "SYNTH-MSG-0100" },
  patient: { name: { lastName: "TESTPATIENT", firstName: "AVERY" } },
  medication: {
    description: "Amoxicillin 500 MG Oral Capsule",
    sigText: "Take 1 capsule by mouth.",
  },
});

const xml = serializeScript(message);
xml.startsWith('<Message version="2017071">'); // => true
xml.includes("<DrugDescription>Amoxicillin 500 MG Oral Capsule</DrugDescription>"); // => true

// Reading the output back gives the same model.
newRx(parseScript(xml))?.medication?.description; // => "Amoxicillin 500 MG Oral Capsule"
```

## Build a SCRIPT response

`buildScriptResponse` writes a `<Status>`, `<Error>`, or `<Verify>`. Tie it to the request with
`relatesToMessageId`.

```ts runnable
import { buildScriptResponse, error } from "@cosyte/ncpdp/script";

const response = buildScriptResponse({
  kind: "Error",
  code: "900",
  description: "Prescriber identifier could not be validated.",
  header: { version: "2017071", relatesToMessageId: "SYNTH-MSG-0100" },
});

response.disposition; // => "error"
response.correlatesTo; // => "SYNTH-MSG-0100"
error(response)?.code; // => "900"
response.toString().includes("<Code>900</Code>"); // => true
```

## Build a Telecom request

`buildTelecomRequest` takes the header fields and the segments; `serializeTelecom` writes the fixed
header, pads each header field to its wire width, and frames the segments.

```ts runnable
import { buildTelecomRequest, parseTelecom, serializeTelecom } from "@cosyte/ncpdp/telecom";

const wire = serializeTelecom(
  buildTelecomRequest({
    header: { transactionCode: "B1", binNumber: "999999", dateOfService: "20260115" },
    segments: [{ segmentId: "07", fields: [{ id: "D2", value: "RX0000001" }] }],
  }),
);

wire.slice(0, 6); // => "999999"
wire.slice(6, 10); // => "D0B1"

// Canonical form: parsing and serializing again gives the same bytes.
serializeTelecom(parseTelecom(wire)) === wire; // => true
```

The version defaults to `D0`. Emit reproduces the **modeled** content, not the original bytes of a
parsed message: `serialize(parse(serialize(x)))` is byte-identical to `serialize(x)`, while padding,
whitespace, and duplicate separators of an original are not kept.

## Handle a refusal

A builder throws `NcpdpScriptBuildError` or `NcpdpTelecomBuildError`. The `code` names the rule, and
the message is a fixed sentence that never echoes the input, so both are safe to log. Each entry
point is its own bundle, so an error class from one entry point is a different class from the one
another entry point throws, and `instanceof` answers `false` across them. `@cosyte/ncpdp/telecom`
exports both Telecom error classes, so import a Telecom builder and its error class together from
there or together from the package root. `@cosyte/ncpdp/script` exports no error class, and the
classes from `@cosyte/ncpdp` and `@cosyte/ncpdp/common` are not the ones it throws: for a SCRIPT
function from `/script`, check `err.name` and `err.code`, or import the function and its error class
together from the package root. Checking `err.name` and `err.code` works from any entry point.

```ts runnable
import { NcpdpTelecomBuildError, buildTelecomRequest } from "@cosyte/ncpdp/telecom";

let code: string | undefined;
try {
  buildTelecomRequest({
    header: { transactionCode: "B1" },
    // A field separator inside a value would corrupt the framing.
    segments: [{ segmentId: "07", fields: [{ id: "D2", value: "RX\x1c0000001" }] }],
  });
} catch (err) {
  if (err instanceof NcpdpTelecomBuildError) code = err.code;
}

code; // => "NCPDP_TELECOM_BUILD_EMBEDDED_CONTROL_CHARACTER"
```

The SCRIPT serializer also refuses one model: a message whose body is a transaction this library
does not model (`body.kind === "unsupported"`). Nothing under it is modeled, so the only document it
could write is one with the body deleted. Branch on `body.kind` first and relay the original bytes:

```ts runnable
import { parseScript } from "@cosyte/ncpdp/script";

const original = '<Message version="2017071"><Body><RxFill/></Body></Message>';
const msg = parseScript(original);

msg.body.kind; // => "unsupported"
const out = msg.body.kind === "unsupported" ? original : msg.toString();
out === original; // => true
```

Calling `serializeScript(msg)` or `msg.toString()` on it throws `NcpdpScriptBuildError` with
`NCPDP_SCRIPT_BUILD_UNSUPPORTED_TRANSACTION`, and that includes an implicit string conversion in a
template literal or a log line.

[Diagnostic codes](./diagnostic-codes.md#build-codes) lists every refusal. Reference:
[`buildNewRx`](./api/@cosyte/ncpdp.md#buildnewrx),
[`buildScriptResponse`](./api/@cosyte/ncpdp.md#buildscriptresponse),
[`serializeScript`](./api/@cosyte/ncpdp.md#serializescript),
[`buildTelecomRequest`](./api/@cosyte/ncpdp.md#buildtelecomrequest), and
[`serializeTelecom`](./api/@cosyte/ncpdp.md#serializetelecom).

## Next

- [Serializers and builders](./spec-notes-serialize-build.md): the canonical form, the XML escaping,
  and each refusal beside the rule it enforces.
- [Bill a claim and read the answer](./bill-a-claim-and-read-the-answer.md): a builder used end to
  end.
