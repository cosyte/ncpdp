---
id: bill-a-claim-and-read-the-answer
title: Bill a claim and read the answer
sidebar_label: Bill a claim and read the answer
description: "A tutorial: build a Telecom B1 claim, read it back, then read a paid answer and a rejected one from the PBM."
---

# Bill a claim and read the answer

In this tutorial we build a Telecom **B1** billing claim from nothing, read it back the way a
receiving system would, and then read the two answers a PBM can send: a paid claim with its pricing,
and a rejected one. Every value is synthetic. Each step is a complete program you can paste into a
file and run with Node.js 22 or later after `npm install @cosyte/ncpdp`.

## Step 1: build the claim and read it back

A B1 claim is a fixed 56-byte Transaction Header followed by segments, each segment a list of
fields keyed by a two-character NCPDP field id. `buildTelecomRequest` takes the header and the
segments as plain objects and refuses anything that could not be sent; `serializeTelecom` writes the
wire form. `parseTelecom` and `claim` then read it back.

```ts runnable
import { buildTelecomRequest, claim, parseTelecom, serializeTelecom } from "@cosyte/ncpdp/telecom";

const wire = serializeTelecom(
  buildTelecomRequest({
    header: { transactionCode: "B1", binNumber: "999999", dateOfService: "20260115" },
    segments: [
      // Insurance segment (04): the cardholder id.
      { segmentId: "04", fields: [{ id: "C2", value: "SYNTHCARD09" }] },
      // Claim segment (07): the prescription, the product, the quantity, and the days supply.
      {
        segmentId: "07",
        fields: [
          { id: "D2", value: "RX0000001" },
          { id: "E1", value: "03" },
          { id: "D7", value: "99999999999" },
          { id: "E7", value: "30000" },
          { id: "D5", value: "30" },
        ],
      },
    ],
  }),
);

const t = parseTelecom(wire);
t.kind; // => "request"
t.header.transactionCode; // => "B1"
t.warnings.length; // => 0

const c = claim(t);
c?.cardholderId; // => "SYNTHCARD09"
c?.product?.id; // => "99999999999"
c?.quantityDispensed?.impliedDecimal; // => "30.000"

// Emit is canonical: the parsed claim serializes to the same bytes.
serializeTelecom(t) === wire; // => true
```

The quantity `30000` came back as `"30.000"`: Quantity Dispensed carries an implied three-place
decimal, and the library applies it to the string, never through a float.

## Step 2: read a paid answer

The PBM answers with a **response** transmission. It leads with the Version/Release where a request
leads with the routing BIN, and `parseTelecom` tells the two apart on its own. `adjudication` lifts
the outcome: the status, the pricing, and any DUR alerts.

```ts runnable
import { adjudication, parseTelecom } from "@cosyte/ncpdp/telecom";

const FS = "\x1c"; // between fields
const GS = "\x1d"; // before each transaction
const RS = "\x1e"; // between segments

// The response header: version D0, transaction B1, one transaction, accepted (A), and the
// service provider id qualifier and id.
const header = "D0" + "B1" + "1" + "A" + "01" + "1234567890".padEnd(15);
const status = ["AM21", "ANP", "F3AUTH0001"].join(FS); // paid, with an authorization number
const pricing = ["AM23", "F51000", "F94500"].join(FS); // patient pays 10.00; plan pays 45.00

const answer = adjudication(parseTelecom(header + GS + status + RS + pricing));

answer?.status?.disposition; // => "paid"
answer?.status?.authorizationNumber; // => "AUTH0001"
answer?.pricing?.patientPayAmount?.amount; // => "10.00"
answer?.pricing?.totalAmountPaid?.amount; // => "45.00"
```

Money fields carry an implied two-place decimal, so `1000` is `"10.00"`. Like quantities, amounts
are strings, and the wire value stays beside them as `source`.

## Step 3: read a rejected answer

Now the PBM rejects the claim. This answer is badly formed on purpose: its status field still says
paid (`P`), but it carries a reject code. The library never reports a rejected claim as paid.

```ts runnable
import { adjudication, parseTelecom } from "@cosyte/ncpdp/telecom";

const FS = "\x1c";
const GS = "\x1d";

const header = "D0" + "B1" + "1" + "R" + "01" + "1234567890".padEnd(15);
const status = ["AM21", "ANP", "FA1", "FB75"].join(FS); // says paid, but carries reject code 75

const t = parseTelecom(header + GS + status);
const answer = adjudication(t);

answer?.status?.disposition; // => "rejected"
answer?.status?.statusConflict; // => true
answer?.status?.rejectCodes; // => [{ code: "75", known: false }]
t.warnings.map((w) => w.code); // => ["NCPDP_TELECOM_UNKNOWN_REJECT_CODE", "NCPDP_TELECOM_STATUS_CONFLICT"]
```

Three things happened. The disposition is `"rejected"`, because a reject always wins over the status
field. The contradiction is flagged (`statusConflict`) and warned. And the reject code is kept
verbatim with `known: false`: we ship no reject-code descriptions, so you get the code, not a
sentence about it.

## What you built

You built a spec-clean claim, read it back with no warnings, and read both kinds of answer without
reading a rejection as a payment. From here:

- [Read a PBM response](./read-a-pbm-response.md): DUR alerts, the other pricing fields, and
  multi-transaction answers.
- [Read compounds, other payers, DUR, and prior authorization](./read-compound-cob-and-dur.md): the
  request-side segments beyond the claim.
- [Build and serialize messages](./build-and-serialize-messages.md): what the builders refuse, and
  the SCRIPT side.
- [Telecom foundation and B1](./spec-notes-telecom.md): the header layout and the segments behind
  each field id used here.
