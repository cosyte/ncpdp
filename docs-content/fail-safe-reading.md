---
id: fail-safe-reading
title: How the parser reads safely
sidebar_label: How the parser reads safely
description: "Why a vendor quirk is a warning and not an error, which rules hold whatever the input, and which parts of a parse result are safe to log."
---

# How the parser reads safely

This package exists to prevent one failure: **a safety-critical value read wrong and reported as
right.** A rejected claim shown as paid, a dose invented from ambiguous structure, a dollar amount
corrupted by floating point, a field read at the wrong offset. Each of those reaches a pharmacy
counter as the wrong drug, dose, or payment. The design below is a set of walls around that one
failure.

## Lenient on read, strict on write

Real NCPDP traffic does not follow the standard exactly. Senders omit elements, wrap them
differently, stamp versions the reader does not model, and add segments it has no name for. A reader
that threw on each of those would be unusable, and a reader that silently guessed would be unsafe.
So the parser does neither:

- **Only unrecoverable structural corruption throws.** Empty input, input that is not XML, a missing
  `<Message>` root, a `<!DOCTYPE>` or `<!ENTITY>` (the XXE boundary), a pre-XML SCRIPT version, a
  Telecom transmission too short for its header, a body with no framing bytes, and a Telecom version
  stamp the reader does not recognize. Each is a typed error with a stable code:
  `NcpdpScriptParseError` or `NcpdpTelecomParseError`.
- **Every other deviation is a warning.** The bytes are kept, the read goes on, and a warning with a
  stable `code` and a `position` (an XPath for SCRIPT, a byte offset for Telecom) says what the reader
  did. A warning code is public API: renaming one is a breaking change, so you can branch on it.
- **Nothing is dropped.** An unknown segment, an unknown field, a malformed token, and an unmodeled
  transaction are all kept verbatim. Each decoded transaction keeps its own segments and warnings, so
  a malformed one costs only itself.

The writer is the opposite. A serializer emits only spec-clean output, and a builder refuses input
that is invalid by construction with a typed error rather than writing something a downstream system
would reject. This split is often called Postel's Law: be liberal in what you accept and conservative
in what you send.

## The rules that hold whatever the input

These are invariants, not best-effort behaviors. The tests check each one, and the property-based
tests check the reject, Error, money, and nothing-dropped rules on generated input:

- **A reject always wins.** A Telecom response's disposition is decided from the Transaction
  Response Status **and** the reject codes together. If any reject is present the disposition is
  `"rejected"`, even when the status field claims paid; the contradiction is surfaced as
  `NCPDP_TELECOM_STATUS_CONFLICT` and `status.statusConflict`. A status the reader does not model
  reads `"unknown"`, never `"paid"`.
- **An `Error` never reads as success.** A SCRIPT response's disposition is derived only from the
  response body kind. A message carrying more than one response body resolves to the most
  conservative one, Error first, and raises `NCPDP_SCRIPT_RESPONSE_AMBIGUOUS_DISPOSITION`.
- **A denial is never an approval.** A lifecycle outcome is read only from the response's own choice
  element; more than one resolves denial first, and none reads `unknown`.
- **Money is never a float.** Every amount carries an implied two-place decimal and an optional
  zoned-decimal sign character, applied to the string with the wire value kept as `source`. Anything
  unexpected is kept with `isValid: false` and no amount.
- **Quantities are never floats.** Quantity Dispensed applies its implied three-place decimal to the
  string, and the wire value is kept.
- **The structured SIG never overwrites the free text.** `sigText` is authoritative and verbatim;
  the structured decode is additive, tagged with its provenance, and flagged lossy
  (`NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY`). An ambiguous dose reads `absent` with
  `NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE`, never a guessed number.
- **A version is never guessed.** Telecom fields are read at fixed offsets only for the version
  those offsets belong to. A recognized stamp the reader does not decode is surfaced and no field is
  read; an unrecognized one is refused. The [Conformance statement](./conformance.md) gives the
  outcome for each stamp and each direction.

## Warnings and errors are safe to log; the parsed model is not

Every warning is a stable `code`, a `message`, and a `position`. The message is not written where the
deviation is found: it is looked up by code in a frozen registry (`SCRIPT_WARNING_MESSAGES`,
`TELECOM_WARNING_MESSAGES`), and the factories that build warnings (`scriptWarning`,
`telecomWarning`) take a position and nothing else. There is no value parameter, so there is nowhere
for a message's content to leak in. The same is true of the typed fatal errors and the build errors:
none carries any part of the input. The test suite checks that each warning's message is the registry
entry for its code, for every code on both standards.

That is a claim about diagnostics only. A field value, a drug description, a cardholder ID, and an Rx
number are on the **model**, verbatim, because reading them is the point of the library. Redact them
the way you would redact the message they came from.

If you pass this parser's output to another package that builds its own diagnostics, the fields it
will reach for are the structural ones, and those are bounded here: `segment.segmentId` is two
characters or empty, `field.id` is two characters, and an unmodeled SCRIPT transaction is named only
when its element name is one of `SCRIPT_TRANSACTION_NAMES`.

## What we do not ship

- **No code-to-meaning table without a public source.** Reject codes, response statuses, and
  product qualifiers are surfaced verbatim with no description. Where a label does ship, such as the
  Reason For Service labels, its public source is cited beside it in the code, and
  [Limitations and non-goals](./limitations.md) lists
  which fields have one.
- **No reproduced standard text.** The NCPDP implementation guides are purchased products. The
  labels in this documentation are our own paraphrases, and the field designators beside them are
  factual identifiers.

## Next

- [Read a PBM response](./read-a-pbm-response.md) and
  [read a SCRIPT response](./read-script-responses.md): the fail-safe dispositions in use.
- [Build and serialize messages](./build-and-serialize-messages.md): the strict half, and what the
  builders refuse.
- [Diagnostic codes](./diagnostic-codes.md): every code these rules raise.
- [Testing and quality](./testing-and-quality.md): how the rules are tested.
