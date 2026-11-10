---
id: read-a-pbm-response
title: Read a PBM response
sidebar_label: Read a PBM response
description: "Read a PBM's answer to a Telecom claim: paid or rejected, the reject codes, the pricing as exact decimals, and every DUR alert."
---

# Read a PBM response

`parseTelecom` detects a **response** transmission on its own: a response leads with its
Version/Release, where a request leads with the routing BIN. `adjudication` lifts the outcome from
it, and returns `undefined` for a request. The same reader serves the answers to B1 billing, B2
reversal, B3 rebill, and E1 eligibility.

```ts runnable
import { adjudication, parseTelecom } from "@cosyte/ncpdp/telecom";

const FS = "\x1c";
const GS = "\x1d";
const RS = "\x1e";

// Response header: version, transaction code, count, header status (A accepted), provider.
const header = "D0" + "B1" + "1" + "A" + "01" + "1234567890".padEnd(15);
const status = ["AM21", "ANP", "F3AUTH0001"].join(FS);
const pricing = ["AM23", "F51000", "F94500", "F64000", "F7500"].join(FS);
const dur = ["AM24", "J61", "E4DD", "FS1", "J62", "E4ER", "FS2"].join(FS);

const t = parseTelecom(header + GS + status + RS + pricing + RS + dur);
const a = adjudication(t);

t.kind; // => "response"
a?.transactionCode; // => "B1"

a?.status?.disposition; // => "paid"
a?.status?.rejectCodes; // => []

a?.pricing?.patientPayAmount?.amount; // => "10.00"
a?.pricing?.totalAmountPaid?.amount; // => "45.00"
a?.pricing?.ingredientCostPaid?.amount; // => "40.00"
a?.pricing?.dispensingFeePaid?.amount; // => "5.00"

a?.dur?.length; // => 2
a?.dur?.map((alert) => alert.reasonForServiceCode); // => ["DD", "ER"]
a?.dur?.[0]?.reasonDescription; // => "Drug-Drug Interaction"
```

- **`disposition`** is `paid`, `captured`, `approved`, `duplicate`, `deferred`, `rejected`, or
  `unknown`. It is decided from the Transaction Response Status **and** the reject codes together:
  any reject makes it `rejected`, even when the status field says paid, and the contradiction is flagged on
  `statusConflict` and warned with `NCPDP_TELECOM_STATUS_CONFLICT`. A status the reader does not
  model reads `unknown`, never paid, with `NCPDP_TELECOM_UNKNOWN_RESPONSE_STATUS`.
- **Reject codes are verbatim and in wire order.** Each carries `known`, and a code the reader does
  not recognize is kept with `known: false` and warned with `NCPDP_TELECOM_UNKNOWN_REJECT_CODE`. We
  ship no reject-code descriptions, so today every reject code reads that way.
- **No DUR alert is collapsed.** The response DUR segment repeats its fields once per alert; the
  reader starts a new alert at each counter and at each new Reason For Service code. Reason For
  Service codes carry short labels from one cited public payer manual; a code outside that list is
  kept with `reasonKnown: false`.

## Read money exactly

Every amount carries an implied two-place decimal and may end in a zoned-decimal sign character. The
library applies both to the string and keeps the wire value as `source`; a value it cannot read is
kept with `isValid: false` and no amount.

```ts runnable
import { telecomMoney } from "@cosyte/ncpdp/telecom";

telecomMoney("4500").amount; // => "45.00"
telecomMoney("100}").amount; // => "-10.00"
telecomMoney("100}").isNegative; // => true
telecomMoney("12.5").isValid; // => false
telecomMoney("12.5").amount; // => undefined
```

## Read each answer of a multi-claim response

A PBM answering a transmission of several claims answers each one, and each answer is its own
transaction. Pass the index to `adjudication`, so a later claim's outcome is never read as the first
one's:

```ts runnable
import { adjudication, parseTelecom } from "@cosyte/ncpdp/telecom";

const FS = "\x1c";
const GS = "\x1d";

const header = "D0" + "B1" + "2" + "A" + "01" + "1234567890".padEnd(15);
const first = ["AM21", "ANP"].join(FS);
const second = ["AM21", "ANR", "FB70"].join(FS);

const t = parseTelecom(header + GS + first + GS + second);

adjudication(t)?.status?.disposition; // => "paid"
adjudication(t, 1)?.status?.disposition; // => "rejected"
```

Reference: [`adjudication`](./api/@cosyte/ncpdp/telecom.md#adjudication),
[`TelecomAdjudication`](./api/@cosyte/ncpdp/telecom.md#telecomadjudication),
[`TelecomResponseStatus`](./api/@cosyte/ncpdp/telecom.md#telecomresponsestatus), and
[`telecomMoney`](./api/@cosyte/ncpdp/telecom.md#telecommoney-1).

## Next

- [Telecom responses](./spec-notes-telecom-response.md): the response header layout and every field
  the response reader lifts.
- [Read compounds, other payers, DUR, and prior authorization](./read-compound-cob-and-dur.md): the
  response's other-payer blocks with `responseCob`.
- [Diagnostic codes](./diagnostic-codes.md#telecom-warnings): every Telecom warning.
