---
id: spec-notes-serialize-build
title: "Spec notes: spec-clean serializers + builders + round-trip"
sidebar_label: Serializers & builders
---

# Spec notes: spec-clean serializers + builders + round-trip

These notes record exactly what the **emit** side does for both NCPDP standards (the SCRIPT XML
serializer + message builder and the Telecom FS/GS/RS serializer + transaction builder), where the
structural facts come from, and what they deliberately do **not** do. **No NCPDP-copyrighted prose is
reproduced here.** Field/segment/element labels below are our own short paraphrases; the codes and
field-number designators are factual identifiers from the NCPDP Telecommunication Standard vD.0 and
the SCRIPT Standard (paywalled), recorded against our own paraphrased names.

## What the emit side does

Closes the parse↔emit loop. Every parser already produced an immutable model; the emit side turns a
model back into spec-clean wire form and lets a caller construct one from scratch:

- **`serializeScript(message)` / `ScriptMessage#toString()`**: a parsed (or built) SCRIPT message →
  canonical SCRIPT XML, or a typed refusal when the body is a transaction this library does not
  model (see the refusals below).
- **`buildNewRx(input)` / `buildScriptResponse(input)`**: construct a SCRIPT NewRx or a
  `<Status>`/`<Error>`/`<Verify>` response from a structured input.
- **`serializeTelecom(transaction)`**: a parsed (or built) Telecom transaction → canonical vD.0 wire
  form (fixed header + FS/GS/RS-framed body).
- **`buildTelecomRequest(input)`**: construct a vD.0 request transaction (fixed header + segments).

This is the conservative (emit) half of Postel's Law: the serializer **never warns** on a valid model,
and the builder **refuses** a message that is invalid by construction with a typed error rather than
emitting malformed output a downstream system would reject.

## Canonical form, not byte-identity

The read is **lossy** by design (only the modeled fields are surfaced) so emit reproduces the
*modeled* content, not the original bytes. The contract is **canonical-form idempotence**:

- `serialize(parse(serialize(x)))` is byte-identical to `serialize(x)`. Once a value is in canonical
  serialized form, re-parsing and re-serializing is a no-op.
- `parse(serialize(x))` is structurally equal to `x` (compared by canonical form, since the model has
  no byte-offset identity to compare).

What canonicalization normalizes:

- **SCRIPT**: the declared version is emitted as the root `<Message version="…">` attribute; wrapper
  elements the parser flattens (e.g. a `<HumanPatient>`/`<NonVeterinarian>` shell) are not
  reconstructed; indentation is regular two-space. Only modeled elements are emitted, in a fixed
  document order.
- **Telecom**: fixed-header fields are re-padded (left-justified, space-padded) to their wire widths;
  segments are re-joined with single FS/GS/RS control characters. Arbitrary input whitespace or
  duplicate separators are not reproduced.

## XML escaping + the entity boundary (SCRIPT)

The serializer escapes the text-significant characters `&`, `<`, `>` in element content and
additionally `"` in attribute values. Because the loader is XXE-safe with **entity resolution
disabled**, a value carrying a raw `&`, `<`, or `>` round-trips only when it was entity-free to begin
with; the synthetic corpus is. The builder additionally **refuses** any value carrying an XML-1.0
control character (`\x00–\x08`, `\x0B`, `\x0C`, `\x0E–\x1F`), which cannot appear in a well-formed XML
1.0 document, with `NCPDP_SCRIPT_BUILD_INVALID_CHARACTER`.

## Emit refusals (invalid-by-construction, and unmodeled-by-definition)

SCRIPT (`NcpdpScriptBuildError`):

- `NCPDP_SCRIPT_BUILD_MISSING_MEDICATION`: a NewRx with no prescribed-medication description.
- `NCPDP_SCRIPT_BUILD_MISSING_RESPONSE_CODE`: a `<Status>`/`<Error>`/`<Verify>` with no `<Code>` (the
  one field the parser itself flags as required).
- `NCPDP_SCRIPT_BUILD_INVALID_CHARACTER`: any supplied value carrying an XML-illegal control char.
- `NCPDP_SCRIPT_BUILD_UNSUPPORTED_TRANSACTION`: a message whose body is a transaction this library
  does not model (`body.kind === "unsupported"`). This one is raised by the **serializer**, not the
  builder, and it is the only refusal on that side: nothing under such a transaction is modeled, so
  the only document emit could write is a well-formed, re-parseable one with the transaction body
  deleted. It refuses instead, on every publicly reachable route, and returns no string.

