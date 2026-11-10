---
id: read-a-telecom-claim
title: Read a Telecom claim
sidebar_label: Read a Telecom claim
description: "Read a Telecom B1, B2, or B3 request: the fixed header, the claim fields, and every transaction of a transmission that carries more than one."
---

# Read a Telecom claim

Use `parseTelecom` to read the transmission and `claim` to lift the request fields that matter for
safety and billing. `parseTelecom` accepts a string or a `Buffer` (read as latin1 by default) and
never throws on a vendor quirk; `claim` returns `undefined` when no segment was decoded.

```ts runnable
import { claim, parseTelecom } from "@cosyte/ncpdp/telecom";

const FS = "\x1c"; // between fields
const RS = "\x1e"; // between segments
const pad = (value: string, width: number) => value.padEnd(width).slice(0, width);

// The fixed 56-byte request header (every value synthetic).
const header =
  pad("999999", 6) + // BIN
  pad("D0", 2) + // Version/Release
  pad("B1", 2) + // Transaction Code
  pad("PCN0000000", 10) + // Processor Control Number
  pad("1", 1) + // Transaction Count
  pad("01", 2) + // Service Provider ID Qualifier
  pad("1234567890", 15) + // Service Provider ID
  pad("20260115", 8) + // Date of Service
  pad("SW00000000", 10); // Software/Certification ID

const insurance = ["AM04", "C2SYNTHCARD09", "C301"].join(FS);
const patient = ["AM01", "C419900412", "C52"].join(FS);
const claimSegment = [
  "AM07",
  "EM1",
  "D2RX0000001",
  "D30",
  "E103",
  "D799999999999",
  "E730000",
  "D530",
  "D80",
].join(FS);

const t = parseTelecom(header + insurance + RS + patient + RS + claimSegment);

t.kind; // => "request"
t.header.binNumber; // => "999999"
t.header.dateOfService; // => "20260115"
t.warnings.length; // => 0

const c = claim(t);
c?.cardholderId; // => "SYNTHCARD09"
c?.personCode; // => "01"
c?.dateOfBirth; // => "19900412"
c?.prescriptionReferenceNumber; // => "RX0000001"
c?.product; // => { id: "99999999999", qualifier: "03" }
c?.quantityDispensed?.impliedDecimal; // => "30.000"
c?.daysSupply?.source; // => "30"
c?.dispenseAsWritten; // => "0"
```

The claim view lifts these fields: Group ID (`C1`), Cardholder ID (`C2`), Person Code (`C3`), Date
of Birth (`C4`), Patient Gender Code (`C5`), the Rx/Service Reference Number (`D2`) and its
qualifier (`EM`), Fill Number (`D3`), Product/Service ID (`D7`) and its qualifier (`E1`), Quantity
Dispensed (`E7`), Days Supply (`D5`), Dispense-As-Written (`D8`), and Prescriber ID (`DB`) and its
qualifier (`EZ`). Every other field is still on `t.segments`, verbatim; a field without a name in
this library is never dropped.

- **Values are verbatim.** The header is trimmed of pad spaces and nothing else: a BIN or a PCN is an
  identifier, so its leading zeros stay. The product qualifier carries no label, because no public
  source for its value set could be found.
- **Quantity is never a float.** Quantity Dispensed carries an implied three-place decimal, applied
  to the string, with the wire value kept as `source`.

## Read every transaction of a transmission

A transmission can carry more than one transaction, separated by the Group Separator. Each is on
`t.transactions[n]` with its own segments and warnings, and every view takes the index:

```ts runnable
import { claim, parseTelecom } from "@cosyte/ncpdp/telecom";

const FS = "\x1c";
const GS = "\x1d";
const pad = (value: string, width: number) => value.padEnd(width).slice(0, width);

const header =
  pad("999999", 6) +
  pad("D0", 2) +
  pad("B1", 2) +
  pad("", 10) +
  pad("2", 1) +
  pad("01", 2) +
  pad("1234567890", 15) +
  pad("20260115", 8) +
  pad("", 10);

const first = ["AM07", "D2RX0000031"].join(FS);
const second = ["AM07", "D2RX0000032"].join(FS);

const t = parseTelecom(header + first + GS + second);

t.header.transactionCount; // => "2"
t.decodedTransactionCount; // => 2
claim(t)?.prescriptionReferenceNumber; // => "RX0000031"
claim(t, 1)?.prescriptionReferenceNumber; // => "RX0000032"
```

The declared Transaction Count is reported as it arrived and never enforced. When it disagrees with
the number decoded, the transmission carries `NCPDP_TELECOM_TRANSACTION_COUNT_MISMATCH` and every
decoded transaction is still there.

Reference: [`parseTelecom`](./api/@cosyte/ncpdp.md#parsetelecom),
[`claim`](./api/@cosyte/ncpdp.md#claim), [`TelecomClaim`](./api/@cosyte/ncpdp.md#telecomclaim), and
[`TelecomTransaction`](./api/@cosyte/ncpdp.md#telecomtransaction).

## Next

- [Read compounds, other payers, DUR, and prior authorization](./read-compound-cob-and-dur.md): the
  request segments beyond the claim.
- [Read a PBM response](./read-a-pbm-response.md): the answer to this claim.
- [Telecom foundation and B1](./spec-notes-telecom.md): the header layout and the segment codes.
