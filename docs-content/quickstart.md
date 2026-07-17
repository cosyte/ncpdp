---
id: quickstart
title: Quickstart
sidebar_position: 1
---

# Quickstart

NCPDP is two standards. This page gives you a first useful result from each: read a **SCRIPT** NewRx
(the XML ePrescribing message) and a **Telecom** B1 claim (the fixed-field pharmacy-to-PBM claim).
Both readers are lenient — vendor quirks become stable-coded `warnings`, never silent failures — and
neither reads a failure as a success.

> Every message below is **synthetic**. NCPDP carries PHI; fixtures must never hold a real patient
> name, member ID, prescriber NPI, or NDC.

## Read a SCRIPT NewRx

`parseScript` reads a SCRIPT XML message into an immutable model without ever throwing on a vendor
quirk; `newRx` projects the NewRx body (and returns `undefined` for any other transaction). The coded
product carries its own recognized code system, and the free-text SIG is preserved verbatim:

```ts runnable
import { parseScript, newRx } from "@cosyte/ncpdp/script";

const xml = `<Message version="2017071">
  <Header><MessageID>SYNTH-MSG-0001</MessageID></Header>
  <Body><NewRx>
    <Patient><HumanPatient>
      <Name><LastName>DOE</LastName><FirstName>JANE</FirstName></Name>
    </HumanPatient></Patient>
    <MedicationPrescribed>
      <DrugDescription>Amoxicillin 500 MG Oral Capsule</DrugDescription>
      <DrugCoded><ProductCode Qualifier="ND">00000000001</ProductCode></DrugCoded>
      <Quantity><Value>30</Value></Quantity>
      <Sig><SigText>Take 1 capsule by mouth three times daily for 10 days.</SigText></Sig>
    </MedicationPrescribed>
  </NewRx></Body>
</Message>`;

const msg = parseScript(xml);

msg.header.messageId; // => "SYNTH-MSG-0001"

const rx = newRx(msg);

rx?.patient?.name?.lastName; // => "DOE"
rx?.medication?.description; // => "Amoxicillin 500 MG Oral Capsule"
rx?.medication?.coded?.productCode?.value; // => "00000000001"
rx?.medication?.coded?.productCode?.system; // => "NDC"
rx?.medication?.quantity?.value?.source; // => "30"
```

The `system` is **recognized from the wire qualifier** (`ND` → `NDC`), while the raw `value` is kept
verbatim; the quantity's `source` is the wire string, never a parsed float. See the
[Cookbook](./cookbook) for the response, structured-SIG, and lifecycle reads.

## Read a Telecom B1 claim

The Telecommunication standard is the pharmacy-to-PBM claim protocol: a fixed 56-byte Transaction
Header followed by FS/GS/RS control-character-framed, field-id-keyed segments. `parseTelecom` decodes
the header and segments; `claim` lifts the safety-relevant B1/B2/B3 request fields. (The frame below
is built inline from control bytes so the example is self-contained — in practice the bytes arrive off
the wire.)

```ts runnable
import { parseTelecom, claim } from "@cosyte/ncpdp/telecom";

const FS = "\x1c"; // Field Separator
const pad = (v: string, n: number) => v.padEnd(n).slice(0, n);

// A synthetic fixed D.0 Transaction Header (all values fabricated — no real BIN/NDC).
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

// One Claim segment (id 07): Product/Service ID (D7), Quantity Dispensed (E7), Days Supply (D5),
// Rx reference (D2), keyed by NCPDP field id and FS-joined.
const claimSegment = [
  "AM07",
  "EM1",
  "D2RX0000001",
  "D300",
  "E103",
  "D700000000031",
  "E730000",
  "D530",
  "D80",
].join(FS);

const t = parseTelecom(header + claimSegment);

t.kind; // => "request"
t.header.transactionCode; // => "B1"

const c = claim(t);

c?.product?.id; // => "00000000031"
c?.product?.qualifierMeaning; // => "NDC"
c?.quantityDispensed?.source; // => "30000"
c?.quantityDispensed?.impliedDecimal; // => "30.000"
c?.prescriptionReferenceNumber; // => "RX0000001"
```

**Quantity is never a float.** Quantity Dispensed carries an implied 3-place decimal, applied
**string-wise** (`"30000"` → `"30.000"`) with the verbatim `source` kept, so binary floating point can
never corrupt the value.

## Unrecoverable input throws — everything else is a warning

Only structurally unrecoverable input throws a typed fatal (empty input, non-XML, a non-`<Message>`
root, or a `<!DOCTYPE>`/`<!ENTITY>` payload — the XXE boundary). Vendor quirks never throw; they
collect on `.warnings`:

```ts runnable throws
import { parseScript } from "@cosyte/ncpdp/script";

// Not XML at all — a structural fatal, not a tolerated quirk.
parseScript("this is not an NCPDP message"); // throws NcpdpScriptParseError (NCPDP_SCRIPT_NOT_XML)
```

## Next

- [Cookbook](./cookbook) — recipes for the SCRIPT response, structured SIG, the Telecom PBM response,
  compound / COB / DUR reads, and the serializers and builders.
- [Core Concepts](./spec-notes-telecom) — the implementation notes behind each read, with the exact
  fields decoded and the deliberate non-goals.
- [Troubleshooting & known limitations](./troubleshooting) — fatal codes, the fail-safe rules, and
  what v1 does not do.

> **About runnable examples.** The blocks tagged ` ```ts runnable ` above are extracted by the test
> suite, executed against the built package, and their `// =>` results asserted — so a documented
> example can never silently drift from the code (`docSnippetSuite()`, the documentation analog of the
> parser conformance runners). Blocks shown as plain ` ```ts ` are illustrative.
