---
id: troubleshooting
title: Troubleshooting & known limitations
sidebar_position: 1
---

# Troubleshooting & known limitations

The honest list. A parser that oversells what it reads is how a dose, a code system, or a claim
disposition gets mis-read, so this page is a deliverable, not a footnote. It covers the error model,
the fail-safe rules, and — just as importantly — what v1 deliberately does **not** do.

## The error model: fatal vs. warning

The parser follows Postel's Law. **Only unrecoverable structural corruption throws**; every recoverable
vendor quirk is a stable-coded `warning` with positional context (an XPath for SCRIPT, a byte offset
for Telecom), collected on the result's `.warnings` and never thrown.

**SCRIPT fatals** (`NcpdpScriptParseError.code`):

| Code                               | Symptom                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `EMPTY_INPUT`                      | The input was empty or whitespace-only.                                                                        |
| `NCPDP_SCRIPT_NOT_XML`             | The input did not parse as XML — or carried a `<!DOCTYPE>`/`<!ENTITY>` (the XXE boundary, rejected by design). |
| `NCPDP_SCRIPT_NO_MESSAGE_ROOT`     | Well-formed XML, but the root element is not `<Message>`.                                                      |
| `NCPDP_SCRIPT_UNSUPPORTED_VERSION` | A declared version that predates the supported XML-era SCRIPT (`v2017071` / `v2022011`).                       |

**Telecom fatals** (`NcpdpTelecomParseError.code`):

| Code                                | Symptom                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `EMPTY_INPUT`                       | The input was empty.                                                               |
| `NCPDP_TELECOM_NO_HEADER`           | The transmission is too short to hold the fixed Transaction Header.                |
| `NCPDP_TELECOM_INVALID_FRAMING`     | A non-empty body carried no FS/GS/RS framing bytes — a separator is never guessed. |
| `NCPDP_TELECOM_UNSUPPORTED_VERSION` | A version stamp other than vD.0 (and not the recognized-but-not-decoded F6).       |

Everything else — an absent SCRIPT version, an unknown segment, a malformed field, an unrecognized
reject code — is a warning. Catch the two fatal classes at the parse boundary; read `.warnings`
afterward for the tolerated deviations.

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
// throws NcpdpTelecomParseError (NCPDP_TELECOM_INVALID_FRAMING) — a separator is never guessed
```

## The fail-safe rules (safety-critical)

These are invariants, not best-effort behaviors — they exist because reading a failure as a success
can harm someone:

- **A reject always wins.** A Telecom response `disposition` is a total function over the Transaction
  Response Status **and** the reject codes together. If any reject is present the disposition is
  `"rejected"` even when the status field claims paid; the self-contradiction surfaces as
  `NCPDP_TELECOM_STATUS_CONFLICT` and `status.statusConflict`. An unrecognized status reads
  `"unknown"`, never `"paid"`.
- **An `Error` never reads as success.** A SCRIPT response `disposition` is derived only from the
  response body kind, so `status(msg)` is `undefined` on an `<Error>`. A message carrying more than one
  response body resolves to the most conservative disposition (Error first) and raises
  `NCPDP_SCRIPT_RESPONSE_AMBIGUOUS_DISPOSITION`.
- **Money is never a float.** Every dollar amount carries an implied 2-place decimal (and an optional
  zoned-decimal overpunch sign), interpreted **string-wise** with the verbatim `source` kept. Anything
  unexpected is preserved with `isValid: false` and no interpreted amount — money is never guessed.
- **Quantities are never floats.** Quantity Dispensed applies its implied 3-place decimal string-wise;
  the verbatim `source` is always kept.
- **The structured SIG never overwrites the free text.** `sig.sigText` is authoritative and preserved
  verbatim; the structured decode is additive, provenance-tagged, and flagged lossy
  (`NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY`). An ambiguous dose is surfaced as `absent` with
  `NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE` — never guessed.

## Warnings never carry field content

Every warning is a stable `code`, a human-readable `message`, and a `position` — and the message is a
paraphrase of the _shape_ of the deviation, never the patient or drug data at that position. This is
deliberate: a warning is a log line, and a log line must not become a PHI leak. When you log
`.warnings`, you are logging codes and positions, not cardholder IDs or NDCs.

## Known limitations & non-goals (v1)

Depth here tracks the parser; where it is thin, it is thin on purpose.

- **Whole-message only — no streaming.** Both parsers read a complete message; there is no incremental
  / streaming API.
- **Telecom decodes vD.0 only.** An **F6** stamp is _recognized but not decoded_
  (`NCPDP_TELECOM_VF6_NOT_DECODED`); the fields are preserved but not lifted. Only the **first**
  transaction of a multi-transaction transmission is decoded
  (`NCPDP_TELECOM_MULTI_TRANSACTION_TRUNCATED`).
- **SCRIPT decodes the XML-era standard only** (`v2017071` / `v2022011`); pre-XML legacy SCRIPT is a
  fatal, not a tolerated read.
- **SIG is decode-only.** v1 reads a structured `<Sig>` best-effort; it does **not** _generate_ a SIG
  from structure, and does not parse arbitrary natural-language directions.
- **No bundled NCPDP code→meaning table.** Codes and descriptions (`<Code>`, reject codes, status
  values) are surfaced **verbatim**; the library ships no lookup of NCPDP-copyrighted descriptions.
  Recognized _code systems_ (NDC / RxNorm / SNOMED via the wire qualifier) are the exception — those
  are widely-known identifiers, not copyrighted prose.
- **Profiles are descriptive, not transformative.** Attaching a trading-partner profile surfaces
  `msg.profile` / `tx.profile` and powers `partitionWarnings`, but it **never alters the parse** —
  profile-on output is byte-identical to profile-off.
- **No `strict` mode yet.** A mode that escalates every tolerated deviation to a thrown error is not
  shipped; today the model is lenient-with-warnings only.
- **EPCS is out of scope.** Electronic Prescribing of Controlled Substances (DEA-regulated digital
  signatures, HSM integration) belongs in a separate package and is not in v1.
- **Not differentially verified against a reference implementation.** NCPDP redistribution limits
  exclude differential testing against a licensed reference parser; conformance is proven against
  synthetic and de-identified fixtures and the spec structure, not an oracle. Validate against your
  actual trading partner before trusting a production interface.

## The API is not stable yet

`@cosyte/ncpdp` is on the `0.0.x` ladder and **pre-alpha**. There is no API-stability promise and no
deprecation cycle: any release may change the public surface. The stable **warning codes** and
**fatal codes** are treated as public API within that caveat — renaming one is a breaking change — but
the ladder itself makes no 1.0-style guarantees. Pin an exact version.

---

## The one thing this package exists to prevent

**A safety-critical value being read wrong and reported as right** — a rejected claim shown as paid, a
dose invented from ambiguous structure, a dollar amount corrupted by floating point. Every fail-safe
rule above is a wall around that single failure mode. The rest of the package is the honest parse
around it.