The first three are the builder refusing input that is invalid by construction. The fourth is emit
refusing a model it cannot render honestly, and it applies to `serializeScript(message)` and to
`ScriptMessage#toString()` alike. Because `toString()` is the message object's own string conversion,
it also runs on implicit coercion, so the refusal can surface from a template literal or a log line
where the calling code contains no visible serialize call. Branch on the discriminant first: it is
public, typed, and never throws.

```ts runnable
import { parseScript } from "@cosyte/ncpdp/script";

const msg = parseScript(
  '<Message version="2017071"><Body><SomeVendorExtension/></Body></Message>',
);
msg.body.kind; // => "unsupported"
// Relay the original bytes for a transaction this library does not model.
const wire = msg.body.kind === "unsupported" ? "the original document" : msg.toString();
wire; // => "the original document"
```

```ts runnable throws
import { parseScript, serializeScript } from "@cosyte/ncpdp/script";

// A transaction this library does not model. No string comes back: the only
// document emit could write is one with the transaction body deleted.
serializeScript(parseScript('<Message version="2017071"><Body><RxFill/></Body></Message>'));
// throws NcpdpScriptBuildError (NCPDP_SCRIPT_BUILD_UNSUPPORTED_TRANSACTION)
```

All four carry the code and the fixed sentence its frozen registry entry holds, and nothing from the
input; they are safe to log whole.

Telecom (`NcpdpTelecomBuildError`):

- `NCPDP_TELECOM_BUILD_MISSING_TRANSACTION_CODE`: no Transaction Code (103-A3); a request cannot route.
- `NCPDP_TELECOM_BUILD_MISSING_SEGMENT_ID`: a segment with no Segment Identification (111-AM) code.
- `NCPDP_TELECOM_BUILD_INVALID_FIELD_ID`: a data field whose id is not a 2-character identifier.
- `NCPDP_TELECOM_BUILD_EMBEDDED_CONTROL_CHARACTER`: an FS/GS/RS control char inside supplied data,
  which would corrupt the framing.
- `NCPDP_TELECOM_BUILD_FIELD_TOO_LONG`: a fixed-width header field longer than its wire width.

## Wire layout reproduced (Telecom)

- **Request**: the 56-byte fixed Transaction Header (BIN 101-A1, Version/Release 102-A2, Transaction
  Code 103-A3, Processor Control Number 104-A4, transaction count 109-A9, Service Provider ID Qualifier
  202-B2, Service Provider ID 201-B1, Date of Service 401-D1, Software/Certification ID 110-AK)
  immediately followed by the framed body. Each segment is `AM<id>` then FS-joined `<fieldId><value>`
  tokens; segments are RS-joined.
- **Response**: the fixed Response Transaction Header region, a Group Separator introducing the
  transaction, then the RS-framed response segments. A parsed segment that lacked its `AM` field (a
  tolerated quirk) re-emits without a leading `AM`, faithfully round-tripping that shape.

## What the emit side deliberately does not do (known limitations)

- **Whole-message only, no streaming.** The builder/serializer construct a complete message in memory;
  there is no incremental/streaming emit.
- **Emit the SIG given, no SIG generation.** The SCRIPT builder emits the structured SIG / SigText it
  is handed; it does not synthesize a SIG from structured dose/route/timing components.
- **Lossy fields are not invented.** A field the parser does not model cannot be reproduced; serialize
  reflects the model, not the original document.
- **Emit an unmodeled transaction.** A transaction outside the modeled set has no body model at all,
  so there is nothing under it to reproduce and emit refuses
  (`NCPDP_SCRIPT_BUILD_UNSUPPORTED_TRANSACTION`) rather than writing an element with its children
  dropped. It also does not carry the transaction's raw markup onto the model to make it round-trip:
  that would hand every downstream package an unbounded, sender-chosen string. Relay the original
  bytes instead, and branch on `body.kind === "unsupported"` to know when to.
- **Telecom emits the first transaction.** Consistent with the parser, a multi-transaction transmission
  is modeled as its first transaction; the serializer emits the segments it holds.
